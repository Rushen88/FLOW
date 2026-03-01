from rest_framework import viewsets
from django_filters.rest_framework import DjangoFilterBackend
from .models import DeliveryZone, Courier, Delivery
from .serializers import DeliveryZoneSerializer, CourierSerializer, DeliverySerializer
from apps.core.mixins import OrgPerformCreateMixin, _tenant_filter, ReadOnlyOrManager


class DeliveryZoneViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = DeliveryZoneSerializer
    queryset = DeliveryZone.objects.all()
    permission_classes = [ReadOnlyOrManager]

    def get_queryset(self):
        return _tenant_filter(DeliveryZone.objects.all(), self.request.user)


class CourierViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = CourierSerializer
    queryset = Courier.objects.all()
    permission_classes = [ReadOnlyOrManager]

    def get_queryset(self):
        return _tenant_filter(Courier.objects.all(), self.request.user)


class DeliveryViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = DeliverySerializer
    queryset = Delivery.objects.all()
    permission_classes = [ReadOnlyOrManager]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['status', 'courier', 'delivery_date']

    def get_queryset(self):
        qs = Delivery.objects.select_related('courier', 'zone', 'order')
        return _tenant_filter(qs, self.request.user, tp_field='order__trading_point')
