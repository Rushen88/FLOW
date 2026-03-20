from rest_framework import serializers
from apps.sales.models import SalesCategory
from apps.inventory.models import Reserve, BouquetBatchComponentSnapshot
from apps.nomenclature.models import NomenclatureGroup


class SalesCategorySerializer(serializers.ModelSerializer):
    group_ids = serializers.PrimaryKeyRelatedField(
        many=True, queryset=NomenclatureGroup.objects.all(), source='groups', required=False,
    )

    class Meta:
        model = SalesCategory
        fields = [
            'id', 'organization', 'name', 'icon', 'sort_order',
            'is_visible_in_cashier', 'source_type', 'is_system',
            'group_ids', 'created_at', 'updated_at',
        ]
        read_only_fields = ['organization', 'created_at', 'updated_at']

    def validate(self, attrs):
        source_type = attrs.get('source_type', getattr(self.instance, 'source_type', ''))
        groups = attrs.get('groups', [])
        if source_type == 'nomenclature' and not groups and not (self.instance and self.instance.groups.exists()):
            if not self.partial:
                raise serializers.ValidationError(
                    {'group_ids': 'Для типа "Номенклатура" нужно выбрать минимум одну группу.'}
                )
        if source_type in ('finished_bouquets', 'reserve') and groups:
            raise serializers.ValidationError(
                {'group_ids': f'Для типа "{source_type}" группы запрещены.'}
            )
        return attrs


class ReserveCashierSerializer(serializers.ModelSerializer):
    bouquet_name = serializers.CharField(
        source='bouquet_nomenclature.name', read_only=True, default='',
    )

    class Meta:
        model = Reserve
        fields = [
            'id', 'organization', 'trading_point', 'reserve_number',
            'customer', 'customer_name_snapshot', 'phone', 'phone_last4',
            'expires_at', 'comment', 'order', 'bouquet_nomenclature',
            'bouquet_name', 'batch', 'warehouse', 'quantity', 'status',
            'sold_sale', 'created_at', 'sold_at', 'cancelled_at',
        ]
        read_only_fields = [
            'organization', 'reserve_number', 'phone_last4',
            'sold_sale', 'sold_at', 'cancelled_at',
        ]


class ReserveCreateSerializer(serializers.Serializer):
    bouquet_nomenclature = serializers.UUIDField()
    batch = serializers.UUIDField()
    warehouse = serializers.UUIDField()
    customer = serializers.UUIDField(required=False, allow_null=True)
    customer_name_snapshot = serializers.CharField(required=False, allow_blank=True, default='')
    phone = serializers.CharField()
    expires_at = serializers.DateTimeField(required=False, allow_null=True)
    comment = serializers.CharField(required=False, allow_blank=True, default='')
    quantity = serializers.DecimalField(max_digits=10, decimal_places=2, default=1)


class BouquetSnapshotSerializer(serializers.ModelSerializer):
    nomenclature_name = serializers.CharField(source='nomenclature.name', read_only=True)

    class Meta:
        model = BouquetBatchComponentSnapshot
        fields = [
            'id', 'batch', 'nomenclature', 'nomenclature_name',
            'accounting_type', 'quantity_per_unit', 'price_per_unit',
            'sort_order', 'source_mode', 'created_at',
        ]
        read_only_fields = fields


class CashierFeedItemSerializer(serializers.Serializer):
    """Единый сериализатор карточки для кассового каталога."""
    source_type = serializers.CharField()
    item_id = serializers.CharField()
    title = serializers.CharField()
    subtitle = serializers.CharField(allow_blank=True, default='')
    image = serializers.CharField(allow_blank=True, allow_null=True, default='')
    price = serializers.DecimalField(max_digits=12, decimal_places=2)
    available_qty = serializers.DecimalField(max_digits=10, decimal_places=2)
    badge = serializers.CharField(allow_blank=True, default='')
    payload = serializers.DictField()
    # Reserve extra
    reserve_id = serializers.CharField(allow_blank=True, default='')
    reserve_number = serializers.IntegerField(default=0)
    customer_name = serializers.CharField(allow_blank=True, default='')
    phone = serializers.CharField(allow_blank=True, default='')
    expires_at = serializers.DateTimeField(allow_null=True, default=None)


class CheckoutLineSerializer(serializers.Serializer):
    """Одна строка корзины в checkout."""
    source_mode = serializers.ChoiceField(choices=['catalog', 'ready_bouquet', 'reserve'])
    nomenclature = serializers.UUIDField()
    batch = serializers.UUIDField(required=False, allow_null=True)
    reserve = serializers.UUIDField(required=False, allow_null=True)
    warehouse = serializers.UUIDField(required=False, allow_null=True)
    quantity = serializers.DecimalField(max_digits=10, decimal_places=2)
    price = serializers.DecimalField(max_digits=12, decimal_places=2)
    discount_percent = serializers.DecimalField(max_digits=5, decimal_places=2, default=0)


class CheckoutSerializer(serializers.Serializer):
    """Payload для POST /api/cashier/checkout/."""
    customer = serializers.UUIDField(required=False, allow_null=True)
    payment_method = serializers.UUIDField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    discount_percent = serializers.DecimalField(max_digits=5, decimal_places=2, default=0)
    discount_amount = serializers.DecimalField(max_digits=12, decimal_places=2, default=0)
    cart_lines = CheckoutLineSerializer(many=True)
