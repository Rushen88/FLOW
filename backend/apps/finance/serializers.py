from rest_framework import serializers
from .models import Wallet, TransactionCategory, Transaction, Debt


class WalletSerializer(serializers.ModelSerializer):
    class Meta:
        model = Wallet
        fields = '__all__'
        read_only_fields = ['organization']


class TransactionCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = TransactionCategory
        fields = '__all__'
        read_only_fields = ['organization']


class TransactionSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True, default='')
    wallet_from_name = serializers.CharField(source='wallet_from.name', read_only=True, default='')
    wallet_to_name = serializers.CharField(source='wallet_to.name', read_only=True, default='')

    class Meta:
        model = Transaction
        fields = '__all__'
        read_only_fields = ['organization']


class DebtSerializer(serializers.ModelSerializer):
    remaining = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True, default='')
    customer_name = serializers.SerializerMethodField()

    class Meta:
        model = Debt
        fields = '__all__'
        read_only_fields = ['organization']

    def get_customer_name(self, obj):
        return str(obj.customer) if obj.customer else ''

from .models import CashShift

class CashShiftSerializer(serializers.ModelSerializer):
    opened_by_name = serializers.CharField(source='opened_by.get_full_name', read_only=True, default='')
    closed_by_name = serializers.CharField(source='closed_by.get_full_name', read_only=True, default='')
    wallet_name = serializers.CharField(source='wallet.name', read_only=True, default='')
    trading_point_name = serializers.CharField(source='trading_point.name', read_only=True, default='')

    class Meta:
        model = CashShift
        fields = '__all__'
        read_only_fields = ['organization', 'opened_by', 'closed_by', 'opened_at', 'closed_at',
                            'balance_at_open', 'expected_balance_at_close',
                            'actual_balance_at_close', 'discrepancy', 'status']

class CashShiftCloseSerializer(serializers.Serializer):
    actual_balance_at_close = serializers.DecimalField(max_digits=14, decimal_places=2, required=True)
    notes = serializers.CharField(required=False, allow_blank=True)

