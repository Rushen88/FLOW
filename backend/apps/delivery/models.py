import uuid
from django.db import models


class DeliveryZone(models.Model):
    """Зона доставки."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'core.Organization', on_delete=models.CASCADE,
        related_name='delivery_zones', verbose_name='Организация',
    )
    name = models.CharField('Название', max_length=255)
    price = models.DecimalField('Стоимость', max_digits=10, decimal_places=2, default=0)
    free_from = models.DecimalField(
        'Бесплатно от (сумма заказа)', max_digits=12, decimal_places=2,
        null=True, blank=True,
    )
    estimated_minutes = models.PositiveIntegerField('Время доставки (мин)', default=60)
    description = models.TextField('Описание', blank=True, default='')
    is_active = models.BooleanField('Активна', default=True)

    class Meta:
        db_table = 'delivery_zones'
        verbose_name = 'Зона доставки'
        verbose_name_plural = 'Зоны доставки'

    def __str__(self):
        return self.name


class Courier(models.Model):
    """Курьер."""

    class CourierType(models.TextChoices):
        INTERNAL = 'internal', 'Штатный'
        EXTERNAL = 'external', 'Внешний'
        SERVICE = 'service', 'Курьерская служба'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'core.Organization', on_delete=models.CASCADE,
        related_name='couriers', verbose_name='Организация',
    )
    employee = models.ForeignKey(
        'staff.Employee', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='courier_profile', verbose_name='Сотрудник',
    )
    name = models.CharField('Имя', max_length=255)
    phone = models.CharField('Телефон', max_length=20, blank=True, default='')
    courier_type = models.CharField(
        'Тип', max_length=20, choices=CourierType.choices, default=CourierType.INTERNAL,
    )
    vehicle = models.CharField('Транспорт', max_length=100, blank=True, default='')
    delivery_rate = models.DecimalField(
        'Ставка за доставку', max_digits=10, decimal_places=2, default=0,
    )
    is_available = models.BooleanField('Доступен', default=True)
    is_active = models.BooleanField('Активен', default=True)

    class Meta:
        db_table = 'couriers'
        verbose_name = 'Курьер'
        verbose_name_plural = 'Курьеры'

    def __str__(self):
        return self.name


class Delivery(models.Model):
    """Доставка заказа."""

    class Status(models.TextChoices):
        PENDING = 'pending', 'Ожидает'
        ASSIGNED = 'assigned', 'Назначена'
        PICKED_UP = 'picked_up', 'Забрана'
        IN_TRANSIT = 'in_transit', 'В пути'
        DELIVERED = 'delivered', 'Доставлена'
        FAILED = 'failed', 'Не доставлена'
        CANCELLED = 'cancelled', 'Отменена'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'core.Organization', on_delete=models.CASCADE,
        related_name='deliveries', verbose_name='Организация',
    )
    order = models.OneToOneField(
        'sales.Order', on_delete=models.CASCADE,
        related_name='delivery', verbose_name='Заказ',
    )
    courier = models.ForeignKey(
        Courier, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='deliveries', verbose_name='Курьер',
    )
    zone = models.ForeignKey(
        DeliveryZone, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='deliveries', verbose_name='Зона',
    )
    status = models.CharField(
        'Статус', max_length=20, choices=Status.choices, default=Status.PENDING,
    )
    address = models.TextField('Адрес')
    recipient_name = models.CharField('Получатель', max_length=255, blank=True, default='')
    recipient_phone = models.CharField('Телефон получателя', max_length=20, blank=True, default='')
    delivery_date = models.DateField('Дата доставки')
    time_from = models.TimeField('С', null=True, blank=True)
    time_to = models.TimeField('До', null=True, blank=True)
    actual_delivery_time = models.DateTimeField('Фактическое время', null=True, blank=True)
    cost = models.DecimalField('Стоимость', max_digits=10, decimal_places=2, default=0)
    courier_payment = models.DecimalField(
        'Оплата курьеру', max_digits=10, decimal_places=2, default=0,
    )
    photo_proof = models.ImageField('Фото доставки', upload_to='deliveries/', blank=True, null=True)
    notes = models.TextField('Примечания', blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'deliveries'
        verbose_name = 'Доставка'
        verbose_name_plural = 'Доставки'
        ordering = ['-delivery_date']

    def __str__(self):
        return f'Доставка #{self.order.number}'
