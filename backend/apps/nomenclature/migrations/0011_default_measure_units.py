"""
Создание базовых единиц измерения для цветочного бизнеса.
"""
from django.db import migrations


def create_default_units(apps, schema_editor):
    MeasureUnit = apps.get_model('nomenclature', 'MeasureUnit')
    defaults = [
        # Базовые
        ('Штука', 'шт.'),
        ('Килограмм', 'кг'),
        ('Грамм', 'г'),
        ('Литр', 'л'),
        ('Метр', 'м'),
        ('Сантиметр', 'см'),
        # Упаковки
        ('Упаковка', 'уп.'),
        ('Коробка', 'кор.'),
        ('Пачка', 'пач.'),
        ('Связка', 'св.'),
        ('Пучок', 'пуч.'),
        ('Бухта', 'бух.'),
        # Специфика флористики
        ('Букет', 'бук.'),
        ('Композиция', 'комп.'),
        ('Комплект', 'компл.'),
        ('Рулон', 'рул.'),
        ('Лист', 'лист'),
        ('Горшок', 'горш.'),
        # Услуги
        ('Услуга', 'усл.'),
        ('Час', 'час'),
    ]
    
    existing = set(MeasureUnit.objects.values_list('short_name', flat=True))
    for name, short in defaults:
        if short not in existing:
            MeasureUnit.objects.create(name=name, short_name=short)


def reverse_units(apps, schema_editor):
    # При откате ничего не делаем - единицы измерения могут быть уже связаны
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('nomenclature', '0010_purchasepricehistory_bouquettemplate_image_and_more'),
    ]

    operations = [
        migrations.RunPython(create_default_units, reverse_units),
    ]
