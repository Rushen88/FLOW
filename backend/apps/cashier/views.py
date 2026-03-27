"""
Кассовый модуль (POS) — views.
"""
import re
from collections import defaultdict
from decimal import Decimal
from django.db import transaction as db_transaction
from django.db.models import Sum, Q, F, Max
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination

from apps.core.mixins import OrgPerformCreateMixin, _tenant_filter, _resolve_org, _resolve_tp
from apps.sales.models import SalesCategory, Sale, SaleItem, SaleItemComposition
from apps.inventory.models import (
    Batch, StockBalance, Reserve, BouquetBatchComponentSnapshot,
)
from apps.inventory.services import (
    fifo_write_off, _update_stock_balance, InsufficientStockError,
)
from apps.nomenclature.models import Nomenclature, NomenclatureGroup

from .serializers import (
    SalesCategorySerializer, ReserveCashierSerializer, ReserveCreateSerializer,
    CashierFeedItemSerializer, CheckoutSerializer, BouquetSnapshotSerializer,
)


# ─── Helpers ────────────────────────────────────────────────
def _normalize_phone(phone: str) -> str:
    return re.sub(r'\D', '', phone)


def _bouquet_image_url(batch, nomenclature):
    if getattr(batch, 'image', None):
        return batch.image.url
    try:
        template = nomenclature.bouquet_template
    except Exception:
        template = None
    if template and getattr(template, 'image', None):
        return template.image.url
    if getattr(nomenclature, 'image', None):
        return nomenclature.image.url
    return ''


def _ensure_default_categories(org):
    """Создать системные и пользовательские категории по умолчанию, если их нет."""
    defaults = [
        {'name': 'Готовые букеты', 'source_type': 'finished_bouquets', 'is_system': True, 'icon': 'LocalFlorist', 'sort_order': 1},
        {'name': 'Резерв', 'source_type': 'reserve', 'is_system': True, 'icon': 'BookmarkBorder', 'sort_order': 2},
    ]
    for d in defaults:
        SalesCategory.objects.get_or_create(
            organization=org, source_type=d['source_type'], is_system=True,
            defaults=d,
        )


# ─── Pagination ─────────────────────────────────────────────
class SmallPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 200


# ═══════════════════════════════════════════════════════════
# CATEGORIES CRUD
# ═══════════════════════════════════════════════════════════
class SalesCategoryViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = SalesCategorySerializer
    queryset = SalesCategory.objects.all()
    pagination_class = None

    def get_queryset(self):
        qs = SalesCategory.objects.prefetch_related('groups')
        return _tenant_filter(qs, self.request.user)

    def list(self, request, *args, **kwargs):
        org = _resolve_org(request.user)
        if org:
            _ensure_default_categories(org)
        return super().list(request, *args, **kwargs)

    def perform_destroy(self, instance):
        if instance.is_system:
            from rest_framework.exceptions import ValidationError
            raise ValidationError('Системные категории нельзя удалить.')
        instance.delete()


