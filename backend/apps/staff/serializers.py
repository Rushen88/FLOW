from rest_framework import serializers
from .models import Position, Employee, PayrollScheme, Shift, SalaryAccrual


class PositionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Position
        fields = '__all__'
        read_only_fields = ['organization']


class EmployeeSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    position_name = serializers.CharField(source='position.name', read_only=True, default='')

    class Meta:
        model = Employee
        fields = '__all__'
        read_only_fields = ['organization']


class PayrollSchemeSerializer(serializers.ModelSerializer):
    class Meta:
        model = PayrollScheme
        fields = '__all__'


class ShiftSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)

    class Meta:
        model = Shift
        fields = '__all__'
        read_only_fields = ['organization']


class SalaryAccrualSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)

    class Meta:
        model = SalaryAccrual
        fields = '__all__'
        read_only_fields = ['organization']
