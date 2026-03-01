from decimal import Decimal

from rest_framework import viewsets, filters, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from django.db import transaction as db_transaction
from django.db.models import Sum
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from .models import Wallet, TransactionCategory, Transaction, Debt, CashShift
from .services import (
    apply_wallet_balance,
    validate_wallet_ownership,
    validate_transaction_wallet_rules,
)
from .serializers import (
    WalletSerializer, TransactionCategorySerializer,
    TransactionSerializer, DebtSerializer,
    CashShiftSerializer, CashShiftCloseSerializer,
)
from apps.core.mixins import (
    OrgPerformCreateMixin, _tenant_filter, _resolve_org,
    IsOwnerOrAdmin, ReadOnlyOrManager,
)


class WalletViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = WalletSerializer
    queryset = Wallet.objects.all()

    def get_permissions(self):
        if self.action in ('list', 'retrieve', 'summary'):
            return [permissions.IsAuthenticated()]
        return [permissions.IsAuthenticated(), IsOwnerOrAdmin()]

    def get_queryset(self):
        qs = Wallet.objects.select_related('organization', 'trading_point', 'owner')
        return _tenant_filter(qs, self.request.user, tp_field='trading_point')

    @action(detail=False, methods=['get'])
    def summary(self, request):
        qs = self.get_queryset().filter(is_active=True)
        total = qs.aggregate(total=Sum('balance'))['total'] or 0
        return Response({
            'total_balance': total,
            'wallets_count': qs.count(),
        })


class TransactionCategoryViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = TransactionCategorySerializer
    queryset = TransactionCategory.objects.all()

    def get_queryset(self):
        qs = TransactionCategory.objects.select_related('parent')
        qs = _tenant_filter(qs, self.request.user)
        direction = self.request.query_params.get('direction')
        if direction:
            qs = qs.filter(direction=direction)
        return qs


class TransactionViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = TransactionSerializer
    queryset = Transaction.objects.all()
    permission_classes = [ReadOnlyOrManager]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['transaction_type', 'wallet_from', 'wallet_to', 'category']
    ordering_fields = ['created_at', 'amount']

    def get_queryset(self):
        qs = Transaction.objects.select_related('category', 'wallet_from', 'wallet_to')
        return _tenant_filter(qs, self.request.user)

    @db_transaction.atomic
    def perform_create(self, serializer):
        """Создание транзакции с обновлением баланса кошельков."""
        org = _resolve_org(self.request.user)
        if not org:
            raise ValidationError({'organization': 'Сначала выберите организацию.'})

        # Валидация: кошельки принадлежат организации
        wallet_from = serializer.validated_data.get('wallet_from')
        wallet_to = serializer.validated_data.get('wallet_to')
        validate_wallet_ownership(org, wallet_from=wallet_from, wallet_to=wallet_to)
        validate_transaction_wallet_rules(
            transaction_type=serializer.validated_data.get('transaction_type'),
            wallet_from=wallet_from,
            wallet_to=wallet_to,
        )

        serializer.save(organization=org)
        txn = serializer.instance
        apply_wallet_balance(txn, reverse=False)

    @db_transaction.atomic
    def perform_update(self, serializer):
        """Обновление транзакции: откат старого баланса → применение нового."""
        old_txn = Transaction.objects.select_for_update().get(pk=self.get_object().pk)
        # Откат старых значений
        apply_wallet_balance(old_txn, reverse=True)

        org = _resolve_org(self.request.user)
        # P2-HIGH: При PATCH берём кошельки из validated_data, а если не указаны — из старой транзакции
        wallet_from = serializer.validated_data.get('wallet_from', old_txn.wallet_from)
        wallet_to = serializer.validated_data.get('wallet_to', old_txn.wallet_to)
        validate_wallet_ownership(org, wallet_from=wallet_from, wallet_to=wallet_to)
        validate_transaction_wallet_rules(
            transaction_type=serializer.validated_data.get('transaction_type', old_txn.transaction_type),
            wallet_from=wallet_from,
            wallet_to=wallet_to,
        )
        serializer.save(organization=org)
        txn = serializer.instance
        # Применение новых значений
        apply_wallet_balance(txn, reverse=False)

    @db_transaction.atomic
    def perform_destroy(self, instance):
        """Удаление транзакции: откат баланса."""
        locked_txn = Transaction.objects.select_for_update().get(pk=instance.pk)
        apply_wallet_balance(locked_txn, reverse=True)
        instance.delete()


class DebtViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = DebtSerializer
    queryset = Debt.objects.all()
    permission_classes = [ReadOnlyOrManager]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['debt_type', 'direction', 'is_closed']

    def get_queryset(self):
        qs = Debt.objects.select_related('organization', 'supplier', 'customer')
        return _tenant_filter(qs, self.request.user)


class CashShiftViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = CashShiftSerializer
    queryset = CashShift.objects.all()
    permission_classes = [ReadOnlyOrManager]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['status', 'trading_point', 'wallet']
    
    def get_queryset(self):
        qs = CashShift.objects.select_related('opened_by', 'closed_by', 'wallet', 'trading_point')
        return _tenant_filter(qs, self.request.user)

    @db_transaction.atomic
    def perform_create(self, serializer):
        wallet = serializer.validated_data['wallet']
        # Проверяем, есть ли открытая смена у этой кассы (select_for_update для защиты от TOCTOU)
        if CashShift.objects.select_for_update().filter(wallet=wallet, status=CashShift.Status.OPEN).exists():
            raise ValidationError({'wallet': 'Для этой кассы уже есть открытая смена.'})

        org = _resolve_org(self.request.user)
        if not org:
            raise ValidationError({'organization': 'Сначала выберите организацию.'})

        serializer.save(
            organization=org,
            opened_by=self.request.user,
            balance_at_open=wallet.balance,
            status=CashShift.Status.OPEN,
        )

    @action(detail=True, methods=['post'])
    @db_transaction.atomic
    def close(self, request, pk=None):
        shift = self.get_object()
        if shift.status == CashShift.Status.CLOSED:
            return Response({'detail': 'Смена уже закрыта.'}, status=status.HTTP_400_BAD_REQUEST)
            
        serializer = CashShiftCloseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        actual = serializer.validated_data['actual_balance_at_close']
        notes = serializer.validated_data.get('notes', '')
        
        # M5: Ожидаемый баланс = баланс при открытии + приход - расход за смену
        shift_income = Transaction.objects.filter(
            wallet_to=shift.wallet,
            created_at__gte=shift.opened_at,
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0')
        shift_expense = Transaction.objects.filter(
            wallet_from=shift.wallet,
            created_at__gte=shift.opened_at,
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0')
        expected = shift.balance_at_open + shift_income - shift_expense
        
        shift.actual_balance_at_close = actual
        shift.expected_balance_at_close = expected
        shift.discrepancy = actual - expected
        if notes:
            shift.notes = f"{shift.notes}\nЗакрытие: {notes}"
        shift.status = CashShift.Status.CLOSED
        shift.closed_by = request.user
        shift.closed_at = timezone.now()
        shift.save()
        
        return Response(CashShiftSerializer(shift).data)

