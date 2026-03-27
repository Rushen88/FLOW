from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0008_bouquetbatchcomponentsnapshot_receiptdocument_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='batch',
            name='image',
            field=models.ImageField(blank=True, null=True, upload_to='bouquet_batches/', verbose_name='Фото витринного букета'),
        ),
    ]