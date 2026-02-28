from decimal import Decimal

from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, ValidationError
from django.db import transaction as db_transaction
from django_filters.rest_framework import DjangoFilterBackend
from .models import Supplier, SupplierNomenclature, SupplierOrder, SupplierOrderItem, Claim
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

    @action(detail=True, methods=['post'], url_path='receive')
    @db_transaction.atomic
    def receive(self, request, pk=None):
        """
        C5: Приёмка поставки — создаёт партии, обновляет остатки, создаёт задолженность.
        Принимает опциональный параметр warehouse (UUID) и create_debt (bool, default True).
        """
        from apps.inventory.services import process_batch_receipt
        from apps.core.models import Warehouse

        order = self.get_object()

        if order.status == SupplierOrder.Status.RECEIVED:
            return Response({'detail': 'Поставка уже принята.'}, status=status.HTTP_400_BAD_REQUEST)
        if order.status == SupplierOrder.Status.CANCELLED:
            return Response({'detail': 'Отменённый заказ нельзя принять.'}, status=status.HTTP_400_BAD_REQUEST)

        warehouse_id = request.data.get('warehouse')
        create_debt = request.data.get('create_debt', True)

        if warehouse_id:
            try:
                warehouse = Warehouse.objects.get(pk=warehouse_id, organization=order.organization)
            except Warehouse.DoesNotExist:
                raise ValidationError({'warehouse': 'Склад не найден.'})
        else:
            warehouse = Warehouse.objects.filter(
                organization=order.organization, is_default_for_sales=True
            ).first()
            if not warehouse:
                warehouse = Warehouse.objects.filter(organization=order.organization).first()
            if not warehouse:
                raise ValidationError({'warehouse': 'Не найден склад для приёмки. Создайте склад.'})

        items = order.items.select_related('nomenclature').all()
        if not items.exists():
            return Response({'detail': 'В заказе нет позиций.'}, status=status.HTTP_400_BAD_REQUEST)

        batches = []
        for item in items:
            batch = process_batch_receipt(
                organization=order.organization,
                warehouse=warehouse,
                nomenclature=item.nomenclature,
                supplier=order.supplier,
                quantity=item.quantity,
                purchase_price=item.price,
                invoice_number=order.number,
                user=request.user,
                create_debt=bool(create_debt),
            )
            item.received_quantity = item.quantity
            item.save(update_fields=['received_quantity'])
            batches.append(str(batch.id))

        order.status = SupplierOrder.Status.RECEIVED
        order.save(update_fields=['status', 'updated_at'])

        return Response({
            'detail': f'Поставка принята: {len(batches)} позиц.',
            'batches': batches,
        }, status=status.HTTP_200_OK)


class ClaimViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = ClaimSerializer
    queryset = Claim.objects.all()
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['status', 'supplier']

    def get_queryset(self):
        qs = Claim.objects.select_related('supplier')
        return _tenant_filter(qs, self.request.user)
