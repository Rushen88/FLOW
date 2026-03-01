import django.db.models.deletion
from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [
        ('inventory', '0004_stockmovement_sale_batch_idx_batch_fifo_and_more'),
        ('core', '0004_paymentmethod_wallet_warehouse_is_default'),
        ('nomenclature', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='batch',
            name='nomenclature',
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='batches', to='nomenclature.nomenclature', verbose_name='Номенклатура'),
        ),
        migrations.AlterField(
            model_name='batch',
            name='warehouse',
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='batches', to='core.warehouse', verbose_name='Склад'),
        ),
    ]
