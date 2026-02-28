from rest_framework import viewsets, filters
from rest_framework.exceptions import PermissionDenied
from django_filters.rest_framework import DjangoFilterBackend
from .models import Supplier, SupplierNomenclature, SupplierOrder, Claim
from .serializers import (
    SupplierSerializer, SupplierNomenclatureSerializer,
    SupplierOrderSerializer, ClaimSerializer,
)
from apps.core.mixins import OrgPerformCreateMixin, _tenant_filter, _resolve_org


class SupplierViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = SupplierSerializer
    queryset = Supplier.objects.all()
    filter_backends = [filters.SearchFilter]
    search_fields = ['name', 'contact_person', 'phone']

    def get_queryset(self):
        qs = Supplier.objects.all()
        return _tenant_filter(qs, self.request.user)


class SupplierNomenclatureViewSet(viewsets.ModelViewSet):
    serializer_class = SupplierNomenclatureSerializer
    queryset = SupplierNomenclature.objects.all()

    def get_queryset(self):
        qs = SupplierNomenclature.objects.select_related('nomenclature', 'supplier')
        qs = _tenant_filter(qs, self.request.user, 'supplier__organization')
        supplier_id = self.request.query_params.get('supplier')
        if supplier_id:
            qs = qs.filter(supplier_id=supplier_id)
        return qs

    def perform_create(self, serializer):
        """Проверка что поставщик принадлежит организации."""
        supplier = serializer.validated_data.get('supplier')
        org = _resolve_org(self.request.user)
        if supplier and org and str(supplier.organization_id) != str(org.id):
            raise PermissionDenied('Поставщик не принадлежит вашей организации.')
        serializer.save()

    def perform_update(self, serializer):
        """Проверка что поставщик принадлежит организации."""
        supplier = serializer.validated_data.get('supplier', self.get_object().supplier)
        org = _resolve_org(self.request.user)
        if supplier and org and str(supplier.organization_id) != str(org.id):
            raise PermissionDenied('Поставщик не принадлежит вашей организации.')
        serializer.save()


class SupplierOrderViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = SupplierOrderSerializer
    queryset = SupplierOrder.objects.all()
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['status', 'supplier']

    def get_queryset(self):
        qs = SupplierOrder.objects.select_related('supplier').prefetch_related('items')
        return _tenant_filter(qs, self.request.user)


class ClaimViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = ClaimSerializer
    queryset = Claim.objects.all()
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['status', 'supplier']

    def get_queryset(self):
        qs = Claim.objects.select_related('supplier')
        return _tenant_filter(qs, self.request.user)
