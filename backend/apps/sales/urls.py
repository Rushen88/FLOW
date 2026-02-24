from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register('sales', views.SaleViewSet)
router.register('sale-items', views.SaleItemViewSet)
router.register('orders', views.OrderViewSet)
router.register('order-items', views.OrderItemViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
