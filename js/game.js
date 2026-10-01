'use strict';
/* PONGTRESS 프로토타입 0.2 — 전투 코어 슬라이스
 * content.js(CFG·ROSTER·ENEMIES·BOSSES·COMBATS·REWARDS·expToNext) 이후 로드.
 * 한 턴 = 장전 phase(플런저로 볼을 쏘아 배수 페그로 불리고 9칸 골 포켓에 떨어뜨려 캐릭터 탄환 충전)
 *        → 전투 phase(충전된 캐릭터가 맨 앞 적 자동 공격, EXP·레벨업·보상, 적 전진).
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const boot = (m) => { const b = $('boot-error'); if (b) { b.hidden = false; b.textContent = 'ERROR: ' + m; } };
  window.addEventListener('error', (e) => boot(e.message + ' @' + (e.lineno || '?')));

  // 빌드 표시(캐시 진단용): 로드된 game.js 의 ?v= 를 좌하단·타이틀에 표기
  let BUILD = '?';
  (function () {
    const s = [...document.scripts].find(x => /game\.js/.test(x.src));
    BUILD = s ? ((s.src.match(/v=(\d+)/) || [])[1] || '?') : '?';
    const tag = document.getElementById('build-tag'); if (tag) tag.textContent = 'build ' + BUILD;
  })();

  const canvas = $('stage'); const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1;

  // ── 전역 상태 ──
  let S = null;          // 런/전투 상태
  let anim = { floats: [], flashes: [], shots: [], skillCuts: [], cut: null, fx: [], shake: 0, ghosts: [] };
  const CUT_DUR = 0.95;   // 스킬 컷인 연출 길이(초)
  let aimActive = false, aimX = 0, aimY = 0;
  let lastTs = 0, loopStarted = false;   // 루프는 1회만 시작(런마다 rAF 중복 등록 → 속도 배가 버그 방지)

  // ============ 화면 전환 ============
  function show(name) {
    for (const s of ['title', 'lobby', 'combat']) $(s).hidden = (s !== name);
  }

  // ============ 레이아웃(phase별 영역 비율) ============
  // 위→아래: 적 필드 / 방벽(캐릭터) / 골 포켓(방벽 바로 아래) / 핀볼 필드(하단 중앙에서 위로 발사)
  // 장전(0) ↔ 전투(1) 영역 비율. 전투에선 핀볼(goal·pins)이 거의 0 → 페이드로 사라짐
  const LOAD_FRAC = { field: .15, wall: .13, goal: .13, pins: .59 };   // 골칸 영역 확대(캐릭터 이름 라벨 공간)
  const BATTLE_FRAC = { field: .72, wall: .24, goal: .02, pins: .02 };
  const SIDE_FR = 0.17;   // 우측 스킬 사이드바 폭(보드/포켓 영역 기준) — 좁혀서 보드를 넓힘
  const lerp = (a, b, t) => a + (b - a) * t;
  function layout() {
    const t = S ? (S.layoutT || 0) : 0;
    const f = {
      field: lerp(LOAD_FRAC.field, BATTLE_FRAC.field, t),
      wall: lerp(LOAD_FRAC.wall, BATTLE_FRAC.wall, t),
      goal: lerp(LOAD_FRAC.goal, BATTLE_FRAC.goal, t),
      pins: lerp(LOAD_FRAC.pins, BATTLE_FRAC.pins, t)
    };
    let y = 0; const r = {};
    const boardW = W * (1 - SIDE_FR);   // 포켓·핀볼판은 우측 사이드바 폭만큼 좁힘(스킬 버튼 공간)
    r.field = { x: 0, y, w: W, h: H * f.field }; y += r.field.h;   // 적 필드=풀폭
    r.wall = { x: 0, y, w: W, h: H * f.wall }; y += r.wall.h;      // 캐릭터·방벽=풀폭(우측 빈공간 없음)
    r.goal = { x: 0, y, w: boardW, h: H * f.goal }; y += r.goal.h;  // 포켓=보드폭(우측=자동버튼)
    r.pins = { x: 0, y, w: boardW, h: H * f.pins };
    return r;
  }
  // 발사대 위치(핀볼 영역 하단 중앙, 바닥에서 살짝 띄워 바닥 뱅크샷 여지를 둠)
  function launcher() { const p = layout().pins; return { x: p.x + p.w / 2, y: p.y + p.h - Math.max(CFG.ballRadius + 4, p.h * 0.12) }; }

  function resize() {
    // ⚠ #app이 transform:scale 되므로 온스크린 px(getBoundingClientRect) 대신 디자인 px(clientWidth)로 측정 — 이중 스케일 방지
    const el = $('stage-wrap');
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(240, el.clientWidth || 360);
    H = Math.max(360, el.clientHeight || 640);
    canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ============ 런 시작 ============
  function startRun(opts) {
    opts = opts || (Meta.runOptions ? Meta.runOptions() : {});
    const mode = opts.mode || 'normal';
    const party = Meta.partySlots();                // [id|null ×3] — 편성
    const stage = opts.stage || Meta.stage(), scale = stageScale(stage);   // 스테이지 난이도 배수
    const wallMax = party.reduce((s, id) => s + (id ? Meta.leveledDef(id).hp : 0), 0);
    S = {
      mode, stage, scale, seedBase: opts.seed || 0, loop: 0,
      combatIndex: 0, nodeIdx: 0, level: 1, exp: 0, expNext: expToNext(1),
      atkBonus: 0, bonusBalls: 0, party, gold: 0, turnAtk: 0, pocketBonus: [0, 0, 0], buffBonus: 0,
      runKills: 0, floorsCleared: 0, runMaxCombo: 0,
      wallBase: wallMax, wallHpMax: wallMax, wallHp: wallMax,
      relics: {}, setsOn: {}, rewardQueue: [], guardUsed: false, nextBoardFx: [],
      map: null, mapPos: { f: -1, i: -1 },
      // 아래는 전투마다 초기화
      phase: 'map', layoutT: 0, layoutTarget: 0, chars: [], pegs: [], pockets: [], balls: [], obstacles: [],
      enemies: [], waves: [], waveIdx: 0, launchesLeft: 0, passiveBalls: 0,
      shotQueue: [], battleTimer: 0, pendingRewards: 0, autoSkill: false, autoLoad: false,
      combat: null, over: false
    };
    CharArt.preload(party.filter(Boolean), ['sheet', 'thumb', 'cg']);   // 편성 3인 시트·컷인 CG는 지도 화면을 보는 동안 받아 둔다
    show('combat'); resize();
    S.map = genMap(); showMap();
    if (!loopStarted) { loopStarted = true; requestAnimationFrame(loop); }
  }

  const roster = (id) => ROSTER.find(c => c.id === id);

  // 페그 종류 가중치 추첨
  const PEG_KEYS = Object.keys(PEG_TYPES);
  const PEG_WEIGHT_TOTAL = PEG_KEYS.reduce((s, k) => s + PEG_TYPES[k].weight, 0);
  function pickPegType() {
    let r = Math.random() * PEG_WEIGHT_TOTAL;
    for (const k of PEG_KEYS) { r -= PEG_TYPES[k].weight; if (r <= 0) return k; }
    return 'normal';
  }
  // 이번 턴 캐릭터 발당 피해(런 버프 + 이번 턴 공격 페그 버프 포함)
  function charDmg(c) { return c.ref.atk + S.atkBonus + (S.turnAtk || 0); }

  // ============ 전투 시작 ============
  function startCombat(combat, floor, nodeIdx) {
    S.combatIndex = floor || 0; S.nodeIdx = nodeIdx || 0;
    S.combat = combat; S.over = false; S.bossDown = false;
    S.chainAdded = 0; S.focusId = null; S.focusStack = 0; S.bossIntent = null;
    S.jack = { x: 0.5, v: JACKPOT_SPEED / 9 };     // 움직이는 잭팟 포켓(골 영역 폭 비율)
    $('map').hidden = true; $('run-modal').hidden = true;
    // 캐릭터(레인 배치): 편성 슬롯 순서 = 레인 0,1,2. 빈 슬롯은 캐릭터 없음. 레벨/성급 반영.
    S.chars = [];
    S.party.forEach((id, lane) => { if (id) S.chars.push({ ref: Meta.leveledDef(id), lane, ammo: 0, gauge: 0, armed: false, anim: CharAnim.create(id) }); });
    S.passiveBalls = 0;
    S.balls = []; S.shotQueue = []; anim.floats = []; anim.flashes = []; anim.shots = []; anim.skillCuts = []; anim.cut = null; anim.fx = []; anim.shake = 0; anim.ghosts = [];
    buildBoard();
    // 패시브(보드 효과) 적용 — 페그 추가 위치도 고정되도록 시드 난수로(버프판 재현성)
    { const _r = Math.random; Math.random = makeRng(boardSeed() + 31);
      try { for (const c of S.chars) applyPassive(c.ref.passive); } finally { Math.random = _r; } }
    // 적/웨이브
    S.enemies = [];
    if (combat.boss) { spawnBoss(); S.waves = []; }
    else {
      S.waves = combat.waves.slice(); spawnWave();
      if (combat.elite && S.enemies.length) {            // 정예 적: 첫 웨이브 맨 앞 중앙 1기를 강화
        const e = S.enemies.slice().sort((a, b) => (a.row - b.row) || (Math.abs(a.lane - 2.5) - Math.abs(b.lane - 2.5)))[0];
        e.elite = true; e.name = '정예 ' + e.name; e.hp = e.maxHp = Math.round(e.maxHp * ELITE.hpMul);
        e.dmg = Math.round(e.dmg * ELITE.dmgMul); e.exp = Math.round(e.exp * ELITE.expMul);
      }
    }
    S.waveIdx = 0;
    $('c-name').textContent = runLabel() + ' · ' + combat.name;
    enterLoad();
    syncHud();
  }
  function runLabel() { return (S.mode === 'endless' ? '무한 ' + (S.loop + 1) + '막' : S.mode === 'daily' ? '일일' : 'S' + S.stage) + ' · ' + (S.combatIndex + 1) + '층'; }

  // 판 시드: 스테이지·층·노드(+일일 도전 시드·무한 막) 고정 → 같은 노드는 항상 같은 판(밸런스 재현성)
  function boardSeed() { return ((S.seedBase || 0) + (S.stage || 1) * 100003 + (S.combatIndex + 1) * 619 + (S.nodeIdx || 0) * 37 + (S.loop || 0) * 7919) >>> 0; }
  // 시드 난수(mulberry32) — 스테이지·전투별 고정 페그판을 재현 가능하게
  function makeRng(seed) {
    let t = (seed >>> 0) || 1;
    return () => { t = (t + 0x6D2B79F5) >>> 0; let x = Math.imul(t ^ (t >>> 15), 1 | t); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) >>> 0; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  }

  // ============ 페그 배치 패턴(선/그림) ============
  // 경로(꼭짓점 목록)를 일정 간격(step)으로 채워 점 배열 반환
  function alongPath(verts, closed, step) {
    const pts = [], segs = closed ? verts.length : verts.length - 1;
    for (let s = 0; s < segs; s++) {
      const a = verts[s], b = verts[(s + 1) % verts.length];
      const dx = b.fx - a.fx, dy = b.fy - a.fy, len = Math.hypot(dx, dy), n = Math.max(1, Math.round(len / step));
      for (let i = 0; i < n; i++) pts.push({ fx: a.fx + dx * i / n, fy: a.fy + dy * i / n });
    }
    return pts;
  }
  function ellipsePts(cx, cy, rx, ry, n) { const pts = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; pts.push({ fx: cx + Math.cos(a) * rx, fy: cy + Math.sin(a) * ry }); } return pts; }
  // 너무 가까운 점 제거(겹침 방지). asp=영역 높이/너비(px)로 세로 비율 보정
  function dedupePts(pts, asp, minGap) {
    const out = [], g2 = minGap * minGap;
    for (const p of pts) { let ok = true; for (const q of out) { const dx = p.fx - q.fx, dy = (p.fy - q.fy) * asp; if (dx * dx + dy * dy < g2) { ok = false; break; } } if (ok) out.push(p); }
    return out;
  }

  // 점이 다각형 내부인지(레이 캐스팅)
  function pointInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  // 도형 실루엣을 격자로 채움. insideFn(u,v): u,v ∈ [-1,1] 중심좌표(빈 공간 최소화)
  function fillShape(insideFn) {
    const pts = [], nx = 24, ny = 30, hw = 0.42, hh = 0.39, cx = 0.5, cy = 0.47;
    for (let iy = 0; iy <= ny; iy++) for (let ix = 0; ix <= nx; ix++) {
      const off = (iy % 2) ? (1 / nx) : 0;                       // 엇갈림 배치
      const u = ((ix / nx) + off) * 2 - 1, v = (iy / ny) * 2 - 1;
      if (u >= -1 && u <= 1 && insideFn(u, v)) pts.push({ fx: cx + u * hw, fy: cy + v * hh });
    }
    return pts;
  }

  // 패턴 라이브러리. asp로 둥근 도형을 화면상 둥글게 보정, cx/cy 중심
  function pegPatterns(asp, step) {
    const cx = 0.5, cy = 0.47;
    const ax = (rr) => Math.min(0.42, rr * asp);   // x반경(과도 확장 방지)
    // 좌우 레일: 중앙 집중형 그림 패턴에서도 양옆 레인(좌/우 캐릭터)이 장전할 수 있도록 가장자리 기둥 페그
    const rails = (rows = 8) => { const p = []; for (const fx of [0.10, 0.90]) for (let i = 0; i < rows; i++) p.push({ fx, fy: 0.11 + i * (0.74 / (rows - 1)) }); return p; };
    return {
      grid() {
        const pts = [], cols = CFG.pegCols, rows = CFG.pegRows;
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const off = (r % 2) ? 0.5 / cols : 0; pts.push({ fx: (c + 0.5) / cols + off, fy: 0.10 + r * (0.76 / (rows - 1)) }); }
        return pts;
      },
      chevrons() {   // ∨ 여러 줄(진폭 크게)
        const pts = [], rows = 8, per = 13;
        for (let r = 0; r < rows; r++) { const fy0 = 0.11 + r * (0.74 / (rows - 1)); for (let i = 0; i < per; i++) { const t = i / (per - 1), vv = Math.abs(t - 0.5) * 2; pts.push({ fx: 0.08 + t * 0.84, fy: fy0 + (0.5 - vv) * 0.06 }); } }
        return pts;
      },
      zigzag() {     // 톱니(삼각파) 여러 줄 — 행 간격·진폭 크게 해서 모양이 보이게
        let pts = []; const rows = 6, seg = 5;
        for (let r = 0; r < rows; r++) { const fy = 0.13 + r * (0.68 / (rows - 1)), verts = []; for (let i = 0; i <= seg; i++) { const t = i / seg, up = (i % 2 === 0) ? -1 : 1; verts.push({ fx: 0.09 + t * 0.82, fy: fy + up * 0.05 }); } pts = pts.concat(alongPath(verts, false, step)); }
        return pts;
      },
      diamonds() {   // 동심 다이아(촘촘) + 좌우 레일(중앙 반경 축소로 레일 공간 확보)
        let pts = [];
        for (const rr of [0.09, 0.17, 0.25, 0.33]) { const rx = ax(rr); pts = pts.concat(alongPath([{ fx: cx, fy: cy - rr }, { fx: cx + rx, fy: cy }, { fx: cx, fy: cy + rr }, { fx: cx - rx, fy: cy }], true, step)); }
        pts.push({ fx: cx, fy: cy });
        return pts.concat(rails());
      },
      rings() {      // 동심 원(촘촘) + 좌우 레일
        let pts = [];
        for (const rr of [0.09, 0.16, 0.23, 0.30]) pts = pts.concat(ellipsePts(cx, cy, ax(rr), rr, Math.max(8, Math.round(rr * 2 * Math.PI / step))));
        pts.push({ fx: cx, fy: cy });
        return pts.concat(rails());
      },
      heart() {      // 채운 하트 실루엣 + 좌우 레일
        return fillShape((u, v) => { const x = u * 1.15, y = -v * 1.15 + 0.15; const a = x * x + y * y - 1; return a * a * a - x * x * y * y * y < 0; }).concat(rails());
      },
      star() {       // 채운 5각 별 실루엣 + 좌우 레일
        const verts = [];
        for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = (k % 2) ? 0.45 : 1.0; verts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
        return fillShape((u, v) => pointInPoly(u, v, verts)).concat(rails());
      },
      cross() {      // X + 테두리
        let pts = [];
        pts = pts.concat(alongPath([{ fx: 0.13, fy: 0.12 }, { fx: 0.87, fy: 0.86 }], false, step));
        pts = pts.concat(alongPath([{ fx: 0.87, fy: 0.12 }, { fx: 0.13, fy: 0.86 }], false, step));
        pts = pts.concat(alongPath([{ fx: 0.13, fy: 0.12 }, { fx: 0.87, fy: 0.12 }, { fx: 0.87, fy: 0.86 }, { fx: 0.13, fy: 0.86 }], true, step));
        return pts;
      }
    };
  }

  let forcedPattern = null;   // 디버그: 특정 패턴 고정
  // 이번 판의 페그 좌표: 패턴 하나를 골라 생성 → 경계 클램프 → 겹침 제거
  // ⚠ 항상 '장전' 영역 비율로 생성(전투 시작 시 layoutT=1이면 핀볼 영역이 납작해 dedupe가 판을 뭉갬 — 전투2+ 페그 급감 버그)
  function pegLayout() {
    const asp = ((H * LOAD_FRAC.pins) / W) || 1.3, step = CFG.pegStep;
    const P = pegPatterns(asp, step), keys = Object.keys(P);
    let key;
    if (forcedPattern && P[forcedPattern]) key = forcedPattern;   // 디버그: 강제 패턴
    else {
      const board = STAGE_BOARDS[S.stage] || STAGE_BOARDS[1];     // 스테이지·층·노드별 고정 판(보스=마지막 판)
      const bi = (S.combat && S.combat.boss) ? board.length - 1 : (S.combatIndex + (S.nodeIdx || 0) + (S.loop || 0)) % (board.length - 1);
      key = board[bi];
      if (!P[key]) key = keys[0];
    }
    S._layoutName = key;
    let pts = P[key]().filter(p => p.fx > 0.06 && p.fx < 0.94 && p.fy > 0.08 && p.fy < 0.87);
    // 페그를 상단 ~72%로 압축 → 하단에 발사 부채꼴 공간 확보(발사대와 밀착 방지)
    for (const p of pts) p.fy = 0.05 + p.fy * 0.74;
    return dedupePts(pts, asp, CFG.pegMinGap);
  }

  // ============ 보드(페그·포켓) 생성 ============
  function buildBoard() {
    S.pegs = [];
    // 페그 종류·크기·모양도 스테이지·전투별로 고정(시드 난수) → 같은 스테이지는 항상 동일한 판
    const seed = boardSeed();
    const _rand = Math.random; Math.random = makeRng(seed);
    try { for (const pt of pegLayout()) S.pegs.push(makePeg(pt.fx, pt.fy, pickPegType())); }
    finally { Math.random = _rand; }
    // 스테이지별 고정 장애물(범퍼/기둥) — 실제 핀볼판처럼
    S.obstacles = ((typeof STAGE_OBST !== 'undefined' && (STAGE_OBST[S.stage] || STAGE_OBST[1])) || []).map(o => Object.assign({}, o));
    // 장애물과 겹치는 페그 제거(겹침 방지) — px 공간에서 판정
    if (S.obstacles.length) {
      const rp = layout().pins, mg = CFG.ballRadius + 3;
      S.pegs = S.pegs.filter(p => {
        const px = p.fx * rp.w, py = p.fy * rp.h, pr = (p.pr || CFG.pegRadius);
        for (const o of S.obstacles) {
          if (o.t === 'bar') {
            const ox = o.fx * rp.w, oy = o.fy * rp.h, ow = o.fw * rp.w, oh = o.fh * rp.h;
            const cx = Math.max(ox, Math.min(px, ox + ow)), cy = Math.max(oy, Math.min(py, oy + oh));
            if ((px - cx) ** 2 + (py - cy) ** 2 < (pr + mg) ** 2) return false;
          } else {
            const ox = o.fx * rp.w, oy = o.fy * rp.h, rr = o.r * rp.w + pr + mg;
            if ((px - ox) ** 2 + (py - oy) ** 2 < rr * rr) return false;
          }
        }
        return true;
      });
    }
    // 포켓 9칸: 레인별 3칸, 캐릭터 gol 만큼 충전
    S.pockets = [];
    for (let i = 0; i < 9; i++) {
      const lane = Math.floor(i / 3), sub = i % 3;
      const c = S.chars.find(ch => ch.lane === lane);
      const golN = c ? Math.min(3, c.ref.gol + ((S.pocketBonus && S.pocketBonus[lane]) || 0)) : 0;   // 보상으로 연 골칸은 다음 전투에도 유지
      const type = (c && sub < golN) ? 'charge' : 'blank';
      S.pockets.push({ lane, type });
    }
    // 버프 칸(보상): 꽝칸 일부를 버프(방벽 회복) 칸으로
    let bb = S.buffBonus || 0;
    for (const p of S.pockets) { if (bb <= 0) break; if (p.type === 'blank') { p.type = 'buff'; bb--; } }
  }

  function applyPassive(p) {
    if (!p) return;
    if (p.kind === 'addBall') S.passiveBalls += p.n;
    else if (p.kind === 'addPeg') addPegToBoard(S, p.peg, p.n);
    else if (p.kind === 'closeBlank') { for (let i = 0; i < p.n; i++) openBlankTemp(S); }
  }

  // ============ 장전 phase ============
  function enterLoad() {
    S.phase = 'load';
    S.layoutTarget = 0;                             // 핀볼 화면으로 부드럽게 복귀
    S.turnAtk = 0;                                  // 공격 페그 버프는 이번 턴 한정
    for (const c of S.chars) { c.ammo = 0; c.armed = false; CharAnim.toIdle(c.anim); }   // 정면 대기로 복귀(뒷모습이었다면 돌아선다)
    for (const p of S.pegs) p.alive = true;   // 특수·일반 페그 턴마다 부활
    S.launchesLeft = CFG.launchesPerTurn + S.bonusBalls + S.passiveBalls;
    S.balls = []; S.launchedThisTurn = 0; S.turnMaxCombo = 0;
    const heal = rv('steel', 'heal');          // 재생 방벽: 매 턴 회복
    if (heal && S.wallHp < S.wallHpMax && S._turns) { S.wallHp = Math.min(S.wallHpMax, S.wallHp + heal); anim.floats.push({ x: W / 2, y: layout().wall.y + 14, text: '🧱+' + heal, color: '#5ce0a0', t: 1, ld: true }); }
    applyBoardEffects();                        // 스킬 흔적 + 적 간섭(이번 턴 판 변화)
    $('c-phase').textContent = '장전';
    const side = $('battle-side'); if (side) side.style.display = '';   // 장전 중 사이드바 표시
    renderSkills(); syncAutoBtns();
  }

  // 조준 방향: 위/아래 모두 허용(아래로 쏘면 바닥 벽에 튕겨 위로 감 = 뱅크샷). 거의 수평이면 최소 기울기만 준다.
  function aimDir(tx, ty) {
    const L = launcher();
    let dx = tx - L.x, dy = ty - L.y;
    const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    if (Math.abs(dy) < CFG.aimMinUp) {                       // 거의 수평 → 가까운 위/아래로 최소 기울기
      dy = (dy < 0 ? -1 : 1) * CFG.aimMinUp;
      dx = Math.sign(dx || 1) * Math.sqrt(Math.max(0, 1 - dy * dy));
    }
    return { dx, dy };
  }
  function launchBall(dir) {
    if (S.phase !== 'load' || S.launchesLeft <= 0 || S.over) return;
    const L = launcher();
    if (!dir) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.5; dir = { dx: Math.cos(a), dy: Math.sin(a) }; }  // sim용 랜덤 상향
    const first = !S.launchedThisTurn;         // 이번 턴 첫 발사(핀볼 세트·다중 발사)
    const n = first ? Math.max(1, rv('multishot', 'n') || 1) : 1, base = Math.atan2(dir.dy, dir.dx);
    for (let k = 0; k < n; k++) {               // 다중 발사: 중앙 + 좌우로 부채꼴
      const a = base + (k === 0 ? 0 : (k % 2 ? 1 : -1) * 0.13 * Math.ceil(k / 2));
      S.balls.push({ x: L.x, y: L.y, vx: Math.cos(a) * CFG.launchSpeed, vy: Math.sin(a) * CFG.launchSpeed, r: CFG.ballRadius, age: 0, combo: 0, nextBonus: COMBO_STEP, first });
    }
    S.launchedThisTurn = (S.launchedThisTurn || 0) + 1;
    S.launchesLeft--;
    Sound.play('launch');
  }

  // 조준 예측선: 실제 물리처럼 페그를 맞으면 튕기고 '통과'(맞은 페그는 이후 무시=제거된 것처럼)하며 상단까지 경로를 이어서 표시
  function simulateAim(dir) {
    const r = layout().pins, topY = r.y, botY = r.y + r.h, pegR = CFG.pegRadius, br = CFG.ballRadius;
    let x = launcher().x, y = launcher().y, vx = dir.dx * CFG.launchSpeed, vy = dir.dy * CFG.launchSpeed;
    const pts = [{ x, y }]; const dt = 1 / 120;
    const hit = new Set(); let nHit = 0;
    for (let i = 0; i < 1600; i++) {
      vy += CFG.gravity * dt; x += vx * dt; y += vy * dt;
      if (x < r.x + br) { x = r.x + br; vx = Math.abs(vx) * CFG.wallRestitution; pts.push({ x, y }); }
      if (x > r.x + r.w - br) { x = r.x + r.w - br; vx = -Math.abs(vx) * CFG.wallRestitution; pts.push({ x, y }); }
      if (y > botY - br) { y = botY - br; vy = -Math.abs(vy) * CFG.wallRestitution; pts.push({ x, y }); }  // 바닥 반사
      if (S.obstacles) for (const o of S.obstacles) {      // 고정 장애물 반사(예측선)
        if (o.t === 'bar') {
          const ox = r.x + o.fx * r.w, oy = r.y + o.fy * r.h, ow = o.fw * r.w, oh = o.fh * r.h;
          const cx = Math.max(ox, Math.min(x, ox + ow)), cy = Math.max(oy, Math.min(y, oy + oh)), dx = x - cx, dy = y - cy;
          if (dx * dx + dy * dy < br * br) {
            if (Math.abs(dx) > Math.abs(dy)) { vx = (dx < 0 ? -1 : 1) * Math.abs(vx); x = cx + (dx < 0 ? -1 : 1) * (br + 0.5); }
            else { vy = (dy < 0 ? -1 : 1) * Math.abs(vy); y = cy + (dy < 0 ? -1 : 1) * (br + 0.5); }
            pts.push({ x, y }); if (++nHit >= 3) return pts;
          }
        } else {
          const ox = r.x + o.fx * r.w, oy = r.y + o.fy * r.h, rr = o.r * r.w + br, dx = x - ox, dy = y - oy, d = Math.hypot(dx, dy);
          if (d > 0 && d < rr) { const nx = dx / d, ny = dy / d; x = ox + nx * rr; y = oy + ny * rr; const dot = vx * nx + vy * ny; vx -= 2 * dot * nx; vy -= 2 * dot * ny; if (o.t === 'bumper') { vx *= 1.25; vy *= 1.25; } pts.push({ x, y }); if (++nHit >= 3) return pts; }
        }
      }
      for (let pi = 0; pi < S.pegs.length; pi++) {
        const p = S.pegs[pi]; if (!p.alive || hit.has(pi)) continue;
        const px = r.x + p.fx * r.w, py = r.y + p.fy * r.h, pr = p.pr || pegR;
        const dx = x - px, dy = y - py, dist = Math.hypot(dx, dy), min = br + pr;
        if (dist < min) {                                   // 페그 반사 후 그 페그는 무시(제거된 것처럼 통과)
          const nx = dist ? dx / dist : 0, ny = dist ? dy / dist : -1;
          x += nx * (min - dist); y += ny * (min - dist);
          const vdot = vx * nx + vy * ny;
          vx -= (1 + CFG.restitution) * vdot * nx;
          vy -= (1 + CFG.restitution) * vdot * ny;
          pts.push({ x, y }); hit.add(pi); nHit++;
          if (nHit >= 3) return pts;                        // 딱 3회 튕김까지만
          break;
        }
      }
      if (y <= topY) { pts.push({ x, y }); return pts; }
      if (i % 2 === 0) pts.push({ x, y });
    }
    pts.push({ x, y }); return pts;
  }

  // 고정 장애물 충돌(범퍼=강한 반사, 기둥=반사, 바=사각 반사). 반환: 맞은 타입|false
  function hitObstacles(b, r) {
    for (const o of S.obstacles) {
      if (o.t === 'bar') {
        const ox = r.x + o.fx * r.w, oy = r.y + o.fy * r.h, ow = o.fw * r.w, oh = o.fh * r.h;
        const cx = Math.max(ox, Math.min(b.x, ox + ow)), cy = Math.max(oy, Math.min(b.y, oy + oh));
        const dx = b.x - cx, dy = b.y - cy;
        if (dx * dx + dy * dy < b.r * b.r) {
          if (Math.abs(dx) > Math.abs(dy)) { b.vx = (dx < 0 ? -1 : 1) * Math.abs(b.vx) * CFG.wallRestitution; b.x = cx + (dx < 0 ? -1 : 1) * (b.r + 0.5); }
          else { b.vy = (dy < 0 ? -1 : 1) * Math.abs(b.vy) * CFG.wallRestitution; b.y = cy + (dy < 0 ? -1 : 1) * (b.r + 0.5); }
          Sound.play('peg'); return 'bar';
        }
      } else {
        const ox = r.x + o.fx * r.w, oy = r.y + o.fy * r.h, rr = o.r * r.w + b.r;
        const dx = b.x - ox, dy = b.y - oy, d = Math.hypot(dx, dy);
        if (d > 0 && d < rr) {
          const nx = dx / d, ny = dy / d; b.x = ox + nx * rr; b.y = oy + ny * rr;
          const dot = b.vx * nx + b.vy * ny; b.vx -= 2 * dot * nx; b.vy -= 2 * dot * ny;
          const boost = (o.t === 'bumper') ? 1.25 : CFG.restitution;
          b.vx *= boost; b.vy *= boost;
          if (o.t === 'bumper') { o.flash = 1; anim.flashes.push({ x: ox, y: oy, t: 1, color: '#46e6d0' }); }
          Sound.play('peg'); return o.t;
        }
      }
    }
    return false;
  }

  function stepBalls(dt) {
    // 자동 전투: 장전 페이즈를 자동 진행(볼이 없을 때 잠깐 뒤 자동 발사)
    if (S.autoLoad && S.phase === 'load' && S.launchesLeft > 0 && S.balls.length === 0 && S.layoutT < 0.05) {
      S._autoT = (S._autoT || 0) + dt;
      if (S._autoT > 0.45) { S._autoT = 0; launchBall(); }
    } else S._autoT = 0;
    const r = layout().pins; const topY = r.y, botY = r.y + r.h;
    const pegR = CFG.pegRadius;
    if (S.jack) {                                // 잭팟 포켓: 골칸 위를 좌우 왕복
      const lo = 0.5 / 9, hi = 1 - 0.5 / 9;
      S.jack.x += S.jack.v * dt;
      if (S.jack.x > hi) { S.jack.x = hi; S.jack.v = -Math.abs(S.jack.v); }
      if (S.jack.x < lo) { S.jack.x = lo; S.jack.v = Math.abs(S.jack.v); }
    }
    for (let i = S.balls.length - 1; i >= 0; i--) {
      const b = S.balls[i];
      b.age = (b.age || 0) + dt;
      // 축(수직) 갇힘 방지: 오래 튕기는데 좌우 속도가 거의 0이면(정면 반사 무한루프)
      // 바깥쪽으로 살짝 밀어 축을 벗어나게 함 → 영구 장애물/범퍼페그 정면충돌 무한반사 해제
      if (b.age > 1.2 && Math.abs(b.vx) < 60) {
        b.vx += (b.x < r.x + r.w * 0.5 ? -1 : 1) * 340 * dt;   // 가까운 벽(바깥) 방향으로 이탈
      }
      // 소멸 금지: 오래된 볼은 상단으로 점점 강하게 유도(상단 포켓에 실제로 도달해 충전될 때까지 사라지지 않음)
      if (b.age > CFG.ballLifetime) {
        const over = b.age - CFG.ballLifetime;
        b.vy -= Math.min(2400, 400 + over * 800) * dt;   // 위로 가속(오래될수록 강하게)
      }
      const speed = Math.hypot(b.vx, b.vy);
      const sub = Math.min(8, 1 + Math.floor(speed * dt / pegR));
      const h = dt / sub;
      let gone = false;
      for (let s = 0; s < sub && !gone; s++) {
        b.vy += CFG.gravity * h;
        b.x += b.vx * h; b.y += b.vy * h;
        // 좌우 벽 반사
        if (b.x < r.x + b.r) { b.x = r.x + b.r; b.vx = Math.abs(b.vx) * CFG.wallRestitution; }
        if (b.x > r.x + r.w - b.r) { b.x = r.x + r.w - b.r; b.vx = -Math.abs(b.vx) * CFG.wallRestitution; }
        // 페그 충돌(결정적: 랜덤 없음). 수확 볼(변환된 볼)은 제외 → 연쇄 방지, 발사볼 경로의 페그만 변환.
        if (!b.harvest) for (const p of S.pegs) {
          if (!p.alive) continue;
          const px = r.x + p.fx * r.w, py = r.y + p.fy * r.h;
          const dx = b.x - px, dy = b.y - py, dist = Math.hypot(dx, dy), min = b.r + (p.pr || pegR);
          if (dist < min) {
            const nx = dist ? dx / dist : 0, ny = dist ? dy / dist : -1;
            b.x += nx * (min - dist); b.y += ny * (min - dist);
            const vdot = b.vx * nx + b.vy * ny;
            b.vx -= (1 + CFG.restitution) * vdot * nx;
            b.vy -= (1 + CFG.restitution) * vdot * ny;
            const def = PEG_TYPES[p.type] || PEG_TYPES.normal;
            anim.flashes.push({ x: px, y: py, t: 1, color: def.color });
            Sound.play('peg');
            applyPegHit(b, p, def, px, py);
            if (b.eaten) break;
          }
        }
        if (b.eaten) { S.balls.splice(i, 1); gone = true; break; }   // 오염 페그에 흡수됨
        // 고정 장애물(범퍼/기둥/바) 충돌 — 수확 볼 제외
        if (!b.harvest && S.obstacles && S.obstacles.length) {
          const ht = hitObstacles(b, r);
          if (ht) {
            if (ht === 'bumper' && rv('elastic', 'p') && (b.elastic || 0) < 3 && Math.random() < rv('elastic', 'p')) {   // 탄성 코어(볼당 최대 3 — 범퍼 파밍 방지)
              b.elastic = (b.elastic || 0) + 1; spawnBalls(b.x, b.y, 1, '#46e6d0', 1); anim.floats.push({ x: b.x, y: b.y - 12, text: '분열!', color: '#46e6d0', t: 0.8, ld: true });
            }
          }
        }
        // 바닥은 반사 벽(무중력이라 볼은 사라지지 않고 위로 되돌아감)
        if (b.y > botY - b.r) { b.y = botY - b.r; b.vy = -Math.abs(b.vy) * CFG.wallRestitution; }
        if (b.y <= topY) { landBall(b); S.balls.splice(i, 1); gone = true; }          // 상단 포켓 도달 → 충전
      }
    }
    if (S.phase === 'load' && S.launchesLeft <= 0 && S.balls.length === 0) enterBattle();
  }

  // 페그가 변환되어 생기는 "수확 볼": 상단으로 상승해 충전만 함(다른 페그와 상호작용 X → 연쇄 없음). 배수 페그는 n개.
  function spawnBalls(x, y, n, color, charge) {
    for (let k = 0; k < n && S.balls.length < CFG.maxBalls; k++) {
      const vx = (Math.random() - 0.5) * 200;                    // 약간의 좌우 퍼짐(여러 개가 다른 포켓으로)
      S.balls.push({ x, y, vx, vy: -CFG.launchSpeed * 0.92, r: CFG.ballRadius, age: 0, color, harvest: true, charge: charge || 1 });
    }
  }

  // 페그 충돌 처리(반사는 호출 전에 이미 적용됨). 페그는 볼로 변환되며 사라짐(볼이 지나갈 길이 뚫려 끼지 않음), 턴마다 부활.
  function applyPegHit(b, p, def, px, py) {
    if (b.harvest) return;                 // 수확 볼은 페그를 변환하지 않음(연쇄 방지)
    if (def.sludge) {                      // 오염: 발사볼을 삼킴(충전 없음) — 슬러지 간섭
      p.alive = false; b.eaten = true;
      anim.floats.push({ x: px, y: py - 10, text: '흡수!', color: def.color, t: 1, ld: true }); Sound.play('wall');
      return;
    }
    if (def.boost) {                       // 범퍼: 속도 킥(영구·안 사라짐) — 영구 반사체는 콤보 미집계(무한 파밍 방지)
      const sp = Math.hypot(b.vx, b.vy) || 1, target = CFG.launchSpeed * def.boost;
      b.vx = b.vx / sp * target; b.vy = b.vy / sp * target;
      anim.flashes.push({ x: px, y: py, t: 1, big: true, color: def.color });
      return;
    }
    if (def.scrap) return;                 // 파편: 반사만(변환·소멸 없음)
    addCombo(b, 1, px, py);                // 콤보 = 터뜨린(소모되는) 페그 수
    if (def.bomb) { explodeBomb(b, p, px, py, 0); return; }   // 폭탄: 주변 페그 연쇄 폭발
    convertPeg(p, def, px, py);
  }
  // 페그 → 충전볼 변환(일반1 · ×2→2 · ×5→5 · 골드 · 증폭). 모듈(자원 회수기·과충전) 반영. 페그는 턴마다 부활.
  function convertPeg(p, def, px, py) {
    let n = 1 + (def.split || 0), charge = def.charge || 1;
    if (def.gold) {
      const g = def.gold * (rv('midas', 'gmul') || 1);
      S.gold = (S.gold || 0) + g; n += rv('midas', 'balls') || 0;
      anim.floats.push({ x: px, y: py, text: '+' + g + '🪙', color: def.color, t: 1, ld: true });
    }
    if (def.charge > 1) {
      charge = rv('overcharge', 'charge') || def.charge;
      anim.floats.push({ x: px, y: py, text: '충전 ×' + charge, color: def.color, t: 1, ld: true });
    }
    spawnBalls(px, py, n, def.color, charge);
    p.alive = false;
  }
  // 폭탄 페그: 반경 안 페그를 전부 터뜨림(폭탄끼리 연쇄, 깊이 3 제한). 터진 수만큼 콤보 누적.
  function explodeBomb(b, bp, px, py, depth) {
    const r = layout().pins, R = (PEG_TYPES.bomb.bomb || 0.16) * r.w;
    bp.alive = false;
    anim.fx.push({ type: 'boom', x: px, y: py, t: 1, color: '#ff8a3a', sm: depth > 0 }); anim.shake = Math.max(anim.shake, 5); Sound.play('kill');
    let popped = 0;
    for (const p of S.pegs) {
      if (!p.alive || p === bp) continue;
      const def = PEG_TYPES[p.type] || PEG_TYPES.normal; if (def.scrap || def.sludge || def.boost) continue;
      const qx = r.x + p.fx * r.w, qy = r.y + p.fy * r.h; if (Math.hypot(qx - px, qy - py) > R) continue;
      if (def.bomb && depth < 3) explodeBomb(b, p, qx, qy, depth + 1);
      else convertPeg(p, def, qx, qy);
      popped++;
    }
    if (popped) { addCombo(b, popped, px, py); anim.floats.push({ x: px, y: py - 14, text: '💥 ' + popped + '연쇄!', color: '#ff8a3a', t: 1.1, big: true, ld: true }); }
  }
  // 콤보: 발사볼 1개가 연속으로 맞힌 페그·장애물 수. COMBO_STEP마다 보너스 충전볼(핀볼 세트: 첫 볼 ×2). 연쇄 반응 모듈.
  function addCombo(b, k, x, y) {
    if (!b || b.harvest) return;
    b.combo = (b.combo || 0) + k;
    S.turnMaxCombo = Math.max(S.turnMaxCombo || 0, b.combo); S.runMaxCombo = Math.max(S.runMaxCombo || 0, b.combo);
    while (b.combo >= (b.nextBonus || COMBO_STEP)) {
      const step = b.nextBonus || COMBO_STEP; b.nextBonus = step + COMBO_STEP;
      let ch = Math.min(COMBO_MAX, Math.floor(step / COMBO_STEP));
      if (b.first && S.setsOn.pinball) ch *= 2;
      spawnBalls(x, y, 1, '#ffd93b', ch);
      anim.floats.push({ x: x, y: y - 18, text: step + ' HIT! +' + ch, color: '#ffd93b', t: 1.2, big: true, ld: true });
      Sound.play('charge');
    }
    const every = rv('chain', 'every');         // 연쇄 반응: N콤보마다 증폭 페그 생성
    if (every && (S.chainAdded || 0) < 6 && Math.floor(b.combo / every) > Math.floor((b.combo - k) / every)) {
      const added = addPegToBoard(S, 'charge', 1);
      if (added.length) { S.chainAdded = (S.chainAdded || 0) + 1; added[0].alive = true; anim.floats.push({ x: x, y: y - 30, text: '⛓ 증폭 생성', color: '#7ef29a', t: 1, ld: true }); }
    }
  }

  function landBall(b) {
    const g = layout().goal;
    let idx = Math.floor(((b.x - g.x) / g.w) * 9);
    idx = Math.max(0, Math.min(8, idx));
    const pk = S.pockets[idx];
    const fx = (b.x - g.x) / g.w, jack = S.jack && Math.abs(fx - S.jack.x) < 0.5 / 9;   // 잭팟 포켓 위 착지
    const px = g.x + (idx + 0.5) * (g.w / 9);
    if (jack) { anim.fx.push({ type: 'ring', x: px, y: g.y + g.h * 0.6, t: 1, r: g.w / 9, color: '#ffd93b' }); anim.floats.push({ x: px, y: g.y - 6, text: 'JACKPOT ×' + JACKPOT_MUL, color: '#ffd93b', t: 1.2, big: true, ld: true }); }
    if (pk && pk.type === 'charge') {
      const c = S.chars.find(ch => ch.lane === pk.lane);
      let amt = (b.charge || 1) + (S.setsOn.harvest ? 1 : 0);                            // 보급 세트: +1
      const lp = rv('lucky', 'p'); if (lp && Math.random() < lp) { amt *= 3; anim.floats.push({ x: px, y: g.y - 22, text: '🍀 ×3', color: '#7ef29a', t: 1, ld: true }); }
      if (jack) amt *= JACKPOT_MUL;
      if (c) { c.ammo += amt; c.gauge += amt; CharAnim.reload(c.anim); renderSkills(); }   // 탄이 채워질 때마다 재장전 동작
      Sound.play('charge');
      anim.floats.push({ x: px, y: g.y + 10, text: '+' + amt, color: laneHex(pk.lane), t: 1, ld: true });
    } else if (pk && pk.type === 'buff') {
      const amt = (b.charge || 1) * 6 * (jack ? JACKPOT_MUL : 1);
      S.wallHp = Math.min(S.wallHpMax, S.wallHp + amt);
      Sound.play('charge');
      anim.floats.push({ x: px, y: g.y + 10, text: '+' + amt, color: '#6cf', t: 1, ld: true });
    } else if (jack) {                            // 꽝 칸이라도 잭팟이면 골드
      S.gold = (S.gold || 0) + 10; anim.floats.push({ x: px, y: g.y + 10, text: '+10🪙', color: '#ffd93b', t: 1, ld: true });
    }
  }

  // ============ 전투 phase ============
  function enterBattle() {
    S.phase = 'battle';
    S.layoutTarget = 1;                             // 전투 화면으로 부드럽게 확장(핀볼 페이드아웃)
    $('c-phase').textContent = '전투';
    const side = $('battle-side'); if (side) side.style.display = 'none';   // 전투 중 사이드바 숨김
    anim.skillCuts = []; anim.cut = null;
    // 액티브 스킬 발동(자동 또는 armed) 결정 → 샷 큐 구성
    S.shotQueue = [];
    for (const c of S.chars) {
      const sk = c.ref.active;
      const eligible = c.gauge >= sk.gauge;
      const use = eligible && (S.autoSkill || c.armed);
      if (use) {
        // 스킬은 여기서 바로 쓰지 않고 '그 캐릭터의 공격 차례 맨 앞'에 표식만 넣는다 → 차례가 오면 컷인 → 스킬 → 평타
        const manual = c.armed;                                 // 직접 켠 스킬 = 타이밍 보너스
        S.shotQueue.push({ skill: true, c, sk, mul: manual ? 1 + MANUAL_SKILL_BONUS : 1, label: sk.name + (manual ? ' · 집중!' : ''), color: (CLASS[c.ref.cls] || {}).color || '#ffcf5c' });
        c.gauge = 0;
      }
      c.armed = false;
      // 일반 공격: 탄환 수만큼
      for (let k = 0; k < c.ammo; k++) S.shotQueue.push({ lane: c.lane, dmg: charDmg(c) });
    }
    { let n = 0;   // 쏠 캐릭터는 적을 향해 돌아선다(뒷모습 조준) — 레인 순서대로 약간씩 시차를 둔다
      for (const c of S.chars) if (S.shotQueue.some(q => q.skill ? q.c === c : q.lane === c.lane)) CharAnim.toAim(c.anim, 0.07 * n++); }
    // 선제 포격: 전투 시작 시 모든 적에게 (총 탄약 × 배수) 피해
    const pm = rv('powder', 'mult');
    if (pm && S.enemies.length) {
      const ammo = S.chars.reduce((s, c) => s + c.ammo, 0), dmg = Math.round(ammo * pm);
      if (dmg > 0) { for (const e of S.enemies.slice()) hitEnemy(e, { dmg, fx: 'aoe', sub: true, powder: true }); anim.floats.push({ x: W / 2, y: layout().field.y + 30, text: '🛢 선제 포격 -' + dmg, color: '#ffb057', t: 1.3, big: true }); anim.shake = Math.max(anim.shake, 8); }
    }
    // 탄환이 많으면 볼리(한 번에 여러 발) + 간격 단축으로 전투 총 시간을 battleWindow 근처로 유지
    const q = S.shotQueue.reduce((s, x) => s + (x.skill ? (x.sk.kind === 'extraShots' ? x.sk.shots : x.sk.kind === 'aoe' ? (x.sk.shots || 3) : x.sk.kind === 'bigHit' ? 1 : 0) : 1), 0);   // 스킬 사격 수 추정 포함
    S.shotBurst = Math.max(1, Math.ceil(q / 80));   // 볼리 발사는 탄환이 아주 많을 때만(전투 늘어짐 방지)
    const volleys = Math.max(1, Math.ceil(q / S.shotBurst));
    S.shotDelay = Math.max(CFG.battleShotMinDelay, Math.min(CFG.battleShotDelay, Math.round(CFG.battleWindow / volleys)));
    S.battleTimer = 0;
    S.battleStage = 'intro';
    renderSkills();
  }

  function applyActive(c, sk, mul) {
    mul = mul || 1;
    if (sk.kind === 'bigHit') S.shotQueue.push({ lane: c.lane, dmg: Math.round(charDmg(c) * sk.mult * mul), big: true, fx: 'bigHit' });
    else if (sk.kind === 'extraShots') { for (let k = 0; k < sk.shots; k++) S.shotQueue.push({ lane: c.lane, dmg: Math.round(charDmg(c) * mul), fx: 'rapid' }); }
    else if (sk.kind === 'heal') {
      const amt = Math.round(sk.amount * mul);
      S.wallHp = Math.min(S.wallHpMax, S.wallHp + amt);
      const wr = layout().wall; anim.fx.push({ type: 'heal', x: wr.x + wr.w / 2, y: wr.y + wr.h * 0.6, w: wr.w, t: 1, color: '#6cf' });
      anim.floats.push({ x: W / 2, y: layout().wall.y + 12, text: '+' + amt, color: '#6cf', t: 1.2, big: true });
      Sound.play('charge');
    }
    else if (sk.kind === 'aoe') {   // 광역: 앞 N명 동시 타격(연쇄 폭발 모듈: 타격 수·피해 증가)
      const cnt = (sk.count || 4) + (rv('blast', 'count') || 0), m = (sk.mult || 1.3) * (rv('blast', 'mult') || 1) * mul;
      for (let k = 0; k < (sk.shots || 3); k++) S.shotQueue.push({ lane: c.lane, dmg: Math.round(charDmg(c) * m), aoe: cnt, big: true, fx: 'aoe' });
    }
    else if (sk.kind === 'stun') {
      frontmostN((sk.count || 3) + (mul > 1 ? 1 : 0)).forEach(e => { e.stun = (e.stun || 0) + (sk.turns || 1); const p = enemyPos(e); anim.fx.push({ type: 'shock', x: p.x, y: p.y, t: 1 }); anim.floats.push({ x: p.x, y: p.y - 16, text: '기절', color: '#8cf', t: 1.1 }); });
      anim.shake = Math.max(anim.shake, 5); Sound.play('wall');
    }
  }

  function frontmostEnemy() {
    let best = null;
    for (const e of S.enemies) { if (!best || e.row < best.row || (e.row === best.row && e.lane < best.lane)) best = e; }
    return best;
  }

  function stepBattle(dt) {
    if (S.battleStage === 'done') return;   // 전투 종료(보상 대기/전진 처리 중)엔 정지 → 보상 선택지 재추첨 방지
    // 컷인 진행(루프·헤드리스 sim 공통). 컷인은 해당 캐릭터의 공격 차례에 발동(아래 'skill' 큐 항목)
    if (anim.cut) { anim.cut.t += dt; if (anim.cut.t >= CUT_DUR) anim.cut = null; }
    S.battleTimer += dt * 1000;
    // 도입: 필드가 커진 걸 잠깐 보여준 뒤 공격 시작
    if (S.battleStage === 'intro') {
      if (S.battleTimer < CFG.battleStartDelay) return;
      S.battleTimer = 0; S.battleStage = 'shooting'; return;
    }
    // 마무리: 마지막 공격 후 잠깐 멈췄다 적 전진
    if (S.battleStage === 'outro') {
      if (S.battleTimer < CFG.battleEndDelay) return;
      S.battleStage = 'done'; endBattle(); return;
    }
    // 컷인 재생 중엔 공격 정지(그 캐릭터의 차례 시작 연출)
    if (anim.cut) return;
    // 캐릭터 차례 시작: 스킬을 쓰는 캐릭터면 컷인 → 스킬 효과(스킬 사격은 큐 맨 앞에 삽입) → 이어서 그 캐릭터의 평타
    const head = S.shotQueue[0];
    if (head && head.skill) {
      if (!head.cutStarted) {                                  // 1) 컷인 시작
        head.cutStarted = true;
        anim.cut = { id: head.c.ref.id, name: head.c.ref.name, skill: head.label, color: head.color, t: 0 };
        Sound.play('level'); S.battleTimer = 0; return;
      }
      S.shotQueue.shift();                                     // 2) 컷인 종료 → 스킬 발동
      const n0 = S.shotQueue.length;
      runSkill(head);
      const added = S.shotQueue.splice(n0);                    // applyActive가 끝에 붙인 스킬 사격을 앞으로 이동
      S.shotQueue.unshift.apply(S.shotQueue, added);
      S.battleTimer = 0; return;
    }
    // 공격 진행(탄환 수에 맞춰 자동 조절된 간격 + 볼리 발사로 늘어짐 방지)
    if (S.battleTimer < (S.shotDelay || CFG.battleShotDelay)) return;
    S.battleTimer = 0;
    for (let n = 0; n < (S.shotBurst || 1); n++) {
      if (S.shotQueue.length === 0) { toOutro(); return; }
      if (S.shotQueue[0].skill) break;                         // 다음 캐릭터 차례 → 다음 프레임에 컷인 처리
      const shot = S.shotQueue.shift();
      const e = frontmostEnemy();
      if (!e) {                                                // 적 전멸: 남은 회복 스킬은 적용, 나머지 스킬은 게이지 환급
        S.shotQueue.filter(q => q.skill).forEach(q => { if (q.sk.kind === 'heal') runSkill(q); else q.c.gauge = q.sk.gauge; });
        S.shotQueue = []; toOutro(); return;
      }
      fireShot(shot, e);
    }
  }
  // 마지막 공격 뒤: 캐릭터들이 다시 정면으로 돌아서며 잠깐 숨을 돌린 뒤 적이 전진한다
  function toOutro() { S.battleStage = 'outro'; S.battleTimer = 0; for (const c of S.chars) CharAnim.toIdle(c.anim); }

  // 스킬 실제 발동(컷인 종료 후): 효과 적용 + 다음 판에 흔적 남기기
  function runSkill(q) {
    applyActive(q.c, q.sk, q.mul);
    const sb = SKILL_BOARD[q.sk.kind]; if (sb) S.nextBoardFx.push(Object.assign({ who: q.c.ref.name }, sb));
  }
  function fireShot(shot, e) {
    const c = S.chars.find(ch => ch.lane === shot.lane);
    const targets = shot.aoe ? frontmostN(shot.aoe) : [e];
    let beam = null, cx = 0, cy = 0;
    for (const t of targets) { const p = enemyPos(t); if (!beam) beam = p; cx += p.x; cy += p.y; hitEnemy(t, shot); }
    cx /= targets.length; cy /= targets.length;
    // 발사 동작: 목표가 있는 쪽으로 몸을 돌리고(좌우 반전) f1~f3 재생 → 포탄은 발사 프레임(f1)의 총구에서 나간다
    let mz = null, spot = null;
    if (c && beam) { spot = charSpot(c); CharAnim.fire(c.anim, beam.x < spot.x - 14 ? -1 : beam.x > spot.x + 14 ? 1 : 0); mz = CharAnim.muzzle(c.anim, spot.x, spot.feetY, spot.size, 1); }
    if (beam) {
      const from = mz || { x: beam.x, y: layout().wall.y + layout().wall.h };
      // 스킬 종류별 빔 색/굵기
      let col = (c && CLASS[c.ref.cls]) ? CLASS[c.ref.cls].color : (shot.big ? '#ffcf5c' : '#bff0ff');
      if (shot.fx === 'bigHit') col = '#ff8a3a';
      else if (shot.fx === 'aoe') col = '#ffb057';
      else if (shot.fx === 'rapid') col = '#bff0ff';
      anim.shots.push({ sx: from.x, sy: from.y, ex: beam.x, ey: beam.y, t: 0, color: col, big: shot.big || shot.fx === 'bigHit', flash: true, thick: shot.fx === 'bigHit' ? 3 : 1, mang: mz ? mz.ang : null, msz: spot ? spot.size : 0 });
      if (shot.fx === 'aoe') anim.fx.push({ type: 'ring', x: cx, y: cy, t: 1, r: layout().field.w / CFG.fieldLanes * 1.6, color: '#ffb057' });   // 광역 충격링
    }
    Sound.play('shot');
  }
  function frontmostN(n) {
    return S.enemies.slice().sort((a, b) => (a.row - b.row) || (a.lane - b.lane)).slice(0, n);
  }
  function hitEnemy(e, shot) {
    if (S.enemies.indexOf(e) < 0) return;                                                     // 이미 처치됨(연쇄 중복 방지)
    let dmg = shot.dmg, crit = false;
    if (!shot.sub && rv('focus', 'per')) {                                                    // 락온 사격: 같은 적 연속 타격 중첩
      if (S.focusId === e) S.focusStack = Math.min(5, (S.focusStack || 0) + 1); else { S.focusId = e; S.focusStack = 0; }
      dmg *= 1 + S.focusStack * rv('focus', 'per');
    }
    const cc = (rv('crit', 'p') || 0) + (S.setsOn.precision ? 0.2 : 0);                      // 치명탄 / 정밀 세트
    if (!shot.splash && !shot.powder && cc > 0 && Math.random() < cc) { crit = true; dmg *= (rv('crit', 'mult') || 2); }
    dmg = Math.round(dmg);
    if (e.armor) dmg = Math.max(1, dmg - e.armor);                                            // 방어(헤비아머 장갑)
    if (e.isBoss && e.stun > 0 && S.bossDef && S.bossDef.vulnerable) dmg = Math.round(dmg * (1 + S.bossDef.vulnerable));  // 타이탄 과열(스턴) 중 코어 노출 → 취약
    e.hp -= dmg;
    const pos = enemyPos(e);
    e.hitT = 1;
    // 데미지 숫자: 겹침 방지 지터, 스킬·치명타는 큼직하게
    anim.floats.push({ x: pos.x + (Math.random() - 0.5) * 30, y: pos.y - 6 - Math.random() * 12, text: (crit ? '치명! ' : '') + Math.round(dmg), color: crit ? '#ff6b6b' : shot.big ? '#ffcf5c' : shot.sub ? '#ffd6a0' : '#fff', t: .9, big: shot.big || crit });
    // 종류별 임팩트(전부 크게): 스킬은 폭발+화면 흔들림, 평타는 발광 타격
    if (shot.fx === 'bigHit') { anim.fx.push({ type: 'boom', x: pos.x, y: pos.y, t: 1, color: '#ff8a3a' }); anim.fx.push({ type: 'flash', t: 1, color: '#fff2d6', a: 0.4 }); anim.shake = Math.max(anim.shake, 15); }
    else if (shot.fx === 'aoe') { anim.fx.push({ type: 'boom', x: pos.x, y: pos.y, t: 1, color: '#ffb057', sm: true }); anim.shake = Math.max(anim.shake, 8); }
    else if (shot.fx === 'rapid') { anim.fx.push({ type: 'spark', x: pos.x, y: pos.y, t: 1, color: '#bff0ff' }); anim.shake = Math.max(anim.shake, 2); }
    else {
      anim.fx.push({ type: 'hit', x: pos.x, y: pos.y, t: 1, color: crit ? '#ff6b6b' : (shot.lane !== undefined ? laneHex(shot.lane) : '#ffe9a8'), k: crit ? 1.6 : 1 });
      if (crit) { anim.shake = Math.max(anim.shake, 6); anim.fx.push({ type: 'ring', x: pos.x, y: pos.y, t: 1, r: 46 * (W / 405), color: '#ff6b6b' }); }
      else anim.shake = Math.max(anim.shake, 1.5);
    }
    if (e.hp <= 0) killEnemy(e, shot, dmg);
    if (shot.sub) return;                                                                     // 파생 타격은 추가 연쇄 없음
    const pn = rv('pierce', 'n');                                                             // 관통탄: 뒤 적 N명 추가 타격
    if (pn && !shot.aoe) {
      const behind = S.enemies.filter(x => x !== e && x.lane === e.lane && x.row > e.row).sort((a, b) => a.row - b.row).slice(0, pn);
      behind.forEach(t => hitEnemy(t, { dmg: shot.dmg * rv('pierce', 'mult'), sub: true, fx: 'rapid' }));
    }
    if (S.setsOn.explosive) splashAround(e.lane, e.row, 1, shot.dmg * 0.2, e);                // 폭발 세트: 인접 20%
  }
  // 주변 적에게 스플래시(반경 rad 칸, 체비셰프 거리)
  function splashAround(lane, row, rad, dmg, except) {
    const d = Math.max(1, Math.round(dmg));
    for (const t of S.enemies.slice()) {
      if (t === except) continue;
      if (Math.abs(t.lane - lane) <= rad && Math.abs(t.row - row) <= rad) hitEnemy(t, { dmg: d, sub: true, splash: true, fx: 'rapid' });
    }
  }

  function killEnemy(e, shot, dmg) {
    const idx = S.enemies.indexOf(e); if (idx < 0) return; S.enemies.splice(idx, 1);
    S.runKills = (S.runKills || 0) + 1;
    Sound.play('kill');
    { const kp = enemyPos(e); anim.fx.push({ type: 'boom', x: kp.x, y: kp.y, t: 1, color: e.color || '#ffcf5c', sm: !e.isBoss && !e.elite }); if (e.isBoss || e.elite) anim.shake = Math.max(anim.shake, 12); }   // 처치 폭발
    gainExp(e.exp);
    if (e.elite) { S.gold = (S.gold || 0) + ELITE.gold; const p = enemyPos(e); anim.floats.push({ x: p.x, y: p.y - 24, text: '정예 격파! +' + ELITE.gold + '🪙', color: '#ffd93b', t: 1.3, big: true }); }
    if (rv('shrapnel', 'mult') && shot && !shot.shrap) {                                     // 파편탄: 처치 피해 일부를 주변에
      const d = Math.max(1, Math.round((dmg || shot.dmg || 0) * rv('shrapnel', 'mult'))), rad = rv('shrapnel', 'rad') || 1;
      for (const t of S.enemies.slice()) if (Math.abs(t.lane - e.lane) <= rad && Math.abs(t.row - e.row) <= rad) hitEnemy(t, { dmg: d, sub: true, splash: true, shrap: true, fx: 'rapid' });
      const p = enemyPos(e); anim.fx.push({ type: 'boom', x: p.x, y: p.y, t: 1, color: '#ffb057', sm: true });
    }
    if (e.isBoss) {
      S.floorsCleared = (S.floorsCleared || 0) + 1;
      if (S.mode === 'endless') { S.bossDown = true; S.enemies = []; }   // 무한: 다음 막으로(전투 종료 흐름에서 처리)
      else winRun();
    }
  }

  function gainExp(x) {
    S.exp += x;
    while (S.exp >= S.expNext) { S.exp -= S.expNext; S.level++; S.expNext = expToNext(S.level); S.rewardQueue.push(S.level); S.pendingRewards = S.rewardQueue.length; Sound.play('level'); }
    syncHud();
  }

  function endBattle() {
    if (S.over) return;
    if (S.rewardQueue.length > 0) { showReward(); return; }   // 보상 먼저 다 받고
    advanceEnemies();
  }

  // ============ 적 전진·스폰 ============
  function advanceEnemies() {
    S._turns = (S._turns || 0) + 1;
    if (S.combat.boss && S.bossDown) { winCombat(); return; }   // 무한 모드: 보스 격파 → 다음 막
    // 보스 예고 패턴: 카운트다운 → 0이면 발동(그 순간 기절이면 저지)
    const boss = S.enemies.find(x => x.isBoss), BI = boss && BOSS_INTENT[boss.kind];
    let charge = false;
    if (boss && S.bossIntent && BI) {
      S.bossIntent.left--;
      if (S.bossIntent.left <= 0) {
        const bp = enemyPos(boss);
        if (boss.stun > 0) { anim.floats.push({ x: bp.x, y: bp.y - 30, text: '저지! ' + BI.name + ' 취소', color: '#8cf', t: 1.4, big: true }); }
        else if (boss.kind === 'titan') { charge = true; EnemyAnim.pose(boss, 'charge'); boss.holdUntil = performance.now() / 1000 + 0.42; anim.floats.push({ x: bp.x, y: bp.y - 30, text: '돌진!', color: '#ff6b6b', t: 1.3, big: true }); anim.shake = Math.max(anim.shake, 10); }   // 웅크렸다가(0.42초) 돌진
        else if (boss.kind === 'swarm') { EnemyAnim.pose(boss, 'split'); splitSwarm(boss, 3); anim.floats.push({ x: bp.x, y: bp.y - 30, text: '대분리!', color: '#5ad0a0', t: 1.3, big: true }); }
        else if (boss.kind === 'carrier') { EnemyAnim.pose(boss, 'launch'); for (let k = 0; k < 4; k++) summonAdd(); anim.floats.push({ x: bp.x, y: bp.y - 30, text: '증원 투입!', color: '#6fb1e8', t: 1.3, big: true }); }
        S.bossIntent.left = BI.every;
      }
    }
    const red = rv('plate', 'red') || 0, dp = rv('delay', 'p') || 0;
    // 전진: 방벽에 가까운 적부터 한 칸씩 — 앞칸이 비어야 나아가고, 막히면 비어 있는 옆 앞칸으로 비켜 가며, 그래도 막히면 멈춘다(같은 칸에 겹치지 않음)
    const marchOrder = S.enemies.slice().sort((a, b) => (a.row - b.row) || (a.lane - b.lane));
    for (const e of marchOrder) {
      if (e.stun > 0) { e.stun--; continue; }   // 기절(스킬) — 이번 턴 전진 스킵
      if (dp && !e.isBoss && Math.random() < dp) { const p = enemyPos(e); anim.floats.push({ x: p.x, y: p.y - 14, text: '⏱', color: '#8cf', t: 0.9 }); continue; }   // 전자 교란(EMP)
      const isCharge = charge && e === boss;
      let steps = (e.speed || 1) + (isCharge ? 2 : 0);   // 빠른 적(하운드)은 2칸, 타이탄 돌진 +2칸
      while (steps-- > 0) {
        if (e.row <= 0) { e.row = -1; break; }                       // 방벽 도달
        const nr = e.row - 1;
        if (cellFree(e.lane, nr, e)) { e.row = nr; continue; }
        const sides = [e.lane - 1, e.lane + 1].filter(l => l >= 0 && l < CFG.fieldLanes && cellFree(l, nr, e));
        if (!sides.length) break;                                    // 앞이 막혀 제자리
        e.lane = sides[Math.floor(Math.random() * sides.length)]; e.row = nr;
      }
      if (e.row < 0) {
        const dmg = Math.round(e.dmg * (isCharge ? 1.5 : 1) * (1 - red));
        S.wallHp -= dmg;
        Sound.play('wall');
        anim.floats.push({ x: W * (0.2 + Math.random() * 0.6), y: layout().wall.y + 20, text: '-' + dmg, color: '#ff6b6b', t: 1.2, big: true });
        anim.fx.push({ type: 'wallhit', t: 1 }); anim.fx.push({ type: 'flash', t: 1, color: '#ff2a2a', a: 0.28 }); anim.shake = Math.max(anim.shake, e.isBoss ? 18 : 12);   // 방벽 피격
        if (e.isBoss) { e.row = boss_retreatRow(); }   // 보스는 큰 피해 후 뒤로
        else { const i = S.enemies.indexOf(e); if (i >= 0) S.enemies.splice(i, 1); e.gt = 0; if (e.vx !== undefined) anim.ghosts.push(e); }   // 방벽 쪽으로 걸어 들어가며 사라진다
      }
    }
    resolveOverlaps();   // 보스 후퇴 등으로 칸이 겹쳤으면 비켜 세움
    if (S.wallHp <= 0 && S.setsOn.guard && !S.guardUsed) {   // 방호 세트: 1회 버팀
      S.guardUsed = true; S.wallHp = Math.round(S.wallHpMax * 0.5);
      anim.floats.push({ x: W / 2, y: layout().wall.y, text: '🛡 방호 발동! 방벽 50%', color: '#5ce0a0', t: 1.6, big: true }); anim.shake = Math.max(anim.shake, 8);
    }
    if (S.wallHp <= 0) { S.wallHp = 0; loseRun(); return; }
    // 드론 모함(정지형): 매 턴 경비봇 사출
    if (S.combat.boss && S.bossDef && S.bossDef.kind === 'carrier' && S.enemies.some(x => x.isBoss)) summonAdd();
    // 스폰
    if (!S.combat.boss) {
      if (S.enemies.length === 0 && S.waves.length === 0) { winCombat(); return; }
      if (S.waves.length > 0) spawnWave();
    }
    syncHud();
    enterLoad();
  }

  function boss_retreatRow() { return Math.min(CFG.fieldRows - 1, Math.round(CFG.fieldRows / 2)); }

  // ── 칸 점유(겹침 방지): 레인×행 칸마다 적은 1기만 ──
  function cellFree(lane, row, ignore) { for (const x of S.enemies) if (x !== ignore && x.lane === lane && x.row === row) return false; return true; }
  // 새 적 등장 칸: 가장 위 행부터 레인 순서대로 빈 칸(minRow 미만은 쓰지 않음). 자리가 없으면 null
  function spawnCell(prefLane, minRow) {
    const lo = minRow == null ? CFG.spawnMinRow : minRow;
    for (let r = CFG.fieldRows - 1; r >= lo; r--) for (let k = 0; k < CFG.fieldLanes; k++) { const l = (prefLane + k) % CFG.fieldLanes; if (cellFree(l, r)) return { lane: l, row: r }; }
    return null;
  }
  // 기준 칸에서 가장 가까운 빈 칸 — 같은 레인 뒤쪽(위) > 옆 레인 > 앞쪽(방벽 쪽) 순으로 선호
  function nearestFree(lane, row, isFree) {
    let best = null, bestD = Infinity;
    for (let r = 0; r < CFG.fieldRows; r++) for (let l = 0; l < CFG.fieldLanes; l++) {
      if (!isFree(l, r)) continue;
      const dr = r - row, d = Math.abs(l - lane) * 1.1 + (dr >= 0 ? dr * 0.8 : -dr * 1.6);
      if (d < bestD) { bestD = d; best = { lane: l, row: r }; }
    }
    return best;
  }
  // 겹친 적을 가까운 빈 칸으로 비켜 세운다(보스 → 방벽에 가까운 적 순으로 칸을 차지하고 나머지가 비킴)
  function resolveOverlaps() {
    const order = S.enemies.slice().sort((a, b) => ((b.isBoss ? 1 : 0) - (a.isBoss ? 1 : 0)) || (a.row - b.row) || (a.lane - b.lane));
    const taken = new Set(), movers = [];
    for (const e of order) { if (e.row < 0) continue; const k = e.lane + ',' + e.row; if (taken.has(k)) movers.push(e); else taken.add(k); }
    for (const e of movers) { const c = nearestFree(e.lane, e.row, (l, r) => !taken.has(l + ',' + r)); if (c) { e.lane = c.lane; e.row = c.row; taken.add(c.lane + ',' + c.row); } }
  }

  function summonAdd() {                        // 드론 모함 경비봇 사출
    if (!S.bossDef || S.enemies.length >= 22) return;
    const cell = spawnCell(Math.floor(Math.random() * CFG.fieldLanes), CFG.fieldRows - 2);   // 맨 위 두 행의 빈 칸에만 등장
    if (!cell) return;
    const def = ENEMIES[S.bossDef.addType || 'sentry'], lane = cell.lane, hp = Math.round(def.hp * S.scale.hp);
    const boss = S.enemies.find(x => x.isBoss); if (boss && !(boss.pose && performance.now() / 1000 < boss.pose.t0 + boss.pose.total)) EnemyAnim.pose(boss, 'launch');   // 해치를 열고 투하
    S.enemies.push({ type: S.bossDef.addType || 'sentry', name: def.name, lane, row: cell.row, hp, maxHp: hp, dmg: Math.round(def.dmg * S.scale.dmg), exp: Math.round(def.exp * S.scale.exp), color: def.color, stun: 0, speed: def.speed || 1, armor: def.armor || 0, from: bossFrom() });
  }
  // 보스가 내보낸 적(분리체·경비봇)이 보스 위치에서 나와 제 칸으로 걸어가도록 하는 출발점(필드 기준 0~1 좌표)
  function bossFrom() { const b = S.enemies.find(x => x.isBoss); if (!b) return undefined; return (b.vx !== undefined) ? { x: b.vx, y: b.vy } : enemyCellN(b); }

  function spawnWave() {
    const w = S.waves.shift(); if (!w) return;
    let placed = 0;
    for (let k = 0; k < w.length; k++) {
      const cell = spawnCell(k % CFG.fieldLanes); if (!cell) break;   // 빈 칸에만 등장(앞 웨이브와 겹치지 않음)
      const type = pickEnemyType(S.stage), def = ENEMIES[type];   // 종류는 스테이지 풀에서 (웨이브 길이=마릿수)
      const hp = Math.round(def.hp * S.scale.hp);
      S.enemies.push({ type, name: def.name, lane: cell.lane, row: cell.row, hp, maxHp: hp, dmg: Math.round(def.dmg * S.scale.dmg), exp: Math.round(def.exp * S.scale.exp), color: def.color, stun: 0, speed: def.speed || 1, armor: def.armor || 0 });
      placed++;
    }
    if (placed < w.length) S.waves.unshift(new Array(w.length - placed).fill('x'));   // 자리가 모자라면 남은 수는 다음 턴에 마저 등장
  }

  function spawnBoss() {
    const b = BOSSES[stageBoss(S.stage)]; S.bossDef = b;
    const hp = Math.round(b.hp * S.scale.hp);
    S.enemies.push({ isBoss: true, kind: b.kind, name: b.name, lane: Math.floor(CFG.fieldLanes / 2), row: CFG.fieldRows - 1, hp, maxHp: hp, dmg: Math.round(b.dmg * S.scale.dmg), exp: Math.round(b.exp * S.scale.exp), color: b.color, stun: 0, thHit: 0, speed: 1, armor: 0 });
    const bi = BOSS_INTENT[b.kind]; S.bossIntent = bi ? { left: bi.every } : null;   // 보스 예고 카운트다운
  }

  // 보스 임계 체크(전투 phase 데미지 적용 후) — 보스 종류별 동작
  function checkBossThreshold() {
    const e = S.enemies.find(x => x.isBoss); if (!e) return;
    const b = S.bossDef; if (!b || !b.thresholds) return;
    const frac = e.hp / e.maxHp;
    while (e.thHit < b.thresholds.length && frac <= b.thresholds[e.thHit]) {
      e.thHit++;
      if (b.kind === 'titan') {   // 돌격형: 과열 정지(후퇴 + 스턴)
        e.row = Math.min(CFG.fieldRows - 1, e.row + b.retreat); e.stun = b.stunTurns; resolveOverlaps();   // 뒤로 물러난 자리에 있던 적은 비켜 세움
        EnemyAnim.pose(e, 'overheat');   // 환기구를 열고 과열(이후 기절 동안 환기 프레임 반복)
        anim.floats.push({ x: enemyPos(e).x, y: enemyPos(e).y - 20, text: '과열!', color: '#ffcf5c', t: 1.2 });
      } else if (b.kind === 'swarm') {   // 분리형: 슬러지 분리
        EnemyAnim.pose(e, 'split');
        splitSwarm(e, b.splitCount);
        anim.floats.push({ x: enemyPos(e).x, y: enemyPos(e).y - 20, text: '분리!', color: '#5ad0a0', t: 1.2 }); Sound.play('kill');
      }
    }
  }
  function splitSwarm(e, n) {
    const def = ENEMIES.sludge;
    for (let i = 0; i < (n || 2) && S.enemies.length < 26; i++) {
      const want = Math.max(0, Math.min(CFG.fieldLanes - 1, e.lane + (i - Math.floor(n / 2))));
      const cell = nearestFree(want, e.row, (l, r) => cellFree(l, r)); if (!cell) break;   // 분리체도 빈 칸에 (겹침 없음)
      const lane = cell.lane;
      const hp = Math.round(def.hp * S.scale.hp);
      S.enemies.push({ type: 'sludge', name: def.name, lane, row: cell.row, hp, maxHp: hp, dmg: Math.round(def.dmg * S.scale.dmg), exp: Math.round(def.exp * S.scale.exp), color: def.color, stun: 0, speed: def.speed || 1, armor: 0, from: (e.vx !== undefined) ? { x: e.vx, y: e.vy } : enemyCellN(e) });
    }
  }

  // ============ 보상 ============
  // 레벨업 보상: 짝수 레벨 = 모듈 3택, 홀수 레벨 = 스탯 3택(빌드 밀도)
  function showReward() {
    const lvl = S.rewardQueue[0];
    const next = () => { S.rewardQueue.shift(); S.pendingRewards = S.rewardQueue.length; syncHud(); if (S.rewardQueue.length > 0) showReward(); else advanceEnemies(); };
    const pendingText = S.rewardQueue.length > 1 ? '남은 보상 ' + S.rewardQueue.length + '개' : '';   // 안내 문구 없이 '남은 개수'만
    if (lvl % 2 === 0) { showRelicPick({ title: '레벨 ' + lvl + ' · 모듈', sub: pendingText, evoChance: 0.4 }, next); return; }
    const box = $('reward-choices'); box.replaceChildren();
    const pool = REWARDS.slice(); const pick = [];
    for (let i = 0; i < 3 && pool.length; i++) pick.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    $('reward-title').textContent = '레벨 ' + lvl + '!';
    $('reward-sub').textContent = pendingText;
    pick.forEach(rw => {
      const b = document.createElement('button'); b.className = 'reward-card';
      b.innerHTML = '<div class="rc-top"><span class="rc-ic">' + uiIcon('rw_' + rw.id, rw.name.split(' ')[0]) + '</span><span class="rc-name">' + rw.name.replace(/^\S+\s/, '') + '</span></div><div class="rc-desc">' + rw.desc + '</div>';   // 이름 앞 이모지는 폴백 — rw_<id> 아이콘이 있으면 교체
      b.onclick = () => { rw.apply(S); $('reward').hidden = true; next(); };
      box.append(b);
    });
    $('reward').hidden = false;
  }

  // ============ 모듈 ============
  const rl = (id) => (S && S.relics && S.relics[id]) || 0;                              // 보유 레벨 0/1/2
  function rv(id, key) { const lv = rl(id); if (!lv) return 0; const d = RELICS[id]; return ((lv >= 2 ? d.lv2 : d.lv1) || {})[key] || 0; }
  function relicName(id, lv) { const d = RELICS[id]; return (lv >= 2 && d.lv2.name) ? d.lv2.name : d.name; }
  function relicPool() { const u = (Meta.unlockedRelics ? Meta.unlockedRelics() : Object.keys(RELICS)); return u.filter(id => RELICS[id]); }
  // 후보 k개: 태그 가중치(편성 클래스·보유 태그) + 개량 후보(보장/확률)
  function relicOffer(k, opts) {
    opts = opts || {};
    const pool = relicPool().filter(id => rl(id) < 2);
    const clsCount = {}; for (const c of S.chars) clsCount[c.ref.cls] = (clsCount[c.ref.cls] || 0) + 1;
    const ownTag = {}; for (const id in S.relics) ownTag[RELICS[id].tag] = 1;
    // 가중치: 클래스 씨앗 + 보유 태그(세트 유도). 이미 가진 Lv1 모듈은 ×0.45(개량는 전용 칸이 담당 → 새 모듈 위주로 폭 넓히기)
    const w = (id) => { const t = RELIC_TAGS[RELICS[id].tag]; return (1 + (t.cls ? (clsCount[t.cls] || 0) : 0.5) + (ownTag[RELICS[id].tag] ? 1 : 0)) * (rl(id) === 1 ? 0.45 : 1); };
    const out = [], evo = pool.filter(id => rl(id) === 1);
    if (evo.length && (opts.guaranteeEvo || Math.random() < (opts.evoChance || 0))) out.push(evo[Math.floor(Math.random() * evo.length)]);
    while (out.length < k) {
      const cand = pool.filter(id => out.indexOf(id) < 0); if (!cand.length) break;
      const tot = cand.reduce((s, id) => s + w(id), 0); let r = Math.random() * tot, pick = cand[0];
      for (const id of cand) { r -= w(id); if (r <= 0) { pick = id; break; } }
      out.push(pick);
    }
    return out;
  }
  function relicCardHTML(id) {
    const d = RELICS[id], lv = rl(id), evo = lv === 1, T = RELIC_TAGS[d.tag];
    const L = evo ? d.lv2 : d.lv1;
    return '<div class="rc-top"><span class="rc-ic">' + uiIcon('relic_' + id, d.icon) + '</span><span class="rc-name">' + (evo ? d.lv2.name : d.name) + '</span>'
      + '<span class="rc-tag" style="color:' + T.color + ';border-color:' + T.color + '66">' + tagIc(d.tag) + ' ' + T.name + '</span>' + (evo ? '<span class="rc-evo">★ 개량</span>' : '') + '</div>'
      + '<div class="rc-desc">' + L.desc + '</div>';
  }
  function showRelicPick(opts, done) {
    const ids = relicOffer(3, opts);
    if (!ids.length) { done && done(); return; }
    const box = $('reward-choices'); box.replaceChildren();
    $('reward-title').textContent = opts.title || '모듈 획득'; $('reward-sub').textContent = opts.sub || '';
    ids.forEach(id => {
      const b = document.createElement('button'); b.className = 'reward-card relic-card';
      b.innerHTML = relicCardHTML(id);
      b.onclick = () => { $('reward').hidden = true; gainRelic(id); done && done(); };
      box.append(b);
    });
    $('reward').hidden = false;
  }
  // 모듈 획득: Lv+1(최대 2) → 즉시 효과(재생 방벽 HP) → 세트 체크 → HUD
  function gainRelic(id) {
    const d = RELICS[id]; if (!d) return;
    const before = rl(id); if (before >= 2) return;
    const lv = before + 1; S.relics[id] = lv;
    if (id === 'steel') {                       // 최대 HP 증가분(레벨 간 차이만큼)
      const pct = (lv >= 2 ? d.lv2.pct : d.lv1.pct) - (before ? d.lv1.pct : 0), add = Math.round(S.wallBase * pct);
      S.wallHpMax += add; S.wallHp += add;
    }
    toast((lv >= 2 ? '★ 개량! ' : '모듈 장착 · ') + ui('relic_' + id, d.icon) + ' ' + relicName(id, lv), RELIC_TAGS[d.tag].color); Sound.play('level');
    // 세트: 같은 태그 모듈 RELIC_SET_N개
    const cnt = {}; for (const k in S.relics) cnt[RELICS[k].tag] = (cnt[RELICS[k].tag] || 0) + 1;
    for (const t in cnt) if (cnt[t] >= RELIC_SET_N && !S.setsOn[t]) {
      S.setsOn[t] = true;
      toast(tagIc(t) + ' ' + RELIC_TAGS[t].name + ' 세트 완성!<small>' + RELIC_TAGS[t].set + '</small>', RELIC_TAGS[t].color, true);
    }
    renderRelicBar();
  }
  // 상단 토스트(DOM) — 보상 모달·맵 위에서도 보이게. big=세트 완성 연출
  let _toastT = 0;
  function toast(html, color, big) {
    const el = $('toast'); if (!el) return;
    el.innerHTML = html; el.style.setProperty('--c', color || '#ffcf5c');
    el.className = 'toast show' + (big ? ' big' : '');
    clearTimeout(_toastT); _toastT = setTimeout(() => { el.className = 'toast'; }, big ? 2600 : 1700);
  }
  function renderRelicBar() {
    const el = $('relic-bar'); if (!el || !S) return;
    const ids = Object.keys(S.relics);
    const cnt = {}; for (const k of ids) cnt[RELICS[k].tag] = (cnt[RELICS[k].tag] || 0) + 1;
    let h = ids.map(id => '<span class="rb-it' + (rl(id) >= 2 ? ' evo' : '') + '" title="' + relicName(id, rl(id)) + '">' + uiIcon('relic_' + id, RELICS[id].icon) + (rl(id) >= 2 ? '<i>★</i>' : '') + '</span>').join('');
    h += Object.keys(cnt).map(t => '<span class="rb-set' + (S.setsOn[t] ? ' on' : '') + '" style="--c:' + RELIC_TAGS[t].color + '">' + tagIc(t) + Math.min(cnt[t], RELIC_SET_N) + '/' + RELIC_SET_N + '</span>').join('');
    el.innerHTML = h;                                   // 모듈이 없으면 빈 채로 두고 CSS(:empty)로 숨김 — 안내 문구 없음
    const mr = $('map-relics'); if (mr) mr.innerHTML = h;
  }
  function openRelicInfo() {
    const box = $('run-modal-box'), ids = Object.keys(S.relics);
    const cnt = {}; for (const k of ids) cnt[RELICS[k].tag] = (cnt[RELICS[k].tag] || 0) + 1;
    box.innerHTML = '<h2>보유 모듈</h2>'
      + (ids.length ? ids.map(id => { const d = RELICS[id], lv = rl(id), T = RELIC_TAGS[d.tag]; return '<div class="ri-row"><span class="rc-ic">' + uiIcon('relic_' + id, d.icon) + '</span><div class="ri-body"><b>' + relicName(id, lv) + (lv >= 2 ? ' ★' : '') + '</b> <span class="rc-tag" style="color:' + T.color + ';border-color:' + T.color + '66">' + tagIc(d.tag) + T.name + '</span><div class="rc-desc">' + (lv >= 2 ? d.lv2 : d.lv1).desc + '</div></div></div>'; }).join('') : '<p class="muted">아직 모듈이 없어요.</p>')
      + '<div class="ri-sets">' + Object.keys(RELIC_TAGS).map(t => { const T = RELIC_TAGS[t], n = cnt[t] || 0; return '<div class="ri-set' + (S.setsOn[t] ? ' on' : '') + '" style="--c:' + T.color + '"><b>' + tagIc(t) + ' ' + T.name + ' ' + Math.min(n, RELIC_SET_N) + '/' + RELIC_SET_N + '</b><span>' + T.set + '</span></div>'; }).join('') + '</div>'
      + '<button class="btn primary" data-close="1">닫기</button>';
    $('run-modal').hidden = false;
  }

  // ============ 승패 · 노드 진행 ============
  // 전투 노드 클리어: 모듈 3택(개량 1칸 보장) → 맵. 무한 모드 보스 → 다음 막.
  function winCombat() {
    S.floorsCleared = (S.floorsCleared || 0) + 1;
    S.phase = 'map';
    if (S.combat && S.combat.boss) { nextLoop(); return; }
    const t = S.combat && S.combat.elite ? '정예 격파 보상' : '전투 승리 보상';
    showRelicPick({ title: t, guaranteeEvo: true }, showMap);
  }
  function earnedText(e) { return '획득 🪙' + e.gold + ' 🔩' + e.mats + (e.gems ? ' 💎' + e.gems : ''); }
  function runScore(won) { return S.floorsCleared * 100 + S.runKills * 5 + (S.runMaxCombo || 0) * 10 + (S.loop || 0) * 800 + (won ? 1000 : 0); }
  function runInfo(won) { return { won, kills: S.runKills, floors: S.floorsCleared, gold: S.gold, stage: S.stage, mode: S.mode, loop: S.loop, maxCombo: S.runMaxCombo || 0, score: runScore(won), relics: Object.keys(S.relics).length }; }
  function extraText(e) {
    let t = '';
    if (e.unlocked) t += ' · 스테이지 ' + e.unlocked + ' 해금!';
    if (e.relicsUnlocked && e.relicsUnlocked.length) t += ' · 모듈 해금: ' + e.relicsUnlocked.map(id => RELICS[id].icon + RELICS[id].name).join(', ');
    if (e.record) t += ' · 🏆 신기록!';
    if (e.dailyReward) t += ' · 일일 보상 💎' + e.dailyReward;
    return t;
  }
  function winRun() {
    if (S.over) return; S.over = true;
    const e = Meta.onRunEnd(runInfo(true));
    endResult('승리', (S.mode === 'daily' ? '일일 도전' : '스테이지 ' + S.stage) + ' 클리어! 레벨 ' + S.level + ' · 점수 ' + runScore(true) + ' · 최대 콤보 ' + (S.runMaxCombo || 0) + ' · ' + earnedText(e) + extraText(e));
  }
  function loseRun() {
    if (S.over) return; S.over = true;
    const e = Meta.onRunEnd(runInfo(false));
    const where = S.mode === 'endless' ? '무한 ' + (S.loop + 1) + '막 ' + (S.combatIndex + 1) + '층' : runLabel();
    endResult(S.mode === 'endless' ? '작전 종료' : '패배', where + '에서 방벽이 붕괴했습니다. 전투 ' + S.floorsCleared + '회 돌파 · 점수 ' + runScore(false) + ' · ' + earnedText(e) + extraText(e));
  }
  function endResult(title, body) {
    $('map').hidden = true; $('run-modal').hidden = true; $('reward').hidden = true;
    $('result-title').textContent = title; $('result-body').textContent = body; $('result').hidden = false;
    Sound.play(title === '승리' ? 'win' : 'lose');
  }

  // ============ 분기 맵(A안) ============
  // 층0=전투 → 층1~4 갈림길(전투/정예/상점/정비) → 층5=보스. 일반 모드는 판마다 맵이 다름, 일일 도전은 시드 고정.
  function genMap() {
    const seed = S.mode === 'daily' ? ((S.seedBase || 1) + (S.loop || 0) * 104729) : ((Math.random() * 4294967295) >>> 0);
    const rng = makeRng(seed), F = MAP_CFG.floors, W8 = MAP_CFG.weights;
    const pick = (f) => {
      if (f === 1) return 'battle';                              // 1층은 전투만(초반 정비·상점은 의미 없음)
      const ent = Object.keys(W8);
      const tot = ent.reduce((s, t) => s + W8[t], 0); let r = rng() * tot;
      for (const t of ent) { r -= W8[t]; if (r <= 0) return t; }
      return 'battle';
    };
    const floors = [];
    for (let f = 0; f < F; f++) {
      const n = (f === 0 || f === F - 1) ? 1 : 2 + (rng() < 0.55 ? 1 : 0), row = [];
      for (let i = 0; i < n; i++) row.push({ type: f === 0 ? 'battle' : f === F - 1 ? 'boss' : pick(f), f, i, next: [], x: n === 1 ? 0.5 : 0.18 + i * (0.64 / (n - 1)) });
      floors.push(row);
    }
    const mids = floors.slice(2, F - 1).reduce((a, r) => a.concat(r), []);
    const force = (list, type) => { const c = list.filter(n => n.type === 'battle'); if (c.length) c[Math.floor(rng() * c.length)].type = type; };
    if (!floors[F - 2].some(n => n.type === 'rest')) floors[F - 2][Math.floor(rng() * floors[F - 2].length)].type = 'rest';   // 보스 직전 정비 보장
    if (!mids.some(n => n.type === 'elite')) force(mids, 'elite');
    if (!floors.slice(1, F - 1).some(r => r.some(n => n.type === 'shop'))) force(mids, 'shop');
    for (let f = 0; f < F - 1; f++) {                          // 연결: 가까운 노드끼리(모든 노드 진입/진출 보장)
      const nx = floors[f + 1];
      for (const a of floors[f]) {
        let t = nx.filter(b => Math.abs(b.x - a.x) <= 0.36);
        if (!t.length) t = [nx.slice().sort((p, q) => Math.abs(p.x - a.x) - Math.abs(q.x - a.x))[0]];
        a.next = t.map(b => b.i);
      }
      for (const b of nx) if (!floors[f].some(a => a.next.indexOf(b.i) >= 0)) floors[f].slice().sort((p, q) => Math.abs(p.x - b.x) - Math.abs(q.x - b.x))[0].next.push(b.i);
    }
    return { floors };
  }
  function reachable() {
    const m = S.map, p = S.mapPos, set = new Set();
    if (p.f < 0) m.floors[0].forEach(n => set.add('0-' + n.i));
    else if (p.f + 1 < m.floors.length) m.floors[p.f][p.i].next.forEach(i => set.add((p.f + 1) + '-' + i));
    return set;
  }
  function showMap() {
    if (!S || S.over) return;
    S.phase = 'map'; aimActive = false;
    $('reward').hidden = true; $('run-modal').hidden = true;
    const m = S.map, pos = S.mapPos, reach = reachable(), F = m.floors.length;
    const ny = f => 91 - f * (80 / (F - 1));                  // 아래(층0) → 위(보스)
    let svg = '<svg class="map-lines" viewBox="0 0 100 100" preserveAspectRatio="none">';
    m.floors.forEach((row, f) => row.forEach(n => n.next.forEach(i => {
      const b = m.floors[f + 1][i], on = (n.visited && b.visited) ? ' done' : (pos.f === f && pos.i === n.i) || (pos.f < 0 && f === 0) ? ' open' : '';
      svg += '<line class="ml' + on + '" x1="' + n.x * 100 + '" y1="' + ny(f) + '" x2="' + b.x * 100 + '" y2="' + ny(f + 1) + '"/>';
    })));
    svg += '</svg>';
    let nodes = '';
    m.floors.forEach((row, f) => row.forEach(n => {
      const key = f + '-' + n.i, T = MAP_CFG.nodeTypes[n.type], can = reach.has(key);
      nodes += '<button class="map-node t-' + n.type + (can ? ' reach' : '') + (n.visited ? ' visited' : '') + (pos.f === f && pos.i === n.i ? ' cur' : '') + '" style="left:' + n.x * 100 + '%;top:' + ny(f) + '%" data-node="' + key + '"' + (can ? '' : ' disabled') + '>'
        + '<span class="mn-ic">' + uiIcon('node_' + n.type, T.icon) + '</span><span class="mn-nm">' + T.name + '</span></button>';
    }));
    $('map-body').innerHTML = svg + nodes;
    $('map-head').innerHTML = '<b>' + (S.mode === 'endless' ? '♾ 무한 ' + (S.loop + 1) + '막' : S.mode === 'daily' ? '📅 일일 도전' : '스테이지 ' + S.stage) + '</b>'
      + '<span>🛡 ' + Math.ceil(S.wallHp) + '/' + S.wallHpMax + '</span><span>🪙 ' + (S.gold || 0) + '</span><span>Lv.' + S.level + '</span>';
    renderRelicBar();
    $('map').hidden = false;
  }
  function enterNode(f, i) {
    const n = S.map.floors[f][i]; n.visited = true; S.mapPos = { f, i }; S.combatIndex = f; S.nodeIdx = i;
    Sound.play('click');
    if (n.type === 'battle' || n.type === 'elite') { $('map').hidden = true; startCombat(nodeCombat(n.type, f), f, i); }
    else if (n.type === 'boss') { $('map').hidden = true; startCombat({ name: '보스 · ' + BOSSES[stageBoss(S.stage)].name, boss: true }, f, i); }
    else if (n.type === 'shop') { showMap(); openShop(); }
    else if (n.type === 'rest') { showMap(); openRest(); }
  }
  // 상점: 런 골드로 모듈·개량·회복 구매(쓴 골드는 런 종료 정산에서 빠짐 → 선택의 무게)
  function openShop() {
    const key = S.mapPos.f + '-' + S.mapPos.i;
    if (!S.shop || S.shop.key !== key) S.shop = { key, relics: relicOffer(3, { evoChance: 0.5 }), sold: {}, healed: false };
    const sh = S.shop, g = S.gold || 0;
    let h = '<h2>' + ui('node_shop', '🛒') + ' 상점</h2><p class="muted">보유 ' + uiCur('gold') + ' <b class="sh-gold">' + g + '</b></p><div class="shop-list">';
    for (const id of sh.relics) {
      const evo = rl(id) === 1, price = evo ? SHOP_PRICE.relicEvo : SHOP_PRICE.relic, sold = sh.sold[id] || rl(id) >= 2;
      h += '<div class="shop-item' + (sold ? ' sold' : '') + '">' + relicCardHTML(id) + '<button class="btn sm" data-buy="' + id + '"' + (sold || g < price ? ' disabled' : '') + '>' + (sold ? '구매 완료' : uiCur('gold') + ' ' + price) + '</button></div>';
    }
    h += '<div class="shop-item"><div class="rc-top"><span class="rc-ic">' + uiIcon('rw_heal', '🔧') + '</span><span class="rc-name">방벽 수리</span></div><div class="rc-desc">방벽 HP +30%</div><button class="btn sm" data-buy="heal"' + (sh.healed || g < SHOP_PRICE.heal ? ' disabled' : '') + '>' + (sh.healed ? '구매 완료' : uiCur('gold') + ' ' + SHOP_PRICE.heal) + '</button></div>';
    h += '</div><button class="btn primary" data-leave="1">떠나기</button>';
    $('run-modal-box').innerHTML = h; $('run-modal').hidden = false;
  }
  function shopBuy(what) {
    const sh = S.shop; if (!sh) return;
    if (what === 'heal') { if (sh.healed || S.gold < SHOP_PRICE.heal) return; S.gold -= SHOP_PRICE.heal; sh.healed = true; S.wallHp = Math.min(S.wallHpMax, S.wallHp + Math.round(S.wallHpMax * 0.3)); toast(ui('rw_heal', '🔧') + ' 방벽 수리 +30%', '#6cf'); }
    else { const evo = rl(what) === 1, price = evo ? SHOP_PRICE.relicEvo : SHOP_PRICE.relic; if (sh.sold[what] || S.gold < price) return; S.gold -= price; sh.sold[what] = true; gainRelic(what); }
    Sound.play('charge'); openShop();
  }
  // 정비: 수리 또는 개량(보유 모듈 1개를 Lv2로) 중 택1
  function openRest() {
    const lv1 = Object.keys(S.relics).filter(id => rl(id) === 1);
    let h = '<h2>' + ui('node_rest', '🔧') + ' 정비</h2><div class="rest-opts">'
      + '<button class="reward-card" data-rest="heal"><div class="rc-name">' + ui('rw_heal', '🔧') + ' 수리</div><div class="rc-desc">방벽 HP +' + Math.round(REST_HEAL * 100) + '% 회복 (현재 ' + Math.ceil(S.wallHp) + '/' + S.wallHpMax + ')</div></button>';
    h += lv1.length ? lv1.map(id => '<button class="reward-card relic-card" data-rest="evo:' + id + '">' + '<div class="rc-top"><span class="rc-name">' + ui('ic_promote', '⚙️') + ' 개량 → ' + RELICS[id].lv2.name + '</span></div><div class="rc-desc">' + RELICS[id].lv2.desc + '</div></button>').join('')
      : '<button class="reward-card" disabled><div class="rc-name">' + ui('ic_promote', '⚙️') + ' 개량</div><div class="rc-desc">개량할 모듈이 없어요(Lv1 모듈 필요)</div></button>';
    h += '</div>';
    $('run-modal-box').innerHTML = h; $('run-modal').hidden = false;
  }
  function restPick(v) {
    if (v === 'heal') { S.wallHp = Math.min(S.wallHpMax, S.wallHp + Math.round(S.wallHpMax * REST_HEAL)); toast(ui('rw_heal', '🔧') + ' 정비 · 방벽 회복', '#6cf'); Sound.play('charge'); }
    else if (v.indexOf('evo:') === 0) gainRelic(v.slice(4));
    $('run-modal').hidden = true; showMap();
  }
  // 무한 모드: 보스 격파 → 적 강화된 다음 막(새 맵). 빌드는 유지.
  function nextLoop() {
    S.loop = (S.loop || 0) + 1;
    const base = stageScale(S.stage), k = 1 + S.loop * MODES.endless.loopScale;
    S.scale = { hp: base.hp * k, dmg: base.dmg * k, exp: base.exp * (1 + S.loop * 0.2), reward: base.reward };
    S.wallHp = Math.min(S.wallHpMax, S.wallHp + Math.round(S.wallHpMax * 0.3));
    S.map = genMap(); S.mapPos = { f: -1, i: -1 };
    toast('♾ ' + (S.loop + 1) + '막 돌입 · 적 강화 ×' + k.toFixed(2), '#ff5db1', true);
    showRelicPick({ title: '보스 격파 보상', guaranteeEvo: true }, showMap);
  }

  // ============ 판 변화: 스킬 흔적 + 적 간섭 (매 장전 시작) ============
  function applyBoardEffects() {
    S.pegs = S.pegs.filter(p => !p.temp);                                          // 지난 턴 임시 페그 제거
    for (const p of S.pegs) if (p.stolen) { p.type = p.stolen; p.shape = (PEG_TYPES[p.type] || {}).shape || 'circle'; delete p.stolen; }   // 도난 복구
    for (const pk of S.pockets) if (pk.tempBuff) { pk.type = 'blank'; delete pk.tempBuff; }
    const notes = [];
    for (const fx of S.nextBoardFx) {                                               // 스킬 흔적(지난 전투에서 쓴 스킬)
      if (fx.peg) addPegToBoard(S, fx.peg, fx.n, { avoidLaunch: fx.peg === 'bumper' }).forEach(p => { p.temp = true; });
      if (fx.buff) { const pk = S.pockets.find(q => q.type === 'blank'); if (pk) { pk.type = 'buff'; pk.tempBuff = true; } }
      notes.push({ text: '✨ ' + fx.who + ' · ' + fx.text, color: '#ffcf5c' });
    }
    S.nextBoardFx = [];
    const cnt = {}; for (const e of S.enemies) cnt[e.type] = (cnt[e.type] || 0) + 1;   // 적 간섭(필드에 있는 동안)
    const boss = S.enemies.find(e => e.isBoss);
    if (boss && boss.kind === 'titan') cnt.heavy = (cnt.heavy || 0) + 1;
    if (boss && boss.kind === 'swarm') cnt.sludge = (cnt.sludge || 0) + 1;
    let added = 0, stolen = 0;
    for (const type in ENEMY_BOARD) {
      const n = Math.min(cnt[type] || 0, 2); if (!n) continue;
      const eb = ENEMY_BOARD[type];
      if (eb.steal) {
        const cands = S.pegs.filter(p => p.alive && !p.temp && ['mult2', 'mult5', 'gold', 'charge'].indexOf(p.type) >= 0);
        for (let k = 0; k < n && cands.length && stolen < 3; k++) { const p = cands.splice(Math.floor(Math.random() * cands.length), 1)[0]; p.stolen = p.type; p.type = 'normal'; p.shape = 'circle'; stolen++; }
        if (stolen) notes.push({ text: '📡 ' + eb.text, color: '#b58cff' });
      } else if (eb.peg && added < ENEMY_BOARD_CAP) {
        const ps = addPegToBoard(S, eb.peg, Math.min(n * eb.n, ENEMY_BOARD_CAP - added), { avoidLaunch: true });
        ps.forEach(p => { p.temp = true; }); added += ps.length;
        if (ps.length) notes.push({ text: eb.text, color: PEG_TYPES[eb.peg].color });
      }
    }
    const r = layout().pins;
    notes.forEach((nt, k) => anim.floats.push({ x: r.x + r.w / 2, y: r.y + 18 + k * 22, text: nt.text, color: nt.color, t: 2.4, note: true }));
  }

  // ============ 렌더 ============
  function laneColor(l) { return ['var(--lane0)', 'var(--lane1)', 'var(--lane2)'][l] || '#fff'; }
  function laneHex(l) { return ['#46e6d0', '#ffcf5c', '#ff5db1'][l] || '#fff'; }

  // 적의 '화면' 위치. 논리 칸(lane,row)이 바뀌면 표시 위치(vx,vy = 필드 기준 0~1 좌표)가 부드럽게 따라 미끄러진다 — 아직 표시 위치가 없으면(시뮬·첫 프레임) 칸 중심
  function enemyPos(e) {
    const r = layout().field;
    if (e.vx !== undefined) return { x: r.x + e.vx * r.w, y: r.y + e.vy * r.h };
    const laneW = r.w / CFG.fieldLanes;
    const x = r.x + (e.lane + 0.5) * laneW;
    const y = r.y + (CFG.fieldRows - 1 - e.row + 0.5) * (r.h / CFG.fieldRows);
    return { x, y };
  }
  const enemyCellN = (e) => ({ x: (e.lane + 0.5) / CFG.fieldLanes, y: (CFG.fieldRows - 1 - e.row + 0.5) / CFG.fieldRows });
  // 표시 위치를 논리 칸으로 접근시킨다(지수 감속 ≈0.4초). 새로 나온 적은 e.from(보스 위치 등) 또는 필드 위쪽 바깥에서 걸어 들어온다
  function stepEnemyVis(e, dt, now) {
    const t = enemyCellN(e);
    if (e.vx === undefined) { const f = e.from || { x: t.x, y: -0.5 / CFG.fieldRows }; e.vx = f.x; e.vy = f.y; }
    if (e.holdUntil && now < e.holdUntil) { e.moving = false; return; }         // 보스 돌격 준비 자세 동안은 제자리
    const dx = t.x - e.vx, dy = t.y - e.vy, k = 1 - Math.exp(-dt * 7.5);
    e.vx += dx * k; e.vy += dy * k;
    e.moving = Math.abs(dx) * CFG.fieldLanes + Math.abs(dy) * CFG.fieldRows > 0.06;   // 남은 거리(칸 단위)
  }
  // 방벽 위 캐릭터(발사 주체) 위치
  function charPos(c) {
    const r = layout().wall; const laneW = r.w / CFG.lanes;
    return { x: r.x + (c.lane + 0.5) * laneW, y: r.y + r.h / 2 - 4 };
  }
  // 캐릭터 발판 좌표·그림 크기 — 그리기와 총구 계산이 같은 값을 쓴다(어긋남 방지). 시트 한 칸(320)을 size×size 로, 발(x, feetY)에 맞춰 그린다
  function charSpot(c) {
    const wr = layout().wall, cw = wr.w / CFG.lanes;
    return { x: wr.x + (c.lane + 0.5) * cw, feetY: wr.y + wr.h * 0.72, size: Math.min(cw * 0.92, wr.h * 2.3) };
  }

  // ── 페그 모양 그리기 ──
  function polyPath(cx, cy, rad, n, rot) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) { const a = rot + i * 2 * Math.PI / n, x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.closePath();
  }
  function starPath(cx, cy, ro, ri, n) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? ri : ro, x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.closePath();
  }
  function drawPeg(px, py, R, shape, color, alive, imgName) {
    const pspr = (imgName && typeof PegArt !== 'undefined') ? PegArt.ready(imgName) : null;
    if (pspr) { const s = R * 2.4; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(pspr, px - s / 2, py - s / 2, s, s); return; }
    const col = color;   // 죽은 페그는 caller가 낮은 알파(유령)로 그림
    ctx.fillStyle = col;
    switch (shape) {
      case 'diamond': polyPath(px, py, R * 1.18, 4, -Math.PI / 2); ctx.fill(); break;
      case 'square': polyPath(px, py, R * 1.12, 4, Math.PI / 4); ctx.fill(); break;
      case 'pentagon': polyPath(px, py, R * 1.15, 5, -Math.PI / 2); ctx.fill(); break;
      case 'triangle': ctx.beginPath(); ctx.moveTo(px, py - R * 1.25); ctx.lineTo(px + R * 1.15, py + R * 0.9); ctx.lineTo(px - R * 1.15, py + R * 0.9); ctx.closePath(); ctx.fill(); break;
      case 'hex': polyPath(px, py, R * 1.15, 6, Math.PI / 6); ctx.fill(); break;
      case 'star': starPath(px, py, R * 1.35, R * 0.62, 5); ctx.fill(); break;
      case 'pill': {                                   // 가로 캡슐(두 반원 + 몸통)
        const w = R * 0.8, h = R * 0.9;
        ctx.beginPath(); ctx.arc(px - w, py, h, Math.PI / 2, -Math.PI / 2); ctx.arc(px + w, py, h, -Math.PI / 2, Math.PI / 2); ctx.closePath(); ctx.fill();
        break;
      }
      case 'bumper':
        ctx.beginPath(); ctx.arc(px, py, R * 1.4, 0, 7); ctx.fillStyle = col + '33'; ctx.fill();
        ctx.beginPath(); ctx.arc(px, py, R * 1.4, 0, 7); ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.stroke();
        ctx.beginPath(); ctx.arc(px, py, R * 0.66, 0, 7); ctx.fillStyle = col; ctx.fill();
        break;
      default: ctx.beginPath(); ctx.arc(px, py, R, 0, 7); ctx.fill();
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const shk = anim.shake > 0.3;
    if (shk) { ctx.save(); ctx.translate((Math.random() - 0.5) * anim.shake, (Math.random() - 0.5) * anim.shake); }
    const r = layout();
    const fr = r.field, cellW = fr.w / CFG.fieldLanes, cellH = fr.h / CFG.fieldRows;
    const nowS = performance.now() / 1000;
    // 영역 배경 레이어(이미지 있으면 각 영역에 그림 · 없으면 현행 도형 폴백)
    const _bg = (typeof BgArt !== 'undefined') ? BgArt : null;
    const bgField = _bg && _bg.ready('bg_field'), bgWall = _bg && _bg.ready('bg_wall'), bgBoard = _bg && _bg.ready('bg_board');
    // 필드 배경
    if (bgField) { ctx.save(); ctx.imageSmoothingEnabled = true; ctx.drawImage(bgField, fr.x, fr.y, fr.w, fr.h); ctx.restore(); }
    else { ctx.fillStyle = '#ffffff08'; ctx.fillRect(fr.x, fr.y, fr.w, fr.h); }
    // 위험 지대(맨 아래 행 = 방벽 접점) 강조 → 적이 다가옴을 인지
    ctx.fillStyle = '#ff5b5b16'; ctx.fillRect(fr.x, fr.y + fr.h - cellH, fr.w, cellH);
    // 전진 칸 격자(레인 세로 + 행 가로)
    ctx.strokeStyle = '#ffffff16'; ctx.lineWidth = 1; ctx.beginPath();
    for (let c = 1; c < CFG.fieldLanes; c++) { const x = fr.x + c * cellW; ctx.moveTo(x, fr.y); ctx.lineTo(x, fr.y + fr.h); }
    for (let rr = 1; rr < CFG.fieldRows; rr++) { const y = fr.y + rr * cellH; ctx.moveTo(fr.x, y); ctx.lineTo(fr.x + fr.w, y); }
    ctx.stroke();
    // 위험 지대 경계선(점선 빨강)
    ctx.strokeStyle = '#ff6b6b77'; ctx.lineWidth = 2; ctx.setLineDash([7, 5]);
    ctx.beginPath(); ctx.moveTo(fr.x, fr.y + fr.h - cellH); ctx.lineTo(fr.x + fr.w, fr.y + fr.h - cellH); ctx.stroke(); ctx.setLineDash([]);
    // 적
    const showLabels = cellH > 42;
    for (const g of anim.ghosts) {                 // 방벽에 닿은 적: 방벽 쪽으로 걸어 들어가며 사라진다(방벽 띠가 위에 덮임)
      const gf = EnemyAnim.frame(g, nowS, true); if (!gf) continue;
      const gp = enemyPos(g), gs = Math.min(cellW, cellH) * 0.42 * 2.3;
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - g.gt / 0.45);
      drawCell(ctx, gf.img, gf.sx, gf.sy, gf.sw, gf.sh, gp.x - gs / 2, gp.y - gs / 2, gs, gs);
      ctx.restore();
    }
    for (const e of S.enemies) {
      const p0 = enemyPos(e);
      const hit = e.hitT || 0;
      const rad = Math.min(cellW, cellH) * (e.isBoss ? 0.72 : 0.42) * (1 + 0.22 * hit);   // 피격 시 순간 부풀기
      const px = p0.x + (hit > 0 ? (Math.random() - 0.5) * rad * 0.9 * hit : 0), py = p0.y + (hit > 0 ? (Math.random() - 0.5) * rad * 0.9 * hit : 0);
      if (e.elite) {                                // 정예 오라
        const pul = 0.55 + 0.45 * Math.sin(performance.now() / 180);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; const ag = ctx.createRadialGradient(px, py, rad * 0.6, px, py, rad * 1.7);
        ag.addColorStop(0, 'rgba(255,217,59,' + (0.35 * pul).toFixed(3) + ')'); ag.addColorStop(1, 'rgba(255,217,59,0)');
        ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(px, py, rad * 1.7, 0, 7); ctx.fill(); ctx.restore();
      }
      const ef = EnemyAnim.frame(e, nowS, e.moving);           // 걷기 시트의 현재 프레임(보스는 상태 프레임 포함)
      if (ef) {                                     // 적 스프라이트(있으면 사용)
        const s = rad * 2.3;
        drawCell(ctx, ef.img, ef.sx, ef.sy, ef.sw, ef.sh, px - s / 2, py - s / 2, s, s);
        if (hit > 0.2) drawCellTint(ctx, ef.img, ef.sx, ef.sy, ef.sw, ef.sh, px - s / 2, py - s / 2, s, s, '#ffffff', Math.min(0.85, hit * 1.1));   // 피격 번쩍임(실루엣만)
        else if (e.stun > 0 && !(e.isBoss && e.kind === 'titan')) drawCellTint(ctx, ef.img, ef.sx, ef.sy, ef.sw, ef.sh, px - s / 2, py - s / 2, s, s, '#c9c2ff', 0.42);   // 기절 색조(타이탄은 과열 프레임으로 표현)
        if (showLabels) { ctx.font = 'bold ' + Math.round(rad * 0.58) + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(8,4,16,.85)'; ctx.strokeText(Math.max(0, Math.ceil(e.hp)), px, py + rad * 0.55); ctx.fillStyle = '#fff'; ctx.fillText(Math.max(0, Math.ceil(e.hp)), px, py + rad * 0.55); ctx.textBaseline = 'alphabetic'; }
      } else {                                        // 폴백: 색 원 + HP 숫자
        ctx.beginPath(); ctx.arc(px, py, rad, 0, 7);
        ctx.fillStyle = hit > 0.2 ? '#ffffff' : e.stun > 0 ? '#c9c2ff' : e.color; ctx.fill();
        ctx.lineWidth = e.isBoss ? 3 : 2; ctx.strokeStyle = '#ffffff55'; ctx.stroke();
        if (showLabels) { ctx.fillStyle = '#1a1020'; ctx.font = 'bold ' + Math.round(rad * 0.82) + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(Math.max(0, Math.ceil(e.hp)), px, py + 1); ctx.textBaseline = 'alphabetic'; }
      }
      // 이름(위, 공간 있을 때만)
      if (showLabels && py - rad - 5 > fr.y + cellH * 0.18) { ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.round(cellH * 0.15) + 'px system-ui'; ctx.textAlign = 'center'; ctx.fillText(e.name, px, py - rad - 6); }
      // hp bar(아래, 얇게)
      const bw = rad * 1.8, bx = p0.x - bw / 2, bh = Math.max(4, Math.round(cellH * 0.07)), by = p0.y + rad + 3;
      ctx.fillStyle = '#0009'; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = e.elite ? '#ffd93b' : '#ff6b6b'; ctx.fillRect(bx, by, bw * Math.max(0, e.hp / e.maxHp), bh);
      if (e.isBoss && S.bossIntent && BOSS_INTENT[e.kind]) {   // 보스 예고(남은 턴) — 그 턴에 기절시키면 저지
        const BI = BOSS_INTENT[e.kind], left = S.bossIntent.left, urgent = left <= 1;
        const label = (urgent ? '⚠ 다음 턴 ' : '⏳ ' + left + '턴 후 ') + BI.name;
        ctx.save(); ctx.font = 'bold ' + Math.max(12, Math.round(cellH * 0.16)) + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const tw = ctx.measureText(label).width + 16, th = Math.max(20, cellH * 0.24);
        const tx = Math.max(fr.x + tw / 2 + 4, Math.min(fr.x + fr.w - tw / 2 - 4, px));
        let ty = py - rad - (showLabels ? 26 : 12); if (ty - th / 2 < fr.y + 2) ty = py + rad + th / 2 + 8;   // 필드 위로 잘리면 보스 아래로
        ctx.fillStyle = urgent ? 'rgba(120,20,30,.92)' : 'rgba(20,14,40,.88)'; ctx.beginPath(); ctx.roundRect(tx - tw / 2, ty - th / 2, tw, th, th / 2); ctx.fill();
        ctx.strokeStyle = urgent ? '#ff6b6b' : '#ffcf5c'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = urgent ? '#ffd0d0' : '#ffe9a8'; ctx.fillText(label, tx, ty + 1); ctx.restore();
      }
    }
    // 방벽(캐릭터 방어선)
    const wr = r.wall, cw = wr.w / CFG.lanes;
    if (bgWall) { ctx.save(); ctx.imageSmoothingEnabled = true; ctx.drawImage(bgWall, wr.x, wr.y, wr.w, wr.h); ctx.restore(); }
    else { ctx.fillStyle = '#ffffff10'; ctx.fillRect(wr.x, wr.y, wr.w, wr.h); }
    const crad = Math.max(11, Math.min(cw * 0.26, wr.h * 0.22));
    const cFont = Math.max(11, Math.round(crad * 0.62)), showChar = wr.h > 55;
    for (const c of S.chars) {
      const sp = charSpot(c), x = sp.x, feetY = sp.feetY;   // 발치를 방벽 HP바 위로(겹침 방지)
      // 레인색 발판(캐릭터↔같은색 골칸 매칭 인지용)
      ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = laneHex(c.lane);
      ctx.beginPath(); ctx.ellipse(x, feetY, cw * 0.34, Math.max(4, wr.h * 0.06), 0, 0, 7); ctx.fill(); ctx.restore();
      if (!CharAnim.draw(ctx, c.anim, x, feetY, sp.size)) {   // 폴백: 원형(시트·썸네일 모두 없을 때)
        ctx.fillStyle = c.anim.st === 'fire' ? '#ffffff' : laneHex(c.lane); ctx.beginPath(); ctx.arc(x, feetY - wr.h * 0.4, crad, 0, 7); ctx.fill();
      }
      if (S.phase === 'load' && c.ammo > 0) {           // 장전 탄수 = 좌상단 작은 알약(얼굴 안 가림)
        const bw = Math.max(20, crad * 1.5), bh = Math.max(15, crad * 0.95), bx = x - cw / 2 + 3, by = wr.y + 3;
        ctx.fillStyle = '#1a1020dd'; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, bh / 2); ctx.fill();
        ctx.fillStyle = '#ffcf5c'; ctx.font = 'bold ' + Math.round(bh * 0.72) + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('×' + c.ammo, bx + bw / 2, by + bh / 2 + 1); ctx.textBaseline = 'alphabetic';
      }
    }
    // 방벽 HP 바(두껍게 + 큰 글자)
    const hbH = Math.max(8, Math.round(wr.h * 0.16)), hbY = wr.y + wr.h - hbH - 3, hbW = wr.w - 16;
    ctx.fillStyle = '#0007'; ctx.fillRect(wr.x + 8, hbY, hbW, hbH);
    ctx.fillStyle = '#46e6d0'; ctx.fillRect(wr.x + 8, hbY, hbW * Math.max(0, S.wallHp / S.wallHpMax), hbH);
    ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.max(11, Math.round(hbH * 0.82)) + 'px system-ui'; ctx.textAlign = 'left';
    ctx.fillText('🛡 ' + Math.ceil(S.wallHp) + ' / ' + S.wallHpMax, wr.x + 14, hbY + hbH - Math.max(2, hbH * 0.2));

    // ── 핀볼 영역(전투로 갈수록 페이드아웃 → 전투 화면에선 안 보임) ──
    const pinAlpha = Math.max(0, 1 - (S.layoutT || 0) * 1.5);
    if (pinAlpha > 0.01) {
    ctx.save(); ctx.globalAlpha = pinAlpha;
    // 핀볼 필드(페그판)
    if (bgBoard) { ctx.save(); ctx.imageSmoothingEnabled = true; ctx.drawImage(bgBoard, r.pins.x, r.pins.y, r.pins.w, r.pins.h); ctx.restore(); }
    else { ctx.fillStyle = '#00000022'; ctx.fillRect(r.pins.x, r.pins.y, r.pins.w, r.pins.h); }
    for (const p of S.pegs) {
      const px = r.pins.x + p.fx * r.pins.w, py = r.pins.y + p.fy * r.pins.h;
      const def = PEG_TYPES[p.type] || PEG_TYPES.normal;
      const R = (p.pr || CFG.pegRadius) * (p.alive ? 1 : 0.85);
      ctx.save();
      if (!p.alive) ctx.globalAlpha = 0.15 * pinAlpha;   // 터진 페그: 흐린 유령(다음 턴 부활)
      drawPeg(px, py, R, p.shape || def.shape, def.color, p.alive, 'peg_' + p.type);
      ctx.restore();
      const pegImg = (typeof PegArt !== 'undefined') && PegArt.ready('peg_' + p.type);
      if (p.alive && def.label && !pegImg) { ctx.fillStyle = '#1a1430'; ctx.font = 'bold ' + Math.max(8, Math.round((p.pr || CFG.pegRadius) * 1.05)) + 'px system-ui'; ctx.textAlign = 'center'; ctx.fillText(def.label, px, py + (p.pr || CFG.pegRadius) * 0.35); }
    }
    // 고정 장애물(범퍼/기둥/바)
    for (const o of S.obstacles || []) {
      if (o.t === 'bar') {
        const ox = r.pins.x + o.fx * r.pins.w, oy = r.pins.y + o.fy * r.pins.h, ow = o.fw * r.pins.w, oh = o.fh * r.pins.h;
        ctx.fillStyle = '#8a8f9a'; ctx.beginPath(); ctx.roundRect(ox, oy, ow, oh, oh / 2); ctx.fill();
        ctx.fillStyle = '#c9cfda'; ctx.beginPath(); ctx.roundRect(ox, oy, ow, oh * 0.5, oh / 2); ctx.fill();
      } else {
        const ox = r.pins.x + o.fx * r.pins.w, oy = r.pins.y + o.fy * r.pins.h, rr = o.r * r.pins.w, fl = o.flash || 0;
        const ospr = (typeof PegArt !== 'undefined') ? PegArt.ready('obst_' + o.t) : null;
        if (ospr) {
          const s = rr * 2.3; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(ospr, ox - s / 2, oy - s / 2, s, s);
          if (o.t === 'bumper' && fl > 0) { ctx.save(); ctx.globalAlpha = fl; ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#eafffb'; ctx.beginPath(); ctx.arc(ox, oy, rr * 0.6, 0, 7); ctx.fill(); ctx.restore(); o.flash = Math.max(0, fl - 0.08); }
        } else if (o.t === 'bumper') {
          ctx.fillStyle = '#0b2b28'; ctx.beginPath(); ctx.arc(ox, oy, rr, 0, 7); ctx.fill();
          ctx.strokeStyle = '#46e6d0'; ctx.lineWidth = Math.max(3, rr * 0.22); ctx.beginPath(); ctx.arc(ox, oy, rr * 0.82, 0, 7); ctx.stroke();
          ctx.fillStyle = fl > 0 ? '#eafffb' : '#46e6d0'; ctx.beginPath(); ctx.arc(ox, oy, rr * (0.42 + fl * 0.3), 0, 7); ctx.fill();
          if (fl > 0) o.flash = Math.max(0, fl - 0.08);
        } else {
          ctx.fillStyle = '#6b7180'; ctx.beginPath(); ctx.arc(ox, oy, rr, 0, 7); ctx.fill();
          ctx.strokeStyle = '#3a3f4a'; ctx.lineWidth = Math.max(2, rr * 0.15); ctx.stroke();
          ctx.fillStyle = '#9aa0ad'; ctx.beginPath(); ctx.arc(ox - rr * 0.25, oy - rr * 0.25, rr * 0.3, 0, 7); ctx.fill();
        }
      }
    }
    // 볼(발사볼=흰색, 페그에서 변환된 볼=페그 색)
    for (const b of S.balls) {
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7);
      ctx.fillStyle = b.color || '#eafcff'; ctx.fill();
      if (!b.harvest && b.combo >= 3) {                  // 콤보 카운터(발사볼 위)
        const big = b.combo >= 10;
        const k = COMBO_TEXT_SCALE, ty = b.y - b.r - 10 * k;
        ctx.save(); ctx.font = 'bold ' + Math.max(10, Math.round((big ? 17 : 13) * k)) + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';   // 70%, 단 페그 위에서 읽히도록 최소 10px
        ctx.lineWidth = 3.5 * k; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(8,4,16,.9)'; ctx.strokeText(b.combo + ' HIT', b.x, ty);
        ctx.fillStyle = big ? '#ffd93b' : '#fff'; ctx.fillText(b.combo + ' HIT', b.x, ty); ctx.restore();
      }
    }
    // 발사대(하단 중앙) + 조준 가이드
    if (S.phase === 'load') {
      const L = launcher();
      ctx.fillStyle = S.launchesLeft > 0 ? '#ffcf5c' : '#555';
      ctx.beginPath(); ctx.arc(L.x, L.y, 11, 0, 7); ctx.fill();
      if (aimActive && S.launchesLeft > 0) {
        const pts = simulateAim(aimDir(aimX, aimY));
        ctx.save(); ctx.lineWidth = 2.5; ctx.setLineDash([5, 7]); ctx.lineCap = 'round';
        for (let k = 1; k < pts.length; k++) {              // 뒤로 갈수록 흐려지는 예측선
          const a = 0.9 * (1 - (k - 1) / pts.length);
          ctx.strokeStyle = 'rgba(255,255,255,' + Math.max(0.07, a).toFixed(3) + ')';
          ctx.beginPath(); ctx.moveTo(pts[k - 1].x, pts[k - 1].y); ctx.lineTo(pts[k].x, pts[k].y); ctx.stroke();
        }
        const end = pts[pts.length - 1];
        ctx.setLineDash([]); ctx.globalAlpha = 0.6; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(end.x, end.y, 4, 0, 7); ctx.fill();
        ctx.restore();
      }
    }

    // 골 포켓 — 상단은 레인별 캐릭터 이름 라벨, 하단은 포켓 셀
    const g = r.goal, pw = g.w / 9;
    const lblH = Math.min(g.h * 0.4, 20), cellY = g.y + lblH, cellH = g.h - lblH;
    for (let l = 0; l < CFG.lanes; l++) {                 // 레인 그룹 라벨(골칸↔캐릭터 매칭)
      const c = S.chars.find(ch => ch.lane === l); if (!c) continue;
      const gx = g.x + (l * 3 + 1.5) * pw;
      ctx.fillStyle = laneHex(l) + '22'; ctx.fillRect(g.x + l * 3 * pw + 1, g.y + 1, 3 * pw - 2, lblH - 1);
      ctx.fillStyle = laneHex(l); ctx.font = 'bold ' + Math.max(11, Math.round(lblH * 0.72)) + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(c.ref.name, gx, g.y + lblH / 2 + 1); ctx.textBaseline = 'alphabetic';
    }
    for (let i = 0; i < 9; i++) {
      const pk = S.pockets[i]; const x = g.x + i * pw;
      const isC = pk.type === 'charge', isB = pk.type === 'buff';
      ctx.fillStyle = isC ? laneHex(pk.lane) + '55' : isB ? '#66ccff33' : '#ffffff08';
      ctx.fillRect(x + 1, cellY + 1, pw - 2, cellH - 3);
      ctx.strokeStyle = '#ffffff18'; ctx.strokeRect(x + 1, cellY + 1, pw - 2, cellH - 3);
      ctx.fillStyle = isC ? laneHex(pk.lane) : isB ? '#6cf' : '#4a4570';
      ctx.font = 'bold ' + Math.max(11, Math.round(Math.min(pw * 0.5, cellH * 0.5))) + 'px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(isC ? '◆' : isB ? '♥' : '×', x + pw / 2, cellY + cellH / 2 + Math.min(pw * 0.18, cellH * 0.18));
    }
    const fpk = BgArt.ready('frame_pocket');       // 포켓 줄 금속 프레임(900×140 중 불투명 영역 173,42 554×55) — 양 끝 마구리는 원비율, 가운데만 늘린다
    if (fpk) { const cap = Math.min(40 * (cellH / 55), g.w * 0.1); ctx.imageSmoothingEnabled = true; ctx.drawImage(fpk, 173, 42, 40, 55, g.x, cellY, cap, cellH); ctx.drawImage(fpk, 686, 42, 40, 55, g.x + g.w - cap, cellY, cap, cellH); ctx.drawImage(fpk, 213, 42, 473, 55, g.x + cap, cellY, g.w - cap * 2, cellH); }
    if (S.jack && S.phase === 'load') {                  // 움직이는 잭팟 포켓(×3)
      const jx = g.x + S.jack.x * g.w, jw = pw * 0.96, pul = 0.6 + 0.4 * Math.sin(performance.now() / 140);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,217,59,' + (0.16 + 0.14 * pul).toFixed(3) + ')'; ctx.fillRect(jx - jw / 2, cellY + 1, jw, cellH - 3);
      ctx.restore();
      ctx.save(); ctx.strokeStyle = '#ffd93b'; ctx.lineWidth = 2.5; ctx.strokeRect(jx - jw / 2, cellY + 1, jw, cellH - 3);
      ctx.fillStyle = '#ffd93b'; ctx.font = 'bold ' + Math.max(10, Math.round(cellH * 0.34)) + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,4,16,.9)'; ctx.strokeText('×' + JACKPOT_MUL, jx, cellY + cellH * 0.18 + 2); ctx.fillText('×' + JACKPOT_MUL, jx, cellY + cellH * 0.18 + 2);
      ctx.restore();
    }
    ctx.restore();
    }  // /pinAlpha

    // 플로팅 텍스트
    const U = W / 405;   // 이펙트 크기 기준(프레임 폭 비례)
    for (const f of anim.floats) {
      ctx.save();
      const pop = f.note ? 1 : (f.t > 0.6 ? 1 + Math.min(0.35, f.t - 0.6) * 1.4 : 1);    // 등장 순간 크게 튀었다가 안착
      ctx.globalAlpha = Math.max(0, Math.min(1, f.t / 0.7)); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const base = f.note ? 16 : f.ld ? LOAD_POPUP_PX : f.big ? 44 : 30;               // 장전 화면 팝업(ld)은 종류 불문 같은 크기
      const cs = f.ld ? COMBO_TEXT_SCALE : 1;                                          // 외곽선·글로우도 같은 비율
      const fsz = Math.round(base * pop * U);
      ctx.font = '900 ' + fsz + 'px system-ui';
      const yy = Math.max(fsz * 0.75, f.note ? f.y : f.y - (1 - Math.min(1, f.t)) * 46 * U);   // 알림(note)은 제자리 · 화면 위로 잘리지 않게 클램프
      const half = ctx.measureText(f.text).width / 2 + 6 * U, xx = Math.max(half, Math.min(W - half, f.x));   // 벽 쪽에서 터져도 글자가 화면 밖으로 잘리지 않게
      ctx.lineJoin = 'round'; ctx.lineWidth = (f.big || f.ld ? 8 : 6) * U * cs; ctx.strokeStyle = 'rgba(8,4,16,0.95)';
      ctx.strokeText(f.text, xx, yy);
      if (f.big && !f.note) { ctx.shadowColor = f.color; ctx.shadowBlur = 14 * U * cs; }   // 큰 숫자는 색 글로우
      ctx.fillStyle = f.color; ctx.fillText(f.text, xx, yy);
      ctx.restore();
    }
    for (const fl of anim.flashes) {                      // 타격/페그 접촉 섬광: 링 → 발광 코어
      const p = 1 - fl.t, rr = (fl.big ? 46 : 20) * U * (0.55 + p), col = fl.color || '#ffe9a8';
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const fg = ctx.createRadialGradient(fl.x, fl.y, 0, fl.x, fl.y, rr);
      fg.addColorStop(0, '#ffffff'); fg.addColorStop(0.4, col); fg.addColorStop(1, col + '00');
      ctx.globalAlpha = Math.min(1, fl.t * 0.9); ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(fl.x, fl.y, rr, 0, 7); ctx.fill();
      ctx.globalAlpha = fl.t * 0.8; ctx.strokeStyle = '#fff'; ctx.lineWidth = (fl.big ? 3.5 : 2.5) * U; ctx.beginPath(); ctx.arc(fl.x, fl.y, rr * 1.05, 0, 7); ctx.stroke();
      ctx.restore();
    }
    // 스킬 임팩트 이펙트(종류별)
    for (const f of anim.fx) {
      const t = Math.max(0, Math.min(1, f.t));
      if (f.type === 'flash') {                                 // 화면 전체 섬광(대형 스킬·방벽 피격)
        ctx.globalAlpha = t * (f.a || 0.35); ctx.fillStyle = f.color || '#fff'; ctx.fillRect(0, 0, W, H);
      } else if (f.type === 'wallhit') {                        // 방벽 피격: 붉은 충격 띠 + 균열선
        const wr = r.wall, g2 = ctx.createLinearGradient(0, wr.y, 0, wr.y + wr.h);
        g2.addColorStop(0, 'rgba(255,40,40,0)'); g2.addColorStop(0.5, 'rgba(255,60,60,' + (0.65 * t).toFixed(3) + ')'); g2.addColorStop(1, 'rgba(255,40,40,0)');
        ctx.fillStyle = g2; ctx.fillRect(0, wr.y - wr.h * 0.15, W, wr.h * 1.3);
        ctx.strokeStyle = 'rgba(255,220,220,' + t.toFixed(3) + ')'; ctx.lineWidth = 3 * U; ctx.lineCap = 'round';
        ctx.beginPath(); for (let i = 0; i < 5; i++) { const cx0 = W * (0.12 + i * 0.19 + (i % 2) * 0.03), cy0 = wr.y + wr.h * 0.5; ctx.moveTo(cx0, cy0 - wr.h * 0.3); ctx.lineTo(cx0 + 9 * U, cy0 - wr.h * 0.05); ctx.lineTo(cx0 - 6 * U, cy0 + wr.h * 0.1); ctx.lineTo(cx0 + 8 * U, cy0 + wr.h * 0.3); } ctx.stroke();
      } else if (f.type === 'hit') {                            // 평타 타격: 발광 코어 + 방사 스파크
        const R = 40 * U * (f.k || 1), fr = 1 - t;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const rr = R * (0.55 + fr * 0.75), hg = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, rr);
        hg.addColorStop(0, '#ffffff'); hg.addColorStop(0.3, f.color || '#ffe9a8'); hg.addColorStop(1, (f.color || '#ffe9a8') + '00');
        ctx.globalAlpha = t; ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(f.x, f.y, rr, 0, 7); ctx.fill();
        if (!FxSheet.hit(ctx, f.x, f.y, R * 2.8, fr, f.color || '#ffe9a8')) {      // 히트 스파크 시트(없으면 방사 선)
          ctx.strokeStyle = f.color || '#fff'; ctx.lineWidth = 3 * U; ctx.lineCap = 'round';
          for (let i = 0; i < 8; i++) { const a = i * 0.785 + f.x * 0.02, d0 = R * (0.35 + fr * 0.9), d1 = d0 + R * 0.55; ctx.beginPath(); ctx.moveTo(f.x + Math.cos(a) * d0, f.y + Math.sin(a) * d0); ctx.lineTo(f.x + Math.cos(a) * d1, f.y + Math.sin(a) * d1); ctx.stroke(); }
        }
        ctx.restore();
      } else if (f.type === 'boom') {
        const R0 = (f.sm ? 44 : 72) * U, fr = 1 - t;             // fr: 0→1 진행
        if (FxArt.ready('boom')) {                               // 폭발 시트(화염구 → 파편 → 연기 8프레임) + 큰 폭발은 충격 링
          FxSheet.boom(ctx, f.x, f.y, R0 * (f.sm ? 2.8 : 3.2), fr);
          if (!f.sm) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = t * 0.8; ctx.strokeStyle = '#fff'; ctx.lineWidth = 4 * U; ctx.beginPath(); ctx.arc(f.x, f.y, R0 * (0.7 + fr * 1.3), 0, 7); ctx.stroke(); ctx.restore(); }
        } else {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        // 화염구(방사형)
        const rr = R0 * (0.4 + fr * 0.9), fg = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, rr);
        fg.addColorStop(0, '#ffffff'); fg.addColorStop(0.35, f.color); fg.addColorStop(0.7, f.color + '66'); fg.addColorStop(1, f.color + '00');
        ctx.globalAlpha = t; ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(f.x, f.y, rr, 0, 7); ctx.fill();
        // 충격 링
        ctx.globalAlpha = t * 0.9; ctx.strokeStyle = '#fff'; ctx.lineWidth = (f.sm ? 3 : 5) * U;
        ctx.beginPath(); ctx.arc(f.x, f.y, R0 * (0.6 + fr * 1.1), 0, 7); ctx.stroke();
        // 파편 스파크(방사)
        const n = f.sm ? 8 : 12;
        ctx.strokeStyle = f.color; ctx.lineWidth = 3.5 * U; ctx.lineCap = 'round';
        for (let i = 0; i < n; i++) {
          const a = i * (6.283 / n) + f.x * 0.01, d0 = R0 * (0.3 + fr * 1.3), d1 = d0 + R0 * 0.55;
          ctx.globalAlpha = t;
          ctx.beginPath(); ctx.moveTo(f.x + Math.cos(a) * d0, f.y + Math.sin(a) * d0); ctx.lineTo(f.x + Math.cos(a) * d1, f.y + Math.sin(a) * d1); ctx.stroke();
        }
        ctx.restore();
        }
      } else if (f.type === 'ring') {
        ctx.globalAlpha = t * 0.9; ctx.strokeStyle = f.color; ctx.lineWidth = 9 * U; ctx.beginPath(); ctx.arc(f.x, f.y, (f.r || 60 * U) * (1.4 - t), 0, 7); ctx.stroke();
        ctx.globalAlpha = t * 0.22; ctx.fillStyle = f.color; ctx.fill();
      } else if (f.type === 'shock') {
        ctx.globalAlpha = t; ctx.strokeStyle = '#dffbff'; ctx.lineWidth = 5 * U; ctx.beginPath(); ctx.arc(f.x, f.y, 54 * U * (1.5 - t), 0, 7); ctx.stroke();
        ctx.globalAlpha = t * 0.5; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(f.x, f.y, 30 * U * (1.3 - t), 0, 7); ctx.fill();
      } else if (f.type === 'spark') {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const sg = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 26 * U);
        sg.addColorStop(0, '#ffffff'); sg.addColorStop(0.5, f.color); sg.addColorStop(1, f.color + '00');
        ctx.globalAlpha = t; ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(f.x, f.y, 26 * U * (0.6 + (1 - t) * 0.8), 0, 7); ctx.fill();
        if (!FxSheet.hit(ctx, f.x, f.y, 82 * U, 1 - t, f.color)) {
          ctx.strokeStyle = f.color; ctx.lineWidth = 3.5 * U; ctx.lineCap = 'round';
          for (let i = 0; i < 8; i++) { const a = i * 0.785 + (1 - t) * 2.5, r0 = (12 + (1 - t) * 20) * U, rr = r0 + 18 * U; ctx.beginPath(); ctx.moveTo(f.x + Math.cos(a) * r0, f.y + Math.sin(a) * r0); ctx.lineTo(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr); ctx.stroke(); }
        }
        ctx.restore();
      } else if (f.type === 'heal') {
        const yy = f.y - (1 - t) * 60 * U;
        ctx.globalAlpha = t * 0.9; ctx.strokeStyle = f.color; ctx.lineWidth = 5 * U; ctx.beginPath(); ctx.moveTo(f.x - f.w / 2, yy); ctx.lineTo(f.x + f.w / 2, yy); ctx.stroke();
        ctx.globalAlpha = t * 0.3; ctx.fillStyle = f.color; ctx.fillRect(f.x - f.w / 2, yy, f.w, (1 - t) * 60 * U);
      }
      ctx.globalAlpha = 1;
    }
    // 전투 발사체(포탄): 쏜 캐릭터 캐논 총구 → 적. 글로우 포탄 + 잔광 궤적 + 총구 플래시
    for (const s of anim.shots) {
      const tt = Math.min(1, s.t);
      const cx = s.sx + (s.ex - s.sx) * tt, cy = s.sy + (s.ey - s.sy) * tt;
      const ang = Math.atan2(s.ey - s.sy, s.ex - s.sx);
      const life = Math.min(1, (1.15 - s.t) / 0.5);      // 꼬리 페이드
      const hr = (s.big ? 24 : 15) * U;                   // 포탄 헤드 반경
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';           // 가산 합성 = 발광
      // ① 잔광 궤적(뒤로 갈수록 투명)
      const tailT = Math.max(0, tt - (s.big ? 0.32 : 0.24));
      const bx = s.sx + (s.ex - s.sx) * tailT, by = s.sy + (s.ey - s.sy) * tailT;
      const grd = ctx.createLinearGradient(bx, by, cx, cy);
      grd.addColorStop(0, s.color + '00'); grd.addColorStop(1, s.color);
      ctx.globalAlpha = life * 0.7; ctx.strokeStyle = grd; ctx.lineWidth = (s.big ? 13 : 7) * U; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(cx, cy); ctx.stroke();
      // ② 포탄 — 시트(탄두 + 꼬리 불꽃 2프레임)가 있으면 불투명하게 그리고, 없으면 글로우 오브
      const shellOn = tt < 1 && FxArt.ready('shell');       // 도착하면 탄체는 사라지고 궤적만 남아 흐려진다
      if (shellOn) {
        ctx.restore(); ctx.save();                          // 탄체는 일반 합성(색이 바래지 않게)
        FxSheet.shell(ctx, cx, cy, ang, hr * 2.4, nowS);
      } else {
        const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, hr);
        rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.35, s.color); rg.addColorStop(1, s.color + '00');
        ctx.globalAlpha = life; ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(cx, cy, hr, 0, 7); ctx.fill();
        ctx.globalAlpha = life; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, hr * 0.34, 0, 7); ctx.fill();
      }
      ctx.restore();
      // ③ 총구 플래시(발사 직후) — 포신 방향으로 뻗는 섬광(클래스 색으로 착색), 시트가 없으면 방사형 버스트
      if (s.flash && s.t < 0.5) {
        const mf = (0.5 - s.t) / 0.5, mr = (s.big ? 44 : 28) * U * (0.5 + mf * 0.7);
        ctx.save();
        if (!FxSheet.muzzle(ctx, s.sx, s.sy, s.mang != null ? s.mang : ang, (s.msz || 120 * U) * (s.big ? 0.6 : 0.46), 1 - mf, s.color)) {
          ctx.globalCompositeOperation = 'lighter';
          const mg = ctx.createRadialGradient(s.sx, s.sy, 0, s.sx, s.sy, mr);
          mg.addColorStop(0, '#ffffff'); mg.addColorStop(0.45, s.color); mg.addColorStop(1, s.color + '00');
          ctx.globalAlpha = mf; ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(s.sx, s.sy, mr, 0, 7); ctx.fill();
          ctx.translate(s.sx, s.sy); ctx.rotate(ang);              // 앞쪽 스파이크 2줄
          ctx.strokeStyle = '#fff'; ctx.globalAlpha = mf * 0.9; ctx.lineWidth = (s.big ? 5 : 3.5) * U; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(mr * 1.8, 0); ctx.stroke();
        }
        ctx.restore();
      }
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    // 전투 시작 배너(가로 띠 + 글자)
    if (S.phase === 'battle' && S.battleStage === 'intro') {
      const cy = r.field.y + r.field.h * 0.5;
      ctx.save();
      ctx.fillStyle = '#ffcf5c22'; ctx.fillRect(0, cy - 30, W, 60);
      ctx.fillStyle = '#ffcf5c'; ctx.fillRect(0, cy - 30, W, 2); ctx.fillRect(0, cy + 28, W, 2);
      ctx.fillStyle = '#ffcf5c'; ctx.textAlign = 'center'; ctx.font = 'bold 34px system-ui';
      ctx.fillText('전투!', W / 2, cy + 12);
      ctx.restore();
    }
    if (shk) ctx.restore();   // 화면 흔들림 종료(컷인 UI는 안 흔들림)
    // 스킬 발동 컷인 연출
    if (anim.cut) {
      const c = anim.cut, tt = Math.min(1, c.t / CUT_DUR);
      const a = tt < 0.15 ? tt / 0.15 : tt > 0.82 ? Math.max(0, (1 - tt) / 0.18) : 1;   // 페이드 인/아웃
      const bandH = H * 0.30, bandY = H * 0.34;
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = '#0b0812f0'; ctx.fillRect(0, bandY, W, bandH);
      ctx.fillStyle = c.color; ctx.globalAlpha = a * 0.22; ctx.fillRect(0, bandY, W, bandH); ctx.globalAlpha = a;
      ctx.fillStyle = c.color; ctx.fillRect(0, bandY, W, 4); ctx.fillRect(0, bandY + bandH - 4, W, 4);
      const cg = (typeof CharArt !== 'undefined') ? CharArt.sprite(c.id, 'cg') : null;   // CG 좌측 슬라이드 인
      const slide = Math.min(1, tt / 0.32);
      if (cg) { const ih = bandH * 1.35, iw = ih * (832 / 1216), ix = -iw * 0.35 + slide * (iw * 0.35 + W * 0.04); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(cg, ix, bandY + bandH - ih, iw, ih); }
      ctx.textAlign = 'right';
      ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.round(H * 0.055) + 'px system-ui';
      ctx.fillText(c.skill, W - 22 - slide * 0 - (1 - slide) * -20, bandY + bandH * 0.46);
      ctx.fillStyle = c.color; ctx.font = 'bold ' + Math.round(H * 0.03) + 'px system-ui';
      ctx.fillText(c.name, W - 22, bandY + bandH * 0.72);
      ctx.restore();
    }
  }

  // ============ 루프 ============
  // 화면 연출 진행(이펙트·캐릭터/적 애니메이션) — 로직과 무관한 것만. 루프와 테스트 훅(tick)이 함께 쓴다
  function stepVisuals(d) {
    for (let i = anim.fx.length - 1; i >= 0; i--) { anim.fx[i].t -= d * 1.8; if (anim.fx[i].t <= 0) anim.fx.splice(i, 1); }   // 이펙트는 모든 phase에서 진행
    if (anim.shake > 0) anim.shake = Math.max(0, anim.shake - d * 40);
    for (let i = anim.floats.length - 1; i >= 0; i--) { anim.floats[i].t -= d * 1.05; if (anim.floats[i].t <= 0) anim.floats.splice(i, 1); }
    for (let i = anim.flashes.length - 1; i >= 0; i--) { anim.flashes[i].t -= d * 3; if (anim.flashes[i].t <= 0) anim.flashes.splice(i, 1); }
    for (let i = anim.shots.length - 1; i >= 0; i--) { anim.shots[i].t += d * 4.6; if (anim.shots[i].t >= 1.15) anim.shots.splice(i, 1); }
    for (const c of S.chars) CharAnim.update(c.anim, d);
    const nowS = performance.now() / 1000;
    for (const e of S.enemies) { if (e.hitT > 0) e.hitT = Math.max(0, e.hitT - d * 3.2); stepEnemyVis(e, d, nowS); }
    for (let i = anim.ghosts.length - 1; i >= 0; i--) { const g = anim.ghosts[i]; g.gt += d; stepEnemyVis(g, d, nowS); if (g.gt > 0.5) anim.ghosts.splice(i, 1); }   // 방벽에 닿은 적: 걸어 들어가며 사라짐
  }
  function loop(ts) {
    const d = Math.min(0.032, (ts - lastTs) / 1000 || 0.016); lastTs = ts;
    if (S && !S.over) {
      // 장전↔전투 레이아웃 부드럽게 보간(~0.35s)
      const tgt = S.layoutTarget || 0;
      if (S.layoutT !== tgt) { const step = d / 0.35; S.layoutT = (S.layoutT < tgt) ? Math.min(tgt, S.layoutT + step) : Math.max(tgt, S.layoutT - step); }
      if (S.phase === 'load') stepBalls(d);
      else if (S.phase === 'battle') { stepBattle(d); checkBossThreshold(); }
      stepVisuals(d);
      if (S.phase !== 'map' && S.pockets.length) draw();   // 맵(상점·정비 포함) 중엔 캔버스 갱신 불필요
    }
    requestAnimationFrame(loop);
  }

  // ============ HUD·스킬 UI ============
  function syncHud() {
    $('c-level').textContent = 'Lv.' + S.level;
    $('exp-fill').style.width = (100 * S.exp / S.expNext) + '%';
  }
  function renderSkills() {
    const col = $('skill-col'); if (!col) return; col.replaceChildren();
    for (let lane = 0; lane < CFG.lanes; lane++) {
      const c = S.chars.find(ch => ch.lane === lane);
      const b = document.createElement('button');
      if (!c) { b.className = 'skillbtn empty'; b.disabled = true; b.textContent = '빈 슬롯'; col.append(b); continue; }
      const sk = c.ref.active, ready = c.gauge >= sk.gauge;
      b.className = 'skillbtn' + (ready ? ' ready' : '') + (c.armed ? ' armed' : '');
      b.innerHTML = '<span class="sb-nm">' + c.ref.name + '</span><span class="sb-sk">' + sk.name + '</span><span class="sb-g">' + Math.min(c.gauge, sk.gauge) + '/' + sk.gauge + '</span>';
      b.onclick = () => { if (c.gauge >= sk.gauge) { c.armed = !c.armed; renderSkills(); } };
      col.append(b);
    }
  }
  function syncAutoBtns() {
    const a = $('auto-skill-btn'), l = $('btn-auto');
    if (a) { const on = !!(S && S.autoSkill); a.classList.toggle('on', on); a.innerHTML = '<b>스킬</b>자동 ' + (on ? 'ON' : 'OFF'); }
    if (l) { const on = !!(S && S.autoLoad); l.classList.toggle('on', on); l.innerHTML = '<b>전투</b>자동 ' + (on ? 'ON' : 'OFF'); }
  }

  // ============ 입력 ============
  function canvasPoint(e) {   // 클라이언트 좌표 → 디자인 px(스테이지 scale 역보정)
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width ? canvas.clientWidth / rect.width : 1, sy = rect.height ? canvas.clientHeight / rect.height : 1;
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  }
  function aimDown(e) { if (!S || S.phase !== 'load' || S.launchesLeft <= 0) return; e.preventDefault(); Sound.resume(); aimActive = true; const p = canvasPoint(e); aimX = p.x; aimY = p.y; }
  function aimMove(e) { if (!aimActive) return; e.preventDefault(); const p = canvasPoint(e); aimX = p.x; aimY = p.y; }
  function aimUp(e) { if (!aimActive) return; e.preventDefault(); aimActive = false; launchBall(aimDir(aimX, aimY)); }

  // ============ 와이어링 ============
  Meta.load();
  Meta.init({ onSortie: startRun });
  Sound.syncIcons();
  document.querySelectorAll('.mute-btn').forEach(b => b.onclick = () => Sound.toggle());
  const enterLobby = () => { Sound.resume(); Sound.play('click'); show('lobby'); Meta.renderLobby(); };
  $('title').onclick = enterLobby;        // 타이틀 아무 곳이나 탭 → 시작
  $('btn-start').onclick = (e) => { e.stopPropagation(); enterLobby(); };
  $('btn-result').onclick = () => { $('result').hidden = true; show('lobby'); Meta.renderLobby(); };
  $('auto-skill-btn').onclick = () => { if (!S) return; S.autoSkill = !S.autoSkill; syncAutoBtns(); };  // 스킬 자동사용
  $('btn-auto').onclick = () => { if (!S) return; S.autoLoad = !S.autoLoad; syncAutoBtns(); };            // 자동 전투(장전 자동진행)
  // 맵·상점·정비·모듈 정보
  $('map-body').onclick = (e) => { const b = e.target.closest('[data-node]'); if (!b || b.disabled || !S) return; const [f, i] = b.dataset.node.split('-').map(Number); enterNode(f, i); };
  $('map-relics').onclick = () => { if (S) openRelicInfo(); };
  $('relic-bar').onclick = () => { if (S) openRelicInfo(); };
  $('run-modal').onclick = (e) => {
    if (!S) return;
    const buy = e.target.closest('[data-buy]'); if (buy && !buy.disabled) { shopBuy(buy.dataset.buy); return; }
    const rest = e.target.closest('[data-rest]'); if (rest && !rest.disabled) { restPick(rest.dataset.rest); return; }
    if (e.target.closest('[data-leave]')) { $('run-modal').hidden = true; showMap(); return; }
    if (e.target.closest('[data-close]') || e.target === $('run-modal')) {   // 모듈 정보 닫기(상점·정비은 선택 필요)
      const inShopRest = $('run-modal-box').querySelector('[data-buy],[data-rest]');
      if (!inShopRest) $('run-modal').hidden = true;
    }
  };
  canvas.addEventListener('pointerdown', aimDown);
  canvas.addEventListener('pointermove', aimMove);
  canvas.addEventListener('pointerup', aimUp);
  canvas.addEventListener('pointercancel', () => { aimActive = false; });
  // 9:16 프레임 크기 변경 시 전투 캔버스 재계산(프레임은 CSS가 실제 px로 처리 — transform 없음)
  function fitStage() { if (!$('combat').hidden) resize(); }
  window.addEventListener('resize', fitStage);
  window.addEventListener('orientationchange', fitStage);
  fitStage();

  // 에셋 미리 받기 — 타이틀·로비가 뜬 뒤 한가할 때 전투에서 쓰는 이미지(적·FX·페그·배경)를 받아 둔다(첫 전투에서 도형 폴백이 보이지 않게)
  setTimeout(function () {
    FxArt.preload(['muzzle', 'shell', 'boom', 'hit_spark']);
    EnemyArt.preload(Object.keys(ENEMIES).concat(['boss_titan', 'boss_swarm', 'boss_carrier']));
    BgArt.preload(['bg_field', 'bg_wall', 'bg_board', 'frame_pocket']);
    PegArt.preload(Object.keys(PEG_TYPES).map(function (k) { return 'peg_' + k; }).concat(['obst_bumper', 'obst_pillar']));
  }, 600);

  // 디버그/스모크 훅
  window.__PONGTRESS__ = {
    get S() { return S; }, get anim() { return anim; }, get idle() { return Meta.idleDebug ? Meta.idleDebug() : null; }, startRun, launchBall, enterBattle, CFG,
    showMap, enterNode, gainRelic, relicOffer, genMap, applyBoardEffects, advanceEnemies, showReward, showRelicPick, openShop, openRest, openRelicInfo, loseRun,
    setPattern(n) { forcedPattern = n; }, patternList() { return Object.keys(pegPatterns(1.3, CFG.pegStep)); },
    tick(dt) { if (!S || S.over) return; if (S.phase === 'load') stepBalls(dt); else if (S.phase === 'battle') { stepBattle(dt); checkBossThreshold(); } },
    // 화면 연출까지 한 걸음(rAF가 멈춘 숨은 탭에서 수동 진행용): layoutT 보간 포함
    step(dt) { if (!S || S.over) return; const tgt = S.layoutTarget || 0; if (S.layoutT !== tgt) { const st = dt / 0.35; S.layoutT = (S.layoutT < tgt) ? Math.min(tgt, S.layoutT + st) : Math.max(tgt, S.layoutT - st); } if (S.phase === 'load') stepBalls(dt); else if (S.phase === 'battle') { stepBattle(dt); checkBossThreshold(); } stepVisuals(dt); },
    render() { if (S) draw(); }, CharAnim, EnemyAnim, stepVisuals, enemyPos
  };

  // 헤드리스 자가 테스트: ?sim=1 로 런을 자동 진행하며 런타임 오류·상태를 #boot-error 에 남긴다.
  function runSelfTest() {
    const qs = new URLSearchParams(location.search);
    const stg = +qs.get('stage'); if (stg >= 1 && stg <= STAGE_MAX) { Meta.state.maxStage = STAGE_MAX; Meta.state.stage = stg; }  // 밸런스 테스트용 스테이지 지정
    const lv = +qs.get('lvl'), sr = +qs.get('star');
    if (lv >= 1 || sr >= 1) Object.keys(Meta.state.owned).forEach(id => { if (lv >= 1) Meta.state.owned[id].level = lv; if (sr >= 1) Meta.state.owned[id].star = sr; });
    const mode = qs.get('mode') || 'normal';
    startRun({ mode, stage: Meta.state.stage, seed: mode === 'daily' ? 20260928 : 0 });
    if (qs.has('win')) { S.atkBonus += 60; S.autoSkill = true; }
    const maxTicks = +qs.get('ticks') || 4000, maxLoop = +qs.get('loops') || 1;
    let ticks = 0, launched = 0, nodes = [];
    const iv = setInterval(() => {
      ticks++;
      try {
        // 헤드리스에선 rAF가 안 도므로 물리를 직접 펌핑(브라우저는 loop가 담당)
        for (let k = 0; k < 6 && !S.over; k++) {
          if (S.phase === 'load') stepBalls(0.03);
          else if (S.phase === 'battle') { stepBattle(0.03); checkBossThreshold(); }
        }
        if (!$('result').hidden) { done('result:' + $('result-title').textContent); return; }
        if (mode === 'endless' && S.loop >= maxLoop) { done('loop' + S.loop); return; }
        if (!$('reward').hidden) { const b = document.querySelector('#reward-choices .reward-card'); if (b) b.click(); return; }
        if (!$('run-modal').hidden) {                       // 상점: 살 수 있는 첫 모듈 → 떠나기 / 정비: 첫 선택
          const box = $('run-modal-box'), buy = box.querySelector('[data-buy]:not([disabled])'), rest = box.querySelector('[data-rest]:not([disabled])');
          if (buy) { buy.click(); return; } if (rest) { rest.click(); return; }
          const lv = box.querySelector('[data-leave],[data-close]'); if (lv) lv.click(); return;
        }
        if (!$('map').hidden && S.phase === 'map') { const n = document.querySelector('.map-node.reach'); if (n) { nodes.push(n.className.match(/t-(\w+)/)[1][0]); n.click(); } return; }
        if (S.phase === 'load' && S.launchesLeft > 0 && S.balls.length === 0) { launchBall(); launched++; return; }
        if (ticks > maxTicks) { done('timeout'); }
      } catch (e) { done('EXC:' + e.message + ' @' + (e.stack ? e.stack.split('\n')[1].trim() : '?')); }
    }, 8);
    function done(msg) { clearInterval(iv); const s = S || {}; boot('SIM ' + msg + ' | mode=' + s.mode + ' path=' + nodes.join('') + ' phase=' + s.phase + ' launched=' + launched + ' lvl=' + s.level + ' wall=' + Math.ceil(s.wallHp || 0) + '/' + s.wallHpMax + ' floor=' + s.combatIndex + ' loop=' + (s.loop || 0) + ' relics=' + Object.keys(s.relics || {}).map(k => k + s.relics[k]).join(',') + ' sets=' + Object.keys(s.setsOn || {}).join(',') + ' gold=' + (s.gold || 0) + ' maxCombo=' + (s.runMaxCombo || 0) + ' turns=' + (s._turns || 0)); }
  }
  if (new URLSearchParams(location.search).has('sim')) setTimeout(runSelfTest, 50);
})();
