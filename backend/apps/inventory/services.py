"""
Бизнес-логика складского учёта.

Основные операции:
- FIFO-списание (fifo_write_off) — списание товара с самых старых партий
- Приход товара (process_batch_receipt) — создание партии + движение + остатки
- Сборка букета (assemble_bouquet) — списание компонентов + оприходование букета
- Раскомплектовка букета (disassemble_bouquet) — списание букета + возврат/списание компонентов
- Списание товара (write_off_stock) — ручное списание с FIFO
"""

from decimal import Decimal
from django.db import transaction
from django.utils import timezone

from .models import Batch, StockBalance, StockMovement


class InsufficientStockError(Exception):
    """Недостаточно товара на складе."""

    def __init__(self, nomenclature_name: str, requested: Decimal, available: Decimal):
        self.nomenclature_name = nomenclature_name
        self.requested = requested
        self.available = available
        super().__init__(
            f'Недостаточно "{nomenclature_name}" на складе: '
            f'запрошено {requested}, доступно {available}'
        )


def _update_stock_balance(organization, warehouse, nomenclature, qty_delta: Decimal):
    """Обновить (или создать) StockBalance по складу + номенклатуре."""
    sb, created = StockBalance.objects.get_or_create(
        organization=organization,
        warehouse=warehouse,
        nomenclature=nomenclature,
        defaults={'quantity': Decimal('0'), 'avg_purchase_price': Decimal('0')},
    )
    sb.quantity += qty_delta
    if sb.quantity < 0:
        sb.quantity = Decimal('0')

    # Пересчитываем среднюю закупочную по остаткам партий
    batches = Batch.objects.filter(
        organization=organization,
        warehouse=warehouse,
        nomenclature=nomenclature,
        remaining__gt=0,
    )
    total_remaining = sum(b.remaining for b in batches)
    if total_remaining > 0:
        total_cost = sum(b.remaining * b.purchase_price for b in batches)
        sb.avg_purchase_price = total_cost / total_remaining
    sb.save()
    return sb


def fifo_write_off(organization, warehouse, nomenclature, quantity: Decimal, user=None):
    """
    FIFO-списание: снимаем `quantity` единиц товара с самых старых партий.

    Возвращает список dict: [{'batch': Batch, 'qty': Decimal, 'price': Decimal}, ...]
    Бросает InsufficientStockError если не хватает.
    """
    batches = (
        Batch.objects.filter(
            organization=organization,
            warehouse=warehouse,
            nomenclature=nomenclature,
            remaining__gt=0,
        )
        .order_by('arrival_date', 'created_at')
        .select_for_update()
    )

    total_available = sum(b.remaining for b in batches)
    if total_available < quantity:
        raise InsufficientStockError(
            nomenclature_name=nomenclature.name,
            requested=quantity,
            available=total_available,
        )

    result = []
    remaining_to_write_off = quantity

    for batch in batches:
        if remaining_to_write_off <= 0:
            break
        take = min(batch.remaining, remaining_to_write_off)
        batch.remaining -= take
        batch.save(update_fields=['remaining'])
        result.append({
            'batch': batch,
            'qty': take,
            'price': batch.purchase_price,
        })
        remaining_to_write_off -= take

    return result


