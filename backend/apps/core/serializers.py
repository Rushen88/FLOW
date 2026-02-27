from rest_framework import serializers
from .models import (
    Organization, User, TradingPoint, Warehouse, PaymentMethod,
    TenantContact, TenantPayment, TenantNote,
)


class OrganizationSerializer(serializers.ModelSerializer):
    """Базовый сериализатор (для владельцев/сотрудников тенанта)."""
    class Meta:
        model = Organization
        fields = ['id', 'name', 'inn', 'phone', 'email', 'is_active', 'created_at']
        read_only_fields = ['id', 'is_active', 'created_at']


class OrganizationAdminSerializer(serializers.ModelSerializer):
    """Расширенный сериализатор для суперадмина (с биллинг-полями)."""
    users_count = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = [
            'id', 'name', 'inn', 'phone', 'email',
            'is_active', 'subscription_plan', 'monthly_price',
            'paid_until', 'max_users', 'notes',
            'users_count', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']

    def get_users_count(self, obj):
        return obj.users.count()


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    organization_name = serializers.CharField(
        source='organization.name', read_only=True, default=''
    )
    active_organization_name = serializers.CharField(
        source='active_organization.name', read_only=True, default=''
    )

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name',
                  'patronymic', 'phone', 'role', 'organization', 'organization_name',
                  'active_organization', 'active_organization_name',
                  'avatar', 'is_active', 'is_superuser', 'full_name']
        read_only_fields = ['id', 'organization', 'is_superuser', 'active_organization']

    def get_full_name(self, obj):
        return obj.get_full_name()


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'password', 'first_name',
                  'last_name', 'patronymic', 'phone', 'role', 'organization']
        read_only_fields = ['organization']

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class TradingPointSerializer(serializers.ModelSerializer):
    class Meta:
        model = TradingPoint
        fields = '__all__'
        read_only_fields = ['organization']


class WarehouseSerializer(serializers.ModelSerializer):
    trading_point_name = serializers.CharField(
        source='trading_point.name', read_only=True
    )

    class Meta:
        model = Warehouse
        fields = '__all__'
        read_only_fields = ['organization']


class PaymentMethodSerializer(serializers.ModelSerializer):
    wallet_name = serializers.SerializerMethodField()

    class Meta:
        model = PaymentMethod
        fields = '__all__'
        read_only_fields = ['organization']

    def get_wallet_name(self, obj):
        return obj.wallet.name if obj.wallet else ''


# ─── Platform admin serializers ────────────────────────────────


class TenantContactSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(
        source='organization.name', read_only=True, default=''
    )

    class Meta:
        model = TenantContact
        fields = [
            'id', 'organization', 'organization_name',
            'name', 'position', 'phone', 'email',
            'is_primary', 'notes', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class TenantPaymentSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(
        source='organization.name', read_only=True, default=''
    )
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = TenantPayment
        fields = [
            'id', 'organization', 'organization_name',
            'amount', 'payment_date', 'period_from', 'period_to',
            'payment_method', 'invoice_number', 'notes',
            'created_by', 'created_by_name', 'created_at',
        ]
        read_only_fields = ['id', 'created_by', 'created_at']

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else ''


class TenantNoteSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(
        source='organization.name', read_only=True, default=''
    )
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = TenantNote
        fields = [
            'id', 'organization', 'organization_name',
            'note_type', 'subject', 'content',
            'created_by', 'created_by_name', 'created_at',
        ]
        read_only_fields = ['id', 'created_by', 'created_at']

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else ''


class PlatformAdminSerializer(serializers.ModelSerializer):
    """Сериализатор для управления администраторами платформы."""
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name',
            'patronymic', 'phone', 'is_superuser', 'is_active',
            'full_name', 'date_joined', 'last_login',
        ]
        read_only_fields = ['id', 'date_joined', 'last_login']

    def get_full_name(self, obj):
        return obj.get_full_name()


class PlatformAdminCreateSerializer(serializers.ModelSerializer):
    """Создание нового администратора платформы."""
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'password',
            'first_name', 'last_name', 'patronymic', 'phone',
        ]
        read_only_fields = ['id']

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User(**validated_data, is_superuser=True, is_staff=True)
        user.set_password(password)
        user.save()
        return user
