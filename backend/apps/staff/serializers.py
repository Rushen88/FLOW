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
    # User account fields (read)
    username = serializers.CharField(source='user.username', read_only=True, default='')
    user_role = serializers.CharField(source='user.role', read_only=True, default='')
    user_is_active = serializers.BooleanField(source='user.is_active', read_only=True, default=True)
    # User account fields (write)
    create_username = serializers.CharField(write_only=True, required=False, allow_blank=True)
    create_password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    create_role = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = Employee
        fields = '__all__'
        read_only_fields = ['organization']

    def create(self, validated_data):
        username = validated_data.pop('create_username', '')
        password = validated_data.pop('create_password', '')
        role = validated_data.pop('create_role', 'seller')
        employee = super().create(validated_data)
        if username and password:
            from apps.core.models import User
            user = User(
                username=username,
                organization=employee.organization,
                role=role or 'seller',
                first_name=employee.first_name,
                last_name=employee.last_name,
                phone=employee.phone or '',
                email=employee.email or '',
            )
            user.set_password(password)
            user.save()
            employee.user = user
            employee.save(update_fields=['user'])
        return employee

    def update(self, instance, validated_data):
        username = validated_data.pop('create_username', '')
        password = validated_data.pop('create_password', '')
        role = validated_data.pop('create_role', '')
        instance = super().update(instance, validated_data)
        # Create user if requested and not yet linked
        if username and password and not instance.user:
            from apps.core.models import User
            user = User(
                username=username,
                organization=instance.organization,
                role=role or 'seller',
                first_name=instance.first_name,
                last_name=instance.last_name,
                phone=instance.phone or '',
                email=instance.email or '',
            )
            user.set_password(password)
            user.save()
            instance.user = user
            instance.save(update_fields=['user'])
        elif instance.user:
            # Update role on linked user
            if role and role != instance.user.role:
                instance.user.role = role
                instance.user.save(update_fields=['role'])
            # Update password if provided
            if password:
                instance.user.set_password(password)
                instance.user.save(update_fields=['password'])
        return instance


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
