import django.db.models.deletion
from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [
        ('sales', '0005_sale_order_promo_bonuses'),
        ('core', '0004_paymentmethod_wallet_warehouse_is_default'),
    ]

    operations = [
        migrations.AlterField(
            model_name='order',
            name='trading_point',
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='orders', to='core.tradingpoint', verbose_name='Торговая точка'),
        ),
        migrations.AlterField(
            model_name='sale',
            name='trading_point',
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='sales', to='core.tradingpoint', verbose_name='Торговая точка'),
        ),
    ]
