"""Add retail_price to PurchasePriceHistory for tracking both price types."""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('nomenclature', '0013_remove_nomenclature_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='purchasepricehistory',
            name='retail_price',
            field=models.DecimalField(
                verbose_name='Розничная цена',
                max_digits=12, decimal_places=2,
                null=True, blank=True,
            ),
        ),
    ]
