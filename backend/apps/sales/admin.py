from django.contrib import admin
from .models import Sale, SaleItem, Order, OrderItem, OrderStatusHistory


class SaleItemInline(admin.TabularInline):
    model = SaleItem
    extra = 1


@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):
    list_display = ('number', 'customer', 'total', 'status', 'organization', 'created_at')
    list_filter = ('status', 'organization', 'trading_point', 'created_at')
    inlines = [SaleItemInline]


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 1


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ('number', 'customer', 'status', 'total', 'delivery_date', 'organization', 'created_at')
    list_filter = ('status', 'source', 'organization', 'trading_point', 'delivery_date')
    search_fields = ('number', 'recipient_name', 'recipient_phone')
    inlines = [OrderItemInline]


@admin.register(OrderStatusHistory)
class OrderStatusHistoryAdmin(admin.ModelAdmin):
    list_display = ('order', 'old_status', 'new_status', 'changed_by', 'created_at')
    list_filter = ('new_status',)
    readonly_fields = ('order', 'old_status', 'new_status', 'changed_by', 'comment', 'created_at')
