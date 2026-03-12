from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('nomenclature', '0008_nomenclature_deleted_at_nomenclature_diameter_and_more'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='nomenclaturegroup',
            name='sort_order',
        ),
        migrations.AlterModelOptions(
            name='nomenclaturegroup',
            options={
                'ordering': ['name'],
                'verbose_name': 'Группа номенклатуры',
                'verbose_name_plural': 'Группы номенклатуры',
            },
        ),
    ]
