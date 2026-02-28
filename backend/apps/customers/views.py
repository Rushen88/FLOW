from rest_framework import viewsets, filters
from rest_framework.exceptions import ValidationError
from django_filters.rest_framework import DjangoFilterBackend
from .models import CustomerGroup, Customer, ImportantDate, CustomerAddress
from .serializers import (
    CustomerGroupSerializer, CustomerSerializer, CustomerListSerializer,
    ImportantDateSerializer, CustomerAddressSerializer,
)
from apps.core.mixins import OrgPerformCreateMixin, _tenant_filter, _resolve_org


class CustomerGroupViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = CustomerGroupSerializer
    queryset = CustomerGroup.objects.all()

    def get_queryset(self):
        qs = CustomerGroup.objects.all()
        return _tenant_filter(qs, self.request.user)


class CustomerViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = CustomerSerializer
    queryset = Customer.objects.all()
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['groups', 'gender', 'is_active']
    search_fields = ['first_name', 'last_name', 'phone', 'email']
    ordering_fields = ['first_name', 'total_purchases', 'created_at']

    def get_serializer_class(self):
        if self.action == 'list':
            return CustomerListSerializer
        return CustomerSerializer

    def get_queryset(self):
        qs = Customer.objects.prefetch_related('groups', 'important_dates', 'addresses')
        return _tenant_filter(qs, self.request.user)


class ImportantDateViewSet(viewsets.ModelViewSet):
    serializer_class = ImportantDateSerializer
    queryset = ImportantDate.objects.all()

    def get_queryset(self):
        qs = ImportantDate.objects.all()
        qs = _tenant_filter(qs, self.request.user, 'customer__organization')
        customer_id = self.request.query_params.get('customer')
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        return qs

    def perform_create(self, serializer):
        """Проверка что клиент принадлежит организации пользователя."""
        customer = serializer.validated_data.get('customer')
        org = _resolve_org(self.request.user)
        if customer and org and str(customer.organization_id) != str(org.id):
            raise ValidationError({'customer': 'Клиент не принадлежит вашей организации.'})
        serializer.save()


class CustomerAddressViewSet(viewsets.ModelViewSet):
    serializer_class = CustomerAddressSerializer
    queryset = CustomerAddress.objects.all()

    def get_queryset(self):
        qs = CustomerAddress.objects.all()
        qs = _tenant_filter(qs, self.request.user, 'customer__organization')
        customer_id = self.request.query_params.get('customer')
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        return qs

    def perform_create(self, serializer):
        """Проверка что клиент принадлежит организации пользователя."""
        customer = serializer.validated_data.get('customer')
        org = _resolve_org(self.request.user)
        if customer and org and str(customer.organization_id) != str(org.id):
            raise ValidationError({'customer': 'Клиент не принадлежит вашей организации.'})
        serializer.save()
