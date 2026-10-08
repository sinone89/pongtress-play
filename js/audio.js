'use strict';
/* PONGTRESS 사운드 — 파일 우선 + 합성음 폴백 · BGM 관리자. 다른 스크립트보다 먼저 로드.
 *
 *  효과음  Sound.play(id, opts)      assets/audio/sfx/<id>[_n].ogg|m4a 가 있으면 그 파일을, 없으면 예전 합성음(DEFS[id].synth)을 쓴다.
 *                                    옛 이름(peg·launch·charge …)은 ALIAS 로 새 id 에 이어진다 → 호출부는 그대로 두고 파일만 하나씩 넣으면 교체된다.
 *  음악    Sound.scene(name, ctx)    게임 상황 → 곡 고르기(폴백 사슬 chainFor) → Sound.bgm(id) 로 크로스페이드. 곡이 없으면 조용히 넘어간다.
 *          Sound.bgm / stopBgm / stinger / duck / unduck / setVolume / setSpeed / preload / has / state
 *  목록    assets/audio/manifest.json — tools/audio-build.ps1 가 만든다. 여기 적힌 파일만 요청하므로 파일이 없을 때 404 가 나지 않고,
 *          비어 있으면(지금) 합성음만 나온다. 형식은 docs/audio-asset-list.md §7.
 *  브라우저 자동재생 정책: 첫 사용자 입력 전에는 소리가 안 난다. 장면은 '원하는 장면'으로만 기억해 두었다가 첫 입력(또는 이미 입력한 적이 있으면 바로) 뒤에 시작한다.
 *  개발용: 주소 뒤 ?audiobase=tools/audio-test-assets/ 로 시험 음원 폴더를 지정(같은 출처의 상대 경로만 허용) — tools/audio-test.html 에서 하나씩 들어 볼 수 있다.
 */
