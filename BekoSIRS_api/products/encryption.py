# products/encryption.py
"""
Face encoding encryption/decryption utilities using Fernet (AES-128-CBC).
Protects biometric data at rest in the database.
"""

import json
import logging
import os

from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Key management
# ---------------------------------------------------------------------------

def _get_fernet_key() -> bytes:
    """
    Return the Fernet key from the FACE_ENCODING_KEY env var.
    If not set, generate one and log a warning (dev convenience only).
    """
    key = os.getenv("FACE_ENCODING_KEY")
    if key:
        return key.encode()

    # Auto-generate for development — NEVER rely on this in production
    logger.warning(
        "FACE_ENCODING_KEY is not set! Generating a temporary key. "
        "Set FACE_ENCODING_KEY in .env for production."
    )
    generated = Fernet.generate_key()
    os.environ["FACE_ENCODING_KEY"] = generated.decode()
    return generated


def _get_fernet() -> Fernet:
    """Return a reusable Fernet instance."""
    return Fernet(_get_fernet_key())


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def encrypt_face_encoding(embedding: list) -> str:
    """
    Encrypt a face embedding list into a Fernet-encrypted string.

    Args:
        embedding: List of floats (e.g. 128-d FaceNet vector).

    Returns:
        Base64-encoded encrypted string safe for storage in a TextField/JSONField.
    """
    plaintext = json.dumps(embedding).encode("utf-8")
    return _get_fernet().encrypt(plaintext).decode("utf-8")


def decrypt_face_encoding(token) -> list:
    """
    Decrypt a Fernet token back to the original embedding list.

    Also handles legacy data: if `token` is already a plain list
    (stored before Issue #29 encryption), return it directly.

    Args:
        token: The encrypted string, OR a legacy plain list.

    Returns:
        List of floats representing the face embedding.
    """
    # Legacy support: face_encoding stored as plain list before Issue #29
    if isinstance(token, list):
        logger.warning(
            "Legacy unencrypted face_encoding detected. "
            "User should re-enable biometric to encrypt."
        )
        return token

    plaintext = _get_fernet().decrypt(token.encode("utf-8"))
    return json.loads(plaintext)
