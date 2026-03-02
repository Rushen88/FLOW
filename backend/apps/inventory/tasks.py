from celery import shared_task
from django.utils import timezone
from datetime import timedelta
from apps.inventory.models import Batch
from apps.core.models import Warehouse
from django.db.models import Sum

@shared_task
def check_expiring_batches():
    \"\"\"
    Ежедневная проверка скоропортящихся партий.
    В цветочном бизнесе критично знать какие цветы портятся завтра/послезавтра, чтобы пустить их в распродажу (акции) или списание.
    \"\"\"
    today = timezone.now().date()
    warning_date = today + timedelta(days=2)
    
    expiring_batches = Batch.objects.filter(
        remaining__gt=0,
        expiry_date__lte=warning_date,
        expiry_date__gte=today
    ).select_related('nomenclature', 'warehouse__trading_point', 'organization')
    
    # В реальной Enterprise системе здесь шла бы отправка WebSocket/Push уведомлений или email
    # агрегируя по organization и trading_point.
    # Для MVP мы можем логировать или создавать внутренние уведомления (Notification).
    
    print(f"[*] Found {expiring_batches.count()} batches expiring soon.")
    for b in expiring_batches:
        print(f"Org: {b.organization.name} | Point: {b.warehouse.trading_point.name} | Batch: {b.nomenclature.name} expires on {b.expiry_date} (Remaining: {b.remaining})")

