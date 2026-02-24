from rest_framework import serializers
from .models import Supplier, SupplierNomenclature, SupplierOrder, SupplierOrderItem, Claim


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = '__all__'
        read_only_fields = ['organization']


class SupplierNomenclatureSerializer(serializers.ModelSerializer):
    nomenclature_name = serializers.CharField(source='nomenclature.name', read_only=True)

    class Meta:
        model = SupplierNomenclature
        fields = '__all__'


class SupplierOrderItemSerializer(serializers.ModelSerializer):
    nomenclature_name = serializers.CharField(source='nomenclature.name', read_only=True)

    class Meta:
        model = SupplierOrderItem
        fields = '__all__'


class SupplierOrderSerializer(serializers.ModelSerializer):
    items = SupplierOrderItemSerializer(many=True, read_only=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)

    class Meta:
        model = SupplierOrder
        fields = '__all__'
        read_only_fields = ['organization']


class ClaimSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)

    class Meta:
        model = Claim
        fields = '__all__'
        read_only_fields = ['organization']
