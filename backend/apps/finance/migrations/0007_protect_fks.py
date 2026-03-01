import django.db.models.deletion
from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [
        ('finance', '0006_cashshift_unique_open_shift'),
        ('core', '0003_warehouse_is_default_for_sales'),
    ]

    operations = [
        migrations.AlterField(
            model_name='cashshift',
            name='trading_point',
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='cash_shifts', to='core.tradingpoint', verbose_name='Торговая точка'),
        ),
        migrations.AlterField(
            model_name='cashshift',
            name='wallet',
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='cash_shifts', to='finance.wallet', verbose_name='Касса (Кошелёк)'),
        ),
        migrations.AlterField(
            model_name='transaction',
            name='wallet_from',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='transactions_out', to='finance.wallet', verbose_name='Из кошелька'),
        ),
        migrations.AlterField(
            model_name='transaction',
            name='wallet_to',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='transactions_in', to='finance.wallet', verbose_name='В кошелёк'),
        ),
    ]
