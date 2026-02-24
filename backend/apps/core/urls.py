from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register('organizations', views.OrganizationViewSet)
router.register('users', views.UserViewSet)
router.register('trading-points', views.TradingPointViewSet)
router.register('warehouses', views.WarehouseViewSet)
router.register('payment-methods', views.PaymentMethodViewSet)
# Platform admin
router.register('tenant-contacts', views.TenantContactViewSet)
router.register('tenant-payments', views.TenantPaymentViewSet)
router.register('tenant-notes', views.TenantNoteViewSet)
router.register('platform-admins', views.PlatformAdminViewSet, basename='platform-admin')

urlpatterns = [
    path('', include(router.urls)),
]
