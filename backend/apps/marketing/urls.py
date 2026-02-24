from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register('channels', views.AdChannelViewSet)
router.register('investments', views.AdInvestmentViewSet)
router.register('discounts', views.DiscountViewSet)
router.register('promo-codes', views.PromoCodeViewSet)
router.register('loyalty', views.LoyaltyProgramViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