# ═══════════════════════════════════════════════════════════
# POS FEED — unified product catalog for cashier
# ═══════════════════════════════════════════════════════════
class CashierFeedView(viewsets.ViewSet):
    """
    GET /api/cashier/feed/?trading_point=...&category_id=...&q=...
    Универсальный каталог товаров для кассы.
    """
    permission_classes = [IsAuthenticated]

    def list(self, request):
        org = _resolve_org(request.user)
        if not org:
            return Response([])

        tp_id = request.query_params.get('trading_point')
        if not tp_id:
            tp = _resolve_tp(request.user)
            tp_id = str(tp.id) if tp else None

        category_id = request.query_params.get('category_id')
        q = (request.query_params.get('q') or '').strip()

        items = []

        if category_id:
            try:
                cat = SalesCategory.objects.get(pk=category_id, organization=org)
            except SalesCategory.DoesNotExist:
                return Response([])

            if cat.source_type == 'nomenclature':
                items = self._feed_nomenclature(org, tp_id, cat, q)
            elif cat.source_type == 'finished_bouquets':
                items = self._feed_bouquets(org, tp_id, q)
            elif cat.source_type == 'reserve':
                items = self._feed_reserves(org, tp_id, q)
        else:
            # Global search across all sources
            items += self._feed_nomenclature(org, tp_id, None, q)
            items += self._feed_bouquets(org, tp_id, q)
            items += self._feed_reserves(org, tp_id, q)

        return Response(items)

    def _expand_category_group_ids(self, org, category):
        root_group_ids = list(category.groups.values_list('id', flat=True))
        if not root_group_ids:
            return set()

        children_map = defaultdict(list)
        for group_id, parent_id in NomenclatureGroup.objects.filter(
            organization=org,
        ).values_list('id', 'parent_id'):
            if parent_id:
                children_map[parent_id].append(group_id)

        expanded_ids = set(root_group_ids)
        stack = list(root_group_ids)
        while stack:
            current_group_id = stack.pop()
            for child_group_id in children_map.get(current_group_id, []):
                if child_group_id in expanded_ids:
                    continue
                expanded_ids.add(child_group_id)
                stack.append(child_group_id)

        return expanded_ids

    def _feed_nomenclature(self, org, tp_id, category, q):
        qs = Nomenclature.objects.filter(
            organization=org, is_active=True, is_deleted=False,
            accounting_type__in=['stock_material', 'service'],
        )
        if category and category.groups.exists():
            group_ids = self._expand_category_group_ids(org, category)
            qs = qs.filter(group_id__in=group_ids)
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(sku__icontains=q))

        # Get stock balances aggregated by nomenclature for the trading point
        balance_map = {}
        if tp_id:
            balances = StockBalance.objects.filter(
                organization=org, warehouse__trading_point_id=tp_id,
            ).values('nomenclature_id').annotate(total=Sum('quantity'))
            balance_map = {str(b['nomenclature_id']): b['total'] for b in balances}

        result = []
        for nom in qs[:100]:
            avail = balance_map.get(str(nom.id), Decimal('0'))
            badge = ''
            if nom.accounting_type == 'service':
                badge = 'Услуга'
            result.append({
                'source_type': 'nomenclature',
                'item_id': str(nom.id),
                'title': nom.name,
                'subtitle': nom.group.name if nom.group else '',
                'image': nom.image.url if nom.image else '',
                'price': nom.retail_price,
                'available_qty': avail,
                'badge': badge,
                'payload': {
                    'nomenclature': str(nom.id),
                    'source_mode': 'catalog',
                    'accounting_type': nom.accounting_type,
                },
                'reserve_id': '',
                'reserve_number': 0,
                'customer_name': '',
                'phone': '',
                'expires_at': None,
            })
        return result

    def _feed_bouquets(self, org, tp_id, q):
        """Готовые букеты в наличии (finished_bouquet), минус active-резервы."""
        batch_qs = Batch.objects.filter(
            organization=org, remaining__gt=0,
            nomenclature__accounting_type='finished_bouquet',
        )
        if tp_id:
            batch_qs = batch_qs.filter(warehouse__trading_point_id=tp_id)
        if q:
            batch_qs = batch_qs.filter(nomenclature__name__icontains=q)

        # Sum reserved quantities
        reserved = defaultdict(Decimal)
        for r in Reserve.objects.filter(
            organization=org, status='active',
        ).values('batch_id').annotate(total=Sum('quantity')):
            reserved[str(r['batch_id'])] = r['total']

        batch_qs = batch_qs.select_related('nomenclature', 'warehouse', 'nomenclature__bouquet_template')
        result = []
        for batch in batch_qs[:100]:
            avail = batch.remaining - reserved.get(str(batch.id), Decimal('0'))
            if avail <= 0:
                continue
            nom = batch.nomenclature
            result.append({
                'source_type': 'finished_bouquets',
                'item_id': str(batch.id),
                'title': nom.name,
                'subtitle': f'Склад: {batch.warehouse.name}',
                'image': _bouquet_image_url(batch, nom),
                'price': nom.retail_price,
                'available_qty': avail,
                'badge': 'Букет',
                'payload': {
                    'nomenclature': str(nom.id),
                    'batch': str(batch.id),
                    'warehouse': str(batch.warehouse_id),
                    'source_mode': 'ready_bouquet',
                    'accounting_type': nom.accounting_type,
                },
                'reserve_id': '',
                'reserve_number': 0,
                'customer_name': '',
                'phone': '',
                'expires_at': None,
            })
        return result

    def _feed_reserves(self, org, tp_id, q):
        """Активные резервы по торговой точке."""
        qs = Reserve.objects.filter(organization=org, status='active')
        if tp_id:
            qs = qs.filter(trading_point_id=tp_id)
        # Exclude expired
        qs = qs.filter(Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now()))
        if q:
            qs = qs.filter(
                Q(customer_name_snapshot__icontains=q)
                | Q(phone__icontains=q)
                | Q(phone_last4__endswith=q[-4:] if len(q) >= 4 else q)
                | Q(reserve_number__icontains=q)
                | Q(order__number__icontains=q)
            )
        qs = qs.select_related('bouquet_nomenclature', 'bouquet_nomenclature__bouquet_template', 'batch', 'warehouse')
        qs = qs.order_by('expires_at', 'created_at')[:50]

        result = []
        for r in qs:
            nom = r.bouquet_nomenclature
            result.append({
                'source_type': 'reserve',
                'item_id': str(r.id),
                'title': nom.name if nom else 'Резерв',
                'subtitle': f'#{r.reserve_number}  {r.customer_name_snapshot}',
                'image': _bouquet_image_url(r.batch, nom) if nom and r.batch else (nom.image.url if nom and nom.image else ''),
                'price': nom.retail_price if nom else Decimal('0'),
                'available_qty': r.quantity,
                'badge': 'Резерв',
                'payload': {
                    'nomenclature': str(nom.id) if nom else '',
                    'batch': str(r.batch_id) if r.batch_id else '',
                    'warehouse': str(r.warehouse_id),
                    'reserve': str(r.id),
                    'source_mode': 'reserve',
                    'accounting_type': nom.accounting_type if nom else '',
                },
                'reserve_id': str(r.id),
                'reserve_number': r.reserve_number or 0,
                'customer_name': r.customer_name_snapshot,
                'phone': r.phone,
                'expires_at': r.expires_at,
            })
        return result


