// Responsabilidade: UI do editor (textarea, preview, toolbar, tags, footer, resize)

import { st } from './state.js';
import { esc, toast } from './utils.js';
import { renderSidebar, renderFolderTree, renderTagFilterChips } from './sidebar.js';

// Callback registrado por app.js para desacoplar editor de file I/O
let _scheduleSave = null;
export function setSaveCallback(fn) { _scheduleSave = fn; }

function scheduleSave() {
  clearTimeout(st.saveTimer);
  st.saveTimer = setTimeout(() => _scheduleSave?.(), 800);
}

// ── Painel ────────────────────────────────────────────────────────────────────

export function showEditorPanel() {
  document.getElementById('empty-panel').style.display = 'none';
  document.getElementById('editor-area').style.display = 'flex';
}

export function showEmptyPanel() {
  document.getElementById('empty-panel').style.display = 'flex';
  document.getElementById('editor-area').style.display = 'none';
}

// ── Visibilidade do status ─────────────────────────────────────────────────────

export function updateStatusVis(type) {
  const el = document.getElementById('status-row-part');
  if (el) el.style.display = type === 'task' ? 'contents' : 'none';
}

// ── Tags ──────────────────────────────────────────────────────────────────────

export function renderTags(tags) {
  document.getElementById('tags-container').innerHTML = tags.map((t, i) =>
    `<span class="tag-chip">${esc(t)}<button onclick="removeTag(${i})" title="Remover">×</button></span>`
  ).join('');
}

export function onTagKey(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const input = document.getElementById('tag-input');
    const tag = input.value.trim().replace(/,/g, '');
    if (tag && !st.activeTags.includes(tag)) {
      st.activeTags.push(tag);
      renderTags(st.activeTags);
      st.isDirty = true;
      scheduleSave();
    }
    input.value = '';
  }
  if (e.key === 'Backspace' && !e.target.value && st.activeTags.length) {
    st.activeTags.pop();
    renderTags(st.activeTags);
    st.isDirty = true;
    scheduleSave();
  }
}

export function removeTag(idx) {
  st.activeTags.splice(idx, 1);
  renderTags(st.activeTags);
  st.isDirty = true;
  scheduleSave();
}

// ── Modo de visualização ──────────────────────────────────────────────────────

export function applyRatio() {
  document.getElementById('editor-pane').style.flex = `0 0 ${st.splitRatio * 100}%`;
  document.getElementById('preview-pane').style.flex = '1 1 0';
}

export function setView(v) {
  st.view = v;
  const ep = document.getElementById('editor-pane');
  const pp = document.getElementById('preview-pane');
  const rh = document.getElementById('resize-handle');
  ['edit', 'split', 'preview'].forEach(m =>
    document.getElementById('btn-' + m).classList.toggle('active', m === v)
  );
  if (v === 'edit') {
    ep.style.display = 'flex'; ep.style.flex = '1';
    pp.style.display = 'none';
    rh.style.display = 'none';
  } else if (v === 'split') {
    ep.style.display = 'flex';
    pp.style.display = 'block';
    rh.style.display = 'block';
    applyRatio();
    renderPreview();
  } else {
    ep.style.display = 'none';
    pp.style.display = 'block'; pp.style.flex = '1';
    rh.style.display = 'none';
    renderPreview();
  }
}

// ── Resize handle ─────────────────────────────────────────────────────────────

export function initResizer() {
  const handle = document.getElementById('resize-handle');
  const body = document.querySelector('.editor-body');
  let dragging = false, bodyRect = null;

  const startDrag = clientX => {
    dragging = true;
    bodyRect = body.getBoundingClientRect();
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };
  const moveDrag = clientX => {
    if (!dragging) return;
    st.splitRatio = Math.min(0.85, Math.max(0.15, (clientX - bodyRect.left) / bodyRect.width));
    applyRatio();
  };
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    if (st.splitRatio <= 0.15) { setView('preview'); return; }
    if (st.splitRatio >= 0.85) { setView('edit'); return; }
  };

  handle.addEventListener('mousedown', e => { startDrag(e.clientX); e.preventDefault(); });
  document.addEventListener('mousemove', e => moveDrag(e.clientX));
  document.addEventListener('mouseup', endDrag);
  handle.addEventListener('touchstart', e => { startDrag(e.touches[0].clientX); e.preventDefault(); }, { passive: false });
  document.addEventListener('touchmove', e => { if (dragging) { moveDrag(e.touches[0].clientX); e.preventDefault(); } }, { passive: false });
  document.addEventListener('touchend', endDrag);
  handle.addEventListener('dblclick', () => { st.splitRatio = 0.5; applyRatio(); });
}

