import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('marketing', '0001_initial'),
        ('sales', '0004_sale_cash_shift'),
    ]

    operations = [
        # Sale model
        migrations.AddField(
            model_name='sale',
            name='promo_code',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='sales',
                to='marketing.promocode',
                verbose_name='Промокод',
            ),
        ),
        migrations.AddField(
            model_name='sale',
            name='used_bonuses',
            field=models.DecimalField(
                decimal_places=2, default=0, max_digits=12,
                verbose_name='Списано бонусов',
            ),
        ),
        migrations.AddField(
            model_name='sale',
            name='earned_bonuses',
            field=models.DecimalField(
                decimal_places=2, default=0, max_digits=12,
                verbose_name='Начислено бонусов',
            ),
        ),
        # Order model
        migrations.AddField(
            model_name='order',
            name='promo_code',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='orders',
                to='marketing.promocode',
                verbose_name='Промокод',
            ),
        ),
        migrations.AddField(
            model_name='order',
            name='used_bonuses',
            field=models.DecimalField(
                decimal_places=2, default=0, max_digits=12,
                verbose_name='Списано бонусов',
            ),
        ),
        migrations.AddField(
            model_name='order',
            name='earned_bonuses',
            field=models.DecimalField(
                decimal_places=2, default=0, max_digits=12,
                verbose_name='Начислено бонусов',
            ),
        ),
    ]
