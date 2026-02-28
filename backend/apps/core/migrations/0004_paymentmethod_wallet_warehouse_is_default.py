import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0003_tenantcontact_tenantnote_tenantpayment'),
        ('finance', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='warehouse',
            name='is_default_for_sales',
            field=models.BooleanField(default=False, verbose_name='По умолчанию для продаж'),
        ),
        migrations.AddField(
            model_name='paymentmethod',
            name='wallet',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='payment_methods', to='finance.wallet', verbose_name='Кошелёк'),
        ),
    ]
