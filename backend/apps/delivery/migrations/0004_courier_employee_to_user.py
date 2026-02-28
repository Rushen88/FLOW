"""
Align Courier.employee FK to point to core.User (schema applied in staff.0002).
"""
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('delivery', '0003_initial'),
        ('staff', '0003_post_merge_state'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # Schema was already applied in staff.0002 via RunSQL. State-only.
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AlterField(
                    model_name='courier',
                    name='employee',
                    field=models.ForeignKey(
                        blank=True, null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name='courier_profile',
                        to=settings.AUTH_USER_MODEL,
                        verbose_name='Сотрудник',
                    ),
                ),
            ],
            database_operations=[],
        ),
    ]
