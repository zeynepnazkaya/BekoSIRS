"""
Expo Push Notification yardımcı modülü.
Expo'nun ücretsiz push servisini kullanır — hesap gerekmez.
"""
import json
import urllib.request
import logging

logger = logging.getLogger(__name__)


def send_push(push_token: str, title: str, body: str, data: dict = None) -> bool:
    """
    Expo push token'a bildirim gönderir.
    Hata durumunda sessizce False döner — ana akışı bozmaz.
    """
    if not push_token or not push_token.startswith('ExponentPushToken'):
        return False

    payload = json.dumps({
        "to": push_token,
        "title": title,
        "body": body,
        "data": data or {},
        "sound": "default",
        "priority": "high",
    }).encode('utf-8')

    req = urllib.request.Request(
        'https://exp.host/--/api/v2/push/send',
        data=payload,
        headers={
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip, deflate',
        },
        method='POST'
    )

    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            result = json.loads(r.read())
            if result.get('data', {}).get('status') == 'error':
                logger.warning(f"Push notification error: {result}")
            return True
    except Exception as e:
        logger.warning(f"Push notification failed for token {push_token[:20]}...: {e}")
        return False


def send_push_to_user(user, title: str, body: str, data: dict = None) -> bool:
    """Kullanıcı nesnesiyle push gönderir."""
    if not hasattr(user, 'push_token') or not user.push_token:
        return False
    return send_push(user.push_token, title, body, data)
