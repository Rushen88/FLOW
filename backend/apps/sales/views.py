from decimal import Decimal

from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import transaction as db_transaction
from django.db.models import Sum, Count, F
from django_filters.rest_framework import DjangoFilterBackend
from .models import Sale, SaleItem, Order, OrderItem
from .serializers import (
    SaleSerializer, SaleListSerializer, SaleItemSerializer,
    OrderSerializer, OrderListSerializer, OrderItemSerializer,
)
from .services import rollback_sale_effects_before_delete
from apps.core.mixins import OrgPerformCreateMixin, _tenant_filter, _resolve_org, ReadOnlyOrManager


class SaleViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    def perform_destroy(self, instance):
        from rest_framework.exceptions import MethodNotAllowed
        raise MethodNotAllowed('DELETE', detail='Удаление продаж запрещено архитектурой. Переведите продажу в статус Отменена для корректного отката балансов и остатков.')
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
        qs = Sale.objects.select_related('customer', 'seller', 'trading_point').prefetch_related('items', 'items__nomenclature')
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

    @action(detail=False, methods=['get'], url_path='shift-report')
    def shift_report(self, request):
        """Отчёт по кассовым сменам: выручка, себестоимость, прибыль, маржа, средний чек."""
        from apps.finance.models import CashShift

        org = _resolve_org(request.user)
        if not org:
            return Response([])

        tp_id = request.query_params.get('trading_point')
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')

        shifts_qs = CashShift.objects.filter(organization=org).select_related(
            'trading_point', 'opened_by', 'closed_by'
        )
        if tp_id:
            shifts_qs = shifts_qs.filter(trading_point_id=tp_id)
        if date_from:
            shifts_qs = shifts_qs.filter(opened_at__date__gte=date_from)
        if date_to:
            shifts_qs = shifts_qs.filter(opened_at__date__lte=date_to)
        shifts_qs = shifts_qs.order_by('-opened_at')[:100]

        result = []
        for shift in shifts_qs:
            completed_sales = Sale.objects.filter(
                cash_shift=shift,
                status=Sale.Status.COMPLETED,
                is_paid=True,
            )
            sale_agg = completed_sales.aggregate(
                revenue=Sum('total'),
                count=Count('id'),
            )
            revenue = sale_agg['revenue'] or Decimal('0')
            count = sale_agg['count'] or 0

            # Себестоимость: сумма (cost_price * quantity) по позициям продаж этой смены
            cost_agg = SaleItem.objects.filter(
                sale__in=completed_sales
            ).aggregate(
                cost=Sum(F('cost_price') * F('quantity'))
            )
            cost = cost_agg['cost'] or Decimal('0')

            gross_profit = revenue - cost
            margin_pct = (
                (gross_profit / revenue * 100).quantize(Decimal('0.1'))
                if revenue > 0 else Decimal('0')
            )
            avg_check = (
                (revenue / count).quantize(Decimal('0.01'))
                if count > 0 else Decimal('0')
            )

            result.append({
                'shift_id': str(shift.id),
                'trading_point_id': str(shift.trading_point_id) if shift.trading_point_id else '',
                'trading_point_name': shift.trading_point.name if shift.trading_point else '',
                'opened_at': shift.opened_at.isoformat() if shift.opened_at else None,
                'closed_at': shift.closed_at.isoformat() if shift.closed_at else None,
                'opened_by': shift.opened_by.get_full_name() if shift.opened_by else '',
                'closed_by': shift.closed_by.get_full_name() if shift.closed_by else '',
                'status': shift.status,
                'sales_count': count,
                'revenue': str(revenue),
                'cost': str(cost),
                'gross_profit': str(gross_profit),
                'margin_pct': str(margin_pct),
                'avg_check': str(avg_check),
                'balance_at_open': str(shift.balance_at_open),
                'actual_balance_at_close': str(shift.actual_balance_at_close) if shift.actual_balance_at_close is not None else None,
                'notes': shift.notes or '',
            })

        return Response(result)


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
    def perform_destroy(self, instance):
        from rest_framework.exceptions import MethodNotAllowed
        raise MethodNotAllowed('DELETE', detail='Удаление заказов запрещено архитектурой. Переведите заказ в статус Отменён.')
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

        # CRITICAL P2: проверка перехода статуса ДО создания Sale
        if not order.can_transition_to('completed'):
            allowed = order.ALLOWED_TRANSITIONS.get(order.status, [])
            return Response(
                {'detail': f'Невозможно завершить заказ из статуса «{order.get_status_display()}». '
                           f'Допустимые: {", ".join(order.Status(s).label for s in allowed) or "нет"}.'},
                status=status.HTTP_409_CONFLICT,
            )

        # Блокировка организации для генерации номера
        lock_organization_row(order.organization_id)

        # Кассовая смена
        active_shift = CashShift.objects.filter(
            trading_point=order.trading_point,
            status=CashShift.Status.OPEN,
        ).order_by('-opened_at').first()

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
            total=order.total,
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

        # Бизнес-логика: FIFO-списание, финансовая проводка, статистика клиента + промокод
        do_sale_fifo_write_off(sale)
        sync_sale_transaction(sale)
        # P5-BUG4: Вызываем всегда (не только при наличии customer) — для учёта промокода
        update_customer_stats(sale, sale.total, 1)

        # Переход статуса (уже проверен выше)
        order.transition_to('completed', user=request.user, comment='Checkout — чек создан')

        return Response({'detail': 'Продажа успешно создана', 'sale_id': str(sale.id)}, status=status.HTTP_201_CREATED)

    def get_serializer_class(self):
        if self.action == 'list':
            return OrderListSerializer
        return OrderSerializer

    def get_queryset(self):
        qs = Order.objects.select_related('customer', 'trading_point').prefetch_related('items', 'items__nomenclature', 'status_history')
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
