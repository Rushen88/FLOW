import uuid
from django.db import models


class Batch(models.Model):
    """Партия товара (приход от поставщика)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'core.Organization', on_delete=models.CASCADE,
        related_name='batches', verbose_name='Организация',
    )
    nomenclature = models.ForeignKey(
        'nomenclature.Nomenclature', on_delete=models.PROTECT,
        related_name='batches', verbose_name='Номенклатура',
    )
    supplier = models.ForeignKey(
        'suppliers.Supplier', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='batches', verbose_name='Поставщик',
    )
    warehouse = models.ForeignKey(
        'core.Warehouse', on_delete=models.PROTECT,
        related_name='batches', verbose_name='Склад',
    )
    purchase_price = models.DecimalField(
        'Закупочная цена', max_digits=12, decimal_places=2,
    )
    quantity = models.DecimalField('Количество', max_digits=10, decimal_places=2)
    remaining = models.DecimalField('Остаток', max_digits=10, decimal_places=2)
    arrival_date = models.DateField('Дата прихода')
    expiry_date = models.DateField('Годен до', null=True, blank=True)
    invoice_number = models.CharField('Номер накладной', max_length=100, blank=True, default='')
    notes = models.TextField('Примечания', blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'batches'
        verbose_name = 'Партия'
        verbose_name_plural = 'Партии'
        ordering = ['-arrival_date']
        indexes = [
            models.Index(fields=['organization', 'warehouse', 'nomenclature', 'remaining'], name='idx_batch_fifo'),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(remaining__gte=0),
                name='batch_remaining_non_negative'
            ),
        ]

    def __str__(self):
        return f'{self.nomenclature.name} — {self.quantity} ({self.arrival_date})'


class StockBalance(models.Model):
    """Текущие остатки на складе (денормализация для быстрого доступа)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'core.Organization', on_delete=models.CASCADE,
        related_name='stock_balances', verbose_name='Организация',
    )
    warehouse = models.ForeignKey(
        'core.Warehouse', on_delete=models.PROTECT,
        related_name='stock_balances', verbose_name='Склад',
    )
    nomenclature = models.ForeignKey(
        'nomenclature.Nomenclature', on_delete=models.PROTECT,
        related_name='stock_balances', verbose_name='Номенклатура',
    )
    quantity = models.DecimalField('Количество', max_digits=10, decimal_places=2, default=0)
    avg_purchase_price = models.DecimalField(
        'Средняя закупочная', max_digits=12, decimal_places=2, default=0,
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'stock_balances'
        verbose_name = 'Остаток'
        verbose_name_plural = 'Остатки'
        constraints = [
            models.UniqueConstraint(
                fields=['organization', 'warehouse', 'nomenclature'],
                name='unique_stock_balance_per_org_warehouse_nomenclature'
            ),
        ]

    def __str__(self):
        return f'{self.nomenclature.name} @ {self.warehouse.name}: {self.quantity}'


class StockMovement(models.Model):
    """Движение товара (приход, списание, перемещение, инвентаризация)."""

    class MovementType(models.TextChoices):
        RECEIPT = 'receipt', 'Приход'
        WRITE_OFF = 'write_off', 'Списание'
        TRANSFER = 'transfer', 'Перемещение'
        SALE = 'sale', 'Продажа'
        RETURN = 'return', 'Возврат'
        ADJUSTMENT = 'adjustment', 'Корректировка'
        ASSEMBLY = 'assembly', 'Сборка букета'

    class WriteOffReason(models.TextChoices):
        EXPIRED = 'expired', 'Срок годности'
        DAMAGED = 'damaged', 'Повреждён'
        LOST = 'lost', 'Утеря'
        DEFECT = 'defect', 'Брак'
        OTHER = 'other', 'Другое'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'core.Organization', on_delete=models.CASCADE,
        related_name='stock_movements', verbose_name='Организация',
    )
    nomenclature = models.ForeignKey(
        'nomenclature.Nomenclature', on_delete=models.PROTECT,
        related_name='stock_movements', verbose_name='Номенклатура',
    )
    movement_type = models.CharField(
        'Тип движения', max_length=20, choices=MovementType.choices,
    )
    warehouse_from = models.ForeignKey(
        'core.Warehouse', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='movements_out', verbose_name='Склад-отправитель',
    )
    warehouse_to = models.ForeignKey(
        'core.Warehouse', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='movements_in', verbose_name='Склад-получатель',
    )
    batch = models.ForeignKey(
        Batch, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='movements', verbose_name='Партия',
    )
    sale = models.ForeignKey(
        'sales.Sale', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='stock_movements', verbose_name='Продажа',
    )
    quantity = models.DecimalField('Количество', max_digits=10, decimal_places=2)
    price = models.DecimalField('Цена', max_digits=12, decimal_places=2, default=0)
    write_off_reason = models.CharField(
        'Причина списания', max_length=20, choices=WriteOffReason.choices,
        blank=True, default='',
    )
    user = models.ForeignKey(
        'core.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='stock_movements', verbose_name='Пользователь',
    )
    notes = models.TextField('Примечания', blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'stock_movements'
        verbose_name = 'Движение товара'
        verbose_name_plural = 'Движения товаров'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['organization', 'movement_type', 'sale'], name='idx_movement_org_type_sale'),
            models.Index(fields=['organization', 'nomenclature', 'created_at'], name='idx_movement_org_nom_date'),
        ]

    def __str__(self):
        return f'{self.get_movement_type_display()}: {self.nomenclature.name} x{self.quantity}'