@transaction.atomic
def process_batch_receipt(
    organization, warehouse, nomenclature, supplier,
    quantity: Decimal, purchase_price: Decimal,
    arrival_date=None, expiry_date=None, invoice_number='',
    notes='', user=None,
):
    """
    Оприходование партии товара.
    Создаёт Batch + StockMovement(receipt) + обновляет StockBalance.
    """
    if arrival_date is None:
        arrival_date = timezone.now().date()

    batch = Batch.objects.create(
        organization=organization,
        nomenclature=nomenclature,
        supplier=supplier,
        warehouse=warehouse,
        purchase_price=purchase_price,
        quantity=quantity,
        remaining=quantity,
        arrival_date=arrival_date,
        expiry_date=expiry_date,
        invoice_number=invoice_number,
        notes=notes,
    )

    StockMovement.objects.create(
        organization=organization,
        nomenclature=nomenclature,
        movement_type=StockMovement.MovementType.RECEIPT,
        warehouse_to=warehouse,
        batch=batch,
        quantity=quantity,
        price=purchase_price,
        user=user,
        notes=f'Приход партии: {invoice_number}' if invoice_number else 'Приход партии',
    )

    _update_stock_balance(organization, warehouse, nomenclature, quantity)

    # Обновляем цену в справочнике номенклатуры
    nomenclature.purchase_price = purchase_price
    nomenclature.save(update_fields=['purchase_price'])

    # Обновляем цену у поставщика (если указан)
    if supplier:
        from apps.suppliers.models import SupplierNomenclature
        sn, _ = SupplierNomenclature.objects.get_or_create(
            supplier=supplier,
            nomenclature=nomenclature,
            defaults={'price': purchase_price},
        )
        if not _:
            sn.price = purchase_price
            sn.save(update_fields=['price'])

    return batch


@transaction.atomic
def process_sale_items(sale, items_data, user=None):
    """
    Обработка продажи: для каждой позиции — FIFO-списание,
    создание SaleItem с себестоимостью, StockMovement, обновление StockBalance.

    items_data: [{'nomenclature': Nomenclature, 'quantity': Decimal, 'price': Decimal,
                  'discount_percent': Decimal, 'warehouse': Warehouse}, ...]
    """
    from apps.sales.models import SaleItem

    organization = sale.organization
    created_items = []

    for item_data in items_data:
        nomenclature = item_data['nomenclature']
        quantity = Decimal(str(item_data['quantity']))
        price = Decimal(str(item_data['price']))
        discount = Decimal(str(item_data.get('discount_percent', 0)))
        warehouse = item_data['warehouse']

        # FIFO-списание
        fifo_result = fifo_write_off(
            organization=organization,
            warehouse=warehouse,
            nomenclature=nomenclature,
            quantity=quantity,
            user=user,
        )

        # Себестоимость — средневзвешенная по фактически списанным партиям
        total_cost = sum(r['qty'] * r['price'] for r in fifo_result)
        cost_price = total_cost / quantity if quantity else Decimal('0')

        # Итого позиции
        item_total = price * quantity * (1 - discount / 100)

        sale_item = SaleItem.objects.create(
            sale=sale,
            nomenclature=nomenclature,
            batch=fifo_result[0]['batch'] if len(fifo_result) == 1 else None,
            quantity=quantity,
            price=price,
            cost_price=cost_price,
            discount_percent=discount,
            total=item_total,
        )
        created_items.append(sale_item)

        # StockMovement для каждой затронутой партии
        for r in fifo_result:
            StockMovement.objects.create(
                organization=organization,
                nomenclature=nomenclature,
                movement_type=StockMovement.MovementType.SALE,
                warehouse_from=warehouse,
                batch=r['batch'],
                quantity=r['qty'],
                price=r['price'],
                user=user,
                notes=f'Продажа #{sale.number}',
            )

        # Обновить StockBalance
        _update_stock_balance(organization, warehouse, nomenclature, -quantity)

    return created_items


