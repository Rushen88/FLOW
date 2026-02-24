from django.contrib import admin
from .models import DeliveryZone, Courier, Delivery


@admin.register(DeliveryZone)
class DeliveryZoneAdmin(admin.ModelAdmin):
    list_display = ('name', 'price', 'estimated_minutes', 'is_active')


@admin.register(Courier)
class CourierAdmin(admin.ModelAdmin):
    list_display = ('name', 'courier_type', 'phone', 'is_available', 'is_active')
    list_filter = ('courier_type', 'is_available')


@admin.register(Delivery)
class DeliveryAdmin(admin.ModelAdmin):
    list_display = ('order', 'courier', 'status', 'delivery_date', 'address')
    list_filter = ('status', 'delivery_date')
