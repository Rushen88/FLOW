from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0005_cashshift'),
    ]

    operations = [
        migrations.AddConstraint(
            model_name='cashshift',
            constraint=models.UniqueConstraint(
                condition=models.Q(('status', 'open')),
                fields=['wallet'],
                name='unique_open_shift_per_wallet',
            ),
        ),
    ]
