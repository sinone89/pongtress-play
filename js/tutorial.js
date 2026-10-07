'use strict';
/* PONGTRESS 튜토리얼 v3 — 스틸앤샷(steal-and-shot) 방식 · 3챕터 · 시범 장면(슬로모션 · 정지 설명)
 *  · 가이드 캐릭터(루비)가 말풍선으로 안내하고, 짚는 곳만 밝게 남기는 스포트라이트(어두운 막 4장 + 빛나는 테두리)로 엉뚱한 곳을 못 누르게 한다.
 *  · 단계(step)는 세 종류: 'next'(설명 — [다음]) · 'do'(직접 해 보기 — 표시된 곳을 누르면 조건을 감지해 자동으로 넘어감) · 'scene'(시범 장면 — 아래 박자들).
 *    한 카드 = 한 가지(40자 안팎). 세부는 도움말(?)과 '처음 만났을 때 팁'으로 넘긴다.
 *  · ① TOUR = 온보딩 3챕터(말풍선 위 1/3 · 구역 이름 표시)
 *       1 첫 전투  — 튜토리얼 전투: 분기 지도 없이 1회 · 루비 1명 · 약한 적 · 패배 불가(game.js startRun mode 'tutorial').
 *                    화면 → 탄약(시범) → ×2·×5(시범) → 잭팟(시범) → 조준(점선) → 직접 쏘기 → 전투 → 적 전진 → 승리
 *       2 영입과 편성 — 상점의 튜토리얼 가챠 1회(보라 확정) → 능력치 → 편성 탭에서 직접 배치
 *       3 홈 · 출격 · 미션 → 완료 선물(기존 재화 + 코코). 코코는 자동 배치하지 않는다(플레이어가 편성 탭에서 직접).
 *    ② TIPS = 처음 만났을 때 한 번(투어가 끝난 뒤 · 한 번에 하나(20초 간격) · [자세히 ›] → 도움말).
 *  · 시범 장면(scene): 한 단계 안에 '박자(beat)'가 여러 개 — 박자 종류
 *       next  카드 + [다음](pause:true 면 게임을 멈춘다)   do  직접 해 보기   watch  카드 없이 지켜보기(until 이 참이면 다음 박자 · slow 로 슬로모션)
 *    시범은 게임이 실제로 쓰는 물리·장전 규칙 그대로다 — 루비가 시범 볼(demo)을 한 발 쏘고(발사 횟수는 안 줄어듦), 맞은 탄약·들어간 칸의 효과도 진짜다.
 *    game.js 가 열어 둔 도구: traceShot(미리 굴려 첫 접촉 탄약 찾기) · spawnDemoBall · spawnBalls(demo) · setTimeScale(슬로모션) · setDemoAim(점선만 보이기) · pegPos/pocketRect/jackRect/ammoPillRect.
 *  · 건너뛰기: 확인 팝업(경고 + 지금 받는 보상)에서 [확인]을 눌러야만 건너뛴다 — 그 순간 아직 못 받은 동료(보라·코코)와 완료 재화를 받는다(자동 배치 없음).
 *  · 다시 보기(계정 메뉴·도움말): 챕터 선택. 보상·가챠 잠금 없음(review).
 *  · 진행·본 안내는 계정 세이브(Meta.state.tut = { v:2, at, done, offered, seen, battle, pulled, rewarded, review })에 저장 → 새로고침해도 이어진다(at = 단계 id, 장면은 처음 박자부터 다시).
 *  · 전투 중 설명 카드는 게임을 멈춘다(window.__tutPause 를 game.js 루프가 본다). ?sim=1(헤드리스 시뮬)·?notut 에서는 꺼진다.
 * 로드 순서: audio → spritemeta → artmeta → content → meta → game → tutorial → help.
 */