const Sound = (function () {
  // ═════════ 설정 ═════════
  const MASTER = 0.5;                                              // 마스터 음량(예전 합성음 시절과 같은 값)
  const BUS_GAIN = { sfx: 0.8, ui: 0.7, jingle: 0.9, bgm: 0.5 };   // 버스 기본 음량(docs/audio-asset-list.md §5) — 효과음·UI 는 vol.sfx, 음악·징글은 vol.bgm 이 곱해진다
  const BGM_BUDGET = 100 * 1048576;                                // 디코딩된 BGM 이 차지할 수 있는 최대 메모리(스테레오 60~90초 ≈ 22~35 MB 라서 곡 둘 남짓)
  const MAX_VOICES = 24, GROUP_MAX = { board: 6, battle: 8 };      // 동시에 울리는 파일 소리 상한(전체 · 묶음별)
  const Q = (function () { try { const m = /[?&]v=([\w.-]+)/.exec(document.currentScript.src); return m ? '?v=' + m[1] : ''; } catch (e) { return ''; } })();   // 이미지와 같은 방식의 캐시 버스터
  const cfg = { base: 'assets/audio/' };
  function cleanBase(s) {                                          // 같은 출처의 경로만(스킴·// 로 시작하는 주소는 거절), 끝에 / 를 붙인다
    s = String(s || '').trim();
    if (!s || !/^[\w.\-\/]+$/.test(s) || /^\/\//.test(s)) return null;
    return s.replace(/\/*$/, '/');
  }
  try { const m = /[?&]audiobase=([^&#]*)/.exec(location.search); const b = m && cleanBase(decodeURIComponent(m[1])); if (b) cfg.base = b; } catch (e) {}

  // ═════════ 상태 ═════════
  let ctx = null, master = null, synthOut = null, duckNode = null;
  const bus = {};
  let muted = false; try { muted = localStorage.getItem('pongtress_muted') === '1'; } catch (e) {}
  const vol = { bgm: 1, sfx: 1 };                                  // 사용자 음량(0~1) — 설정 화면이 생기면 setVolume 으로
  try { for (const k of ['bgm', 'sfx']) { const v = parseFloat(localStorage.getItem('pongtress_vol_' + k)); if (v >= 0 && v <= 1) vol[k] = v; } } catch (e) {}
  let gestured = false, unlocked = false, armed = false, resumeAt = 0, speed = 1, lastPeg = 0;

  const dbToGain = (db) => Math.pow(10, Math.max(-60, Math.min(24, Number.isFinite(db) ? db : 0)) / 20);   // 숫자가 아니거나(NaN·문자열) 터무니없는 dB 는 0 dB · −60~+24 로 제한 — AudioParam 에 비유한 값이 들어가면 TypeError

  // ═════════ 컨텍스트 · 잠금 해제 ═════════
  function busGain(k) { return BUS_GAIN[k] * ((k === 'bgm' || k === 'jingle') ? vol.bgm : vol.sfx); }
  function applyVolumes() {
    if (!ctx) return;
    for (const k in bus) bus[k].gain.value = busGain(k);
    if (synthOut) synthOut.gain.value = vol.sfx;
  }
  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    try { try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = new AC(); } } catch (e) { ctx = null; return null; }
    master = ctx.createGain(); master.gain.value = muted ? 0 : MASTER; master.connect(ctx.destination);
    synthOut = ctx.createGain(); synthOut.connect(master);                                   // 예전 합성음 경로(마스터 0.5 · 효과음 음량)
    for (const k of ['sfx', 'ui', 'jingle', 'bgm']) { bus[k] = ctx.createGain(); bus[k].connect(master); }
    duckNode = ctx.createGain(); duckNode.connect(bus.bgm);                                  // BGM 만 낮추는 노드(덕킹)
    applyVolumes(); applyDuck(0);
    try { ctx.onstatechange = onState; } catch (e) {}
    return ctx;
  }
  // 소리를 내도 되는 상태인가: 실행 중이거나, 방금 resume() 을 불러 풀리는 중(그 사이 첫 효과음이 사라지지 않게)
  function live() { return !!ctx && (ctx.state === 'running' || (ctx.state === 'suspended' && resumeAt > 0 && performance.now() - resumeAt < 700)); }
  function resume() {                                              // 사용자 입력 안에서 부른다(game.js 가 타이틀 탭·조준 시작에서 부름)
    gestured = true; ensure(); if (!ctx) return;
    if (ctx.state === 'running') { onRunning(); return; }
    resumeAt = performance.now();
    try { const p = ctx.resume(); if (p && p.then) p.then(onRunning, () => {}); } catch (e) {}
    try { const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0); } catch (e) {}   // iOS: 입력 안에서 무음을 한 번 재생해야 풀린다
  }
  function onRunning() { if (ctx && ctx.state === 'running' && !unlocked) { unlocked = true; disarm(); afterUnlock(); } }
  function onState() {                                             // 통화·다른 앱 등으로 멈추면(iOS 'interrupted') 다음 입력 때 다시 푼다
    if (!ctx) return;
    if (ctx.state === 'running') onRunning();
    else if (unlocked && !document.hidden && ctx.state !== 'closed') { unlocked = false; arm(); }
  }
  const GEST = ['pointerdown', 'touchend', 'mousedown', 'keydown'];   // touchstart 는 뺀다 — 터치의 pointerdown·touchstart 는 브라우저가 '사용자 입력'으로 치지 않아(touchend 부터) 거기서 컨텍스트를 만들면 자동재생 차단 경고만 뜬다
  function onGesture(e) {
    if (e.type === 'pointerdown' && e.pointerType && e.pointerType !== 'mouse') return;
    const ua = navigator.userActivation; if (ua && !ua.isActive && !ua.hasBeenActive) return;   // 브라우저가 '사용자 활성화'로 안 친 입력(터치 드래그 끝의 touchend · Esc 키 …)이고 그 전에 입력한 적도 없으면 컨텍스트를 만들어 봐야 자동재생 차단 경고만 뜬다 — 진짜 탭·클릭은 핸들러가 불리기 전에 이미 활성화돼 있다(API 가 없는 브라우저는 예전처럼 항상 시도)
    resume();
  }
  function arm() { if (armed) return; armed = true; GEST.forEach(e => window.addEventListener(e, onGesture, { capture: true, passive: true })); }
  function disarm() { if (!armed) return; armed = false; GEST.forEach(e => window.removeEventListener(e, onGesture, { capture: true })); }
  function afterUnlock() { applyScene(); preloadAll(); }
  document.addEventListener('visibilitychange', () => {           // 탭이 가려지면 소리도 멈추고(배터리), 돌아오면 이어서
    if (!ctx) return;
    try {
      if (document.hidden) { const p = ctx.suspend(); if (p && p.catch) p.catch(() => {}); return; }
      resumeAt = performance.now();                                // 돌아온 직후 풀리는 몇 ms 동안에도 소리가 사라지지 않게(live() 의 '풀리는 중' 창)
      const p = ctx.resume(); if (p && p.catch) p.catch(() => {});
    } catch (e) {}
    setTimeout(() => { if (ctx && !document.hidden && gestured && ctx.state !== 'running' && ctx.state !== 'closed') { unlocked = false; arm(); } }, 500);   // iOS 는 통화·다른 앱을 다녀오면 입력 없이는 resume 이 거절되고 상태 변화 이벤트도 없다 → 안 풀렸으면 다음 입력 때 다시 푼다
  });
  // ⚠ 이 파일 끝(return 바로 앞)에서 arm()·userActivation 검사·loadManifest() 를 부른다 — 여기서 resume() 을 부르면 아래의 const(ducks·want 등)가 아직 초기화 전이라 ensure() 가 TDZ 오류로 중간에 끊긴다

  // ═════════ 합성음(파일이 없을 때의 폴백 — 예전 소리 그대로) ═════════
  function blip(f0, f1, dur, type, vol0, delay) {
    if (!live() || muted) return;
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol0 || 0.3, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(synthOut); o.start(t); o.stop(t + dur + 0.03);
  }
  function noise(dur, vol0, delay) {
    if (!live() || muted) return;
    const t = ctx.currentTime + (delay || 0);
    const buf = ctx.createBuffer(1, Math.max(1, ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(); s.buffer = buf;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol0 || 0.2, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 700;
    s.connect(f); f.connect(g); g.connect(synthOut); s.start(t); s.stop(t + dur);
  }
  const synth = {
    peg() { const now = performance.now(); if (now - lastPeg < 45) return false; lastPeg = now; blip(560 + Math.random() * 340, 920, 0.05, 'triangle', 0.1); },   // false = 간격 제한으로 소리 안 냄(play 가 null 을 돌려주게)
    launch() { blip(200, 720, 0.12, 'sawtooth', 0.16); },
    charge() { blip(720, 1180, 0.08, 'sine', 0.16); },
    shot() { blip(520, 190, 0.06, 'square', 0.1); },
    kill() { blip(180, 80, 0.14, 'sawtooth', 0.2); noise(0.08, 0.1); },
    wall() { blip(110, 55, 0.22, 'sine', 0.32); noise(0.12, 0.14); },
    level() { blip(660, 990, 0.12, 'triangle', 0.24); blip(990, 1320, 0.14, 'triangle', 0.2, 0.09); },
    win() { [523, 659, 784, 1047].forEach((f, i) => blip(f, f, 0.2, 'triangle', 0.24, i * 0.12)); },
    lose() { [420, 340, 262, 196].forEach((f, i) => blip(f, f * 0.97, 0.26, 'sine', 0.24, i * 0.14)); },
    click() { blip(520, 520, 0.03, 'square', 0.08); },
    gacha() { [400, 600, 800, 1200].forEach((f, i) => blip(f, f * 1.2, 0.1, 'triangle', 0.18, i * 0.06)); },
    reset() { [660, 880, 1320, 1760].forEach((f, i) => blip(f, f * 1.06, 0.1, 'triangle', 0.15, i * 0.045)); }   // 초기화 탄약: 반짝이며 올라가는 짧은 아르페지오(터진 탄약이 되살아난다)
  };

  // ═════════ 효과음 목록(id 별 설정) ═════════
  // synth = 파일이 없을 때 쓰는 예전 합성음(없으면 무음) · gap = 같은 id 최소 간격(ms, 전투 배속에 비례해 늘림) · voices = 같은 id 동시 발음 수
  // grp = 묶음 동시 발음 제한 키(GROUP_MAX) · ladder = 콤보(opts.n)가 늘수록 음이 반음씩 올라감(최대 +7) · vol = 상대 음량 · bus 는 이름으로 정한다(ui_·gacha_ → ui, jg_ → 징글, 나머지 sfx)
  // 표에 없는 id 도 manifest 에 파일이 있으면 기본값으로 재생된다. 새 사건을 더할 땐 docs/audio-asset-list.md 에 한 줄 + 필요하면 여기에.
  const CLICK = { synth: 'click' }, BOARD = { synth: 'peg', gap: 45, grp: 'board' };
  const DEFS = {
    // UI
    ui_click: CLICK, ui_back: CLICK, ui_confirm: CLICK, ui_deny: CLICK, ui_popup_open: CLICK, ui_speed: CLICK, ui_tut_next: CLICK, ui_help_open: CLICK, ui_drag_drop: CLICK, app_start: CLICK,
    ui_claim: { synth: 'charge' }, ui_claim_big: { synth: 'charge' }, ui_levelup_char: { synth: 'level' }, ui_promote: { synth: 'level' },
    gacha_pull: { synth: 'gacha' }, gacha_ten: { synth: 'gacha' },
    // 핀볼 판(장전 단계)
    ball_launch: { synth: 'launch', voices: 3 }, ball_multi: { synth: 'launch' },
    peg_hit: { synth: 'peg', gap: 45, voices: 4, grp: 'board', ladder: true },
    peg_mult2: BOARD, peg_mult5: BOARD, peg_gold: BOARD, peg_charge: BOARD, peg_scrap: BOARD, obst_bumper: BOARD, obst_pillar: BOARD,
    peg_bomb: { synth: 'kill', voices: 3, grp: 'board' }, peg_sludge: { synth: 'wall', grp: 'board' }, peg_reset: { synth: 'reset', grp: 'board' },
    combo_hit: { synth: 'charge' }, pocket_charge: { synth: 'charge', voices: 3 }, pocket_jackpot: { synth: 'charge' }, pocket_buff: { synth: 'charge' }, pocket_lucky: { synth: 'charge' },
    // 전투 단계
    shot_gunner: { synth: 'shot', voices: 3, grp: 'battle' }, shot_cannon: { synth: 'shot', voices: 3, grp: 'battle' }, shot_support: { synth: 'shot', voices: 3, grp: 'battle' },
    skill_big: { synth: 'shot', grp: 'battle' }, skill_aoe: { synth: 'shot', grp: 'battle' }, skill_stun: { synth: 'wall' }, skill_cutin: { synth: 'level' },
    hit_enemy: { voices: 4, grp: 'battle' },
    enemy_die: { synth: 'kill', voices: 3, grp: 'battle' }, enemy_die_big: { synth: 'kill', grp: 'battle' }, elite_down: { synth: 'kill' }, boss_defeat: { synth: 'kill' }, boss_split: { synth: 'kill' },
    wall_hit: { synth: 'wall', voices: 2 }, wall_break: { synth: 'wall' }, wall_heal: { synth: 'charge' },
    levelup_run: { synth: 'level' }, relic_get: { synth: 'level' }, relic_evolve: { synth: 'level' },
    // 지도 · 상점 · 정비
    shop_buy: { synth: 'charge' }, rest_heal: { synth: 'charge' },
    node_battle: CLICK, node_elite: CLICK, node_shop: CLICK, node_rest: CLICK, node_boss: CLICK,
    // 징글(한 번 재생하고 끝나는 짧은 곡 — 재생 중 BGM 을 낮춘다)
    jg_win: { synth: 'win' }, jg_lose: { synth: 'lose' }, jg_endless_end: { synth: 'lose' }
  };
  // 옛 이름(코드 곳곳의 Sound.play('peg') 등) → 새 id
  const ALIAS = { peg: 'peg_hit', launch: 'ball_launch', charge: 'pocket_charge', shot: 'shot_gunner', kill: 'enemy_die', wall: 'wall_hit', level: 'levelup_run', win: 'jg_win', lose: 'jg_lose', click: 'ui_click', gacha: 'gacha_pull' };
  // ⚠ 모르는 id 도 DEFS 에 영구 항목이 하나 생긴다. 지금 id 는 전부 코드에 박힌 문자열이라 영향이 없지만, 동적으로 만든 id 를 넘기게 되면 상한(또는 별도 캐시)을 둘 것
  function defOf(id) {
    let d = DEFS[id];
    if (!d || !d.bus) d = DEFS[id] = Object.assign({ bus: /^(ui_|gacha_)/.test(id) ? 'ui' : /^jg_/.test(id) ? 'jingle' : 'sfx' }, d);   // id 마다 복사본을 둔다 — CLICK·BOARD 는 여러 id 가 같은 객체를 쓰므로 거기에 bus 를 써 넣으면 처음 불린 id(node_* 면 sfx)의 버스가 ui_* 에도 붙는다
    return d;
  }

  // ═════════ 목록(manifest) · 파일 받기 ═════════
  // manSeq = 세대 번호(목록을 새로 받을 때마다 +1) — 늦게 끝난 옛 세대의 받기·디코딩이 새 세대의 캐시·실패 기록에 섞이지 않게 모든 받기가 시작할 때의 번호를 기억했다가 끝날 때 맞는지 본다
  // altFmt = 디코딩이 안 될 때 한 번 써 볼 다른 형식(없으면 null) · fmtSwitched = 이미 그렇게 바꿨는가(한 번만 — 형식이 오락가락하지 않게)
  let man = null, manP = null, manSeq = 0, fmt = 'ogg', altFmt = null, fmtSwitched = false;
  const raw = new Map();                                           // 주소 → Promise<ArrayBuffer>(압축된 원본 — 디코딩할 때마다 복사본을 쓴다)
  const failed = Object.create(null);                              // 받기·디코딩에 실패한 음원 id → 이유(성공하면 지운다 · state().failed 로 보인다)
  function report(kind, id, err) {                                 // 실패를 조용히 삼키지 않는다 — id 당 한 번만 console.warn(1분 뒤 다시 시도할 때 같은 경고가 되풀이되지 않게)
    if (id in failed) return;
    failed[id] = String(err && err.message || err).slice(0, 120);
    try { console.warn('[audio] ' + kind + ' ' + id + ' 를 못 쓴다 — ' + failed[id] + (kind === 'bgm' ? ' (다른 곡으로 넘어가거나 조용히)' : ' (합성음으로)') + ' · 나중에 다시 시도(받기 실패는 1분 뒤)'); } catch (e) {}
  }
  function pickFmts(m) {                                           // → [쓸 형식, 디코딩이 안 될 때 써 볼 다른 형식 | null]
    let want = 'm4a';
    try { const a = document.createElement('audio'), c = a.canPlayType('audio/ogg; codecs="vorbis"'); if (c === 'probably' || c === 'maybe') want = 'ogg'; } catch (e) {}
    const list = m && m.formats && m.formats.length ? m.formats : null;
    if (list && list.indexOf(want) < 0) want = list[0];            // 이 브라우저가 선호하는 형식이 없으면 있는 것
    return [want, (list && list.find(f => f !== want)) || null];
  }
  // manifest 를 읽을 때 알려진 필드만, 형식이 맞는 값만 남긴다. 손으로 고친 manifest 에 gain: "x" 가 있으면 AudioParam 에 NaN 이 들어가 효과음은 매번 예외, 곡은 소리 없는 '재생 중'(g=0)으로 굳었다
  const ID_RE = /^[a-z0-9_]{1,64}$/, fin = (v) => typeof v === 'number' && isFinite(v);
  function cleanManifest(m) {
    if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
    const o = { formats: Array.isArray(m.formats) ? m.formats.filter(f => f === 'ogg' || f === 'm4a') : [], sfx: Object.create(null), jingle: Object.create(null), bgm: Object.create(null) }, bad = [];
    for (const kind of ['sfx', 'jingle', 'bgm']) {
      const src = m[kind]; if (!src || typeof src !== 'object' || Array.isArray(src)) continue;
      for (const id of Object.keys(src)) {
        if (!ID_RE.test(id)) { bad.push(kind + '/' + id); continue; }   // 파일 경로가 되므로 id 는 소문자·숫자·밑줄만
        let d = src[id], r = {};
        if (!d || typeof d !== 'object') { bad.push(kind + '/' + id); d = {}; }
        if (d.gain !== undefined) { if (fin(d.gain)) r.gain = Math.max(-60, Math.min(24, d.gain)); else bad.push(kind + '/' + id + '.gain'); }
        if (fin(d.dur)) r.dur = d.dur;
        if (kind === 'sfx') { if (d.n !== undefined && !fin(d.n)) bad.push(kind + '/' + id + '.n'); r.n = fin(d.n) ? Math.max(1, Math.min(32, d.n | 0)) : 1; }
        if (kind === 'bgm') {
          if (d.intro) r.intro = true;
          if (d.loop !== undefined) { if (Array.isArray(d.loop) && d.loop.length === 2 && fin(d.loop[0]) && fin(d.loop[1]) && d.loop[0] >= 0 && d.loop[1] > d.loop[0]) r.loop = [d.loop[0], d.loop[1]]; else bad.push(kind + '/' + id + '.loop'); }
          if (d.sync !== undefined) { if (typeof d.sync === 'string' && ID_RE.test(d.sync)) r.sync = d.sync; else bad.push(kind + '/' + id + '.sync'); }
        }
        o[kind][id] = r;
      }
    }
    if (bad.length) { try { console.warn('[audio] manifest.json 의 올바르지 않은 값은 무시했다(기본값 사용): ' + bad.slice(0, 8).join(', ') + (bad.length > 8 ? ' 외 ' + (bad.length - 8) + '개' : '')); } catch (e) {} }
    return o;
  }
  function loadManifest() {
    man = null; const my = ++manSeq;                               // 번호표 — configure 를 연달아 불러도 늦게 도착한 옛 목록이 새 목록을 덮지 않게
    manP = fetch(cfg.base + 'manifest.json' + Q).then(r => r.ok ? r.json() : null).then(m => {
      if (my !== manSeq) return m;
      man = cleanManifest(m); [fmt, altFmt] = pickFmts(man); fmtSwitched = false;
      try { applyScene(); if (unlocked) preloadAll(); } catch (e) { try { console.warn('[audio] 목록을 받은 뒤 시작하다 오류', e); } catch (e2) {} }   // 여기서 던져도 방금 받은 목록(man)을 지우지 않는다
      return man;
    }).catch(err => { if (my === manSeq) { man = null; try { console.warn('[audio] manifest.json 을 읽지 못했다 — 합성음만 쓴다: ' + (err && err.message || err)); } catch (e) {} } return null; });
    return manP;
  }
  const hasSfx = (id) => !!(man && man.sfx[id]), hasBgm = (id) => !!(man && man.bgm[id]), hasJingle = (id) => !!(man && man.jingle[id]);
  function has(id) { id = ALIAS[id] || id; return hasSfx(id) || hasBgm(id) || hasJingle(id); }
  const urlOf = (kind, name, f) => cfg.base + kind + '/' + name + '.' + (f || fmt) + Q;
  const fetchErr = (err) => Object.assign(err instanceof Error ? err : new Error(String(err)), { fetchFail: true });   // '파일을 못 받음(없음·네트워크)' 표시 — 디코딩 실패와 구별해 다른 형식으로 다시 요청하지 않게
  function fetchRaw(u) {
    let p = raw.get(u);
    if (!p) {
      p = fetch(u).then(r => { if (!r.ok) throw fetchErr(new Error('HTTP ' + r.status)); return r.arrayBuffer().catch(e => { throw fetchErr(e); }); }, e => { throw fetchErr(e); });
      p.catch(() => { if (raw.get(u) === p) raw.delete(u); });     // 실패한 주소는 지워 다음 시도(1분 뒤)에 다시 받게 — 성공한 것은 계속 들고 있어 주소 당 한 번만 받는다
      raw.set(u, p);
    }
    return p;
  }
  function decode(ab) {                                            // 옛 콜백형과 새 약속형을 모두 받는다
    return new Promise((res, rej) => { try { const p = ctx.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); } catch (e) { rej(e); } });
  }
  const decodeUrl = (u) => fetchRaw(u).then(ab => decode(ab.slice(0)));
  function fileBuf(kind, name) {                                   // 파일 하나 받아 디코딩. 디코딩이 안 되면(canPlayType 이 'maybe' 라고 한 형식이 실제로는 안 되는 브라우저) 다른 형식으로 딱 한 번 다시
    const gen = manSeq, f0 = fmt;
    return decodeUrl(urlOf(kind, name, f0)).catch(err => {
      const f1 = altFmt;
      if ((err && err.fetchFail) || !f1 || f1 === f0 || fmtSwitched) throw err;   // 파일이 없거나 네트워크 문제는 형식 탓이 아니다 · 대체 형식이 없거나 이미 한 번 바꿨으면 그대로 실패 → 재시도 폭주·반복 404 없음
      return decodeUrl(urlOf(kind, name, f1)).then(buf => {
        if (!fmtSwitched && gen === manSeq) { fmtSwitched = true; fmt = f1; altFmt = null; try { console.warn('[audio] ' + f0 + ' 를 디코딩하지 못해(' + (err && err.message || err) + ') 이 브라우저는 ' + f1 + ' 로 바꿨다'); } catch (e) {} }   // 다음 파일부터는 처음부터 f1 로
        return buf;
      }, err2 => { throw new Error(f0 + ' 디코딩 실패(' + (err && err.message || err) + ') · ' + f1 + ' 로 다시 해도 실패(' + (err2 && err2.message || err2) + ')'); });
    });
  }
  function runQueue(jobs, n) {                                     // 동시에 n 개씩만(시작 때 네트워크·디코딩이 한꺼번에 몰리지 않게)
    let i = 0;
    const next = () => { if (i >= jobs.length) return; const j = jobs[i++]; Promise.resolve().then(j).catch(() => {}).then(next); };
    for (let k = 0; k < n; k++) next();
  }

  // ═════════ 효과음 · 징글 버퍼 ═════════
  const sfxBufs = new Map(), jingleBufs = new Map(), loadingSfx = new Map(), failedAt = {};
  const lastVar = {}, lastAt = {}, live_ = [];
  function loadSfx(id) {                                           // 모든 변주를 받아 디코딩(한 번만)
    if (!ctx || !hasSfx(id) || sfxBufs.has(id) || loadingSfx.has(id)) return loadingSfx.get(id);
    if (failedAt[id] && performance.now() - failedAt[id] < 60000) return;
    const gen = manSeq, n = man.sfx[id].n || 1, trim = dbToGain(man.sfx[id].gain), names = [];
    for (let k = 1; k <= n; k++) names.push(n > 1 ? id + '_' + k : id);
    const p = Promise.all(names.map(nm => fileBuf('sfx', nm))).then(bs => {
      if (gen !== manSeq) return;                                  // 받는 사이 configure 로 음원 위치·목록이 바뀌었다 → 옛 세대의 결과는 버린다(새 목록에 없는 소리가 파일로 남지 않게)
      sfxBufs.set(id, bs.map(b => ({ buf: b, trim }))); loadingSfx.delete(id); delete failed[id];
    }, err => { if (gen !== manSeq) return; failedAt[id] = performance.now(); loadingSfx.delete(id); report('sfx', id, err); });
    loadingSfx.set(id, p); return p;
  }
  function loadJingle(id) {                                        // 약속을 돌려 준다(preloadAll 의 작업 대기열이 다 받을 때까지 기다리게)
    if (!ctx || !hasJingle(id) || jingleBufs.has(id) || loadingSfx.has('jg:' + id)) return loadingSfx.get('jg:' + id);
    if (failedAt['jg:' + id] && performance.now() - failedAt['jg:' + id] < 60000) return;
    const gen = manSeq, trim = dbToGain(man.jingle[id].gain);
    const p = fileBuf('jingle', id).then(b => {
      if (gen !== manSeq) return;                                  // 옛 세대의 결과는 버린다(loadSfx 와 같다)
      jingleBufs.set(id, { buf: b, trim }); loadingSfx.delete('jg:' + id); delete failed[id];
    }, err => { if (gen !== manSeq) return; failedAt['jg:' + id] = performance.now(); loadingSfx.delete('jg:' + id); report('jingle', id, err); });
    loadingSfx.set('jg:' + id, p); return p;
  }
  function pickSfx(id) {                                           // 변주 중 하나(바로 앞에 쓴 것은 피한다). 아직 안 받았으면 받기 시작하고 null
    const a = sfxBufs.get(id);
    if (!a) { if (hasSfx(id)) loadSfx(id); return null; }
    let i = a.length === 1 ? 0 : (Math.random() * a.length) | 0;
    if (a.length > 1 && i === lastVar[id]) i = (i + 1 + ((Math.random() * (a.length - 1)) | 0)) % a.length;
    lastVar[id] = i; return a[i];
  }
  function preloadAll() {                                          // 첫 입력 뒤 한가할 때: 효과음·징글을 받아 디코딩, 로비 곡 쌍은 파일만 받아 둔다
    if (!man || !ctx) return;
    const jobs = [];
    Object.keys(man.jingle).forEach(id => jobs.push(() => loadJingle(id)));
    Object.keys(man.sfx).forEach(id => jobs.push(() => loadSfx(id)));
    runQueue(jobs, 3);
    prefetchBgm(['bgm_home', 'bgm_menu']);
  }
  function preload(ids) {                                          // 개발·점검용: 지정한 id(없으면 전부)를 지금 받는다. 약속을 돌려 준다
    if (!man || !gestured || !ensure()) return Promise.resolve();   // 첫 입력 전에는 컨텍스트를 만들지 않는다(디코딩할 곳이 없으니 아무 것도 못 받는다)
    const out = [];
    (ids || Object.keys(man.sfx).concat(Object.keys(man.jingle))).forEach(i => { const id = ALIAS[i] || i; if (hasSfx(id)) out.push(loadSfx(id)); else if (hasJingle(id)) out.push(loadJingle(id)); });
    return Promise.all(out);
  }
  function prefetchBgm(ids) {                                      // 압축 파일만 받아 둔다(디코딩은 곡이 필요할 때 — 메모리를 아낀다)
    if (!man) return;
    const gen = manSeq;
    ids.forEach(id => { const d = man.bgm[id]; if (!d || !bgmOk(id)) return; (d.intro ? [id + '_intro', id + '_loop'] : [id]).forEach(n => { fetchRaw(urlOf('bgm', n)).catch(err => { if (gen !== manSeq) return; failedAt['bgm:' + id] = performance.now(); report('bgm', id, err); }); }); });
  }

  // ═════════ 효과음 재생 ═════════
  function outBus(def) { return bus[def.bus] || bus.sfx; }
  function dropVoice(v) { const i = live_.indexOf(v); if (i >= 0) live_.splice(i, 1); }
  function steal(pred) { for (let i = 0; i < live_.length; i++) if (pred(live_[i])) { const v = live_[i]; try { v.src.stop(); } catch (e) {} live_.splice(i, 1); return; } }
  function playBuf(id, def, e, o) {
    // 동시 발음 제한: 같은 id → 같은 묶음 → 전체 순서로 확인해 넘치면 가장 오래된 것을 끊는다
    if (def.voices && live_.filter(v => v.id === id).length >= def.voices) steal(v => v.id === id);
    if (def.grp && live_.filter(v => v.grp === def.grp).length >= (GROUP_MAX[def.grp] || 6)) steal(v => v.grp === def.grp);
    if (live_.length >= MAX_VOICES) steal(() => true);
    const src = ctx.createBufferSource(); src.buffer = e.buf;
    const semis = (o.pitch || 0) + (def.ladder ? Math.min(7, Math.max(0, (o.n | 0))) : 0);
    src.playbackRate.value = Math.pow(2, semis / 12) * (o.rate || 1) * (1 + (Math.random() * 2 - 1) * (o.rand != null ? o.rand : 0.04));   // 같은 소리를 ±4% 어긋나게 → 덜 지겹다
    const g = ctx.createGain(); g.gain.value = (def.vol == null ? 1 : def.vol) * (o.vol == null ? 1 : o.vol) * e.trim;
    let tail = g; src.connect(g);
    if (o.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); g.connect(p); tail = p; }
    tail.connect(outBus(def));
    const v = { id, grp: def.grp, src }; live_.push(v);
    src.onended = () => { dropVoice(v); try { src.disconnect(); g.disconnect(); if (tail !== g) tail.disconnect(); } catch (e) {} };
    src.start();
  }
  // 반환: 'file'(파일로 재생) · 'synth'(예전 합성음) · null(소리 안 남)
  function play(name, o) {
    if (muted || !gestured) return null;                           // 첫 입력 전에는 컨텍스트도 만들지 않는다(자동재생 정책)
    if (!ensure() || !live()) return null;
    o = o || {};
    const id = ALIAS[name] || name, def = defOf(id);
    if (def.bus === 'jingle') return stinger(id, o) ? 'file' : (def.synth && synth[def.synth] ? 'synth' : null);
    const e = pickSfx(id);
    if (e) {
      if (def.gap) { const t = performance.now(); if (t - (lastAt[id] || 0) < def.gap * Math.max(1, speed)) return null; lastAt[id] = t; }   // 간격 제한(+배속 비례)은 파일 소리에만 — 합성음은 예전 그대로 synth.peg 자체의 45ms 제한만 받는다(소리 안 난 호출이 간격 시계를 밀어 다음 소리를 막는 일이 없게)
      try { playBuf(id, def, e, o); return 'file'; } catch (err) { console.warn('[audio] ' + id, err); }
    }
    if (def.synth && synth[def.synth]) return synth[def.synth](o) === false ? null : 'synth';
    return null;
  }
  // 징글: 한 번 재생하고 BGM 을 잠깐 낮춘다. 반환 = 길이(초), 파일이 없으면 합성음(있다면)을 내고 0
  let jingleEnd = 0, jingleSeq = 0;
  function stinger(name, o) {
    o = o || {};
    if (muted || !gestured || !ensure() || !live()) return 0;
    const id = ALIAS[name] || name, def = defOf(id), e = jingleBufs.get(id);
    if (!e) { if (hasJingle(id)) loadJingle(id); if (def.synth && synth[def.synth]) synth[def.synth](o); return 0; }
    const src = ctx.createBufferSource(); src.buffer = e.buf;
    const g = ctx.createGain(); g.gain.value = e.trim * (o.vol == null ? 1 : o.vol); src.connect(g); g.connect(bus.jingle);
    const dur = e.buf.duration, key = 'jingle:' + id + '#' + (++jingleSeq); jingleEnd = Math.max(jingleEnd, ctx.currentTime + dur);   // 덕킹 키는 재생마다 다르다 — 같은 징글이 겹쳐도 먼저 끝난 쪽이 다른 쪽의 덕킹을 풀지 않는다 · afterStinger 는 가장 늦게 끝나는 징글 뒤
    if (o.duck !== false) duck(key, o.duckDb != null ? o.duckDb : -8, { attack: 0.15 });
    src.onended = () => { unduck(key); try { src.disconnect(); g.disconnect(); } catch (er) {} };
    src.start(); return dur;
  }

  // ═════════ 덕킹(BGM 을 일시적으로 낮춤) ═════════
  const ducks = {}, duckTimers = {};
  function applyDuck(sec) {
    if (!duckNode || !ctx) return;
    let db = 0; for (const k in ducks) db = Math.min(db, ducks[k]);   // 여러 이유가 겹치면 가장 강한 것 하나만
    const g = duckNode.gain, now = ctx.currentTime, v = g.value;
    try { g.cancelScheduledValues(0); g.setValueAtTime(v, now); if (sec > 0) g.setTargetAtTime(dbToGain(db), now, Math.max(0.001, sec / 3)); else g.setValueAtTime(dbToGain(db), now); } catch (e) { g.value = dbToGain(db); }
  }
  function duck(reason, db, o) {                                   // 예: duck('tutorial', -6) · duck('cutin', -8, { for: 950 }) — 같은 reason 을 다시 부르면 값만 바뀐다
    o = o || {}; const v = Number.isFinite(db) ? Math.min(0, db) : -8;   // 숫자가 아니면(null·NaN·문자열) 기본 −8 dB — NaN 이 ducks 에 들어가면 이후 모든 applyDuck 이 예외를 낸다
    if (ducks[reason] === v && !(o.for > 0)) return;               // 같은 이유·같은 값을 또 부르면 아무것도 안 한다(튜토리얼은 0.25초마다 카드를 다시 띄우며 부른다)
    ducks[reason] = v;
    clearTimeout(duckTimers[reason]); if (o.for > 0) duckTimers[reason] = setTimeout(() => unduck(reason), o.for);
    applyDuck(o.attack != null ? o.attack : 0.3);
  }
  function unduck(reason, o) {
    clearTimeout(duckTimers[reason]); if (!(reason in ducks)) return; delete ducks[reason];
    applyDuck(o && o.release != null ? o.release : 0.6);
  }

  // ═════════ BGM ═════════
  const bgmCache = new Map();                                      // id → { p: Promise<tb>, t: 마지막 사용 순번, bytes, ready }
  let cur = null, token = 0, want = null, wantId = null, useClock = 0;
  const mem = {};                                                  // id → 마지막 재생 위치(초) — 탭을 옮겼다 돌아오면 이어서
  function bytesOf(b) { return b.length * b.numberOfChannels * 4; }
  function buildTb(bs, d) {                                        // 디코딩된 버퍼(들) → 루프 정보가 붙은 트랙 버퍼. 인트로가 있으면 이어 붙이고 루프 시작을 인트로 길이로
    let buf = bs[0], ls = 0, le = buf.duration;
    if (bs.length > 1) {
      const a = bs[0], b = bs[1], ch = Math.max(a.numberOfChannels, b.numberOfChannels);
      buf = ctx.createBuffer(ch, a.length + b.length, a.sampleRate);
      for (let c = 0; c < ch; c++) { const out = buf.getChannelData(c); out.set(a.getChannelData(Math.min(c, a.numberOfChannels - 1)), 0); out.set(b.getChannelData(Math.min(c, b.numberOfChannels - 1)), a.length); }
      ls = a.duration; le = buf.duration;
    } else if (Array.isArray(d.loop) && d.loop[0] >= 0 && d.loop[1] > d.loop[0] && d.loop[1] <= buf.duration + 0.01) { ls = d.loop[0]; le = Math.min(d.loop[1], buf.duration); }
    return { buf, loopStart: ls, loopEnd: le };
  }
  function loadBgm(id) {
    let e = bgmCache.get(id);
    if (e) { e.t = ++useClock; return e.p; }
    const gen = manSeq, d = man.bgm[id], names = d.intro ? [id + '_intro', id + '_loop'] : [id];
    const p = Promise.all(names.map(n => fileBuf('bgm', n))).then(bs => buildTb(bs, d));
    e = { p, t: ++useClock, bytes: 0, ready: false }; bgmCache.set(id, e);
    p.then(tb => { if (gen !== manSeq) return; e.bytes = bytesOf(tb.buf); e.ready = true; delete failed[id]; evict(); },
      err => { if (gen !== manSeq) return; if (bgmCache.get(id) === e) bgmCache.delete(id); failedAt['bgm:' + id] = performance.now(); report('bgm', id, err); });   // 못 받은 곡은 1분간 후보에서 뺀다(applyScene 이 탭을 옮길 때마다 없는 파일을 다시 요청하지 않게) · 옛 세대의 실패는 새 세대에 옮기지 않는다
    return p;
  }
  const bgmOk = (id) => hasBgm(id) && !(failedAt['bgm:' + id] && performance.now() - failedAt['bgm:' + id] < 60000);
  function evict() {                                               // 디코딩된 BGM 이 예산을 넘으면 오래 안 쓴 것부터 버린다(재생 중·원하는 곡은 남김)
    let total = 0; bgmCache.forEach(e => { total += e.bytes; });
    if (total <= BGM_BUDGET) return;
    const arr = [...bgmCache.entries()].filter(([k, e]) => e.ready && !(cur && cur.id === k) && k !== wantId).sort((a, b) => a[1].t - b[1].t);
    for (const [k, e] of arr) { if (total <= BGM_BUDGET) break; total -= e.bytes; bgmCache.delete(k); }
  }
  const loopLen = (tb) => tb.loopEnd - tb.loopStart;
  function trackPos(t) {                                           // 버퍼 안의 현재 위치(초)
    let p = t.off + Math.max(0, ctx.currentTime - t.t0);
    if (p >= t.tb.loopEnd) p = t.tb.loopStart + ((p - t.tb.loopStart) % loopLen(t.tb));
    return p;
  }
  function startTrack(id, tb, d, off, when, remember) {
    const g = ctx.createGain(); g.gain.value = 0;
    const src = ctx.createBufferSource(); src.buffer = tb.buf; src.loop = true; src.loopStart = tb.loopStart; src.loopEnd = tb.loopEnd;
    src.connect(g); g.connect(duckNode); src.start(when, off);
    return { id, tb, d, g, src, t0: when, off, peak: dbToGain(d.gain), remember: !!remember, dying: false };
  }
  function curve(from, to, shape) {                                // 등전력 곡선(32점) — 'in' = sin, 'out' = cos
    const n = 32, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * Math.PI / 2; c[i] = shape === 'in' ? from + (to - from) * Math.sin(x) : to + (from - to) * Math.cos(x); }
    return c;
  }
  // at = 곡선 시작 시각(ctx 시간) · 'out' 은 지금 값에서, 'in' 은 from 에서 출발. ⚠ currentTime 은 한 번만 읽고 곡선은 그보다 5ms 뒤에 시작한다 — 예전엔 currentTime 을 두 번 읽어서
  // 그 사이 렌더 블록이 지나가면 setValueAtTime(늦은 시각)이 곡선 시작(이른 시각)보다 뒤라 곡선 안에 끼어 NotSupportedError → 직선 폴백(등전력이 아님)이 되곤 했다
  function fadeParam(param, from, to, at, dur, shape) {
    const now = ctx.currentTime, t0 = Math.max(at, now + 0.005), x0 = shape === 'out' ? param.value : from;
    try { param.cancelScheduledValues(0); param.setValueAtTime(x0, now); param.setValueCurveAtTime(curve(x0, to, shape), t0, Math.max(0.02, dur)); return true; }
    catch (e) { try { param.linearRampToValueAtTime(to, t0 + dur); return true; } catch (e2) { try { param.value = to; return true; } catch (e3) { return false; } } }   // 던지지 않는다 — 셋 다 안 되면 false(호출한 쪽이 알아서 트랙을 치운다)
  }
  const dying = new Set();                                         // 페이드아웃 중인 트랙(state 로 확인 · 정리 타이머가 끝나면 빠진다)
  function release(t, fade, at) {                                  // 트랙을 서서히 줄이고 정리. 위치는 기억(remember)
    if (!t || t.dying) return; t.dying = true;
    if (t.remember) mem[t.id] = trackPos(t);
    const now = Math.max(ctx.currentTime, at || 0);
    fadeParam(t.g.gain, 0, 0, now, fade, 'out');
    try { t.src.stop(now + fade + 0.05); } catch (e) {}
    dying.add(t);
    setTimeout(() => { dying.delete(t); try { t.src.disconnect(); t.g.disconnect(); } catch (e) {} }, (fade + 0.5) * 1000);
    if (cur === t) cur = null;
  }
  // 곡 바꾸기: id 없으면 멈춤. o = { fade(초) · remember(떠난 위치를 기억·돌아오면 이어서) · afterStinger(징글이 끝난 뒤 시작) · delay(초) }
  function bgm(id, o) {
    o = o || {}; wantId = id || null; const my = ++token;
    if (muted || !gestured || !ensure() || !man) return;           // 지금은 못 틀면 원하는 곡만 기억 → 풀리거나 목록이 오면 applyScene 이 다시 부른다
    const fade = o.fade != null ? o.fade : 1.2;
    if (!id || !hasBgm(id)) { if (cur) release(cur, fade); return; }
    if (cur && cur.id === id && !cur.dying) return;
    loadBgm(id).then(tb => {
      if (my !== token || !ctx || muted || !man || !man.bgm[id]) return;   // 기다리는 사이 다른 곡을 원하게 됨(또는 configure 로 목록이 바뀜)
      if (cur && cur.id === id && !cur.dying) return;
      let t = null;
      try {
        const d = man.bgm[id], now = ctx.currentTime, prev = cur;
        const inAt = now + (o.afterStinger && jingleEnd > now ? jingleEnd - now : 0) + (o.delay || 0);
        let off = (o.remember && mem[id] != null) ? mem[id] : 0;
        if (prev && !prev.dying && (d.sync === prev.id || prev.d.sync === id) && Math.abs(loopLen(prev.tb) - loopLen(tb)) < 0.05) {   // 짝이 되는 곡(같은 길이)이면 같은 박 위치에서 이어서
          off = tb.loopStart + ((trackPos(prev) - prev.tb.loopStart) % loopLen(tb) + loopLen(tb)) % loopLen(tb);
        }
        if (off >= tb.loopEnd - 0.1) off = tb.loopStart;
        if (prev) release(prev, fade, now);
        t = startTrack(id, tb, d, off, inAt, o.remember); cur = t;
        if (!fadeParam(t.g.gain, 0, t.peak, inAt, fade, 'in')) throw new Error('페이드인을 걸지 못했다');   // 못 걸면 g=0 인 채 '재생 중'으로 굳으므로 아래 catch 가 트랙을 치운다
        delete failed[id];
      } catch (err) {                                              // 시작 도중 예외: 예전엔 cur 만 채워진 채 소리 없는 '재생 중'(g=0)으로 굳어, 같은 장면을 다시 불러도 다시 시도하지 못했다 → 반쯤 만든 트랙을 치워 cur 를 비운다(다음 scene() 이 다시 시도 · 경고는 id 당 한 번)
        if (t) { try { t.src.stop(); } catch (e2) {} try { t.src.disconnect(); t.g.disconnect(); } catch (e3) {} if (cur === t) cur = null; }
        report('bgm', id, err);
      }
    }, () => { if (my === token) applyScene(); });                 // 파일을 못 받음(loadBgm 이 이미 후보에서 뺐다) → 사슬의 다음 곡으로, 없으면 이전 장면 곡을 끌고 가지 않고 조용히
  }
  function stopBgm(fade) { want = null; bgm(null, { fade: fade != null ? fade : 1 }); }

  // ═════════ 장면 지휘자: 게임 상황 → 곡 ═════════
  // 곡이 없으면 사슬의 다음 곡으로, 사슬이 다 비면 조용히. 홈과 나머지 로비 탭은 서로 다른 곡(홈은 뒤에서 자동 전투 연출이 돌아간다)
  const BAND = (s) => s >= 5 ? ['bgm_battle_c', 'bgm_battle_b', 'bgm_battle_a'] : s >= 3 ? ['bgm_battle_b', 'bgm_battle_a'] : ['bgm_battle_a'];
  function chainFor(name, c) {
    switch (name) {
      case 'title': return ['bgm_title'];
      case 'home': return ['bgm_home', 'bgm_menu'];
      case 'menu': return ['bgm_menu', 'bgm_home'];
      case 'map': return ['bgm_map', 'bgm_menu', 'bgm_home'];
      case 'battle': return (c.endless ? ['bgm_endless'] : []).concat(BAND(c.stage | 0));
      case 'boss': return ['bgm_boss_' + c.boss, 'bgm_boss'].concat(c.endless ? ['bgm_endless'] : [], BAND(c.stage | 0));
      case 'result': return ['bgm_result'];
      default: return [];
    }
  }
  // fade = 크로스페이드 길이(초) · remember = 곡을 떠날 때 위치를 기억해 돌아오면 이어서 · afterStinger = 징글이 끝난 뒤에 시작
  const POLICY = { title: { fade: 1.0 }, home: { fade: 1.2, remember: true }, menu: { fade: 1.2, remember: true }, map: { fade: 1.0, remember: true }, battle: { fade: 0.8 }, boss: { fade: 0.5 }, result: { fade: 1.0, afterStinger: true } };
  function scene(name, c) {                                        // 예: scene('home') · scene('battle', { stage: 3, endless: false }) · scene('boss', { stage: 5, boss: 'titan' })
    want = { name, c: c || {} };
    if (name === 'map' && man && c && c.stage) prefetchBgm(chainFor('battle', c).slice(0, 1).concat(chainFor('boss', c).slice(0, 2)));   // 곧 갈 전투·보스 곡 파일을 미리
    applyScene();
  }
  function applyScene() {
    if (!want || !man) return;
    const chain = chainFor(want.name, want.c), pol = POLICY[want.name] || {};
    let id = null; for (const k of chain) if (bgmOk(k)) { id = k; break; }
    bgm(id, pol);
  }

  // ═════════ 음소거 · 음량 · 배속 ═════════
  function syncIcons() {   // 음소거 버튼: ic_sound / ic_mute 이미지(content.js 의 uiIcon 이 로드된 뒤부터), 없으면 이모지
    document.querySelectorAll('.mute-icon').forEach(el => {
      const fb = muted ? '🔇' : '🔊';
      if (typeof uiIcon === 'function') el.innerHTML = uiIcon(muted ? 'ic_mute' : 'ic_sound', fb, 'width:1.15em;height:1.15em'); else el.textContent = fb;
    });
  }
  function setMuted(m) {
    muted = !!m; try { localStorage.setItem('pongtress_muted', muted ? '1' : '0'); } catch (e) {}
    if (master) master.gain.value = muted ? 0 : MASTER;
    if (muted) { token++; if (cur && ctx) { cur.remember = true; release(cur, 0.05); } }                // 꺼 둔 동안은 곡을 멈춘다(배터리) — 위치는 기억
    else { if (gestured) resume(); applyScene(); }                                                      // 켜면 지금 장면의 곡을 다시
    syncIcons();
  }
  function toggle() { gestured = true; ensure(); resume(); setMuted(!muted); }
  function setVolume(which, v) {                                   // which: 'bgm'(음악·징글) | 'sfx'(효과음·UI) — 0~1, 기기에 기억
    if (!(which in vol)) return; vol[which] = Math.max(0, Math.min(1, +v || 0));
    try { localStorage.setItem('pongtress_vol_' + which, String(vol[which])); } catch (e) {}
    applyVolumes();
  }
  const getVolume = (which) => vol[which];
  function setSpeed(x) { speed = Math.max(1, Math.min(3, +x || 1)); }   // 전투 배속 — 같은 소리의 최소 간격을 배속에 비례해 늘려 소리가 몰리지 않게

  // ═════════ 설정 바꾸기 · 점검 ═════════
  function configure(o) {                                          // 개발용: configure({ base: '../tools/audio-test-assets/' }) — 목록·캐시를 비우고 새로 받는다
    o = o || {};
    if (o.base) { const b = cleanBase(o.base); if (b) cfg.base = b; }
    token++; if (cur && ctx) release(cur, 0.05);                   // token++ = 받는 중이던 곡도 무효(목록이 바뀐다)
    raw.clear(); sfxBufs.clear(); jingleBufs.clear(); loadingSfx.clear(); bgmCache.clear(); Object.keys(failedAt).forEach(k => delete failedAt[k]); Object.keys(failed).forEach(k => delete failed[k]); Object.keys(mem).forEach(k => delete mem[k]);
    return loadManifest();                                         // 세대 번호(manSeq)가 올라가므로 아직 받는 중이던 옛 세대의 결과는 위 캐시들에 들어오지 못한다
  }
  function state() {
    let total = 0; bgmCache.forEach(e => { total += e.bytes; });
    return {
      ctx: ctx ? ctx.state : 'none', time: ctx ? +ctx.currentTime.toFixed(2) : 0, gestured, unlocked, muted, fmt, base: cfg.base, speed, vol: Object.assign({}, vol),
      manifest: man ? { sfx: Object.keys(man.sfx).length, jingle: Object.keys(man.jingle).length, bgm: Object.keys(man.bgm).length } : null,
      scene: want ? want.name : null, wantId,
      bgm: cur ? { id: cur.id, pos: +trackPos(cur).toFixed(2), gain: +cur.g.gain.value.toFixed(3), loop: [+cur.tb.loopStart.toFixed(2), +cur.tb.loopEnd.toFixed(2)] } : null,
      dying: [...dying].map(t => ({ id: t.id, gain: +t.g.gain.value.toFixed(3) })),   // 페이드아웃 중인 옛 곡들(정리가 끝나면 사라진다)
      ducks: Object.assign({}, ducks), duck: duckNode ? +duckNode.gain.value.toFixed(3) : 1,
      cache: { bgm: [...bgmCache.entries()].map(([k, e]) => k + ':' + (e.bytes / 1048576).toFixed(1) + 'MB'), bgmMB: +(total / 1048576).toFixed(1), sfx: sfxBufs.size, jingle: jingleBufs.size, raw: raw.size },
      failed: Object.keys(failed),                                 // 받기·디코딩에 실패한 음원 id(이유는 console.warn 에 한 번 남는다) — 성공하면 빠진다
      voices: live_.length
    };
  }

  // ═════════ 시작 ═════════ (위의 const 들이 모두 초기화된 뒤여야 한다 — resume() → ensure() → applyDuck 이 ducks 를 읽는다)
  arm();
  try { if (navigator.userActivation && navigator.userActivation.hasBeenActive) resume(); } catch (e) {}   // 이미 입력한 적이 있는 페이지(설치형 앱 등)는 바로
  loadManifest();

  // 공개 함수는 전부 try/catch 로 감싼다 — 소리 쪽 오류가 게임 루프·클릭 처리(전투 중 수백 번 부른다)를 끊지 않게. 던지면 console.warn 하고 기본값을 돌려 준다
  const G = (fn, ret) => function () { try { return fn.apply(null, arguments); } catch (e) { try { console.warn('[audio] ' + fn.name, e); } catch (_) {} return ret; } };
  return { play: G(play, null), stinger: G(stinger, 0), resume: G(resume), toggle: G(toggle), setMuted: G(setMuted), syncIcons: G(syncIcons), get muted() { return muted; },
    scene: G(scene), bgm: G(bgm), stopBgm: G(stopBgm), duck: G(duck), unduck: G(unduck), setVolume: G(setVolume), getVolume, setSpeed: G(setSpeed),
    preload: G(preload, Promise.resolve()), has: G(has, false), configure: G(configure, Promise.resolve(null)), state: G(state, null),
    get ready() { return manP; }, ALIAS, DEFS, chainFor };
})();
