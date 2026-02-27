from rest_framework import serializers
from django.db import transaction as db_transaction
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
        sale = Sale.objects.create(**validated_data)
        # Auto-generate receipt number
        if not sale.number:
            count = Sale.objects.filter(organization=sale.organization).count()
            sale.number = f'{count}'
            sale.save(update_fields=['number'])
        for item_data in items_data:
            # Remove warehouse from item_data - it's not a SaleItem field
            item_data.pop('warehouse', None)
            SaleItem.objects.create(sale=sale, **item_data)
        self._recalc_totals(sale)
        return sale

    @db_transaction.atomic
    def update(self, instance, validated_data):
        items_data = validated_data.pop('items_data', None)
        instance = super().update(instance, validated_data)
        if items_data is not None:
            instance.items.all().delete()
            for item_data in items_data:
                item_data.pop('warehouse', None)
                SaleItem.objects.create(sale=instance, **item_data)
            self._recalc_totals(instance)
        return instance

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