class InventoryDocument(models.Model):
    """Документ инвентаризации."""

    class Status(models.TextChoices):
        DRAFT = 'draft', 'Черновик'
        IN_PROGRESS = 'in_progress', 'В процессе'
        COMPLETED = 'completed', 'Завершена'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'core.Organization', on_delete=models.CASCADE,
        related_name='inventory_documents', verbose_name='Организация',
    )
    warehouse = models.ForeignKey(
        'core.Warehouse', on_delete=models.PROTECT,
        related_name='inventory_documents', verbose_name='Склад',
    )
    number = models.CharField('Номер', max_length=50)
    status = models.CharField(
        'Статус', max_length=20, choices=Status.choices, default=Status.DRAFT,
    )
    conducted_by = models.ForeignKey(
        'core.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='inventory_documents', verbose_name='Проводил',
    )
    notes = models.TextField('Примечания', blank=True, default='')
    started_at = models.DateTimeField('Начало', null=True, blank=True)
    completed_at = models.DateTimeField('Завершение', null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'inventory_documents'
        verbose_name = 'Инвентаризация'
        verbose_name_plural = 'Инвентаризации'

    def __str__(self):
        return f'Инвентаризация №{self.number}'


class InventoryItem(models.Model):
    """Позиция инвентаризации."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey(
        InventoryDocument, on_delete=models.CASCADE,
        related_name='items', verbose_name='Документ',
    )
    nomenclature = models.ForeignKey(
        'nomenclature.Nomenclature', on_delete=models.PROTECT,
        related_name='inventory_items', verbose_name='Номенклатура',
    )
    expected_quantity = models.DecimalField('Ожидаемое', max_digits=10, decimal_places=2)
    actual_quantity = models.DecimalField(
        'Фактическое', max_digits=10, decimal_places=2, null=True, blank=True,
    )
    difference = models.DecimalField(
        'Разница', max_digits=10, decimal_places=2, null=True, blank=True,
    )

    class Meta:
        db_table = 'inventory_items'
        verbose_name = 'Позиция инвентаризации'
        verbose_name_plural = 'Позиции инвентаризации'

    def save(self, *args, **kwargs):
        # Автовычисление разницы
        if self.actual_quantity is not None:
            self.difference = self.actual_quantity - self.expected_quantity
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.nomenclature.name}: ожид.={self.expected_quantity}'


class Reserve(models.Model):
    """Резерв товара под заказ."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'core.Organization', on_delete=models.CASCADE,
        related_name='reserves', verbose_name='Организация',
    )
    nomenclature = models.ForeignKey(
        'nomenclature.Nomenclature', on_delete=models.PROTECT,
        related_name='reserves', verbose_name='Номенклатура',
    )
    warehouse = models.ForeignKey(
        'core.Warehouse', on_delete=models.PROTECT,
        related_name='reserves', verbose_name='Склад',
    )
    order = models.ForeignKey(
        'sales.Order', on_delete=models.CASCADE,
        related_name='reserves', verbose_name='Заказ',
    )
    quantity = models.DecimalField('Количество', max_digits=10, decimal_places=2)
    is_active = models.BooleanField('Активен', default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'reserves'
        verbose_name = 'Резерв'
        verbose_name_plural = 'Резервы'

    def __str__(self):
        return f'Резерв: {self.nomenclature.name} x{self.quantity}'
