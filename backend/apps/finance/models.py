import uuid
from django.db import models


class Wallet(models.Model):
    """Кошелёк (касса, расчётный счёт, личная карта и т.д.)."""

    class WalletType(models.TextChoices):
        CASH = 'cash', 'Наличные (касса)'
        BANK_ACCOUNT = 'bank_account', 'Расчётный счёт'
        CARD = 'card', 'Корпоративная карта'
        PERSONAL_CARD = 'personal_card', 'Личная карта сотрудника'
        ONLINE = 'online', 'Онлайн-оплата'
        OTHER = 'other', 'Другое'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'core.Organization', on_delete=models.CASCADE,
        related_name='wallets', verbose_name='Организация',
    )
    trading_point = models.ForeignKey(
        'core.TradingPoint', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='wallets', verbose_name='Торговая точка',
    )
    name = models.CharField('Название', max_length=255)
    wallet_type = models.CharField(
        'Тип', max_length=20, choices=WalletType.choices, default=WalletType.CASH,
    )
    balance = models.DecimalField(
        'Баланс', max_digits=14, decimal_places=2, default=0,
    )
    allow_negative = models.BooleanField('Допускать отрицательный баланс', default=False)
    owner = models.ForeignKey(
        'core.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='personal_wallets', verbose_name='Владелец',
    )
    is_active = models.BooleanField('Активен', default=True)
    notes = models.TextField('Примечания', blank=True, default='')

    class Meta:
        db_table = 'wallets'
        verbose_name = 'Кошелёк'
        verbose_name_plural = 'Кошельки'

    def __str__(self):
        return f'{self.name} ({self.balance} руб.)'


class TransactionCategory(models.Model):
    """Категория транзакций (статья ДДС)."""

    class Direction(models.TextChoices):
        INCOME = 'income', 'Доход'
        EXPENSE = 'expense', 'Расход'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'core.Organization', on_delete=models.CASCADE,
        related_name='transaction_categories', verbose_name='Организация',
    )
    name = models.CharField('Название', max_length=255)
    direction = models.CharField(
        'Направление', max_length=10, choices=Direction.choices,
    )
    parent = models.ForeignKey(
        'self', on_delete=models.CASCADE, null=True, blank=True,
        related_name='children', verbose_name='Родительская категория',
    )
    is_system = models.BooleanField('Системная', default=False)

    class Meta:
        db_table = 'transaction_categories'
        verbose_name = 'Категория транзакций'
        verbose_name_plural = 'Категории транзакций'

    def __str__(self):
        return self.name


class Transaction(models.Model):
    """Финансовая транзакция."""

    class TransactionType(models.TextChoices):
        INCOME = 'income', 'Приход'
        EXPENSE = 'expense', 'Расход'
        TRANSFER = 'transfer', 'Перевод между кошельками'
        SALARY = 'salary', 'Зарплата'
        PERSONAL_EXPENSE = 'personal_expense', 'Личный расход сотрудника'
        SUPPLIER_PAYMENT = 'supplier_payment', 'Оплата поставщику'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'core.Organization', on_delete=models.CASCADE,
        related_name='transactions', verbose_name='Организация',
    )
    transaction_type = models.CharField(
        'Тип', max_length=20, choices=TransactionType.choices,
    )
    category = models.ForeignKey(
        TransactionCategory, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='transactions', verbose_name='Категория',
    )
    wallet_from = models.ForeignKey(
        Wallet, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='transactions_out', verbose_name='Из кошелька',
    )
    wallet_to = models.ForeignKey(
        Wallet, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='transactions_in', verbose_name='В кошелёк',
    )
    amount = models.DecimalField('Сумма', max_digits=14, decimal_places=2)
    sale = models.ForeignKey(
        'sales.Sale', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='transactions', verbose_name='Продажа',
    )
    order = models.ForeignKey(
        'sales.Order', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='transactions', verbose_name='Заказ',
    )
    employee = models.ForeignKey(
        'core.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='employee_transactions', verbose_name='Сотрудник',
    )
    description = models.TextField('Описание', blank=True, default='')
    user = models.ForeignKey(
        'core.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='transactions', verbose_name='Пользователь',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'transactions'
        verbose_name = 'Транзакция'
        verbose_name_plural = 'Транзакции'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.get_transaction_type_display()}: {self.amount} руб.'


