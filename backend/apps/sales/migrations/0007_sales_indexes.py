import django.db.models.deletion
from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [
        ('sales', '0006_protect_fks'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='sale',
            index=models.Index(fields=['organization', '-created_at'], name='idx_sale_org_dt'),
        ),
        migrations.AddIndex(
            model_name='sale',
            index=models.Index(fields=['trading_point', '-created_at'], name='idx_sale_tp_dt'),
        ),
        migrations.AddIndex(
            model_name='sale',
            index=models.Index(fields=['status'], name='idx_sale_status'),
        ),
        migrations.AddIndex(
            model_name='order',
            index=models.Index(fields=['organization', '-created_at'], name='idx_order_org_dt'),
        ),
        migrations.AddIndex(
            model_name='order',
            index=models.Index(fields=['trading_point', '-created_at'], name='idx_order_tp_dt'),
        ),
        migrations.AddIndex(
            model_name='order',
            index=models.Index(fields=['status'], name='idx_order_status'),
        ),
        migrations.AddIndex(
            model_name='order',
            index=models.Index(fields=['delivery_date'], name='idx_order_delivery_date'),
        ),
    ]
