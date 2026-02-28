from django.contrib import admin
from .models import Position, PayrollScheme, Shift, SalaryAccrual


@admin.register(Position)
class PositionAdmin(admin.ModelAdmin):
    list_display = ('name', 'base_salary')


@admin.register(PayrollScheme)
class PayrollSchemeAdmin(admin.ModelAdmin):
    list_display = ('employee', 'scheme_type', 'base_amount', 'is_active')


@admin.register(Shift)
class ShiftAdmin(admin.ModelAdmin):
    list_display = ('employee', 'date', 'start_time', 'end_time', 'trading_point')
    list_filter = ('date', 'trading_point')


@admin.register(SalaryAccrual)
class SalaryAccrualAdmin(admin.ModelAdmin):
    list_display = ('employee', 'period_start', 'period_end', 'total', 'status')
    list_filter = ('status',)
