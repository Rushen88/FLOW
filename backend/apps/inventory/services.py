"""
Бизнес-логика складского учёта.

Основные операции:
- FIFO-списание (fifo_write_off) — списание товара с самых старых партий
- Приход товара (process_batch_receipt) — создание партии + движение + остатки
- Сборка букета (assemble_bouquet) — списание компонентов + оприходование букета
- Раскомплектовка букета (disassemble_bouquet) — списание букета + возврат/списание компонентов
- Списание товара (write_off_stock) — ручное списание с FIFO
"""

from collections import defaultdict
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


def build_stock_summary(organization, trading_point_id=None, warehouse_id=None):
    """
    Агрегированные остатки по номенклатуре для блока продаж.
    Возвращает список словарей с total_qty и детализацией по складам.
    """
    qs = StockBalance.objects.filter(
        organization=organization,
        quantity__gt=0,
    ).select_related('nomenclature', 'warehouse', 'warehouse__trading_point')
    qs = qs.exclude(nomenclature__nomenclature_type='service')

    if trading_point_id:
        qs = qs.filter(warehouse__trading_point_id=trading_point_id)
    if warehouse_id:
        qs = qs.filter(warehouse_id=warehouse_id)

    groups = defaultdict(
        lambda: {
            'nomenclature': '',
            'nomenclature_name': '',
            'total_qty': Decimal('0'),
            'warehouses': [],
        }
    )

    for stock_balance in qs:
        key = str(stock_balance.nomenclature_id)
        groups[key]['nomenclature'] = key
        groups[key]['nomenclature_name'] = stock_balance.nomenclature.name
        groups[key]['total_qty'] += stock_balance.quantity
        groups[key]['warehouses'].append({
            'warehouse': str(stock_balance.warehouse_id),
            'warehouse_name': stock_balance.warehouse.name,
            'trading_point': str(stock_balance.warehouse.trading_point_id) if stock_balance.warehouse.trading_point_id else '',
            'is_default_for_sales': bool(getattr(stock_balance.warehouse, 'is_default_for_sales', False)),
            'qty': str(stock_balance.quantity),
        })

    return [{
        'nomenclature': value['nomenclature'],
        'nomenclature_name': value['nomenclature_name'],
        'total_qty': str(value['total_qty']),
        'total_quantity': str(value['total_qty']),
        'warehouses': value['warehouses'],
    } for value in groups.values()]


def _update_stock_balance(organization, warehouse, nomenclature, qty_delta: Decimal):
    """Обновить (или создать) StockBalance по складу + номенклатуре."""
    from django.db.models import Sum, F

    sb, created = StockBalance.objects.get_or_create(
        organization=organization,
        warehouse=warehouse,
        nomenclature=nomenclature,
        defaults={'quantity': Decimal('0'), 'avg_purchase_price': Decimal('0')},
    )
    sb.quantity += qty_delta

    # Пересчитываем среднюю закупочную через DB aggregate (вместо Python-loop)
    agg = Batch.objects.filter(
        organization=organization,
        warehouse=warehouse,
        nomenclature=nomenclature,
        remaining__gt=0,
    ).aggregate(
        total_remaining=Sum('remaining'),
        total_cost=Sum(F('remaining') * F('purchase_price')),
    )
    total_remaining = agg['total_remaining'] or Decimal('0')
    if total_remaining > 0:
        sb.avg_purchase_price = (agg['total_cost'] or Decimal('0')) / total_remaining
    sb.save()
    return sb


