import uuid
from django.db import models
from django.contrib.auth.models import AbstractUser


class Organization(models.Model):
    """Организация (тенант SaaS)."""

    class SubscriptionPlan(models.TextChoices):
        FREE = 'free', 'Бесплатный'
        BASIC = 'basic', 'Базовый'
        PRO = 'pro', 'Профессиональный'
        ENTERPRISE = 'enterprise', 'Корпоративный'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField('Название', max_length=255)
    inn = models.CharField('ИНН', max_length=12, blank=True, default='')
    phone = models.CharField('Телефон', max_length=20, blank=True, default='')
    email = models.EmailField('Email', blank=True, default='')
    # Billing / SaaS
    is_active = models.BooleanField('Активна', default=True)
    subscription_plan = models.CharField(
        'Тарифный план', max_length=20,
        choices=SubscriptionPlan.choices, default=SubscriptionPlan.FREE,
    )
    monthly_price = models.DecimalField(
        'Ежемесячная плата', max_digits=10, decimal_places=2, default=0,
    )
    paid_until = models.DateField('Оплачено до', null=True, blank=True)
    max_users = models.PositiveIntegerField('Макс. пользователей', default=5)
    notes = models.TextField('Заметки администратора', blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'organizations'
        verbose_name = 'Организация'
        verbose_name_plural = 'Организации'

    def __str__(self):
        return self.name


class User(AbstractUser):
    """Пользователь системы."""

    class Role(models.TextChoices):
        OWNER = 'owner', 'Владелец'
        ADMIN = 'admin', 'Администратор'
        MANAGER = 'manager', 'Менеджер'
        SELLER = 'seller', 'Продавец'
        COURIER = 'courier', 'Курьер'
        ACCOUNTANT = 'accountant', 'Бухгалтер'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE,
        related_name='users', null=True, blank=True,
        verbose_name='Организация',
    )
    active_organization = models.ForeignKey(
        Organization, on_delete=models.SET_NULL,
        related_name='active_users', null=True, blank=True,
        verbose_name='Активная организация',
        help_text='Для суперадминов: организация, от имени которой ведётся работа.',
    )
    role = models.CharField('Роль', max_length=20, choices=Role.choices, default=Role.SELLER)
    patronymic = models.CharField('Отчество', max_length=150, blank=True, default='')
    phone = models.CharField('Телефон', max_length=20, blank=True, default='')
    avatar = models.ImageField('Аватар', upload_to='avatars/', blank=True, null=True)

    class Meta:
        db_table = 'users'
        verbose_name = 'Пользователь'
        verbose_name_plural = 'Пользователи'

    def __str__(self):
        return self.get_full_name() or self.username


class TradingPoint(models.Model):
    """Торговая точка."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE,
        related_name='trading_points', verbose_name='Организация',
    )
    name = models.CharField('Название', max_length=255)
    address = models.CharField('Адрес', max_length=500, blank=True, default='')
    phone = models.CharField('Телефон', max_length=20, blank=True, default='')
    work_schedule = models.CharField('Режим работы', max_length=255, blank=True, default='')
    manager = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='managed_points', verbose_name='Руководитель',
    )
    is_active = models.BooleanField('Активна', default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'trading_points'
        verbose_name = 'Торговая точка'
        verbose_name_plural = 'Торговые точки'

    def __str__(self):
        return self.name


class Warehouse(models.Model):
    """Склад."""

    class WarehouseType(models.TextChoices):
        MAIN = 'main', 'Основной'
        SHOWCASE = 'showcase', 'Витрина'
        FRIDGE = 'fridge', 'Холодильник'
        ASSEMBLY = 'assembly', 'Зона комплектации'
        RESERVE = 'reserve', 'Резервный'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE,
        related_name='warehouses', verbose_name='Организация',
    )
    trading_point = models.ForeignKey(
        TradingPoint, on_delete=models.CASCADE,
        related_name='warehouses', verbose_name='Торговая точка',
    )
    name = models.CharField('Название', max_length=255)
    warehouse_type = models.CharField(
        'Тип', max_length=20, choices=WarehouseType.choices, default=WarehouseType.MAIN,
    )
    responsible = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='responsible_warehouses', verbose_name='Ответственный',
    )
    is_default_for_bouquets = models.BooleanField('По умолчанию для букетов', default=False)
    is_default_for_receiving = models.BooleanField('По умолчанию для прихода', default=False)
    notes = models.TextField('Примечания', blank=True, default='')
    is_active = models.BooleanField('Активен', default=True)

    class Meta:
        db_table = 'warehouses'
        verbose_name = 'Склад'
        verbose_name_plural = 'Склады'

    def __str__(self):
        return f'{self.name} ({self.trading_point.name})'


class PaymentMethod(models.Model):
    """Способ оплаты."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE,
        related_name='payment_methods', verbose_name='Организация',
    )
    name = models.CharField('Название', max_length=100)
    is_cash = models.BooleanField('Наличный', default=True)
    commission_percent = models.DecimalField(
        'Комиссия %', max_digits=5, decimal_places=2, default=0,
    )
    is_active = models.BooleanField('Активен', default=True)

    class Meta:
        db_table = 'payment_methods'
        verbose_name = 'Способ оплаты'
        verbose_name_plural = 'Способы оплаты'

    def __str__(self):
        return self.name


