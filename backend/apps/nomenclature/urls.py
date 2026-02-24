from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register('groups', views.NomenclatureGroupViewSet)
router.register('units', views.MeasureUnitViewSet)
router.register('items', views.NomenclatureViewSet)
router.register('bouquet-templates', views.BouquetTemplateViewSet)
router.register('bouquet-components', views.BouquetComponentViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
