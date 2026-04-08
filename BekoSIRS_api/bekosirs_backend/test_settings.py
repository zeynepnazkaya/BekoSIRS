"""
Dedicated Django settings for automated test runs.

The regular settings module loads `.env` with `override=True`, which is useful
for local app execution but can redirect pytest to shared PostgreSQL
infrastructure. Tests should remain hermetic, so we pin them to SQLite here.
"""

from pathlib import Path

from .settings import *  # noqa: F401,F403 - test settings intentionally extend the main config.

BASE_DIR = Path(__file__).resolve().parent.parent

# Force an isolated SQLite database for pytest so every run uses the current
# model schema instead of a stale external database.
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'test_db.sqlite3',
    }
}

# Faster password hashing keeps repeated task-level test runs responsive.
PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.MD5PasswordHasher',
]

# Test runs do not need background retraining or real email delivery.
ML_AUTO_RETRAIN = False
ML_DISABLE_BACKGROUND_JOBS = True
EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
