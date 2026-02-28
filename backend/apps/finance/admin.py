from django.contrib import admin
from .models import Wallet, TransactionCategory, Transaction, Debt, CashShift


@admin.register(Wallet)
class WalletAdmin(admin.ModelAdmin):
    list_display = ('name', 'wallet_type', 'balance', 'trading_point', 'organization', 'is_active')
    list_filter = ('wallet_type', 'is_active', 'organization')
    readonly_fields = ('balance',)


@admin.register(TransactionCategory)
class TransactionCategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'direction', 'parent', 'is_system', 'organization')
    list_filter = ('direction', 'organization')


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ('transaction_type', 'amount', 'wallet_from', 'wallet_to', 'organization', 'created_at')
    list_filter = ('transaction_type', 'organization', 'created_at')


@admin.register(Debt)
class DebtAdmin(admin.ModelAdmin):
    list_display = ('counterparty_name', 'debt_type', 'direction', 'amount', 'paid_amount', 'organization', 'is_closed')
    list_filter = ('debt_type', 'direction', 'is_closed', 'organization')


@admin.register(CashShift)
class CashShiftAdmin(admin.ModelAdmin):
    list_display = ('trading_point', 'wallet', 'status', 'opened_by', 'opened_at', 'closed_at', 'organization')
    list_filter = ('status', 'organization', 'trading_point')
    readonly_fields = ('balance_at_open', 'expected_balance_at_close', 'actual_balance_at_close')
