from decimal import Decimal

from django.db import models as db_models
from django.db.models import Max

from .models import Sale, Order, OrderStatusHistory


def lock_organization_row(organization_id):
    """
    Сериализация генерации номеров внутри организации.
    Нужна, чтобы избежать гонок даже при пустой таблице продаж/заказов.
    """
    from apps.core.models import Organization

    return Organization.objects.select_for_update().get(pk=organization_id)


def generate_sale_number(organization):
    """
    Генерация безопасного числового номера чека.
    Использует IntegerField-семантику: MAX + 1 с select_for_update.
    """
    max_num = (
        Sale.objects.select_for_update()
        .filter(organization=organization, number__isnull=False)
        .exclude(number='')
        .filter(number__regex=r'^\d+$')
        .annotate(num_int=db_models.functions.Cast('number', db_models.IntegerField()))
        .aggregate(m=Max('num_int'))['m']
    )
    try:
        return str((max_num or 0) + 1)
    except (ValueError, TypeError):
        return str(Sale.objects.filter(organization=organization).count() + 1)


def generate_order_number(organization):
    """
    Генерация безопасного числового номера заказа.
    Использует IntegerField-семантику: MAX + 1 с select_for_update.
    """
    max_num = (
        Order.objects.select_for_update()
        .filter(organization=organization, number__isnull=False)
        .exclude(number='')
        .filter(number__regex=r'^\d+$')
        .annotate(num_int=db_models.functions.Cast('number', db_models.IntegerField()))
        .aggregate(m=Max('num_int'))['m']
    )
    try:
        return str((max_num or 0) + 1)
    except (ValueError, TypeError):
        return str(Order.objects.filter(organization=organization).count() + 1)


def resolve_batch_by_warehouse(organization, nomenclature, warehouse_id):
    if not warehouse_id:
        return None

    from apps.inventory.models import Batch

    return Batch.objects.filter(
        organization=organization,
        nomenclature=nomenclature,
        warehouse_id=warehouse_id,
        remaining__gt=0,
    ).order_by('arrival_date', 'created_at').first()


def recalc_sale_totals(sale):
    from django.db.models import Sum

    agg = sale.items.aggregate(total=Sum('total'))['total'] or Decimal('0')
    sale.subtotal = agg
    disc_pct = sale.discount_percent or Decimal('0')
    disc_amt = agg * disc_pct / 100
    sale.discount_amount = disc_amt
    sale.total = max(agg - disc_amt, Decimal('0'))
    sale.save(update_fields=['subtotal', 'discount_amount', 'total'])


def update_customer_stats(sale, delta_total, delta_count):
    """
    Обновление статистики клиента (total_purchases, purchases_count).
    delta_total: сколько добавить/убрать из суммы покупок
    delta_count: сколько добавить/убрать из количества покупок
    """
    if not sale.customer:
        return

    from django.db.models import F
    from apps.customers.models import Customer

    Customer.objects.filter(pk=sale.customer_id).update(
        total_purchases=F('total_purchases') + delta_total,
        purchases_count=F('purchases_count') + delta_count,
    )


def do_sale_fifo_write_off(sale):
    """
    FIFO-списание товаров со склада для позиций продажи.
    Вызывается при завершении + оплате.
    """
    from apps.inventory.services import fifo_write_off, _update_stock_balance, InsufficientStockError
    from apps.inventory.models import StockMovement

    for item in sale.items.select_related('nomenclature', 'batch').all():
        nom = item.nomenclature
        if nom.nomenclature_type == 'service':
            continue

        warehouse = None
        if item.batch and item.batch.warehouse_id:
            warehouse = item.batch.warehouse
        if not warehouse:
            from apps.core.models import Warehouse

            warehouse = Warehouse.objects.filter(
                organization=sale.organization,
                is_default_for_sales=True,
            ).first()
        if not warehouse:
            continue

        try:
            fifo_result = fifo_write_off(
                organization=sale.organization,
                warehouse=warehouse,
                nomenclature=nom,
                quantity=item.quantity,
            )
            total_cost = sum(r['qty'] * r['price'] for r in fifo_result)
            item.cost_price = total_cost / item.quantity if item.quantity else Decimal('0')
            item.save(update_fields=['cost_price'])

            for row in fifo_result:
                StockMovement.objects.create(
                    organization=sale.organization,
                    nomenclature=nom,
                    movement_type=StockMovement.MovementType.SALE,
                    warehouse_from=warehouse,
                    batch=row['batch'],
                    quantity=row['qty'],
                    price=row['price'],
                    notes=f'Продажа #{sale.number}',
                )
            _update_stock_balance(sale.organization, warehouse, nom, -item.quantity)
        except InsufficientStockError:
            pass


def sync_sale_transaction(sale):
    """
    Синхронизация финансовой транзакции с продажей.
    Гарантирует ровно 0 или 1 транзакцию для каждой продажи.
    """
    from apps.finance.models import Transaction, Wallet

    should_have_tx = sale.status == Sale.Status.COMPLETED and sale.is_paid
    wallet = sale.payment_method.wallet if sale.payment_method else None

    existing_tx = Transaction.objects.filter(sale=sale).select_for_update().first()

    if should_have_tx and wallet:
        if existing_tx:
            if existing_tx.wallet_to_id != wallet.id or existing_tx.amount != sale.total:
                if existing_tx.wallet_to_id:
                    Wallet.objects.select_for_update().filter(
                        pk=existing_tx.wallet_to_id
                    ).update(balance=db_models.F('balance') - existing_tx.amount)

                existing_tx.wallet_to = wallet
                existing_tx.amount = sale.total
                existing_tx.save(update_fields=['wallet_to', 'amount'])

                Wallet.objects.select_for_update().filter(
                    pk=wallet.id
                ).update(balance=db_models.F('balance') + sale.total)
        else:
            Transaction.objects.create(
                organization=sale.organization,
                transaction_type=Transaction.TransactionType.INCOME,
                wallet_to=wallet,
                amount=sale.total,
                sale=sale,
                description=f'Оплата по продаже #{sale.number}'
            )
            Wallet.objects.select_for_update().filter(
                pk=wallet.id
            ).update(balance=db_models.F('balance') + sale.total)
    else:
        if existing_tx:
            if existing_tx.wallet_to_id:
                Wallet.objects.select_for_update().filter(
                    pk=existing_tx.wallet_to_id
                ).update(balance=db_models.F('balance') - existing_tx.amount)
            existing_tx.delete()


def validate_order_status_transition(order, new_status):
    if new_status == order.status:
        return

    if order.can_transition_to(new_status):
        return

    allowed = order.ALLOWED_TRANSITIONS.get(order.status, [])
    allowed_labels = [order.Status(status).label for status in allowed]
    raise ValueError(
        f'Недопустимый переход из "{order.get_status_display()}" в '
        f'"{order.Status(new_status).label}". '
        f'Допустимые переходы: {", ".join(allowed_labels) or "нет"}'
    )


def create_order_status_history(order, old_status, new_status, changed_by=None, comment=''):
    return OrderStatusHistory.objects.create(
        order=order,
        old_status=old_status,
        new_status=new_status,
        changed_by=changed_by,
        comment=comment,
    )
