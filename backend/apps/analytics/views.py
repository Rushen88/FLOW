from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Sum, Avg, Count
from django.utils import timezone
from datetime import timedelta
from django_filters.rest_framework import DjangoFilterBackend
from apps.core.mixins import OrgPerformCreateMixin, _tenant_filter, _resolve_org, _resolve_tp
from .models import DailySummary
from .serializers import DailySummarySerializer
from apps.sales.models import Sale, Order
from apps.customers.models import Customer
from apps.inventory.models import StockBalance


class DailySummaryViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = DailySummarySerializer
    queryset = DailySummary.objects.all()
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['trading_point', 'date']

    def get_queryset(self):
        qs = DailySummary.objects.select_related('trading_point')
        return _tenant_filter(qs, self.request.user, tp_field='trading_point')

    @action(detail=False, methods=['get'])
    def dashboard(self, request):
        """
        Данные для дашборда.
        Учитывает active_trading_point — если выбрана ТТ, фильтрует все KPI.
        """
        org = _resolve_org(request.user)
        tp = _resolve_tp(request.user)
        today = timezone.now().date()
        month_start = today.replace(day=1)

        # Базовые фильтры
        sale_base = {}
        order_base = {}
        if org:
            sale_base['organization'] = org
            order_base['organization'] = org
        if tp:
            sale_base['trading_point'] = tp
            order_base['trading_point'] = tp

        # Продажи за сегодня
        if org:
            today_sales = Sale.objects.filter(
                **sale_base, created_at__date=today, status='completed'
            ).aggregate(
                total=Sum('total'),
                count=Count('id')
            )
        else:
            today_sales = {'total': 0, 'count': 0}

        # Продажи за месяц
        if org:
            month_sales = Sale.objects.filter(
                **sale_base, created_at__date__gte=month_start, status='completed'
            ).aggregate(
                total=Sum('total'),
            )
        else:
            month_sales = {'total': 0}

        # Активные заказы
        if org:
            active_orders = Order.objects.filter(
                **order_base,
                status__in=['new', 'confirmed', 'in_assembly', 'assembled', 'on_delivery']
            ).count()
        else:
            active_orders = 0

        # Клиенты (не зависят от ТТ)
        total_customers = Customer.objects.filter(
            organization=org
        ).count() if org else 0

        return Response({
            'today_revenue': today_sales.get('total') or 0,
            'today_sales_count': today_sales.get('count') or 0,
            'month_revenue': month_sales.get('total') or 0,
            'active_orders': active_orders,
            'total_customers': total_customers,
        })