@transaction.atomic
def fifo_write_off(organization, warehouse, nomenclature, quantity: Decimal, user=None):
    """
    FIFO-списание: снимаем `quantity` единиц товара с самых старых партий.

    Возвращает список dict: [{'batch': Batch, 'qty': Decimal, 'price': Decimal}, ...]
    Бросает InsufficientStockError если не хватает.
    
    ВАЖНО: функция должна вызываться внутри транзакции или сама создаёт атомарную транзакцию.
    select_for_update() блокирует строки до завершения транзакции.
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
    if getattr(nomenclature, 'nomenclature_type', '') == 'service':
        raise ValueError('Услуги нельзя проводить через поступления.')

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

        # Enterprise Architecture: Автоматическое создание обязательства (Debt) перед поставщиком
        # Приходуя товар, бизнес становится должен поставщику, пока не будет проведена транзакция оплаты.
        from apps.finance.models import Debt
        total_batch_cost = quantity * purchase_price
        if total_batch_cost > 0:
            Debt.objects.create(
                organization=organization,
                debt_type=Debt.DebtType.SUPPLIER,
                direction=Debt.Direction.WE_OWE,
                counterparty_name=supplier.name,
                supplier=supplier,
                amount=total_batch_cost,
                notes=f'За поставку партии {nomenclature.name} ({quantity} шт). Накладная: {invoice_number}'
            )

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
                sale=sale,
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

    components: [{'nomenclature': Nomenclature, 'quantity': Decimal, 'warehouse': Warehouse?}, ...]
       (количество PER ONE букет — если quantity > 1, будет умножено)

    Процесс:
    1. FIFO-списание компонентов (по каждому может быть указан свой склад)
    2. Создание StockMovement(assembly) для каждого компонента
    3. Оприходование букета на warehouse_to
    """
    bouquet_qty = Decimal(str(quantity))

    # 1. Списать компоненты
    total_cost = Decimal('0')
    for comp in components:
        comp_nomenclature = comp['nomenclature']
        comp_qty = Decimal(str(comp['quantity'])) * bouquet_qty
        comp_warehouse = comp.get('warehouse') or warehouse_from

        # Услуги не участвуют в складском учёте — пропускаем FIFO-списание
        if comp_nomenclature.nomenclature_type == 'service':
            continue

        # В ручной сборке мы не разрешаем уход в минус (в отличие от продаж).
        # fifo_write_off бросит InsufficientStockError при нехватке.
        fifo_result = fifo_write_off(
            organization=organization,
            warehouse=comp_warehouse,
            nomenclature=comp_nomenclature,
            quantity=comp_qty,
            user=user,
        )

        for r in fifo_result:
            StockMovement.objects.create(
                organization=organization,
                nomenclature=comp_nomenclature,
                movement_type=StockMovement.MovementType.ASSEMBLY,
                warehouse_from=comp_warehouse,
                batch=r['batch'],
                quantity=r['qty'],
                price=r['price'],
                user=user,
                notes=f'Сборка букета: {nomenclature_bouquet.name}',
            )
            # Точный расчёт себестоимости по FIFO-партиям
            total_cost += Decimal(str(r['qty'])) * r['price']

        _update_stock_balance(
            organization, comp_warehouse, comp_nomenclature, -comp_qty
        )

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

    # 3. Списание компонентов (через FIFO + обновление StockBalance)
    for item in writeoff_items:
        comp_nom = item['nomenclature']
        comp_qty = Decimal(str(item['quantity']))
        reason = item.get('reason', 'other')
        if comp_qty <= 0:
            continue

        try:
            wo_result = fifo_write_off(
                organization=organization,
                warehouse=warehouse,
                nomenclature=comp_nom,
                quantity=comp_qty,
                user=user,
            )
            for r in wo_result:
                StockMovement.objects.create(
                    organization=organization,
                    nomenclature=comp_nom,
                    movement_type=StockMovement.MovementType.WRITE_OFF,
                    warehouse_from=warehouse,
                    batch=r['batch'],
                    quantity=r['qty'],
                    price=r['price'],
                    write_off_reason=reason,
                    user=user,
                    notes=f'Списание из раскомплектовки: {nomenclature_bouquet.name}',
                )
        except InsufficientStockError:
            # Если партий не хватает — списываем без привязки к партии
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
        _update_stock_balance(organization, warehouse, comp_nom, -comp_qty)

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


