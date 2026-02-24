from django.contrib import admin
from .models import AdChannel, AdInvestment, Discount, PromoCode, LoyaltyProgram


@admin.register(AdChannel)
class AdChannelAdmin(admin.ModelAdmin):
    list_display = ('name', 'channel_type', 'is_active')


@admin.register(AdInvestment)
class AdInvestmentAdmin(admin.ModelAdmin):
    list_display = ('channel', 'amount', 'date')
    list_filter = ('channel', 'date')


@admin.register(Discount)
class DiscountAdmin(admin.ModelAdmin):
    list_display = ('name', 'discount_type', 'value', 'is_active')


@admin.register(PromoCode)
class PromoCodeAdmin(admin.ModelAdmin):
    list_display = ('code', 'discount', 'used_count', 'max_uses', 'is_active')


@admin.register(LoyaltyProgram)
class LoyaltyProgramAdmin(admin.ModelAdmin):
    list_display = ('name', 'program_type', 'accrual_percent', 'is_active')
