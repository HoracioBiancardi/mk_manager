// Responsabilidade: visualização de Tarefas por Calendário / Timeline de Prazos

import { st } from "./state.js";
import { esc, dueInfo, todayISO } from "./utils.js";
import { openFile } from "./files.js";
import { statusLabel } from "./kanban.js";

const COLUNAS = [
  { key: "overdue", icon: "warning", title: "Atrasadas", empty: "Nenhuma tarefa atrasada" },
  { key: "today", icon: "today", title: "Hoje", empty: "Nada vence hoje" },
  { key: "upcoming", icon: "date_range", title: "Próximos 7 dias", empty: "Nada nesta semana" },
  { key: "future", icon: "event_upcoming", title: "Depois", empty: "Nada mais adiante" },
  { key: "no_due", icon: "event_busy", title: "Sem prazo", empty: "Todas as tasks têm prazo" },
];

export function renderCalendarView() {
  const container = document.getElementById("calendar-view-container");
  if (!container) return;

  const todayStr = todayISO(); // data local: com toISOString() o "hoje" virava amanhã à noite
  const groups = { overdue: [], today: [], upcoming: [], future: [], no_due: [] };

  // Concluída não é pendência: só aparece se o prazo ainda vem pela frente.
  st.files
    .filter((f) => f.due_date || f.type === "task")
    .forEach((f) => {
      const done = f.status === "done";
      const due = (f.due_date || "").trim();
      if (!due) {
        if (!done) groups.no_due.push(f);
        return;
      }
      if (due < todayStr) {
        if (!done) groups.overdue.push(f);
      } else if (due === todayStr) {
        groups.today.push(f);
      } else if (dueInfo(due).days <= 7) {
        groups.upcoming.push(f);
      } else {
        groups.future.push(f);
      }
    });
  for (const g of Object.values(groups)) {
    g.sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999"));
  }

  const renderCard = (f) => {
    const isDone = f.status === "done";
    const due = dueInfo(f.due_date, isDone);
    const status = f.type === "task" ? statusLabel(f.status) || "Backlog" : "Nota";
    const progress = f.task_total
      ? `<span class="calendar-task-progress"><span class="ms" aria-hidden="true">checklist</span>${f.task_done}/${f.task_total}</span>`
      : "";
    return `
      <div class="calendar-task-card ${isDone ? "done" : ""}" onclick="openFileFromCalendar('${esc(f.id)}')">
        <div class="calendar-card-title">${esc(f.title || f.id)}</div>
        ${f.folder ? `<div class="calendar-folder-badge"><span class="ms" aria-hidden="true">folder</span>${esc(f.folder)}</div>` : ""}
        <div class="calendar-card-footer">
          <span class="status-chip">${esc(status)}</span>
          <div class="calendar-card-meta-right">
            ${progress}
            ${due ? `<span class="due-chip ${due.tone}" title="${esc(due.full)}"><span class="ms" aria-hidden="true">event</span>${esc(due.label)}</span>` : ""}
          </div>
        </div>
      </div>`;
  };

  container.innerHTML = `<div class="calendar-board">${COLUNAS.map((c) => `
      <div class="calendar-column ${c.key === "no_due" ? "no-due" : c.key}">
        <div class="calendar-column-header">
          <span class="ms" aria-hidden="true">${c.icon}</span>${c.title}
          <span class="calendar-column-count">${groups[c.key].length}</span>
        </div>
        <div class="calendar-column-body">
          ${groups[c.key].length ? groups[c.key].map(renderCard).join("") : `<div class="calendar-empty">${c.empty}</div>`}
        </div>
      </div>`).join("")}
    </div>`;
}

window.openFileFromCalendar = (id) => {
  openFile(id);
};

export function refreshCalendarIfActive() {
  if (st.mainView === "calendar") {
    renderCalendarView();
  }
}
