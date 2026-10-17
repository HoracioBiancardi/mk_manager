import asyncio
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from mk_manager.services.auth_service import require_admin
from mk_manager.services.task_runner_service import task_runner_service
from mk_manager.services.log_buffer_service import log_buffer_service

# Rotas de demonstração do template (sem UI): só admin, e com limites para não virar loop sem fim.
router = APIRouter(prefix="/api/tasks", tags=["Tasks"], dependencies=[Depends(require_admin)])

class StartTaskRequest(BaseModel):
    name: str = Field("Tarefa de Demonstração", max_length=200)
    steps: int = Field(5, ge=1, le=100)
    delay: float = Field(0.5, ge=0.0, le=10.0)

async def _demo_async_work(task_id: str, steps: int, delay: float):
    for i in range(1, steps + 1):
        await asyncio.sleep(delay)
        pct = int((i / steps) * 100)
        task_runner_service.update_task(
            task_id,
            progress=pct,
            message=f"Executando etapa {i}/{steps}...",
            log_entry=f"Processando lote de dados #{i} ({pct}%)"
        )

@router.post("/start-demo")
async def start_demo_task(req: StartTaskRequest):
    task_id = task_runner_service.create_task(name=req.name, description="Processamento assíncrono de exemplo")
    task_runner_service.run_async_job(task_id, _demo_async_work, req.steps, req.delay)
    log_buffer_service.info(f"Tarefa assíncrona iniciada (ID: {task_id})", source="tasks_router")
    return {"task_id": task_id, "status": "started"}

@router.get("/list")
def list_tasks(limit: int = 20):
    return {"tasks": task_runner_service.list_tasks(limit=limit)}

@router.get("/{task_id}")
def get_task_status(task_id: str):
    t = task_runner_service.get_task(task_id)
    if not t:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada.")
    return t

@router.post("/{task_id}/cancel")
def cancel_task(task_id: str):
    success = task_runner_service.cancel_task(task_id)
    if not success:
        raise HTTPException(status_code=400, detail="Não foi possível cancelar a tarefa (já concluída ou inexistente).")
    log_buffer_service.warning(f"Tarefa cancelada (ID: {task_id})", source="tasks_router")
    return {"status": "ok", "message": "Solicitação de cancelamento enviada."}
