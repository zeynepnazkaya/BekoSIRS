"""
Global pytest bootstrap for the Django backend.

This file ensures the plain `pytest products/tests/ -v` command requested by the
task boots Django before app-level conftest files import REST framework or
models.
"""

import os

import django

# Pytest loads the root conftest before app-specific conftest modules, so this
# is the safest place to initialize Django for the existing test layout.
# Tests use a dedicated settings module that forces SQLite and avoids shared DBs.
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'bekosirs_backend.test_settings')
django.setup()

# Standalone test scripts (not pytest-compatible) must be excluded from collection.
# These are manual E2E scripts that run against a live database, not CI.
collect_ignore = [
    "test_notifications.py",
    "test_installments.py",
]

collect_ignore_glob = [
    "products/test_biometric.py",
]
