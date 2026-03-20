from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from .models import NomenclatureGroup, MeasureUnit, Nomenclature, BouquetTemplate, BouquetComponent, PurchasePriceHistory
from .serializers import (
    NomenclatureGroupSerializer, MeasureUnitSerializer,
    NomenclatureSerializer, NomenclatureListSerializer,
    BouquetTemplateSerializer, BouquetComponentSerializer,
    NomenclatureOptionSerializer, PurchasePriceHistorySerializer,
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

    @action(detail=False, methods=['get'])
    def tree(self, request):
        """
        Полное дерево номенклатуры: группы (рекурсивно) + позиции в каждой группе.
        Корневые позиции (без группы) возвращаются отдельно.
        """
        group_rows = list(
            _tenant_filter(NomenclatureGroup.objects.all(), request.user)
            .order_by('name')
            .values('id', 'name', 'parent_id')
        )
        item_rows = list(
            _tenant_filter(
                Nomenclature.objects.filter(is_deleted=False),
                request.user,
            )
            .order_by('name')
            .values(
                'id', 'name', 'nomenclature_type', 'accounting_type', 'sku',
                'retail_price', 'purchase_price', 'is_active', 'group_id',
            )
        )

        nodes = {
            row['id']: {
                'id': row['id'],
                'name': row['name'],
                'parent': row['parent_id'],
                'children': [],
                'items': [],
            }
            for row in group_rows
        }
        root_groups = []
        root_items = []

        for row in group_rows:
            node = nodes[row['id']]
            parent_id = row['parent_id']
            if parent_id and parent_id in nodes:
                nodes[parent_id]['children'].append(node)
            else:
                root_groups.append(node)

        for row in item_rows:
            payload = {
                'id': row['id'],
                'name': row['name'],
                'nomenclature_type': row['nomenclature_type'],
                'accounting_type': row['accounting_type'] or '',
                'sku': row['sku'] or '',
                'retail_price': str(row['retail_price'] or '0'),
                'purchase_price': str(row['purchase_price'] or '0'),
                'is_active': row['is_active'],
            }
            group_id = row['group_id']
            if group_id and group_id in nodes:
                nodes[group_id]['items'].append(payload)
            else:
                root_items.append(payload)

        return Response({'groups': root_groups, 'root_items': root_items})

    @action(detail=True, methods=['get'], url_path='delete-info')
    def delete_info(self, request, pk=None):
        """Возвращает кол-во потомков для подтверждения каскадного удаления."""
        group = self.get_object()
        counts = group.get_descendant_count()
        return Response(counts)


@method_decorator(cache_page(60 * 60 * 24), name='dispatch') # Кеш на сутки, справочник общий
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
    ordering = ['name']

    def get_serializer_class(self):
        if self.action == 'list':
            return NomenclatureListSerializer
        return NomenclatureSerializer

    def get_queryset(self):
        qs = Nomenclature.objects.select_related('group', 'unit')
        return _tenant_filter(qs, self.request.user)

    @action(detail=False, methods=['get'], pagination_class=None, url_path='options')
    def options(self, request):
        qs = self.get_queryset().filter(is_deleted=False).order_by('name')
        serializer = NomenclatureOptionSerializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'], url_path='price-history')
    def price_history(self, request, pk=None):
        """История закупочных цен для позиции."""
        nom = self.get_object()
        qs = PurchasePriceHistory.objects.filter(nomenclature=nom).order_by('-created_at')[:50]
        return Response(PurchasePriceHistorySerializer(qs, many=True).data)

    @action(detail=True, methods=['patch'], url_path='update-price')
    def update_price(self, request, pk=None):
        """Inline-обновление розничной цены."""
        nom = self.get_object()
        retail = request.data.get('retail_price')
        if retail is not None:
            from decimal import Decimal
            nom.retail_price = Decimal(str(retail))
            nom.save(update_fields=['retail_price'])
        return Response({'id': str(nom.id), 'retail_price': str(nom.retail_price)})


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
