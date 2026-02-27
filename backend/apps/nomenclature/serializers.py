from rest_framework import serializers
from .models import NomenclatureGroup, MeasureUnit, Nomenclature, BouquetTemplate, BouquetComponent


class NomenclatureGroupSerializer(serializers.ModelSerializer):
    children = serializers.SerializerMethodField()

    class Meta:
        model = NomenclatureGroup
        fields = '__all__'
        read_only_fields = ['organization']

    def get_children(self, obj):
        # Only include children for root-level groups (when fetched with ?root=1)
        request = self.context.get('request')
        if request and request.query_params.get('root') == '1':
            children = obj.children.all()
            return NomenclatureGroupSerializer(children, many=True, context=self.context).data
        return []


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

    class Meta:
        model = BouquetTemplate
        fields = '__all__'

    def get_bouquet_name(self, obj):
        if obj.bouquet_name:
            return obj.bouquet_name
        return obj.nomenclature.name if obj.nomenclature else ''


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
        fields = ['id', 'name', 'nomenclature_type', 'sku', 'retail_price',
                  'purchase_price', 'image', 'group_name', 'is_active']
