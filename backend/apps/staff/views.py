from rest_framework import viewsets, filters
from django_filters.rest_framework import DjangoFilterBackend
from .models import Position, Employee, PayrollScheme, Shift, SalaryAccrual
from .serializers import (
    PositionSerializer, EmployeeSerializer,
    PayrollSchemeSerializer, ShiftSerializer, SalaryAccrualSerializer,
)
from apps.core.mixins import OrgPerformCreateMixin, _tenant_filter


class PositionViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = PositionSerializer
    queryset = Position.objects.all()

    def get_queryset(self):
        qs = Position.objects.all()
        return _tenant_filter(qs, self.request.user)


class EmployeeViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = EmployeeSerializer
    queryset = Employee.objects.all()
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['position', 'trading_point', 'is_active']
    search_fields = ['first_name', 'last_name', 'phone']

    def get_queryset(self):
        qs = Employee.objects.select_related('position', 'trading_point')
        return _tenant_filter(qs, self.request.user)


class PayrollSchemeViewSet(viewsets.ModelViewSet):
    serializer_class = PayrollSchemeSerializer
    queryset = PayrollScheme.objects.all()

    def get_queryset(self):
        qs = PayrollScheme.objects.select_related('employee')
        qs = _tenant_filter(qs, self.request.user, 'employee__organization')
        employee_id = self.request.query_params.get('employee')
        if employee_id:
            qs = qs.filter(employee_id=employee_id)
        return qs


class ShiftViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = ShiftSerializer
    queryset = Shift.objects.all()
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['employee', 'trading_point', 'date']

    def get_queryset(self):
        qs = Shift.objects.select_related('employee', 'trading_point')
        return _tenant_filter(qs, self.request.user)


class SalaryAccrualViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = SalaryAccrualSerializer
    queryset = SalaryAccrual.objects.all()
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['status', 'employee']

    def get_queryset(self):
        qs = SalaryAccrual.objects.select_related('employee')
        return _tenant_filter(qs, self.request.user)
