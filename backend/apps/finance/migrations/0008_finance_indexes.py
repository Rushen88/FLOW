import django.db.models.deletion
from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [
        ('finance', '0007_protect_fks'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='transaction',
            index=models.Index(fields=['organization', '-created_at'], name='idx_txn_org_dt'),
        ),
        migrations.AddIndex(
            model_name='transaction',
            index=models.Index(fields=['wallet_from', '-created_at'], name='idx_txn_wfrom_dt'),
        ),
        migrations.AddIndex(
            model_name='transaction',
            index=models.Index(fields=['wallet_to', '-created_at'], name='idx_txn_wto_dt'),
        ),
        migrations.AddIndex(
            model_name='transaction',
            index=models.Index(fields=['transaction_type'], name='idx_txn_type'),
        ),
        migrations.AddIndex(
            model_name='cashshift',
            index=models.Index(fields=['organization', '-opened_at'], name='idx_shift_org_dt'),
        ),
        migrations.AddIndex(
            model_name='cashshift',
            index=models.Index(fields=['trading_point', 'status'], name='idx_shift_tp_status'),
        ),
    ]
