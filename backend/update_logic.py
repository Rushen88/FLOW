import re

with open('d:\\B2B\\FLOW\\backend\\apps\\sales\\services.py', 'r', encoding='utf-8') as f:
    services_text = f.read()

# Add sync_order_prepayment_transaction
new_order_func = """
def sync_order_prepayment_transaction(order):
    \"\"\"
    Синхронизация финансовой транзакции с предоплатой заказа.
    Гарантирует, что предоплата корректно отражена в кассе.
    \"\"\"
    from apps.finance.models import Transaction, Wallet
    from decimal import Decimal

    prepayment = order.prepayment or Decimal('0')
    wallet = order.payment_method.wallet if order.payment_method else None

    existing_tx = Transaction.objects.filter(order=order).select_for_update().first()

    should_have_tx = prepayment > 0 and wallet and order.status not in ('cancelled', 'completed')

    if should_have_tx:
        if existing_tx:
            if existing_tx.wallet_to_id != wallet.id or existing_tx.amount != prepayment:
                if existing_tx.wallet_to_id:
                    old_w = Wallet.objects.select_for_update().get(pk=existing_tx.wallet_to_id)
                    new_bal = old_w.balance - existing_tx.amount
                    if new_bal < 0 and not old_w.allow_negative:
                        from rest_framework.exceptions import ValidationError
                        raise ValidationError(f'Недостаточно средств в кошельке «{old_w.name}» для изменения предоплаты.')
                    old_w.balance = new_bal
                    old_w.save(update_fields=['balance'])
                
                existing_tx.wallet_to = wallet
                existing_tx.amount = prepayment
                existing_tx.save(update_fields=['wallet_to', 'amount'])

                new_w = Wallet.objects.select_for_update().get(pk=wallet.id)
                new_w.balance += prepayment
                new_w.save(update_fields=['balance'])
        else:
            Transaction.objects.create(
                organization=order.organization,
                transaction_type=Transaction.TransactionType.INCOME,
                wallet_to=wallet,
                amount=prepayment,
                order=order,
                description=f'Предоплата по заказу #{order.number}'
            )
            new_w = Wallet.objects.select_for_update().get(pk=wallet.id)
            new_w.balance += prepayment
            new_w.save(update_fields=['balance'])
    else:
        # Если предоплату обнулили, или заказ отменен, или без кошелька - удаляем/возвращаем транзакцию предоплаты?
        if existing_tx:
            if existing_tx.wallet_to_id:
                old_w = Wallet.objects.select_for_update().get(pk=existing_tx.wallet_to_id)
                new_bal = old_w.balance - existing_tx.amount
                if new_bal < 0 and not old_w.allow_negative:
                    from rest_framework.exceptions import ValidationError
                    raise ValidationError(f'Недостаточно средств в кассе для возврата предоплаты.')
                old_w.balance = new_bal
                old_w.save(update_fields=['balance'])
            existing_tx.delete()

def sync_sale_transaction(sale):"""

services_text = services_text.replace('def sync_sale_transaction(sale):', new_order_func)


# Now fix sync_sale_transaction to subtract prepayment
old_sale_tx = """
    should_have_tx = sale.status == Sale.Status.COMPLETED and sale.is_paid
    wallet = sale.payment_method.wallet if sale.payment_method else None

    existing_tx = Transaction.objects.filter(sale=sale).select_for_update().first()

    if should_have_tx and wallet:
        if existing_tx:
            if existing_tx.wallet_to_id != wallet.id or existing_tx.amount != sale.total:
                if existing_tx.wallet_to_id:"""

new_sale_tx = """
    should_have_tx = sale.status == Sale.Status.COMPLETED and sale.is_paid
    wallet = sale.payment_method.wallet if sale.payment_method else None

    # Учитываем предоплату, если продажа создана из заказа
    from decimal import Decimal
    sale_amount = sale.total
    if sale.order and sale.order.prepayment:
        sale_amount = max(sale.total - sale.order.prepayment, Decimal('0'))

    if sale_amount <= 0:
        should_have_tx = False

    existing_tx = Transaction.objects.filter(sale=sale).select_for_update().first()

    if should_have_tx and wallet:
        if existing_tx:
            if existing_tx.wallet_to_id != wallet.id or existing_tx.amount != sale_amount:
                if existing_tx.wallet_to_id:"""

