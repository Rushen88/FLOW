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
    rollback_sale_effects_before_delete,
    _rollback_sale_fifo,
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
    cash_shift_id = serializers.PrimaryKeyRelatedField(
        source='cash_shift', read_only=True
    )

    class Meta:
        model = Sale
        fields = '__all__'
        read_only_fields = ['organization', 'is_paid', 'completed_at', 'subtotal', 'discount_amount', 'total']

    def get_customer_name(self, obj):
        return str(obj.customer) if obj.customer else ''

    def get_seller_name(self, obj):
        return obj.seller.get_full_name() if obj.seller else ''

    def validate(self, attrs):
        """H3/H4: Валидация бонусов и промокода."""
        from apps.customers.models import Customer
        from apps.marketing.models import PromoCode, LoyaltyProgram
        from django.utils import timezone as tz
        from decimal import Decimal

        used_bonuses = attrs.get('used_bonuses') or Decimal('0')
        customer = attrs.get('customer') or (self.instance.customer if self.instance else None)
        promo = attrs.get('promo_code') or (self.instance.promo_code if self.instance else None)
        organization = attrs.get('organization') or (self.instance.organization if self.instance else None)

        # P3-MEDIUM: При создании organization ещё не установлена — используем _resolve_org для корректной работы с суперадмином
        if not organization:
            request = self.context.get('request')
            if request:
                from apps.core.mixins import _resolve_org
                organization = _resolve_org(request.user)

        # H3: проверка что бонусов хватает
        if used_bonuses > 0:
            if not customer:
                raise serializers.ValidationError({'used_bonuses': 'Укажите клиента для списания бонусов.'})
            if used_bonuses > customer.bonus_points:
                raise serializers.ValidationError({
                    'used_bonuses': f'У клиента только {customer.bonus_points} бонусов, запрошено {used_bonuses}.'
                })
            # Проверка max_payment_percent
            if organization:
                loyalty = LoyaltyProgram.objects.filter(
                    organization=organization, is_active=True
                ).first()
                if loyalty:
                    subtotal = attrs.get('subtotal') or (self.instance.subtotal if self.instance else Decimal('0'))
                    max_bonus = subtotal * loyalty.max_payment_percent / Decimal('100')
                    if used_bonuses > max_bonus:
                        raise serializers.ValidationError({
                            'used_bonuses': f'Максимально можно списать {max_bonus} бонусов ({loyalty.max_payment_percent}% от суммы).'
                        })

        # H4: проверка промокода
        if promo:
            if not promo.is_active:
                raise serializers.ValidationError({'promo_code': 'Промокод не активен.'})
            if promo.max_uses > 0 and promo.used_count >= promo.max_uses:
                raise serializers.ValidationError({'promo_code': 'Промокод исчерпал лимит использований.'})
            now = tz.now()
            if promo.start_date and now < promo.start_date:
                raise serializers.ValidationError({'promo_code': 'Промокод ещё не активен.'})
            if promo.end_date and now > promo.end_date:
                raise serializers.ValidationError({'promo_code': 'Промокод истёк.'})

        return attrs

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

        if not validated_data.get('trading_point'):
            raise serializers.ValidationError({'trading_point': 'Выберите торговую точку.'})

        organization = validated_data.get('organization')
        if not organization:
            raise serializers.ValidationError({'organization': 'Организация обязательна.'})

        lock_organization_row(organization.id)

        # Автоматически привязываем открытую кассовую смену, если есть
        trading_point = validated_data.get('trading_point')
        if trading_point and not validated_data.get('cash_shift'):
            from apps.finance.models import CashShift
            open_shift = CashShift.objects.filter(
                trading_point=trading_point,
                status=CashShift.Status.OPEN
            ).order_by('-opened_at').first()
            if open_shift:
                validated_data['cash_shift'] = open_shift

        sale = Sale.objects.create(**validated_data)

        # Безопасная генерация номера чека (Cast to Integer + Max + 1)
        if not sale.number:
            sale.number = generate_sale_number(sale.organization)
            sale.save(update_fields=['number'])

        # Установка даты завершения при создании завершённой продажи
        if sale.status == Sale.Status.COMPLETED and not sale.completed_at:
            from django.utils import timezone
            sale.completed_at = timezone.now()
            sale.save(update_fields=['completed_at'])

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
            warnings = do_sale_fifo_write_off(sale)
            if warnings:
                self.context.setdefault('sale_warnings', []).extend(warnings)

        sync_sale_transaction(sale)

        # Обновление статистики клиента и промокода при завершённой продаже
        # P5-BUG4: Вызываем всегда (не только при наличии customer) — для учёта промокода
        if sale.status == Sale.Status.COMPLETED and sale.is_paid:
            update_customer_stats(sale, sale.total, 1)

        return sale

    @db_transaction.atomic
    def update(self, instance, validated_data):
        items_data = validated_data.pop('items_data', None)
        validated_data.pop('is_paid', None)

        if 'trading_point' in validated_data and not validated_data.get('trading_point'):
            raise serializers.ValidationError({'trading_point': 'Торговая точка обязательна.'})

        old_status = instance.status
        old_is_paid = instance.is_paid
        instance = super().update(instance, validated_data)

        desired_paid = (instance.status == Sale.Status.COMPLETED)
        update_fields = []
        if instance.is_paid != desired_paid:
            instance.is_paid = desired_paid
            update_fields.append('is_paid')

        # Установка completed_at при переходе в completed
        if instance.status == Sale.Status.COMPLETED and not instance.completed_at:
            from django.utils import timezone
            instance.completed_at = timezone.now()
            update_fields.append('completed_at')

        if update_fields:
            instance.save(update_fields=update_fields)
        if items_data is not None:
            # Если продажа уже была FIFO-списана — откатить перед заменой позиций
            was_completed_paid = (old_status == Sale.Status.COMPLETED and old_is_paid)
            if was_completed_paid:
                rollback_sale_effects_before_delete(instance)
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
            # P3-CRITICAL: Проверяем ТЕКУЩИЙ статус, а не старый — если статус сменился на open,
            # FIFO-списание не должно происходить
            now_still_completed_paid = (instance.status == Sale.Status.COMPLETED and instance.is_paid)
            if now_still_completed_paid:
                warnings = do_sale_fifo_write_off(instance)
                if warnings:
                    self.context.setdefault('sale_warnings', []).extend(warnings)
                # P4-CRITICAL: Обновляем статистику ТОЛЬКО при переприменении после отката
                # (sale уже была completed). Переход open→completed обрабатывается внешним блоком.
                # P5-BUG4: Убрана проверка customer — промокод считается независимо
                if was_completed_paid:
                    update_customer_stats(instance, instance.total, 1)

        # FIFO-списание при переходе в completed + is_paid
        was_completed_paid = (old_status == Sale.Status.COMPLETED and old_is_paid)
        now_completed_paid = (instance.status == Sale.Status.COMPLETED and instance.is_paid)
        if now_completed_paid and not was_completed_paid:
            warnings = do_sale_fifo_write_off(instance)
            if warnings:
                self.context.setdefault('sale_warnings', []).extend(warnings)

        # P5-BUG1: Откат FIFO при переходе ИЗ completed БЕЗ замены позиций
        if was_completed_paid and not now_completed_paid and items_data is None:
            _rollback_sale_fifo(instance)

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


