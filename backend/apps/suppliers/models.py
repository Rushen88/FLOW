import uuid
from django.db import models


class Supplier(models.Model):
    """Поставщик."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'core.Organization', on_delete=models.CASCADE,
        related_name='suppliers', verbose_name='Организация',
    )
    name = models.CharField('Название', max_length=255)
    contact_person = models.CharField('Контактное лицо', max_length=255, blank=True, default='')
    phone = models.CharField('Телефон', max_length=20, blank=True, default='')
    email = models.EmailField('Email', blank=True, default='')
    address = models.TextField('Адрес', blank=True, default='')
    inn = models.CharField('ИНН', max_length=12, blank=True, default='')
    payment_terms = models.CharField('Условия оплаты', max_length=255, blank=True, default='')
    delivery_days = models.PositiveIntegerField('Срок доставки (дней)', null=True, blank=True)
    min_order_amount = models.DecimalField(
        'Мин. сумма заказа', max_digits=12, decimal_places=2, default=0,
    )
    rating = models.PositiveSmallIntegerField('Рейтинг (1-5)', default=3)
    notes = models.TextField('Примечания', blank=True, default='')
    is_active = models.BooleanField('Активен', default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'suppliers'
        verbose_name = 'Поставщик'
        verbose_name_plural = 'Поставщики'

    def __str__(self):
        return self.name


class SupplierNomenclature(models.Model):
    """Товар поставщика с его ценой."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    supplier = models.ForeignKey(
        Supplier, on_delete=models.CASCADE,
        related_name='nomenclatures', verbose_name='Поставщик',
    )
    nomenclature = models.ForeignKey(
        'nomenclature.Nomenclature', on_delete=models.CASCADE,
        related_name='supplier_prices', verbose_name='Номенклатура',
    )
    supplier_sku = models.CharField('Артикул поставщика', max_length=50, blank=True, default='')
    price = models.DecimalField('Цена', max_digits=12, decimal_places=2)
    min_quantity = models.DecimalField('Мин. кол-во', max_digits=10, decimal_places=2, default=1)
    is_available = models.BooleanField('В наличии', default=True)

    class Meta:
        db_table = 'supplier_nomenclatures'
        verbose_name = 'Товар поставщика'
        verbose_name_plural = 'Товары поставщиков'
        unique_together = ['supplier', 'nomenclature']

    def __str__(self):
        return f'{self.supplier.name} → {self.nomenclature.name}'


class SupplierOrder(models.Model):
    """Заказ поставщику."""

    class Status(models.TextChoices):
        DRAFT = 'draft', 'Черновик'
        SENT = 'sent', 'Отправлен'
        CONFIRMED = 'confirmed', 'Подтверждён'
        SHIPPED = 'shipped', 'Отгружен'
        RECEIVED = 'received', 'Получен'
        CANCELLED = 'cancelled', 'Отменён'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'core.Organization', on_delete=models.CASCADE,
        related_name='supplier_orders', verbose_name='Организация',
    )
    supplier = models.ForeignKey(
        Supplier, on_delete=models.CASCADE,
        related_name='orders', verbose_name='Поставщик',
    )
    number = models.CharField('Номер', max_length=50, blank=True, default='')
    status = models.CharField(
        'Статус', max_length=20, choices=Status.choices, default=Status.DRAFT,
    )
    total = models.DecimalField('Сумма', max_digits=12, decimal_places=2, default=0)
    expected_date = models.DateField('Ожидаемая дата', null=True, blank=True)
    notes = models.TextField('Примечания', blank=True, default='')
    created_by = models.ForeignKey(
        'core.User', on_delete=models.SET_NULL, null=True, blank=True,
        verbose_name='Создал',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'supplier_orders'
        verbose_name = 'Заказ поставщику'
        verbose_name_plural = 'Заказы поставщикам'
        ordering = ['-created_at']

    def __str__(self):
        return f'Заказ #{self.number} — {self.supplier.name}'


class SupplierOrderItem(models.Model):
    """Позиция заказа поставщику."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(
        SupplierOrder, on_delete=models.CASCADE,
        related_name='items', verbose_name='Заказ',
    )
    nomenclature = models.ForeignKey(
        'nomenclature.Nomenclature', on_delete=models.CASCADE,
        verbose_name='Номенклатура',
    )
    quantity = models.DecimalField('Количество', max_digits=10, decimal_places=2)
    price = models.DecimalField('Цена', max_digits=12, decimal_places=2)
    received_quantity = models.DecimalField(
        'Получено', max_digits=10, decimal_places=2, default=0,
    )

    class Meta:
        db_table = 'supplier_order_items'
        verbose_name = 'Позиция заказа поставщику'
        verbose_name_plural = 'Позиции заказов поставщикам'


class Claim(models.Model):
    """Претензия к поставщику."""

    class Status(models.TextChoices):
        OPEN = 'open', 'Открыта'
        IN_PROGRESS = 'in_progress', 'В работе'
        RESOLVED = 'resolved', 'Решена'
        REJECTED = 'rejected', 'Отклонена'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'core.Organization', on_delete=models.CASCADE,
        related_name='claims', verbose_name='Организация',
    )
    supplier = models.ForeignKey(
        Supplier, on_delete=models.CASCADE,
        related_name='claims', verbose_name='Поставщик',
    )
    batch = models.ForeignKey(
        'inventory.Batch', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='claims', verbose_name='Партия',
    )
    status = models.CharField(
        'Статус', max_length=20, choices=Status.choices, default=Status.OPEN,
    )
    description = models.TextField('Описание')
    amount = models.DecimalField(
        'Сумма претензии', max_digits=12, decimal_places=2, default=0,
    )
    resolved_amount = models.DecimalField(
        'Компенсация', max_digits=12, decimal_places=2, default=0,
    )
    photos = models.JSONField('Фотографии', default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField('Дата решения', null=True, blank=True)

    class Meta:
        db_table = 'claims'
        verbose_name = 'Претензия'
        verbose_name_plural = 'Претензии'
        ordering = ['-created_at']

    def __str__(self):
        return f'Претензия к {self.supplier.name}'
