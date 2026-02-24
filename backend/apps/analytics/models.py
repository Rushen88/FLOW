# Аналитика строится на основе данных из других модулей.
# Здесь можно добавить кэширующие модели для отчётов.
import uuid
from django.db import models


class DailySummary(models.Model):
    """Ежедневная сводка по торговой точке."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'core.Organization', on_delete=models.CASCADE,
        related_name='daily_summaries', verbose_name='Организация',
    )
    trading_point = models.ForeignKey(
        'core.TradingPoint', on_delete=models.CASCADE,
        related_name='daily_summaries', verbose_name='Торговая точка',
    )
    date = models.DateField('Дата')
    revenue = models.DecimalField('Выручка', max_digits=14, decimal_places=2, default=0)
    cost = models.DecimalField('Себестоимость', max_digits=14, decimal_places=2, default=0)
    profit = models.DecimalField('Прибыль', max_digits=14, decimal_places=2, default=0)
    sales_count = models.PositiveIntegerField('Кол-во продаж', default=0)
    orders_count = models.PositiveIntegerField('Кол-во заказов', default=0)
    avg_check = models.DecimalField('Средний чек', max_digits=12, decimal_places=2, default=0)
    new_customers = models.PositiveIntegerField('Новых клиентов', default=0)
    write_offs = models.DecimalField('Списания', max_digits=12, decimal_places=2, default=0)

    class Meta:
        db_table = 'daily_summaries'
        verbose_name = 'Дневная сводка'
        verbose_name_plural = 'Дневные сводки'
        unique_together = ['trading_point', 'date']
        ordering = ['-date']

    def __str__(self):
        return f'{self.trading_point.name} — {self.date}'
