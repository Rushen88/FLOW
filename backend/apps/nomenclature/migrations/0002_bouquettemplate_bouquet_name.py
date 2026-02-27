from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('nomenclature', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='bouquettemplate',
            name='bouquet_name',
            field=models.CharField(blank=True, default='', max_length=500, verbose_name='Название букета'),
        ),
    ]