// ── Preview markdown ──────────────────────────────────────────────────────────

function toggleCheckboxAt(content, idx) {
  let count = 0;
  // [ \t]* allows indented subtasks like "  - [ ] subtask"
  return content.replace(/^([ \t]*- \[)([ x])(\] )/gm, (m, a, ch, b) => {
    if (count++ === idx) return a + (ch === ' ' ? 'x' : ' ') + b;
    return m;
  });
}

export function renderPreview() {
  const content = document.getElementById('md-editor').value;
  const el = document.getElementById('md-preview');
  el.innerHTML = marked.parse(content);

  // Render Mermaid diagrams
  const diagrams = el.querySelectorAll('.mermaid');
  if (diagrams.length && typeof mermaid !== 'undefined') {
    diagrams.forEach(d => d.removeAttribute('data-processed'));
    mermaid.run({ nodes: diagrams }).catch(() => {});
  }

  let cbIdx = 0;
  el.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.removeAttribute('disabled');
    const idx = cbIdx++;
    const li = cb.closest('li');
    if (li) { li.classList.add('task-list-item'); if (cb.checked) li.classList.add('done'); }
    cb.addEventListener('change', () => {
      const ta = document.getElementById('md-editor');
      ta.value = toggleCheckboxAt(ta.value, idx);
      if (li) li.classList.toggle('done', cb.checked);
      onEditorInput();
    });
  });
}

// ── Eventos do editor ─────────────────────────────────────────────────────────

export function onEditorInput() {
  if (!st.activeId) return;
  st.isDirty = true;
  updateFooter();
  if (st.view !== 'edit') renderPreview();
  setSaveStatus('saving');
  scheduleSave();
}

export function onTitleChange() {
  if (!st.activeId) return;
  st.isDirty = true;
  setSaveStatus('saving');
  scheduleSave();
}

