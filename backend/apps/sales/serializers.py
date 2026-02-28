from rest_framework import serializers
from django.db import transaction as db_transaction
from .models import Sale, SaleItem, Order, OrderItem, OrderStatusHistory
from .services import (
    lock_organization_row,
    generate_sale_number,
    generate_order_number,
    resolve_batch_by_warehouse,
    recalc_sale_totals,
    do_sale_fifo_write_off,
    sync_sale_transaction,
    update_customer_stats,
    validate_order_status_transition,
    create_order_status_history,
)


class SaleItemWriteSerializer(serializers.ModelSerializer):
    """Сериализатор позиции продажи для записи."""
    warehouse = serializers.UUIDField(required=False, allow_null=True)

    class Meta:
        model = SaleItem
        fields = ['nomenclature', 'batch', 'quantity', 'price',
                  'cost_price', 'discount_percent', 'total', 'is_custom_bouquet', 'warehouse']


class SaleItemSerializer(serializers.ModelSerializer):
    nomenclature_name = serializers.CharField(source='nomenclature.name', read_only=True)
    nomenclature_type = serializers.CharField(source='nomenclature.nomenclature_type', read_only=True)
    warehouse_name = serializers.SerializerMethodField()
    warehouse = serializers.SerializerMethodField()
    bouquet_components = serializers.SerializerMethodField()

    class Meta:
        model = SaleItem
        fields = '__all__'

    def get_warehouse_name(self, obj):
        if obj.batch and obj.batch.warehouse:
            return obj.batch.warehouse.name
        return ''

    def get_warehouse(self, obj):
        if obj.batch and obj.batch.warehouse:
            return str(obj.batch.warehouse_id)
        return ''

    def get_bouquet_components(self, obj):
        """Return bouquet composition for display."""
        nom = obj.nomenclature
        if nom.nomenclature_type in ('bouquet', 'composition'):
            try:
                template = nom.bouquet_template
                return [
                    {
                        'name': comp.nomenclature.name,
                        'quantity': str(comp.quantity),
                    }
                    for comp in template.components.select_related('nomenclature').all()
                ]
            except Exception:
                pass
        return []


class SaleSerializer(serializers.ModelSerializer):
    items = SaleItemSerializer(many=True, read_only=True)
    items_data = SaleItemWriteSerializer(many=True, write_only=True, required=False)
    customer_name = serializers.SerializerMethodField()
    seller_name = serializers.SerializerMethodField()
    trading_point_name = serializers.CharField(
        source='trading_point.name', read_only=True, default=''
    )

    class Meta:
        model = Sale
        fields = '__all__'
        read_only_fields = ['organization']

    def get_customer_name(self, obj):
        return str(obj.customer) if obj.customer else ''

    def get_seller_name(self, obj):
        return obj.seller.get_full_name() if obj.seller else ''

    @db_transaction.atomic
    def create(self, validated_data):
        items_data = validated_data.pop('items_data', [])
        validated_data.pop('is_paid', None)

        status_value = validated_data.get('status', Sale.Status.OPEN)
        validated_data['is_paid'] = (status_value == Sale.Status.COMPLETED)

        # Автоподстановка торговой точки если не указана
        if not validated_data.get('trading_point'):
            request = self.context.get('request')
            if request:
                from apps.core.mixins import _resolve_tp
                tp = _resolve_tp(request.user)
                if tp:
                    validated_data['trading_point'] = tp

        organization = validated_data.get('organization')
        if not organization:
            raise serializers.ValidationError({'organization': 'Организация обязательна.'})

        lock_organization_row(organization.id)

        sale = Sale.objects.create(**validated_data)

        # Безопасная генерация номера чека (Cast to Integer + Max + 1)
        if not sale.number:
            sale.number = generate_sale_number(sale.organization)
            sale.save(update_fields=['number'])

        for item_data in items_data:
            warehouse_id = item_data.pop('warehouse', None)
            if warehouse_id:
                batch = resolve_batch_by_warehouse(
                    organization=sale.organization,
                    nomenclature=item_data.get('nomenclature'),
                    warehouse_id=warehouse_id,
                )
                if batch:
                    item_data['batch'] = batch
            SaleItem.objects.create(sale=sale, **item_data)
        recalc_sale_totals(sale)

        # FIFO-списание со склада при завершённой и оплаченной продаже
        if sale.status == Sale.Status.COMPLETED and sale.is_paid:
            do_sale_fifo_write_off(sale)

        sync_sale_transaction(sale)

        # Обновление статистики клиента при завершённой продаже
        if sale.status == Sale.Status.COMPLETED and sale.is_paid and sale.customer:
            update_customer_stats(sale, sale.total, 1)

        return sale

    @db_transaction.atomic
    def update(self, instance, validated_data):
        items_data = validated_data.pop('items_data', None)
        validated_data.pop('is_paid', None)
        old_status = instance.status
        old_is_paid = instance.is_paid
        instance = super().update(instance, validated_data)

        desired_paid = (instance.status == Sale.Status.COMPLETED)
        if instance.is_paid != desired_paid:
            instance.is_paid = desired_paid
            instance.save(update_fields=['is_paid'])
        if items_data is not None:
            instance.items.all().delete()
            for item_data in items_data:
                warehouse_id = item_data.pop('warehouse', None)
                if warehouse_id:
                    batch = resolve_batch_by_warehouse(
                        organization=instance.organization,
                        nomenclature=item_data.get('nomenclature'),
                        warehouse_id=warehouse_id,
                    )
                    if batch:
                        item_data['batch'] = batch
                SaleItem.objects.create(sale=instance, **item_data)
            recalc_sale_totals(instance)

        # FIFO-списание при переходе в completed + is_paid
        was_completed_paid = (old_status == Sale.Status.COMPLETED and old_is_paid)
        now_completed_paid = (instance.status == Sale.Status.COMPLETED and instance.is_paid)
        if now_completed_paid and not was_completed_paid:
            do_sale_fifo_write_off(instance)

        sync_sale_transaction(instance)

        # Обновление статистики клиента (учитываем переходы статусов)
        if now_completed_paid and not was_completed_paid:
            # Завершили продажу — добавляем статистику
            update_customer_stats(instance, instance.total, 1)
        elif was_completed_paid and not now_completed_paid:
            # Отменили/переоткрыли продажу — убираем статистику
            update_customer_stats(instance, -instance.total, -1)

        return instance


class SaleListSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()
    seller_name = serializers.SerializerMethodField()
    trading_point_name = serializers.CharField(
        source='trading_point.name', read_only=True, default=''
    )

    class Meta:
        model = Sale
        fields = ['id', 'number', 'status', 'total', 'customer_name', 'seller_name',
                  'seller', 'trading_point', 'trading_point_name', 'is_paid', 'created_at']

    def get_customer_name(self, obj):
        return str(obj.customer) if obj.customer else ''

    def get_seller_name(self, obj):
        return obj.seller.get_full_name() if obj.seller else ''


class OrderItemSerializer(serializers.ModelSerializer):
    nomenclature_name = serializers.CharField(source='nomenclature.name', read_only=True)

    class Meta:
        model = OrderItem
        fields = '__all__'


class OrderStatusHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderStatusHistory
        fields = '__all__'
        read_only_fields = ['id', 'created_at']


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    status_history = OrderStatusHistorySerializer(many=True, read_only=True)
    customer_name = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = '__all__'
        read_only_fields = ['organization']

    def get_customer_name(self, obj):
        return str(obj.customer) if obj.customer else ''

    @db_transaction.atomic
    def create(self, validated_data):
        organization = validated_data.get('organization')
        if not organization:
            raise serializers.ValidationError({'organization': 'Организация обязательна.'})

        lock_organization_row(organization.id)

        if not validated_data.get('number'):
            validated_data['number'] = generate_order_number(validated_data['organization'])

        order = Order.objects.create(**validated_data)

        create_order_status_history(
            order=order,
            old_status='',
            new_status=order.status,
            changed_by=self.context.get('request').user if self.context.get('request') else None,
            comment='Создание заказа',
        )
        return order

    @db_transaction.atomic
    def update(self, instance, validated_data):
        old_status = instance.status

        new_status = validated_data.get('status', old_status)
        try:
            validate_order_status_transition(instance, new_status)
        except ValueError as exc:
            raise serializers.ValidationError({'status': str(exc)}) from exc

        order = super().update(instance, validated_data)

        if new_status != old_status:
            create_order_status_history(
                order=order,
                old_status=old_status,
                new_status=new_status,
                changed_by=self.context.get('request').user if self.context.get('request') else None,
                comment='Изменение статуса через API',
            )
        return order


class OrderListSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = ['id', 'number', 'status', 'source', 'total',
                  'delivery_date', 'customer_name', 'created_at']

    def get_customer_name(self, obj):
        return str(obj.customer) if obj.customer else ''
