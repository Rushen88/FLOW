from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register('positions', views.PositionViewSet)
router.register('employees', views.EmployeeViewSet)
router.register('payroll-schemes', views.PayrollSchemeViewSet)
router.register('shifts', views.ShiftViewSet)
router.register('salary-accruals', views.SalaryAccrualViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
