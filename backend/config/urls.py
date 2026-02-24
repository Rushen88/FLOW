from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework_simplejwt.views import (
    TokenObtainPairView, TokenRefreshView, TokenVerifyView,
)

urlpatterns = [
    path('admin/', admin.site.urls),

    # JWT Auth
    path('api/auth/token/', TokenObtainPairView.as_view(), name='token_obtain'),
    path('api/auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/auth/token/verify/', TokenVerifyView.as_view(), name='token_verify'),

    # API модулей
    path('api/core/', include('apps.core.urls')),
    path('api/nomenclature/', include('apps.nomenclature.urls')),
    path('api/inventory/', include('apps.inventory.urls')),
    path('api/sales/', include('apps.sales.urls')),
    path('api/customers/', include('apps.customers.urls')),
    path('api/suppliers/', include('apps.suppliers.urls')),
    path('api/staff/', include('apps.staff.urls')),
    path('api/finance/', include('apps.finance.urls')),
    path('api/marketing/', include('apps.marketing.urls')),
    path('api/delivery/', include('apps.delivery.urls')),
    path('api/analytics/', include('apps.analytics.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
