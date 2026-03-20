from rest_framework import serializers
from .models import (
    Batch, StockBalance, StockMovement, InventoryDocument, InventoryItem,
    Reserve, ReceiptDocument, ReceiptDocumentItem,
)


class BatchSerializer(serializers.ModelSerializer):
    nomenclature_name = serializers.CharField(source='nomenclature.name', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True, default='')

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
    warehouse_from_name = serializers.CharField(source='warehouse_from.name', read_only=True, default='')
    warehouse_to_name = serializers.CharField(source='warehouse_to.name', read_only=True, default='')

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
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True, default='')

    class Meta:
        model = InventoryDocument
        fields = '__all__'
        read_only_fields = ['organization']


class ReserveSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reserve
        fields = '__all__'
        read_only_fields = ['organization']


class ReceiptDocumentItemSerializer(serializers.ModelSerializer):
    nomenclature_name = serializers.CharField(source='nomenclature.name', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True, default='')

    class Meta:
        model = ReceiptDocumentItem
        fields = '__all__'
        read_only_fields = ['batch', 'total']


class ReceiptDocumentSerializer(serializers.ModelSerializer):
    items = ReceiptDocumentItemSerializer(many=True, required=False)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True, default='')

    class Meta:
        model = ReceiptDocument
        fields = '__all__'
        read_only_fields = ['organization', 'total_cost', 'created_by']

    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        doc = ReceiptDocument.objects.create(**validated_data)
        for item_data in items_data:
            ReceiptDocumentItem.objects.create(document=doc, **item_data)
        return doc

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if items_data is not None:
            instance.items.all().delete()
            for item_data in items_data:
                ReceiptDocumentItem.objects.create(document=instance, **item_data)
        return instance
