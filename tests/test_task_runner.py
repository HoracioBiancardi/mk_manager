import asyncio
from mk_manager.services.task_runner_service import TaskRunnerService

def test_task_runner_service():
    async def _async_test():
        runner = TaskRunnerService()
        task_id = runner.create_task("Teste de Tarefa", "Descrição de teste")

        task = runner.get_task(task_id)
        assert task is not None
        assert task["name"] == "Teste de Tarefa"
        assert task["status"] == "pending"
        assert task["progress"] == 0

        async def mock_job(t_id):
            runner.update_task(t_id, progress=50, message="Em progresso")
            await asyncio.sleep(0.02)
            runner.update_task(t_id, progress=100, message="Concluído")

        runner.run_async_job(task_id, mock_job)
        await asyncio.sleep(0.05)

        updated_task = runner.get_task(task_id)
        assert updated_task["status"] == "completed"
        assert updated_task["progress"] == 100

    asyncio.run(_async_test())
