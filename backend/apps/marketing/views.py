from rest_framework import viewsets
from .models import AdChannel, AdInvestment, Discount, PromoCode, LoyaltyProgram
from .serializers import (
    AdChannelSerializer, AdInvestmentSerializer,
    DiscountSerializer, PromoCodeSerializer, LoyaltyProgramSerializer,
)
from apps.core.mixins import OrgPerformCreateMixin, _tenant_filter


class AdChannelViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = AdChannelSerializer
    queryset = AdChannel.objects.all()

    def get_queryset(self):
        return _tenant_filter(AdChannel.objects.all(), self.request.user)


class AdInvestmentViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = AdInvestmentSerializer
    queryset = AdInvestment.objects.all()

    def get_queryset(self):
        qs = AdInvestment.objects.select_related('channel')
        return _tenant_filter(qs, self.request.user)


class DiscountViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = DiscountSerializer
    queryset = Discount.objects.all()

    def get_queryset(self):
        return _tenant_filter(Discount.objects.all(), self.request.user)


class PromoCodeViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = PromoCodeSerializer
    queryset = PromoCode.objects.all()

    def get_queryset(self):
        return _tenant_filter(PromoCode.objects.all(), self.request.user)


class LoyaltyProgramViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = LoyaltyProgramSerializer
    queryset = LoyaltyProgram.objects.all()

    def get_queryset(self):
        return _tenant_filter(LoyaltyProgram.objects.all(), self.request.user)