services_text = services_text.replace(old_sale_tx, new_sale_tx)

old_tx_amount = """                existing_tx.wallet_to = wallet
                existing_tx.amount = sale.total
                existing_tx.save(update_fields=['wallet_to', 'amount'])

                new_w = Wallet.objects.select_for_update().get(pk=wallet.id)
                new_w.balance += sale.total
                new_w.save(update_fields=['balance'])
        else:
            Transaction.objects.create(
                organization=sale.organization,
                transaction_type=Transaction.TransactionType.INCOME,
                wallet_to=wallet,
                amount=sale.total,
                sale=sale,
                description=f'Оплата по продаже #{sale.number}'
            )
            new_w = Wallet.objects.select_for_update().get(pk=wallet.id)
            new_w.balance += sale.total
            new_w.save(update_fields=['balance'])"""

new_tx_amount = """                existing_tx.wallet_to = wallet
                existing_tx.amount = sale_amount
                existing_tx.save(update_fields=['wallet_to', 'amount'])

                new_w = Wallet.objects.select_for_update().get(pk=wallet.id)
                new_w.balance += sale_amount
                new_w.save(update_fields=['balance'])
        else:
            Transaction.objects.create(
                organization=sale.organization,
                transaction_type=Transaction.TransactionType.INCOME,
                wallet_to=wallet,
                amount=sale_amount,
                sale=sale,
                description=f'Оплата по чеку #{sale.number} (остаток)' if sale.order else f'Оплата по продаже #{sale.number}'
            )
            new_w = Wallet.objects.select_for_update().get(pk=wallet.id)
            new_w.balance += sale_amount
            new_w.save(update_fields=['balance'])"""

services_text = services_text.replace(old_tx_amount, new_tx_amount)

with open('d:\\B2B\\FLOW\\backend\\apps\\sales\\services.py', 'w', encoding='utf-8') as f:
    f.write(services_text)

# Now update serializers.py
with open('d:\\B2B\\FLOW\\backend\\apps\\sales\\serializers.py', 'r', encoding='utf-8') as f:
    serializers_text = f.read()

# Add sync_order_prepayment_transaction to imports (we use regex to prepend)
import re
match = re.search(r'(from apps\.sales\.services import .*)\n', serializers_text)
if match and 'sync_order_prepayment_transaction' not in match.group(0):
    new_import = match.group(1) + ', sync_order_prepayment_transaction\n'
    serializers_text = serializers_text.replace(match.group(0), new_import)

# For OrderSerializer create
old_create_return = """        create_order_status_history(
            order=order,
            old_status='',
            new_status=order.status,
            changed_by=self.context.get('request').user if self.context.get('request') else None,
            comment='Создание заказа',
        )
        return order"""

new_create_return = """        create_order_status_history(
            order=order,
            old_status='',
            new_status=order.status,
            changed_by=self.context.get('request').user if self.context.get('request') else None,
            comment='Создание заказа',
        )
        
        try:
            sync_order_prepayment_transaction(order)
        except Exception as e:
            raise serializers.ValidationError(str(e))
            
        return order"""

if old_create_return in serializers_text:
    serializers_text = serializers_text.replace(old_create_return, new_create_return)

# For OrderSerializer update
old_update_return = """        if new_status != old_status:
            create_order_status_history(
                order=order,
                old_status=old_status,
                new_status=new_status,
                changed_by=self.context.get('request').user if self.context.get('request') else None,
                comment='Изменение статуса через API',
            )
        return order"""

new_update_return = """        if new_status != old_status:
            create_order_status_history(
                order=order,
                old_status=old_status,
                new_status=new_status,
                changed_by=self.context.get('request').user if self.context.get('request') else None,
                comment='Изменение статуса через API',
            )
            
        try:
            sync_order_prepayment_transaction(order)
        except Exception as e:
            raise serializers.ValidationError(str(e))
            
        return order"""

if old_update_return in serializers_text:
    serializers_text = serializers_text.replace(old_update_return, new_update_return)

with open('d:\\B2B\\FLOW\\backend\\apps\\sales\\serializers.py', 'w', encoding='utf-8') as f:
    f.write(serializers_text)

print("Done")
