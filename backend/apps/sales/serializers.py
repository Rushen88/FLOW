from rest_framework import serializers
from django.db import transaction as db_transaction
from .models import Sale, SaleItem, Order, OrderItem, OrderStatusHistory


class SaleItemWriteSerializer(serializers.ModelSerializer):
    """Сериализатор позиции продажи для записи."""
    class Meta:
        model = SaleItem
        fields = ['nomenclature', 'batch', 'quantity', 'price',
                  'cost_price', 'discount_percent', 'total', 'is_custom_bouquet']


class SaleItemSerializer(serializers.ModelSerializer):
    nomenclature_name = serializers.CharField(source='nomenclature.name', read_only=True)

    class Meta:
        model = SaleItem
        fields = '__all__'


class SaleSerializer(serializers.ModelSerializer):
    items = SaleItemSerializer(many=True, read_only=True)
    items_data = SaleItemWriteSerializer(many=True, write_only=True, required=False)
    customer_name = serializers.SerializerMethodField()

    class Meta:
        model = Sale
        fields = '__all__'
        read_only_fields = ['organization']

    def get_customer_name(self, obj):
        return str(obj.customer) if obj.customer else ''

    @db_transaction.atomic
    def create(self, validated_data):
        items_data = validated_data.pop('items_data', [])
        sale = Sale.objects.create(**validated_data)
        # Автоматическая генерация номера чека
        if not sale.number:
            count = Sale.objects.filter(organization=sale.organization).count()
            sale.number = f'{count}'
            sale.save(update_fields=['number'])
        for item_data in items_data:
            SaleItem.objects.create(sale=sale, **item_data)
        # Пересчёт итогов
        self._recalc_totals(sale)
        return sale

    @db_transaction.atomic
    def update(self, instance, validated_data):
        items_data = validated_data.pop('items_data', None)
        instance = super().update(instance, validated_data)
        if items_data is not None:
            instance.items.all().delete()
            for item_data in items_data:
                SaleItem.objects.create(sale=instance, **item_data)
            self._recalc_totals(instance)
        return instance

    def _recalc_totals(self, sale):
        from django.db.models import Sum
        agg = sale.items.aggregate(total=Sum('total'))['total'] or 0
        sale.subtotal = agg
        sale.total = agg - sale.discount_amount
        sale.save(update_fields=['subtotal', 'total'])


class SaleListSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()

    class Meta:
        model = Sale
        fields = ['id', 'number', 'status', 'total', 'customer_name',
                  'is_paid', 'created_at']

    def get_customer_name(self, obj):
        return str(obj.customer) if obj.customer else ''


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
