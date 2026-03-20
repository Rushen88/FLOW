from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'categories', views.SalesCategoryViewSet, basename='cashier-categories')
router.register(r'feed', views.CashierFeedView, basename='cashier-feed')
router.register(r'reserves', views.ReserveViewSet, basename='cashier-reserves')
router.register(r'checkout', views.CheckoutView, basename='cashier-checkout')
router.register(r'snapshots', views.BouquetSnapshotViewSet, basename='cashier-snapshots')

urlpatterns = [
    path('', include(router.urls)),
]
