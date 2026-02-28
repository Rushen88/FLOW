from rest_framework import viewsets, filters, status
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from .models import Sale, SaleItem, Order, OrderItem
from .serializers import (
    SaleSerializer, SaleListSerializer, SaleItemSerializer,
    OrderSerializer, OrderListSerializer, OrderItemSerializer,
)
from apps.core.mixins import OrgPerformCreateMixin, _tenant_filter, ReadOnlyOrManager


class SaleViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = SaleSerializer
    queryset = Sale.objects.all()
    permission_classes = [ReadOnlyOrManager]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['status', 'trading_point', 'is_paid']
    ordering_fields = ['created_at', 'total']

    def get_serializer_class(self):
        if self.action == 'list':
            return SaleListSerializer
        return SaleSerializer

    def get_queryset(self):
        qs = Sale.objects.select_related('customer', 'seller', 'trading_point')
        return _tenant_filter(qs, self.request.user, tp_field='trading_point')

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        data = serializer.data
        warnings = serializer.context.get('sale_warnings') or []
        if warnings:
            data = {**data, '_warnings': warnings}
        headers = self.get_success_headers(serializer.data)
        return Response(data, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        data = serializer.data
        warnings = serializer.context.get('sale_warnings') or []
        if warnings:
            data = {**data, '_warnings': warnings}
        return Response(data)


class SaleItemViewSet(viewsets.ModelViewSet):
    serializer_class = SaleItemSerializer
    queryset = SaleItem.objects.all()

    def get_queryset(self):
        qs = SaleItem.objects.select_related('nomenclature')
        qs = _tenant_filter(qs, self.request.user, 'sale__organization')
        sale_id = self.request.query_params.get('sale')
        if sale_id:
            qs = qs.filter(sale_id=sale_id)
        return qs


class OrderViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = OrderSerializer
    queryset = Order.objects.all()
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'source', 'trading_point', 'delivery_date']
    search_fields = ['number', 'recipient_name', 'recipient_phone']
    ordering_fields = ['created_at', 'delivery_date', 'total']

    def get_serializer_class(self):
        if self.action == 'list':
            return OrderListSerializer
        return OrderSerializer

    def get_queryset(self):
        qs = Order.objects.select_related('customer', 'trading_point').prefetch_related('items', 'status_history')
        return _tenant_filter(qs, self.request.user, tp_field='trading_point')


class OrderItemViewSet(viewsets.ModelViewSet):
    serializer_class = OrderItemSerializer
    queryset = OrderItem.objects.all()

    def get_queryset(self):
        qs = OrderItem.objects.select_related('nomenclature')
        qs = _tenant_filter(qs, self.request.user, 'order__organization')
        order_id = self.request.query_params.get('order')
        if order_id:
            qs = qs.filter(order_id=order_id)
        return qs
