from rest_framework import serializers
from .models import DailySummary


class DailySummarySerializer(serializers.ModelSerializer):
    trading_point_name = serializers.CharField(
        source='trading_point.name', read_only=True
    )

    class Meta:
        model = DailySummary
        fields = '__all__'
        read_only_fields = ['organization']
