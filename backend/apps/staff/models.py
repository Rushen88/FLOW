import uuid
from django.db import models


class Position(models.Model):
    """Должность."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'core.Organization', on_delete=models.CASCADE,
        related_name='positions', verbose_name='Организация',
    )
    name = models.CharField('Название', max_length=100)
    base_salary = models.DecimalField(
        'Базовая ставка', max_digits=12, decimal_places=2, default=0,
    )
    description = models.TextField('Описание', blank=True, default='')

    class Meta:
        db_table = 'positions'
        verbose_name = 'Должность'
        verbose_name_plural = 'Должности'

    def __str__(self):
        return self.name


class PayrollScheme(models.Model):
    """Схема начисления зарплаты."""

    class SchemeType(models.TextChoices):
        FIXED = 'fixed', 'Фиксированная'
        HOURLY = 'hourly', 'Почасовая'
        SHIFT = 'shift', 'За смену'
        PERCENT_SALES = 'percent_sales', '% от продаж'
        MIXED = 'mixed', 'Смешанная'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    employee = models.ForeignKey(
        'core.User', on_delete=models.CASCADE,
        related_name='payroll_schemes', verbose_name='Сотрудник',
    )
    scheme_type = models.CharField(
        'Тип', max_length=20, choices=SchemeType.choices, default=SchemeType.FIXED,
    )
    base_amount = models.DecimalField(
        'Базовая сумма', max_digits=12, decimal_places=2, default=0,
    )
    sales_percent = models.DecimalField(
        '% от продаж', max_digits=5, decimal_places=2, default=0,
    )
    is_active = models.BooleanField('Активна', default=True)
    started_at = models.DateField('Начало действия')
    ended_at = models.DateField('Окончание', null=True, blank=True)

    class Meta:
        db_table = 'payroll_schemes'
        verbose_name = 'Схема оплаты'
        verbose_name_plural = 'Схемы оплаты'

    def __str__(self):
        return f'{self.employee}: {self.get_scheme_type_display()}'


class Shift(models.Model):
    """Смена сотрудника."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'core.Organization', on_delete=models.CASCADE,
        related_name='shifts', verbose_name='Организация',
    )
    employee = models.ForeignKey(
        'core.User', on_delete=models.CASCADE,
        related_name='shifts', verbose_name='Сотрудник',
    )
    trading_point = models.ForeignKey(
        'core.TradingPoint', on_delete=models.CASCADE,
        related_name='shifts', verbose_name='Торговая точка',
    )
    date = models.DateField('Дата')
    start_time = models.TimeField('Начало')
    end_time = models.TimeField('Окончание')
    break_minutes = models.PositiveIntegerField('Перерыв (мин)', default=0)
    is_confirmed = models.BooleanField('Подтверждена', default=False)
    notes = models.TextField('Примечания', blank=True, default='')

    class Meta:
        db_table = 'shifts'
        verbose_name = 'Смена'
        verbose_name_plural = 'Смены'
        ordering = ['-date', '-start_time']

    def __str__(self):
        return f'{self.employee} — {self.date}'


class SalaryAccrual(models.Model):
    """Начисление зарплаты."""

    class Status(models.TextChoices):
        PENDING = 'pending', 'Ожидает'
        APPROVED = 'approved', 'Утверждено'
        PAID = 'paid', 'Выплачено'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'core.Organization', on_delete=models.CASCADE,
        related_name='salary_accruals', verbose_name='Организация',
    )
    employee = models.ForeignKey(
        'core.User', on_delete=models.CASCADE,
        related_name='salary_accruals', verbose_name='Сотрудник',
    )
    period_start = models.DateField('Начало периода')
    period_end = models.DateField('Конец периода')
    base_amount = models.DecimalField(
        'Оклад/тариф', max_digits=12, decimal_places=2, default=0,
    )
    bonus = models.DecimalField('Бонус', max_digits=12, decimal_places=2, default=0)
    penalty = models.DecimalField('Штраф', max_digits=12, decimal_places=2, default=0)
    sales_bonus = models.DecimalField(
        'Бонус с продаж', max_digits=12, decimal_places=2, default=0,
    )
    total = models.DecimalField('Итого', max_digits=12, decimal_places=2, default=0)
    status = models.CharField(
        'Статус', max_length=20, choices=Status.choices, default=Status.PENDING,
    )
    paid_from_wallet = models.ForeignKey(
        'finance.Wallet', on_delete=models.SET_NULL, null=True, blank=True,
        verbose_name='Выплачено из кошелька',
    )
    paid_at = models.DateTimeField('Дата выплаты', null=True, blank=True)
    notes = models.TextField('Примечания', blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'salary_accruals'
        verbose_name = 'Начисление зарплаты'
        verbose_name_plural = 'Начисления зарплаты'
        ordering = ['-period_end']

    def __str__(self):
        return f'{self.employee} — {self.period_start} - {self.period_end}'
