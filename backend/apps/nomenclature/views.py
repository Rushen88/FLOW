from rest_framework import viewsets, filters
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from .models import NomenclatureGroup, MeasureUnit, Nomenclature, BouquetTemplate, BouquetComponent
from .serializers import (
    NomenclatureGroupSerializer, MeasureUnitSerializer,
    NomenclatureSerializer, NomenclatureListSerializer,
    BouquetTemplateSerializer, BouquetComponentSerializer,
)
from apps.core.mixins import (
    OrgPerformCreateMixin, _tenant_filter, _resolve_org,
    IsPlatformAdmin, ReadOnlyOrManager,
)


class NomenclatureGroupViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = NomenclatureGroupSerializer
    queryset = NomenclatureGroup.objects.all()

    def get_queryset(self):
        qs = NomenclatureGroup.objects.all()
        qs = _tenant_filter(qs, self.request.user)
        parent = self.request.query_params.get('root')
        if parent == '1':
            qs = qs.filter(parent__isnull=True)
        return qs.distinct()


class MeasureUnitViewSet(viewsets.ModelViewSet):
    """
    Единицы измерения — общий справочник.
    Чтение — все авторизованные.
    Создание/редактирование/удаление — только суперадмин платформы.
    """
    serializer_class = MeasureUnitSerializer
    queryset = MeasureUnit.objects.all()

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [IsAuthenticated()]
        return [IsAuthenticated(), IsPlatformAdmin()]


class NomenclatureViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = NomenclatureSerializer
    queryset = Nomenclature.objects.all()
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['nomenclature_type', 'group', 'is_active']
    search_fields = ['name', 'sku', 'barcode']
    ordering_fields = ['name', 'retail_price', 'created_at']

    def get_serializer_class(self):
        if self.action == 'list':
            return NomenclatureListSerializer
        return NomenclatureSerializer

    def get_queryset(self):
        qs = Nomenclature.objects.select_related('group', 'unit')
        return _tenant_filter(qs, self.request.user)


class BouquetTemplateViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = BouquetTemplateSerializer
    queryset = BouquetTemplate.objects.all()

    def get_queryset(self):
        qs = BouquetTemplate.objects.select_related('nomenclature').prefetch_related('components')
        return _tenant_filter(qs, self.request.user, 'nomenclature__organization')

    def perform_create(self, serializer):
        """Автозаполнение organization из номенклатуры."""
        org = _resolve_org(self.request.user)
        serializer.save(organization=org)


class BouquetComponentViewSet(viewsets.ModelViewSet):
    serializer_class = BouquetComponentSerializer
    queryset = BouquetComponent.objects.all()
    permission_classes = [ReadOnlyOrManager]

    def get_queryset(self):
        qs = BouquetComponent.objects.select_related('nomenclature', 'template')
        qs = _tenant_filter(qs, self.request.user, 'template__nomenclature__organization')
        template_id = self.request.query_params.get('template')
        if template_id:
            qs = qs.filter(template_id=template_id)
        return qs

    def perform_create(self, serializer):
        """Проверка что шаблон принадлежит организации."""
        template = serializer.validated_data.get('template')
        org = _resolve_org(self.request.user)
        if template and org:
            nom_org = getattr(template.nomenclature, 'organization_id', None)
            if nom_org and str(nom_org) != str(org.id):
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied('Шаблон не принадлежит вашей организации.')
        serializer.save()
