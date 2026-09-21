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
    if (!Array.isArray(M.party)) M.party = ['knight', 'archer', 'guard'];
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
      + '<span class="cc-name">' + b.name + '</span>'
      + (owned ? '<span class="cc-sub">Lv.' + o.level + ' ★' + o.star + '</span>' : '<span class="cc-sub">미보유</span>')
      + '<span class="cc-rar" style="color:' + R.color + '">' + R.name + '</span>'
      + (opts.inParty ? '<span class="cc-badge">편성</span>' : '')
      + '</button>';
  }

  function renderSortie() {
    // 스테이지 선택
    const ss = $('stage-select');
    if (ss) {
      let h = '<div class="ss-btns">';
      for (let s = 1; s <= STAGE_MAX; s++) {
        const locked = s > M.maxStage, sel = s === M.stage;
        h += '<button class="ss-btn' + (sel ? ' sel' : '') + (locked ? ' locked' : '') + '" data-stage="' + s + '"' + (locked ? ' disabled' : '') + '>' + (locked ? '🔒' : s) + '</button>';
      }
      ss.innerHTML = h + '</div>';
      const sc = stageScale(M.stage);
      $('stage-info').textContent = '스테이지 ' + M.stage + ' / 해금 ' + M.maxStage + ' · 적 체력 ×' + sc.hp.toFixed(1) + ' 공격 ×' + sc.dmg.toFixed(1) + ' · 보상 ×' + sc.reward.toFixed(1);
    }
    const box = $('sortie-party'); box.innerHTML = '';
    let hp = 0, n = 0;
    partySlots().forEach((id, lane) => {
      const d = document.createElement('div'); d.className = 'lane-slot' + (id ? '' : ' empty');
      if (id) { const c = leveledDef(id); hp += c.hp; n++; d.innerHTML = '<b>' + c.name + '</b><span>공 ' + c.atk + ' · 체 ' + c.hp + '</span><span class="lane-lbl">' + (lane + 1) + '레인</span>'; }
      else d.innerHTML = '<span class="lane-empty">비어 있음</span><span class="lane-lbl">' + (lane + 1) + '레인</span>';
      box.append(d);
    });
    const warn = $('sortie-warn');
    if (n === 0) { warn.hidden = false; warn.textContent = '편성 탭에서 캐릭터를 1명 이상 배치하세요.'; $('btn-sortie').disabled = true; }
    else { warn.hidden = true; $('btn-sortie').disabled = false; }
    $('sortie-info').textContent = '성벽 HP ' + hp + ' · 편성 ' + n + '/3';
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
      + '<div class="sns-cap">에픽 5% · 레어 27% · 커먼 68% · 중복 시 조각 ' + GACHA.dupShards + '</div>'
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
    box.innerHTML = '<h2>' + b.name + ' ' + rarTag(b.rarity) + '</h2>'
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
      + res.map(r => { const R = RARITY[r.rarity]; return '<div class="gr-item" style="border-color:' + R.color + '"><b style="color:' + R.color + '">' + r.name + '</b><span>' + R.name + '</span><span class="gr-tag">' + (r.isNew ? 'NEW' : '조각+' + GACHA.dupShards) + '</span></div>'; }).join('')
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
