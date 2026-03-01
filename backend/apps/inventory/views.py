from decimal import Decimal
from django.db import transaction as db_transaction
from django.db.models import Q

from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from .models import Batch, StockBalance, StockMovement, InventoryDocument, Reserve
from .serializers import (
    BatchSerializer, StockBalanceSerializer, StockMovementSerializer,
    InventoryDocumentSerializer, ReserveSerializer,
)
from .services import (
    process_batch_receipt, assemble_bouquet, disassemble_bouquet,
    write_off_stock, transfer_stock, InsufficientStockError, build_stock_summary, correct_bouquet_stock,
)
from apps.core.mixins import OrgPerformCreateMixin, _tenant_filter


def _validate_org_fk(obj, org, label='Объект'):
    """Проверка что FK принадлежит организации текущего пользователя."""
    if obj and hasattr(obj, 'organization_id') and str(obj.organization_id) != str(org.id):
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied(f'{label} не принадлежит вашей организации.')


class BatchViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    """
    Партии товара.
    При создании (POST) автоматически:
    - создаётся StockMovement (приход)
    - обновляется StockBalance
    - обновляется цена номенклатуры и цена у поставщика
    """
    serializer_class = BatchSerializer
    queryset = Batch.objects.all()
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['warehouse', 'nomenclature', 'supplier']

    def get_queryset(self):
        qs = Batch.objects.select_related('nomenclature', 'warehouse', 'supplier')
        qs = _tenant_filter(qs, self.request.user, tp_field='warehouse__trading_point')
        return qs.exclude(nomenclature__nomenclature_type='service')

    def create(self, request, *args, **kwargs):
        """Создание партии через сервисный слой (с auto-receipt)."""
        from apps.nomenclature.models import Nomenclature
        from apps.suppliers.models import Supplier
        from apps.core.models import Warehouse

        data = request.data
        from apps.core.mixins import _resolve_org
        org = _resolve_org(request.user)
        if not org:
            return Response(
                {'detail': 'Пользователь не привязан к организации.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            nomenclature = Nomenclature.objects.get(pk=data['nomenclature'])
            warehouse = Warehouse.objects.get(pk=data['warehouse'])
            supplier = None
            if data.get('supplier'):
                supplier = Supplier.objects.get(pk=data['supplier'])

            if nomenclature.nomenclature_type == 'service':
                return Response(
                    {'nomenclature': ['Услуги нельзя проводить через поступления.']},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Проверка принадлежности объектов организации
            _validate_org_fk(nomenclature, org, 'Номенклатура')
            _validate_org_fk(warehouse, org, 'Склад')
            if supplier:
                _validate_org_fk(supplier, org, 'Поставщик')

            batch = process_batch_receipt(
                organization=org,
                warehouse=warehouse,
                nomenclature=nomenclature,
                supplier=supplier,
                quantity=Decimal(str(data['quantity'])),
                purchase_price=Decimal(str(data['purchase_price'])),
                arrival_date=data.get('arrival_date'),
                expiry_date=data.get('expiry_date'),
                invoice_number=data.get('invoice_number', ''),
                notes=data.get('notes', ''),
                user=request.user,
            )
            serializer = self.get_serializer(batch)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except (Nomenclature.DoesNotExist, Warehouse.DoesNotExist, Supplier.DoesNotExist) as e:
            return Response(
                {'detail': f'Объект не найден: {e}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as e:
            return Response(
                {'detail': str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )


class StockBalanceViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = StockBalanceSerializer
    queryset = StockBalance.objects.all()
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['warehouse']
    search_fields = ['nomenclature__name']

    def get_queryset(self):
        qs = StockBalance.objects.select_related('nomenclature', 'warehouse')
        qs = _tenant_filter(qs, self.request.user, tp_field='warehouse__trading_point')
        return (
            qs
            .exclude(nomenclature__nomenclature_type='service')
            .exclude(
                Q(quantity=0)
                & Q(nomenclature__nomenclature_type__in=['bouquet', 'composition'])
            )
            .order_by('nomenclature__name')
        )

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        """
        Агрегированные остатки по номенклатуре (для продаж).
        Возвращает список {nomenclature, nomenclature_name, total_qty, warehouses: [{warehouse, warehouse_name, qty}]}
        Учитывает active_trading_point пользователя.
        """
        from apps.core.mixins import _resolve_org, _resolve_tp
        org = _resolve_org(request.user)
        if not org:
            return Response([])

        # Определяем торговую точку
        trading_point_id = request.query_params.get('trading_point')
        if not trading_point_id:
            tp = _resolve_tp(request.user)
            if tp:
                trading_point_id = str(tp.id)

        warehouse_id = request.query_params.get('warehouse')
        result = build_stock_summary(
            organization=org,
            trading_point_id=trading_point_id,
            warehouse_id=warehouse_id,
        )
        return Response(result)

    @action(detail=False, methods=['get'], url_path='negative-alerts')
    def negative_alerts(self, request):
        """
        Возвращает информацию о минусовых остатках по рабочей торговой точке пользователя.
        Используется для периодических напоминаний в UI.
        """
        from apps.core.mixins import _resolve_org, _resolve_tp

        org = _resolve_org(request.user)
        if not org:
            return Response({'count': 0, 'items': []})

        trading_point_id = request.query_params.get('trading_point')
        if not trading_point_id:
            tp = _resolve_tp(request.user)
            trading_point_id = str(tp.id) if tp else None

        qs = StockBalance.objects.filter(
            organization=org,
            quantity__lt=0,
        ).select_related('warehouse', 'nomenclature', 'warehouse__trading_point')

        if trading_point_id:
            qs = qs.filter(warehouse__trading_point_id=trading_point_id)

        items = [
            {
                'nomenclature': str(sb.nomenclature_id),
                'nomenclature_name': sb.nomenclature.name,
                'warehouse': str(sb.warehouse_id),
                'warehouse_name': sb.warehouse.name,
                'quantity': str(sb.quantity),
            }
            for sb in qs.order_by('quantity')[:10]
        ]
        return Response({'count': qs.count(), 'items': items})


class StockMovementViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = StockMovementSerializer
    queryset = StockMovement.objects.all()
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['movement_type', 'warehouse_from', 'warehouse_to']

    def get_queryset(self):
        qs = StockMovement.objects.select_related('nomenclature')
        return _tenant_filter(qs, self.request.user)

    @action(detail=False, methods=['post'], url_path='write-off')
    def write_off(self, request):
        """
        Списание товара со склада (FIFO).
        POST: {warehouse, nomenclature, quantity, reason?, notes?}
        """
        from apps.nomenclature.models import Nomenclature
        from apps.core.models import Warehouse
        from apps.core.mixins import _resolve_org

        org = _resolve_org(request.user)
        data = request.data
        try:
            warehouse = Warehouse.objects.get(pk=data['warehouse'])
            nomenclature = Nomenclature.objects.get(pk=data['nomenclature'])
            _validate_org_fk(warehouse, org, 'Склад')
            _validate_org_fk(nomenclature, org, 'Номенклатура')
            result = write_off_stock(
                organization=org,
                warehouse=warehouse,
                nomenclature=nomenclature,
                quantity=Decimal(str(data['quantity'])),
                reason=data.get('reason', 'other'),
                user=request.user,
                notes=data.get('notes', ''),
            )
            return Response({
                'status': 'ok',
                'total_cost': str(result['total_cost']),
                'batches_affected': len(result['items']),
            })
        except InsufficientStockError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='transfer')
    def transfer(self, request):
        """
        Перемещение товара между складами.
        POST: {warehouse_from, warehouse_to, nomenclature, quantity, notes?}
        """
        from apps.nomenclature.models import Nomenclature
        from apps.core.models import Warehouse
        from apps.core.mixins import _resolve_org

        org = _resolve_org(request.user)
        data = request.data
        try:
            wh_from = Warehouse.objects.get(pk=data['warehouse_from'])
            wh_to = Warehouse.objects.get(pk=data['warehouse_to'])
            nomenclature = Nomenclature.objects.get(pk=data['nomenclature'])
            _validate_org_fk(wh_from, org, 'Склад-источник')
            _validate_org_fk(wh_to, org, 'Склад-назначение')
            _validate_org_fk(nomenclature, org, 'Номенклатура')
            batch = transfer_stock(
                organization=org,
                warehouse_from=wh_from,
                warehouse_to=wh_to,
                nomenclature=nomenclature,
                quantity=Decimal(str(data['quantity'])),
                user=request.user,
                notes=data.get('notes', ''),
            )
            return Response({
                'status': 'ok',
                'batch_id': str(batch.id),
            })
        except InsufficientStockError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='assemble-bouquet')
    def assemble_bouquet_action(self, request):
        """
        Сборка букета.
        POST: {
            nomenclature_bouquet: UUID | '',    — опционально; если пусто — создаётся новая номенклатура
            bouquet_name: str,                  — обязательно для индивидуальной сборки (nomen_bouquet='')
            warehouse_from: UUID,
            warehouse_to: UUID,
            quantity: number (default 1),
            use_template: bool (default true),
            components: [{nomenclature: UUID, quantity: number}, ...] (if use_template=false)
        }
        """
        from apps.nomenclature.models import Nomenclature, BouquetTemplate, BouquetComponent
        from apps.core.models import User, Warehouse
        from apps.core.mixins import _resolve_org

        org = _resolve_org(request.user)
        data = request.data
        try:
            wh_from = Warehouse.objects.get(pk=data['warehouse_from'])
            wh_to = Warehouse.objects.get(pk=data['warehouse_to'])
            qty = int(data.get('quantity', 1))

            _validate_org_fk(wh_from, org, 'Склад-источник')
            _validate_org_fk(wh_to, org, 'Склад-назначение')

            bouquet_nom_id = data.get('nomenclature_bouquet') or ''
            bouquet_name_input = (data.get('bouquet_name') or '').strip()
            is_individual = False

            if bouquet_nom_id:
                bouquet_nom = Nomenclature.objects.get(pk=bouquet_nom_id)
                _validate_org_fk(bouquet_nom, org, 'Букет')
            elif bouquet_name_input:
                # Индивидуальная сборка — создаём новую номенклатуру на лету
                bouquet_nom = Nomenclature.objects.create(
                    organization=org,
                    name=bouquet_name_input,
                    nomenclature_type='bouquet',
                )
                is_individual = True
            else:
                return Response(
                    {'detail': 'Укажите шаблон букета или название индивидуального букета.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            assembler = request.user
            assembler_id = data.get('assembler')
            if assembler_id:
                assembler = User.objects.filter(pk=assembler_id, organization=org).first() or request.user

            # Для индивидуальной сборки use_template всегда False
            use_template = (not is_individual) and data.get('use_template', True)
            if use_template:
                # Загружаем компоненты из шаблона
                try:
                    template = BouquetTemplate.objects.get(nomenclature=bouquet_nom)
                except BouquetTemplate.DoesNotExist:
                    return Response(
                        {'detail': f'Шаблон для "{bouquet_nom.name}" не найден.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                components = [
                    {
                        'nomenclature': comp.nomenclature,
                        'quantity': comp.quantity,
                        'warehouse': wh_from,
                    }
                    for comp in template.components.select_related('nomenclature').all()
                ]
            else:
                # Индивидуальная сборка
                components = []
                for c in data.get('components', []):
                    comp_nom = Nomenclature.objects.get(pk=c['nomenclature'])
                    _validate_org_fk(comp_nom, org, 'Компонент')
                    comp_wh = wh_from
                    if c.get('warehouse'):
                        comp_wh = Warehouse.objects.get(pk=c['warehouse'])
                    _validate_org_fk(comp_wh, org, 'Склад компонента')
                    components.append({
                        'nomenclature': comp_nom,
                        'quantity': Decimal(str(c['quantity'])),
                        'warehouse': comp_wh,
                    })

            # Переопределение складов/количеств компонентов при сборке из шаблона
            if use_template and data.get('components'):
                overrides = {str(c.get('nomenclature')): c for c in data.get('components', []) if c.get('nomenclature')}
                updated_components = []
                for comp in components:
                    override = overrides.get(str(comp['nomenclature'].id))
                    if not override:
                        updated_components.append(comp)
                        continue
                    comp_wh = comp.get('warehouse') or wh_from
                    if override.get('warehouse'):
                        comp_wh = Warehouse.objects.get(pk=override['warehouse'])
                    _validate_org_fk(comp_wh, org, 'Склад компонента')
                    updated_components.append({
                        'nomenclature': comp['nomenclature'],
                        'quantity': Decimal(str(override.get('quantity', comp['quantity']))),
                        'warehouse': comp_wh,
                    })
                components = updated_components

            if not components:
                return Response(
                    {'detail': 'Нет компонентов для сборки.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            batch = assemble_bouquet(
                organization=org,
                nomenclature_bouquet=bouquet_nom,
                warehouse_from=wh_from,
                warehouse_to=wh_to,
                components=components,
                quantity=qty,
                user=assembler,
                notes=data.get('notes', ''),
            )

            # Опционально сохранить/обновить шаблон составом текущей сборки
            if data.get('add_to_templates'):
                template, _ = BouquetTemplate.objects.get_or_create(
                    nomenclature=bouquet_nom,
                    defaults={
                        'organization': org,
                        'bouquet_name': data.get('bouquet_name') or '',
                        'assembly_time_minutes': 15,
                        'difficulty': 3,
                        'description': '',
                    },
                )
                if data.get('bouquet_name') is not None:
                    template.bouquet_name = data.get('bouquet_name') or ''
                    template.save(update_fields=['bouquet_name'])

                template.components.all().delete()
                for comp in components:
                    BouquetComponent.objects.create(
                        template=template,
                        nomenclature=comp['nomenclature'],
                        quantity=Decimal(str(comp['quantity'])),
                        is_required=True,
                    )

            return Response({
                'status': 'ok',
                'batch_id': str(batch.id),
                'cost_price': str(batch.purchase_price),
                'message': f'Букет "{bouquet_nom.name}" собран ({qty} шт.)',
            })
        except InsufficientStockError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='disassemble-bouquet')
    def disassemble_bouquet_action(self, request):
        """
        Раскомплектовка букета.
        POST: {
            nomenclature_bouquet: UUID,
            warehouse: UUID,
            return_items: [{nomenclature: UUID, quantity: number}, ...],
            writeoff_items: [{nomenclature: UUID, quantity: number, reason?: string}, ...]
        }
        """
        from apps.nomenclature.models import Nomenclature
        from apps.core.models import Warehouse, User
        from apps.core.mixins import _resolve_org

        org = _resolve_org(request.user)
        data = request.data
        try:
            bouquet_nom = Nomenclature.objects.get(pk=data['nomenclature_bouquet'])
            warehouse = Warehouse.objects.get(pk=data['warehouse'])

            _validate_org_fk(bouquet_nom, org, 'Букет')
            _validate_org_fk(warehouse, org, 'Склад')

            assembler = request.user
            assembler_id = data.get('assembler')
            if assembler_id:
                assembler = User.objects.filter(pk=assembler_id, organization=org).first() or request.user

            return_items = []
            for item in data.get('return_items', []):
                nom = Nomenclature.objects.get(pk=item['nomenclature'])
                _validate_org_fk(nom, org, 'Компонент возврата')
                return_items.append({
                    'nomenclature': nom,
                    'quantity': Decimal(str(item['quantity'])),
                })

            writeoff_items = []
            for item in data.get('writeoff_items', []):
                nom = Nomenclature.objects.get(pk=item['nomenclature'])
                _validate_org_fk(nom, org, 'Компонент списания')
                writeoff_items.append({
                    'nomenclature': nom,
                    'quantity': Decimal(str(item['quantity'])),
                    'reason': item.get('reason', 'other'),
                })

            disassemble_bouquet(
                organization=org,
                nomenclature_bouquet=bouquet_nom,
                warehouse=warehouse,
                return_items=return_items,
                writeoff_items=writeoff_items,
                user=assembler,
                notes=data.get('notes', ''),
            )
            return Response({
                'status': 'ok',
                'message': f'Букет "{bouquet_nom.name}" раскомплектован.',
            })
        except InsufficientStockError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='correct-bouquet')
    @db_transaction.atomic
    def correct_bouquet_action(self, request):
        """
        Коррекция состава букета в остатках.
        POST: {
            nomenclature_bouquet: UUID,
            warehouse: UUID,
            rows: [{
                nomenclature: UUID,
                writeoff_qty?: number,
                return_qty?: number,
                add_qty?: number,
                reason?: str,
                return_warehouse?: UUID,
                add_warehouse?: UUID,
            }]
        }
        """
        from apps.nomenclature.models import Nomenclature
        from apps.core.models import Warehouse
        from apps.core.mixins import _resolve_org

        org = _resolve_org(request.user)
        data = request.data
        try:
            bouquet_nom = Nomenclature.objects.get(pk=data['nomenclature_bouquet'])
            warehouse = Warehouse.objects.get(pk=data['warehouse'])

            _validate_org_fk(bouquet_nom, org, 'Букет')
            _validate_org_fk(warehouse, org, 'Склад')

            rows = []
            for row in data.get('rows', []):
                nom = Nomenclature.objects.get(pk=row['nomenclature'])
                _validate_org_fk(nom, org, 'Компонент коррекции')
                return_wh = None
                add_wh = None
                if row.get('return_warehouse'):
                    return_wh = Warehouse.objects.get(pk=row['return_warehouse'])
                    _validate_org_fk(return_wh, org, 'Склад возврата')
                if row.get('add_warehouse'):
                    add_wh = Warehouse.objects.get(pk=row['add_warehouse'])
                    _validate_org_fk(add_wh, org, 'Склад добавления')
                rows.append({
                    'nomenclature': nom,
                    'writeoff_qty': Decimal(str(row.get('writeoff_qty', 0) or 0)),
                    'return_qty': Decimal(str(row.get('return_qty', 0) or 0)),
                    'add_qty': Decimal(str(row.get('add_qty', 0) or 0)),
                    'reason': row.get('reason', 'other'),
                    'return_warehouse': return_wh,
                    'add_warehouse': add_wh,
                })

            correct_bouquet_stock(
                organization=org,
                bouquet_nomenclature=bouquet_nom,
                warehouse=warehouse,
                rows=rows,
                user=request.user,
            )

            return Response({
                'status': 'ok',
                'message': f'Букет "{bouquet_nom.name}" скорректирован.',
            })
        except InsufficientStockError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class InventoryDocumentViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = InventoryDocumentSerializer
    queryset = InventoryDocument.objects.all()

    def get_queryset(self):
        qs = InventoryDocument.objects.prefetch_related('items')
        return _tenant_filter(qs, self.request.user)


class ReserveViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = ReserveSerializer
    queryset = Reserve.objects.all()

    def get_queryset(self):
        qs = Reserve.objects.select_related('nomenclature', 'warehouse')
        return _tenant_filter(qs, self.request.user)
