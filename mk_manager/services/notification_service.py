import ipaddress
import socket
import urllib.request
import json
import logging
from typing import Dict, Any, Optional
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

_ALLOWED_SCHEMES = {"http", "https"}


class UnsafeURLError(ValueError):
    """URL rejeitada por apontar (direta ou indiretamente, via DNS) para um
    destino de rede não permitido — ex.: localhost, IP privado/link-local
    ou o endpoint de metadados de nuvem (169.254.169.254)."""


def _validate_public_url(url: str) -> None:
    """Bloqueia SSRF: exige esquema http(s) e resolve o host para garantir
    que nenhum IP retornado seja privado, loopback, link-local ou reservado.

    Resolve via socket.getaddrinfo (não apenas compara a string do host),
    pois um hostname atacante-controlado pode resolver para um IP interno.
    """
    parsed = urlparse(url)

    if parsed.scheme.lower() not in _ALLOWED_SCHEMES:
        raise UnsafeURLError("Esquema de URL não permitido.")

    host = parsed.hostname
    if not host:
        raise UnsafeURLError("URL sem host válido.")

    try:
        addr_infos = socket.getaddrinfo(host, None)
    except socket.gaierror as e:
        raise UnsafeURLError(f"Não foi possível resolver o host: {e}") from e

    if not addr_infos:
        raise UnsafeURLError("Não foi possível resolver o host.")

    for info in addr_infos:
        raw_addr = info[4][0]
        # IPv6 pode vir com escopo (ex.: "fe80::1%eth0"); ipaddress não aceita isso.
        ip_str = raw_addr.split("%", 1)[0]
        ip = ipaddress.ip_address(ip_str)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            raise UnsafeURLError("URL aponta para um destino de rede não permitido.")


class NotificationService:
    """Despachante genérico de alertas e notificações para Webhooks (Teams, Discord, Slack)."""

    @staticmethod
    def send_webhook(url: str, payload: Dict[str, Any], headers: Optional[Dict[str, str]] = None) -> bool:
        if not url:
            return False
        try:
            _validate_public_url(url)
        except UnsafeURLError as e:
            logger.error(f"Webhook bloqueado por validação anti-SSRF ({url}): {e}")
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
