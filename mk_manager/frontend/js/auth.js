// Responsabilidade: login, primeiro acesso, troca de senha e tela Usuários — mesmo
// comportamento do app_template. Mensagens de acesso (saiu, sessão expirada, senha
// alterada, erros) ficam no card de login. Sessão em cookie HttpOnly (sobrevive ao
// recarregar; expira por inatividade no servidor). Só textContent com dado da API.

import { apiFetch } from "./api.js";
import { toast } from "./utils.js";

const $ = (sel) => document.querySelector(sel);
let currentUser = null;
let setupMode = false;
let onReady = () => {};
let started = false;

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

async function api(path, method = "GET", body) {
  const opts = { method };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return (await apiFetch(path, opts)).json();
}

/* ── mensagens nos cards ── */
function cardMsg(id, texto, tipo = "ok") {
  const box = $(id);
  if (!box) return;
  box.replaceChildren();
  if (!texto) return;
  const erro = tipo === "erro";
  const alert = el("div", `alert ${erro ? "alert-error" : "alert-success"} login-msg`);
  alert.setAttribute("role", erro ? "alert" : "status");
  alert.append(el("span", "alert-icon ms", erro ? "error" : "check_circle"), el("div", "", texto));
  box.append(alert);
}
const loginMsg = (t, tipo) => cardMsg("#login-msg", t, tipo);
const pwMsg = (t, tipo) => cardMsg("#pw-msg", t, tipo);

/* ── casca ── */
function applyUser(user) {
  currentUser = user;
  const badge = $("#user-badge");
  badge.replaceChildren();
  if (user) badge.append(el("span", "ms", "person"), document.createTextNode(user.username));
  document.querySelectorAll("[data-admin-only]").forEach((n) => { n.hidden = !(user && user.is_admin); });
}

function applyLoginMode(configured) {
  setupMode = !configured;
  $("#login-user-label").textContent = setupMode ? "Usuário Administrador" : "Usuário";
  $("#login-pass-label").textContent = setupMode ? "Crie a Senha" : "Senha";
  $("#login-hint").textContent = setupMode
    ? "Primeiro acesso: crie o usuário administrador (senha com mínimo de 8 caracteres). Ele cadastra os demais na tela Usuários."
    : "Sessão com bloqueio por inatividade.";
  $("#setup-confirm-group").style.display = setupMode ? "" : "none";
  $("#btn-change-pw").style.display = setupMode ? "none" : "";
  $("#login-btn").textContent = setupMode ? "Criar Administrador e Entrar" : "Entrar / Desbloquear";
}

function showApp(user) {
  applyUser(user);
  $("#login-overlay").classList.remove("open");
  $("#topbar").hidden = false;
  $("#app-layout").hidden = false;
  if (!started) { started = true; onReady(); }
}

export function showLogin(motivo = "") {
  applyUser(null);
  // saindo com a tela Usuários aberta: volta ao editor (quem entrar pode não ser admin)
  if ($("#users-pane").style.display !== "none") window.switchPanel("users");
  $("#topbar").hidden = true;
  $("#app-layout").hidden = true;
  $("#login-overlay").classList.add("open");
  loginMsg(motivo);
  $(($("#login-user").value ? "#login-pass" : "#login-user")).focus();
}

/* ── troca de senha ── */
const PW = ["#pw-user", "#pw-current", "#pw-new", "#pw-confirm"];
function openPasswordModal(username = "") {
  PW.forEach((id) => { $(id).value = ""; });
  pwMsg("");
  $("#pw-user").value = username || $("#login-user").value.trim();
  $("#password-overlay").classList.add("open");
  $($("#pw-user").value ? "#pw-current" : "#pw-user").focus();
}
function closePasswordModal() {
  PW.forEach((id) => { $(id).value = ""; });
  $("#password-overlay").classList.remove("open");
}
async function submitPasswordChange() {
  const [username, current, next, confirm] = PW.map((id) => $(id).value);
  if (!username.trim() || !current || !next) return pwMsg("Preencha usuário, senha atual e nova senha.", "erro");
  if (next !== confirm) return pwMsg("A confirmação não confere com a nova senha.", "erro");
  try {
    await api("/auth/change-password", "POST", { username: username.trim(), current_password: current, new_password: next });
  } catch (err) {
    return pwMsg(err.message, "erro");
  }
  closePasswordModal();
  // A troca encerra as sessões desse usuário: se ele estava logado, volta ao login.
  if (currentUser && currentUser.username === username.trim().toLowerCase()) showLogin();
  loginMsg("Senha alterada. Entre com a nova senha.");
}

