"""
FlowerBoss — SaaS-система управления цветочным бизнесом.
Django settings.
"""
import os
from pathlib import Path
from datetime import timedelta
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# Загружаем переменные окружения из файла .env
load_dotenv(BASE_DIR / '.env')

SECRET_KEY = os.getenv('DJANGO_SECRET_KEY')
if not SECRET_KEY:
    import warnings
    warnings.warn('DJANGO_SECRET_KEY not set! Using insecure default. SET IT IN PRODUCTION!', stacklevel=1)
    SECRET_KEY = 'django-insecure-k#8j1m#p1vx7&-w7+emo9*k0ml+8a5(xz##49!w!q%=mx$1^v9'

DEBUG = os.getenv('DJANGO_DEBUG', 'False') == 'True'
ALLOWED_HOSTS = os.getenv('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',')

# --------------- SECURITY (production) ---------------
if not DEBUG:
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_SSL_REDIRECT = os.getenv('SECURE_SSL_REDIRECT', 'False') == 'True'

# --------------- APPS ---------------
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # 3rd-party
    'rest_framework',
    'rest_framework_simplejwt',
    'django_filters',
    'corsheaders',
    # project apps
    'apps.core',
    'apps.nomenclature',
    'apps.inventory',
    'apps.sales',
    'apps.customers',
    'apps.suppliers',
    'apps.staff',
    'apps.finance',
    'apps.marketing',
    'apps.delivery',
    'apps.analytics',
]

# --------------- MIDDLEWARE ---------------
MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# --------------- DATABASE (PostgreSQL) ---------------
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv('DB_NAME', 'FLOW'),
        'USER': os.getenv('DB_USER', 'postgres'),
        'PASSWORD': os.getenv('DB_PASSWORD', 'postgres'),
        'HOST': os.getenv('DB_HOST', '127.0.0.1'),
        'PORT': os.getenv('DB_PORT', '5432'),
        'CONN_MAX_AGE': 600,
        'OPTIONS': {
            'sslmode': 'prefer',
        },
    }
}

# --------------- AUTH ---------------
AUTH_USER_MODEL = 'core.User'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
     'OPTIONS': {'min_length': 8}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# --------------- REST FRAMEWORK ---------------
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 25,
    'DATETIME_FORMAT': 'iso-8601',
    'DATE_FORMAT': 'iso-8601',
    'DATE_INPUT_FORMATS': ['iso-8601', '%d.%m.%Y'],
    'DATETIME_INPUT_FORMATS': ['iso-8601', '%d.%m.%Y %H:%M'],
    # Защита от перебора: анонимные запросы ограничены жёстче
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '30/minute',
        'user': '300/minute',
    },
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=2),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=3),
    'ROTATE_REFRESH_TOKENS': True,
}

# --------------- CORS ---------------
CORS_ALLOWED_ORIGINS = os.getenv(
    'CORS_ALLOWED_ORIGINS',
    'http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173',
).split(',')
CORS_ALLOW_ALL_ORIGINS = os.getenv('CORS_ALLOW_ALL', 'False') == 'True'  # только для dev

# --------------- i18n / tz ---------------
LANGUAGE_CODE = 'ru'
TIME_ZONE = 'Europe/Moscow'
USE_I18N = True
USE_TZ = True

# --------------- STATIC / MEDIA ---------------
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# --------------- ENTERPRISE SECURITY ---------------
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
