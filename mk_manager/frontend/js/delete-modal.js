// Responsabilidade: modal de confirmação de exclusão de arquivo

import { st } from "./state.js";
import { deleteFile } from "./files.js";

export function openDeleteModal(id, title, filename) {
  st.pendingDelete = id;
  document.getElementById("delete-filename").textContent = `"${title}"`;
  document.getElementById("delete-path").textContent = `notes/${filename}`;
  document.getElementById("delete-overlay").classList.add("open");
}

export function closeDeleteModal() {
  document.getElementById("delete-overlay").classList.remove("open");
  st.pendingDelete = null;
}

export async function confirmDelete() {
  if (!st.pendingDelete) return;
  const btn = document.getElementById("confirm-del-btn");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  await deleteFile(st.pendingDelete);
  closeDeleteModal();
  btn.disabled = false;
  btn.textContent = "Excluir";
}

// ── Expor ao DOM (necessário para event handlers inline) ──────────────────────
Object.assign(window, {
  openDeleteModal,
  closeDeleteModal,
  confirmDelete,
});