/* ── tela Usuários ── */
const usErro = (msg) => cardMsg("#us-erro", msg, "erro");
function renderUsers(users) {
  const alvo = $("#us-alvo");
  const atual = alvo.value;
  alvo.replaceChildren(...users.map((u) => el("option", "", u.username)));
  if (users.some((u) => u.username === atual)) alvo.value = atual;
  // Lista com selos (= invest_sap); só textContent com dado da API.
  const selo = (texto, tipo) => el("span", `pill pill-${tipo}`, texto);
  const head = el("thead"), trh = el("tr");
  ["Usuário", "Perfil", "Troca de senha pendente", "Criado em"].forEach((t) => trh.append(el("th", "", t)));
  head.append(trh);
  const body = el("tbody");
  for (const u of users) {
    const tr = el("tr");
    const nome = el("td"); nome.append(el("strong", "", u.username));
    const perfil = el("td"); perfil.append(u.is_admin ? selo("admin", "primary") : selo("usuário", "muted"));
    const troca = el("td"); troca.append(u.must_change_password ? selo("Sim", "warn") : selo("Não", "muted"));
    tr.append(nome, perfil, troca, el("td", "", u.created_at));
    body.append(tr);
  }
  $("#us-tabela").replaceChildren(head, body);
  $("#us-total").textContent = users.length;
}
export async function loadUsers() {
  try { usErro(""); renderUsers((await api("/auth/users")).users); } catch (err) { usErro(err.message); }
}
async function createUser() {
  const nome = $("#us-novo"), senha = $("#us-novo-senha"), admin = $("#us-novo-admin");
  try {
    const r = await api("/auth/users", "POST", { username: nome.value, password: senha.value, is_admin: admin.checked });
    usErro(""); toast(`Usuário “${r.user.username}” criado.`, "success");
    nome.value = ""; senha.value = ""; admin.checked = false;
    renderUsers(r.users);
  } catch (err) { usErro(err.message); }
}
async function resetUserPassword() {
  const alvo = $("#us-alvo").value, senha = $("#us-alvo-senha");
  try {
    await api(`/auth/users/${encodeURIComponent(alvo)}/password`, "POST", { password: senha.value });
    usErro(""); senha.value = "";
    toast(`Senha de “${alvo}” redefinida; ele troca a senha no próximo login.`, "success");
    loadUsers();
  } catch (err) { usErro(err.message); }
}
async function deleteUser() {
  const alvo = $("#us-alvo").value;
  if (!alvo || !confirm("Remover este usuário?")) return;
  try {
    renderUsers((await api(`/auth/users/${encodeURIComponent(alvo)}`, "DELETE")).users);
    usErro(""); toast(`Usuário “${alvo}” removido.`, "success");
  } catch (err) { usErro(err.message); }
}

/* ── SHOW/HIDE em todo campo de senha (= ligarMostrarSenha do app_template) ── */
function ligarMostrarSenha() {
  document.querySelectorAll('input[type="password"]').forEach((input) => {
    if (input.parentElement.querySelector("[data-mostra-senha]")) return;
    let caixa = input.parentElement;
    if (!caixa.classList.contains("pw-wrap")) {
      caixa = el("div", "pw-wrap");
      input.replaceWith(caixa);
      caixa.append(input);
    }
    const botao = el("button", "pw-toggle", "SHOW");
    botao.type = "button";
    botao.dataset.mostraSenha = "";
    botao.title = "Mostrar/ocultar";
    caixa.append(botao);
  });
  document.addEventListener("click", (e) => {
    const botao = e.target.closest("[data-mostra-senha]");
    if (!botao) return;
    const campo = botao.parentElement.querySelector("input");
    const mostrar = campo.type === "password";
    campo.type = mostrar ? "text" : "password";
    botao.textContent = mostrar ? "HIDE" : "SHOW";
  });
}

/* ── início ── */
export async function initAuth(ready) {
  onReady = ready;
  $("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = $("#login-user").value.trim(), password = $("#login-pass").value;
    if (!username || !password) return loginMsg("Digite usuário e senha.", "erro");
    if (setupMode && password !== $("#setup-confirm").value) return loginMsg("As senhas não conferem.", "erro");
    $("#login-btn").disabled = true;
    try {
      const r = await api(setupMode ? "/auth/setup" : "/auth/login", "POST", { username, password });
      $("#login-pass").value = ""; $("#setup-confirm").value = "";
      if (setupMode) applyLoginMode(true);
      loginMsg("");
      showApp(r.user);
      if (r.user.must_change_password) {
        openPasswordModal(r.user.username);
        pwMsg("Sua senha foi definida pelo administrador. Troque-a agora.");
      }
    } catch (err) {
      loginMsg(err.message, "erro");
      $("#login-pass").select();
    } finally {
      $("#login-btn").disabled = false;
    }
  });
  ligarMostrarSenha();
  $("#btn-change-pw").addEventListener("click", () => openPasswordModal());
  $("#password-close").addEventListener("click", closePasswordModal);
  $("#password-form").addEventListener("submit", (e) => { e.preventDefault(); submitPasswordChange(); });
  $("#btn-logout").addEventListener("click", async () => {
    await api("/auth/logout", "POST", {}).catch(() => {});
    showLogin("Você saiu.");
  });
  $("#us-criar").addEventListener("click", createUser);
  $("#us-redefinir").addEventListener("click", resetUserPassword);
  $("#us-remover").addEventListener("click", deleteUser);
  document.addEventListener("mk:unauthorized", () => {
    if (!$("#app-layout").hidden) showLogin("Sessão expirada. Entre novamente.");
  });

  // já logado (cookie válido)? senão, tela de acesso no modo certo
  try {
    const me = await api("/auth/me");
    $("#login-form").classList.remove("login-pendente");
    showApp(me);
  } catch {
    try { applyLoginMode((await api("/auth/status")).configured); } catch { /* sem API: fica no login */ }
    $("#login-form").classList.remove("login-pendente");
    showLogin();
  }
}