class OrderItemWriteSerializer(serializers.ModelSerializer):
    """Сериализатор позиции заказа для записи (P3-CRITICAL)."""
    class Meta:
        model = OrderItem
        fields = ['nomenclature', 'quantity', 'price', 'discount_percent', 'is_custom_bouquet']
        extra_kwargs = {
            'discount_percent': {'required': False, 'default': 0},
            'is_custom_bouquet': {'required': False, 'default': False},
        }


class OrderStatusHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderStatusHistory
        fields = '__all__'
        read_only_fields = ['id', 'created_at']


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    items_data = OrderItemWriteSerializer(many=True, write_only=True, required=False)
    status_history = OrderStatusHistorySerializer(many=True, read_only=True)
    customer_name = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = '__all__'
        read_only_fields = ['organization']

    def get_customer_name(self, obj):
        return str(obj.customer) if obj.customer else ''

    def _recalc_order_totals(self, order):
        """Пересчёт subtotal / total заказа по позициям."""
        from decimal import Decimal
        items = order.items.all()
        subtotal = Decimal('0')
        for it in items:
            subtotal += it.total
        order.subtotal = subtotal
        # P4-HIGH: Order имеет discount_amount (сумма), а не discount_percent;
        # также учитываем delivery_cost
        discount_amount = order.discount_amount or Decimal('0')
        delivery_cost = order.delivery_cost or Decimal('0')
        order.total = max(subtotal - discount_amount + delivery_cost, Decimal('0'))
        order.save(update_fields=['subtotal', 'total'])

    def _create_order_items(self, order, items_data):
        """Создаёт позиции заказа и пересчитывает итоги."""
        from decimal import Decimal
        for item_data in items_data:
            qty = Decimal(str(item_data['quantity']))
            price = Decimal(str(item_data['price']))
            disc = Decimal(str(item_data.get('discount_percent', 0)))
            total = qty * price * (Decimal('1') - disc / Decimal('100'))
            OrderItem.objects.create(order=order, total=total, **item_data)
        self._recalc_order_totals(order)

    @db_transaction.atomic
    def create(self, validated_data):
        items_data = validated_data.pop('items_data', [])

        organization = validated_data.get('organization')
        if not organization:
            raise serializers.ValidationError({'organization': 'Организация обязательна.'})

        lock_organization_row(organization.id)

        if not validated_data.get('number'):
            validated_data['number'] = generate_order_number(validated_data['organization'])

        order = Order.objects.create(**validated_data)

        # P3-CRITICAL: Создаём позиции заказа
        if items_data:
            self._create_order_items(order, items_data)

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
        items_data = validated_data.pop('items_data', None)
        old_status = instance.status

        new_status = validated_data.get('status', old_status)
        try:
            validate_order_status_transition(instance, new_status)
        except ValueError as exc:
            raise serializers.ValidationError({'status': str(exc)}) from exc

        order = super().update(instance, validated_data)

        # P3-CRITICAL: Обновление позиций заказа
        if items_data is not None:
            order.items.all().delete()
            self._create_order_items(order, items_data)

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
    trading_point_name = serializers.CharField(
        source='trading_point.name', read_only=True, default=''
    )
    recipient_name = serializers.CharField(read_only=True)

    class Meta:
        model = Order
        fields = ['id', 'number', 'status', 'source', 'total',
                  'delivery_date', 'customer_name', 'trading_point',
                  'trading_point_name', 'recipient_name', 'created_at']

    def get_customer_name(self, obj):
        return str(obj.customer) if obj.customer else ''
