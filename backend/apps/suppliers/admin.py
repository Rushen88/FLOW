from django.contrib import admin
from .models import Supplier, SupplierNomenclature, SupplierOrder, SupplierOrderItem, Claim


class SupplierOrderItemInline(admin.TabularInline):
    model = SupplierOrderItem
    extra = 1


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ('name', 'contact_person', 'phone', 'rating', 'is_active')
    search_fields = ('name', 'contact_person', 'phone')


@admin.register(SupplierNomenclature)
class SupplierNomenclatureAdmin(admin.ModelAdmin):
    list_display = ('supplier', 'nomenclature', 'price', 'is_available')


@admin.register(SupplierOrder)
class SupplierOrderAdmin(admin.ModelAdmin):
    list_display = ('number', 'supplier', 'status', 'total', 'created_at')
    list_filter = ('status',)
    inlines = [SupplierOrderItemInline]


@admin.register(Claim)
class ClaimAdmin(admin.ModelAdmin):
    list_display = ('supplier', 'status', 'amount', 'created_at')
    list_filter = ('status',)
