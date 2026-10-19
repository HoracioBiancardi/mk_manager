from fastapi import APIRouter, Depends

from mk_manager.services.auth_service import require_admin
from mk_manager.services.git_sync_service import git_sync_service

# Status é lido por qualquer sessão (o selo da barra de cima); forçar o sync só admin,
# como ligar/desligar em Ajustes.
router = APIRouter(prefix="/api/sync", tags=["sync"])


@router.get("/status")
def sync_status() -> dict:
    return git_sync_service.status()


@router.post("/now", dependencies=[Depends(require_admin)])
def sync_now() -> dict:
    return git_sync_service.sync_now()
