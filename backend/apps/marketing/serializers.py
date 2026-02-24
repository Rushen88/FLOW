from rest_framework import serializers
from .models import AdChannel, AdInvestment, Discount, PromoCode, LoyaltyProgram


class AdChannelSerializer(serializers.ModelSerializer):
    class Meta:
        model = AdChannel
        fields = '__all__'
        read_only_fields = ['organization']


class AdInvestmentSerializer(serializers.ModelSerializer):
    channel_name = serializers.CharField(source='channel.name', read_only=True)

    class Meta:
        model = AdInvestment
        fields = '__all__'
        read_only_fields = ['organization']


class DiscountSerializer(serializers.ModelSerializer):
    class Meta:
        model = Discount
        fields = '__all__'
        read_only_fields = ['organization']


class PromoCodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = PromoCode
        fields = '__all__'
        read_only_fields = ['organization']


class LoyaltyProgramSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoyaltyProgram
        fields = '__all__'
        read_only_fields = ['organization']
