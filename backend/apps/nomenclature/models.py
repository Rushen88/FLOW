import uuid
from django.db import models


class NomenclatureGroup(models.Model):
    """Группа номенклатуры (Цветы, Упаковка, Аксессуары и т.д.)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'core.Organization', on_delete=models.CASCADE,
        related_name='nomenclature_groups', verbose_name='Организация',
    )
    name = models.CharField('Название', max_length=255)
    parent = models.ForeignKey(
        'self', on_delete=models.CASCADE, null=True, blank=True,
        related_name='children', verbose_name='Родительская группа',
    )
    sort_order = models.PositiveIntegerField('Порядок', default=0)

    class Meta:
        db_table = 'nomenclature_groups'
        verbose_name = 'Группа номенклатуры'
        verbose_name_plural = 'Группы номенклатуры'
        ordering = ['sort_order', 'name']

    def __str__(self):
        return self.name


class MeasureUnit(models.Model):
    """Единица измерения."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField('Название', max_length=50)
    short_name = models.CharField('Сокращение', max_length=10)

    class Meta:
        db_table = 'measure_units'
        verbose_name = 'Единица измерения'
        verbose_name_plural = 'Единицы измерения'

    def __str__(self):
        return self.short_name


class Nomenclature(models.Model):
    """Номенклатура товаров."""

    class NomenclatureType(models.TextChoices):
        SINGLE_FLOWER = 'single_flower', 'Штучный цветок'
        BOUQUET = 'bouquet', 'Готовый букет'
        COMPOSITION = 'composition', 'Композиция'
        PACKAGING = 'packaging', 'Упаковка'
        ACCESSORY = 'accessory', 'Аксессуар'
        RIBBON = 'ribbon', 'Лента'
        TOY = 'toy', 'Игрушка'
        POSTCARD = 'postcard', 'Открытка'
        EXTRA_GOOD = 'extra_good', 'Сопутствующий товар'
        BALLOON = 'balloon', 'Воздушный шар'
        POT_PLANT = 'pot_plant', 'Горшечное растение'
        SERVICE = 'service', 'Услуга'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'core.Organization', on_delete=models.CASCADE,
        related_name='nomenclatures', verbose_name='Организация',
    )
    group = models.ForeignKey(
        NomenclatureGroup, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='nomenclatures', verbose_name='Группа',
    )
    name = models.CharField('Название', max_length=500)
    nomenclature_type = models.CharField(
        'Тип', max_length=20, choices=NomenclatureType.choices,
        default=NomenclatureType.SINGLE_FLOWER,
    )
    sku = models.CharField('Артикул', max_length=50, blank=True, default='')
    barcode = models.CharField('Штрихкод', max_length=50, blank=True, default='')
    unit = models.ForeignKey(
        MeasureUnit, on_delete=models.SET_NULL, null=True, blank=True,
        verbose_name='Ед. изм.',
    )
    purchase_price = models.DecimalField(
        'Закупочная цена', max_digits=12, decimal_places=2, default=0,
    )
    retail_price = models.DecimalField(
        'Розничная цена', max_digits=12, decimal_places=2, default=0,
    )
    min_price = models.DecimalField(
        'Минимальная цена', max_digits=12, decimal_places=2, default=0,
    )
    markup_percent = models.DecimalField(
        'Наценка %', max_digits=6, decimal_places=2, default=0,
    )
    image = models.ImageField('Фото', upload_to='nomenclature/', blank=True, null=True)
    color = models.CharField('Цвет', max_length=50, blank=True, default='')
    country = models.CharField('Страна', max_length=100, blank=True, default='')
    shelf_life_days = models.PositiveIntegerField('Срок годности (дней)', null=True, blank=True)
    min_stock = models.DecimalField(
        'Мин. остаток', max_digits=10, decimal_places=2, default=0,
    )
    is_active = models.BooleanField('Активна', default=True)
    notes = models.TextField('Описание', blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'nomenclatures'
        verbose_name = 'Номенклатура'
        verbose_name_plural = 'Номенклатура'

    def __str__(self):
        return self.name


class BouquetTemplate(models.Model):
    """Шаблон букета / композиции — содержит рецептуру."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'core.Organization', on_delete=models.CASCADE,
        related_name='bouquet_templates', verbose_name='Организация',
        null=True, blank=True,
    )
    nomenclature = models.OneToOneField(
        Nomenclature, on_delete=models.CASCADE,
        related_name='bouquet_template', verbose_name='Номенклатура',
    )
    bouquet_name = models.CharField('Название букета', max_length=500, blank=True, default='')
    assembly_time_minutes = models.PositiveIntegerField('Время сборки (мин)', default=15)
    difficulty = models.PositiveSmallIntegerField('Сложность (1-5)', default=3)
    description = models.TextField('Описание сборки', blank=True, default='')

    class Meta:
        db_table = 'bouquet_templates'
        verbose_name = 'Шаблон букета'
        verbose_name_plural = 'Шаблоны букетов'

    def __str__(self):
        return f'Шаблон: {self.nomenclature.name}'


class BouquetComponent(models.Model):
    """Компонент букета (ингредиент рецептуры)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    template = models.ForeignKey(
        BouquetTemplate, on_delete=models.CASCADE,
        related_name='components', verbose_name='Шаблон букета',
    )
    nomenclature = models.ForeignKey(
        Nomenclature, on_delete=models.CASCADE,
        related_name='used_in_bouquets', verbose_name='Материал',
    )
    quantity = models.DecimalField('Количество', max_digits=10, decimal_places=2)
    is_required = models.BooleanField('Обязательный', default=True)
    substitute = models.ForeignKey(
        Nomenclature, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='substitute_in_bouquets', verbose_name='Замена',
    )

    class Meta:
        db_table = 'bouquet_components'
        verbose_name = 'Компонент букета'
        verbose_name_plural = 'Компоненты букетов'

    def __str__(self):
        return f'{self.nomenclature.name} x{self.quantity}'
