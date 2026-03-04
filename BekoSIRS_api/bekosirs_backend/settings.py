# bekosirs_backend/settings.py
import os
from pathlib import Path
from datetime import timedelta
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# ------------------------------------------------------------
# BASE CONFIG
# ------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent

# Security: Load from environment variables
# SECRET_KEY is REQUIRED - Django will not start without it
SECRET_KEY = os.environ['SECRET_KEY']

# DEBUG defaults to False for security (must explicitly enable in development)
DEBUG = os.getenv('DEBUG', 'False').lower() in ('true', '1', 'yes')

# ALLOWED_HOSTS: Parse from environment variable (comma-separated list)
# Default to localhost only for security
_allowed_hosts = os.getenv('ALLOWED_HOSTS', '*')
ALLOWED_HOSTS = ['*']
# Add local network IPs for mobile development access via .env
# Example: ALLOWED_HOSTS=localhost,127.0.0.1,192.168.0.107


# ------------------------------------------------------------
# APPLICATIONS
# ------------------------------------------------------------
INSTALLED_APPS = [
    # Django Core Apps
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework_simplejwt.token_blacklist',

    # Third Party Apps
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    'drf_spectacular',  # API Documentation
    'django_filters',   # Enable filtering

    # Local Apps
    'products.apps.ProductsConfig',
]

AUTH_USER_MODEL = 'products.CustomUser'

# ------------------------------------------------------------
# MIDDLEWARE
# ------------------------------------------------------------
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



# ------------------------------------------------------------
# URLS / TEMPLATES / WSGI
# ------------------------------------------------------------
ROOT_URLCONF = 'bekosirs_backend.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'bekosirs_backend.wsgi.application'

# ------------------------------------------------------------
# DATABASE
# ------------------------------------------------------------
# Use SQLite for development/testing if DB environment variables not set
# Use MSSQL for production
if os.getenv('DB_NAME'):
    DATABASES = {
        'default': {
            'ENGINE': 'mssql',
            'NAME': os.environ['DB_NAME'],
            'USER': os.environ['DB_USER'],
            'PASSWORD': os.environ['DB_PASSWORD'],
            'HOST': os.environ['DB_HOST'],
            'PORT': os.getenv('DB_PORT', '1433'),
            'OPTIONS': {
                'driver': 'ODBC Driver 18 for SQL Server',
                'extra_params': 'Encrypt=yes;TrustServerCertificate=yes',
            },
        }
    }
else:
    # SQLite fallback for local development/testing
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

# ------------------------------------------------------------
# STATIC & MEDIA
# ------------------------------------------------------------
STATIC_URL = '/static/'

MEDIA_URL = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')

# ------------------------------------------------------------
# CORS CONFIGURATION
# ------------------------------------------------------------
# CORS_ALLOW_ALL_ORIGINS defaults to False for security
# Set to True only in development via .env
CORS_ALLOW_ALL_ORIGINS = os.getenv('CORS_ALLOW_ALL_ORIGINS', 'False').lower() in ('true', '1', 'yes')
CORS_ALLOW_CREDENTIALS = True

# Parse CORS origins from environment variable
_cors_origins = os.getenv('CORS_ALLOWED_ORIGINS', 'http://localhost:5173,http://localhost:8081')
CORS_ALLOWED_ORIGINS = [origin.strip() for origin in _cors_origins.split(',') if origin.strip()]

# ------------------------------------------------------------
# REST FRAMEWORK + JWT
# ------------------------------------------------------------
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    # Enable search, filtering, and ordering
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
    # Rate limiting to prevent brute force attacks
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '20/minute',
        'user': '100/minute',
    },
    # Pagination for list endpoints
    'DEFAULT_PAGINATION_CLASS': 'products.pagination.CustomPagination',
    'PAGE_SIZE': 20,
    # OpenAPI Schema generation
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
}

# ------------------------------------------------------------
# API DOCUMENTATION (drf-spectacular)
# ------------------------------------------------------------
SPECTACULAR_SETTINGS = {
    'TITLE': 'BekoSIRS API',
    'DESCRIPTION': 'Beko Smart Inventory and Recommendation System API',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
    'COMPONENT_SPLIT_REQUEST': True,
    'SCHEMA_PATH_PREFIX': '/api/v1/',
    'TAGS': [
        {'name': 'Authentication', 'description': 'User authentication and registration'},
        {'name': 'Products', 'description': 'Product management endpoints'},
        {'name': 'Categories', 'description': 'Category management endpoints'},
        {'name': 'Users', 'description': 'User management endpoints'},
        {'name': 'Wishlist', 'description': 'Wishlist management'},
        {'name': 'Service Requests', 'description': 'Service request handling'},
        {'name': 'Notifications', 'description': 'Notification management'},
        {'name': 'Recommendations', 'description': 'AI-powered product recommendations'},
    ],
}

