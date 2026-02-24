from rest_framework import serializers
from .models import CustomerGroup, Customer, ImportantDate, CustomerAddress


class CustomerGroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerGroup
        fields = '__all__'
        read_only_fields = ['organization']


class ImportantDateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ImportantDate
        fields = '__all__'


class CustomerAddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerAddress
        fields = '__all__'


class CustomerSerializer(serializers.ModelSerializer):
    important_dates = ImportantDateSerializer(many=True, read_only=True)
    addresses = CustomerAddressSerializer(many=True, read_only=True)
    full_name = serializers.CharField(read_only=True)
    groups_detail = CustomerGroupSerializer(source='groups', many=True, read_only=True)

    class Meta:
        model = Customer
        fields = '__all__'
        read_only_fields = ['organization']


class CustomerListSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = Customer
        fields = ['id', 'first_name', 'last_name', 'phone', 'email',
                  'total_purchases', 'purchases_count', 'bonus_points',
                  'discount_percent', 'full_name', 'is_active']
