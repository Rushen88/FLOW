from django.contrib import admin
from .models import NomenclatureGroup, MeasureUnit, Nomenclature, BouquetTemplate, BouquetComponent


class BouquetComponentInline(admin.TabularInline):
    model = BouquetComponent
    extra = 1


@admin.register(NomenclatureGroup)
class NomenclatureGroupAdmin(admin.ModelAdmin):
    list_display = ('name', 'parent', 'sort_order')


@admin.register(MeasureUnit)
class MeasureUnitAdmin(admin.ModelAdmin):
    list_display = ('name', 'short_name')


@admin.register(Nomenclature)
class NomenclatureAdmin(admin.ModelAdmin):
    list_display = ('name', 'nomenclature_type', 'sku', 'retail_price', 'is_active')
    list_filter = ('nomenclature_type', 'group', 'is_active')
    search_fields = ('name', 'sku', 'barcode')


@admin.register(BouquetTemplate)
class BouquetTemplateAdmin(admin.ModelAdmin):
    list_display = ('nomenclature', 'assembly_time_minutes', 'difficulty')
    inlines = [BouquetComponentInline]
