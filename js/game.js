'use strict';
/* PONGTRESS 프로토타입 0.2 — 전투 코어 슬라이스
 * content.js(CFG·ROSTER·ENEMIES·BOSS_GOLEM·COMBATS·REWARDS·expToNext) 이후 로드.
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
    const ver = document.querySelector('.version'); if (ver) ver.textContent = 'prototype 0.2 · build ' + BUILD;
  })();

  const canvas = $('stage'); const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1;

  // ── 전역 상태 ──
  let S = null;          // 런/전투 상태
  let anim = { floats: [], flashes: [], shots: [] };
  let aimActive = false, aimX = 0, aimY = 0;
  let lastTs = 0;

  // ============ 화면 전환 ============
  function show(name) {
    for (const s of ['title', 'lobby', 'combat']) $(s).hidden = (s !== name);
  }

  // ============ 레이아웃(phase별 영역 비율) ============
  // 위→아래: 적 필드 / 성벽(캐릭터) / 골 포켓(성벽 바로 아래) / 핀볼 필드(하단 중앙에서 위로 발사)
  // 장전(0) ↔ 전투(1) 영역 비율. 전투에선 핀볼(goal·pins)이 거의 0 → 페이드로 사라짐
  const LOAD_FRAC = { field: .15, wall: .13, goal: .09, pins: .63 };
  const BATTLE_FRAC = { field: .72, wall: .24, goal: .02, pins: .02 };
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
    r.field = { x: 0, y, w: W, h: H * f.field }; y += r.field.h;
    r.wall = { x: 0, y, w: W, h: H * f.wall }; y += r.wall.h;
    r.goal = { x: 0, y, w: W, h: H * f.goal }; y += r.goal.h;
    r.pins = { x: 0, y, w: W, h: H * f.pins };
    return r;
  }
  // 발사대 위치(핀볼 영역 하단 중앙, 바닥에서 살짝 띄워 바닥 뱅크샷 여지를 둠)
  function launcher() { const p = layout().pins; return { x: p.x + p.w / 2, y: p.y + p.h - Math.max(CFG.ballRadius + 4, p.h * 0.12) }; }

  function resize() {
    const rect = $('stage-wrap').getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(240, Math.floor(rect.width));
    H = Math.max(360, Math.floor(rect.height));
    canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ============ 런 시작 ============
  function startRun() {
    const party = Meta.partySlots();                // [id|null ×3] — 편성
    const stage = Meta.stage(), scale = stageScale(stage);   // 스테이지 난이도 배수
    const wallMax = party.reduce((s, id) => s + (id ? Meta.leveledDef(id).hp : 0), 0);
    S = {
      stage, scale,
      combatIndex: 0, level: 1, exp: 0, expNext: expToNext(1),
      atkBonus: 0, bonusBalls: 0, party, gold: 0, turnAtk: 0, pocketBonus: [0, 0, 0], buffBonus: 0,
      runKills: 0, floorsCleared: 0,
      wallHpMax: wallMax, wallHp: wallMax,
      // 아래는 전투마다 초기화
      phase: 'load', layoutT: 0, layoutTarget: 0, chars: [], pegs: [], pockets: [], balls: [],
      enemies: [], waves: [], waveIdx: 0, launchesLeft: 0, passiveBalls: 0,
      shotQueue: [], battleTimer: 0, pendingRewards: 0, autoSkill: false,
      combat: null, over: false
    };
    show('combat'); resize();
    startCombat(0);
    requestAnimationFrame(loop);
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
  function startCombat(idx) {
    S.combatIndex = idx;
    const combat = COMBATS[idx];
    S.combat = combat; S.over = false;
    // 캐릭터(레인 배치): 편성 슬롯 순서 = 레인 0,1,2. 빈 슬롯은 캐릭터 없음. 레벨/성급 반영.
    S.chars = [];
    S.party.forEach((id, lane) => { if (id) S.chars.push({ ref: Meta.leveledDef(id), lane, ammo: 0, gauge: 0, armed: false }); });
    S.passiveBalls = 0;
    S.balls = []; S.shotQueue = []; anim.floats = []; anim.flashes = []; anim.shots = [];
    buildBoard();
    // 패시브(보드 효과) 적용
    for (const c of S.chars) applyPassive(c.ref.passive);
    // 적/웨이브
    S.enemies = [];
    if (combat.boss) { spawnBoss(); S.waves = []; }
    else { S.waves = combat.waves.slice(); spawnWave(); }
    S.waveIdx = 0;
    $('c-name').textContent = 'S' + S.stage + ' · ' + combat.name;
    enterLoad();
    syncHud();
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
      diamonds() {   // 동심 다이아(촘촘)
        let pts = [];
        for (const rr of [0.1, 0.19, 0.28, 0.37, 0.46]) { const rx = ax(rr); pts = pts.concat(alongPath([{ fx: cx, fy: cy - rr }, { fx: cx + rx, fy: cy }, { fx: cx, fy: cy + rr }, { fx: cx - rx, fy: cy }], true, step)); }
        pts.push({ fx: cx, fy: cy });
        return pts;
      },
      rings() {      // 동심 원(촘촘)
        let pts = [];
        for (const rr of [0.1, 0.18, 0.26, 0.34, 0.42]) pts = pts.concat(ellipsePts(cx, cy, ax(rr), rr, Math.max(8, Math.round(rr * 2 * Math.PI / step))));
        pts.push({ fx: cx, fy: cy });
        return pts;
      },
      heart() {      // 채운 하트 실루엣
        return fillShape((u, v) => { const x = u * 1.15, y = -v * 1.15 + 0.15; const a = x * x + y * y - 1; return a * a * a - x * x * y * y * y < 0; });
      },
      star() {       // 채운 5각 별 실루엣
        const verts = [];
        for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = (k % 2) ? 0.45 : 1.0; verts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
        return fillShape((u, v) => pointInPoly(u, v, verts));
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
    const key = (forcedPattern && P[forcedPattern]) ? forcedPattern : keys[Math.floor(Math.random() * keys.length)];
    S._layoutName = key;
    let pts = P[key]().filter(p => p.fx > 0.06 && p.fx < 0.94 && p.fy > 0.08 && p.fy < 0.87);
    return dedupePts(pts, asp, CFG.pegMinGap);
  }

  // ============ 보드(페그·포켓) 생성 ============
  function buildBoard() {
    S.pegs = [];
    for (const pt of pegLayout()) S.pegs.push(makePeg(pt.fx, pt.fy, pickPegType()));
    // 포켓 9칸: 레인별 3칸, 캐릭터 gol 만큼 충전
    S.pockets = [];
    for (let i = 0; i < 9; i++) {
      const lane = Math.floor(i / 3), sub = i % 3;
      const c = S.chars.find(ch => ch.lane === lane);
      const golN = c ? Math.min(3, c.ref.gol + ((S.pocketBonus && S.pocketBonus[lane]) || 0)) : 0;   // 보상으로 연 골칸은 다음 전투에도 유지
      const type = (c && sub < golN) ? 'charge' : 'blank';
      S.pockets.push({ lane, type });
    }
    // 버프 칸(보상): 꽝칸 일부를 버프(성벽 회복) 칸으로
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
    for (const c of S.chars) { c.ammo = 0; c.armed = false; }
    for (const p of S.pegs) p.alive = true;   // 특수·일반 페그 턴마다 부활
    S.launchesLeft = CFG.launchesPerTurn + S.bonusBalls + S.passiveBalls;
    S.balls = [];
    $('c-phase').textContent = '장전';
    renderSkills();
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
    S.balls.push({ x: L.x, y: L.y, vx: dir.dx * CFG.launchSpeed, vy: dir.dy * CFG.launchSpeed, r: CFG.ballRadius, age: 0 });
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

  function stepBalls(dt) {
    const r = layout().pins; const topY = r.y, botY = r.y + r.h;
    const pegR = CFG.pegRadius;
    for (let i = S.balls.length - 1; i >= 0; i--) {
      const b = S.balls[i];
      b.age = (b.age || 0) + dt;
      // 소멸 금지: 오래된 볼은 상단으로 점점 강하게 유도(상단 포켓에 실제로 도달해 충전될 때까지 사라지지 않음)
      if (b.age > CFG.ballLifetime) {
        const over = b.age - CFG.ballLifetime;
        b.vy -= Math.min(2400, 400 + over * 800) * dt;   // 위로 가속(오래될수록 강하게)
        if (over > 4) b.vx *= 0.92;                       // 아주 오래되면 수직에 가깝게 몰아 확실히 상단 도달
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
  function spawnBalls(x, y, n, color) {
    for (let k = 0; k < n && S.balls.length < CFG.maxBalls; k++) {
      const vx = (Math.random() - 0.5) * 200;                    // 약간의 좌우 퍼짐(여러 개가 다른 포켓으로)
      S.balls.push({ x, y, vx, vy: -CFG.launchSpeed * 0.92, r: CFG.ballRadius, age: 0, color, harvest: true });
    }
  }

  // 페그 충돌 처리(반사는 호출 전에 이미 적용됨). 페그는 볼로 변환되며 사라짐(볼이 지나갈 길이 뚫려 끼지 않음), 턴마다 부활.
  function applyPegHit(b, p, def, px, py) {
    if (b.harvest) return;                 // 수확 볼은 페그를 변환하지 않음(연쇄 방지)
    if (def.boost) {                       // 범퍼: 속도 킥(영구·안 사라짐)
      const sp = Math.hypot(b.vx, b.vy) || 1, target = CFG.launchSpeed * def.boost;
      b.vx = b.vx / sp * target; b.vy = b.vy / sp * target;
      anim.flashes.push({ x: px, y: py, t: 1, big: true, color: def.color });
      return;
    }
    // 볼로 변환(일반1개 · 배수 ×2→2개 · ×5→5개). 페그는 사라지고 턴마다 부활.
    if (def.gold) { S.gold = (S.gold || 0) + def.gold; anim.floats.push({ x: px, y: py, text: '+' + def.gold + 'G', color: def.color, t: 1 }); }
    if (def.atk) { S.turnAtk = (S.turnAtk || 0) + def.atk; anim.floats.push({ x: px, y: py, text: '공격+' + def.atk, color: def.color, t: 1 }); }
    spawnBalls(px, py, 1 + (def.split || 0), def.color);
    p.alive = false;
  }

  function landBall(b) {
    const g = layout().goal;
    let idx = Math.floor(((b.x - g.x) / g.w) * 9);
    idx = Math.max(0, Math.min(8, idx));
    const pk = S.pockets[idx];
    if (pk && pk.type === 'charge') {
      const c = S.chars.find(ch => ch.lane === pk.lane);
      const amt = b.charge || 1;
      if (c) { c.ammo += amt; c.gauge += amt; renderSkills(); }
      Sound.play('charge');
      anim.floats.push({ x: g.x + (idx + 0.5) * (g.w / 9), y: g.y + 10, text: '+' + amt, color: laneHex(pk.lane), t: 1 });
    } else if (pk && pk.type === 'buff') {
      const amt = (b.charge || 1) * 6;
      S.wallHp = Math.min(S.wallHpMax, S.wallHp + amt);
      Sound.play('charge');
      anim.floats.push({ x: g.x + (idx + 0.5) * (g.w / 9), y: g.y + 10, text: '+' + amt, color: '#6cf', t: 1 });
    }
  }

  // ============ 전투 phase ============
  function enterBattle() {
    S.phase = 'battle';
    S.layoutTarget = 1;                             // 전투 화면으로 부드럽게 확장(핀볼 페이드아웃)
    $('c-phase').textContent = '전투';
    // 액티브 스킬 발동(자동 또는 armed) 결정 → 샷 큐 구성
    S.shotQueue = [];
    for (const c of S.chars) {
      const sk = c.ref.active;
      const eligible = c.gauge >= sk.gauge;
      const use = eligible && (S.autoSkill || c.armed);
      if (use) { applyActive(c, sk); c.gauge = 0; }
      c.armed = false;
      // 일반 공격: 탄환 수만큼
      for (let k = 0; k < c.ammo; k++) S.shotQueue.push({ lane: c.lane, dmg: charDmg(c) });
    }
    // 탄환이 많으면 볼리(한 번에 여러 발) + 간격 단축으로 전투 총 시간을 battleWindow 근처로 유지
    const q = S.shotQueue.length;
    S.shotBurst = Math.max(1, Math.ceil(q / 80));   // 볼리 발사는 탄환이 아주 많을 때만(전투 늘어짐 방지)
    const volleys = Math.max(1, Math.ceil(q / S.shotBurst));
    S.shotDelay = Math.max(CFG.battleShotMinDelay, Math.min(CFG.battleShotDelay, Math.round(CFG.battleWindow / volleys)));
    S.battleTimer = 0;
    S.battleStage = 'intro';
    renderSkills();
  }

  function applyActive(c, sk) {
    if (sk.kind === 'bigHit') S.shotQueue.push({ lane: c.lane, dmg: charDmg(c) * sk.mult, big: true });
    else if (sk.kind === 'extraShots') { for (let k = 0; k < sk.shots; k++) S.shotQueue.push({ lane: c.lane, dmg: charDmg(c) }); }
    else if (sk.kind === 'heal') { S.wallHp = Math.min(S.wallHpMax, S.wallHp + sk.amount); anim.floats.push({ x: W / 2, y: layout().wall.y + 12, text: '+' + sk.amount, color: '#6cf', t: 1.2 }); }
    else if (sk.kind === 'aoe') { for (let k = 0; k < (sk.shots || 3); k++) S.shotQueue.push({ lane: c.lane, dmg: Math.round(charDmg(c) * (sk.mult || 1.3)), aoe: sk.count || 4, big: true }); }   // 광역: 앞 N명 동시 타격
    else if (sk.kind === 'stun') { frontmostN(sk.count || 3).forEach(e => { e.stun = (e.stun || 0) + (sk.turns || 1); anim.floats.push({ x: enemyPos(e).x, y: enemyPos(e).y - 16, text: '기절', color: '#8cf', t: 1.1 }); }); }   // 앞 N명 기절(전진 스킵)
  }

  function frontmostEnemy() {
    let best = null;
    for (const e of S.enemies) { if (!best || e.row < best.row || (e.row === best.row && e.lane < best.lane)) best = e; }
    return best;
  }

  function stepBattle(dt) {
    if (S.battleStage === 'done') return;   // 전투 종료(보상 대기/전진 처리 중)엔 정지 → 보상 선택지 재추첨 방지
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
    // 공격 진행(탄환 수에 맞춰 자동 조절된 간격 + 볼리 발사로 늘어짐 방지)
    if (S.battleTimer < (S.shotDelay || CFG.battleShotDelay)) return;
    S.battleTimer = 0;
    for (let n = 0; n < (S.shotBurst || 1); n++) {
      if (S.shotQueue.length === 0) { S.battleStage = 'outro'; S.battleTimer = 0; return; }
      const shot = S.shotQueue.shift();
      const e = frontmostEnemy();
      if (!e) { S.shotQueue = []; S.battleStage = 'outro'; S.battleTimer = 0; return; }
      fireShot(shot, e);
    }
  }

  function fireShot(shot, e) {
    const c = S.chars.find(ch => ch.lane === shot.lane);
    const targets = shot.aoe ? frontmostN(shot.aoe) : [e];
    let beam = null;
    for (const t of targets) { const p = enemyPos(t); if (!beam) beam = p; hitEnemy(t, shot); }
    if (beam) {
      const from = c ? charPos(c) : { x: beam.x, y: layout().wall.y + layout().wall.h };
      anim.shots.push({ sx: from.x, sy: from.y, ex: beam.x, ey: beam.y, t: 0, color: shot.big ? '#ffcf5c' : '#bff0ff', big: shot.big });
    }
    if (c) c.fireT = 1;
    Sound.play('shot');
  }
  function frontmostN(n) {
    return S.enemies.slice().sort((a, b) => (a.row - b.row) || (a.lane - b.lane)).slice(0, n);
  }
  function hitEnemy(e, shot) {
    let dmg = shot.dmg;
    if (e.armor) dmg = Math.max(1, dmg - e.armor);                                            // 방어(강철거인)
    if (e.isBoss && e.stun > 0 && S.bossDef && S.bossDef.vulnerable) dmg = Math.round(dmg * (1 + S.bossDef.vulnerable));  // 골렘 스턴 취약
    e.hp -= dmg;
    const pos = enemyPos(e);
    e.hitT = 1;
    anim.floats.push({ x: pos.x, y: pos.y, text: String(Math.round(dmg)), color: shot.big ? '#ffcf5c' : '#fff', t: .9, big: shot.big });
    anim.flashes.push({ x: pos.x, y: pos.y, t: 1, big: true });
    if (e.hp <= 0) killEnemy(e);
  }

  function killEnemy(e) {
    const idx = S.enemies.indexOf(e); if (idx >= 0) S.enemies.splice(idx, 1);
    S.runKills = (S.runKills || 0) + 1;
    Sound.play('kill');
    gainExp(e.exp);
    if (e.isBoss) { S.floorsCleared = (S.floorsCleared || 0) + 1; winRun(); }
  }

  function gainExp(x) {
    S.exp += x;
    while (S.exp >= S.expNext) { S.exp -= S.expNext; S.level++; S.expNext = expToNext(S.level); S.pendingRewards++; Sound.play('level'); }
    syncHud();
  }

  function endBattle() {
    if (S.over) return;
    if (S.pendingRewards > 0) { showReward(); return; }   // 보상 먼저 다 받고
    advanceEnemies();
  }

  // ============ 적 전진·스폰 ============
  function advanceEnemies() {
    S._turns = (S._turns || 0) + 1;
    // 보스 스턴이면 이번 턴 전진 스킵
    for (const e of S.enemies.slice()) {
      if (e.stun > 0) { e.stun--; continue; }   // 기절(스킬) — 이번 턴 전진 스킵
      e.row -= (e.speed || 1);   // 빠른 적(늑대)은 2칸
      if (e.row < 0) {
        S.wallHp -= e.dmg;
        Sound.play('wall');
        anim.floats.push({ x: W / 2, y: layout().wall.y + 20, text: '-' + e.dmg, color: '#ff6b6b', t: 1.2, big: true });
        if (e.isBoss) { e.row = boss_retreatRow(); }   // 보스는 큰 피해 후 뒤로
        else { const i = S.enemies.indexOf(e); if (i >= 0) S.enemies.splice(i, 1); }
      }
    }
    if (S.wallHp <= 0) { S.wallHp = 0; loseRun(); return; }
    // 고블린 군주(정지형): 매 턴 부하 소환
    if (S.combat.boss && S.bossDef && S.bossDef.kind === 'legion' && S.enemies.some(x => x.isBoss) && S.enemies.length < 22) {
      const def = ENEMIES[S.bossDef.addType], lane = Math.floor(Math.random() * CFG.fieldLanes), hp = Math.round(def.hp * S.scale.hp);
      S.enemies.push({ type: S.bossDef.addType, name: def.name, lane, row: CFG.fieldRows - 1, hp, maxHp: hp, dmg: Math.round(def.dmg * S.scale.dmg), exp: Math.round(def.exp * S.scale.exp), color: def.color, stun: 0, speed: def.speed || 1, armor: def.armor || 0 });
    }
    // 스폰
    if (!S.combat.boss) {
      if (S.enemies.length === 0 && S.waves.length === 0) { winCombat(); return; }
      if (S.waves.length > 0) spawnWave();
    }
    syncHud();
    enterLoad();
  }

  function boss_retreatRow() { return Math.min(CFG.fieldRows - 1, Math.round(CFG.fieldRows / 2)); }

  function spawnWave() {
    const w = S.waves.shift(); if (!w) return;
    w.forEach((_, k) => {
      const type = pickEnemyType(S.stage), def = ENEMIES[type];   // 종류는 스테이지 풀에서 (웨이브 길이=마릿수)
      const lane = k % CFG.fieldLanes;
      const row = CFG.fieldRows - 1 - Math.floor(k / CFG.fieldLanes);
      const hp = Math.round(def.hp * S.scale.hp);
      S.enemies.push({ type, name: def.name, lane, row, hp, maxHp: hp, dmg: Math.round(def.dmg * S.scale.dmg), exp: Math.round(def.exp * S.scale.exp), color: def.color, stun: 0, speed: def.speed || 1, armor: def.armor || 0 });
    });
  }

  function spawnBoss() {
    const b = BOSSES[stageBoss(S.stage)]; S.bossDef = b;
    const hp = Math.round(b.hp * S.scale.hp);
    S.enemies.push({ isBoss: true, kind: b.kind, name: b.name, lane: Math.floor(CFG.fieldLanes / 2), row: CFG.fieldRows - 1, hp, maxHp: hp, dmg: Math.round(b.dmg * S.scale.dmg), exp: Math.round(b.exp * S.scale.exp), color: b.color, stun: 0, thHit: 0, speed: 1, armor: 0 });
  }

  // 보스 임계 체크(전투 phase 데미지 적용 후) — 보스 종류별 동작
  function checkBossThreshold() {
    const e = S.enemies.find(x => x.isBoss); if (!e) return;
    const b = S.bossDef; if (!b || !b.thresholds) return;
    const frac = e.hp / e.maxHp;
    while (e.thHit < b.thresholds.length && frac <= b.thresholds[e.thHit]) {
      e.thHit++;
      if (b.kind === 'golem') {   // 돌진형: 후퇴 + 스턴
        e.row = Math.min(CFG.fieldRows - 1, e.row + b.retreat); e.stun = b.stunTurns;
        anim.floats.push({ x: enemyPos(e).x, y: enemyPos(e).y - 20, text: '휘청!', color: '#ffcf5c', t: 1.2 });
      } else if (b.kind === 'slime') {   // 분열형: 슬라임 소환
        splitBossSlime(e, b.splitCount);
        anim.floats.push({ x: enemyPos(e).x, y: enemyPos(e).y - 20, text: '분열!', color: '#5ad0a0', t: 1.2 }); Sound.play('kill');
      }
    }
  }
  function splitBossSlime(e, n) {
    const def = ENEMIES.slime;
    for (let i = 0; i < (n || 2) && S.enemies.length < 26; i++) {
      const lane = Math.max(0, Math.min(CFG.fieldLanes - 1, e.lane + (i - Math.floor(n / 2))));
      const hp = Math.round(def.hp * S.scale.hp);
      S.enemies.push({ type: 'slime', name: def.name, lane, row: e.row, hp, maxHp: hp, dmg: Math.round(def.dmg * S.scale.dmg), exp: Math.round(def.exp * S.scale.exp), color: def.color, stun: 0, speed: def.speed || 1, armor: 0 });
    }
  }

  // ============ 보상 ============
  function showReward() {
    const box = $('reward-choices'); box.replaceChildren();
    const pool = REWARDS.slice(); const pick = [];
    for (let i = 0; i < 3 && pool.length; i++) pick.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    $('reward-sub').textContent = '남은 보상 ' + S.pendingRewards + '개 · 하나를 고르세요';
    pick.forEach(rw => {
      const b = document.createElement('button'); b.className = 'reward-card';
      b.innerHTML = '<div class="rc-name">' + rw.name + '</div><div class="rc-desc">' + rw.desc + '</div>';
      b.onclick = () => {
        rw.apply(S); S.pendingRewards--; $('reward').hidden = true; syncHud();
        if (S.pendingRewards > 0) showReward(); else advanceEnemies();
      };
      box.append(b);
    });
    $('reward').hidden = false;
  }

  // ============ 승패 ============
  function winCombat() {
    S.floorsCleared = (S.floorsCleared || 0) + 1;
    if (S.combatIndex + 1 < COMBATS.length) { startCombat(S.combatIndex + 1); }
    else winRun();
  }
  function earnedText(e) { return '획득 🪙' + e.gold + ' 🔩' + e.mats + (e.gems ? ' 💎' + e.gems : ''); }
  function winRun() {
    if (S.over) return; S.over = true;
    const e = Meta.onRunEnd({ won: true, kills: S.runKills, floors: S.floorsCleared, gold: S.gold, stage: S.stage });
    const unlock = e.unlocked ? ' · 스테이지 ' + e.unlocked + ' 해금!' : '';
    endResult('승리', '스테이지 ' + S.stage + ' 클리어! 레벨 ' + S.level + '. · ' + earnedText(e) + unlock);
  }
  function loseRun() {
    if (S.over) return; S.over = true;
    const e = Meta.onRunEnd({ won: false, kills: S.runKills, floors: S.floorsCleared, gold: S.gold, stage: S.stage });
    endResult('패배', 'S' + S.stage + ' · ' + S.combat.name + '에서 성벽이 무너졌습니다. 전투 ' + S.floorsCleared + '회 돌파. · ' + earnedText(e));
  }
  function endResult(title, body) {
    $('result-title').textContent = title; $('result-body').textContent = body; $('result').hidden = false;
    Sound.play(title === '승리' ? 'win' : 'lose');
  }

  // ============ 렌더 ============
  function laneColor(l) { return ['var(--lane0)', 'var(--lane1)', 'var(--lane2)'][l] || '#fff'; }
  function laneHex(l) { return ['#46e6d0', '#ffcf5c', '#ff5db1'][l] || '#fff'; }

  function enemyPos(e) {
    const r = layout().field;
    const laneW = r.w / CFG.fieldLanes;
    const x = r.x + (e.lane + 0.5) * laneW;
    const y = r.y + (CFG.fieldRows - 1 - e.row + 0.5) * (r.h / CFG.fieldRows);
    return { x, y };
  }
  // 성벽 위 캐릭터(발사 주체) 위치
  function charPos(c) {
    const r = layout().wall; const laneW = r.w / CFG.lanes;
    return { x: r.x + (c.lane + 0.5) * laneW, y: r.y + r.h / 2 - 4 };
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
  function drawPeg(px, py, R, shape, color, alive) {
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
    const r = layout();
    const fr = r.field, cellW = fr.w / CFG.fieldLanes, cellH = fr.h / CFG.fieldRows;
    // 필드 배경
    ctx.fillStyle = '#ffffff08'; ctx.fillRect(fr.x, fr.y, fr.w, fr.h);
    // 위험 지대(맨 아래 행 = 성벽 접점) 강조 → 적이 다가옴을 인지
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
    for (const e of S.enemies) {
      const p0 = enemyPos(e);
      const rad = Math.min(cellW, cellH) * (e.isBoss ? 0.72 : 0.42);
      const hit = e.hitT || 0;
      const px = p0.x + (hit > 0 ? (Math.random() - 0.5) * rad * 0.5 * hit : 0), py = p0.y + (hit > 0 ? (Math.random() - 0.5) * rad * 0.5 * hit : 0);
      ctx.beginPath(); ctx.arc(px, py, rad, 0, 7);
      ctx.fillStyle = hit > 0.35 ? '#ffffff' : e.stun > 0 ? '#c9c2ff' : e.color; ctx.fill();
      ctx.lineWidth = e.isBoss ? 3 : 2; ctx.strokeStyle = '#ffffff55'; ctx.stroke();
      // HP 숫자(원 안)
      if (showLabels) { ctx.fillStyle = '#1a1020'; ctx.font = 'bold ' + Math.round(rad * 0.82) + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(Math.max(0, Math.ceil(e.hp)), px, py + 1); ctx.textBaseline = 'alphabetic'; }
      // 이름(위, 공간 있을 때만)
      if (showLabels && py - rad - 5 > fr.y + cellH * 0.18) { ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.round(cellH * 0.15) + 'px system-ui'; ctx.textAlign = 'center'; ctx.fillText(e.name, px, py - rad - 6); }
      // hp bar(아래, 얇게)
      const bw = rad * 1.8, bx = p0.x - bw / 2, bh = Math.max(4, Math.round(cellH * 0.07)), by = p0.y + rad + 3;
      ctx.fillStyle = '#0009'; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#ff6b6b'; ctx.fillRect(bx, by, bw * Math.max(0, e.hp / e.maxHp), bh);
    }
    // 성벽(캐릭터 방어선)
    const wr = r.wall, cw = wr.w / CFG.lanes;
    ctx.fillStyle = '#ffffff10'; ctx.fillRect(wr.x, wr.y, wr.w, wr.h);
    const crad = Math.max(11, Math.min(cw * 0.26, wr.h * 0.22));
    const cFont = Math.max(11, Math.round(crad * 0.62)), showChar = wr.h > 55;
    for (const c of S.chars) {
      const fire = c.fireT || 0;
      const x = wr.x + (c.lane + 0.5) * cw, y = wr.y + wr.h * 0.34 - fire * 4;
      if (fire > 0) { ctx.save(); ctx.globalAlpha = fire * 0.6; ctx.fillStyle = laneHex(c.lane); ctx.beginPath(); ctx.arc(x, y, crad + fire * 10, 0, 7); ctx.fill(); ctx.restore(); }
      ctx.fillStyle = fire > 0.4 ? '#ffffff' : laneHex(c.lane); ctx.beginPath(); ctx.arc(x, y, crad, 0, 7); ctx.fill();
      if (showChar) { ctx.fillStyle = '#fff'; ctx.font = 'bold ' + cFont + 'px system-ui'; ctx.textAlign = 'center'; ctx.fillText(c.ref.name, x, y + crad + cFont + 1); }
      if (S.phase === 'load' && c.ammo > 0) { ctx.fillStyle = '#1a1020'; ctx.font = 'bold ' + Math.round(crad * 1.0) + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(c.ammo, x, y + 1); ctx.textBaseline = 'alphabetic'; }
    }
    // 성벽 HP 바(두껍게 + 큰 글자)
    const hbH = Math.max(8, Math.round(wr.h * 0.16)), hbY = wr.y + wr.h - hbH - 3, hbW = wr.w - 16;
    ctx.fillStyle = '#0007'; ctx.fillRect(wr.x + 8, hbY, hbW, hbH);
    ctx.fillStyle = '#46e6d0'; ctx.fillRect(wr.x + 8, hbY, hbW * Math.max(0, S.wallHp / S.wallHpMax), hbH);
    ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.max(11, Math.round(hbH * 0.82)) + 'px system-ui'; ctx.textAlign = 'left';
    ctx.fillText('🛡 ' + Math.ceil(S.wallHp) + ' / ' + S.wallHpMax, wr.x + 14, hbY + hbH - Math.max(2, hbH * 0.2));

    // ── 핀볼 영역(전투로 갈수록 페이드아웃 → 전투 화면에선 안 보임) ──
    const pinAlpha = Math.max(0, 1 - (S.layoutT || 0) * 1.5);
    if (pinAlpha > 0.01) {
    ctx.save(); ctx.globalAlpha = pinAlpha;
    // 핀볼 필드
    ctx.fillStyle = '#00000022'; ctx.fillRect(r.pins.x, r.pins.y, r.pins.w, r.pins.h);
    for (const p of S.pegs) {
      const px = r.pins.x + p.fx * r.pins.w, py = r.pins.y + p.fy * r.pins.h;
      const def = PEG_TYPES[p.type] || PEG_TYPES.normal;
      const R = (p.pr || CFG.pegRadius) * (p.alive ? 1 : 0.85);
      ctx.save();
      if (!p.alive) ctx.globalAlpha = 0.15 * pinAlpha;   // 터진 페그: 흐린 유령(다음 턴 부활)
      drawPeg(px, py, R, p.shape || def.shape, def.color, p.alive);
      ctx.restore();
      if (p.alive && def.label) { ctx.fillStyle = '#1a1430'; ctx.font = 'bold ' + Math.max(8, Math.round((p.pr || CFG.pegRadius) * 1.05)) + 'px system-ui'; ctx.textAlign = 'center'; ctx.fillText(def.label, px, py + (p.pr || CFG.pegRadius) * 0.35); }
    }
    // 볼(발사볼=흰색, 페그에서 변환된 볼=페그 색)
    for (const b of S.balls) {
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7);
      ctx.fillStyle = b.color || '#eafcff'; ctx.fill();
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

    // 골 포켓
    const g = r.goal, pw = g.w / 9;
    for (let i = 0; i < 9; i++) {
      const pk = S.pockets[i]; const x = g.x + i * pw;
      const isC = pk.type === 'charge', isB = pk.type === 'buff';
      ctx.fillStyle = isC ? laneHex(pk.lane) + '55' : isB ? '#66ccff33' : '#ffffff08';
      ctx.fillRect(x + 1, g.y + 2, pw - 2, g.h - 4);
      ctx.strokeStyle = '#ffffff18'; ctx.strokeRect(x + 1, g.y + 2, pw - 2, g.h - 4);
      ctx.fillStyle = isC ? laneHex(pk.lane) : isB ? '#6cf' : '#4a4570';
      ctx.font = 'bold ' + Math.max(11, Math.round(Math.min(pw * 0.5, g.h * 0.5))) + 'px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(isC ? '◆' : isB ? '♥' : '×', x + pw / 2, g.y + g.h / 2 + Math.min(pw * 0.18, g.h * 0.18));
    }
    ctx.restore();
    }  // /pinAlpha

    // 플로팅 텍스트
    for (const f of anim.floats) {
      ctx.globalAlpha = Math.max(0, f.t); ctx.fillStyle = f.color; ctx.textAlign = 'center';
      ctx.font = 'bold ' + (f.big ? 18 : 13) + 'px system-ui';
      ctx.fillText(f.text, f.x, f.y - (1 - f.t) * 24); ctx.globalAlpha = 1;
    }
    for (const fl of anim.flashes) {
      ctx.globalAlpha = fl.t * 0.5; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(fl.x, fl.y, (fl.big ? 16 : 10) * (1.4 - fl.t), 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
    }
    // 전투 발사체(빔): 쏜 캐릭터 → 적
    for (const s of anim.shots) {
      const tt = Math.min(1, s.t);
      const cx = s.sx + (s.ex - s.sx) * tt, cy = s.sy + (s.ey - s.sy) * tt;
      const tailT = Math.max(0, tt - 0.3);
      const bx = s.sx + (s.ex - s.sx) * tailT, by = s.sy + (s.ey - s.sy) * tailT;
      ctx.save();
      ctx.globalAlpha = 0.9 * Math.min(1, (1.15 - s.t) / 0.5);
      ctx.strokeStyle = s.color; ctx.lineWidth = s.big ? 4 : 2.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(cx, cy); ctx.stroke();
      ctx.globalAlpha = Math.min(1, (1.15 - s.t) / 0.4);
      ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(cx, cy, s.big ? 6 : 4, 0, 7); ctx.fill();
      ctx.restore();
    }
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
  }

  // ============ 루프 ============
  function loop(ts) {
    const d = Math.min(0.032, (ts - lastTs) / 1000 || 0.016); lastTs = ts;
    if (S && !S.over) {
      // 장전↔전투 레이아웃 부드럽게 보간(~0.35s)
      const tgt = S.layoutTarget || 0;
      if (S.layoutT !== tgt) { const step = d / 0.35; S.layoutT = (S.layoutT < tgt) ? Math.min(tgt, S.layoutT + step) : Math.max(tgt, S.layoutT - step); }
      if (S.phase === 'load') stepBalls(d);
      else if (S.phase === 'battle') { stepBattle(d); checkBossThreshold(); }
      for (let i = anim.floats.length - 1; i >= 0; i--) { anim.floats[i].t -= d * 1.2; if (anim.floats[i].t <= 0) anim.floats.splice(i, 1); }
      for (let i = anim.flashes.length - 1; i >= 0; i--) { anim.flashes[i].t -= d * 3; if (anim.flashes[i].t <= 0) anim.flashes.splice(i, 1); }
      for (let i = anim.shots.length - 1; i >= 0; i--) { anim.shots[i].t += d * 6; if (anim.shots[i].t >= 1.15) anim.shots.splice(i, 1); }
      for (const c of S.chars) if (c.fireT > 0) c.fireT = Math.max(0, c.fireT - d * 4);
      for (const e of S.enemies) if (e.hitT > 0) e.hitT = Math.max(0, e.hitT - d * 5);
      draw();
    }
    requestAnimationFrame(loop);
  }

  // ============ HUD·스킬 UI ============
  function syncHud() {
    $('c-level').textContent = 'Lv.' + S.level;
    $('exp-fill').style.width = (100 * S.exp / S.expNext) + '%';
  }
  function renderSkills() {
    const row = $('skill-row'); row.replaceChildren();
    for (const c of S.chars) {
      const sk = c.ref.active; const ready = c.gauge >= sk.gauge;
      const b = document.createElement('button');
      b.className = 'skillbtn' + (ready ? ' ready' : '') + (c.armed ? ' armed' : '');
      b.textContent = c.ref.name + ' ' + sk.name + ' ' + Math.min(c.gauge, sk.gauge) + '/' + sk.gauge;
      b.onclick = () => { if (c.gauge >= sk.gauge) { c.armed = !c.armed; renderSkills(); } };
      row.append(b);
    }
  }

  // ============ 입력 ============
  function canvasPoint(e) { const rect = canvas.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top }; }
  function aimDown(e) { if (!S || S.phase !== 'load' || S.launchesLeft <= 0) return; e.preventDefault(); Sound.resume(); aimActive = true; const p = canvasPoint(e); aimX = p.x; aimY = p.y; }
  function aimMove(e) { if (!aimActive) return; e.preventDefault(); const p = canvasPoint(e); aimX = p.x; aimY = p.y; }
  function aimUp(e) { if (!aimActive) return; e.preventDefault(); aimActive = false; launchBall(aimDir(aimX, aimY)); }

  // ============ 와이어링 ============
  Meta.load();
  Meta.init({ onSortie: startRun });
  Sound.syncIcons();
  document.querySelectorAll('.mute-btn').forEach(b => b.onclick = () => Sound.toggle());
  $('btn-start').onclick = () => { Sound.resume(); Sound.play('click'); show('lobby'); Meta.renderLobby(); };
  $('btn-result').onclick = () => { $('result').hidden = true; show('lobby'); Meta.renderLobby(); };
  $('btn-auto').onclick = () => { S.autoSkill = !S.autoSkill; $('btn-auto').textContent = '자동 ' + (S.autoSkill ? 'ON' : 'OFF'); $('btn-auto').classList.toggle('on', S.autoSkill); };
  canvas.addEventListener('pointerdown', aimDown);
  canvas.addEventListener('pointermove', aimMove);
  canvas.addEventListener('pointerup', aimUp);
  canvas.addEventListener('pointercancel', () => { aimActive = false; });
  window.addEventListener('resize', () => { if (!$('combat').hidden) resize(); });

  // 디버그/스모크 훅
  window.__PONGTRESS__ = {
    get S() { return S; }, get anim() { return anim; }, startRun, launchBall, enterBattle, CFG,
    setPattern(n) { forcedPattern = n; }, patternList() { return Object.keys(pegPatterns(1.3, CFG.pegStep)); },
    tick(dt) { if (!S || S.over) return; if (S.phase === 'load') stepBalls(dt); else if (S.phase === 'battle') { stepBattle(dt); checkBossThreshold(); } },
    render() { if (S) draw(); }
  };

  // 헤드리스 자가 테스트: ?sim=1 로 런을 자동 진행하며 런타임 오류·상태를 #boot-error 에 남긴다.
  function runSelfTest() {
    const qs = new URLSearchParams(location.search);
    const stg = +qs.get('stage'); if (stg >= 1 && stg <= STAGE_MAX) { Meta.state.maxStage = STAGE_MAX; Meta.state.stage = stg; }  // 밸런스 테스트용 스테이지 지정
    const lv = +qs.get('lvl'), sr = +qs.get('star');
    if (lv >= 1 || sr >= 1) Object.keys(Meta.state.owned).forEach(id => { if (lv >= 1) Meta.state.owned[id].level = lv; if (sr >= 1) Meta.state.owned[id].star = sr; });
    startRun();
    if (qs.has('win')) { S.atkBonus += 60; S.autoSkill = true; }
    let ticks = 0, launched = 0;
    const iv = setInterval(() => {
      ticks++;
      try {
        // 헤드리스에선 rAF가 안 도므로 물리를 직접 펌핑(브라우저는 loop가 담당)
        for (let k = 0; k < 6 && !S.over; k++) {
          if (S.phase === 'load') stepBalls(0.03);
          else if (S.phase === 'battle') { stepBattle(0.03); checkBossThreshold(); }
        }
        if (!$('result').hidden) { done('result:' + $('result-title').textContent); return; }
        if (!$('reward').hidden) { const b = document.querySelector('.reward-card'); if (b) b.click(); return; }
        if (S.phase === 'load' && S.launchesLeft > 0 && S.balls.length === 0) { launchBall(); launched++; return; }
        if (ticks > 1500) { done('timeout'); }
      } catch (e) { done('EXC:' + e.message + ' @' + (e.stack ? e.stack.split('\n')[1].trim() : '?')); }
    }, 8);
    function done(msg) { clearInterval(iv); const s = S || {}; boot('SIM ' + msg + ' | phase=' + s.phase + ' launchesLeft=' + s.launchesLeft + ' balls=' + (s.balls ? s.balls.length : '?') + ' launched=' + launched + ' lvl=' + s.level + ' wall=' + Math.ceil(s.wallHp || 0) + '/' + s.wallHpMax + ' combat=' + s.combatIndex + ' enemies=' + (s.enemies ? s.enemies.length : '?') + ' turns=' + (s._turns || 0)); }
  }
  if (new URLSearchParams(location.search).has('sim')) setTimeout(runSelfTest, 50);
})();
