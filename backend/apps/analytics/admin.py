from django.contrib import admin
from .models import DailySummary


@admin.register(DailySummary)
class DailySummaryAdmin(admin.ModelAdmin):
    list_display = ('trading_point', 'date', 'revenue', 'profit', 'sales_count', 'avg_check')
    list_filter = ('trading_point', 'date')