const Tutorial = (function () {
  const $ = (id) => document.getElementById(id);
  const qs = new URLSearchParams(location.search);
  let disabled = qs.has('sim') || qs.has('notut');
  const GUIDE = { id: 'knight', name: '루비' };
  const CHAPTERS = [{ n: 1, name: '첫 전투' }, { n: 2, name: '영입과 편성' }, { n: 3, name: '홈 · 출격 · 미션' }];
  const TIP_GAP = 20000;                                        // 팁과 팁 사이 최소 간격(ms) — 한 번에 하나씩

  // ═════════ 상태·조회 도우미 ═════════
  const meta = () => (typeof Meta !== 'undefined' ? Meta : null);
  function tut() {
    const m = meta() && meta().state; if (!m) return null;
    if (!m.tut || typeof m.tut !== 'object') m.tut = { v: 2, at: 'c1-hello', done: true, offered: false, seen: {}, battle: true, pulled: true, rewarded: true, review: 0 };   // 방어: 기존 계정 취급
    if (!m.tut.seen) m.tut.seen = {};
    return m.tut;
  }
  const persist = () => { try { meta().save(); } catch (e) {} };
  const game = () => window.__PONGTRESS__ || null;
  const run = () => { const g = game(); return g ? g.S : null; };                // 런 상태(없으면 null)
  const vis = (id) => { const e = $(id); return !!e && e.getClientRects().length > 0; };   // 실제로 보이는가(조상 hidden 포함, fixed 모달도 OK)
  const q = (sel) => document.querySelector(sel);
  const lobbyOn = () => vis('lobby'), combatOn = () => vis('combat');
  const loginOn = () => { const l = $('login'); return !!l && l.classList.contains('show'); };
  const tabOn = (t) => vis('tab-' + t);
  const CLAIMABLE = ['data-attend', 'data-dm', 'data-dmbonus', 'data-mission'].map((a) => '#mission-list [' + a + ']:not([disabled])').join(',');   // 미션 탭에서 지금 받을 수 있는 버튼(출석 · 일일 미션 · 보너스 · 도전 과제)
  const navBtn = (k) => q('#lobby-nav .tabbtn[data-tab="' + k + '"]');
  const goTab = (k) => { const b = navBtn(k); if (b) b.click(); };
  const partyCount = () => document.querySelectorAll('#lane-slots .lane-slot.on').length;
  const launched = () => { const s = run(); return s ? (s.launchedThisTurn || 0) : 0; };
  const reviewing = () => { const t = tut(); return !!t && !!t.review; };       // 다시 보기 중인가(보상·가챠 없음)
  // 장전 화면이 자리 잡았는가(전투→장전 전환 보간이 끝나고 지도·모달이 없음)
  const loadReady = () => { const s = run(); return !!s && s.phase === 'load' && (s.layoutT || 0) < 0.05 && combatOn() && !vis('map') && !vis('reward') && !vis('run-modal') && !vis('result'); };
  const inTutBattle = () => { const s = run(); return !!s && !!s.tutorial && combatOn(); };
  const noBalls = () => { const s = run(); return !!s && s.balls.length === 0; };
  const lane0 = () => { const s = run(); return s ? s.chars.find(c => c.lane === 0) : null; };
  const ammo0 = () => { const c = lane0(); return c ? c.ammo : 0; };

  // ═════════ 짚을 영역 계산 ═════════
  // 영역 = {l,t,w,h}(뷰포트 좌표). 대상은 요소·영역·배열(합집합)·함수(쪽 번호를 받음) 모두 가능.
  function rectOf(t, pi) {
    if (typeof t === 'function') t = t(pi || 0);
    if (!t) return null;
    if (Array.isArray(t)) {
      const rs = t.map(x => rectOf(x, pi)).filter(Boolean); if (!rs.length) return null;
      const l = Math.min(...rs.map(r => r.l)), tp = Math.min(...rs.map(r => r.t)), rr = Math.max(...rs.map(r => r.l + r.w)), bb = Math.max(...rs.map(r => r.t + r.h));
      return { l, t: tp, w: rr - l, h: bb - tp };
    }
    if (t.getBoundingClientRect) { const r = t.getBoundingClientRect(); return (r.width < 2 || r.height < 2) ? null : { l: r.left, t: r.top, w: r.width, h: r.height }; }
    return t;
  }
  // 캔버스 px → 뷰포트 좌표(스테이지 scale 보정)
  function cvPt(x, y) { const cv = $('stage'); if (!cv) return null; const c = cv.getBoundingClientRect(), k = cv.clientWidth ? c.width / cv.clientWidth : 1; return { x: c.left + x * k, y: c.top + y * k, k }; }
  function cvRect(R) { const p = R && cvPt(R.x, R.y); return p ? { l: p.x, t: p.y, w: R.w * p.k, h: R.h * p.k } : null; }
  // 전투 캔버스의 영역 → 뷰포트 좌표. 이름: field · wall · goal · pins · danger(적 필드 맨 아래 행) · wallbar(방벽 HP 막대) · jack(잭팟 틀) · ammo(루비 탄수 알약) · pocket:N(포켓 칸) · peg:N(탄약)
  function canvasRect(name) {
    const g = game(); if (!g || !$('stage') || !run()) return null;
    let R = null;
    if (name === 'danger') R = g.dangerRowRect();
    else if (name === 'jack') R = g.jackRect();
    else if (name === 'ammo') { const c = lane0(); R = c && g.ammoPillRect(c); }
    else if (name === 'wallbar') { const wr = g.layout().wall, hbH = Math.max(8, Math.round(wr.h * 0.16)); R = { x: wr.x + 8, y: wr.y + wr.h - hbH - 3, w: wr.w - 16, h: hbH }; }
    else if (name.indexOf('pocket:') === 0) R = g.pocketRect(+name.slice(7));
    else if (name.indexOf('peg:') === 0) { const p = g.pegPos(+name.slice(4)); R = { x: p.x - p.r * 1.3, y: p.y - p.r * 1.3, w: p.r * 2.6, h: p.r * 2.6 }; }
    else R = g.layout()[name];
    return cvRect(R);
  }
  const center = (t) => { const r = rectOf(t); return r ? { x: r.l + r.w / 2, y: r.t + r.h / 2 } : null; };
  // 조준 시범 손가락(드래그 시범 — WAAPI): 발사구에서 핀볼 판의 (가로 frac, 세로 35%) 쪽으로
  const aimHand = (frac) => () => { const g = game(), L = g && g.launcher(), P = g && g.layout().pins, cv = $('stage'); if (!L || !cv) return null; const c = cv.getBoundingClientRect(); return { from: { l: c.left + L.x - 2, t: c.top + L.y - 2, w: 4, h: 4 }, to: { l: c.left + P.x + P.w * frac - 2, t: c.top + P.y + P.h * 0.35 - 2, w: 4, h: 4 } }; };

  // ═════════ 문구 치환: {gold} {mats} {gems} {docs} {shards} → 재화 아이콘, {ic:이름|이모지} → 아이콘 ═════════
  function fmt(s) {
    return String(s == null ? '' : s).replace(/\{(gold|mats|gems|docs|shards)\}|\{ic:(\w+)\|([^}]*)\}/g, (m, cur, name, em) => cur ? uiCur(cur) : ui(name, em));
  }
  const charName = (id) => { const b = ROSTER.find(c => c.id === id); return b ? b.name : id; };

  // ═════════ 시범 도구(장면이 쓰는 것들) ═════════
  const SC = {};                                                  // 장면 임시 상태(저장 안 함): 고른 탄약·시범 볼·기준 탄수 …
  const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
  const demoBalls = () => { const s = run(); return s ? s.balls.filter(b => b.demo) : []; };
  const demoHarvest = () => demoBalls().filter(b => b.harvest);
  const pegAlive = (i) => { const s = run(); return !!s && !!s.pegs[i] && s.pegs[i].alive; };
  // 발사대에서 위로 훑어(0.5° 간격) '첫 접촉 탄약'가 조건에 맞는 방향 중 가장 볼 만한 것을 고른다 — 곧게 날아가고, 너무 가깝지도 멀지도 않고, 중앙에 가까운 것
  function pickShot(match, opt) {
    opt = opt || {};
    const g = game(), s = run(); if (!g || !s) return null;
    const L = g.launcher(), bu = g.BU; let best = null;
    for (let deg = -150; deg <= -30; deg += 0.5) {
      const a = deg * Math.PI / 180, dir = { dx: Math.cos(a), dy: Math.sin(a) };
      const tr = g.traceShot(dir, { maxHits: 1, tail: 0, maxSteps: 1500, walls: false });   // walls:false = 벽 튕김은 세지 않고 '첫 탄약 접촉'만 본다
      const h = tr.hits[0]; if (!h || h.i == null || tr.end.eaten) continue;
      const p = s.pegs[h.i]; if (!p.alive || !match(p, h.i)) continue;
      const dist = Math.hypot(h.x - L.x, h.y - L.y) / bu, straight = tr.pts.length <= 2;
      const score = (straight ? 0 : 400) + Math.abs(dist - (opt.dist || 210)) + Math.abs(p.fx - 0.5) * 90 - (h.i === opt.prefer ? 320 : 0);
      if (!best || score < best.score) best = { score, dir, i: h.i, deg, dist };
    }
    return best;
  }
  // 시범 샷 관리: 방향은 '지금 판 크기'에 묶여 있으므로 화면 크기·배율이 바뀌면(회전·창 크기) 다시 고른다. 같은 탄약를 되도록 유지한다.
  function shotFor(key, match, plant) {
    const g = game(); if (!g || !run()) return null;
    const P = g.layout().pins, sig = [P.x, P.y, P.w, P.h, g.BU].map(v => Math.round(v * 10)).join(',');
    const cur = SC[key];
    if (!cur || cur.sig !== sig) {
      let ns = pickShot(match, { prefer: cur ? cur.i : -1 });
      if (!ns && plant) { plantPeg(plant); ns = pickShot(match, { prefer: -1 }); }       // 직접 닿는 그런 탄약가 판에 없으면 하나 심는다
      if (ns) { ns.sig = sig; SC[key] = ns; } else if (cur) cur.sig = sig;
    }
    return SC[key] || null;
  }
  // 시범용으로 type 탄약 하나를 심는다: 발사대에서 곧게 닿는 일반 탄약 중 판 아래쪽·가운데 가까운 것을 type 으로 바꾼다(원래 판의 ×2·×5 는 위쪽 탄약에 가려 직접 닿지 않을 때가 많다). 튜토리얼 전투 판에만 영향
  function plantPeg(type) {
    const s = run(); if (!s) return;
    const sh = pickShot((p) => p.type === 'normal' && !p.planted && p.fy > 0.4 && p.fx > 0.22 && p.fx < 0.78, { dist: 230 }); if (!sh) return;
    const p = s.pegs[sh.i], np = makePeg(p.fx, p.fy, type);
    p.type = np.type; p.pr = np.pr; p.shape = np.shape; p.planted = true; p.alive = true;
  }
  const refreshShots = (d) => { const sh = d && d.step && d.step.shot; if (sh) shotFor(sh.key, sh.match, sh.plant); };
  // 시범 볼이 첫 탄약를 맞혀 사라졌다(예상한 탄약가 아니어도 이 박자는 끝낸다) · 맞기 전까지 목표 탄약에 다가갈수록 시간이 느려진다
  const shotHit = () => { const s = run(); return !!s && !!SC.ball && s.balls.indexOf(SC.ball) < 0; };
  const demoSlow = () => { const g = game(); return SC.ball && SC.peg && g ? slowToward(SC.ball, g.pegPos(SC.peg.i), 6, 130, 0.18) : 1; };
  const M_NORMAL = (p) => p.type === 'normal' && p.fy > 0.3 && p.fx > 0.15 && p.fx < 0.85, M_X2 = (p) => p.type === 'mult2' && p.fy > 0.2, M_X5 = (p) => p.type === 'mult5' && p.fy > 0.2;
  // 목표 {x,y,r} 에 다가갈수록 시간이 느려진다: far(기준 px) 밖 = 1배 · near 안 = min 배
  function slowToward(b, tg, near, far, min) { const g = game(); if (!b || !tg || !g) return 1; const d = Math.hypot(b.x - tg.x, b.y - tg.y) - b.r - tg.r; return min + (1 - min) * smooth((d - near * g.BU) / ((far - near) * g.BU)); }
  function parkJack(cell) { const s = run(); if (!s || !s.jack) return; s.jackHold = true; s.jack.x = (cell + 0.5) / 9; }   // 잭팟 틀을 칸 위에 멈춰 둔다(시범 볼이 우연히 맞지 않게 / 잭팟 시범용)
  function releaseJack() { const s = run(); if (s) s.jackHold = false; }
  // 표식: {x,y,r} 고리 · {x,y,w,h,sq:true} 사각 테두리 · {x,y,text,below} 말풍선 — 모두 캔버스 px
  const ring = (x, y, r) => ({ x, y, r });
  const pegRing = (i, k) => { const p = game().pegPos(i); return ring(p.x, p.y, p.r * (k || 1.9)); };   // 이미 터진 탄약도 그 자리에 고리를 둘 수 있다
  const ballRings = () => { const hs = demoBalls().filter(b => b.harvest); return hs.map(b => ring(b.x, b.y, b.r * (hs.length > 2 ? 1.55 : 2.3))); };
  const cellMark = (i, text) => { const g = game(), R = g.pocketRect(i); return [{ x: R.x, y: R.y, w: R.w, h: R.h, sq: true }].concat(text ? [{ x: R.x + R.w / 2, y: R.y - 4, text }] : []); };
  const enemyRect = (e) => { const g = game(), s = run(); if (!g || !s || !e) return null; const p = g.enemyPos(e), f = g.layout().field, cw = f.w / CFG.fieldLanes, ch = f.h / CFG.fieldRows; return cvRect({ x: p.x - cw / 2, y: p.y - ch / 2, w: cw, h: ch }); };
  const hurtEnemy = () => { const s = run(); return s ? s.enemies.find(e => e.hp < e.maxHp) : null; };
  // 장면 정리: 슬로모션·시범 조준·잭팟 멈춤·시범 목표 칸·표식을 모두 되돌린다
  function cleanupScene() {
    const g = game(), s = run();
    try { if (g) { g.setTimeScale(1); g.setDemoAim(null); } } catch (e) {}
    if (s) { s.jackHold = false; s.demoCell = null; }
    Object.keys(SC).forEach(k => { delete SC[k]; });
    lastSlow = 1; try { setMarks([]); } catch (e) {}
  }

  // ═════════ TOUR(온보딩 3챕터) — 단계는 id 로 저장(순서를 바꿔도 진행이 깨지지 않게) ═════════
  // 단계 필드: id · ch(챕터) · sec(구역 이름) · ctx('lobby'|'run') · kind('next'|'do'|'scene') · msg(문자열·함수·배열=여러 쪽) · target(요소·영역·함수(쪽 번호)) · label(버튼 글자) · tap(힌트)
  //   dim(false=막 없이 말풍선만) · lock(true=막 없어도 뒤 화면 터치는 막음) · pause(전투 정지) · noSkip(건너뛰기 숨김) · dlg('top'|'bottom'|'mid') · marks(표식 목록을 돌려주는 함수) · aimDemo(조준 시범 손가락 점들)
  //   buttons(마지막 쪽의 버튼 목록을 돌려주는 함수 → 없으면 기본 [다음]) · onButton(a) · modal(이 단계에서 열려 있어도 되는 모달 id) · onEnter · onLeave
  //   skip(진입 시 이미 충족/해당 없음이면 건너뜀) · done(충족되면 자동 진행) · ready(false 면 잠시 숨김) · expire(기다리는 동안 이미 지나갔으면 건너뜀) · hand(끌기 시범) · tab(필요한 로비 탭 — 자동 이동)
  // 장면(scene) = beats[] — 박자 필드: kind · msg · … (위와 같음) + run(박자 시작 때 한 번) · until(watch 의 끝 조건) · after(끝 조건 뒤 더 지켜볼 ms) · slow(슬로모션 배율 — 숫자·함수) · caption(지켜보는 동안 위쪽 안내) · maxMs(안전 제한) · aimFix(고정 시범 조준점)
  const TOUR = [
    // ── 챕터 1 · 첫 전투 (튜토리얼 전투 — 루비 1명) ──
    { id: 'c1-hello', ch: 1, sec: '시작', ctx: 'run', kind: 'next', pause: true, label: '좋아요!', ready: loadReady,
      msg: '어서 와요, 지휘관님! 저는 <b>루비</b>예요. 같이 첫 전투를 해 봐요!' },
    { id: 'c1-field', ch: 1, sec: '화면', ctx: 'run', kind: 'next', pause: true, ready: loadReady,
      msg: '위쪽이 <b>적 필드</b>예요. 적은 한 턴이 끝날 때마다 <b>한 칸씩</b> 내려와요.', target: () => canvasRect('field') },
    { id: 'c1-wall', ch: 1, sec: '화면', ctx: 'run', kind: 'next', pause: true, ready: loadReady,
      msg: ['적이 <b>빨간 점선</b>을 넘으면 <b>방벽</b>을 공격해요.', '아래 <b>초록 막대</b>가 방벽의 <b>HP</b>예요. 0이 되면 패배해요!'],
      target: (pi) => canvasRect(pi === 0 ? 'danger' : 'wallbar') },
    { id: 'c1-board', ch: 1, sec: '화면', ctx: 'run', kind: 'next', pause: true, ready: loadReady,
      msg: '아래는 <b>핀볼 판</b>이에요. 여기서 쏜 볼이 <b>탄약</b>을 맞히면 동료의 <b>탄환</b>이 <b>장전</b>돼요.', target: () => [canvasRect('pins'), canvasRect('goal')] },

    // 장면 · 탄약 → 장전 볼 → 탄창 (시범 볼 1발, 슬로모션)
    { id: 'c1-peg', ch: 1, sec: '탄약', ctx: 'run', kind: 'scene', ready: () => loadReady() && noBalls(), shot: { key: 'peg', match: M_NORMAL },
      onEnter: () => { cleanupScene(); const s = run(); if (!s) return; s.demoCell = 2; parkJack(8); SC.a0 = ammo0(); shotFor('peg', M_NORMAL); },
      skip: () => !SC.peg, onLeave: () => { cleanupScene(); },
      beats: [
        { kind: 'next', pause: true, lock: true, dim: false, dlg: 'top', label: '보여 주세요', marks: () => [pegRing(SC.peg.i)],
          msg: '볼이 <b>탄약</b>(동그란 장애물)을 맞히면 어떻게 될까요? 제가 한 발 쏠게요!' },
        { kind: 'watch', caption: '잘 봐요!', run: () => { SC.ball = game().spawnDemoBall(SC.peg.dir, { once: true }); },
          slow: demoSlow, until: shotHit, maxMs: 9000 },
        { kind: 'next', pause: true, lock: true, dim: false, dlg: 'top', label: '다음', marks: () => { const rs = ballRings(); return rs.concat(rs.length ? [{ x: rs[0].x, y: rs[0].y - rs[0].r - 6, text: '장전 볼' }] : []); },
          msg: '맞은 탄약이 <b>장전 볼</b>로 바뀌었어요! 볼은 위쪽으로 올라가요.' },
        { kind: 'watch', caption: '위로 올라가요', slow: () => (demoHarvest()[0] ? 0.4 : 1), marks: () => ballRings(),
          until: () => { const b = demoHarvest()[0], g = game(); return !b || b.y < g.layout().pins.y + 105 * g.BU; }, maxMs: 6000 },
        { kind: 'next', pause: true, lock: true, dim: false, dlg: 'bottom', label: '다음', marks: () => cellMark(2, '탄창').concat(cellMark(7, '꽝 칸').slice(1), ballRings()),
          msg: '위쪽에서 <b>루비 색</b>으로 빛나는 칸이 루비의 <b>탄창</b>이에요. 붉은 사선의 <b>꽝 칸</b>은 장전이 안 돼요.' },
        { kind: 'watch', caption: '들어가요!', slow: 0.22, marks: () => ballRings(), until: () => ammo0() > SC.a0, after: 900, maxMs: 6000 },
        { kind: 'next', pause: true, lock: true, dim: false, dlg: 'bottom', label: '다음', marks: () => ammoMark('탄환 +' + Math.max(1, ammo0() - SC.a0)),
          msg: () => '루비의 탄환이 <b>+' + Math.max(1, ammo0() - SC.a0) + '</b> 장전됐어요! 이 숫자만큼 루비가 사격해요.' }
      ] },

    // 장면 · ×2 탄약
    { id: 'c1-x2', ch: 1, sec: '증식', ctx: 'run', kind: 'scene', ready: () => loadReady() && noBalls(), shot: { key: 'peg', match: M_X2, plant: 'mult2' },
      onEnter: () => { cleanupScene(); const s = run(); if (!s) return; s.demoCell = 3; parkJack(8); SC.a0 = ammo0(); shotFor('peg', M_X2, 'mult2'); },
      skip: () => !SC.peg, onLeave: () => { cleanupScene(); },
      beats: [
        { kind: 'next', pause: true, lock: true, dim: false, dlg: 'top', label: '보여 주세요', marks: () => [pegRing(SC.peg.i), calloutAtPeg(SC.peg.i, '×2')],
          msg: '<b>보라색 마름모</b>는 <b>×2 탄약</b>이에요. 맞히면 볼이 <b>2개</b>로 늘어나요!' },
        { kind: 'watch', caption: '×2 탄약!', run: () => { SC.ball = game().spawnDemoBall(SC.peg.dir, { once: true }); },
          slow: demoSlow, until: shotHit, maxMs: 9000 },
        { kind: 'next', pause: true, lock: true, dim: false, dlg: 'top', label: '다음', marks: () => ballRings(),
          msg: '봐요, 볼이 <b>2개</b>가 됐죠?' },
        { kind: 'watch', caption: '올라가요', until: () => demoHarvest().length === 0, after: 500, maxMs: 6000 }
      ] },

    // 장면 · ×5 탄약
    { id: 'c1-x5', ch: 1, sec: '증식', ctx: 'run', kind: 'scene', ready: () => loadReady() && noBalls(), shot: { key: 'peg', match: M_X5, plant: 'mult5' },
      onEnter: () => { cleanupScene(); const s = run(); if (!s) return; s.demoCell = 4; parkJack(8); SC.a0 = ammo0(); shotFor('peg', M_X5, 'mult5'); },
      skip: () => !SC.peg, onLeave: () => { cleanupScene(); },
      beats: [
        { kind: 'next', pause: true, lock: true, dim: false, dlg: 'top', label: '보여 주세요', marks: () => [pegRing(SC.peg.i, 2.1), calloutAtPeg(SC.peg.i, '×5')],
          msg: '<b>별 모양</b>은 <b>×5 탄약</b>! 맞히면 볼이 <b>5개</b>나 돼요!' },
        { kind: 'watch', caption: '×5 탄약!', run: () => { SC.ball = game().spawnDemoBall(SC.peg.dir, { once: true }); },
          slow: demoSlow, until: shotHit, maxMs: 9000 },
        { kind: 'next', pause: true, lock: true, dim: false, dlg: 'top', label: '다음', marks: () => ballRings(),
          msg: '<b>5개</b>예요! 이런 탄약을 많이 맞힐수록 탄환이 쑥쑥 늘어요.' },
        { kind: 'watch', caption: '올라가요', until: () => demoHarvest().length === 0, after: 500, maxMs: 6000 }
      ] },

    // 그 밖의 특수 탄약(시범 없이 짚어 주기)
    { id: 'c1-others', ch: 1, sec: '탄약', ctx: 'run', kind: 'next', pause: true, lock: true, dim: false, dlg: 'top', label: '알겠어요', ready: () => loadReady() && noBalls(),
      onEnter: () => { cleanupScene(); SC.gold = nearestPeg('gold'); SC.chg = nearestPeg('charge'); },
      skip: () => SC.gold == null && SC.chg == null, onLeave: () => { cleanupScene(); },
      marks: () => [].concat(SC.gold != null ? [pegRing(SC.gold), calloutAtPeg(SC.gold, '크레딧')] : [], SC.chg != null ? [pegRing(SC.chg), calloutAtPeg(SC.chg, '장전 ×3')] : []),
      msg: '<b>황금빛 육각형</b>은 <b>크레딧</b>을, <b>초록 삼각형</b>은 <b>장전 ×3</b> 볼을 줘요.' },

    // 장면 · 잭팟
    { id: 'c1-jack', ch: 1, sec: '잭팟', ctx: 'run', kind: 'scene', ready: () => loadReady() && noBalls(),
      onEnter: () => { cleanupScene(); const s = run(); if (!s) return; releaseJack(); SC.a0 = ammo0(); SC.jc = 3; s.demoCell = 3; },
      skip: () => { const s = run(); return !s || !s.jack; }, onLeave: () => { cleanupScene(); },
      beats: [
        { kind: 'next', pause: false, lock: true, dim: false, dlg: 'top', label: '다음', marks: () => jackMark('잭팟'),
          msg: '위쪽에서 <b>금색 테두리</b>가 좌우로 움직이죠? 이게 <b>잭팟</b>이에요!' },
        { kind: 'watch', caption: '잭팟이 칸 위로 와요', run: () => { const s = run(); if (s) s.jackHold = true; },
          frame: () => { const s = run(); if (s && s.jack) s.jack.x += ((SC.jc + 0.5) / 9 - s.jack.x) * 0.2; },
          until: () => { const s = run(); return !s || !s.jack || Math.abs(s.jack.x - (SC.jc + 0.5) / 9) < 0.002; }, maxMs: 4000, marks: () => jackMark('') },
        { kind: 'watch', caption: '잭팟 칸으로 쏙!', run: () => { const g = game(), R = g.pocketRect(SC.jc), pins = g.layout().pins; g.spawnBalls(R.x + R.w / 2, pins.y + pins.h * 0.62, 1, '#e8f4ff', 1, { demo: true, toCell: SC.jc }); },
          slow: () => { const b = demoHarvest()[0], g = game(); return b ? 0.45 : 1; },
          until: () => { const b = demoHarvest()[0], g = game(); return !b || b.y < g.layout().pins.y + 110 * g.BU; }, maxMs: 6000, marks: () => jackMark('').concat(ballRings()) },
        { kind: 'next', pause: true, lock: true, dim: false, dlg: 'bottom', label: '보기', marks: () => jackMark('잭팟 칸!').concat(ballRings()),
          msg: '<b>잭팟 칸</b>에 들어간 볼은 장전이 <b>3배</b>예요! 어떻게 되는지 봐요.' },
        { kind: 'watch', caption: '들어가요!', slow: 0.2, until: () => ammo0() > SC.a0, after: 1100, maxMs: 6000, marks: () => jackMark('').concat(ballRings()) },
        { kind: 'next', pause: true, lock: true, dim: false, dlg: 'bottom', label: '다음', marks: () => ammoMark('탄환 +' + Math.max(1, ammo0() - SC.a0)),
          msg: () => ['<b>+1</b>짜리 볼이 <b>+' + Math.max(1, ammo0() - SC.a0) + '</b>이 됐어요! 타이밍을 맞춰 잭팟을 노려 봐요.', '잭팟은 <b>탄창</b> 위에서만 터져요. <b>꽝 칸</b>이면 크레딧 +10만 줘요.'] }
      ] },

    // 장면 · 조준과 점선
    { id: 'c1-guide', ch: 1, sec: '조준', ctx: 'run', kind: 'scene', ready: () => loadReady() && noBalls(),
      onEnter: () => { cleanupScene(); },
      onLeave: () => { cleanupScene(); },
      beats: [
        { kind: 'next', pause: true, lock: true, dim: false, dlg: 'top', label: '다음', aimDemo: [{ fx: 0.28, fy: 0.3 }, { fx: 0.74, fy: 0.34 }],
          msg: '판을 <b>끌어서 조준</b>해요. <b>점선</b>이 볼이 갈 길을 미리 보여 줘요.' },
        { kind: 'next', pause: true, lock: true, dim: false, dlg: 'top', label: '다음', aimFix: () => { const g = game(), P = g.layout().pins; return { x: P.x + P.w * 0.6, y: P.y + P.h * 0.3 }; },
          marks: () => aimHitCall(),
          msg: '<b>하얀 고리</b>는 볼이 <b>맞힐 탄약</b>이에요. 점선은 <b>3번 튕길 때까지</b>만 보여 줘요.' },
        { kind: 'do', tap: '표시된 판 위에서 끌었다 놓아요', target: () => canvasRect('pins'), hand: aimHand(0.7), done: () => launched() >= 1,
          msg: '이제 직접 쏴 봐요! <b>끌어서 조준</b>하고, 손을 떼면 <b>발사</b>!' }
      ] },
    { id: 'c1-result1', ch: 1, sec: '조준', ctx: 'run', kind: 'next', pause: true, lock: true, dim: false, dlg: 'bottom', label: '알겠어요',
      ready: () => { const s = run(); return loadReady() && s.balls.length === 0 && launched() >= 1 && s.launchesLeft > 0; },
      expire: () => { const s = run(); return !!s && (s.phase !== 'load' || s.launchesLeft <= 0); },
      marks: () => ammoMark('탄환 ×' + ammo0()),
      msg: () => '볼이 다 들어왔어요! 루비의 탄환은 지금 <b>×' + ammo0() + '</b>이에요. 볼이 <b>한 발</b> 남았어요.' },
    { id: 'c1-aim2', ch: 1, sec: '조준', ctx: 'run', kind: 'do', ready: loadReady, tap: '아까처럼 끌었다 놓아요',
      msg: '<b>한 발 더</b> 쏴요! 탄약을 많이 맞힐수록 볼이 늘어나요.', target: () => canvasRect('pins'), hand: aimHand(0.3),
      done: () => { const s = run(); return !s || s.launchesLeft <= 0 || s.phase !== 'load'; } },

    // 전투
    { id: 'c1-battle', ch: 1, sec: '전투', ctx: 'run', kind: 'next', pause: true, ready: () => { const s = run(); return !!s && s.phase === 'battle' && !vis('reward'); },
      msg: '볼을 다 쏘면 <b>전투</b>가 시작돼요. 장전한 만큼 루비가 <b>자동으로 사격</b>해요!',
      target: () => [canvasRect('field'), canvasRect('wall')], onEnter: () => { T.fought = true; } },
    { id: 'c1-hit', ch: 1, sec: '전투', ctx: 'run', kind: 'scene', ready: () => { const s = run(); return !!s && s.phase === 'battle' && s.battleStage === 'shooting'; },
      expire: () => { const s = run(); return !!s && s.phase === 'load' && !!T.fought; }, onLeave: () => { cleanupScene(); },
      beats: [
        { kind: 'watch', until: () => !!hurtEnemy(), maxMs: 9000 },
        { kind: 'next', pause: true, lock: true, dim: false, dlg: 'bottom', label: '알겠어요', marks: () => { const e = hurtEnemy(), g = game(); if (!e) return []; const p = g.enemyPos(e), ch = g.layout().field.h / CFG.fieldRows; return [{ x: p.x, y: p.y - ch * 0.5, text: '피해량' }, { x: p.x, y: p.y + ch * 0.62, text: '남은 HP', below: true }]; },
          msg: '적 위의 <b>숫자</b>는 피해량, 아래 <b>빨간 막대</b>는 남은 <b>HP</b>예요. 0이 되면 쓰러져요!' }
      ] },
    { id: 'c1-advance', ch: 1, sec: '전투', ctx: 'run', kind: 'next', pause: true, label: '알겠어요', ready: () => loadReady() && !!T.fought,
      msg: '턴이 끝나면 적이 <b>한 칸씩 내려오고</b> 새 적도 나타나요. 막지 못하면 방벽이 맞아요!', target: () => canvasRect('field') },
    { id: 'c1-again', ch: 1, sec: '전투', ctx: 'run', kind: 'next', dim: false, label: '알겠어요', ready: () => loadReady() && !!T.fought,
      msg: '다시 <b>장전</b> 차례예요! 이번엔 <b>마음대로</b> 쏴 봐요. 적을 모두 쓰러뜨리면 승리예요.', done: () => { const s = run(); return !!s && s.over; } },
    { id: 'c1-win', ch: 1, sec: '승리', ctx: 'run', kind: 'next', noSkip: false, label: '동료 만나러 가기', ready: () => { const s = run(); return !!s && !!s.tutorial && s.over; },
      msg: '<b>첫 승리!</b> 혼자서도 잘 싸우지만… <b>동료</b>가 있으면 더 든든하겠죠?',
      onLeave: () => { const g = game(); try { g && g.exitTutorialBattle(); } catch (e) {} const t = tut(); t.battle = true; persist(); T.fought = false; } },

    // ── 챕터 2 · 영입과 편성 ──
    { id: 'c2-shop', ch: 2, sec: '가챠', ctx: 'lobby', kind: 'do', tap: '아래 [상점] 탭을 눌러요',
      msg: '이제 <b>동료</b>를 영입하러 가요!', target: () => navBtn('shop'), done: () => tabOn('shop') },
    { id: 'c2-pull', ch: 2, sec: '가챠', ctx: 'lobby', kind: 'do', tab: 'shop', tap: '[튜토리얼 뽑기]를 눌러요', skip: () => reviewing() || !q('[data-gacha="tutorial"]'),
      msg: '<b>첫 뽑기</b>는 <b>무료</b>예요! 새 동료를 뽑아 봐요.', target: () => q('[data-gacha="tutorial"]'), done: () => vis('gacha-modal') },
    { id: 'c2-pull-r', ch: 2, sec: '가챠', ctx: 'lobby', kind: 'next', tab: 'shop', skip: () => !reviewing(),
      msg: '<b>가챠</b>에서 새 동료를 뽑아요. 비용은 단일 {gems}' + GACHA.cost1 + ', 10연 {gems}' + GACHA.cost10 + '이에요. <b>ⓘ</b> 버튼에서 <b>확률</b>도 볼 수 있어요.', target: () => q('.gbanner') },
    { id: 'c2-result', ch: 2, sec: '가챠', ctx: 'lobby', kind: 'do', modal: 'gacha-modal', tap: '[확인]을 눌러요', skip: () => reviewing() || !vis('gacha-modal'),
      msg: '새 동료 <b>' + charName(TUTORIAL.pullId) + '</b>가 합류했어요!', target: () => $('gacha-modal-box'), done: () => !vis('gacha-modal') },
    { id: 'c2-nav-form', ch: 2, sec: '편성', ctx: 'lobby', kind: 'do', tap: '아래 [편성] 탭을 눌러요',
      msg: '이제 동료를 <b>편성</b>해서 전투에 내보내요!', target: () => navBtn('formation'), done: () => tabOn('formation') },
    { id: 'c2-owned', ch: 2, sec: '편성', ctx: 'lobby', kind: 'next', tab: 'formation',
      msg: '<b>보유 동료</b> 목록이에요. 방금 합류한 동료도 여기 있어요!', target: () => $('owned-list') },
    { id: 'c2-card', ch: 2, sec: '능력치', ctx: 'lobby', kind: 'do', tab: 'formation', tap: '동료 카드를 눌러요', skip: () => reviewing() || !cardEl(),
      msg: () => '<b>' + charName(TUTORIAL.pullId) + '</b> 카드를 눌러 <b>능력치</b>를 봐요.', target: () => cardEl(), done: () => vis('char-modal') },
    { id: 'c2-stats', ch: 2, sec: '능력치', ctx: 'lobby', kind: 'next', modal: 'char-modal', skip: () => !vis('char-modal'),
      msg: ['<b>공격</b>은 한 발의 피해, <b>체력</b>은 방벽 HP에 더해져요.', '<b>탄창</b> 수가 많을수록 이 동료의 탄환이 잘 <b>장전</b>돼요!', '아래에는 <b>스킬</b>이 있어요. 전투 중 게이지가 차면 쓸 수 있어요.'],
      target: (pi) => pi === 0 ? statRows(0, 1) : pi === 1 ? statRows(2, 2) : q('#char-modal .cd-skills') },
    { id: 'c2-close', ch: 2, sec: '능력치', ctx: 'lobby', kind: 'do', modal: 'char-modal', tap: '[닫기]를 눌러요', skip: () => !vis('char-modal'),
      msg: '다 봤으면 <b>닫기</b>를 눌러요.', target: () => q('#char-modal .cd-x'), done: () => !vis('char-modal') },
    { id: 'c2-place', ch: 2, sec: '편성', ctx: 'lobby', kind: 'do', tab: 'formation', dlg: 'bottom', tap: '카드를 (길게 눌러) 끌어다 놓거나, 탭한 뒤 [편성]을 눌러요',
      skip: () => !q('#lane-slots .lane-slot.empty') || !q('#owned-list .stchar:not(.locked):not(.placed)'),
      msg: '<b>' + charName(TUTORIAL.pullId) + '</b>를 <b>빈 레인</b>에 배치해요!',
      target: () => $('tab-formation'),
      hand: () => ({ from: q('#owned-list .stchar:not(.locked):not(.placed)'), to: q('#lane-slots .lane-slot.empty') }),
      onEnter: () => { T.placeFrom = partyCount(); }, done: () => partyCount() > (T.placeFrom || 0) },
    { id: 'c2-lanes', ch: 2, sec: '편성', ctx: 'lobby', kind: 'next', tab: 'formation',
      msg: ['레인마다 <b>한 명</b>씩 설 수 있어요.', '부대 <b>체력의 합</b>이 곧 <b>방벽 HP</b>예요!'], target: () => $('lane-slots') },
    { id: 'c2-color', ch: 2, sec: '편성', ctx: 'lobby', kind: 'next', tab: 'formation',
      msg: '레인은 <b>색</b>이 달라요. 전투에서 <b>같은 색 탄창</b>에 볼이 들어가면 그 동료의 탄환이 장전돼요!', target: () => $('lane-slots') },

    // ── 챕터 3 · 홈 · 출격 · 미션 ──
    { id: 'c3-home', ch: 3, sec: '홈', ctx: 'lobby', kind: 'next', tab: 'home',
      msg: '<b>홈</b>에서는 편성한 동료가 알아서 싸워요.', target: () => $('idle-canvas') },
    { id: 'c3-idle', ch: 3, sec: '홈', ctx: 'lobby', kind: 'next', tab: 'home',
      msg: '<b>방치 보상</b>이 시간이 지날수록 쌓여요. 모이면 <b>[받기]</b>를 눌러요!', target: () => $('idle-reward') },
    { id: 'c3-sortie', ch: 3, sec: '출격', ctx: 'lobby', kind: 'next', tab: 'sortie',
      msg: '<b>출격</b> 탭에서 <b>스테이지</b>와 <b>모드</b>를 골라요.', target: () => [$('mode-select'), $('stage-select')] },
    { id: 'c3-party', ch: 3, sec: '출격', ctx: 'lobby', kind: 'next', tab: 'sortie',
      msg: '편성한 <b>부대</b>를 확인하고 <b>[출격]</b>을 누르면 전장으로 나가요!', target: () => [$('sortie-party'), $('btn-sortie')] },
    { id: 'c3-mission', ch: 3, sec: '미션', ctx: 'lobby', kind: 'next', tab: 'mission',
      msg: '<b>미션</b>을 달성하면 보상을 받아요.', target: () => $('mission-list') },
    { id: 'c3-claim', ch: 3, sec: '미션', ctx: 'lobby', kind: 'next', tab: 'mission',
      msg: '목표를 채우면 <b>[받기]</b>를 눌러 보상을 챙겨요!', target: () => $('mission-list') },
    { id: 'c3-reward', ch: 3, sec: '완료', ctx: 'lobby', kind: 'next', noSkip: true, label: '받기', skip: () => reviewing(),
      msg: () => '수고했어요, 지휘관님! <b>튜토리얼 완료</b> 선물이 도착했어요.<br>' + ui('cls_support', '🛠') + '<b>' + charName(TUTORIAL.rewardId) + '</b> 합류 · {gems}<b>' + TUTORIAL.reward.gems + '</b> · {gold}<b>' + TUTORIAL.reward.gold + '</b>',
      onLeave: () => { const m = meta(); try { m && m.tutGrantRewards(); m && m.renderLobby(); } catch (e) {} } },
    { id: 'c3-go', ch: 3, sec: '완료', ctx: 'lobby', kind: 'next', noSkip: true, label: '확인',
      msg: () => reviewing() ? '수고했어요! 모르는 게 생기면 위쪽 <b>?</b> <b>도움말</b>에서 언제든 찾아볼 수 있어요.'
        : '<b>' + charName(TUTORIAL.rewardId) + '</b>는 <b>[편성]</b> 탭에서 직접 배치해 주세요!<br>모르는 게 생기면 위쪽 <b>?</b> <b>도움말</b>에서 언제든 찾아볼 수 있어요.',
      buttons: () => reviewing() ? null : [{ a: 'form', label: '편성하러 가기', primary: true }, { a: 'sortie', label: '출격하러 가기' }],
      onButton: (a) => { finishTour(); goTab(a === 'form' ? 'formation' : 'sortie'); } }
  ];
  const T = {};                                                   // 단계 간 임시 값(저장 안 함)
  const tourIdx = (id) => TOUR.findIndex(s => s.id === id);
  // 장면의 박자 목록을 정의 객체로 만들어 둔다(카드 표시 코드가 일반 단계처럼 다룬다)
  TOUR.forEach((s) => { if (s.beats) s._b = s.beats.map((b, i) => Object.assign({ id: s.id + '#' + i, ch: s.ch, sec: s.sec, ctx: s.ctx, step: s, bi: i }, b)); });

  // ── 장면 도우미(TOUR 정의에서 쓴다) ──
  const cardEl = () => q('#owned-list .stchar[data-char="' + TUTORIAL.pullId + '"]');                    // 튜토리얼 가챠로 받은 동료의 카드
  function statRows(a, b) {                                                                             // 능력치 상자의 a~b 번째 줄(0=공격 1=체력 2=탄창)
    const rows = document.querySelectorAll('#char-modal .cd-cur .sc-row'); if (!rows.length) return q('#char-modal .cd-cmp');
    return [rows[Math.min(a, rows.length - 1)], rows[Math.min(b, rows.length - 1)]];
  }
  function nearestPeg(type) {                                                                           // 판 중앙에 가장 가까운 살아 있는 type 탄약 번호(없으면 null)
    const s = run(); if (!s) return null; let best = null, bd = 9;
    s.pegs.forEach((p, i) => { if (p.type !== type || !p.alive) return; const d = Math.hypot(p.fx - 0.5, (p.fy - 0.4) * 1.2); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  function calloutAtPeg(i, text) { const g = game(), p = g.pegPos(i), top = g.layout().pins.y; return p.y - p.r * 2.4 < top + 24 ? { x: p.x, y: p.y + p.r * 2.1, text, below: true } : { x: p.x, y: p.y - p.r * 2.1, text }; }
  function ammoMark(text) { const r = canvasRectRaw('ammo'); return r ? [{ x: r.x, y: r.y, w: r.w, h: r.h, sq: true }, { x: r.x + r.w / 2, y: r.y + r.h + 4, text, below: true }] : []; }
  function jackMark(text) { const r = canvasRectRaw('jack'); return r ? [{ x: r.x, y: r.y, w: r.w, h: r.h, sq: true }].concat(text ? [{ x: r.x + r.w / 2, y: r.y - 4, text }] : []) : []; }
  function canvasRectRaw(name) { const g = game(), s = run(); if (!g || !s) return null; if (name === 'jack') return g.jackRect(); if (name === 'ammo') { const c = lane0(); return c ? g.ammoPillRect(c) : null; } return null; }
  function aimHitCall() {                                                                               // 시범 조준 점선이 처음 맞힐 탄약 위에 '맞힐 탄약' 말풍선
    const g = game(), s = run(); if (!g || !s || !SC.aimPt) return [];
    const tr = g.traceShot(g.aimDir(SC.aimPt.x, SC.aimPt.y), { maxHits: 1, tail: 0, walls: false }), h = tr.hits[0];
    if (!h || h.i == null) return [];
    const p = g.pegPos(h.i), top = g.layout().pins.y;
    return [p.y - p.r * 2.4 < top + 24 ? { x: p.x, y: p.y + p.r * 2.1, text: '맞힐 탄약', below: true } : { x: p.x, y: p.y - p.r * 2.1, text: '맞힐 탄약' }];
  }

  // ═════════ TIPS — 처음 만났을 때 한 번(투어가 끝난 뒤 · 안 본 것만 · 조건이 맞으면 뜸 · 한 번에 하나) ═════════
  // 필드: id · ctx · when(조건) · msg(문자열/함수/배열=여러 쪽) · target(요소·영역·함수(쪽 번호)) · modal · pause · label · help(도움말 주제 id → [자세히 ›])
  const TIPS = [
    // ── 로비 ──
    { id: 'mode.daily', ctx: 'lobby', help: 'modes', when: () => tabOn('sortie') && !!q('#mode-select .sns-tab.on[data-mode="daily"]'), target: () => $('mode-select'),
      msg: () => { const g = typeof MODES !== 'undefined' ? MODES.daily.reward.gems : 40; return '<b>일일 도전</b>은 오늘 하루 같은 판에 도전하는 모드예요. 첫 클리어엔 {gems}<b>' + g + '</b>' + eulReul(g) + ' 줘요.'; } },
    { id: 'mode.endless', ctx: 'lobby', help: 'modes', when: () => tabOn('sortie') && !!q('#mode-select .sns-tab.on[data-mode="endless"]'), target: () => $('mode-select'),
      msg: '<b>무한 모드</b>는 보스를 쓰러뜨릴 때마다 <b>더 강한 막</b>이 이어져요. 최고 기록에 도전해 봐요!' },
    { id: 'char.detail', ctx: 'lobby', help: 'chars', modal: 'char-modal', when: () => vis('char-modal') && !!q('#char-modal .cd-tab.on[data-cdtab="lvup"]'), target: () => q('#char-modal .cd-statcol'),
      msg: ['<b>레벨업</b>에는 {gold}크레딧이 필요해요. 오를수록 <b>공격·체력</b>이 커져요.', '<b>승급</b>에는 {shards}조각과 {mats}재료가 필요해요. 스킬은 아래에서 볼 수 있어요.'] },
    { id: 'char.promote', ctx: 'lobby', help: 'chars', modal: 'char-modal', when: () => vis('char-modal') && !!q('#char-modal .cd-tab.on[data-cdtab="promote"]'), target: () => q('#char-modal .cd-cmp'),
      msg: ['<b>승급</b>하면 ★이 올라 능력치와 <b>레벨 상한</b>이 커져요.', '조각은 가챠에서 같은 동료가 나올 때나 {docs}문서로 얻어요.'] },
    { id: 'shop.doc', ctx: 'lobby', help: 'econ', when: () => tabOn('shop') && !!q('.shoptabs .sns-tab.on[data-stab="doc"]'), target: () => q('.shoptabs'),
      msg: '{docs}문서로 보유한 동료의 <b>조각</b>을 살 수 있어요. 등급이 높을수록 비싸요.' },
    { id: 'shop.pkg', ctx: 'lobby', when: () => tabOn('shop') && !!q('.shoptabs .sns-tab.on[data-stab="pkg"]'), target: () => q('.shoptabs'),
      msg: '<b>패키지</b>는 아직 준비 중이에요. 곧 보석 패키지와 주간 패스가 열릴 예정이에요!' },
    { id: 'mission.claim', ctx: 'lobby', when: () => tabOn('mission') && !!q(CLAIMABLE), target: () => q(CLAIMABLE),
      msg: '받을 수 있는 보상이 있어요! <b>[받기]</b>를 눌러 챙겨요. 일일 미션은 <b>매일 0시</b>에 새로 시작해요.' },
    // ── 런 ──
    { id: 'run.map', ctx: 'run', help: 'map', modal: 'map', when: () => { const s = run(); return !!s && !s.tutorial && vis('map') && !vis('reward') && !vis('run-modal'); }, target: () => $('map-body'),
      msg: ['<b>분기 지도</b>예요. 빛나는 노드 중 하나를 골라 위로 올라가요!', '{ic:node_battle|💥}전투 {ic:node_elite|💀}정예 {ic:node_shop|🛒}상점 {ic:node_rest|🔧}정비 {ic:node_boss|👾}보스<br>맨 위의 <b>보스</b>를 쓰러뜨리면 스테이지 클리어예요!'] },
    { id: 'combat.ui', ctx: 'run', pause: true, help: 'battle',
      when: () => { const s = run(); return !!s && !s.tutorial && s.phase === 'load' && loadReady() && vis('combat-top'); }, target: () => $('combat-top'),
      msg: ['왼쪽 위 <b>‹</b> 버튼은 런을 끝내고 <b>로비로 나가는</b> 버튼이에요. 나가기 전에 한 번 더 물어봐요.', '<b>×1</b> 버튼은 <b>배속</b>이에요. 누를 때마다 ×1.5 → ×2 → ×3으로 바뀌고, 장전 볼과 전투가 모두 빨라져요.'] },
    { id: 'skill', ctx: 'run', pause: true, help: 'battle',
      when: () => { const s = run(); return !!s && !s.tutorial && s.phase === 'load' && loadReady() && s.chars.some(c => c.gauge >= c.ref.active.gauge) && vis('battle-side'); },
      target: (pi) => pi === 0 ? $('skill-col') : pi === 1 ? (q('#skill-col .skillbtn.ready') || $('skill-col')) : $('auto-skill-btn'),
      msg: ['<b>스킬 게이지</b>는 탄환을 장전할 때 함께 차올라요. 가득 차면 버튼이 <b>빛나요</b>.', '빛나는 <b>스킬 버튼</b>을 눌러 두면 이번 전투에 스킬이 발동해요. 직접 켜면 피해가 <b>+' + Math.round(MANUAL_SKILL_BONUS * 100) + '%</b>예요.', '<b>[스킬 자동]</b>을 켜 두면 게이지가 찰 때마다 알아서 써요.'] },
    { id: 'lvl.relic', ctx: 'run', modal: 'reward', help: 'relic', when: () => vis('reward') && !!q('#reward-choices .relic-card'), target: () => q('#reward .modal-box'),
      msg: () => /레벨/.test(($('reward-title') && $('reward-title').textContent) || '')
        ? ['<b>레벨업!</b> 보상 <b>3개 중 1개</b>를 골라요.', '짝수 레벨엔 이번 런 동안 쓰는 특수 장비 <b>모듈</b>이 나와요. 같은 모듈을 또 고르면 <b>개량</b>돼요!']
        : ['<b>전투 승리!</b> <b>모듈</b> 3개 중 1개를 골라요.', '같은 모듈을 또 고르면 <b>개량</b>돼요!'] },
    { id: 'lvl.stat', ctx: 'run', modal: 'reward', help: 'map', when: () => vis('reward') && !q('#reward-choices .relic-card') && !!q('#reward-choices .reward-card'), target: () => q('#reward .modal-box'),
      msg: '홀수 레벨엔 <b>능력치 강화</b>가 나와요. 화력·방벽 HP·볼 +1·수리 중 <b>하나</b>를 골라요.' },
    { id: 'relic.bar', ctx: 'run', help: 'relic',
      when: () => { const s = run(); return !!s && combatOn() && Object.keys(s.relics || {}).length > 0 && !vis('reward') && !vis('run-modal') && !vis('result') && (vis('map') || loadReady()); },
      target: () => vis('map') ? $('map-relics') : $('relic-bar'),
      msg: ['위쪽 <b>모듈 막대</b>를 탭하면 설명과 <b>세트 진행도</b>를 볼 수 있어요.', '같은 <b>태그</b> 모듈이 3개면 <b>세트 보너스</b>가 켜져요!'] },
    { id: 'node.shop', ctx: 'run', modal: 'run-modal', help: 'map', when: () => vis('run-modal') && !!q('#run-modal-box [data-buy]'), target: () => $('run-modal-box'),
      msg: '{ic:node_shop|🛒}<b>상점</b>이에요. 모은 {gold}<b>크레딧</b>으로 모듈이나 방벽 수리를 살 수 있어요. 사지 않고 <b>[떠나기]</b>를 눌러도 돼요.' },
    { id: 'node.rest', ctx: 'run', modal: 'run-modal', help: 'map', when: () => vis('run-modal') && !!q('#run-modal-box [data-rest]'), target: () => $('run-modal-box'),
      msg: '{ic:node_rest|🔧}<b>정비</b>예요. <b>수리</b>(방벽 HP 40% 회복)와 <b>개량</b> 중 <b>하나</b>만 고를 수 있어요.' },
    { id: 'node.elite', ctx: 'run', pause: true, help: 'enemy',
      when: () => { const s = run(); return !!s && !!s.combat && !!s.combat.elite && loadReady(); }, target: () => canvasRect('field'),
      msg: '{ic:node_elite|💀}<b>정예</b> 전투예요! 황금빛 <b>정예 적</b>은 강하지만 경험치와 보상이 커요.' },
    { id: 'node.boss', ctx: 'run', pause: true, help: 'enemy',
      when: () => { const s = run(); return !!s && !!s.combat && !!s.combat.boss && loadReady(); }, target: () => canvasRect('field'),
      msg: ['{ic:node_boss|👾}<b>보스</b>예요! 보스 곁의 알약에 <b>예고 패턴</b>까지 남은 턴이 떠요.', '그 전에 <b>기절</b> 스킬로 묶으면 패턴이 취소돼요!'] },
    { id: 'board.interfere', ctx: 'run', pause: true, help: 'enemy',
      when: () => { const s = run(), g = game(); return !!s && !!g && loadReady() && g.anim.floats.some(f => f.note && /교란|오염|파편/.test(f.text)); }, target: () => canvasRect('pins'),
      msg: '적이 <b>핀볼 판을 방해</b>해요! 해킹드론·슬러지·헤비아머를 먼저 잡으면 판이 깨끗해져요.' },
    { id: 'result', ctx: 'run', modal: 'result', when: () => vis('result'), target: () => $('result-box'),
      msg: () => { const k = ($('result-box') && $('result-box').dataset.kind) || ''; return k === 'win' ? '<b>승리!</b> 스테이지를 <b>처음 클리어</b>하면 다음 스테이지와 새 모듈이 열려요.' : k === 'abandon' ? '중간에 나가도 지금까지 모은 보상은 받아요. 다음엔 끝까지 도전해 봐요!' : '방벽이 무너져도 모은 보상은 받아요. 동료를 키워 다시 도전해요!'; } }
  ];

  // ═════════ 카드 화면(스포트라이트 + 말풍선 + 표식) ═════════
  let built = false, active = null, entered = null, enteredAt = 0, shown = null, skipReadyAt = 0, handSig = '', handAnim = null, raf = 0, _toastT = 0, lastSlow = 1, moment = null;
  const memo = {};                                                // 카드별 표시 상태(쪽 번호 등) — 잠깐 숨었다 돌아와도 유지
  const SCN = { id: '', i: 0, t: 0, untilAt: 0, started: false };   // 장면 진행(박자 번호·시작 시각) — 저장 안 함

  function toast(html) {
    const el = $('toast'); if (!el) return;
    el.innerHTML = html; el.style.setProperty('--c', '#ffcf5c'); el.className = 'toast show big';
    clearTimeout(_toastT); _toastT = setTimeout(() => { el.className = 'toast'; }, 3400);
  }

  function build() {
    if (built) return; built = true;
    const d = document.createElement('div'); d.id = 'tut';
    d.innerHTML = '<div class="tut-block" id="tut-bt"></div><div class="tut-block" id="tut-bb"></div><div class="tut-block" id="tut-bl"></div><div class="tut-block" id="tut-br"></div>'
      + '<div id="tut-shield"></div><div id="tut-ring"></div><div id="tut-marks"></div><div id="tut-hand"></div>'
      + '<div id="tut-cap"><span id="tut-cap-t"></span> <button class="tut-skip" data-a="ask" id="tut-cap-skip">건너뛰기</button></div>'
      + '<div class="tut-dlg" id="tut-dlg"><div class="tut-por" id="tut-por"></div><div class="tut-body"><span class="tut-prog" id="tut-prog"></span><div class="tut-name">' + GUIDE.name + '</div>'
      + '<div class="tut-msg" id="tut-msg"></div><div class="tut-tap" id="tut-tap"></div><div class="tut-row" id="tut-row"></div></div></div>';
    $('app').appendChild(d);
    // 건너뛰기 확인 팝업 — #tut 밖(형제)에 둬서 카드가 숨겨져도 사라지지 않는다. 배경을 눌러도 취소(실수 방지).
    const sk = document.createElement('div'); sk.id = 'tut-skipm';
    sk.innerHTML = '<div class="tut-sk-box"><div class="tut-sk-h" id="tut-sk-h"></div><div class="tut-sk-w" id="tut-sk-w"></div><div id="tut-sk-g"></div>'
      + '<div class="tut-sk-row"><button class="tut-skip" data-a="skipcancel">취소</button><button class="tut-next" data-a="skipok" id="tut-sk-ok">확인</button></div></div>';
    $('app').appendChild(sk);
    sk.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) { if (e.target === sk) closeSkip(); return; }
      if (b.dataset.a === 'skipcancel') closeSkip();
      else if (b.dataset.a === 'skipok' && !b.disabled) skipAll();
    });
    // 다시 보기 챕터 선택
    const mn = document.createElement('div'); mn.id = 'tut-menu'; mn.className = 'modal'; mn.hidden = true;
    mn.innerHTML = '<div class="modal-box" id="tut-menu-box"></div>';
    $('app').appendChild(mn);
    mn.addEventListener('click', (e) => {
      if (e.target === mn || e.target.closest('[data-close]')) { mn.hidden = true; return; }
      const b = e.target.closest('[data-ch]'); if (!b) return;
      mn.hidden = true; replay(+b.dataset.ch);
    });
    try { $('tut-por').style.backgroundImage = 'url(' + CharArt.path(GUIDE.id, 'cgm') + ')'; } catch (e) {}
    $('tut-row').addEventListener('click', onRowClick);
    $('tut-cap').addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b && b.dataset.a === 'ask' && Date.now() >= skipReadyAt) openSkip(); });
    window.addEventListener('resize', () => { if (shown) place(); });
    document.addEventListener('pointerup', () => setTimeout(tick, 90), true);       // 누른 직후 조건 감지(250ms 폴링을 기다리지 않게)
  }

  const pagesOf = (d) => { const m = typeof d.msg === 'function' ? d.msg() : d.msg; return Array.isArray(m) ? m : [m]; };
  const isTip = (d) => !!d.tip;
  function kindOf(d) { return d.kind === 'offer' ? 'offer' : (d.tip ? 'tip' : (d.kind || 'next')); }

  // 카드 내용 그리기(바뀌었을 때만)
  function renderDialog() {
    const d = shown.def, k = kindOf(d), pages = pagesOf(d), pi = Math.min(shown.page, pages.length - 1);
    const dlg = $('tut-dlg'), cap = $('tut-cap');
    if (k === 'watch') {                                            // 지켜보는 박자: 카드 대신 위쪽 캡션(+건너뛰기)만
      dlg.style.display = 'none';
      $('tut-cap-t').innerHTML = fmt(d.caption || '');
      cap.style.display = d.caption ? 'block' : 'none';
      return;
    }
    dlg.style.display = ''; cap.style.display = 'none';
    const sig = d.id + '|' + pi + '|' + k + '|' + (shown.fallback ? 1 : 0) + '|' + (reviewing() ? 1 : 0) + '|' + pages[pi] + '|' + (d.sec || '');
    if (shown.sig === sig) return;
    shown.sig = sig;
    $('tut-msg').innerHTML = fmt(pages[pi]);
    const doTap = (k === 'do' && !shown.fallback);
    $('tut-tap').textContent = doTap ? (d.tap || '표시된 곳을 눌러요') : '';
    $('tut-tap').style.display = doTap ? 'block' : 'none';
    const pg = $('tut-prog');                                       // 챕터 진행 표시(투어 카드만): 1/3 · 탄약 (구역 이름이 없으면 챕터 이름)
    if (d.ch && !isTip(d) && k !== 'offer') { pg.textContent = d.ch + '/' + CHAPTERS.length + ' · ' + (d.sec || CHAPTERS[d.ch - 1].name) + (reviewing() ? ' · 다시 보기' : ''); pg.style.display = 'block'; } else pg.style.display = 'none';
    let btns = '';
    if (k === 'offer') {
      btns = '<button class="tut-skip" data-a="no">안 볼래요</button><button class="tut-next" data-a="yes">볼래요</button>';
    } else {
      const last = pi >= pages.length - 1, canNext = (k === 'next' || k === 'tip' || shown.fallback);
      if (!isTip(d) && !d.noSkip) btns += '<button class="tut-skip" data-a="ask" id="tut-skipbtn">건너뛰기</button>';
      if (isTip(d) && d.help) btns += '<button class="tut-skip tut-more" data-a="more">자세히 ›</button>';
      const custom = (last && typeof d.buttons === 'function') ? d.buttons() : null;
      if (custom) custom.forEach(b => { btns += '<button class="' + (b.primary ? 'tut-next' : 'tut-skip') + '" data-a="btn:' + b.a + '">' + b.label + '</button>'; });
      else if (canNext) btns += '<button class="tut-next" data-a="next">' + (last ? (shown.fallback ? '넘어가기' : (d.label || (k === 'tip' ? '알겠어요' : '다음'))) : '다음') + '</button>';
    }
    $('tut-row').innerHTML = btns;
    skipReadyAt = Date.now() + 900;                                 // 새 카드 직후 0.9초는 건너뛰기 비활성(이월 탭 오터치 방지)
    const sb = $('tut-skipbtn'); if (sb) { sb.disabled = true; sb.style.opacity = '.4'; setTimeout(() => { const b = $('tut-skipbtn'); if (b) { b.disabled = false; b.style.opacity = ''; } }, 900); }
  }

  function onRowClick(e) {
    const b = e.target.closest('[data-a]'); if (!b || !shown || b.disabled) return;
    const a = b.dataset.a, d = shown.def;
    try { if (typeof Sound !== 'undefined') Sound.play('click'); } catch (_) {}
    if (a === 'next') cardNext();
    else if (a === 'ask') { if (Date.now() < skipReadyAt) return; openSkip(); }
    else if (a === 'yes') replay(0);
    else if (a === 'no') declineOffer();
    else if (a === 'more') { const t = tut(); t.seen[d.id] = true; T.lastTipAt = Date.now(); persist(); active = null; hide(); try { Help.open(d.help); } catch (_) {} }
    else if (a.indexOf('btn:') === 0) { if (d.onButton) { try { d.onButton(a.slice(4)); } catch (err) { console.error('[tutorial]', err); } } entered = null; active = null; hide(); setTimeout(tick, 30); }
  }

  // [다음] — 쪽이 남았으면 다음 쪽, 마지막이면 카드 종료(투어는 단계·박자 이동, 팁은 '봄' 처리)
  function cardNext() {
    if (!shown) return;
    const d = shown.def, pages = pagesOf(d);
    if (shown.page < pages.length - 1) { shown.page++; memo[d.id] = shown; renderDialog(); return; }
    if (isTip(d)) { const t = tut(); t.seen[d.id] = true; T.lastTipAt = Date.now(); persist(); active = null; hide(); }
    else if (d.step) { beatDone(d); return; }
    else { tourAdvance(); hide(); }
    setTimeout(tick, 30);
  }
  // 장면의 한 박자가 끝났다 → 다음 박자(없으면 단계 끝). 카드를 껐다 켜지 않고 바로 이어 붙인다(그 사이 게임 한 프레임도 풀리지 않게)
  function beatDone(d) {
    const s = d.step; if (!s) return;
    try { if (d.onDone) d.onDone(); } catch (e) { console.error('[tutorial]', e); }
    if (SCN.i + 1 < s._b.length) { SCN.i++; SCN.t = Date.now(); SCN.untilAt = 0; shown = null; tick(); }
    else { tourAdvance(); hide(); setTimeout(tick, 30); }
  }
  // 지켜보기(until)·해 보기(done) 박자가 끝났는가
  function beatCheck(d) {
    if (!d.step) return false;
    const k = d.kind;
    if (k !== 'watch' && k !== 'do') return false;
    let ok = false;
    try { ok = k === 'watch' ? !!(d.until && d.until()) : !!(d.done && d.done()); } catch (e) { ok = false; }
    if (d.maxMs && Date.now() - SCN.t > d.maxMs) ok = true;           // 안전 제한: 조건이 안 와도 넘어간다(막히지 않게)
    if (ok && d.after) { if (!SCN.untilAt) SCN.untilAt = Date.now(); if (Date.now() - SCN.untilAt < d.after) return false; }
    return ok;
  }

  function hide() {
    const e = $('tut'); if (e) e.classList.remove('show');
    shown = null; window.__tutPause = false; handSig = ''; if (handAnim) { try { handAnim.cancel(); } catch (_) {} handAnim = null; }
    try { const g = game(); if (g && lastSlow !== 1) { g.setTimeScale(1); } g && g.setDemoAim(null); } catch (_) {}
    lastSlow = 1; try { setMarks([]); } catch (_) {}
    if (!moment && raf && !needsRaf()) { if (raf > 0) cancelAnimationFrame(raf); raf = 0; }
  }

  // ── 표식(고리·사각·말풍선) 그리기 — 캔버스 px 좌표를 뷰포트로 바꿔 #tut-marks 안에 놓는다 ──
  const pool = { mk: [], call: [] };
  function setMarks(list) {
    const host = $('tut-marks'); if (!host) return;
    const app = $('app').getBoundingClientRect(); let ni = 0, nc = 0;
    for (const m of list || []) {
      if (!m) continue;
      const p = cvPt(m.x, m.y); if (!p) continue;
      if (m.text) {                                                   // 말풍선
        const el = pool.call[nc] || (pool.call[nc] = host.appendChild(Object.assign(document.createElement('div'), { className: 'tut-call' }))); nc++;
        el.style.display = 'block'; el.className = 'tut-call' + (m.below ? ' below' : '');
        if (el._t !== m.text) { el.innerHTML = fmt(m.text); el._t = m.text; }
        const w = el.offsetWidth || 80, x = Math.max(w / 2 + 6, Math.min(app.width - w / 2 - 6, p.x - app.left));
        el.style.left = x + 'px'; el.style.top = (p.y - app.top) + 'px';
      } else {                                                        // 고리(r) · 사각(w,h)
        const el = pool.mk[ni] || (pool.mk[ni] = host.appendChild(Object.assign(document.createElement('div'), { className: 'tut-mk' }))); ni++;
        el.style.display = 'block';
        if (m.sq) { el.className = 'tut-mk sq'; el.style.left = (p.x - app.left) + 'px'; el.style.top = (p.y - app.top) + 'px'; el.style.width = (m.w * p.k) + 'px'; el.style.height = (m.h * p.k) + 'px'; }
        else { const r = m.r * p.k; el.className = 'tut-mk'; el.style.left = (p.x - app.left) + 'px'; el.style.top = (p.y - app.top) + 'px'; el.style.width = (r * 2) + 'px'; el.style.height = (r * 2) + 'px'; }
      }
    }
    for (let i = ni; i < pool.mk.length; i++) pool.mk[i].style.display = 'none';
    for (let i = nc; i < pool.call.length; i++) pool.call[i].style.display = 'none';
  }

  // 스포트라이트·말풍선·표식 위치 계산(매 프레임 가볍게)
  function place() {
    if (!shown || !built) return;
    const d = shown.def, app = $('app').getBoundingClientRect(), W = app.width, H = app.height;
    const k = kindOf(d), watch = k === 'watch', dim = d.dim !== false && !watch, lock = watch || (d.lock === true);
    const bt = $('tut-bt'), bb = $('tut-bb'), bl = $('tut-bl'), br = $('tut-br'), ring = $('tut-ring'), sh = $('tut-shield');
    const setB = (el, l, t, w, h) => { el.style.left = l + 'px'; el.style.top = t + 'px'; el.style.width = Math.max(0, w) + 'px'; el.style.height = Math.max(0, h) + 'px'; el.style.display = (w > 0 && h > 0) ? 'block' : 'none'; };
    [bt, bb, bl, br].forEach(b => b.classList.toggle('clear', !dim));
    let hole = null;
    if (!watch && d.target) { const r = rectOf(d.target, shown.page); if (r) { const P = Math.max(5, W * 0.012); hole = { l: Math.max(0, r.l - app.left - P), t: Math.max(0, r.t - app.top - P), w: 0, h: 0 }; hole.w = Math.min(W - hole.l, r.w + P * 2); hole.h = Math.min(H - hole.t, r.h + P * 2); } }
    shown.hasHole = !!hole;
    if (!dim) {                                                     // 막 없이 말풍선만(또는 지켜보기·정지 설명: 투명 막으로 뒤 화면 터치만 막는다)
      if (lock) { setB(bt, 0, 0, W, H); [bb, bl, br].forEach(b => { b.style.display = 'none'; }); } else [bt, bb, bl, br].forEach(b => { b.style.display = 'none'; });
      ring.style.display = 'none'; sh.style.display = 'none';
    } else if (hole) {
      setB(bt, 0, 0, W, hole.t); setB(bb, 0, hole.t + hole.h, W, H - (hole.t + hole.h)); setB(bl, 0, hole.t, hole.l, hole.h); setB(br, hole.l + hole.w, hole.t, W - (hole.l + hole.w), hole.h);
      ring.style.display = 'block'; ring.style.left = hole.l + 'px'; ring.style.top = hole.t + 'px'; ring.style.width = hole.w + 'px'; ring.style.height = hole.h + 'px';
      if (k === 'do') sh.style.display = 'none';                    // 직접 해 보는 단계 = 구멍을 열어 둔다
      else { sh.style.display = 'block'; sh.style.left = hole.l + 'px'; sh.style.top = hole.t + 'px'; sh.style.width = hole.w + 'px'; sh.style.height = hole.h + 'px'; }   // 설명 단계 = 투명 덮개로 실수 터치 방지
    } else { setB(bt, 0, 0, W, H); [bb, bl, br].forEach(b => { b.style.display = 'none'; }); ring.style.display = 'none'; sh.style.display = 'none'; }
    // 말풍선 위치: 대상이 아래쪽이면 위에, 위쪽이면 아래에, 대상이 없으면 가운데
    if (!watch) {
      const dlg = $('tut-dlg'), cy = hole ? hole.t + hole.h / 2 : H / 2, pos = d.dlg || (!dim ? 'top' : (!hole ? 'mid' : (cy > H * 0.52 ? 'top' : 'bottom')));
      dlg.style.top = 'auto'; dlg.style.bottom = 'auto'; dlg.style.transform = 'translateX(-50%)';
      if (pos === 'top') dlg.style.top = (W * 0.03) + 'px';
      else if (pos === 'bottom') dlg.style.bottom = (W * 0.03) + 'px';
      else { dlg.style.top = '50%'; dlg.style.transform = 'translate(-50%,-50%)'; }
    }
    let mk = []; try { mk = d.marks ? (d.marks() || []) : []; } catch (e) { mk = []; }
    setMarks(mk);
    placeHand(d, app);
  }

  // 끌기·조준 시범 손가락. aimDemo = 손가락이 발사대에서 판 위의 점들을 차례로 지나며 점마다 멈추는 동안 실제 조준 점선(game.setDemoAim)을 함께 보여 준다. hand = 요소 → 요소 끌기(WAAPI)
  function placeHand(d, app) {
    const el = $('tut-hand'); if (!el) return;
    const g = game();
    if (d.aimDemo && g && run()) {
      if (handAnim) { try { handAnim.cancel(); } catch (_) {} handAnim = null; } handSig = '';
      const pins = g.layout().pins, L = g.launcher(), P = d.aimDemo.map(p => ({ x: pins.x + pins.w * p.fx, y: pins.y + pins.h * p.fy }));
      const MOVE = 1100, HOLD = 1000, REL = 500, cyc = P.length * (MOVE + HOLD) + REL;
      let t = (Date.now() - shown.since) % cyc, prev = { x: L.x, y: L.y - 24 * g.BU }, pos = null, op = 1;
      for (let i = 0; i < P.length; i++) {
        if (t < MOVE) { const kk = smooth(t / MOVE); pos = { x: prev.x + (P[i].x - prev.x) * kk, y: prev.y + (P[i].y - prev.y) * kk }; break; }
        t -= MOVE;
        if (t < HOLD) { pos = P[i]; break; }
        t -= HOLD; prev = P[i];
      }
      if (!pos) { pos = prev; op = Math.max(0, 1 - t / REL); g.setDemoAim(null); SC.aimPt = null; } else { g.setDemoAim(pos); SC.aimPt = pos; }
      const vp = cvPt(pos.x, pos.y);
      if (vp) { el.style.display = 'block'; el.style.opacity = String(op); el.style.transform = 'translate(' + (vp.x - app.left) + 'px,' + (vp.y - app.top) + 'px)'; }
      return;
    }
    if (d.aimFix && g && run()) { const pt = d.aimFix(); SC.aimPt = pt; g.setDemoAim(pt); }
    else if (g && !d.aimDemo && !d.aimFix) { try { g.setDemoAim(null); } catch (_) {} }
    let h = null; try { h = d.hand ? d.hand() : null; } catch (e) { h = null; }
    const a = h && center(h.from), b = h && center(h.to);
    if (!a || !b || (d.dim === false)) { el.style.display = 'none'; el.style.opacity = ''; if (handAnim) { try { handAnim.cancel(); } catch (_) {} handAnim = null; } handSig = ''; return; }
    const sig = [a.x, a.y, b.x, b.y].map(Math.round).join(',');
    el.style.display = 'block'; el.style.opacity = '';
    if (sig === handSig) return; handSig = sig;
    if (handAnim) { try { handAnim.cancel(); } catch (_) {} }
    const x0 = a.x - app.left, y0 = a.y - app.top, x1 = b.x - app.left, y1 = b.y - app.top;
    try { handAnim = el.animate([{ transform: 'translate(' + x0 + 'px,' + y0 + 'px) scale(1)', opacity: 0 }, { transform: 'translate(' + x0 + 'px,' + y0 + 'px) scale(.86)', opacity: 1, offset: .15 },
      { transform: 'translate(' + x1 + 'px,' + y1 + 'px) scale(.86)', opacity: 1, offset: .75 }, { transform: 'translate(' + x1 + 'px,' + y1 + 'px) scale(1)', opacity: 0 }], { duration: 1700, iterations: Infinity, easing: 'ease-in-out' }); } catch (e) {}
  }

  function show(d) {
    build();
    if (!shown || shown.def !== d) { shown = memo[d.id] && memo[d.id].def === d ? memo[d.id] : { def: d, page: 0, since: Date.now(), fallback: false, sig: '', ran: false }; memo[d.id] = shown; shown.sig = ''; }
    // 직접 해 보는 단계인데 대상이 오래 안 보이거나(없음) 너무 오래 걸리면 [넘어가기]를 열어 둔다(막히지 않게)
    if (kindOf(d) === 'do' && !shown.fallback) {
      const missing = d.target && !rectOf(d.target, shown.page);
      if (missing) shown.miss = shown.miss || Date.now(); else shown.miss = 0;
      if ((shown.miss && Date.now() - shown.miss > 1200) || Date.now() - shown.since > 14000) shown.fallback = true;
    }
    refreshShots(d);
    if (!shown.ran) { shown.ran = true; if (d.run) { try { d.run(); } catch (e) { console.error('[tutorial]', e); } } }   // 박자 시작 동작(시범 볼 쏘기 등)은 한 번만
    renderDialog();
    $('tut').classList.add('show');
    place();
    window.__tutPause = !!(d.pause && combatOn());
    startRaf();
  }

  // 매 프레임: 지켜보기·해 보기 박자 끝 확인 → 슬로모션 배율 → 위치 갱신. 카드가 없을 땐 '순간(moment)' 연출만
  const needsRaf = () => { if (disabled) return false; const t = tut(); return !!t && !t.done && inTutBattle(); };      // 튜토리얼 전투 중엔 '순간' 감지를 위해 프레임 루프를 계속 돈다
  function startRaf() {                                              // raf: 0=멈춤 · -1=프레임 처리 중 · 그 밖=예약됨 (처리 중에 다시 예약되는 이중 루프를 막는다)
    if (raf) return;
    const loop = () => { raf = -1; if (!shown && !moment && !needsRaf()) { raf = 0; return; } frame(); if (raf === -1) raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
  }
  function frame() {
    const g = game();
    if (shown) {
      const d = shown.def;
      refreshShots(d);
      if (d.frame) { try { d.frame(); } catch (e) {} }
      if (beatCheck(d)) { beatDone(d); return; }
      if (T.skipOpen) { if (g && lastSlow !== 1) { g.setTimeScale(1); lastSlow = 1; } return; }
      let f = 1; try { f = d.slow == null ? 1 : (typeof d.slow === 'function' ? d.slow() : d.slow); } catch (e) { f = 1; }
      f = Math.round(Math.max(0.05, Math.min(1, +f || 1)) * 1000) / 1000;
      if (g && f !== lastSlow) { g.setTimeScale(f); lastSlow = f; }
      place();
      return;
    }
    if (!moment) momentCheck();
    if (moment) momentFrame(g);
  }

  // ── 순간(moment): 카드 없이 슬로모션 + 말풍선 한 번(예: 첫 5콤보) ──
  const MOMENTS = [
    { id: 'combo5', ms: 1600, when: () => { const s = run(); return !!s && s.tutorial && s.phase === 'load' && s.balls.some(b => !b.harvest && !b.demo && b.combo >= 5); },
      follow: () => { const s = run(), b = s && s.balls.find(x => x.harvest && x.color === '#ffd93b'); return b ? { x: b.x, y: b.y - 28 * game().BU } : null; },
      text: '<b>5 HIT!</b> 연달아 맞히면 <b>보너스 볼</b>이 나와요.' }
  ];
  function momentCheck() {
    const t = tut(); if (!t || t.done || t.review || shown || moment || !inTutBattle() || T.skipOpen) return;
    for (const m of MOMENTS) { if (t.seen['m.' + m.id] || !m.when()) continue; t.seen['m.' + m.id] = true; persist(); moment = { def: m, t0: Date.now() }; startRaf(); return; }
  }
  function momentFrame(g) {
    const m = moment, d = m.def;
    if (Date.now() - m.t0 > d.ms || !inTutBattle()) { moment = null; if (g) g.setTimeScale(1); lastSlow = 1; setMarks([]); return; }
    const f = 0.28; if (g && lastSlow !== f) { g.setTimeScale(f); lastSlow = f; }
    const fp = d.follow ? d.follow() : null;
    setMarks(fp ? [{ x: fp.x, y: fp.y, text: d.text }] : []);
  }

  // ═════════ 건너뛰기 확인 팝업 ═════════
  // 경고문 + '지금 바로 받는 보상'을 보여 주고, [확인]을 눌러야만 건너뛴다(실수 방지: 열린 직후 0.9초는 [확인] 비활성, 배경을 눌러도 취소).
  function openSkip() {
    const t = tut(), m = meta(); if (!t || !m) return;
    build();
    const rev = !!t.review, plan = rev ? { chars: [], cur: {} } : m.tutRewardPlan();
    const items = plan.chars.map(id => '<b>' + charName(id) + '</b> 합류').concat(Object.keys(plan.cur).map(k => uiCur(k) + ' <b>' + plan.cur[k] + '</b>'));
    $('tut-sk-h').textContent = rev ? '다시 보기를 그만둘까요?' : '튜토리얼을 건너뛸까요?';
    $('tut-sk-w').innerHTML = rev ? '나중에 계정 메뉴나 도움말에서 다시 볼 수 있어요.'
      : '<span class="tut-sk-warn">⚠</span> 건너뛰면 <b>남은 안내를 보지 못해요.</b> 나중에 계정 메뉴나 도움말에서 다시 볼 수 있어요.';
    $('tut-sk-g').innerHTML = items.length
      ? '<div class="tut-sk-gt">건너뛰면 아래 보상을 바로 받아요</div><div class="tut-sk-gl">' + items.map(x => '<span>' + x + '</span>').join('') + '</div>'
        + '<div class="tut-sk-n">동료는 자동으로 배치되지 않아요.<br><b>[편성]</b> 탭에서 직접 배치해 주세요.</div>' : '';
    const ok = $('tut-sk-ok'); ok.disabled = true; ok.style.opacity = '.4'; setTimeout(() => { ok.disabled = false; ok.style.opacity = ''; }, 900);
    $('tut-skipm').classList.add('show'); T.skipOpen = true; window.__tutPause = combatOn();
  }
  function closeSkip() { const sk = $('tut-skipm'); if (sk) sk.classList.remove('show'); T.skipOpen = false; window.__tutPause = false; setTimeout(tick, 30); }

  // ═════════ 진행 로직 ═════════
  function anyOtherModal(allow) {
    const ms = document.querySelectorAll('.modal'); for (const m of ms) { if (m.getClientRects().length > 0 && m.id !== allow) return true; } return false;
  }
  function tourAdvance() {
    const t = tut(); const i = tourIdx(t.at), s = TOUR[i];
    if (s && s.onLeave) { try { s.onLeave(); } catch (e) { console.error('[tutorial]', e); } }
    entered = null; SCN.started = false;
    const nx = TOUR[i + 1];
    if (!nx || (t.review > 0 && nx.ch !== t.review)) { finishTour(); return; }     // 마지막 단계이거나, 한 챕터만 다시 보는 중이고 그 챕터가 끝남
    t.at = nx.id; persist();
  }
  function finishTour() {
    const t = tut(), m = meta(), was = !!t.review;
    if (!was && !t.rewarded && m) { try { m.tutGrantRewards(); } catch (e) {} }     // 보상 카드를 거치지 않고 끝났을 때의 안전장치(중복 지급 없음 — 플래그)
    t.done = true; t.at = TOUR[0].id; t.review = 0;
    persist(); try { m.renderLobby(); } catch (e) {}
  }
  function markAllSeen() { const t = tut(); TIPS.forEach(d => { t.seen[d.id] = true; }); }
  function skipAll() {                                                              // 건너뛰기 확정(팝업의 [확인]) — 못 받은 동료·완료 재화를 지금 받는다(자동 배치 없음)
    const t = tut(), m = meta(); if (!t || !m) return;
    const rev = !!t.review, plan = rev ? null : m.tutGrantRewards();
    t.done = true; t.offered = true; t.review = 0; t.at = TOUR[0].id; if (!rev) markAllSeen();
    persist(); active = null; entered = null; moment = null; closeSkip(); hide(); cleanupScene();
    if (inTutBattle()) { const g = game(); try { g.exitTutorialBattle(); } catch (e) {} }   // 튜토리얼 전투 중이었으면 로비로
    try { m.renderLobby(); } catch (e) {}
    if (plan && (plan.chars.length || Object.keys(plan.cur).length)) toast('튜토리얼 보상을 받았어요!<br><span style="font-size:.8em">동료는 [편성] 탭에서 직접 배치해 주세요</span>');
  }
  function declineOffer() { const t = tut(); t.offered = true; markAllSeen(); persist(); active = null; hide(); }
  function replayMenu() {
    build();
    const t = tut(); if (!t || (!t.done && !t.review)) return;                      // 새 튜토리얼이 진행 중이면 다시 보기는 열지 않는다
    $('tut-menu-box').innerHTML = '<h2>' + ui('ic_info', '❔') + ' 튜토리얼 다시 보기</h2><div class="cd-btns">'
      + '<button class="btn" data-ch="0">처음부터 모두 보기</button>'
      + CHAPTERS.map(c => '<button class="btn" data-ch="' + c.n + '">' + c.n + ' · ' + c.name + (c.n === 1 ? ' (연습 전투)' : '') + '</button>').join('')
      + '</div><button class="btn primary" data-close="1">닫기</button>';
    $('tut-menu').hidden = false;
  }
  function replay(ch) {                                                             // ch 없음 = 챕터 선택 메뉴 · 0 = 전부 · 1~3 = 그 챕터만. 다시 보기는 보상·가챠 없음
    if (ch === undefined) { replayMenu(); return; }
    const t = tut(); if (!t || !meta()) return;
    if (!t.done && !t.review) return;                                               // 새 튜토리얼이 진행 중이면 무시(가챠·보상을 놓치지 않게)
    const first = TOUR.find(s => ch <= 0 || s.ch === ch); if (!first) return;
    t.done = false; t.offered = true; t.review = ch <= 0 ? -1 : ch; t.at = first.id;
    entered = null; active = null; Object.keys(memo).forEach(k => delete memo[k]); T.placeFrom = 0; T.fought = false; SCN.started = false;
    persist(); hide(); setTimeout(tick, 30);
  }
  // 새 계정의 첫 진입(타이틀 탭) — 튜토리얼 전투부터 시작해야 하는가. 그렇다면 1챕터를 처음부터 다시 시작시킨다
  function battleDue() {
    if (disabled) return false;
    const t = tut(); if (!t || (t.v || 1) < 2 || t.done || t.battle || t.review) return false;
    t.at = TOUR[0].id; entered = null; T.fought = false; SCN.started = false; persist(); return true;
  }

  // 투어: 이번에 띄울 단계(장면이면 지금 박자)(없으면 null)
  function tourStep(t) {
    for (let guard = 0; guard < 60; guard++) {
      let i = tourIdx(t.at); if (i < 0) { t.at = TOUR[0].id; i = 0; persist(); }
      const s = TOUR[i];
      if (s.ctx === 'run') {                                                                              // 1챕터 = 튜토리얼 전투 안에서만
        if (!combatOn()) { if (lobbyOn() && t.review) { try { game().startRun({ mode: 'tutorial' }); } catch (e) { console.error('[tutorial]', e); } } return null; }   // 다시 보기: 로비에서 연습 전투를 연다
        if (!inTutBattle()) return null;
      } else if (!lobbyOn()) {                                                                            // 로비 단계인데 로비가 안 보임(전투 화면 등)
        if (entered === s.id && s.done && s.done()) { tourAdvance(); continue; }
        return null;
      }
      if (entered !== s.id) {
        entered = s.id; enteredAt = Date.now(); SCN.id = s.id; SCN.i = 0; SCN.t = Date.now(); SCN.untilAt = 0; SCN.started = false;
        if (s._b) s._b.forEach(b => { delete memo[b.id]; });                                              // 장면은 처음 박자부터(옛 쪽 번호·실행 기록을 지운다)
        if (s.onEnter) { try { s.onEnter(); } catch (e) { console.error('[tutorial]', e); } }
        if (s.skip && s.skip()) { tourAdvance(); continue; }
        if (s.target) { try { const el = typeof s.target === 'function' ? s.target(0) : s.target; if (el && el.scrollIntoView && !Array.isArray(el)) el.scrollIntoView({ block: 'nearest' }); } catch (e) {} }
      }
      if (s.done && s.done()) { tourAdvance(); continue; }
      if (s.tab && !tabOn(s.tab) && !anyOtherModal('')) goTab(s.tab);       // 새로고침 등으로 탭이 달라졌으면 이 단계가 필요로 하는 탭으로 데려간다
      if (s._b) {                                                                                         // 장면: 시작 전에만 ready 를 본다(진행 중엔 박자가 알아서 기다린다)
        if (!SCN.started) { if (s.ready && !s.ready()) { if (s.expire && s.expire()) { tourAdvance(); continue; } return null; } SCN.started = true; SCN.t = Date.now(); }
        else if (s.expire && s.expire()) { tourAdvance(); continue; }
        const b = s._b[Math.min(SCN.i, s._b.length - 1)];
        const started = !!(memo[b.id] && memo[b.id].ran);                                                // 지켜보기 박자는 시작 동작(run)을 한 번 한 뒤에야 끝 조건을 본다(시작 전엔 조건이 우연히 참일 수 있다)
        if ((b.kind !== 'watch' || started) && beatCheck(b)) { if (SCN.i + 1 < s._b.length) { SCN.i++; SCN.t = Date.now(); SCN.untilAt = 0; continue; } tourAdvance(); continue; }
        return b;
      }
      if (s.ready && !s.ready()) { if (s.expire && s.expire()) { tourAdvance(); continue; } return null; }
      return s;
    }
    return null;
  }

  function pick() {
    const t = tut(); if (!t) return null;
    if (!t.done) return tourStep(t);
    if (!t.offered) return lobbyOn() ? OFFER : null;
    if (active && !t.seen[active.id]) {                                                      // 이미 뜬 팁은 닫을 때까지 유지 — 단 그 화면·팝업에 머무는 동안만
      let keep = ctxOk(active) && (!active.modal || vis(active.modal));
      if (keep && !active.pause) { let w = false; try { w = !!active.when(); } catch (e) { w = false; } if (w) active._offAt = 0; else { active._offAt = active._offAt || Date.now(); if (Date.now() - active._offAt > 1500) keep = false; } }   // 조건이 잠깐 깜박이는 건 봐 주고(1.5초), 계속 아니면 놓는다 — 게임을 멈추고 띄운(pause) 팁은 조건이 순간 연출(예: 판 방해 알림 글자 2.4초)에 걸려 있어도 읽는 중에 사라지지 않게 이 판정을 건너뛴다
      if (keep) return active;
      active._offAt = 0; active = null;                                                     // ⚠ 팁을 띄운 화면·팝업을 팁 버튼 없이 벗어나면(예: 캐릭터 상세를 ✕ 로 닫음) 놓아 준다 — 안 놓으면 이 팁이 다른 모든 팁(지도·전투·스킬·보상 …)을 영영 막는다. 못 본 팁은 다시 그 화면에 가면 뜬다
    }
    active = null;
    if (Date.now() - (T.lastTipAt || 0) < TIP_GAP) return null;                            // 한 번에 하나 — 방금 본 팁과 20초는 간격을 둔다
    for (const d of TIPS) { if (t.seen[d.id] || !ctxOk(d)) continue; let ok = false; try { ok = !!d.when(); } catch (e) { ok = false; } if (ok) { active = d; return d; } }
    return null;
  }
  const ctxOk = (d) => d.ctx === 'run' ? combatOn() : lobbyOn();
  const OFFER = { id: 'offer', ctx: 'lobby', kind: 'offer', msg: '더 자세해진 <b>튜토리얼</b>이 생겼어요! <b>3챕터</b>로 하나씩 안내해 드릴까요?' };
  TIPS.forEach(d => { d.tip = true; });

  function tick() {
    if (disabled) { if (built) hide(); return; }
    try {
      const t = tut(); if (!t || !meta()) return;
      if (T.skipOpen) { window.__tutPause = combatOn(); return; }     // 건너뛰기 확인 팝업이 떠 있는 동안은 아무것도 바꾸지 않는다
      if (loginOn() || (!lobbyOn() && !combatOn())) { hide(); return; }
      momentCheck();
      if (needsRaf()) startRaf();
      const d = pick();
      if (!d) { hide(); return; }
      if (anyOtherModal(d.modal)) { hide(); return; }               // 안내와 상관없는 팝업이 열려 있으면 잠시 숨김(진행은 유지)
      if (d.modal && !vis(d.modal)) { hide(); return; }
      show(d);
    } catch (e) { console.error('[tutorial]', e); disabled = true; try { hide(); cleanupScene(); } catch (_) {} }
  }
  setInterval(tick, 250);

  // ═════════ 공개 ═════════
  return {
    event(name) { if (disabled) return; setTimeout(tick, 0); },     // 게임에서 알리는 순간(예: 전투 phase 진입·튜토리얼 전투 승리) — 바로 다시 판단
    replay, skip: openSkip, tick, battleDue,
    get disabled() { return disabled; }, set disabled(v) { disabled = !!v; if (disabled) { hide(); cleanupScene(); } },
    debug: { TOUR, TIPS, SC, SCN, tut, frame, pickShot, goto(id) { const t = tut(); t.done = false; t.review = 0; t.at = id; entered = null; SCN.started = false; persist(); tick(); }, active: () => (shown ? shown.def.id : null), state: () => JSON.parse(JSON.stringify(tut())) }
  };
})();
