from apps.core.models import SoftDeletableModel
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

    class Meta:
        db_table = 'nomenclature_groups'
        verbose_name = 'Группа номенклатуры'
        verbose_name_plural = 'Группы номенклатуры'
        ordering = ['name']

    def __str__(self):
        return self.name

    def get_descendant_count(self):
        """Подсчёт вложенных групп и позиций для подтверждения удаления."""
        child_groups = 0
        items = self.nomenclatures.filter(is_deleted=False).count()
        for child in self.children.all():
            child_groups += 1
            cg, ci = child._descendant_counts()
            child_groups += cg
            items += ci
        return child_groups, items

    def _descendant_counts(self):
        child_groups = 0
        items = self.nomenclatures.filter(is_deleted=False).count()
        for child in self.children.all():
            child_groups += 1
            cg, ci = child._descendant_counts()
            child_groups += cg
            items += ci
        return child_groups, items


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


class Nomenclature(SoftDeletableModel):
    """Номенклатура товаров."""

    class AccountingType(models.TextChoices):
        STOCK_MATERIAL = 'stock_material', 'Складской материал'
        FINISHED_BOUQUET = 'finished_bouquet', 'Готовые букеты'
        SERVICE = 'service', 'Услуги'

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
    accounting_type = models.CharField(
        'Тип учёта', max_length=20, choices=AccountingType.choices,
        default=AccountingType.STOCK_MATERIAL,
    )
    is_template_placeholder = models.BooleanField(
        'Служебная позиция шаблона', default=False, db_index=True,
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
    stem_length = models.PositiveIntegerField('Ростовка/Длина (см)', null=True, blank=True)
    diameter = models.PositiveIntegerField('Диаметр (см)', null=True, blank=True)
    country = models.CharField('Страна', max_length=100, blank=True, default='')
    default_shelf_life_days = models.PositiveIntegerField('Срок годности по умолчанию (дней)', null=True, blank=True)
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
        indexes = [
            models.Index(fields=['organization', 'is_active', 'is_deleted']),
            models.Index(fields=['organization', 'accounting_type']),
        ]

    def __str__(self):
        return self.name


class PurchasePriceHistory(models.Model):
    """История цен номенклатуры (закупочная + розничная)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nomenclature = models.ForeignKey(
        Nomenclature, on_delete=models.CASCADE,
        related_name='price_history', verbose_name='Номенклатура',
    )
    purchase_price = models.DecimalField('Закупочная цена', max_digits=12, decimal_places=2)
    retail_price = models.DecimalField('Розничная цена', max_digits=12, decimal_places=2, null=True, blank=True)
    source = models.CharField('Источник', max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'purchase_price_history'
        verbose_name = 'История закупочной цены'
        verbose_name_plural = 'История закупочных цен'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.nomenclature.name}: {self.purchase_price} ({self.created_at:%d.%m.%Y})'


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
    image = models.ImageField('Фото шаблона', upload_to='bouquet_templates/', blank=True, null=True)
    assembly_time_minutes = models.PositiveIntegerField('Время сборки (мин)', default=15)
    difficulty = models.PositiveSmallIntegerField('Сложность (1-5)', default=3)
    description = models.TextField('Описание сборки', blank=True, default='')

    class Meta:
        db_table = 'bouquet_templates'
        verbose_name = 'Шаблон букета'
        verbose_name_plural = 'Шаблоны букетов'

    def __str__(self):
        return f'Шаблон: {self.nomenclature.name}'

    def delete(self, *args, **kwargs):
        # Удаляем фото шаблона при удалении
        linked_nomenclature = self.nomenclature
        if self.image:
            self.image.delete(save=False)
        super().delete(*args, **kwargs)
        if linked_nomenclature and linked_nomenclature.is_template_placeholder:
            linked_nomenclature.delete()


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