@transaction.atomic
def assemble_bouquet(
    organization, nomenclature_bouquet, warehouse_from, warehouse_to,
    components, quantity=1, user=None, notes='',
):
    """
    Сборка букета.

    components: [{'nomenclature': Nomenclature, 'quantity': Decimal}, ...]
       (количество PER ONE букет — если quantity > 1, будет умножено)

    Процесс:
    1. FIFO-списание всех компонентов из warehouse_from
    2. Создание StockMovement(assembly) для каждого компонента
    3. Оприходование букета на warehouse_to
    """
    bouquet_qty = Decimal(str(quantity))

    # 1. Списать компоненты
    for comp in components:
        comp_nomenclature = comp['nomenclature']
        comp_qty = Decimal(str(comp['quantity'])) * bouquet_qty

        # Услуги не участвуют в складском учёте — пропускаем FIFO-списание
        if comp_nomenclature.nomenclature_type == 'service':
            continue

        fifo_result = fifo_write_off(
            organization=organization,
            warehouse=warehouse_from,
            nomenclature=comp_nomenclature,
            quantity=comp_qty,
            user=user,
        )

        for r in fifo_result:
            StockMovement.objects.create(
                organization=organization,
                nomenclature=comp_nomenclature,
                movement_type=StockMovement.MovementType.ASSEMBLY,
                warehouse_from=warehouse_from,
                batch=r['batch'],
                quantity=r['qty'],
                price=r['price'],
                user=user,
                notes=f'Сборка букета: {nomenclature_bouquet.name}',
            )

        _update_stock_balance(
            organization, warehouse_from, comp_nomenclature, -comp_qty
        )

    # 2. Себестоимость букета — сумма себестоимости всех компонентов
    total_cost = Decimal('0')
    for comp in components:
        comp_nomenclature = comp['nomenclature']
        comp_qty = Decimal(str(comp['quantity'])) * bouquet_qty
        # Подсчитаем стоимость по средней закупочной
        sb = StockBalance.objects.filter(
            organization=organization,
            warehouse=warehouse_from,
            nomenclature=comp_nomenclature,
        ).first()
        avg_price = sb.avg_purchase_price if sb else comp_nomenclature.purchase_price
        total_cost += avg_price * Decimal(str(comp['quantity']))

    cost_per_unit = total_cost if bouquet_qty == 1 else total_cost / bouquet_qty

    # 3. Оприходовать букет на склад
    batch = Batch.objects.create(
        organization=organization,
        nomenclature=nomenclature_bouquet,
        warehouse=warehouse_to,
        purchase_price=cost_per_unit,
        quantity=bouquet_qty,
        remaining=bouquet_qty,
        arrival_date=timezone.now().date(),
        notes=notes or 'Сборка букета',
    )

    StockMovement.objects.create(
        organization=organization,
        nomenclature=nomenclature_bouquet,
        movement_type=StockMovement.MovementType.RECEIPT,
        warehouse_to=warehouse_to,
        batch=batch,
        quantity=bouquet_qty,
        price=cost_per_unit,
        user=user,
        notes=f'Сборка букета: {nomenclature_bouquet.name}',
    )

    _update_stock_balance(organization, warehouse_to, nomenclature_bouquet, bouquet_qty)

    # Обновить себестоимость букета в номенклатуре
    nomenclature_bouquet.purchase_price = cost_per_unit
    nomenclature_bouquet.save(update_fields=['purchase_price'])

    return batch


@transaction.atomic
def disassemble_bouquet(
    organization, nomenclature_bouquet, warehouse,
    return_items, writeoff_items, user=None, notes='',
):
    """
    Раскомплектовка букета.

    return_items: [{'nomenclature': Nomenclature, 'quantity': Decimal}, ...]
       — компоненты, возвращаемые на склад
    writeoff_items: [{'nomenclature': Nomenclature, 'quantity': Decimal,
                      'reason': str}, ...]
       — компоненты, идущие в списание

    Процесс:
    1. FIFO-списание букета со склада (1 шт)
    2. Возврат компонентов → создание Batch + StockMovement(return) + StockBalance
    3. Списание компонентов → StockMovement(write_off)
    """
    # 1. Списать букет
    fifo_result = fifo_write_off(
        organization=organization,
        warehouse=warehouse,
        nomenclature=nomenclature_bouquet,
        quantity=Decimal('1'),
        user=user,
    )
    bouquet_cost = fifo_result[0]['price']

    for r in fifo_result:
        StockMovement.objects.create(
            organization=organization,
            nomenclature=nomenclature_bouquet,
            movement_type=StockMovement.MovementType.WRITE_OFF,
            warehouse_from=warehouse,
            batch=r['batch'],
            quantity=r['qty'],
            price=r['price'],
            user=user,
            notes=f'Раскомплектовка букета: {nomenclature_bouquet.name}',
        )

    _update_stock_balance(
        organization, warehouse, nomenclature_bouquet, Decimal('-1')
    )

    # 2. Возврат компонентов на склад
    for item in return_items:
        comp_nom = item['nomenclature']
        comp_qty = Decimal(str(item['quantity']))
        if comp_qty <= 0:
            continue

        # Создаём новую партию с закупочной ценой компонента
        batch = Batch.objects.create(
            organization=organization,
            nomenclature=comp_nom,
            warehouse=warehouse,
            purchase_price=comp_nom.purchase_price,
            quantity=comp_qty,
            remaining=comp_qty,
            arrival_date=timezone.now().date(),
            notes=f'Раскомплектовка: {nomenclature_bouquet.name}',
        )
        StockMovement.objects.create(
            organization=organization,
            nomenclature=comp_nom,
            movement_type=StockMovement.MovementType.RETURN,
            warehouse_to=warehouse,
            batch=batch,
            quantity=comp_qty,
            price=comp_nom.purchase_price,
            user=user,
            notes=f'Возврат из раскомплектовки: {nomenclature_bouquet.name}',
        )
        _update_stock_balance(organization, warehouse, comp_nom, comp_qty)

    # 3. Списание компонентов
    for item in writeoff_items:
        comp_nom = item['nomenclature']
        comp_qty = Decimal(str(item['quantity']))
        reason = item.get('reason', 'other')
        if comp_qty <= 0:
            continue

        StockMovement.objects.create(
            organization=organization,
            nomenclature=comp_nom,
            movement_type=StockMovement.MovementType.WRITE_OFF,
            warehouse_from=warehouse,
            quantity=comp_qty,
            price=comp_nom.purchase_price,
            write_off_reason=reason,
            user=user,
            notes=f'Списание из раскомплектовки: {nomenclature_bouquet.name}',
        )

    return True