# ═══════════════════════════════════════════════════════════
# RESERVES CRUD
# ═══════════════════════════════════════════════════════════
class ReserveViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = ReserveCashierSerializer
    queryset = Reserve.objects.all()
    pagination_class = SmallPagination

    def get_queryset(self):
        qs = Reserve.objects.select_related(
            'bouquet_nomenclature', 'batch', 'warehouse', 'customer',
        )
        qs = _tenant_filter(qs, self.request.user)
        st = self.request.query_params.get('status')
        if st:
            qs = qs.filter(status=st)
        return qs

    def create(self, request, *args, **kwargs):
        ser = ReserveCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data

        org = _resolve_org(request.user)
        tp = _resolve_tp(request.user)
        if not org or not tp:
            return Response({'detail': 'Не задана организация/точка.'}, status=400)

        from apps.core.models import Warehouse
        from apps.sales.services import lock_organization_row
        nom = Nomenclature.objects.get(pk=d['bouquet_nomenclature'])
        batch = Batch.objects.get(pk=d['batch'])
        wh = Warehouse.objects.get(pk=d['warehouse'])

        phone = d.get('phone', '')
        phone_norm = _normalize_phone(phone)

        lock_organization_row(org.id)
        next_number = (Reserve.objects.filter(organization=org).aggregate(
            mx=Max('reserve_number'))['mx'] or 0) + 1

        reserve = Reserve.objects.create(
            organization=org,
            trading_point=tp,
            reserve_number=next_number,
            customer_id=d.get('customer'),
            customer_name_snapshot=d.get('customer_name_snapshot', ''),
            phone=phone,
            phone_normalized=phone_norm,
            phone_last4=phone_norm[-4:] if len(phone_norm) >= 4 else phone_norm,
            expires_at=d.get('expires_at'),
            comment=d.get('comment', ''),
            bouquet_nomenclature=nom,
            batch=batch,
            warehouse=wh,
            quantity=d.get('quantity', 1),
        )
        return Response(ReserveCashierSerializer(reserve).data, status=201)

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel(self, request, pk=None):
        reserve = self.get_object()
        if reserve.status != 'active':
            return Response({'detail': 'Можно отменить только активный резерв.'}, status=400)
        reserve.status = 'cancelled'
        reserve.cancelled_at = timezone.now()
        reserve.save(update_fields=['status', 'cancelled_at', 'updated_at'])
        return Response({'status': 'ok'})

    @action(detail=True, methods=['post'], url_path='expire')
    def expire(self, request, pk=None):
        reserve = self.get_object()
        if reserve.status != 'active':
            return Response({'detail': 'Можно просрочить только активный резерв.'}, status=400)
        reserve.status = 'expired'
        reserve.save(update_fields=['status', 'updated_at'])
        return Response({'status': 'ok'})

    @action(detail=False, methods=['get'], url_path='search')
    def search(self, request):
        q = (request.query_params.get('q') or '').strip()
        if not q:
            return Response([])
        org = _resolve_org(request.user)
        tp = _resolve_tp(request.user)
        qs = Reserve.objects.filter(organization=org, status='active')
        if tp:
            qs = qs.filter(trading_point=tp)
        qs = qs.filter(
            Q(customer_name_snapshot__icontains=q)
            | Q(phone__icontains=q)
            | Q(phone_last4__endswith=q[-4:] if len(q) >= 4 else q)
            | Q(reserve_number__icontains=q)
        )
        qs = qs.select_related('bouquet_nomenclature')[:20]
        return Response(ReserveCashierSerializer(qs, many=True).data)


