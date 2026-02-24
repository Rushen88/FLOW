from decimal import Decimal

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
    write_off_stock, transfer_stock, InsufficientStockError,
)
from apps.core.mixins import OrgPerformCreateMixin, _tenant_filter


class BatchViewSet(viewsets.ModelViewSet):
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
        return _tenant_filter(qs, self.request.user)

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
        return _tenant_filter(qs, self.request.user)


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
            nomenclature_bouquet: UUID,
            warehouse_from: UUID,
            warehouse_to: UUID,
            quantity: number (default 1),
            use_template: bool (default true),
            components: [{nomenclature: UUID, quantity: number}, ...] (if use_template=false)
        }
        """
        from apps.nomenclature.models import Nomenclature, BouquetTemplate
        from apps.core.mixins import _resolve_org

        org = _resolve_org(request.user)
        data = request.data
        try:
            bouquet_nom = Nomenclature.objects.get(pk=data['nomenclature_bouquet'])
            from apps.core.models import Warehouse
            wh_from = Warehouse.objects.get(pk=data['warehouse_from'])
            wh_to = Warehouse.objects.get(pk=data['warehouse_to'])
            qty = int(data.get('quantity', 1))

            use_template = data.get('use_template', True)
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
                    }
                    for comp in template.components.select_related('nomenclature').all()
                ]
            else:
                # Индивидуальная сборка
                components = []
                for c in data.get('components', []):
                    comp_nom = Nomenclature.objects.get(pk=c['nomenclature'])
                    components.append({
                        'nomenclature': comp_nom,
                        'quantity': Decimal(str(c['quantity'])),
                    })

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
                user=request.user,
                notes=data.get('notes', ''),
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
        from apps.core.models import Warehouse
        from apps.core.mixins import _resolve_org

        org = _resolve_org(request.user)
        data = request.data
        try:
            bouquet_nom = Nomenclature.objects.get(pk=data['nomenclature_bouquet'])
            warehouse = Warehouse.objects.get(pk=data['warehouse'])

            return_items = []
            for item in data.get('return_items', []):
                nom = Nomenclature.objects.get(pk=item['nomenclature'])
                return_items.append({
                    'nomenclature': nom,
                    'quantity': Decimal(str(item['quantity'])),
                })

            writeoff_items = []
            for item in data.get('writeoff_items', []):
                nom = Nomenclature.objects.get(pk=item['nomenclature'])
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
                user=request.user,
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