export function onEditorKeydown(e) {
  const ta = document.getElementById('md-editor');
  if (e.key === 'Tab') {
    e.preventDefault();
    const s = ta.selectionStart;
    ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(ta.selectionEnd);
    ta.selectionStart = ta.selectionEnd = s + 2;
    onEditorInput(); return;
  }
  if (e.ctrlKey && e.key === 's') {
    e.preventDefault();
    clearTimeout(st.saveTimer);
    _scheduleSave?.();
    return;
  }
  if (e.key === 'Enter') {
    const pos = ta.selectionStart;
    const lineStart = ta.value.lastIndexOf('\n', pos - 1) + 1;
    const line = ta.value.slice(lineStart, pos);
    const m = line.match(/^(\s*)(- \[[ x]\] |- |\* |\d+\. )/);
    if (m) {
      const prefix = m[0].replace(/\[x\]/, '[ ]');
      if (line.trim() === m[2]?.trim() || line.trimEnd() === m[0].trimEnd()) {
        e.preventDefault();
        ta.value = ta.value.slice(0, lineStart) + '\n' + ta.value.slice(ta.selectionEnd);
        ta.selectionStart = ta.selectionEnd = lineStart + 1;
      } else {
        e.preventDefault();
        const before = ta.value.slice(0, pos);
        ta.value = before + '\n' + prefix + ta.value.slice(ta.selectionEnd);
        ta.selectionStart = ta.selectionEnd = pos + 1 + prefix.length;
      }
      onEditorInput();
    }
  }
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

export function fmt(before, after) {
  const ta = document.getElementById('md-editor');
  const s = ta.selectionStart, e = ta.selectionEnd;
  const sel = ta.value.slice(s, e) || 'texto';
  ta.value = ta.value.slice(0, s) + before + sel + after + ta.value.slice(e);
  ta.selectionStart = s + before.length; ta.selectionEnd = s + before.length + sel.length;
  ta.focus(); onEditorInput();
}

export function ins(text) {
  const ta = document.getElementById('md-editor');
  const pos = ta.selectionStart;
  const before = ta.value.slice(0, pos);
  const prefix = (before && !before.endsWith('\n')) ? '\n' + text : text;
  ta.value = before + prefix + ta.value.slice(ta.selectionEnd);
  ta.selectionStart = ta.selectionEnd = pos + prefix.length;
  ta.focus(); onEditorInput();
}

export function insTable() {
  const ta = document.getElementById('md-editor');
  const pos = ta.selectionStart;
  const before = ta.value.slice(0, pos);
  const prefix = (before && !before.endsWith('\n')) ? '\n' : '';
  const block = `${prefix}| Coluna 1 | Coluna 2 | Coluna 3 |\n| --- | --- | --- |\n| dado | dado | dado |\n| dado | dado | dado |`;
  ta.value = before + block + ta.value.slice(ta.selectionEnd);
  // Seleciona "Coluna 1" para o usuário poder digitar diretamente
  const headerStart = before.length + prefix.length + 2;
  ta.selectionStart = headerStart;
  ta.selectionEnd = headerStart + 8;
  ta.focus();
  onEditorInput();
}

export function insMermaid() {
  const ta = document.getElementById('md-editor');
  const pos = ta.selectionStart;
  const before = ta.value.slice(0, pos);
  const prefix = (before && !before.endsWith('\n')) ? '\n' : '';
  const block = `${prefix}\`\`\`mermaid\nflowchart TD\n    A[Início] --> B[Passo]\n    B --> C{Decisão?}\n    C -->|Sim| D[Resultado]\n    C -->|Não| E[Outro]\n\`\`\``;
  ta.value = before + block + ta.value.slice(ta.selectionEnd);
  ta.selectionStart = ta.selectionEnd = before.length + block.length;
  ta.focus();
  onEditorInput();
}

export function insRaw(text) {
  const ta = document.getElementById('md-editor');
  const pos = ta.selectionStart;
  ta.value = ta.value.slice(0, pos) + text + ta.value.slice(ta.selectionEnd);
  ta.selectionStart = ta.selectionEnd = pos + text.length;
  ta.focus();
  onEditorInput();
}

export function insCodeBlock() {
  const ta = document.getElementById('md-editor');
  const s = ta.selectionStart, e = ta.selectionEnd;
  const sel = ta.value.slice(s, e) || 'código aqui';
  const before = ta.value.slice(0, s);
  const pfx = (before && !before.endsWith('\n')) ? '\n' : '';
  const block = pfx + '```\n' + sel + '\n```';
  ta.value = before + block + ta.value.slice(e);
  ta.selectionStart = before.length + pfx.length + 4;
  ta.selectionEnd = ta.selectionStart + sel.length;
  ta.focus(); onEditorInput();
}

// ── Footer ────────────────────────────────────────────────────────────────────

export function updateFooter() {
  const content = document.getElementById('md-editor')?.value || '';
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  document.getElementById('word-count').textContent = `${words} palavra${words !== 1 ? 's' : ''}`;
  const total = (content.match(/^[ \t]*- \[[ x]\] /gm) || []).length;
  const done  = (content.match(/^[ \t]*- \[x\] /gm) || []).length;
  const file = st.files.find(f => f.id === st.activeId);
  if (file?.type === 'task' && total > 0) {
    document.getElementById('task-stats').textContent = `${done}/${total} tasks (${Math.round(done / total * 100)}%)`;
  } else {
    document.getElementById('task-stats').textContent = '';
  }
}

export function setSaveStatus(s) {
  const el = document.getElementById('save-status');
  el.className = 'save-status ' + s;
  el.textContent = s === 'saving' ? 'Salvando…' : s === 'error' ? 'Erro ao salvar' : 'Salvo';
}
