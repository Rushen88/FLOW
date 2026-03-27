from rest_framework import serializers

from apps.core.image_utils import compress_uploaded_image

from .models import NomenclatureGroup, MeasureUnit, Nomenclature, BouquetTemplate, BouquetComponent, PurchasePriceHistory
from apps.core.mixins import _resolve_org


class NomenclatureGroupSerializer(serializers.ModelSerializer):
    children = serializers.SerializerMethodField()

    class Meta:
        model = NomenclatureGroup
        fields = ['id', 'organization', 'name', 'parent', 'children']
        read_only_fields = ['organization']

    def validate_parent(self, parent):
        if not parent:
            return parent

        request = self.context.get('request')
        org = _resolve_org(request.user) if request else None
        if org and str(parent.organization_id) != str(org.id):
            raise serializers.ValidationError('Родительская группа принадлежит другой организации.')

        instance = getattr(self, 'instance', None)
        cursor = parent
        while instance and cursor:
            if cursor.id == instance.id:
                raise serializers.ValidationError('Нельзя вложить группу саму в себя или в её потомка.')
            cursor = cursor.parent

        return parent

    def get_children(self, obj):
        request = self.context.get('request')
        if request and request.query_params.get('root') == '1':
            children = obj.children.order_by('name')
            return NomenclatureGroupSerializer(children, many=True, context=self.context).data
        return []


class NomenclatureTreeItemSerializer(serializers.ModelSerializer):
    """Лёгкий сериализатор номенклатуры для дерева."""
    class Meta:
        model = Nomenclature
        fields = ['id', 'name', 'accounting_type', 'sku', 'retail_price',
                  'purchase_price', 'is_active']


class NomenclatureGroupTreeSerializer(serializers.ModelSerializer):
    """Рекурсивный сериализатор дерева групп с вложенными позициями."""
    children = serializers.SerializerMethodField()
    items = serializers.SerializerMethodField()

    class Meta:
        model = NomenclatureGroup
        fields = ['id', 'name', 'parent', 'children', 'items']

    def get_children(self, obj):
        children = obj.children.order_by('name')
        return NomenclatureGroupTreeSerializer(children, many=True, context=self.context).data

    def get_items(self, obj):
        items = obj.nomenclatures.filter(is_deleted=False).order_by('name')
        return NomenclatureTreeItemSerializer(items, many=True).data


class MeasureUnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = MeasureUnit
        fields = '__all__'


class BouquetComponentSerializer(serializers.ModelSerializer):
    nomenclature_name = serializers.CharField(
        source='nomenclature.name', read_only=True
    )

    class Meta:
        model = BouquetComponent
        fields = '__all__'


class BouquetTemplateSerializer(serializers.ModelSerializer):
    components = BouquetComponentSerializer(many=True, read_only=True)
    bouquet_name = serializers.SerializerMethodField()
    nomenclature_name = serializers.CharField(source='nomenclature.name', read_only=True, default='')
    accounting_type = serializers.CharField(source='nomenclature.accounting_type', read_only=True, default='finished_bouquet')
    retail_price = serializers.CharField(source='nomenclature.retail_price', read_only=True, default='0.00')

    class Meta:
        model = BouquetTemplate
        fields = '__all__'

    def get_bouquet_name(self, obj):
        if obj.bouquet_name:
            return obj.bouquet_name
        return obj.nomenclature.name if obj.nomenclature else ''

    def create(self, validated_data):
        image = validated_data.pop('image', None)
        instance = super().create(validated_data)
        if image:
            instance.image.save(image.name, compress_uploaded_image(image), save=True)
        return instance

    def update(self, instance, validated_data):
        image = validated_data.pop('image', None)
        instance = super().update(instance, validated_data)
        if image:
            if instance.image:
                instance.image.delete(save=False)
            instance.image.save(image.name, compress_uploaded_image(image), save=True)
        return instance


class NomenclatureSerializer(serializers.ModelSerializer):
    group_name = serializers.CharField(source='group.name', read_only=True, default='')
    unit_name = serializers.CharField(source='unit.short_name', read_only=True, default='')
    bouquet_template = BouquetTemplateSerializer(read_only=True)

    class Meta:
        model = Nomenclature
        fields = '__all__'
        read_only_fields = ['organization']


class NomenclatureListSerializer(serializers.ModelSerializer):
    """Лёгкий сериализатор для списков."""
    group_name = serializers.CharField(source='group.name', read_only=True, default='')

    class Meta:
        model = Nomenclature
        fields = ['id', 'name', 'accounting_type', 'sku', 'retail_price',
                  'purchase_price', 'image', 'group_name', 'is_active']


class NomenclatureOptionSerializer(serializers.ModelSerializer):
    """Минимальный набор полей для select/autocomplete без тяжёлого detail payload."""

    class Meta:
        model = Nomenclature
        fields = ['id', 'name', 'accounting_type', 'purchase_price', 'retail_price', 'is_active']


class PurchasePriceHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = PurchasePriceHistory
        fields = ['id', 'nomenclature', 'purchase_price', 'source', 'created_at']
        read_only_fields = ['id', 'created_at']
