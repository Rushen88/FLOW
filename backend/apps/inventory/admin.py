from django.contrib import admin
from .models import Batch, StockBalance, StockMovement, InventoryDocument, InventoryItem, Reserve


@admin.register(Batch)
class BatchAdmin(admin.ModelAdmin):
    list_display = ('nomenclature', 'quantity', 'remaining', 'arrival_date', 'warehouse')
    list_filter = ('warehouse', 'arrival_date')


@admin.register(StockBalance)
class StockBalanceAdmin(admin.ModelAdmin):
    list_display = ('nomenclature', 'warehouse', 'quantity', 'avg_purchase_price')
    list_filter = ('warehouse',)


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = ('nomenclature', 'movement_type', 'quantity', 'created_at')
    list_filter = ('movement_type', 'created_at')


class InventoryItemInline(admin.TabularInline):
    model = InventoryItem
    extra = 0


@admin.register(InventoryDocument)
class InventoryDocumentAdmin(admin.ModelAdmin):
    list_display = ('number', 'warehouse', 'status', 'created_at')
    inlines = [InventoryItemInline]


@admin.register(Reserve)
class ReserveAdmin(admin.ModelAdmin):
    list_display = ('nomenclature', 'warehouse', 'quantity', 'is_active')
