from django.db import migrations, models

class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0008_finance_indexes'),
    ]

    operations = [
        migrations.AddConstraint(
            model_name='wallet',
            constraint=models.CheckConstraint(
                condition=models.Q(('balance__gte', 0), ('allow_negative', True), _connector='OR'),
                name='wallet_balance_positive_or_allowed',
            ),
        ),
    ]
