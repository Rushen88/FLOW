import uuid
from django.db import models
from django.core.validators import MinValueValidator
from decimal import Decimal


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
    receipt_document = models.ForeignKey(
        'inventory.ReceiptDocument', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='batches', verbose_name='Документ поступления',
    )
    purchase_price = models.DecimalField(
        'Закупочная цена', max_digits=12, decimal_places=2,
    )
    quantity = models.DecimalField('Количество', max_digits=10, decimal_places=2)
    remaining = models.DecimalField('Остаток', max_digits=10, decimal_places=2)
    arrival_date = models.DateField('Дата прихода')
    expiry_date = models.DateField('Годен до', null=True, blank=True)
    invoice_number = models.CharField('Номер накладной', max_length=100, blank=True, default='')
    is_assembly = models.BooleanField('Сборка букета', default=False)
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

    def save(self, *args, **kwargs):
        if not self.expiry_date and self.nomenclature.default_shelf_life_days:
            from datetime import timedelta
            self.expiry_date = self.arrival_date + timedelta(days=self.nomenclature.default_shelf_life_days)
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.nomenclature.name} — {self.quantity} ({self.arrival_date})'


class ReceiptDocument(models.Model):
    """Документ поступления."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'core.Organization', on_delete=models.CASCADE,
        related_name='receipt_documents', verbose_name='Организация',
    )
    number = models.PositiveIntegerField('Номер поступления')
    date = models.DateField('Дата поступления')
    supplier = models.ForeignKey(
        'suppliers.Supplier', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='receipt_documents', verbose_name='Поставщик',
    )
    comment = models.TextField('Комментарий', blank=True, default='')
    total_cost = models.DecimalField(
        'Общая стоимость', max_digits=14, decimal_places=2, default=0,
    )
    created_by = models.ForeignKey(
        'core.User', on_delete=models.SET_NULL, null=True, blank=True,
        verbose_name='Создал',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'receipt_documents'
        verbose_name = 'Документ поступления'
        verbose_name_plural = 'Документы поступлений'
        ordering = ['-date', '-number']
        constraints = [
            models.UniqueConstraint(
                fields=['organization', 'number'],
                name='unique_receipt_number_per_org',
            ),
        ]

    def __str__(self):
        return f'Поступление №{self.number} от {self.date}'


class ReceiptDocumentItem(models.Model):
    """Строка документа поступления."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey(
        ReceiptDocument, on_delete=models.CASCADE,
        related_name='items', verbose_name='Документ',
    )
    nomenclature = models.ForeignKey(
        'nomenclature.Nomenclature', on_delete=models.PROTECT,
        related_name='receipt_items', verbose_name='Номенклатура',
    )
    warehouse = models.ForeignKey(
        'core.Warehouse', on_delete=models.PROTECT,
        related_name='receipt_items', verbose_name='Склад',
    )
    quantity = models.DecimalField('Количество', max_digits=10, decimal_places=2)
    purchase_price = models.DecimalField('Закупочная цена', max_digits=12, decimal_places=2)
    retail_price = models.DecimalField(
        'Цена продажи', max_digits=12, decimal_places=2, null=True, blank=True,
    )
    total = models.DecimalField('Стоимость итого', max_digits=14, decimal_places=2, default=0)
    batch = models.ForeignKey(
        Batch, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='receipt_document_items', verbose_name='Партия',
    )

    class Meta:
        db_table = 'receipt_document_items'
        verbose_name = 'Строка документа поступления'
        verbose_name_plural = 'Строки документов поступлений'
        ordering = ['id']

    def __str__(self):
        return f'{self.nomenclature.name} x{self.quantity}'


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
        ordering = ['warehouse', 'nomenclature']
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
        ordering = ['-created_at']

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
    """Резерв готового букета для клиента (кассовый сценарий)."""

    class Status(models.TextChoices):
        ACTIVE = 'active', 'Активен'
        SOLD = 'sold', 'Продан'
        EXPIRED = 'expired', 'Просрочен'
        CANCELLED = 'cancelled', 'Отменён'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'core.Organization', on_delete=models.CASCADE,
        related_name='reserves', verbose_name='Организация',
    )
    trading_point = models.ForeignKey(
        'core.TradingPoint', on_delete=models.PROTECT,
        related_name='reserves', verbose_name='Торговая точка',
        null=True, blank=True,
    )
    reserve_number = models.PositiveIntegerField('Номер резерва', null=True, blank=True)
    customer = models.ForeignKey(
        'customers.Customer', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='reserves', verbose_name='Клиент',
    )
    customer_name_snapshot = models.CharField('Имя клиента', max_length=255, blank=True, default='')
    phone = models.CharField('Телефон', max_length=20, blank=True, default='')
    phone_normalized = models.CharField('Телефон (нормализованный)', max_length=20, blank=True, default='')
    phone_last4 = models.CharField('Последние 4 цифры', max_length=4, blank=True, default='')
    expires_at = models.DateTimeField('Срок резерва', null=True, blank=True)
    comment = models.TextField('Комментарий', blank=True, default='')
    order = models.ForeignKey(
        'sales.Order', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='reserves', verbose_name='Заказ',
    )
    bouquet_nomenclature = models.ForeignKey(
        'nomenclature.Nomenclature', on_delete=models.PROTECT,
        related_name='reserves', verbose_name='Номенклатура букета',
        null=True, blank=True,
    )
    batch = models.ForeignKey(
        Batch, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='reserves', verbose_name='Партия',
    )
    warehouse = models.ForeignKey(
        'core.Warehouse', on_delete=models.PROTECT,
        related_name='reserves', verbose_name='Склад',
    )
    quantity = models.DecimalField('Количество', max_digits=10, decimal_places=2, default=1)
    status = models.CharField(
        'Статус', max_length=20, choices=Status.choices, default=Status.ACTIVE,
    )
    sold_sale = models.ForeignKey(
        'sales.Sale', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='sold_reserves', verbose_name='Продажа',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    sold_at = models.DateTimeField('Продано', null=True, blank=True)
    cancelled_at = models.DateTimeField('Отменено', null=True, blank=True)

    class Meta:
        db_table = 'reserves'
        verbose_name = 'Резерв'
        verbose_name_plural = 'Резервы'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['phone_last4'], name='idx_reserve_phone_last4'),
            models.Index(fields=['organization', 'status'], name='idx_reserve_org_status'),
        ]

    def __str__(self):
        return f'Резерв #{self.reserve_number}: {self.bouquet_nomenclature or "?"} x{self.quantity}'


