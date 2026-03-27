from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('nomenclature', '0011_default_measure_units'),
    ]

    operations = [
        migrations.AddField(
            model_name='nomenclature',
            name='is_template_placeholder',
            field=models.BooleanField(db_index=True, default=False, verbose_name='Служебная позиция шаблона'),
        ),
    ]