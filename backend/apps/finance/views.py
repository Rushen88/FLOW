from decimal import Decimal

from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import models as db_models, transaction as db_transaction
from django.db.models import Sum
from django_filters.rest_framework import DjangoFilterBackend
from .models import Wallet, TransactionCategory, Transaction, Debt
from .serializers import (
    WalletSerializer, TransactionCategorySerializer,
    TransactionSerializer, DebtSerializer,
)
from apps.core.mixins import (
    OrgPerformCreateMixin, _tenant_filter, IsOwnerOrAdmin, ReadOnlyOrManager,
)


class WalletViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = WalletSerializer
    queryset = Wallet.objects.all()
    permission_classes = [IsOwnerOrAdmin]

    def get_queryset(self):
        qs = Wallet.objects.all()
        return _tenant_filter(qs, self.request.user)

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
        qs = TransactionCategory.objects.all()
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
        super().perform_create(serializer)
        txn = serializer.instance
        amount = txn.amount
        # Снимаем из кошелька-источника
        if txn.wallet_from:
            Wallet.objects.filter(pk=txn.wallet_from_id).update(
                balance=db_models.F('balance') - amount
            )
        # Зачисляем в кошелёк-получатель
        if txn.wallet_to:
            Wallet.objects.filter(pk=txn.wallet_to_id).update(
                balance=db_models.F('balance') + amount
            )


class DebtViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = DebtSerializer
    queryset = Debt.objects.all()
    permission_classes = [ReadOnlyOrManager]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['debt_type', 'direction', 'is_closed']

    def get_queryset(self):
        qs = Debt.objects.all()
        return _tenant_filter(qs, self.request.user)
