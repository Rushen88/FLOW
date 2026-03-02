from celery import shared_task
from django.utils import timezone
from datetime import timedelta
from django.db.models import Sum, Count
import logging

from apps.analytics.models import DailySummary
from apps.sales.models import Sale
from apps.core.models import TradingPoint

logger = logging.getLogger(__name__)

@shared_task
def calculate_daily_summary_for_all_points():
    logger.info('Starting DailySummary calculation')
    today = timezone.now().date()
    dates_to_calc = [today, today - timedelta(days=1)]

    points = TradingPoint.objects.all()
    for point in points:
        for date_val in dates_to_calc:
            sales = Sale.objects.filter(
                trading_point=point,
                created_at__date=date_val,
                status='completed'
            )
            
            aggregates = sales.aggregate(
                total_revenue=Sum('total'),
                sales_count=Count('id')
            )
            
            revenue = aggregates.get('total_revenue') or 0
            count = aggregates.get('sales_count') or 0
            
            DailySummary.objects.update_or_create(
                trading_point=point,
                date=date_val,
                defaults={
                    'revenue': revenue,
                    'sales_count': count,
                }
            )
    logger.info('DailySummary calculation completed')
