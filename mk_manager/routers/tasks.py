import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from mk_manager.services.task_runner_service import task_runner_service
from mk_manager.services.log_buffer_service import log_buffer_service

router = APIRouter(prefix="/api/tasks", tags=["Tasks"])

class StartTaskRequest(BaseModel):
    name: str = "Tarefa de Demonstração"
    steps: int = 5
    delay: float = 0.5

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
