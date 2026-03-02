import os
from celery import Celery
from celery.schedules import crontab

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

app = Celery('config')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

app.conf.beat_schedule = {
    'calculate-daily-summary-every-hour': {
        'task': 'apps.analytics.tasks.calculate_daily_summary_for_all_points',
        'schedule': crontab(minute=0, hour='*'),
    },
}
