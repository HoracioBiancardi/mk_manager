import urllib.request
import json
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

class NotificationService:
    """Despachante genérico de alertas e notificações para Webhooks (Teams, Discord, Slack)."""

    @staticmethod
    def send_webhook(url: str, payload: Dict[str, Any], headers: Optional[Dict[str, str]] = None) -> bool:
        if not url:
            return False
        try:
            req_headers = {"Content-Type": "application/json"}
            if headers:
                req_headers.update(headers)
            
            data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(url, data=data, headers=req_headers, method="POST")
            with urllib.request.urlopen(req, timeout=5) as response:
                return response.status in (200, 201, 202, 204)
        except Exception as e:
            logger.error(f"Erro ao enviar webhook para {url}: {e}")
            return False

    @classmethod
    def send_teams_alert(cls, webhook_url: str, title: str, message: str, color: str = "0076D7") -> bool:
        payload = {
            "@type": "MessageCard",
            "@context": "http://schema.org/extensions",
            "themeColor": color,
            "summary": title,
            "sections": [{
                "activityTitle": f"⚡ **{title}**",
                "text": message
            }]
        }
        return cls.send_webhook(webhook_url, payload)

    @classmethod
    def send_discord_alert(cls, webhook_url: str, title: str, message: str) -> bool:
        payload = {
            "embeds": [{
                "title": title,
                "description": message,
                "color": 3447003
            }]
        }
        return cls.send_webhook(webhook_url, payload)

notification_service = NotificationService()
