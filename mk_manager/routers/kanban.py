import re

from fastapi import APIRouter
from pydantic import BaseModel, Field, field_validator

from mk_manager.services.auth_service import get_auth_service

# As colunas do Kanban ficavam no localStorage de cada navegador, enquanto as notas são
# compartilhadas: outro usuário (ou outro navegador) com colunas diferentes não via as tasks
# cujo status não tinha coluna. Agora ficam no banco do app, iguais para todos.
router = APIRouter(prefix="/api/kanban", tags=["kanban"])

_COLUMNS_KEY = "kanban_columns"
_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


class KanbanColumn(BaseModel):
    key: str = Field(max_length=60)  # = `status` do frontmatter (texto livre); "" = Backlog
    label: str = Field(min_length=1, max_length=40)
    color: str = ""

    @field_validator("key")
    @classmethod
    def _key(cls, v: str) -> str:
        if v != v.strip() or any(ord(ch) < 32 for ch in v):
            raise ValueError("chave da coluna inválida")
        return v

    @field_validator("label")
    @classmethod
    def _label(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("nome da coluna vazio")
        return v

    @field_validator("color")
    @classmethod
    def _color(cls, v: str) -> str:
        if v and not _COLOR_RE.match(v):
            raise ValueError("cor no formato #rrggbb")
        return v


class KanbanColumns(BaseModel):
    columns: list[KanbanColumn] = Field(min_length=1, max_length=30)

    @field_validator("columns")
    @classmethod
    def _unique(cls, v: list[KanbanColumn]) -> list[KanbanColumn]:
        keys = [c.key for c in v]
        if len(keys) != len(set(keys)):
            raise ValueError("colunas repetidas")
        return v


@router.get("/columns")
def get_columns() -> dict:
    """`columns` = null enquanto ninguém salvou: o navegador usa as dele (e as envia)."""
    saved = get_auth_service().db.get_key(_COLUMNS_KEY)
    return {"columns": saved if isinstance(saved, list) else None}


@router.put("/columns")
def put_columns(body: KanbanColumns) -> dict:
    cols = [c.model_dump() for c in body.columns]
    get_auth_service().db.set_key(_COLUMNS_KEY, cols)
    return {"columns": cols}
