from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('nomenclature', '0002_bouquettemplate_bouquet_name'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='nomenclature',
            name='season_end',
        ),
        migrations.RemoveField(
            model_name='nomenclature',
            name='season_start',
        ),
    ]