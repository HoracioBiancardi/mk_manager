// Regra de senha do ecossistema no navegador (= services/password_policy.py e invest_sap):
// mínimo 10 caracteres e força pelo menos "Média". Aqui só o medidor e o gerador — quem aceita
// ou recusa é o servidor. Nada sai do navegador: a medição é local.
//
// Marcação:
//   <input type="password" data-forca>                → barra de força logo abaixo do campo
//   <button data-gerar-senha="#campo1,#campo2">        → gera uma senha forte e preenche os campos
// ligarSenhas() liga tudo o que já está na página (chame de novo depois de criar campos).

export const MIN_TAMANHO = 10;
const SIMBOLOS = '!@#$%^&*()_+-=[]{}|;:,.<>?';
const MAIUSC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', MINUSC = 'abcdefghijklmnopqrstuvwxyz', DIGITOS = '0123456789';

/** Score 0-100, nível e dicas — mesmas regras de password_policy.avaliar. */
export function avaliar(senha) {
  if (!senha) return { score: 0, nivel: 'Muito Fraca', dicas: ['Digite uma senha'] };
  let score = 0;
  const dicas = [];
  if (senha.length >= 16) score += 35;
  else if (senha.length >= 12) score += 25;
  else if (senha.length >= 8) score += 15;
  else dicas.push('Aumente o comprimento para pelo menos 12 caracteres');
  [[MAIUSC, 'Adicione letras maiúsculas (A-Z)'], [MINUSC, 'Adicione letras minúsculas (a-z)'],
    [DIGITOS, 'Adicione números (0-9)'], [SIMBOLOS, 'Adicione símbolos especiais (!@#$)']].forEach(([conj, dica]) => {
    if ([...senha].some((c) => conj.includes(c))) score += 15; else dicas.push(dica);
  });
  score = Math.min(100, score);
  const nivel = score >= 85 ? 'Excelente' : score >= 65 ? 'Forte' : score >= 45 ? 'Média' : score >= 25 ? 'Fraca' : 'Muito Fraca';
  if (senha.length < MIN_TAMANHO) dicas.unshift(`Mínimo de ${MIN_TAMANHO} caracteres`);
  return { score, nivel, dicas: dicas.length ? dicas : ['Senha altamente segura!'], aceita: senha.length >= MIN_TAMANHO && score >= 45 };
}

function aleatorio(max) {  // índice sem viés de módulo
  const limite = 256 - (256 % max), b = new Uint8Array(1);
  do crypto.getRandomValues(b); while (b[0] >= limite);
  return b[0] % max;
}

/** Senha com ao menos uma maiúscula, minúscula, número e símbolo (sempre aceita pela regra). */
export function gerar(tamanho = 16) {
  const classes = [MAIUSC, MINUSC, DIGITOS, SIMBOLOS], todos = classes.join('');
  const chars = classes.map((c) => c[aleatorio(c.length)]);
  while (chars.length < Math.max(tamanho, MIN_TAMANHO)) chars.push(todos[aleatorio(todos.length)]);
  for (let i = chars.length - 1; i > 0; i--) { const j = aleatorio(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}

const COR = { 'Muito Fraca': 'erro', Fraca: 'erro', 'Média': 'aviso', Forte: 'ok', Excelente: 'ok' };
const PILL = { erro: 'pill-error', aviso: 'pill-warn', ok: 'pill-success' };

function medidor(input) {
  let caixa = input._forca;
  if (!caixa) {
    caixa = document.createElement('div');
    caixa.className = 'forca';
    // HTML fixo (sem dado externo): os textos entram abaixo por textContent.
    caixa.innerHTML = '<div class="forca-trilho"><div class="forca-barra"></div></div><div class="forca-info"><span class="pill"></span><span></span></div>';
    (input.closest('.pw-wrap') || input).insertAdjacentElement('afterend', caixa);
    input._forca = caixa;
  }
  const f = avaliar(input.value);
  const cor = COR[f.nivel] || 'aviso';
  caixa.hidden = !input.value;
  caixa.className = `forca forca--${cor}`;
  caixa.querySelector('.forca-barra').style.width = `${f.score}%`;
  const [pill, texto] = caixa.querySelectorAll('.forca-info span');
  pill.className = `pill ${PILL[cor]}`;
  pill.textContent = f.nivel;
  texto.textContent = f.dicas.join(' · ');
}

/** Liga medidores e botões de gerar da página (idempotente). */
export function ligarSenhas(raiz = document) {
  raiz.querySelectorAll('input[data-forca]').forEach((input) => {
    if (input._forcaLigado) return;
    input._forcaLigado = true;
    input.addEventListener('input', () => medidor(input));
    medidor(input);
  });
  raiz.querySelectorAll('[data-gerar-senha]').forEach((botao) => {
    if (botao._gerarLigado) return;
    botao._gerarLigado = true;
    botao.addEventListener('click', () => {
      const senha = gerar();
      botao.dataset.gerarSenha.split(',').forEach((sel) => {
        const campo = document.querySelector(sel.trim());
        if (!campo) return;
        campo.value = senha;
        campo.type = 'text';  // quem gerou precisa ver para anotar/repassar
        const toggle = campo.parentElement.querySelector('[data-mostra-senha], .pw-toggle');
        if (toggle) toggle.textContent = 'HIDE';
        campo.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
  });
}
