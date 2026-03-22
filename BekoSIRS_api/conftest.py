# Root conftest.py
# Standalone test scripts (not pytest-compatible) must be excluded from collection.
# These are manual E2E scripts that run against a live database, not CI.
collect_ignore = [
    "test_notifications.py",
    "test_installments.py",
]

collect_ignore_glob = [
    "products/test_biometric.py",
]