# ------------------------------------------------------------
# CACHING CONFIGURATION
# ------------------------------------------------------------
# Using LocMemCache for development (no external dependencies)
# For production, switch to Redis by setting REDIS_URL env var
if os.getenv('REDIS_URL'):
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.redis.RedisCache',
            'LOCATION': os.environ['REDIS_URL'],
        }
    }
else:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            'LOCATION': 'bekosirs-cache',
        }
    }

# Cache timeouts (in seconds)
CACHE_TTL_SHORT = 60 * 5      # 5 minutes
CACHE_TTL_MEDIUM = 60 * 30    # 30 minutes
CACHE_TTL_LONG = 60 * 60 * 2  # 2 hours

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=1),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# ------------------------------------------------------------
# PASSWORD VALIDATION
# ------------------------------------------------------------
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
        'OPTIONS': {'min_length': 8},
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# ------------------------------------------------------------
# DİĞER AYARLAR
# ------------------------------------------------------------
LANGUAGE_CODE = 'tr-tr'
TIME_ZONE = 'Europe/Istanbul'
USE_I18N = True
USE_TZ = True

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ------------------------------------------------------------
# EMAIL CONFIGURATION
# ------------------------------------------------------------
# Uses console backend for development (prints emails to console)
# Uses SMTP for production when EMAIL_HOST is set
if os.getenv('EMAIL_HOST'):
    EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
    EMAIL_HOST = os.environ['EMAIL_HOST']
    EMAIL_PORT = int(os.getenv('EMAIL_PORT', '587'))
    EMAIL_USE_TLS = os.getenv('EMAIL_USE_TLS', 'True').lower() in ('true', '1', 'yes')
    EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER', '')
    EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD', '')
else:
    # Development: print emails to console
    EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

DEFAULT_FROM_EMAIL = os.getenv('DEFAULT_FROM_EMAIL', 'BekoSIRS <noreply@bekosirs.com>')
PASSWORD_RESET_TIMEOUT = 3600  # 1 hour in seconds

# Frontend URL for password reset links (used in emails)
FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:5173')

# ------------------------------------------------------------
# SECURITY HEADERS & SETTINGS
# ------------------------------------------------------------
# These settings are critical for production security
# They are disabled in DEBUG mode for development convenience

if not DEBUG:
    # HTTPS/SSL Settings
    SECURE_SSL_REDIRECT = True  # Redirect all HTTP to HTTPS
    SECURE_HSTS_SECONDS = 31536000  # 1 year HSTS
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True

    # Cookie Security
    SESSION_COOKIE_SECURE = True  # Only send cookies over HTTPS
    CSRF_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True  # Prevent JavaScript access
    CSRF_COOKIE_HTTPONLY = True

    # Browser Security
    SECURE_BROWSER_XSS_FILTER = True  # Enable XSS filter
    SECURE_CONTENT_TYPE_NOSNIFF = True  # Prevent MIME-sniffing
    X_FRAME_OPTIONS = 'DENY'  # Prevent clickjacking

# Proxy headers (for deployment behind reverse proxy like nginx)
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# ------------------------------------------------------------
# LOGGING CONFIGURATION
# ------------------------------------------------------------
# Ensure logs directory exists
LOGS_DIR = BASE_DIR / 'logs'
LOGS_DIR.mkdir(exist_ok=True)

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
        },
        'simple': {
            'format': '{levelname} {asctime} {message}',
            'style': '{',
        },
    },
    'filters': {
        'require_debug_false': {
            '()': 'django.utils.log.RequireDebugFalse',
        },
        'require_debug_true': {
            '()': 'django.utils.log.RequireDebugTrue',
        },
    },
    'handlers': {
        'console': {
            'level': 'INFO',
            'class': 'logging.StreamHandler',
            'formatter': 'simple',
        },
        'file': {
            'level': 'INFO',
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': BASE_DIR / 'logs' / 'bekosirs.log',
            'maxBytes': 1024 * 1024 * 10,  # 10 MB
            'backupCount': 5,
            'formatter': 'verbose',
        },
        'error_file': {
            'level': 'ERROR',
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': BASE_DIR / 'logs' / 'errors.log',
            'maxBytes': 1024 * 1024 * 10,  # 10 MB
            'backupCount': 5,
            'formatter': 'verbose',
        },
    },
    'loggers': {
        'django': {
            'handlers': ['console', 'file'],
            'level': 'INFO',
            'propagate': False,
        },
        'django.request': {
            'handlers': ['error_file'],
            'level': 'ERROR',
            'propagate': False,
        },
        'products': {
            'handlers': ['console', 'file', 'error_file'],
            'level': 'DEBUG' if DEBUG else 'INFO',
            'propagate': False,
        },
    },
    'root': {
        'handlers': ['console', 'file'],
        'level': 'INFO',
    },
}

