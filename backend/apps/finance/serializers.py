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

    class Meta:
        model = Debt
        fields = '__all__'
        read_only_fields = ['organization']