@transaction.atomic
def write_off_stock(
    organization, warehouse, nomenclature,
    quantity: Decimal, reason: str = 'other',
    user=None, notes='',
):
    """
    Ручное списание товара со склада (FIFO).
    """
    fifo_result = fifo_write_off(
        organization=organization,
        warehouse=warehouse,
        nomenclature=nomenclature,
        quantity=quantity,
        user=user,
    )

    for r in fifo_result:
        StockMovement.objects.create(
            organization=organization,
            nomenclature=nomenclature,
            movement_type=StockMovement.MovementType.WRITE_OFF,
            warehouse_from=warehouse,
            batch=r['batch'],
            quantity=r['qty'],
            price=r['price'],
            write_off_reason=reason,
            user=user,
            notes=notes or 'Списание',
        )

    _update_stock_balance(organization, warehouse, nomenclature, -quantity)

    total_cost = sum(r['qty'] * r['price'] for r in fifo_result)
    return {'items': fifo_result, 'total_cost': total_cost}


@transaction.atomic
def transfer_stock(
    organization, warehouse_from, warehouse_to,
    nomenclature, quantity: Decimal,
    user=None, notes='',
):
    """
    Перемещение товара между складами (FIFO с исходного склада).
    """
    fifo_result = fifo_write_off(
        organization=organization,
        warehouse=warehouse_from,
        nomenclature=nomenclature,
        quantity=quantity,
        user=user,
    )

    # Средневзвешенная цена перемещаемого товара
    total_cost = sum(r['qty'] * r['price'] for r in fifo_result)
    avg_price = total_cost / quantity if quantity else Decimal('0')

    # Создаём партию на целевом складе
    batch = Batch.objects.create(
        organization=organization,
        nomenclature=nomenclature,
        warehouse=warehouse_to,
        purchase_price=avg_price,
        quantity=quantity,
        remaining=quantity,
        arrival_date=timezone.now().date(),
        notes=notes or f'Перемещение с {warehouse_from.name}',
    )

    StockMovement.objects.create(
        organization=organization,
        nomenclature=nomenclature,
        movement_type=StockMovement.MovementType.TRANSFER,
        warehouse_from=warehouse_from,
        warehouse_to=warehouse_to,
        batch=batch,
        quantity=quantity,
        price=avg_price,
        user=user,
        notes=notes or f'Перемещение: {warehouse_from.name} → {warehouse_to.name}',
    )

    _update_stock_balance(organization, warehouse_from, nomenclature, -quantity)
    _update_stock_balance(organization, warehouse_to, nomenclature, quantity)

    return batch
