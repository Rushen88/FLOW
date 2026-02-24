from django.contrib import admin
from .models import Wallet, TransactionCategory, Transaction, Debt


@admin.register(Wallet)
class WalletAdmin(admin.ModelAdmin):
    list_display = ('name', 'wallet_type', 'balance', 'trading_point', 'is_active')
    list_filter = ('wallet_type', 'is_active')


@admin.register(TransactionCategory)
class TransactionCategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'direction', 'parent', 'is_system')
    list_filter = ('direction',)


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ('transaction_type', 'amount', 'wallet_from', 'wallet_to', 'created_at')
    list_filter = ('transaction_type', 'created_at')


@admin.register(Debt)
class DebtAdmin(admin.ModelAdmin):
    list_display = ('counterparty_name', 'debt_type', 'direction', 'amount', 'paid_amount', 'is_closed')
    list_filter = ('debt_type', 'direction', 'is_closed')
