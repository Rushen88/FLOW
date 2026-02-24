import uuid
from django.db import models


class CustomerGroup(models.Model):
    """Группа/тег клиентов."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'core.Organization', on_delete=models.CASCADE,
        related_name='customer_groups', verbose_name='Организация',
    )
    name = models.CharField('Название', max_length=100)
    discount_percent = models.DecimalField(
        'Скидка %', max_digits=5, decimal_places=2, default=0,
    )
    color = models.CharField('Цвет метки', max_length=7, blank=True, default='#3B82F6')

    class Meta:
        db_table = 'customer_groups'
        verbose_name = 'Группа клиентов'
        verbose_name_plural = 'Группы клиентов'

    def __str__(self):
        return self.name


class Customer(models.Model):
    """Клиент."""

    class Gender(models.TextChoices):
        MALE = 'male', 'Мужской'
        FEMALE = 'female', 'Женский'
        UNKNOWN = 'unknown', 'Не указан'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'core.Organization', on_delete=models.CASCADE,
        related_name='customers', verbose_name='Организация',
    )
    first_name = models.CharField('Имя', max_length=150)
    last_name = models.CharField('Фамилия', max_length=150, blank=True, default='')
    patronymic = models.CharField('Отчество', max_length=150, blank=True, default='')
    phone = models.CharField('Телефон', max_length=20, blank=True, default='')
    email = models.EmailField('Email', blank=True, default='')
    gender = models.CharField(
        'Пол', max_length=10, choices=Gender.choices, default=Gender.UNKNOWN,
    )
    birth_date = models.DateField('Дата рождения', null=True, blank=True)
    groups = models.ManyToManyField(
        CustomerGroup, blank=True,
        related_name='customers', verbose_name='Группы',
    )
    discount_percent = models.DecimalField(
        'Персональная скидка %', max_digits=5, decimal_places=2, default=0,
    )
    bonus_points = models.DecimalField(
        'Бонусные баллы', max_digits=10, decimal_places=2, default=0,
    )
    total_purchases = models.DecimalField(
        'Сумма покупок', max_digits=14, decimal_places=2, default=0,
    )
    purchases_count = models.PositiveIntegerField('Кол-во покупок', default=0)
    source = models.CharField('Источник', max_length=100, blank=True, default='')
    notes = models.TextField('Заметки', blank=True, default='')
    is_active = models.BooleanField('Активен', default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'customers'
        verbose_name = 'Клиент'
        verbose_name_plural = 'Клиенты'

    def __str__(self):
        return f'{self.first_name} {self.last_name}'.strip()

    @property
    def full_name(self):
        parts = [self.last_name, self.first_name, self.patronymic]
        return ' '.join(p for p in parts if p)


class ImportantDate(models.Model):
    """Важная дата клиента."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(
        Customer, on_delete=models.CASCADE,
        related_name='important_dates', verbose_name='Клиент',
    )
    name = models.CharField('Название', max_length=255)
    date = models.DateField('Дата')
    remind_days_before = models.PositiveIntegerField('Напомнить за (дней)', default=3)
    notes = models.TextField('Заметки', blank=True, default='')

    class Meta:
        db_table = 'important_dates'
        verbose_name = 'Важная дата'
        verbose_name_plural = 'Важные даты'
        ordering = ['date']

    def __str__(self):
        return f'{self.name} ({self.date})'


class CustomerAddress(models.Model):
    """Адрес клиента."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(
        Customer, on_delete=models.CASCADE,
        related_name='addresses', verbose_name='Клиент',
    )
    label = models.CharField('Метка', max_length=100, blank=True, default='')
    address = models.TextField('Адрес')
    is_default = models.BooleanField('По умолчанию', default=False)

    class Meta:
        db_table = 'customer_addresses'
        verbose_name = 'Адрес клиента'
        verbose_name_plural = 'Адреса клиентов'

    def __str__(self):
        return f'{self.label}: {self.address[:50]}'
