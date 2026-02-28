"""
Post-merge state alignment.

This migration declares the final model state after the Employee→User merge
so that Django's migration framework recognises the current schema.
"""
import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('staff', '0002_merge_employee_into_user'),
    ]

    operations = [
        # All schema changes were already applied in 0002 via RunSQL.
        # This migration only updates Django's internal state.
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AlterField(
                    model_name='payrollscheme',
                    name='employee',
                    field=models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='payroll_schemes',
                        to=settings.AUTH_USER_MODEL,
                        verbose_name='Сотрудник',
                    ),
                ),
                migrations.AlterField(
                    model_name='shift',
                    name='employee',
                    field=models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='shifts',
                        to=settings.AUTH_USER_MODEL,
                        verbose_name='Сотрудник',
                    ),
                ),
                migrations.AlterField(
                    model_name='salaryaccrual',
                    name='employee',
                    field=models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='salary_accruals',
                        to=settings.AUTH_USER_MODEL,
                        verbose_name='Сотрудник',
                    ),
                ),
            ],
            database_operations=[],
        ),
    ]
