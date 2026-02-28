from django.db import models as db_models
from rest_framework.exceptions import ValidationError

from .models import Wallet, Transaction


def validate_wallet_ownership(org, wallet_from=None, wallet_to=None):
    """Проверка принадлежности кошельков организации пользователя."""
    if wallet_from and str(wallet_from.organization_id) != str(org.id):
        raise ValidationError({'wallet_from': 'Кошелёк не принадлежит вашей организации.'})
    if wallet_to and str(wallet_to.organization_id) != str(org.id):
        raise ValidationError({'wallet_to': 'Кошелёк не принадлежит вашей организации.'})


def validate_transaction_wallet_rules(transaction_type, wallet_from=None, wallet_to=None):
    """Минимальные инварианты по типам финансовых операций."""
    if transaction_type == Transaction.TransactionType.TRANSFER:
        if not wallet_from or not wallet_to:
            raise ValidationError({'transaction_type': 'Для перевода укажите оба кошелька: from и to.'})
        if wallet_from.id == wallet_to.id:
            raise ValidationError({'wallet_to': 'Кошелёк отправителя и получателя не могут совпадать.'})

    # Расходные типы требуют wallet_from
    expense_types = (
        Transaction.TransactionType.EXPENSE,
        Transaction.TransactionType.SALARY,
        Transaction.TransactionType.PERSONAL_EXPENSE,
        Transaction.TransactionType.SUPPLIER_PAYMENT,
    )
    if transaction_type in expense_types:
        if not wallet_from:
            raise ValidationError({'wallet_from': 'Для расходной операции укажите кошелёк списания.'})

    # Доходные типы требуют wallet_to
    if transaction_type == Transaction.TransactionType.INCOME:
        if not wallet_to:
            raise ValidationError({'wallet_to': 'Для приходной операции укажите кошелёк зачисления.'})


def apply_wallet_balance(txn_or_id, reverse=False):
    """
    Обновить баланс кошельков по транзакции.
    reverse=True — откатить (используется при удалении/обновлении).
    Вызывается ВНУТРИ transaction.atomic.
    """
    if hasattr(txn_or_id, 'amount'):
        txn = txn_or_id
    else:
        txn = Transaction.objects.select_for_update().get(pk=txn_or_id)

    amount = txn.amount
    if reverse:
        if txn.wallet_from_id:
            Wallet.objects.select_for_update().filter(pk=txn.wallet_from_id).update(
                balance=db_models.F('balance') + amount
            )
        if txn.wallet_to_id:
            Wallet.objects.select_for_update().filter(pk=txn.wallet_to_id).update(
                balance=db_models.F('balance') - amount
            )
    else:
        if txn.wallet_from_id:
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
