from rest_framework import serializers
from django.db import transaction as db_transaction
from apps.core.models import User
from .models import Position, PayrollScheme, Shift, SalaryAccrual


class PositionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Position
        fields = '__all__'
        read_only_fields = ['organization']


class EmployeeSerializer(serializers.ModelSerializer):
    """
    Сериализатор сотрудника.
    После слияния Employee→User каждый сотрудник — это запись в таблице users.
    Поле username не обязательно: если не указано — генерируется автоматически.
    """
    full_name = serializers.SerializerMethodField()
    position_name = serializers.CharField(source='position.name', read_only=True, default='')
    trading_point_name = serializers.CharField(source='trading_point.name', read_only=True, default='')
    has_account = serializers.SerializerMethodField()
    # username необязателен — если не передан, будет сгенерирован
    username = serializers.CharField(required=False, allow_blank=True, default='')
    password = serializers.CharField(write_only=True, required=False, allow_blank=True, default='')

    class Meta:
        model = User
        fields = [
            'id', 'organization', 'first_name', 'last_name', 'patronymic',
            'phone', 'email', 'position', 'position_name',
            'trading_point', 'trading_point_name',
            'hire_date', 'fire_date', 'is_active', 'notes',
            'full_name', 'has_account',
            'username', 'role', 'password',
        ]
        read_only_fields = ['id', 'organization']

    def get_full_name(self, obj):
        return obj.full_name

    def get_has_account(self, obj):
        """Сотрудник имеет учётную запись, если у него установлен валидный пароль."""
        return obj.has_usable_password()

    def validate_username(self, value):
        """Проверяем уникальность, если username задан."""
        value = (value or '').strip()
        if not value:
            return value
        qs = User.objects.filter(username=value)
        # При обновлении исключаем текущий объект
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                'Пользователь с таким логином уже существует.'
            )
        return value

    @staticmethod
    def _generate_username():
        """Генерация уникального служебного username вида emp_XXXXXXXX."""
        import uuid
        while True:
            uname = 'emp_' + uuid.uuid4().hex[:8]
            if not User.objects.filter(username=uname).exists():
                return uname

    @db_transaction.atomic
    def create(self, validated_data):
        password = validated_data.pop('password', '')
        username = (validated_data.get('username') or '').strip()

        # Проверка лимита max_users
        org = validated_data.get('organization')
        if org:
            current_count = User.objects.filter(organization=org).count()
            if current_count >= org.max_users:
                raise serializers.ValidationError(
                    {'organization': f'Достигнут лимит сотрудников ({org.max_users}). '
                                     f'Обратитесь к администратору для увеличения лимита.'}
                )

        # Автогенерация username если не задан
        if not username:
            validated_data['username'] = self._generate_username()
        else:
            validated_data['username'] = username

        user = User(**validated_data)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save()
        return user

    @db_transaction.atomic
    def update(self, instance, validated_data):
        password = validated_data.pop('password', '')
        username = (validated_data.get('username') or '').strip()

        # Если username очищен — он не должен стать пустым в БД
        if not username:
            validated_data.pop('username', None)

        instance = super().update(instance, validated_data)
        if password:
            instance.set_password(password)
            instance.save(update_fields=['password'])
        return instance


class PayrollSchemeSerializer(serializers.ModelSerializer):
    class Meta:
        model = PayrollScheme
        fields = '__all__'


class ShiftSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()

    class Meta:
        model = Shift
        fields = '__all__'
        read_only_fields = ['organization']

    def get_employee_name(self, obj):
        return obj.employee.full_name if obj.employee else ''


class SalaryAccrualSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()

    class Meta:
        model = SalaryAccrual
        fields = '__all__'
        read_only_fields = ['organization']

    def get_employee_name(self, obj):
        return obj.employee.full_name if obj.employee else ''
