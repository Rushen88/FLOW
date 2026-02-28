from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register('wallets', views.WalletViewSet)
router.register('categories', views.TransactionCategoryViewSet)
router.register('transactions', views.TransactionViewSet)
router.register('debts', views.DebtViewSet)
router.register('cash-shifts', views.CashShiftViewSet, basename='cashshift')

urlpatterns = [
    path('', include(router.urls)),
]