# ─── Platform admin models ────────────────────────────────────


class TenantContact(models.Model):
    """Контактное лицо тенанта (клиента платформы)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE,
        related_name='contacts', verbose_name='Организация',
    )
    name = models.CharField('ФИО', max_length=255)
    position = models.CharField('Должность', max_length=255, blank=True, default='')
    phone = models.CharField('Телефон', max_length=20, blank=True, default='')
    email = models.EmailField('Email', blank=True, default='')
    is_primary = models.BooleanField('Основной контакт', default=False)
    notes = models.TextField('Примечания', blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'tenant_contacts'
        verbose_name = 'Контактное лицо тенанта'
        verbose_name_plural = 'Контактные лица тенантов'
        ordering = ['-is_primary', 'name']

    def __str__(self):
        return f'{self.name} ({self.organization.name})'


class TenantPayment(models.Model):
    """Оплата тенанта за SaaS-подписку."""

    class PayMethod(models.TextChoices):
        BANK_TRANSFER = 'bank_transfer', 'Банковский перевод'
        CARD = 'card', 'Банковская карта'
        CASH = 'cash', 'Наличные'
        OTHER = 'other', 'Другое'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE,
        related_name='payments', verbose_name='Организация',
    )
    amount = models.DecimalField('Сумма', max_digits=12, decimal_places=2)
    payment_date = models.DateField('Дата оплаты')
    period_from = models.DateField('Период с')
    period_to = models.DateField('Период по')
    payment_method = models.CharField(
        'Способ оплаты', max_length=20,
        choices=PayMethod.choices, default=PayMethod.BANK_TRANSFER,
    )
    invoice_number = models.CharField('Номер счёта', max_length=100, blank=True, default='')
    notes = models.TextField('Примечания', blank=True, default='')
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='recorded_tenant_payments', verbose_name='Записал',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'tenant_payments'
        verbose_name = 'Оплата тенанта'
        verbose_name_plural = 'Оплаты тенантов'
        ordering = ['-payment_date']

    def __str__(self):
        return f'{self.organization.name} — {self.amount} ₽ ({self.payment_date})'


class TenantNote(models.Model):
    """Журнал взаимодействий с тенантом."""

    class NoteType(models.TextChoices):
        CALL = 'call', 'Звонок'
        MEETING = 'meeting', 'Встреча'
        SUPPORT = 'support', 'Тех. поддержка'
        BILLING = 'billing', 'Биллинг'
        INTERNAL = 'internal', 'Внутренняя заметка'
        ONBOARDING = 'onboarding', 'Онбординг'
        OTHER = 'other', 'Другое'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE,
        related_name='tenant_notes', verbose_name='Организация',
    )
    note_type = models.CharField(
        'Тип', max_length=20,
        choices=NoteType.choices, default=NoteType.INTERNAL,
    )
    subject = models.CharField('Тема', max_length=255)
    content = models.TextField('Содержание')
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='created_tenant_notes', verbose_name='Автор',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'tenant_notes'
        verbose_name = 'Заметка по тенанту'
        verbose_name_plural = 'Заметки по тенантам'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.subject} ({self.organization.name})'