# ═══════════════════════════════════════════════════════════
# CHECKOUT — основной сценарий кассы
# ═══════════════════════════════════════════════════════════
class CheckoutView(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    @db_transaction.atomic
    def create(self, request):
        """POST /api/cashier/checkout/"""
        ser = CheckoutSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data

        org = _resolve_org(request.user)
        tp = _resolve_tp(request.user)
        if not org or not tp:
            return Response({'detail': 'Не задана организация/торговая точка.'}, status=400)

        lines = d.get('cart_lines', [])
        if not lines:
            return Response({'detail': 'Корзина пуста.'}, status=400)

        # Create Sale
        from apps.core.models import PaymentMethod
        from apps.sales.services import generate_sale_number, lock_organization_row

        lock_organization_row(org.id)
        sale_number = generate_sale_number(org)
        sale = Sale.objects.create(
            organization=org,
            trading_point=tp,
            number=str(sale_number),
            status=Sale.Status.COMPLETED,
            customer_id=d.get('customer'),
            seller=request.user,
            payment_method_id=d.get('payment_method'),
            discount_percent=d.get('discount_percent', 0),
            discount_amount=d.get('discount_amount', 0),
            notes=d.get('notes', ''),
            is_paid=True,
            completed_at=timezone.now(),
        )

        # Grab open cash shift if available
        from apps.finance.models import CashShift
        shift = CashShift.objects.filter(
            trading_point=tp, status='open',
        ).first()
        if shift:
            sale.cash_shift = shift
            sale.save(update_fields=['cash_shift'])

        subtotal = Decimal('0')
        total_cost = Decimal('0')

        for line in lines:
            sm = line['source_mode']
            nom = Nomenclature.objects.select_for_update().get(pk=line['nomenclature'])
            qty = Decimal(str(line['quantity']))
            price = Decimal(str(line['price']))
            discount = Decimal(str(line.get('discount_percent', 0)))
            line_total = price * qty * (1 - discount / 100)
            subtotal += line_total

            if sm == 'catalog':
                # Обычный товар или услуга
                cost = self._sell_catalog(org, nom, qty, line, sale, request.user)
                total_cost += cost

            elif sm == 'ready_bouquet':
                cost = self._sell_bouquet(org, nom, qty, price, discount, line, sale, request.user)
                total_cost += cost

            elif sm == 'reserve':
                cost = self._sell_reserve(org, nom, qty, price, discount, line, sale, request.user)
                total_cost += cost

        # Update Sale totals
        header_discount_percent = Decimal(str(d.get('discount_percent', 0) or 0))
        header_discount_amount = Decimal(str(d.get('discount_amount', 0) or 0))
        total_discount = (subtotal * header_discount_percent / Decimal('100')) + header_discount_amount

        sale.subtotal = subtotal
        sale.discount_percent = header_discount_percent
        sale.discount_amount = total_discount
        sale.total = max(subtotal - total_discount, Decimal('0'))
        sale.save(update_fields=['subtotal', 'discount_percent', 'discount_amount', 'total'])

        # Financial transaction
        from apps.finance.models import FinancialTransaction, CashShift
        if sale.payment_method_id:
            try:
                pm = PaymentMethod.objects.get(pk=sale.payment_method_id)
                if pm.wallet_id:
                    FinancialTransaction.objects.create(
                        organization=org,
                        transaction_type='income',
                        wallet_id=pm.wallet_id,
                        amount=sale.total,
                        category='sale',
                        description=f'Продажа через кассу #{sale.number}',
                        sale=sale,
                    )
            except PaymentMethod.DoesNotExist:
                pass

        return Response({
            'sale_id': str(sale.id),
            'sale_number': sale.number,
            'total': str(sale.total),
        }, status=201)

    def _sell_catalog(self, org, nom, qty, line, sale, user):
        """Продажа обычного материала или услуги."""
        price = Decimal(str(line['price']))
        discount = Decimal(str(line.get('discount_percent', 0)))
        line_total = price * qty * (1 - discount / 100)

        cost_price = Decimal('0')
        batch_ref = None

        if nom.accounting_type != 'service':
            from apps.core.models import Warehouse
            wh_id = line.get('warehouse')
            if not wh_id:
                wh = Warehouse.objects.filter(
                    organization=org,
                    trading_point=sale.trading_point,
                    is_default_for_sales=True,
                ).first()
                if not wh:
                    wh = Warehouse.objects.filter(
                        organization=org,
                        trading_point=sale.trading_point,
                    ).first()
            else:
                wh = Warehouse.objects.get(pk=wh_id)

            if wh:
                from apps.inventory.models import StockMovement
                fifo = fifo_write_off(org, wh, nom, qty, user)
                cost_total = sum(r['qty'] * r['price'] for r in fifo)
                cost_price = cost_total / qty if qty else Decimal('0')
                if len(fifo) == 1:
                    batch_ref = fifo[0]['batch']
                for r in fifo:
                    StockMovement.objects.create(
                        organization=org, nomenclature=nom,
                        movement_type='sale', warehouse_from=wh,
                        batch=r['batch'], quantity=r['qty'], price=r['price'],
                        sale=sale, user=user, notes=f'Касса #{sale.number}',
                    )
                _update_stock_balance(org, wh, nom, -qty)

        SaleItem.objects.create(
            sale=sale, nomenclature=nom, batch=batch_ref,
            quantity=qty, price=price, cost_price=cost_price,
            discount_percent=discount, total=line_total,
            source_mode='catalog',
        )
        return cost_price * qty

    def _sell_bouquet(self, org, nom, qty, price, discount, line, sale, user):
        """Продажа готового букета."""
        batch = Batch.objects.select_for_update().get(pk=line['batch'])
        if batch.remaining < qty:
            raise InsufficientStockError(nom.name, qty, batch.remaining)

        line_total = price * qty * (1 - discount / 100)
        cost_price = batch.purchase_price

        # Write-off the bouquet batch
        batch.remaining -= qty
        batch.save(update_fields=['remaining'])

        from apps.inventory.models import StockMovement
        StockMovement.objects.create(
            organization=org, nomenclature=nom,
            movement_type='sale', warehouse_from=batch.warehouse,
            batch=batch, quantity=qty, price=cost_price,
            sale=sale, user=user, notes=f'Касса #{sale.number} (букет)',
        )
        _update_stock_balance(org, batch.warehouse, nom, -qty)

        si = SaleItem.objects.create(
            sale=sale, nomenclature=nom, batch=batch,
            quantity=qty, price=price, cost_price=cost_price,
            discount_percent=discount, total=line_total,
            source_mode='ready_bouquet',
        )

        # Create SaleItemComposition from snapshot
        snapshots = BouquetBatchComponentSnapshot.objects.filter(batch=batch)
        for snap in snapshots:
            SaleItemComposition.objects.create(
                sale_item=si,
                nomenclature=snap.nomenclature,
                quantity=snap.quantity_per_unit * qty,
                price=snap.price_per_unit,
            )

        # Delete showcase photo if sold completely
        if batch.remaining <= 0 and batch.image:
            batch.image.delete(save=False)
            batch.image = None
            batch.save(update_fields=['image'])

        return cost_price * qty

    def _sell_reserve(self, org, nom, qty, price, discount, line, sale, user):
        """Продажа из резерва."""
        reserve = Reserve.objects.select_for_update().get(pk=line['reserve'])

        if reserve.status != 'active':
            from rest_framework.exceptions import ValidationError
            raise ValidationError(f'Резерв #{reserve.reserve_number} не активен (статус: {reserve.get_status_display()}).')

        if reserve.expires_at and reserve.expires_at < timezone.now():
            from rest_framework.exceptions import ValidationError
            raise ValidationError(f'Резерв #{reserve.reserve_number} просрочен.')

        batch = Batch.objects.select_for_update().get(pk=reserve.batch_id)
        if batch.remaining < qty:
            raise InsufficientStockError(nom.name, qty, batch.remaining)

        line_total = price * qty * (1 - discount / 100)
        cost_price = batch.purchase_price

        batch.remaining -= qty
        batch.save(update_fields=['remaining'])

        from apps.inventory.models import StockMovement
        StockMovement.objects.create(
            organization=org, nomenclature=nom,
            movement_type='sale', warehouse_from=batch.warehouse,
            batch=batch, quantity=qty, price=cost_price,
            sale=sale, user=user, notes=f'Касса #{sale.number} (резерв #{reserve.reserve_number})',
        )
        _update_stock_balance(org, batch.warehouse, nom, -qty)

        si = SaleItem.objects.create(
            sale=sale, nomenclature=nom, batch=batch,
            quantity=qty, price=price, cost_price=cost_price,
            discount_percent=discount, total=line_total,
            source_mode='reserve', reserve=reserve,
        )

        snapshots = BouquetBatchComponentSnapshot.objects.filter(batch=batch)
        for snap in snapshots:
            SaleItemComposition.objects.create(
                sale_item=si,
                nomenclature=snap.nomenclature,
                quantity=snap.quantity_per_unit * qty,
                price=snap.price_per_unit,
            )

        # Mark reserve as sold
        reserve.status = 'sold'
        reserve.sold_sale = sale
        reserve.sold_at = timezone.now()
        reserve.save(update_fields=['status', 'sold_sale', 'sold_at', 'updated_at'])

        if batch.remaining <= 0 and batch.image:
            batch.image.delete(save=False)
            batch.image = None
            batch.save(update_fields=['image'])

        return cost_price * qty


# ═══════════════════════════════════════════════════════════
# SNAPSHOT viewer
# ═══════════════════════════════════════════════════════════
class BouquetSnapshotViewSet(viewsets.ReadOnlyModelViewSet):
    """Просмотр снимков состава партий букетов."""
    serializer_class = BouquetSnapshotSerializer
    queryset = BouquetBatchComponentSnapshot.objects.all()
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = BouquetBatchComponentSnapshot.objects.select_related('nomenclature')
        batch_id = self.request.query_params.get('batch')
        if batch_id:
            qs = qs.filter(batch_id=batch_id)
        return qs
