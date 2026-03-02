from celery import shared_task
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal
from django.db.models import Sum, Count, Avg
import logging

from apps.analytics.models import DailySummary
from apps.sales.models import Sale, Order
from apps.customers.models import Customer
from apps.inventory.models import StockMovement
from apps.core.models import TradingPoint

logger = logging.getLogger(__name__)

@shared_task
def calculate_daily_summary_for_all_points():
    logger.info('Starting DailySummary calculation')
    today = timezone.now().date()
    dates_to_calc = [today, today - timedelta(days=1)]

    points = TradingPoint.objects.select_related('organization').all()
    for point in points:
        for date_val in dates_to_calc:
            sales = Sale.objects.filter(
                trading_point=point,
                created_at__date=date_val,
                status='completed'
            )

            aggregates = sales.aggregate(
                total_revenue=Sum('total'),
                total_cost=Sum('items__cost_price'),
                sales_count=Count('id'),
                average_check=Avg('total'),
            )

            revenue = aggregates.get('total_revenue') or Decimal('0')
            cost = aggregates.get('total_cost') or Decimal('0')
            count = aggregates.get('sales_count') or 0
            avg_check = aggregates.get('average_check') or Decimal('0')

            orders_count = Order.objects.filter(
                trading_point=point,
                created_at__date=date_val,
            ).count()

            new_customers = Customer.objects.filter(
                organization=point.organization,
                created_at__date=date_val,
            ).count()

            write_offs = StockMovement.objects.filter(
                warehouse__trading_point=point,
                movement_type='write_off',
                created_at__date=date_val,
            ).aggregate(total=Sum('total_cost'))['total'] or Decimal('0')

            DailySummary.objects.update_or_create(
                trading_point=point,
                date=date_val,
                defaults={
                    'organization': point.organization,
                    'revenue': revenue,
                    'cost': cost,
                    'profit': revenue - cost,
                    'sales_count': count,
                    'orders_count': orders_count,
                    'avg_check': avg_check,
                    'new_customers': new_customers,
                    'write_offs': write_offs,
                }
            )
    logger.info('DailySummary calculation completed')
