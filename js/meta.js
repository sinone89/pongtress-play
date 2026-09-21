'use strict';
/* PONGTRESS 메타층 — 로비/런 밖. content.js 이후, game.js 이전 로드.
 * 저장(localStorage) · 화폐 · 캐릭터 보유/편성/성장 · 가챠 · 상점 · 미션 + 로비 UI.
 */
const Meta = (function () {
  const KEY = 'pongtress_meta_v1';
  const $ = (id) => document.getElementById(id);
  let M = null, activeTab = 'sortie', onSortie = null;

  // ── 저장/로드 ──
  function load() {
    try { M = JSON.parse(localStorage.getItem(KEY)); } catch (e) { M = null; }
    if (!M || !M.owned) M = JSON.parse(JSON.stringify(META_START));
    // 전방호환 보정
    M.currencies = Object.assign({ gold: 0, mats: 0, gems: 0, docs: 0 }, M.currencies);
    M.shards = M.shards || {}; M.owned = M.owned || {}; M.stats = Object.assign({ runsWon: 0, kills: 0, floors: 0 }, M.stats);
    M.claimed = M.claimed || {}; M.daily = M.daily || { freeGachaDate: '' };
    M.maxStage = Math.min(STAGE_MAX, Math.max(1, M.maxStage || 1));
    M.stage = Math.min(M.maxStage, Math.max(1, M.stage || 1));
    if (!Array.isArray(M.party)) M.party = ['knight', 'grenadier', 'guard'];
    // 알 수 없는(구버전) id 정리 → 크래시 방지
    Object.keys(M.owned).forEach(id => { if (!ROSTER.some(c => c.id === id)) delete M.owned[id]; });
    while (M.party.length < 3) M.party.push(null);
    M.party = M.party.slice(0, 3).map(id => (id && M.owned[id]) ? id : null);
    save();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(M)); } catch (e) {} }

  // ── 조회/스탯 ──
  const base = (id) => ROSTER.find(c => c.id === id);
  function leveledDef(id) {
    const b = base(id), o = M.owned[id] || { level: 1, star: 1 };
    const lv = o.level || 1, st = o.star || 1;
    const am = 1 + (lv - 1) * GROWTH.atkPct + (st - 1) * GROWTH.starAtkPct;
    const hm = 1 + (lv - 1) * GROWTH.hpPct + (st - 1) * GROWTH.starHpPct;
    return Object.assign({}, b, { level: lv, star: st, atk: Math.round(b.atk * am), hp: Math.round(b.hp * hm) });
  }
  function partySlots() { return M.party.slice(0, 3); }        // [id|null ×3]
  function ownedIds() { return Object.keys(M.owned); }
  function stage() { return M.stage; }
  function maxStage() { return M.maxStage; }
  function setStage(s) { if (s >= 1 && s <= M.maxStage) { M.stage = s; save(); } }
  function levelCap(id) { const st = (M.owned[id] || {}).star || 1; return GROWTH.levelCapByStar[st] || 12; }

  // ── 화폐 ──
  function cur() { return M.currencies; }
  function canAfford(cost) { return Object.keys(cost).every(k => (k === 'shards' ? (M.shards[cost._id] || 0) : M.currencies[k]) >= cost[k]); }
  function pay(cost) {
    for (const k of Object.keys(cost)) { if (k === '_id') continue; if (k === 'shards') M.shards[cost._id] = (M.shards[cost._id] || 0) - cost.shards; else M.currencies[k] -= cost[k]; }
  }
  function gain(g) { for (const k of Object.keys(g)) M.currencies[k] = (M.currencies[k] || 0) + g[k]; }

  // ── 성장 ──
  function levelUp(id) {
    const o = M.owned[id]; if (!o) return false;
    if (o.level >= levelCap(id)) return false;
    const cost = GROWTH.levelUpCost(o.level);
    if (M.currencies.gold < cost) return false;
    M.currencies.gold -= cost; o.level++; save(); return true;
  }
  function promote(id) {
    const o = M.owned[id]; if (!o) return false;
    if (o.star >= GROWTH.starMax) return false;
    const c = GROWTH.promoteCost(o.star);
    if ((M.shards[id] || 0) < c.shards || M.currencies.mats < c.mats) return false;
    M.shards[id] -= c.shards; M.currencies.mats -= c.mats; o.star++; save(); return true;
  }

  // ── 가챠 ──
  function rollRarity() {
    const tot = GACHA.rates.reduce((s, r) => s + r.w, 0); let x = Math.random() * tot;
    for (const r of GACHA.rates) { x -= r.w; if (x <= 0) return r.rarity; }
    return 'common';
  }
  function pullOne() {
    const rar = rollRarity();
    const pool = ROSTER.filter(c => c.rarity === rar);
    const c = pool[Math.floor(Math.random() * pool.length)] || ROSTER[0];
    let isNew = false;
    if (M.owned[c.id]) { M.shards[c.id] = (M.shards[c.id] || 0) + GACHA.dupShards; }
    else { M.owned[c.id] = { level: 1, star: 1 }; isNew = true; }
    return { id: c.id, name: c.name, rarity: c.rarity, isNew };
  }
  function gacha(n, free) {
    if (free) { const today = new Date().toISOString().slice(0, 10); if (M.daily.freeGachaDate === today) return null; M.daily.freeGachaDate = today; }
    else { const cost = n === 10 ? GACHA.cost10 : GACHA.cost1; if (M.currencies.gems < cost) return null; M.currencies.gems -= cost; }
    const res = []; for (let i = 0; i < n; i++) res.push(pullOne());
    save(); return res;
  }
  function freeAvailable() { return M.daily.freeGachaDate !== new Date().toISOString().slice(0, 10); }

  // ── 문서 상점 ──
  function buyShards(id) {
    if (M.currencies.docs < DOC_SHOP.docCost) return false;
    M.currencies.docs -= DOC_SHOP.docCost; M.shards[id] = (M.shards[id] || 0) + DOC_SHOP.shardsPer; save(); return true;
  }

  // ── 미션 ──
  function missionProgress(m) { return Math.min(m.goal, M.stats[m.stat] || 0); }
  function claimMission(id) {
    const m = MISSIONS.find(x => x.id === id); if (!m || M.claimed[id]) return false;
    if (missionProgress(m) < m.goal) return false;
    gain(m.reward); M.claimed[id] = true; save(); return true;
  }

  // ── 편성 ──
  function inParty(id) { return M.party.indexOf(id) >= 0; }
  function toggleParty(id) {
    const i = M.party.indexOf(id);
    if (i >= 0) M.party[i] = null;
    else { const slot = M.party.indexOf(null); if (slot >= 0) M.party[slot] = id; else return false; }
    save(); return true;
  }

  // ── 런 종료 정산 ──
  function onRunEnd(r) {
    // r = { won, kills, floors, gold, stage }
    const mul = stageScale(r.stage || 1).reward;
    const earn = {
      gold: Math.round(((r.gold || 0) + (r.floors || 0) * 20) * mul),
      mats: Math.round(((r.floors || 0) * 8 + (r.won ? 30 : 0)) * mul),
      gems: r.won ? Math.round(30 * mul) : 0, docs: 0
    };
    gain(earn);
    M.stats.kills += (r.kills || 0);
    M.stats.floors += (r.floors || 0);
    let unlocked = 0;
    if (r.won) {
      M.stats.runsWon += 1;
      if ((r.stage || 1) >= M.maxStage && M.maxStage < STAGE_MAX) { M.maxStage = Math.min(STAGE_MAX, (r.stage || 1) + 1); unlocked = M.maxStage; }
    }
    save();
    return Object.assign(earn, { unlocked });
  }

  // ═══════════ 로비 UI ═══════════
  function rarTag(rar) { const R = RARITY[rar] || RARITY.common; return '<span class="rar" style="color:' + R.color + '">' + R.name + '</span>'; }
  function fmtCost(obj) { return Object.entries(obj).filter(([k]) => k !== '_id').map(([k, v]) => ({ gold: '🪙', mats: '🔩', gems: '💎', docs: '📜', shards: '🔷' }[k] + v)).join(' '); }

  function renderBar() {
    $('cur-gold').textContent = M.currencies.gold;
    $('cur-mats').textContent = M.currencies.mats;
    $('cur-gems').textContent = M.currencies.gems;
    $('cur-docs').textContent = M.currencies.docs;
  }

  function charChip(id, opts) {
    opts = opts || {};
    const b = base(id), o = M.owned[id], R = RARITY[b.rarity] || RARITY.common;
    const owned = !!o;
    return '<button class="char-chip' + (owned ? '' : ' locked') + (opts.selected ? ' sel' : '') + '" data-char="' + id + '" style="border-color:' + R.color + '55">'
      + '<img class="cc-cg" src="' + CharArt.path(id, 'cg') + '" alt="" onerror="this.remove()">'
      + '<span class="cc-name">' + b.name + '</span>'
      + (b.cls && CLASS[b.cls] ? '<span class="cc-cls" style="color:' + CLASS[b.cls].color + '">' + CLASS[b.cls].icon + ' ' + CLASS[b.cls].name + '</span>' : '')
      + (b.weapon ? '<span class="cc-wpn">🔫 ' + b.weapon + '</span>' : '')
      + (owned ? '<span class="cc-sub">Lv.' + o.level + ' ★' + o.star + '</span>' : '<span class="cc-sub">미보유</span>')
      + '<span class="cc-rar" style="color:' + R.color + '">' + R.name + '</span>'
      + (opts.inParty ? '<span class="cc-badge">편성</span>' : '')
      + '</button>';
  }

  function renderSortie() {
    // 스테이지 선택(상단)
    const ss = $('stage-select');
    if (ss) {
      let h = '<div class="ss-btns">';
      for (let s = 1; s <= STAGE_MAX; s++) {
        const locked = s > M.maxStage, sel = s === M.stage;
        h += '<button class="ss-btn' + (sel ? ' sel' : '') + (locked ? ' locked' : '') + '" data-stage="' + s + '"' + (locked ? ' disabled' : '') + '>' + (locked ? '🔒' : s) + '</button>';
      }
      ss.innerHTML = h + '</div>';
      const sc = stageScale(M.stage);
      $('stage-info').textContent = 'S' + M.stage + ' · 체력×' + sc.hp.toFixed(1) + ' 공격×' + sc.dmg.toFixed(1) + ' 보상×' + sc.reward.toFixed(1);
    }
    let n = partySlots().filter(Boolean).length;
    const warn = $('sortie-warn');
    if (n === 0) { warn.hidden = false; warn.textContent = '편성 탭에서 캐릭터를 1명 이상 배치하세요.'; $('btn-sortie').disabled = true; }
    else { warn.hidden = true; $('btn-sortie').disabled = false; }
    renderIdleCard();
    idleStart();
  }

  // ── 방치(idle) 보상 ──
  function idleEnsure() { if (!M.idle) M.idle = { last: 0 }; if (!M.idle.last) { M.idle.last = Date.now(); save(); } }
  function idlePending() {
    idleEnsure();
    const cap = IDLE.capHours * 60, mins = Math.min(cap, (Date.now() - M.idle.last) / 60000), mul = IDLE.mul(M.maxStage);
    return { mins: mins, gold: Math.floor(mins * IDLE.goldPerMin * mul), mats: Math.floor(mins * IDLE.matsPerMin * mul), capped: mins >= cap };
  }
  function claimIdle() { const p = idlePending(); if (p.gold <= 0 && p.mats <= 0) return null; M.currencies.gold += p.gold; M.currencies.mats += p.mats; M.idle.last = Date.now(); save(); return p; }
  function renderIdleCard() {
    const el = $('idle-reward'); if (!el) return;
    const p = idlePending(), hh = Math.floor(p.mins / 60), mm = Math.floor(p.mins % 60), has = (p.gold + p.mats) > 0;
    el.innerHTML = '<div class="il-top"><b>⏳ 방치 보상</b><span class="il-time">' + (p.capped ? '가득 참 · ' : '') + hh + '시간 ' + mm + '분 · S' + M.maxStage + ' ×' + IDLE.mul(M.maxStage).toFixed(1) + '</span></div>'
      + '<div class="il-row"><span class="il-amt">🪙 ' + p.gold + '  🔩 ' + p.mats + '</span>'
      + '<button class="sns-btn sm" data-idle="claim"' + (has ? '' : ' disabled') + '>받기</button></div>';
  }

  // ── 방치 홈 자동전투 연출(코스메틱) ──
  let _idleRAF = 0;
  function idleStop() { if (_idleRAF) { cancelAnimationFrame(_idleRAF); _idleRAF = 0; } }
  function idleStart() {
    const cv = $('idle-canvas'); if (!cv) return; idleStop();
    const ctx = cv.getContext('2d'); const party = partySlots();
    const laneCol = ['#46e6d0', '#ffcf5c', '#ff5db1'];
    const D = { w: 0, h: 0, en: [], bm: [], pop: [], cardT: 0 };
    function fit() { const r = cv.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1); D.w = Math.max(1, r.width); D.h = Math.max(1, r.height); cv.width = D.w * dpr; cv.height = D.h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    fit();
    const eCol = ['#7ac74f', '#9b6cff', '#e0733a', '#5ad0a0'];
    function mkEnemy(y) { const hp = 2 + Math.floor(Math.random() * 2); return { x: 24 + Math.random() * (D.w - 48), y: y, r: 12 + Math.random() * 4, col: eCol[Math.floor(Math.random() * eCol.length)], hp: hp, mhp: hp, hit: 0 }; }
    function spawn() { if (D.en.length < 9) D.en.push(mkEnemy(-12)); }
    for (let i = 0; i < 5; i++) D.en.push(mkEnemy(Math.random() * D.h * 0.5));
    function charX(i, n) { n = Math.max(1, n); return D.w * (i + 0.5) / n; }
    const fireLine = () => D.h * 0.55;      // 적이 파티 근처(하단)까지 내려온 뒤 격파 — 연출이 꽉 차 보이게
    let last = performance.now(), fireT = 0;
    function step(dt) {
      if (Math.random() < dt * 1.3) spawn();
      for (const e of D.en) { e.y += dt * 30; if (e.hit > 0) e.hit -= dt; }
      const chars = party.filter(Boolean);
      fireT -= dt;
      const targets = D.en.filter(e => e.y > fireLine());
      if (targets.length && fireT <= 0) {
        fireT = 0.22 + Math.random() * 0.12;                       // 사격 간격
        const t = targets[0];                                       // 가장 앞선(먼저 진입) 적 집중 사격
        const ci = Math.floor(Math.random() * Math.max(1, chars.length));
        D.bm.push({ x1: charX(ci, chars.length), y1: D.h - 24, x2: t.x, y2: t.y, t: 0.16 });
        t.hp -= 1; t.hit = 0.14;
        if (t.hp <= 0) { D.pop.push({ x: t.x, y: t.y, r: t.r, t: 0.32 }); t.dead = true; }
      }
      D.en = D.en.filter(e => !e.dead && e.y < D.h - 20);
      for (const b of D.bm) b.t -= dt; D.bm = D.bm.filter(b => b.t > 0);
      for (const p of D.pop) p.t -= dt; D.pop = D.pop.filter(p => p.t > 0);
      D.cardT += dt; if (D.cardT > 2) { D.cardT = 0; renderIdleCard(); }
    }
    function render() {
      ctx.clearRect(0, 0, D.w, D.h);
      for (const e of D.en) {
        ctx.fillStyle = e.hit > 0 ? '#ffffff' : e.col; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 7); ctx.fill();
        if (e.hp < e.mhp) { const bw = e.r * 1.8; ctx.fillStyle = '#0008'; ctx.fillRect(e.x - bw / 2, e.y - e.r - 6, bw, 3); ctx.fillStyle = '#ff6b6b'; ctx.fillRect(e.x - bw / 2, e.y - e.r - 6, bw * e.hp / e.mhp, 3); }
      }
      for (const b of D.bm) { ctx.strokeStyle = 'rgba(255,220,120,' + (b.t / 0.18) + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke(); }
      for (const p of D.pop) { ctx.strokeStyle = 'rgba(255,255,255,' + (p.t / 0.3) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + (0.3 - p.t) * 46, 0, 7); ctx.stroke(); }
      const chars = party.filter(Boolean);
      for (let i = 0; i < chars.length; i++) {
        const id = chars[i], cx = charX(i, chars.length), cy = D.h - 22;
        const spr = (typeof CharArt !== 'undefined') ? CharArt.sprite(id, 'fire') : null;
        if (spr) { const s = Math.min(D.w / chars.length * 0.9, 64); const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false; ctx.drawImage(spr, cx - s / 2, cy - s * 0.72, s, s); ctx.imageSmoothingEnabled = sm; }
        else { ctx.fillStyle = laneCol[i % 3]; ctx.beginPath(); ctx.arc(cx, cy, 15, 0, 7); ctx.fill(); ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 2; ctx.stroke(); }
      }
    }
    function frame(now) {
      if (cv.offsetParent === null) { idleStop(); return; }   // 홈이 숨겨지면 자동 정지
      const dt = Math.min(0.05, (now - last) / 1000); last = now; step(dt); render();
      _idleRAF = requestAnimationFrame(frame);
    }
    _idleRAF = requestAnimationFrame(frame);
  }

  function renderFormation() {
    const slots = $('lane-slots'); slots.innerHTML = '';
    partySlots().forEach((id, lane) => {
      const d = document.createElement('div'); d.className = 'lane-slot' + (id ? '' : ' empty'); d.dataset.lane = lane;
      if (id) { const c = leveledDef(id); d.innerHTML = '<b>' + c.name + '</b><span>Lv.' + c.level + ' ★' + c.star + '</span><span class="lane-lbl">' + (lane + 1) + '레인 · 탭하여 해제</span>'; d.dataset.char = id; }
      else d.innerHTML = '<span class="lane-empty">＋</span><span class="lane-lbl">' + (lane + 1) + '레인</span>';
      slots.append(d);
    });
    const list = $('owned-list'); list.innerHTML = ROSTER.map(c => charChip(c.id, { inParty: inParty(c.id) })).join('');
    const oc = $('owned-count'); if (oc) oc.textContent = ROSTER.filter(c => M.owned[c.id]).length + '/' + ROSTER.length;
  }

  function renderShop() {
    const g = $('gacha-box');
    g.innerHTML = '<div class="sns-card">'
      + '<div class="sns-title">🎲 요원 가챠</div>'
      + '<div class="sns-cap">' + GACHA.rates.slice().reverse().map(r => (RARITY[r.rarity] || {}).name + ' ' + r.w + '%').join(' · ') + ' · 중복 시 조각 ' + GACHA.dupShards + '</div>'
      + '<button class="sns-btn full" data-gacha="1" style="margin-bottom:8px">단일 뽑기 💎' + GACHA.cost1 + '</button>'
      + '<button class="sns-btn full" data-gacha="10" style="margin-bottom:8px">10연 뽑기 💎' + GACHA.cost10 + '</button>'
      + '<button class="sns-btn full ' + (freeAvailable() ? '' : 'sub') + '" data-gacha="free"' + (freeAvailable() ? '' : ' disabled') + '>' + (freeAvailable() ? '🎁 오늘의 무료 뽑기' : '무료 뽑기 (내일)') + '</button>'
      + '</div>';
    const d = $('doc-shop');
    d.innerHTML = '<div class="sns-cap" style="margin:2px 2px 8px">문서 ' + DOC_SHOP.docCost + ' → 조각 ' + DOC_SHOP.shardsPer + ' · 보유 문서 📜' + M.currencies.docs + '</div>'
      + ROSTER.filter(c => M.owned[c.id]).map(c =>
          '<div class="sns-card"><div class="sns-row">'
          + '<div class="sns-ico">🧩</div>'
          + '<div class="sns-grow"><div class="sns-nm">' + c.name + ' 조각</div><div class="sns-ds">보유 🔷' + (M.shards[c.id] || 0) + '</div></div>'
          + '<div class="sns-act"><button class="sns-btn sm" data-doc="' + c.id + '">교환</button></div>'
          + '</div></div>').join('');
  }

  function renderMissions() {
    const list = $('mission-list');
    list.innerHTML = MISSIONS.map(m => {
      const p = missionProgress(m), done = p >= m.goal, claimed = !!M.claimed[m.id];
      const pct = Math.min(100, 100 * p / m.goal);
      const label = claimed ? '수령 완료' : done ? '🎁 수령' : '진행 중';
      return '<div class="sns-card"><div class="sns-row" style="align-items:flex-start">'
        + '<div class="sns-ico">🎯</div>'
        + '<div class="sns-grow">'
        +   '<div class="sns-nm">' + m.name + ' <span class="mi-reward">' + fmtCost(m.reward) + '</span></div>'
        +   '<div class="sns-ds">' + m.desc + ' (' + p + '/' + m.goal + ')</div>'
        +   '<div class="mi-bar"><div style="width:' + pct + '%"></div></div>'
        + '</div>'
        + '<div class="sns-act"><button class="sns-btn sm ' + (done && !claimed ? '' : 'sub') + '" data-mission="' + m.id + '"' + (done && !claimed ? '' : ' disabled') + '>' + label + '</button></div>'
        + '</div></div>';
    }).join('');
  }

  // ── 치트(디버그) ──
  function renderCheat() {
    const box = $('cheat-box');
    box.innerHTML = '<h2>치트 · 디버그</h2>'
      + '<p class="muted">🪙' + M.currencies.gold + ' 🔩' + M.currencies.mats + ' 💎' + M.currencies.gems + ' 📜' + M.currencies.docs + ' · 보유 ' + Object.keys(M.owned).length + '/' + ROSTER.length + '</p>'
      + '<div class="cd-btns">'
      + '<button class="btn" data-cheat="cur">화폐 전체 +9999</button>'
      + '<button class="btn" data-cheat="unlock">전 캐릭터 획득</button>'
      + '<button class="btn" data-cheat="shards">모든 조각 +999</button>'
      + '<button class="btn" data-cheat="max">전 캐릭터 Lv·★ 최대</button>'
      + '<button class="btn" data-cheat="stages">전 스테이지 해금</button>'
      + '<button class="btn" data-cheat="mission">미션 스탯 채우기</button>'
      + '<button class="btn" data-cheat="freegacha">무료 뽑기 리셋</button>'
      + '<button class="btn" data-cheat="reset">데이터 초기화</button>'
      + '</div>'
      + '<button class="btn cd-close" data-close="1">닫기</button>';
  }
  function openCheat() { renderCheat(); $('cheat-modal').hidden = false; }
  function doCheat(k) {
    if (k === 'cur') ['gold', 'mats', 'gems', 'docs'].forEach(c => M.currencies[c] += 9999);
    else if (k === 'unlock') ROSTER.forEach(c => { if (!M.owned[c.id]) M.owned[c.id] = { level: 1, star: 1 }; });
    else if (k === 'shards') ROSTER.forEach(c => { M.shards[c.id] = (M.shards[c.id] || 0) + 999; });
    else if (k === 'max') Object.keys(M.owned).forEach(id => { M.owned[id].star = GROWTH.starMax; M.owned[id].level = GROWTH.levelCapByStar[GROWTH.starMax]; });
    else if (k === 'stages') M.maxStage = STAGE_MAX;
    else if (k === 'mission') { M.stats.runsWon = 99; M.stats.kills = 999; M.stats.floors = 99; }
    else if (k === 'freegacha') M.daily.freeGachaDate = '';
    else if (k === 'reset') { try { localStorage.removeItem(KEY); } catch (e) {} load(); }
    save(); renderCheat(); renderLobby();
  }

  function renderTab() {
    for (const t of ['sortie', 'formation', 'shop', 'mission']) $('tab-' + t).hidden = (t !== activeTab);
    document.querySelectorAll('#lobby-nav .tabbtn').forEach(x => x.classList.toggle('active', x.dataset.tab === activeTab));
    if (activeTab !== 'sortie') idleStop();               // 홈이 아니면 연출 정지
    if (activeTab === 'sortie') renderSortie();
    else if (activeTab === 'formation') renderFormation();
    else if (activeTab === 'shop') renderShop();
    else if (activeTab === 'mission') renderMissions();
  }
  function renderLobby() { renderBar(); renderTab(); }

  // ── 캐릭터 상세 모달 ──
  function openChar(id) {
    const b = base(id), o = M.owned[id], R = RARITY[b.rarity] || RARITY.common;
    const box = $('char-modal-box');
    if (!o) { box.innerHTML = '<h2>' + b.name + '</h2><p>' + rarTag(b.rarity) + '</p><p class="muted">미보유 — 상점 가챠로 획득하세요.</p><button class="btn" data-close="1">닫기</button>'; $('char-modal').hidden = false; return; }
    const c = leveledDef(id), cap = levelCap(id), maxLv = o.level >= cap, maxStar = o.star >= GROWTH.starMax;
    const luCost = GROWTH.levelUpCost(o.level), pr = GROWTH.promoteCost(o.star);
    box.innerHTML = '<img class="cd-cg" src="' + CharArt.path(id, 'cg') + '" alt="" onerror="this.style.display=\'none\'">'
      + '<h2>' + b.name + ' ' + rarTag(b.rarity) + '</h2>'
      + (b.cls && CLASS[b.cls] ? '<p class="cd-stat" style="color:' + CLASS[b.cls].color + '">' + CLASS[b.cls].icon + ' ' + CLASS[b.cls].name + ' · ' + CLASS[b.cls].desc + '</p>' : '')
      + (b.weapon ? '<p class="cd-stat" style="color:var(--cyan)">🔫 ' + b.weapon + '</p>' : '')
      + (b.concept ? '<p class="muted" style="font-size:12px;margin:4px 0 8px">' + b.concept + '</p>' : '')
      + '<p class="cd-stat">Lv.' + o.level + '/' + cap + ' · ★' + o.star + ' · 🔷' + (M.shards[id] || 0) + '</p>'
      + '<p class="cd-stat">공격 ' + c.atk + ' · 체력 ' + c.hp + ' · 골칸 ' + c.gol + '</p>'
      + '<p class="muted">액티브 ' + b.active.name + ' (게이지 ' + b.active.gauge + ') · 패시브 ' + b.passive.name + '</p>'
      + '<div class="cd-btns">'
      + '<button class="btn" data-lvup="' + id + '"' + (maxLv || M.currencies.gold < luCost ? ' disabled' : '') + '>' + (maxLv ? '레벨 최대' : '레벨업 🪙' + luCost) + '</button>'
      + '<button class="btn" data-promote="' + id + '"' + (maxStar || (M.shards[id] || 0) < pr.shards || M.currencies.mats < pr.mats ? ' disabled' : '') + '>' + (maxStar ? '성급 최대' : '승급 🔷' + pr.shards + ' 🔩' + pr.mats) + '</button>'
      + '<button class="btn ' + (inParty(id) ? '' : 'primary') + '" data-party="' + id + '">' + (inParty(id) ? '편성 해제' : '편성') + '</button>'
      + '</div>'
      + '<button class="btn cd-close" data-close="1">닫기</button>';
    $('char-modal').hidden = false;
  }

  // ── 가챠 결과 모달 ──
  function showGachaResult(res) {
    const box = $('gacha-modal-box');
    box.innerHTML = '<h2>뽑기 결과</h2><div class="gacha-res">'
      + res.map(r => { const R = RARITY[r.rarity]; return '<div class="gr-item" style="border-color:' + R.color + '"><img class="gr-cg" src="' + CharArt.path(r.id, 'cg') + '" alt="" onerror="this.remove()"><b style="color:' + R.color + '">' + r.name + '</b><span>' + R.name + '</span><span class="gr-tag">' + (r.isNew ? 'NEW' : '조각+' + GACHA.dupShards) + '</span></div>'; }).join('')
      + '</div><button class="btn primary" data-close="1">확인</button>';
    $('gacha-modal').hidden = false;
  }

  // ── 이벤트 와이어링(위임) ──
  function init(opts) {
    onSortie = opts && opts.onSortie;
    document.querySelectorAll('#lobby-nav .tabbtn').forEach(t => t.onclick = () => { activeTab = t.dataset.tab; renderTab(); });
    $('btn-sortie').onclick = () => { if (partySlots().some(x => x)) onSortie && onSortie(); };
    $('stage-select').onclick = (e) => { const b = e.target.closest('[data-stage]'); if (b && !b.disabled) { setStage(+b.dataset.stage); renderSortie(); } };
    // 편성 탭: 캐릭터 칩/레인 슬롯
    $('owned-list').onclick = (e) => { const el = e.target.closest('[data-char]'); if (el) openChar(el.dataset.char); };
    $('lane-slots').onclick = (e) => { const el = e.target.closest('[data-char]'); if (el) { toggleParty(el.dataset.char); renderTab(); } };
    // 상점 탭
    $('gacha-box').onclick = (e) => {
      const el = e.target.closest('[data-gacha]'); if (!el || el.disabled) return;
      const which = el.dataset.gacha;
      const res = which === 'free' ? gacha(1, true) : gacha(which === '10' ? 10 : 1, false);
      if (res) { if (typeof Sound !== 'undefined') Sound.play('gacha'); showGachaResult(res); renderLobby(); }
    };
    $('doc-shop').onclick = (e) => { const el = e.target.closest('[data-doc]'); if (el) { buyShards(el.dataset.doc); renderShop(); renderBar(); } };
    // 미션
    $('mission-list').onclick = (e) => { const el = e.target.closest('[data-mission]'); if (el && !el.disabled) { claimMission(el.dataset.mission); renderMissions(); renderBar(); } };
    // 방치 보상 받기
    const ir = $('idle-reward'); if (ir) ir.onclick = (e) => { const b = e.target.closest('[data-idle]'); if (b && !b.disabled) { const p = claimIdle(); if (p && typeof Sound !== 'undefined') Sound.play('charge'); renderIdleCard(); renderBar(); } };
    // 캐릭터 모달
    $('char-modal').onclick = (e) => {
      if (e.target.dataset.close || e.target === $('char-modal')) { $('char-modal').hidden = true; return; }
      const lv = e.target.closest('[data-lvup]'), pr = e.target.closest('[data-promote]'), pt = e.target.closest('[data-party]');
      if (lv) { levelUp(lv.dataset.lvup); openChar(lv.dataset.lvup); renderBar(); }
      else if (pr) { promote(pr.dataset.promote); openChar(pr.dataset.promote); renderBar(); }
      else if (pt) { toggleParty(pt.dataset.party); openChar(pt.dataset.party); }
    };
    $('gacha-modal').onclick = (e) => { if (e.target.dataset.close || e.target === $('gacha-modal')) $('gacha-modal').hidden = true; };
    // 치트: 좌하단 build 태그 탭
    const tag = $('build-tag'); if (tag) tag.onclick = openCheat;
    $('cheat-modal').onclick = (e) => {
      if (e.target.dataset.close || e.target === $('cheat-modal')) { $('cheat-modal').hidden = true; return; }
      const b = e.target.closest('[data-cheat]'); if (b) doCheat(b.dataset.cheat);
    };
  }

  return { load, save, init, renderLobby, partySlots, leveledDef, onRunEnd, openCheat, stage, maxStage, get state() { return M; } };
})();
