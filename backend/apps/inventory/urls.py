from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register('batches', views.BatchViewSet)
router.register('stock', views.StockBalanceViewSet)
router.register('movements', views.StockMovementViewSet)
router.register('inventory-docs', views.InventoryDocumentViewSet)
router.register('reserves', views.ReserveViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
