from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import Organization, User, TradingPoint, Warehouse, PaymentMethod

@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ('name', 'inn', 'phone')

@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ('username', 'email', 'role', 'organization', 'is_active')
    list_filter = ('role', 'organization', 'is_active')
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Доп. информация', {'fields': ('organization', 'role', 'patronymic', 'phone', 'avatar')}),
    )

@admin.register(TradingPoint)
class TradingPointAdmin(admin.ModelAdmin):
    list_display = ('name', 'address', 'organization', 'is_active')

@admin.register(Warehouse)
class WarehouseAdmin(admin.ModelAdmin):
    list_display = ('name', 'warehouse_type', 'trading_point', 'is_active')

@admin.register(PaymentMethod)
class PaymentMethodAdmin(admin.ModelAdmin):
    list_display = ('name', 'is_cash', 'is_active')
