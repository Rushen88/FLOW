import uuid
from django.db import models


class Sale(models.Model):
    """Продажа (чек)."""

    class Status(models.TextChoices):
        OPEN = 'open', 'Открыта'
        COMPLETED = 'completed', 'Завершена'
        CANCELLED = 'cancelled', 'Отменена'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'core.Organization', on_delete=models.CASCADE,
        related_name='sales', verbose_name='Организация',
    )
    trading_point = models.ForeignKey(
        'core.TradingPoint', on_delete=models.CASCADE,
        related_name='sales', verbose_name='Торговая точка',
    )
    number = models.CharField('Номер чека', max_length=50, blank=True, default='')
    status = models.CharField(
        'Статус', max_length=20, choices=Status.choices, default=Status.OPEN,
    )
    customer = models.ForeignKey(
        'customers.Customer', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='sales', verbose_name='Клиент',
    )
    seller = models.ForeignKey(
        'core.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='sales', verbose_name='Продавец',
    )
    order = models.ForeignKey(
        'sales.Order', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='sales', verbose_name='Заказ',
    )
    subtotal = models.DecimalField('Сумма', max_digits=12, decimal_places=2, default=0)
    discount_amount = models.DecimalField('Скидка', max_digits=12, decimal_places=2, default=0)
    discount_percent = models.DecimalField('Скидка %', max_digits=5, decimal_places=2, default=0)
    total = models.DecimalField('Итого', max_digits=12, decimal_places=2, default=0)
    payment_method = models.ForeignKey(
        'core.PaymentMethod', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='sales', verbose_name='Способ оплаты',
    )
    is_paid = models.BooleanField('Оплачено', default=False)
    notes = models.TextField('Примечания', blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField('Дата завершения', null=True, blank=True)

    class Meta:
        db_table = 'sales'
        verbose_name = 'Продажа'
        verbose_name_plural = 'Продажи'
        ordering = ['-created_at']

    def __str__(self):
        return f'Чек #{self.number} ({self.total} руб.)'


class SaleItem(models.Model):
    """Позиция продажи."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sale = models.ForeignKey(
        Sale, on_delete=models.CASCADE,
        related_name='items', verbose_name='Продажа',
    )
    nomenclature = models.ForeignKey(
        'nomenclature.Nomenclature', on_delete=models.CASCADE,
        related_name='sale_items', verbose_name='Номенклатура',
    )
    batch = models.ForeignKey(
        'inventory.Batch', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='sale_items', verbose_name='Партия',
    )
    quantity = models.DecimalField('Количество', max_digits=10, decimal_places=2)
    price = models.DecimalField('Цена за ед.', max_digits=12, decimal_places=2)
    cost_price = models.DecimalField('Себестоимость', max_digits=12, decimal_places=2, default=0)
    discount_percent = models.DecimalField('Скидка %', max_digits=5, decimal_places=2, default=0)
    total = models.DecimalField('Итого', max_digits=12, decimal_places=2, default=0)
    is_custom_bouquet = models.BooleanField('Авторский букет', default=False)

    class Meta:
        db_table = 'sale_items'
        verbose_name = 'Позиция продажи'
        verbose_name_plural = 'Позиции продаж'

    def __str__(self):
        return f'{self.nomenclature.name} x{self.quantity}'


class Order(models.Model):
    """Заказ клиента."""

    class Status(models.TextChoices):
        NEW = 'new', 'Новый'
        CONFIRMED = 'confirmed', 'Подтверждён'
        IN_ASSEMBLY = 'in_assembly', 'Сборка'
        ASSEMBLED = 'assembled', 'Собран'
        ON_DELIVERY = 'on_delivery', 'Доставка'
        DELIVERED = 'delivered', 'Доставлен'
        COMPLETED = 'completed', 'Завершён'
        CANCELLED = 'cancelled', 'Отменён'

    class Source(models.TextChoices):
        SHOP = 'shop', 'Магазин'
        PHONE = 'phone', 'Телефон'
        WEBSITE = 'website', 'Сайт'
        INSTAGRAM = 'instagram', 'Instagram'
        TELEGRAM = 'telegram', 'Telegram'
        WHATSAPP = 'whatsapp', 'WhatsApp'
        OTHER = 'other', 'Другое'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'core.Organization', on_delete=models.CASCADE,
        related_name='orders', verbose_name='Организация',
    )
    trading_point = models.ForeignKey(
        'core.TradingPoint', on_delete=models.CASCADE,
        related_name='orders', verbose_name='Торговая точка',
    )
    number = models.CharField('Номер заказа', max_length=50, blank=True, default='')
    status = models.CharField(
        'Статус', max_length=20, choices=Status.choices, default=Status.NEW,
    )
    source = models.CharField(
        'Источник', max_length=20, choices=Source.choices, default=Source.SHOP,
    )
    customer = models.ForeignKey(
        'customers.Customer', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='orders', verbose_name='Клиент',
    )
    recipient_name = models.CharField('Имя получателя', max_length=255, blank=True, default='')
    recipient_phone = models.CharField('Телефон получателя', max_length=20, blank=True, default='')
    delivery_address = models.TextField('Адрес доставки', blank=True, default='')
    delivery_date = models.DateField('Дата доставки', null=True, blank=True)
    delivery_time_from = models.TimeField('Доставка с', null=True, blank=True)
    delivery_time_to = models.TimeField('Доставка до', null=True, blank=True)
    is_anonymous = models.BooleanField('Анонимная доставка', default=False)
    card_text = models.TextField('Текст открытки', blank=True, default='')
    subtotal = models.DecimalField('Сумма', max_digits=12, decimal_places=2, default=0)
    delivery_cost = models.DecimalField('Стоимость доставки', max_digits=10, decimal_places=2, default=0)
    discount_amount = models.DecimalField('Скидка', max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField('Итого', max_digits=12, decimal_places=2, default=0)
    prepayment = models.DecimalField('Предоплата', max_digits=12, decimal_places=2, default=0)
    remaining_payment = models.DecimalField('Остаток к оплате', max_digits=12, decimal_places=2, default=0)
    payment_method = models.ForeignKey(
        'core.PaymentMethod', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='orders', verbose_name='Способ оплаты',
    )
    responsible = models.ForeignKey(
        'core.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='responsible_orders', verbose_name='Ответственный',
    )
    florist = models.ForeignKey(
        'core.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='florist_orders', verbose_name='Флорист',
    )
    courier = models.ForeignKey(
        'delivery.Courier', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='orders', verbose_name='Курьер',
    )
    promo_code = models.ForeignKey(
        'marketing.PromoCode', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='orders', verbose_name='Промокод',
    )
    notes = models.TextField('Примечания', blank=True, default='')
    internal_notes = models.TextField('Внутренние заметки', blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Допустимые переходы между статусами
    ALLOWED_TRANSITIONS = {
        Status.NEW: [Status.CONFIRMED, Status.CANCELLED],
        Status.CONFIRMED: [Status.IN_ASSEMBLY, Status.CANCELLED],
        Status.IN_ASSEMBLY: [Status.ASSEMBLED, Status.CANCELLED],
        Status.ASSEMBLED: [Status.ON_DELIVERY, Status.COMPLETED, Status.CANCELLED],
        Status.ON_DELIVERY: [Status.DELIVERED, Status.CANCELLED],
        Status.DELIVERED: [Status.COMPLETED],
        Status.COMPLETED: [],  # Финальный статус
        Status.CANCELLED: [],  # Финальный статус
    }

    class Meta:
        db_table = 'orders'
        verbose_name = 'Заказ'
        verbose_name_plural = 'Заказы'
        ordering = ['-created_at']

    def __str__(self):
        return f'Заказ #{self.number}'

    def can_transition_to(self, new_status: str) -> bool:
        """Проверяет возможность перехода в указанный статус."""
        allowed = self.ALLOWED_TRANSITIONS.get(self.status, [])
        return new_status in allowed

    def transition_to(self, new_status: str, user=None, comment: str = '') -> bool:
        """
        Безопасно переводит заказ в новый статус.
        
        Args:
            new_status: Новый статус заказа
            user: Пользователь, выполняющий переход
            comment: Комментарий к переходу
            
        Returns:
            True если переход успешен
            
        Raises:
            ValueError: Если переход недопустим
        """
        if not self.can_transition_to(new_status):
            allowed = self.ALLOWED_TRANSITIONS.get(self.status, [])
            allowed_names = [self.Status(s).label for s in allowed]
            raise ValueError(
                f'Недопустимый переход из "{self.get_status_display()}" в "{self.Status(new_status).label}". '
                f'Допустимые переходы: {", ".join(allowed_names) or "нет"}'
            )
        
        old_status = self.status
        self.status = new_status
        self.save(update_fields=['status', 'updated_at'])
        
        # Логируем переход
        OrderStatusHistory.objects.create(
            order=self,
            old_status=old_status,
            new_status=new_status,
            changed_by=user,
            comment=comment,
        )
        return True


class OrderItem(models.Model):
    """Позиция заказа."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(
        Order, on_delete=models.CASCADE,
        related_name='items', verbose_name='Заказ',
    )
    nomenclature = models.ForeignKey(
        'nomenclature.Nomenclature', on_delete=models.CASCADE,
        related_name='order_items', verbose_name='Номенклатура',
    )
    quantity = models.DecimalField('Количество', max_digits=10, decimal_places=2)
    price = models.DecimalField('Цена', max_digits=12, decimal_places=2)
    discount_percent = models.DecimalField('Скидка %', max_digits=5, decimal_places=2, default=0)
    total = models.DecimalField('Итого', max_digits=12, decimal_places=2, default=0)
    is_custom_bouquet = models.BooleanField('Авторский букет', default=False)
    custom_description = models.TextField('Описание авторского букета', blank=True, default='')
    photo = models.ImageField('Фото', upload_to='order_items/', blank=True, null=True)

    class Meta:
        db_table = 'order_items'
        verbose_name = 'Позиция заказа'
        verbose_name_plural = 'Позиции заказов'

    def __str__(self):
        return f'{self.nomenclature.name} x{self.quantity}'


class OrderStatusHistory(models.Model):
    """История изменений статуса заказа."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(
        Order, on_delete=models.CASCADE,
        related_name='status_history', verbose_name='Заказ',
    )
    old_status = models.CharField('Старый статус', max_length=20, blank=True, default='')
    new_status = models.CharField('Новый статус', max_length=20)
    changed_by = models.ForeignKey(
        'core.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='order_status_changes', verbose_name='Кем изменён',
    )
    comment = models.TextField('Комментарий', blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'order_status_history'
        verbose_name = 'История статуса заказа'
        verbose_name_plural = 'История статусов заказов'
        ordering = ['-created_at']
