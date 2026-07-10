// Responsabilidade: sintetizar efeitos sonoros retro (bipes, cliques, erros) usando a Web Audio API nativa
import { getSfxEnabled } from "./prefs.js";

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

// Toca som curto de clique retro de terminal
export function playClickSfx() {
  if (!getSfxEnabled()) return;
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    // Frequência aleatória ligeiramente diferente para simular o ruído mecânico de digitação
    osc.frequency.setValueAtTime(1400 + Math.random() * 400, ctx.currentTime);

    gain.gain.setValueAtTime(0.015, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.045);
  } catch (e) {
    // Falha silenciosa caso o browser impeça reprodução de áudio
  }
}

// Toca som de inicialização do terminal (boot beep crescente)
export function playBootSfx() {
  if (!getSfxEnabled()) return;
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.55);

    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.03, ctx.currentTime + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.65);
  } catch (e) {}
}

// Toca som de transição de tela (ruído decrescente rápido)
export function playTransitionSfx() {
  if (!getSfxEnabled()) return;
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(900, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.25);

    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.02, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);

    // Filtro passa-baixa para deixar o som de serra mais analógico e menos irritante
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1000;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) {}
}

// Toca som de erro analógico (duplo bipe grave curto)
export function playErrorSfx() {
  if (!getSfxEnabled()) return;
  try {
    const ctx = getAudioContext();
    
    const playBeep = (delay) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(120, ctx.currentTime + delay);

      gain.gain.setValueAtTime(0.04, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.12);

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 400;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.15);
    };

    playBeep(0);
    playBeep(0.18);
  } catch (e) {}
}
