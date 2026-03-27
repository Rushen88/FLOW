"""Remove nomenclature_type field and its index, migrate data to accounting_type."""

from django.db import migrations


def migrate_nomenclature_type_to_accounting_type(apps, schema_editor):
    """Map old nomenclature_type values to accounting_type."""
    Nomenclature = apps.get_model('nomenclature', 'Nomenclature')
    # bouquet and composition -> finished_bouquet
    Nomenclature.objects.filter(
        nomenclature_type__in=['bouquet', 'composition'],
        accounting_type='stock_material',
    ).update(accounting_type='finished_bouquet')
    # service -> service
    Nomenclature.objects.filter(
        nomenclature_type='service',
        accounting_type='stock_material',
    ).update(accounting_type='service')
    # All others stay as stock_material (default)


class Migration(migrations.Migration):

    dependencies = [
        ('nomenclature', '0012_nomenclature_is_template_placeholder'),
    ]

    operations = [
        # First migrate data
        migrations.RunPython(
            migrate_nomenclature_type_to_accounting_type,
            migrations.RunPython.noop,
        ),
        # Remove the index on nomenclature_type
        migrations.RemoveIndex(
            model_name='nomenclature',
            name='nomenclatur_organiz_7f1324_idx',
        ),
        # Remove the field
        migrations.RemoveField(
            model_name='nomenclature',
            name='nomenclature_type',
        ),
    ]