@transaction.atomic
def correct_bouquet_stock(
    organization,
    bouquet_nomenclature,
    warehouse,
    rows,
    user=None,
):
    """
    Коррекция состава букета в остатках.

    rows: [{
        'nomenclature': Nomenclature,
        'writeoff_qty': Decimal,
        'return_qty': Decimal,
        'add_qty': Decimal,
        'reason': str,
        'return_warehouse': Warehouse|None,
        'add_warehouse': Warehouse|None,
    }]
    """
    fifo_result = fifo_write_off(
        organization=organization,
        warehouse=warehouse,
        nomenclature=bouquet_nomenclature,
        quantity=Decimal('1'),
        user=user,
    )

    bouquet_cost = fifo_result[0]['price'] if fifo_result else bouquet_nomenclature.purchase_price

    for row in fifo_result:
        StockMovement.objects.create(
            organization=organization,
            nomenclature=bouquet_nomenclature,
            movement_type=StockMovement.MovementType.WRITE_OFF,
            warehouse_from=warehouse,
            batch=row['batch'],
            quantity=row['qty'],
            price=row['price'],
            user=user,
            notes=f'Коррекция букета: {bouquet_nomenclature.name}',
        )
    _update_stock_balance(organization, warehouse, bouquet_nomenclature, Decimal('-1'))

    for row in rows:
        nomenclature = row['nomenclature']
        if nomenclature.nomenclature_type == 'service':
            continue

        writeoff_qty = Decimal(str(row.get('writeoff_qty', 0) or 0))
        return_qty = Decimal(str(row.get('return_qty', 0) or 0))
        add_qty = Decimal(str(row.get('add_qty', 0) or 0))
        reason = row.get('reason', 'other')

        if return_qty > 0:
            return_wh = row.get('return_warehouse') or warehouse
            batch = Batch.objects.create(
                organization=organization,
                nomenclature=nomenclature,
                warehouse=return_wh,
                purchase_price=nomenclature.purchase_price,
                quantity=return_qty,
                remaining=return_qty,
                arrival_date=timezone.now().date(),
                notes=f'Возврат из коррекции: {bouquet_nomenclature.name}',
            )
            StockMovement.objects.create(
                organization=organization,
                nomenclature=nomenclature,
                movement_type=StockMovement.MovementType.RETURN,
                warehouse_to=return_wh,
                batch=batch,
                quantity=return_qty,
                price=nomenclature.purchase_price,
                user=user,
                notes=f'Возврат из коррекции: {bouquet_nomenclature.name}',
            )
            _update_stock_balance(organization, return_wh, nomenclature, return_qty)

        if writeoff_qty > 0:
            try:
                write_off_result = fifo_write_off(
                    organization=organization,
                    warehouse=warehouse,
                    nomenclature=nomenclature,
                    quantity=writeoff_qty,
                    user=user,
                )
                for write_off_row in write_off_result:
                    StockMovement.objects.create(
                        organization=organization,
                        nomenclature=nomenclature,
                        movement_type=StockMovement.MovementType.WRITE_OFF,
                        warehouse_from=warehouse,
                        batch=write_off_row['batch'],
                        quantity=write_off_row['qty'],
                        price=write_off_row['price'],
                        write_off_reason=reason,
                        user=user,
                        notes=f'Списание из коррекции: {bouquet_nomenclature.name}',
                    )
                _update_stock_balance(organization, warehouse, nomenclature, -writeoff_qty)
            except InsufficientStockError:
                StockMovement.objects.create(
                    organization=organization,
                    nomenclature=nomenclature,
                    movement_type=StockMovement.MovementType.WRITE_OFF,
                    warehouse_from=warehouse,
                    quantity=writeoff_qty,
                    price=nomenclature.purchase_price,
                    write_off_reason=reason,
                    user=user,
                    notes=f'Списание из коррекции: {bouquet_nomenclature.name}',
                )
                _update_stock_balance(organization, warehouse, nomenclature, -writeoff_qty)

        if add_qty > 0:
            add_wh = row.get('add_warehouse') or warehouse
            add_fifo = fifo_write_off(
                organization=organization,
                warehouse=add_wh,
                nomenclature=nomenclature,
                quantity=add_qty,
                user=user,
            )
            for add_row in add_fifo:
                StockMovement.objects.create(
                    organization=organization,
                    nomenclature=nomenclature,
                    movement_type=StockMovement.MovementType.ASSEMBLY,
                    warehouse_from=add_wh,
                    batch=add_row['batch'],
                    quantity=add_row['qty'],
                    price=add_row['price'],
                    user=user,
                    notes=f'Добавление в коррекцию: {bouquet_nomenclature.name}',
                )
            _update_stock_balance(organization, add_wh, nomenclature, -add_qty)

    corrected_batch = Batch.objects.create(
        organization=organization,
        nomenclature=bouquet_nomenclature,
        warehouse=warehouse,
        purchase_price=bouquet_cost,
        quantity=Decimal('1'),
        remaining=Decimal('1'),
        arrival_date=timezone.now().date(),
        notes=f'Скорректированный букет: {bouquet_nomenclature.name}',
    )
    StockMovement.objects.create(
        organization=organization,
        nomenclature=bouquet_nomenclature,
        movement_type=StockMovement.MovementType.RECEIPT,
        warehouse_to=warehouse,
        batch=corrected_batch,
        quantity=Decimal('1'),
        price=bouquet_cost,
        user=user,
        notes=f'Коррекция букета: {bouquet_nomenclature.name}',
    )
    _update_stock_balance(organization, warehouse, bouquet_nomenclature, Decimal('1'))

    return corrected_batch
