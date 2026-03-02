import sys

with open('backend/config/settings.py', 'r', encoding='utf-8') as f:
    settings = f.read()

celery_beat_config = '''
from celery.schedules import crontab
CELERY_BEAT_SCHEDULE = {
    'check_expiring_batches_daily': {
        'task': 'apps.inventory.tasks.check_expiring_batches',
        'schedule': crontab(hour=8, minute=0),  # Каждое утро в 8:00
    },
    'analytics_daily_summary_midnight': {
        'task': 'apps.analytics.tasks.calculate_daily_summary_for_all_points',
        'schedule': crontab(hour=0, minute=5),
    }
}
'''
if 'CELERY_BEAT_SCHEDULE' not in settings:
    settings += "\n# --------------- CELERY BEAT ---------------"
    settings += celery_beat_config

with open('backend/config/settings.py', 'w', encoding='utf-8') as f:
    f.write(settings)
print("Celery beat configured")
