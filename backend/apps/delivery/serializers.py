from rest_framework import serializers
from .models import DeliveryZone, Courier, Delivery


class DeliveryZoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeliveryZone
        fields = '__all__'
        read_only_fields = ['organization']


class CourierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Courier
        fields = '__all__'
        read_only_fields = ['organization']


class DeliverySerializer(serializers.ModelSerializer):
    courier_name = serializers.CharField(source='courier.name', read_only=True, default='')
    zone_name = serializers.CharField(source='zone.name', read_only=True, default='')

    class Meta:
        model = Delivery
        fields = '__all__'
        read_only_fields = ['organization']
