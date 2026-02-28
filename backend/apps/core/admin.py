from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import Organization, User, TradingPoint, Warehouse, PaymentMethod

@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ('name', 'inn', 'phone')

@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ('username', 'email', 'role', 'organization', 'position', 'trading_point', 'is_active')
    list_filter = ('role', 'organization', 'position', 'trading_point', 'is_active')
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Организация и роль', {'fields': ('organization', 'role', 'active_organization', 'active_trading_point')}),
        ('Сотрудник', {'fields': ('patronymic', 'phone', 'position', 'trading_point',
                                   'hire_date', 'fire_date', 'avatar', 'notes')}),
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
