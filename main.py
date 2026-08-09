"""
Entrypoint principal do MK Manager.
Re-exporta a aplicação FastAPI de mk_manager.main para padronização de inicialização.
"""
from mk_manager.main import app

__all__ = ["app"]
