import sys
import time
from fastapi import APIRouter, Query
from typing import Optional
from mk_manager.config import get_settings
from mk_manager.services.log_buffer_service import log_buffer_service

router = APIRouter(prefix="/api/system", tags=["System"])

START_TIME = time.time()

@router.get("/health")
def health_check():
    s = get_settings()
    return {
        "status": "ok",
        "app": "MK Manager V2",
        "uptime_seconds": round(time.time() - START_TIME, 2),
        "python_version": sys.version.split()[0]
    }

@router.get("/metrics")
def get_metrics():
    s = get_settings()
    log_buffer_service.info("Métricas do sistema consultadas", source="system_router")
    return {
        "uptime": round(time.time() - START_TIME, 2),
        "app_name": "MK Manager V2",
        "debug_mode": s.debug,
        "host": s.host,
        "port": s.port,
    }

@router.get("/logs")
def get_system_logs(
    limit: int = Query(50, ge=1, le=500),
    level: Optional[str] = None,
    search: Optional[str] = None
):
    return {
        "logs": log_buffer_service.get_logs(limit=limit, level=level, search=search)
    }

@router.post("/logs/clear")
def clear_system_logs():
    log_buffer_service.clear()
    log_buffer_service.info("Buffer de logs limpo", source="system_router")
    return {"status": "ok", "message": "Logs limpos com sucesso"}