class Debt(models.Model):
    """Долг/обязательство (поставщику, сотруднику)."""

    class DebtType(models.TextChoices):
        SUPPLIER = 'supplier', 'Поставщик'
        EMPLOYEE = 'employee', 'Сотрудник'
        CUSTOMER = 'customer', 'Клиент'
        OTHER = 'other', 'Другое'

    class Direction(models.TextChoices):
        WE_OWE = 'we_owe', 'Мы должны'
        OWED_TO_US = 'owed_to_us', 'Нам должны'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'core.Organization', on_delete=models.CASCADE,
        related_name='debts', verbose_name='Организация',
    )
    debt_type = models.CharField(
        'Тип', max_length=20, choices=DebtType.choices,
    )
    direction = models.CharField(
        'Направление', max_length=20, choices=Direction.choices,
    )
    counterparty_name = models.CharField('Контрагент', max_length=255)
    amount = models.DecimalField('Сумма', max_digits=14, decimal_places=2)
    paid_amount = models.DecimalField(
        'Оплачено', max_digits=14, decimal_places=2, default=0,
    )
    due_date = models.DateField('Срок', null=True, blank=True)
    is_closed = models.BooleanField('Закрыт', default=False)
    notes = models.TextField('Примечания', blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'debts'
        verbose_name = 'Долг'
        verbose_name_plural = 'Долги'

    def __str__(self):
        return f'{self.counterparty_name}: {self.amount} руб.'

    @property
    def remaining(self):
        return self.amount - self.paid_amount


class CashShift(models.Model):
    """Кассовая смена (для розничных продаж и сдачи смены)."""
    class Status(models.TextChoices):
        OPEN = 'open', 'Открыта'
        CLOSED = 'closed', 'Закрыта'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'core.Organization', on_delete=models.CASCADE,
        related_name='cash_shifts', verbose_name='Организация',
    )
    trading_point = models.ForeignKey(
        'core.TradingPoint', on_delete=models.CASCADE,
        related_name='cash_shifts', verbose_name='Торговая точка',
    )
    wallet = models.ForeignKey(
        Wallet, on_delete=models.CASCADE,
        related_name='cash_shifts', verbose_name='Касса (Кошелёк)',
    )
    opened_by = models.ForeignKey(
        'core.User', on_delete=models.SET_NULL, null=True,
        related_name='opened_cash_shifts', verbose_name='Открыл',
    )
    closed_by = models.ForeignKey(
        'core.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='closed_cash_shifts', verbose_name='Закрыл',
    )
    status = models.CharField('Статус', max_length=10, choices=Status.choices, default=Status.OPEN)
    
    opened_at = models.DateTimeField('Время открытия', auto_now_add=True)
    closed_at = models.DateTimeField('Время закрытия', null=True, blank=True)
    
    balance_at_open = models.DecimalField('Остаток при открытии', max_digits=14, decimal_places=2, default=0)
    expected_balance_at_close = models.DecimalField('Ожидаемый остаток', max_digits=14, decimal_places=2, null=True, blank=True)
    actual_balance_at_close = models.DecimalField('Фактический остаток', max_digits=14, decimal_places=2, null=True, blank=True)
    discrepancy = models.DecimalField('Расхождение', max_digits=14, decimal_places=2, null=True, blank=True)
    
    notes = models.TextField('Примечания', blank=True, default='')

    class Meta:
        db_table = 'cash_shifts'
        verbose_name = 'Кассовая смена'
        verbose_name_plural = 'Кассовые смены'
        ordering = ['-opened_at']

    def __str__(self):
        return f'Смена {self.id} ({self.get_status_display()})'
