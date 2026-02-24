from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register('suppliers', views.SupplierViewSet)
router.register('nomenclatures', views.SupplierNomenclatureViewSet)
router.register('orders', views.SupplierOrderViewSet)
router.register('claims', views.ClaimViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
