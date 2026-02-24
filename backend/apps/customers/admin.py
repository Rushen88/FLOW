from django.contrib import admin
from .models import CustomerGroup, Customer, ImportantDate, CustomerAddress


class ImportantDateInline(admin.TabularInline):
    model = ImportantDate
    extra = 0


class CustomerAddressInline(admin.TabularInline):
    model = CustomerAddress
    extra = 0


@admin.register(CustomerGroup)
class CustomerGroupAdmin(admin.ModelAdmin):
    list_display = ('name', 'discount_percent')


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ('first_name', 'last_name', 'phone', 'total_purchases', 'purchases_count')
    search_fields = ('first_name', 'last_name', 'phone', 'email')
    list_filter = ('groups', 'gender')
    inlines = [ImportantDateInline, CustomerAddressInline]
