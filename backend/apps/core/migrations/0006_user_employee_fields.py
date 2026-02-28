"""
Add employee fields to User (position, trading_point, hire_date, fire_date, notes).
Schema was already applied in staff.0002, this aligns Django state.
"""
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0005_add_active_trading_point'),
        ('staff', '0003_post_merge_state'),
    ]

    operations = [
        # Schema was already applied in staff.0002 via RunSQL. State-only.
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='user',
                    name='position',
                    field=models.ForeignKey(
                        blank=True, null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name='employees',
                        to='staff.position',
                        verbose_name='Должность',
                    ),
                ),
                migrations.AddField(
                    model_name='user',
                    name='trading_point',
                    field=models.ForeignKey(
                        blank=True,
                        help_text='Закреплённая торговая точка сотрудника.',
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name='employees',
                        to='core.tradingpoint',
                        verbose_name='Торговая точка',
                    ),
                ),
                migrations.AddField(
                    model_name='user',
                    name='hire_date',
                    field=models.DateField(blank=True, null=True, verbose_name='Дата приёма'),
                ),
                migrations.AddField(
                    model_name='user',
                    name='fire_date',
                    field=models.DateField(blank=True, null=True, verbose_name='Дата увольнения'),
                ),
                migrations.AddField(
                    model_name='user',
                    name='notes',
                    field=models.TextField(blank=True, default='', verbose_name='Примечания'),
                ),
                migrations.AlterModelOptions(
                    name='user',
                    options={'verbose_name': 'Сотрудник', 'verbose_name_plural': 'Сотрудники'},
                ),
            ],
            database_operations=[],
        ),
    ]
