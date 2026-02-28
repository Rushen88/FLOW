from decimal import Decimal

from django.db import models as db_models
from django.db import transaction
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
    Обновление статистики клиента (total_purchases, purchases_count, loyalty)
    и счетчика использований промокода.
    """
    from django.db.models import F, DecimalField, IntegerField, Value
    from django.db.models.functions import Greatest
    from apps.customers.models import Customer
    from apps.marketing.models import PromoCode, LoyaltyProgram
    from decimal import Decimal

    is_completion = delta_count > 0

    if getattr(sale, 'promo_code', None):
        if is_completion:
            PromoCode.objects.filter(pk=sale.promo_code_id).update(used_count=F('used_count') + 1)
        else:
            PromoCode.objects.filter(pk=sale.promo_code_id).update(
                used_count=Greatest(F('used_count') - 1, Value(0, output_field=IntegerField()))
            )

    if getattr(sale, 'customer', None):
        earned = Decimal('0')
        if is_completion:
            loyalty = LoyaltyProgram.objects.filter(organization=sale.organization, is_active=True).first()
            if loyalty and loyalty.program_type == 'bonus':
                earned = (sale.total * loyalty.accrual_percent / Decimal('100.0')).quantize(Decimal('0.01'))
            sale.earned_bonuses = earned
            sale.save(update_fields=['earned_bonuses'])
        else:
            earned = getattr(sale, 'earned_bonuses', Decimal('0')) or Decimal('0')
            sale.earned_bonuses = Decimal('0')
            sale.save(update_fields=['earned_bonuses'])

        used = getattr(sale, 'used_bonuses', Decimal('0')) or Decimal('0')
        delta_bonuses = earned - used if is_completion else used - earned

        Customer.objects.filter(pk=sale.customer_id).update(
            total_purchases=Greatest(
                F('total_purchases') + delta_total,
                Value(Decimal('0.00'), output_field=DecimalField(max_digits=14, decimal_places=2))
            ),
            purchases_count=Greatest(
                F('purchases_count') + delta_count,
                Value(0, output_field=IntegerField())
            ),
            bonus_points=Greatest(
                F('bonus_points') + delta_bonuses,
                Value(Decimal('0.00'), output_field=DecimalField(max_digits=10, decimal_places=2))
            ),
        )


def do_sale_fifo_write_off(sale):
    """
    FIFO-списание товаров со склада для позиций продажи.
    Вызывается при завершении + оплате.
    Идемпотентна: если FIFO-списание уже выполнено — пропускает.
    """
    from apps.inventory.services import fifo_write_off, _update_stock_balance, InsufficientStockError
    from apps.inventory.models import StockMovement, Batch

    # Идемпотентность: если для этой продажи уже есть SALE-движения — не списываем повторно
    if StockMovement.objects.filter(sale=sale, movement_type=StockMovement.MovementType.SALE).exists():
        return []

    warnings = []

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
                trading_point=sale.trading_point,
            ).first()
        if not warehouse:
            warehouse = Warehouse.objects.filter(
                organization=sale.organization,
                trading_point=sale.trading_point,
            ).order_by('id').first()
        if not warehouse:
            warehouse = Warehouse.objects.filter(organization=sale.organization).order_by('id').first()
        if not warehouse:
            continue

        available_qty = (
            Batch.objects.filter(
                organization=sale.organization,
                warehouse=warehouse,
                nomenclature=nom,
                remaining__gt=0,
            ).aggregate(total=db_models.Sum('remaining'))['total']
            or Decimal('0')
        )

        required_qty = Decimal(str(item.quantity))
        qty_from_fifo = min(required_qty, available_qty)
        qty_shortage = required_qty - qty_from_fifo

        fifo_result = []
        if qty_from_fifo > 0:
            fifo_result = fifo_write_off(
                organization=sale.organization,
                warehouse=warehouse,
                nomenclature=nom,
                quantity=qty_from_fifo,
            )

        for row in fifo_result:
            StockMovement.objects.create(
                organization=sale.organization,
                nomenclature=nom,
                movement_type=StockMovement.MovementType.SALE,
                warehouse_from=warehouse,
                batch=row['batch'],
                quantity=row['qty'],
                price=row['price'],
                sale=sale,
                notes=f'Продажа #{sale.number}',
            )

        if qty_shortage > 0:
            StockMovement.objects.create(
                organization=sale.organization,
                nomenclature=nom,
                movement_type=StockMovement.MovementType.SALE,
                warehouse_from=warehouse,
                batch=None,
                quantity=qty_shortage,
                price=nom.purchase_price,
                sale=sale,
                notes=f'Продажа в минус #{sale.number}',
            )
            warnings.append(
                f'Продажа в минус: "{nom.name}" на складе "{warehouse.name}". '
                f'Продано {required_qty}, доступно {available_qty}, дефицит {qty_shortage}.'
            )

        total_cost = sum(r['qty'] * r['price'] for r in fifo_result) + (qty_shortage * nom.purchase_price)
        item.cost_price = total_cost / required_qty if required_qty else Decimal('0')
        item.save(update_fields=['cost_price'])

        _update_stock_balance(sale.organization, warehouse, nom, -required_qty)

    return warnings


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


@transaction.atomic
def rollback_sale_effects_before_delete(sale):
    """
    Откатить последствия проведённой продажи перед удалением записи Sale:
    - вернуть складские остатки/партии по движениям типа SALE этой продажи,
    - откатить финансовые транзакции, привязанные к продаже,
    - откатить статистику клиента.
    """
    from apps.inventory.models import StockMovement, Batch
    from apps.inventory.services import _update_stock_balance
    from apps.finance.models import Transaction, Wallet

    # Используем FK sale вместо notes__contains для надёжного поиска движений
    sale_movements = (
        StockMovement.objects
        .select_related('batch', 'warehouse_from', 'nomenclature')
        .filter(
            organization=sale.organization,
            movement_type=StockMovement.MovementType.SALE,
            sale=sale,
        )
        .order_by('-created_at')
    )
    if sale_movements.exists():

        for movement in sale_movements:
            if movement.batch_id:
                batch = Batch.objects.select_for_update().filter(pk=movement.batch_id).first()
                if batch:
                    batch.remaining = (batch.remaining or Decimal('0')) + Decimal(str(movement.quantity or 0))
                    batch.save(update_fields=['remaining'])

            if movement.warehouse_from_id and movement.nomenclature_id:
                _update_stock_balance(
                    organization=sale.organization,
                    warehouse=movement.warehouse_from,
                    nomenclature=movement.nomenclature,
                    qty_delta=Decimal(str(movement.quantity or 0)),
                )

        sale_movements.delete()

    tx_qs = Transaction.objects.select_for_update().filter(sale=sale)
    for tx in tx_qs:
        if tx.wallet_to_id:
            Wallet.objects.select_for_update().filter(pk=tx.wallet_to_id).update(
                balance=db_models.F('balance') - tx.amount
            )
        if tx.wallet_from_id:
            Wallet.objects.select_for_update().filter(pk=tx.wallet_from_id).update(
                balance=db_models.F('balance') + tx.amount
            )
    tx_qs.delete()

    if sale.status == Sale.Status.COMPLETED and sale.is_paid and sale.customer_id:
        from django.db.models import F, Value, DecimalField, IntegerField
        from django.db.models.functions import Greatest
        from apps.customers.models import Customer

        Customer.objects.select_for_update().filter(pk=sale.customer_id).update(
            total_purchases=Greatest(
                F('total_purchases') - sale.total,
                Value(Decimal('0.00'), output_field=DecimalField(max_digits=14, decimal_places=2)),
            ),
            purchases_count=Greatest(
                F('purchases_count') - 1,
                Value(0, output_field=IntegerField()),
            ),
        )


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
