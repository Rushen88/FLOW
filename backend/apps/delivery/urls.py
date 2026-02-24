from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register('zones', views.DeliveryZoneViewSet)
router.register('couriers', views.CourierViewSet)
router.register('deliveries', views.DeliveryViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
