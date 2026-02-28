"""
Delete the old Employee model from state, now that all other apps
have repointed their FKs to core.User.
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('staff', '0003_post_merge_state'),
        ('delivery', '0004_courier_employee_to_user'),
        ('finance', '0004_transaction_employee_to_user'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.DeleteModel(name='Employee'),
            ],
            database_operations=[],
        ),
    ]