class BouquetBatchComponentSnapshot(models.Model):
    """Снимок состава партии готового букета (неизменяемый после создания)."""

    class SourceMode(models.TextChoices):
        TEMPLATE = 'template', 'Из шаблона'
        MANUAL = 'manual', 'Ручная сборка'
        CORRECTION = 'correction', 'Коррекция'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    batch = models.ForeignKey(
        Batch, on_delete=models.CASCADE,
        related_name='component_snapshots', verbose_name='Партия букета',
    )
    nomenclature = models.ForeignKey(
        'nomenclature.Nomenclature', on_delete=models.PROTECT,
        related_name='+', verbose_name='Номенклатура компонента',
    )
    accounting_type = models.CharField(
        'Тип учёта', max_length=20, blank=True, default='stock_material',
    )
    quantity_per_unit = models.DecimalField(
        'Кол-во на 1 букет', max_digits=10, decimal_places=2,
    )
    price_per_unit = models.DecimalField(
        'Цена за ед.', max_digits=12, decimal_places=2, default=0,
    )
    sort_order = models.PositiveIntegerField('Порядок', default=0)
    source_mode = models.CharField(
        'Источник', max_length=20, choices=SourceMode.choices,
        default=SourceMode.TEMPLATE,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'bouquet_batch_component_snapshots'
        verbose_name = 'Снимок состава букета'
        verbose_name_plural = 'Снимки составов букетов'
        ordering = ['sort_order', 'id']

    def __str__(self):
        return f'{self.nomenclature.name} x{self.quantity_per_unit} (batch={self.batch_id})'
