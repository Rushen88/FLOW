from rest_framework import serializers
from .models import Batch, StockBalance, StockMovement, InventoryDocument, InventoryItem, Reserve


class BatchSerializer(serializers.ModelSerializer):
    nomenclature_name = serializers.CharField(source='nomenclature.name', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)

    def validate_nomenclature(self, value):
        if getattr(value, 'nomenclature_type', '') == 'service':
            raise serializers.ValidationError('Услуги нельзя проводить через поступления.')
        return value

    class Meta:
        model = Batch
        fields = '__all__'
        read_only_fields = ['organization']


class StockBalanceSerializer(serializers.ModelSerializer):
    nomenclature_name = serializers.CharField(source='nomenclature.name', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)

    class Meta:
        model = StockBalance
        fields = '__all__'
        read_only_fields = ['organization']


class StockMovementSerializer(serializers.ModelSerializer):
    nomenclature_name = serializers.CharField(source='nomenclature.name', read_only=True)

    def validate_nomenclature(self, value):
        if getattr(value, 'nomenclature_type', '') == 'service':
            raise serializers.ValidationError('Услуги не участвуют в складском учёте.')
        return value

    class Meta:
        model = StockMovement
        fields = '__all__'
        read_only_fields = ['organization']


class InventoryItemSerializer(serializers.ModelSerializer):
    nomenclature_name = serializers.CharField(source='nomenclature.name', read_only=True)

    class Meta:
        model = InventoryItem
        fields = '__all__'


class InventoryDocumentSerializer(serializers.ModelSerializer):
    items = InventoryItemSerializer(many=True, read_only=True)

    class Meta:
        model = InventoryDocument
        fields = '__all__'
        read_only_fields = ['organization']


class ReserveSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reserve
        fields = '__all__'
        read_only_fields = ['organization']
