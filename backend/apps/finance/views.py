from decimal import Decimal

from rest_framework import viewsets, filters, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from django.db import models as db_models, transaction as db_transaction
from django.db.models import Sum
from django_filters.rest_framework import DjangoFilterBackend
from .models import Wallet, TransactionCategory, Transaction, Debt
from .serializers import (
    WalletSerializer, TransactionCategorySerializer,
    TransactionSerializer, DebtSerializer,
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


def _apply_wallet_balance(txn_or_id, reverse=False):
    """
    Обновить баланс кошельков по транзакции.
    reverse=True — откатить (используется при удалении/обновлении).
    Вызывается ВНУТРИ transaction.atomic.
    """
    if hasattr(txn_or_id, 'amount'):
        txn = txn_or_id
    else:
        txn = Transaction.objects.get(pk=txn_or_id)

    amount = txn.amount
    if reverse:
        # Откат: возвращаем средства обратно
        if txn.wallet_from_id:
            Wallet.objects.select_for_update().filter(pk=txn.wallet_from_id).update(
                balance=db_models.F('balance') + amount
            )
        if txn.wallet_to_id:
            Wallet.objects.select_for_update().filter(pk=txn.wallet_to_id).update(
                balance=db_models.F('balance') - amount
            )
    else:
        # Прямое применение
        if txn.wallet_from_id:
            # Проверка allow_negative
            wallet_from = Wallet.objects.select_for_update().get(pk=txn.wallet_from_id)
            new_balance = wallet_from.balance - amount
            if new_balance < 0 and not wallet_from.allow_negative:
                raise ValidationError({
                    'wallet_from': f'Недостаточно средств в кошельке «{wallet_from.name}». '
                                   f'Баланс: {wallet_from.balance}, списание: {amount}.'
                })
            Wallet.objects.filter(pk=wallet_from.pk).update(
                balance=db_models.F('balance') - amount
            )
        if txn.wallet_to_id:
            Wallet.objects.select_for_update().filter(pk=txn.wallet_to_id).update(
                balance=db_models.F('balance') + amount
            )


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
        if wallet_from and str(wallet_from.organization_id) != str(org.id):
            raise ValidationError({'wallet_from': 'Кошелёк не принадлежит вашей организации.'})
        if wallet_to and str(wallet_to.organization_id) != str(org.id):
            raise ValidationError({'wallet_to': 'Кошелёк не принадлежит вашей организации.'})

        serializer.save(organization=org)
        txn = serializer.instance
        _apply_wallet_balance(txn, reverse=False)

    @db_transaction.atomic
    def perform_update(self, serializer):
        """Обновление транзакции: откат старого баланса → применение нового."""
        old_txn = self.get_object()
        # Откат старых значений
        _apply_wallet_balance(old_txn, reverse=True)

        org = _resolve_org(self.request.user)
        serializer.save(organization=org)
        txn = serializer.instance
        # Применение новых значений
        _apply_wallet_balance(txn, reverse=False)

    @db_transaction.atomic
    def perform_destroy(self, instance):
        """Удаление транзакции: откат баланса."""
        _apply_wallet_balance(instance, reverse=True)
        instance.delete()


class DebtViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = DebtSerializer
    queryset = Debt.objects.all()
    permission_classes = [ReadOnlyOrManager]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['debt_type', 'direction', 'is_closed']

    def get_queryset(self):
        qs = Debt.objects.select_related('organization')
        return _tenant_filter(qs, self.request.user)
