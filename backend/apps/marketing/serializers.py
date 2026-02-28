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
    target_group_name = serializers.CharField(
        source='target_group.name', read_only=True, default=''
    )
    target_nomenclature_name = serializers.CharField(
        source='target_nomenclature.name', read_only=True, default=''
    )

    class Meta:
        model = Discount
        fields = '__all__'
        read_only_fields = ['organization']

    def validate(self, data):
        apply_to = data.get('apply_to', getattr(self.instance, 'apply_to', 'all'))
        if apply_to == 'group' and not data.get('target_group'):
            if not (self.instance and self.instance.target_group_id):
                raise serializers.ValidationError(
                    {'target_group': 'Укажите группу для скидки по группе.'}
                )
        if apply_to == 'nomenclature' and not data.get('target_nomenclature'):
            if not (self.instance and self.instance.target_nomenclature_id):
                raise serializers.ValidationError(
                    {'target_nomenclature': 'Укажите товар для скидки по товару.'}
                )
        return data


class PromoCodeSerializer(serializers.ModelSerializer):
    discount_name = serializers.CharField(
        source='discount.name', read_only=True, default=''
    )

    class Meta:
        model = PromoCode
        fields = '__all__'
        read_only_fields = ['organization', 'used_count']


class LoyaltyProgramSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoyaltyProgram
        fields = '__all__'
        read_only_fields = ['organization']
