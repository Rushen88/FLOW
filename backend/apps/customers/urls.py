from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register('groups', views.CustomerGroupViewSet)
router.register('customers', views.CustomerViewSet)
router.register('important-dates', views.ImportantDateViewSet)
router.register('addresses', views.CustomerAddressViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
