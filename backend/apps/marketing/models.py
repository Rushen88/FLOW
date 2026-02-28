import uuid
from django.db import models


class AdChannel(models.Model):
    """Рекламный канал."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'core.Organization', on_delete=models.CASCADE,
        related_name='ad_channels', verbose_name='Организация',
    )
    name = models.CharField('Название', max_length=255)
    channel_type = models.CharField('Тип', max_length=100, blank=True, default='')
    url = models.URLField('Ссылка', blank=True, default='')
    is_active = models.BooleanField('Активен', default=True)

    class Meta:
        db_table = 'ad_channels'
        verbose_name = 'Рекламный канал'
        verbose_name_plural = 'Рекламные каналы'

    def __str__(self):
        return self.name


class AdInvestment(models.Model):
    """Расход на рекламу."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'core.Organization', on_delete=models.CASCADE,
        related_name='ad_investments', verbose_name='Организация',
    )
    channel = models.ForeignKey(
        AdChannel, on_delete=models.CASCADE,
        related_name='investments', verbose_name='Канал',
    )
    amount = models.DecimalField('Сумма', max_digits=12, decimal_places=2)
    date = models.DateField('Дата')
    description = models.TextField('Описание', blank=True, default='')

    class Meta:
        db_table = 'ad_investments'
        verbose_name = 'Расход на рекламу'
        verbose_name_plural = 'Расходы на рекламу'
        ordering = ['-date']

    def __str__(self):
        return f'{self.channel.name}: {self.amount} руб.'


class Discount(models.Model):
    """Скидка."""

    class DiscountType(models.TextChoices):
        PERCENT = 'percent', 'Процент'
        FIXED = 'fixed', 'Фиксированная'

    class ApplyTo(models.TextChoices):
        ALL = 'all', 'Весь чек'
        GROUP = 'group', 'Группа товаров'
        NOMENCLATURE = 'nomenclature', 'Конкретный товар'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'core.Organization', on_delete=models.CASCADE,
        related_name='discounts', verbose_name='Организация',
    )
    name = models.CharField('Название', max_length=255)
    discount_type = models.CharField(
        'Тип', max_length=10, choices=DiscountType.choices, default=DiscountType.PERCENT,
    )
    value = models.DecimalField('Значение', max_digits=10, decimal_places=2)
    apply_to = models.CharField(
        'Применять к', max_length=20, choices=ApplyTo.choices, default=ApplyTo.ALL,
    )
    target_group = models.ForeignKey(
        'nomenclature.NomenclatureGroup', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='discounts',
        verbose_name='Целевая группа',
        help_text='Заполнить при apply_to=group',
    )
    target_nomenclature = models.ForeignKey(
        'nomenclature.Nomenclature', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='discounts',
        verbose_name='Целевая номенклатура',
        help_text='Заполнить при apply_to=nomenclature',
    )
    min_purchase = models.DecimalField(
        'Мин. сумма покупки', max_digits=12, decimal_places=2, default=0,
    )
    start_date = models.DateTimeField('Начало', null=True, blank=True)
    end_date = models.DateTimeField('Окончание', null=True, blank=True)
    is_active = models.BooleanField('Активна', default=True)

    class Meta:
        db_table = 'discounts'
        verbose_name = 'Скидка'
        verbose_name_plural = 'Скидки'

    def __str__(self):
        return self.name


class PromoCode(models.Model):
    """Промокод."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'core.Organization', on_delete=models.CASCADE,
        related_name='promo_codes', verbose_name='Организация',
    )
    code = models.CharField('Код', max_length=50)
    discount = models.ForeignKey(
        Discount, on_delete=models.CASCADE,
        related_name='promo_codes', verbose_name='Скидка',
    )
    max_uses = models.PositiveIntegerField('Макс. использований', default=0)
    used_count = models.PositiveIntegerField('Использовано', default=0)
    start_date = models.DateTimeField('Начало', null=True, blank=True)
    end_date = models.DateTimeField('Окончание', null=True, blank=True)
    is_active = models.BooleanField('Активен', default=True)

    class Meta:
        db_table = 'promo_codes'
        verbose_name = 'Промокод'
        verbose_name_plural = 'Промокоды'
        constraints = [
            models.UniqueConstraint(
                fields=['organization', 'code'],
                name='unique_promo_code_per_org'
            ),
        ]

    def __str__(self):
        return self.code


class LoyaltyProgram(models.Model):
    """Программа лояльности."""

    class ProgramType(models.TextChoices):
        BONUS = 'bonus', 'Бонусная'
        DISCOUNT = 'discount', 'Скидочная'
        CASHBACK = 'cashback', 'Кэшбэк'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'core.Organization', on_delete=models.CASCADE,
        related_name='loyalty_programs', verbose_name='Организация',
    )
    name = models.CharField('Название', max_length=255)
    program_type = models.CharField(
        'Тип', max_length=20, choices=ProgramType.choices, default=ProgramType.BONUS,
    )
    accrual_percent = models.DecimalField(
        '% начисления', max_digits=5, decimal_places=2, default=5,
    )
    max_payment_percent = models.DecimalField(
        'Макс. % оплаты бонусами', max_digits=5, decimal_places=2, default=30,
    )
    is_active = models.BooleanField('Активна', default=True)

    class Meta:
        db_table = 'loyalty_programs'
        verbose_name = 'Программа лояльности'
        verbose_name_plural = 'Программы лояльности'

    def __str__(self):
        return self.name
