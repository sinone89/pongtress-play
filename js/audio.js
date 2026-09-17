'use strict';
/* PONGTRESS 사운드 — WebAudio 합성(파일 없음). 다른 스크립트보다 먼저 로드.
 * 브라우저 자동재생 정책상 최초 사용자 제스처에서 resume() 필요.
 */
const Sound = (function () {
  let ctx = null, master = null, muted = false, lastPeg = 0;
  try { muted = localStorage.getItem('pongtress_muted') === '1'; } catch (e) {}

  function ensure() {
    if (ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ctx.destination);
    } catch (e) { ctx = null; }
  }
  function resume() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); }

  function blip(f0, f1, dur, type, vol, delay) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.03);
  }
  function noise(dur, vol, delay) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + (delay || 0);
    const buf = ctx.createBuffer(1, Math.max(1, ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(); s.buffer = buf;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol || 0.2, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 700;
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur);
  }

  const sfx = {
    peg() { const now = performance.now(); if (now - lastPeg < 45) return; lastPeg = now; blip(560 + Math.random() * 340, 920, 0.05, 'triangle', 0.1); },
    launch() { blip(200, 720, 0.12, 'sawtooth', 0.16); },
    charge() { blip(720, 1180, 0.08, 'sine', 0.16); },
    shot() { blip(520, 190, 0.06, 'square', 0.1); },
    kill() { blip(180, 80, 0.14, 'sawtooth', 0.2); noise(0.08, 0.1); },
    wall() { blip(110, 55, 0.22, 'sine', 0.32); noise(0.12, 0.14); },
    level() { blip(660, 990, 0.12, 'triangle', 0.24); blip(990, 1320, 0.14, 'triangle', 0.2, 0.09); },
    win() { [523, 659, 784, 1047].forEach((f, i) => blip(f, f, 0.2, 'triangle', 0.24, i * 0.12)); },
    lose() { [420, 340, 262, 196].forEach((f, i) => blip(f, f * 0.97, 0.26, 'sine', 0.24, i * 0.14)); },
    click() { blip(520, 520, 0.03, 'square', 0.08); },
    gacha() { [400, 600, 800, 1200].forEach((f, i) => blip(f, f * 1.2, 0.1, 'triangle', 0.18, i * 0.06)); }
  };

  function play(name) { if (muted) return; ensure(); if (sfx[name]) sfx[name](); }
  function syncIcons() { document.querySelectorAll('.mute-icon').forEach(el => el.textContent = muted ? '🔇' : '🔊'); }
  function setMuted(m) { muted = m; try { localStorage.setItem('pongtress_muted', m ? '1' : '0'); } catch (e) {} if (master) master.gain.value = m ? 0 : 0.5; syncIcons(); }
  function toggle() { ensure(); resume(); setMuted(!muted); }

  return { play, resume, toggle, setMuted, syncIcons, get muted() { return muted; } };
})();
