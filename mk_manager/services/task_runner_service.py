import asyncio
import uuid
import time
from typing import Dict, Any, Callable, Optional, List

class TaskRunnerService:
    """Módulo de execução de tarefas assíncronas em segundo plano com acompanhamento de progresso e logs."""

    def __init__(self):
        self._tasks: Dict[str, Dict[str, Any]] = {}

    def create_task(self, name: str, description: str = "") -> str:
        task_id = str(uuid.uuid4())[:8]
        self._tasks[task_id] = {
            "id": task_id,
            "name": name,
            "description": description,
            "status": "pending",  # pending, running, completed, failed, cancelled
            "progress": 0,
            "message": "Tarefa criada",
            "logs": [],
            "created_at": time.time(),
            "updated_at": time.time(),
            "error": None,
            "_async_task": None
        }
        return task_id

    def update_task(self, task_id: str, status: Optional[str] = None, progress: Optional[int] = None, message: Optional[str] = None, log_entry: Optional[str] = None):
        if task_id not in self._tasks:
            return
        t = self._tasks[task_id]
        if status:
            t["status"] = status
        if progress is not None:
            t["progress"] = min(100, max(0, progress))
        if message:
            t["message"] = message
        if log_entry:
            t["logs"].append(f"[{time.strftime('%H:%M:%S')}] {log_entry}")
        t["updated_at"] = time.time()

    def get_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        t = self._tasks.get(task_id)
        if not t:
            return None
        res = {k: v for k, v in t.items() if not k.startswith("_")}
        return res

    def list_tasks(self, limit: int = 20) -> List[Dict[str, Any]]:
        sorted_tasks = sorted(self._tasks.values(), key=lambda x: x["created_at"], reverse=True)
        return [{k: v for k, v in t.items() if not k.startswith("_")} for t in sorted_tasks[:limit]]

    def run_async_job(self, task_id: str, coro_func: Callable, *args, **kwargs):
        """Dispara uma função assíncrona recebendo task_id como primeiro argumento."""
        async def _wrapper():
            self.update_task(task_id, status="running", progress=5, message="Execução iniciada", log_entry="Iniciando tarefa...")
            try:
                await coro_func(task_id, *args, **kwargs)
                self.update_task(task_id, status="completed", progress=100, message="Concluído com sucesso", log_entry="Tarefa finalizada com sucesso.")
            except asyncio.CancelledError:
                self.update_task(task_id, status="cancelled", message="Tarefa cancelada", log_entry="Tarefa foi cancelada pelo usuário.")
            except Exception as e:
                self.update_task(task_id, status="failed", message=f"Erro: {str(e)}", log_entry=f"ERRO: {str(e)}")
                self._tasks[task_id]["error"] = str(e)

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = asyncio.get_event_loop()

        async_task = loop.create_task(_wrapper())
        if task_id in self._tasks:
            self._tasks[task_id]["_async_task"] = async_task

    def cancel_task(self, task_id: str) -> bool:
        if task_id in self._tasks:
            async_task = self._tasks[task_id].get("_async_task")
            if async_task and not async_task.done():
                async_task.cancel()
                return True
        return False

task_runner_service = TaskRunnerService()
