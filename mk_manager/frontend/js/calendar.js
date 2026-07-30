// Responsabilidade: visualização de Tarefas por Calendário / Timeline de Prazos

import { st } from "./state.js";
import { esc } from "./utils.js";
import { openFile } from "./files.js";

export function renderCalendarView() {
  const container = document.getElementById("calendar-view-container");
  if (!container) return;

  const filesWithDue = st.files.filter(f => f.due_date || f.type === "task");
  const todayStr = new Date().toISOString().split("T")[0];

  // Agrupa tarefas por categoria de prazo: Atrasadas, Hoje, Próximos 7 dias, Futuras, Sem Prazo
  const groups = {
    overdue: [],
    today: [],
    upcoming: [],
    future: [],
    no_due: [],
  };

  filesWithDue.forEach(f => {
    if (!f.due_date) {
      groups.no_due.push(f);
      return;
    }
    const due = f.due_date.trim();
    if (due < todayStr && f.status !== "done") {
      groups.overdue.push(f);
    } else if (due === todayStr) {
      groups.today.push(f);
    } else {
      const diffDays = Math.ceil((new Date(due) - new Date(todayStr)) / (1000 * 60 * 60 * 24));
      if (diffDays <= 7) {
        groups.upcoming.push(f);
      } else {
        groups.future.push(f);
      }
    }
  });

  const renderCard = (f) => {
    const isDone = f.status === "done";
    const statusLabel = f.status ? f.status.toUpperCase() : "TASK";
    const folderLabel = f.folder ? `📁 ${esc(f.folder)}` : "";
    const taskProgress = f.task_total ? `✓ ${f.task_done}/${f.task_total}` : "";

    return `
      <div class="calendar-task-card ${isDone ? 'done' : ''}" onclick="openFileFromCalendar('${esc(f.id)}')">
        <div class="calendar-card-top">
          <span class="type-badge ${f.type}">${f.type.toUpperCase()}</span>
          ${folderLabel ? `<span class="calendar-folder-badge">${folderLabel}</span>` : ""}
        </div>
        
        <div class="calendar-card-title">${esc(f.title || f.id)}</div>
        
        <div class="calendar-card-footer">
          <span class="status-chip ${f.status}">${statusLabel}</span>
          <div class="calendar-card-meta-right">
            ${taskProgress ? `<span class="calendar-task-progress">${taskProgress}</span>` : ""}
            ${f.due_date ? `<span class="due-badge ${f.due_date < todayStr && !isDone ? 'overdue' : ''}">📅 ${esc(f.due_date)}</span>` : ""}
          </div>
        </div>
      </div>
    `;
  };

  container.innerHTML = `
    <div class="calendar-board">
      <div class="calendar-column overdue">
        <div class="calendar-column-header">
          <span>⚠️ Atrasadas (${groups.overdue.length})</span>
        </div>
        <div class="calendar-column-body">
          ${groups.overdue.length ? groups.overdue.map(renderCard).join("") : `<div class="calendar-empty">✨ Nenhuma tarefa atrasada</div>`}
        </div>
      </div>

      <div class="calendar-column today">
        <div class="calendar-column-header">
          <span>⏰ Hoje (${groups.today.length})</span>
        </div>
        <div class="calendar-column-body">
          ${groups.today.length ? groups.today.map(renderCard).join("") : `<div class="calendar-empty">✨ Nenhuma tarefa para hoje</div>`}
        </div>
      </div>

      <div class="calendar-column upcoming">
        <div class="calendar-column-header">
          <span>📅 Próximos 7 dias (${groups.upcoming.length})</span>
        </div>
        <div class="calendar-column-body">
          ${groups.upcoming.length ? groups.upcoming.map(renderCard).join("") : `<div class="calendar-empty">✨ Sem tarefas nesta semana</div>`}
        </div>
      </div>

      <div class="calendar-column future">
        <div class="calendar-column-header">
          <span>🗓️ Futuras (${groups.future.length})</span>
        </div>
        <div class="calendar-column-body">
          ${groups.future.length ? groups.future.map(renderCard).join("") : `<div class="calendar-empty">✨ Sem tarefas futuras</div>`}
        </div>
      </div>

      <div class="calendar-column no-due">
        <div class="calendar-column-header">
          <span>📋 Sem Data (${groups.no_due.length})</span>
        </div>
        <div class="calendar-column-body">
          ${groups.no_due.length ? groups.no_due.map(renderCard).join("") : `<div class="calendar-empty">✨ Sem tarefas pendentes</div>`}
        </div>
      </div>
    </div>
  `;
}

window.openFileFromCalendar = (id) => {
  openFile(id);
};

export function refreshCalendarIfActive() {
  if (st.mainView === "calendar") {
    renderCalendarView();
  }
}
