from decimal import Decimal

from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import transaction as db_transaction
from django_filters.rest_framework import DjangoFilterBackend
from .models import Sale, SaleItem, Order, OrderItem
from .serializers import (
    SaleSerializer, SaleListSerializer, SaleItemSerializer,
    OrderSerializer, OrderListSerializer, OrderItemSerializer,
)
from .services import rollback_sale_effects_before_delete
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

    @db_transaction.atomic
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        rollback_sale_effects_before_delete(instance)
        return super().destroy(request, *args, **kwargs)


class SaleItemViewSet(viewsets.ModelViewSet):
    serializer_class = SaleItemSerializer
    queryset = SaleItem.objects.all()
    permission_classes = [ReadOnlyOrManager]

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
    permission_classes = [ReadOnlyOrManager]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'source', 'trading_point', 'delivery_date']
    search_fields = ['number', 'recipient_name', 'recipient_phone']
    ordering_fields = ['created_at', 'delivery_date', 'total']

    @action(detail=True, methods=['post'], url_path='checkout')
    @db_transaction.atomic
    def checkout(self, request, pk=None):
        """Превращает заказ в продажу (чек): создаёт Sale + SaleItems, запускает FIFO-списание и финансовые проводки."""
        from django.utils import timezone
        from apps.finance.models import CashShift
        from apps.sales.models import Sale, SaleItem
        from apps.sales.services import (
            lock_organization_row, generate_sale_number,
            do_sale_fifo_write_off, sync_sale_transaction, update_customer_stats,
        )

        order = self.get_object()

        # Защита от дублей
        if order.sales.exists():
            return Response({'detail': 'Чек по этому заказу уже существует.'}, status=status.HTTP_400_BAD_REQUEST)

        # Блокировка организации для генерации номера
        lock_organization_row(order.organization_id)

        # Кассовая смена
        active_shift = CashShift.objects.filter(
            trading_point=order.trading_point,
            status=CashShift.Status.OPEN,
        ).order_by('-opened_at').first()

        remaining = max(order.total - (order.prepayment or 0), Decimal('0'))

        sale = Sale.objects.create(
            number=generate_sale_number(order.organization),
            organization=order.organization,
            trading_point=order.trading_point,
            status=Sale.Status.COMPLETED,
            customer=order.customer,
            seller=request.user,
            order=order,
            subtotal=order.subtotal,
            discount_amount=order.discount_amount,
            total=remaining,
            payment_method=order.payment_method,
            cash_shift=active_shift,
            promo_code=order.promo_code,
            used_bonuses=order.used_bonuses or 0,
            is_paid=True,
            completed_at=timezone.now(),
        )
        for item in order.items.select_related('nomenclature').all():
            SaleItem.objects.create(
                sale=sale,
                nomenclature=item.nomenclature,
                quantity=item.quantity,
                price=item.price,
                discount_percent=item.discount_percent,
                total=item.total,
                is_custom_bouquet=item.is_custom_bouquet,
            )

        # Бизнес-логика: FIFO-списание, финансовая проводка, статистика клиента
        do_sale_fifo_write_off(sale)
        sync_sale_transaction(sale)
        if sale.customer:
            update_customer_stats(sale, sale.total, 1)

        # Безопасный переход статуса через transition_to (с аудит-логом)
        try:
            order.transition_to('completed', user=request.user, comment='Checkout — чек создан')
        except ValueError as exc:
            return Response(
                {'detail': f'Невозможно завершить заказ: {exc}'},
                status=status.HTTP_409_CONFLICT,
            )

        return Response({'detail': 'Продажа успешно создана', 'sale_id': str(sale.id)}, status=status.HTTP_201_CREATED)

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
    permission_classes = [ReadOnlyOrManager]

    def get_queryset(self):
        qs = OrderItem.objects.select_related('nomenclature')
        qs = _tenant_filter(qs, self.request.user, 'order__organization')
        order_id = self.request.query_params.get('order')
        if order_id:
            qs = qs.filter(order_id=order_id)
        return qs
