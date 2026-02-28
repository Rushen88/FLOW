from decimal import Decimal

from rest_framework import serializers
from django.db import transaction as db_transaction, models as db_models
from django.db.models import Max
from .models import Sale, SaleItem, Order, OrderItem, OrderStatusHistory


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


def _generate_sale_number(organization):
    """
    Генерация безопасного числового номера чека.
    Использует IntegerField-семантику: MAX + 1 с select_for_update.
    """
    max_num = (
        Sale.objects.select_for_update()
        .filter(organization=organization, number__isnull=False)
        .exclude(number='')
        .filter(number__regex=r'^\d+$')
        .annotate(num_int=db_models.functions.Cast('number', db_models.IntegerField()))
        .aggregate(m=Max('num_int'))['m']
    )
    try:
        return str((max_num or 0) + 1)
    except (ValueError, TypeError):
        return str(Sale.objects.filter(organization=organization).count() + 1)


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

        sale = Sale.objects.create(**validated_data)

        # Безопасная генерация номера чека (Cast to Integer + Max + 1)
        if not sale.number:
            sale.number = _generate_sale_number(sale.organization)
            sale.save(update_fields=['number'])

        for item_data in items_data:
            warehouse_id = item_data.pop('warehouse', None)
            if warehouse_id:
                from apps.inventory.models import Batch
                batch = Batch.objects.filter(
                    organization=sale.organization,
                    nomenclature=item_data.get('nomenclature'),
                    warehouse_id=warehouse_id,
                    remaining__gt=0,
                ).order_by('arrival_date', 'created_at').first()
                if batch:
                    item_data['batch'] = batch
            SaleItem.objects.create(sale=sale, **item_data)
        self._recalc_totals(sale)

        # FIFO-списание со склада при завершённой и оплаченной продаже
        if sale.status == Sale.Status.COMPLETED and sale.is_paid:
            self._do_fifo_write_off(sale)

        self._sync_transaction(sale)

        # Обновление статистики клиента при завершённой продаже
        if sale.status == Sale.Status.COMPLETED and sale.is_paid and sale.customer:
            self._update_customer_stats(sale, sale.total, 1)

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
                    from apps.inventory.models import Batch
                    batch = Batch.objects.filter(
                        organization=instance.organization,
                        nomenclature=item_data.get('nomenclature'),
                        warehouse_id=warehouse_id,
                        remaining__gt=0,
                    ).order_by('arrival_date', 'created_at').first()
                    if batch:
                        item_data['batch'] = batch
                SaleItem.objects.create(sale=instance, **item_data)
            self._recalc_totals(instance)

        # FIFO-списание при переходе в completed + is_paid
        was_completed_paid = (old_status == Sale.Status.COMPLETED and old_is_paid)
        now_completed_paid = (instance.status == Sale.Status.COMPLETED and instance.is_paid)
        if now_completed_paid and not was_completed_paid:
            self._do_fifo_write_off(instance)

        self._sync_transaction(instance)

        # Обновление статистики клиента (учитываем переходы статусов)
        if now_completed_paid and not was_completed_paid:
            # Завершили продажу — добавляем статистику
            self._update_customer_stats(instance, instance.total, 1)
        elif was_completed_paid and not now_completed_paid:
            # Отменили/переоткрыли продажу — убираем статистику
            self._update_customer_stats(instance, -instance.total, -1)

        return instance

    def _do_fifo_write_off(self, sale):
        """
        FIFO-списание товаров со склада для позиций продажи.
        Вызывается при завершении + оплате.
        """
        from apps.inventory.services import fifo_write_off, _update_stock_balance, InsufficientStockError
        from apps.inventory.models import StockMovement

        for item in sale.items.select_related('nomenclature', 'batch').all():
            nom = item.nomenclature
            # Услуги не списываем
            if nom.nomenclature_type == 'service':
                continue
            # Определяем склад
            warehouse = None
            if item.batch and item.batch.warehouse_id:
                warehouse = item.batch.warehouse
            if not warehouse:
                # Берём дефолтный склад для продаж
                from apps.core.models import Warehouse
                warehouse = Warehouse.objects.filter(
                    organization=sale.organization,
                    is_default_for_sales=True,
                ).first()
            if not warehouse:
                continue  # Нет склада — пропускаем (пре-ордер)

            try:
                fifo_result = fifo_write_off(
                    organization=sale.organization,
                    warehouse=warehouse,
                    nomenclature=nom,
                    quantity=item.quantity,
                )
                # Средневзвешенная себестоимость
                total_cost = sum(r['qty'] * r['price'] for r in fifo_result)
                item.cost_price = total_cost / item.quantity if item.quantity else Decimal('0')
                item.save(update_fields=['cost_price'])

                for r in fifo_result:
                    StockMovement.objects.create(
                        organization=sale.organization,
                        nomenclature=nom,
                        movement_type=StockMovement.MovementType.SALE,
                        warehouse_from=warehouse,
                        batch=r['batch'],
                        quantity=r['qty'],
                        price=r['price'],
                        notes=f'Продажа #{sale.number}',
                    )
                _update_stock_balance(sale.organization, warehouse, nom, -item.quantity)
            except InsufficientStockError:
                # Не блокируем продажу — логируем через cost_price = 0
                pass

    def _sync_transaction(self, sale):
        """
        Синхронизация финансовой транзакции с продажей.
        Гарантирует ровно 0 или 1 транзакцию для каждой продажи.
        """
        from apps.finance.models import Transaction, Wallet
        
        should_have_tx = sale.status == Sale.Status.COMPLETED and sale.is_paid
        wallet = sale.payment_method.wallet if sale.payment_method else None
        
        existing_tx = Transaction.objects.filter(sale=sale).select_for_update().first()
        
        if should_have_tx and wallet:
            if existing_tx:
                # Обновляем только если суммы или кошелёк изменились
                if existing_tx.wallet_to_id != wallet.id or existing_tx.amount != sale.total:
                    # Откат старого баланса кошелька
                    if existing_tx.wallet_to_id:
                        Wallet.objects.select_for_update().filter(
                            pk=existing_tx.wallet_to_id
                        ).update(balance=db_models.F('balance') - existing_tx.amount)
                    # Обновление транзакции
                    existing_tx.wallet_to = wallet
                    existing_tx.amount = sale.total
                    existing_tx.save(update_fields=['wallet_to', 'amount'])
                    # Применение нового баланса
                    Wallet.objects.select_for_update().filter(
                        pk=wallet.id
                    ).update(balance=db_models.F('balance') + sale.total)
                # Если ничего не изменилось — ничего не делаем
            else:
                # Создание транзакции
                Transaction.objects.create(
                    organization=sale.organization,
                    transaction_type=Transaction.TransactionType.INCOME,
                    wallet_to=wallet,
                    amount=sale.total,
                    sale=sale,
                    description=f'Оплата по продаже #{sale.number}'
                )
                Wallet.objects.select_for_update().filter(
                    pk=wallet.id
                ).update(balance=db_models.F('balance') + sale.total)
        else:
            if existing_tx:
                # Откат и удаление транзакции
                if existing_tx.wallet_to_id:
                    Wallet.objects.select_for_update().filter(
                        pk=existing_tx.wallet_to_id
                    ).update(balance=db_models.F('balance') - existing_tx.amount)
                existing_tx.delete()

    def _update_customer_stats(self, sale, delta_total, delta_count):
        """
        Обновление статистики клиента (total_purchases, purchases_count).
        delta_total: сколько добавить/убрать из суммы покупок
        delta_count: сколько добавить/убрать из количества покупок
        """
        if not sale.customer:
            return
        from django.db.models import F
        from apps.customers.models import Customer
        Customer.objects.filter(pk=sale.customer_id).update(
            total_purchases=F('total_purchases') + delta_total,
            purchases_count=F('purchases_count') + delta_count,
        )

    def _recalc_totals(self, sale):
        from django.db.models import Sum
        from decimal import Decimal
        agg = sale.items.aggregate(total=Sum('total'))['total'] or Decimal('0')
        sale.subtotal = agg
        disc_pct = sale.discount_percent or Decimal('0')
        disc_amt = agg * disc_pct / 100
        sale.discount_amount = disc_amt
        sale.total = max(agg - disc_amt, Decimal('0'))
        sale.save(update_fields=['subtotal', 'discount_amount', 'total'])


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


class OrderListSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = ['id', 'number', 'status', 'source', 'total',
                  'delivery_date', 'customer_name', 'created_at']

    def get_customer_name(self, obj):
        return str(obj.customer) if obj.customer else ''
