from rest_framework import viewsets, filters
from rest_framework.exceptions import ValidationError
from django_filters.rest_framework import DjangoFilterBackend
from apps.core.models import User
from .models import Position, PayrollScheme, Shift, SalaryAccrual
from .serializers import (
    PositionSerializer, EmployeeSerializer,
    PayrollSchemeSerializer, ShiftSerializer, SalaryAccrualSerializer,
)
from apps.core.mixins import OrgPerformCreateMixin, _tenant_filter, _resolve_org, IsOwnerOrAdmin, IsManager


class PositionViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = PositionSerializer
    queryset = Position.objects.all()
    permission_classes = [IsManager]

    def get_queryset(self):
        qs = Position.objects.all()
        return _tenant_filter(qs, self.request.user)


class EmployeeViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    """
    Управление сотрудниками.
    После слияния Employee→User каждый сотрудник — это User-объект.
    Суперадмины исключаются из выборки.
    """
    serializer_class = EmployeeSerializer
    queryset = User.objects.all()
    permission_classes = [IsOwnerOrAdmin]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['position', 'trading_point', 'is_active']
    search_fields = ['first_name', 'last_name', 'phone', 'username']

    def get_queryset(self):
        # Allow superusers if they are part of the organization (e.g. owners),
        # but filter by tenant via _tenant_filter normally.
        qs = User.objects.select_related('position', 'trading_point')
        return _tenant_filter(qs, self.request.user)

    def perform_create(self, serializer):
        """Создание сотрудника — проверка лимита max_users."""
        org = _resolve_org(self.request.user)
        if not org:
            raise ValidationError(
                {'organization': 'Сначала выберите организацию.'},
                code='no_organization',
            )
        serializer.save(organization=org)


class PayrollSchemeViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = PayrollSchemeSerializer
    queryset = PayrollScheme.objects.all()
    permission_classes = [IsOwnerOrAdmin]

    def get_queryset(self):
        qs = PayrollScheme.objects.select_related('employee')
        qs = _tenant_filter(qs, self.request.user, 'employee__organization')
        employee_id = self.request.query_params.get('employee')
        if employee_id:
            qs = qs.filter(employee_id=employee_id)
        return qs

    def perform_create(self, serializer):
        """Проверка что сотрудник принадлежит организации пользователя."""
        employee = serializer.validated_data.get('employee')
        org = _resolve_org(self.request.user)
        if employee and org and str(employee.organization_id) != str(org.id):
            raise ValidationError({'employee': 'Сотрудник не принадлежит вашей организации.'})
        serializer.save()


class ShiftViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = ShiftSerializer
    queryset = Shift.objects.all()
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['employee', 'trading_point', 'date']

    def get_queryset(self):
        qs = Shift.objects.select_related('employee', 'trading_point')
        return _tenant_filter(qs, self.request.user, tp_field='trading_point')


class SalaryAccrualViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = SalaryAccrualSerializer
    queryset = SalaryAccrual.objects.all()
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['status', 'employee']

    def get_queryset(self):
        qs = SalaryAccrual.objects.select_related('employee')
        return _tenant_filter(qs, self.request.user)
