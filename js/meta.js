'use strict';
/* PONGTRESS 메타층 — 로비/런 밖. content.js 이후, game.js 이전 로드.
 * 저장(localStorage) · 화폐 · 캐릭터 보유/편성/성장 · 가챠 · 상점 · 미션 + 로비 UI.
 */
const Meta = (function () {
  const KEY = 'pongtress_meta_v1';                         // 레거시(익명) 세이브 키
  const ACCTS_KEY = 'pongtress_accts', CUR_KEY = 'pongtress_cur';
  const $ = (id) => document.getElementById(id);
  let M = null, activeTab = 'home', onSortie = null, cdTab = 'lvup', cdId = null;

  // ── 로컬 계정(다중 프로필): 아이디/비번 → 계정별 세이브 (스틸앤샷式) ──
  let curAcct = null; try { curAcct = localStorage.getItem(CUR_KEY) || null; } catch (e) {}
  function saveKey() { return curAcct ? ('pongtress_meta_' + curAcct) : KEY; }
  function getAccts() { try { return JSON.parse(localStorage.getItem(ACCTS_KEY)) || {}; } catch (e) { return {}; } }
  function setAccts(a) { try { localStorage.setItem(ACCTS_KEY, JSON.stringify(a)); } catch (e) {} }
  function curAccount() { return curAcct; }
  function needsLogin() { return !curAcct; }
  function lgMsg(m) { const e = $('lg-msg'); if (e) e.textContent = m || ''; }
  function showLogin() { const l = $('login'); if (l) l.classList.add('show'); const id = $('lg-id'); if (id) setTimeout(() => id.focus(), 80); }
  function submitLogin() {
    const id = ($('lg-id').value || '').trim(), pw = $('lg-pw').value || '';
    if (!id || !pw) { lgMsg('아이디와 비밀번호를 입력하세요'); return; }
    if (id.length < 2) { lgMsg('아이디는 2자 이상이어야 해요'); return; }
    const a = getAccts();
    if (a[id]) { if (a[id].pw !== pw) { lgMsg('비밀번호가 틀렸어요'); return; } }   // 기존 계정: 비번 확인
    else { a[id] = { pw }; setAccts(a); }                                          // 새 아이디 = 새 계정 자동 생성
    try { localStorage.setItem(CUR_KEY, id); } catch (e) {}
    location.reload();                                                             // 리로드로 해당 계정 세이브 재초기화
  }
  function logout() {
    if (!confirm('로그아웃할까요? 진행상황은 「' + curAcct + '」 계정에 저장돼 있어요.')) return;
    try { localStorage.removeItem(CUR_KEY); } catch (e) {}
    location.reload();
  }

  // ── 저장/로드 ──
  function load() {
    try { M = JSON.parse(localStorage.getItem(saveKey())); } catch (e) { M = null; }
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
  function save() { if (!curAcct) return; try { localStorage.setItem(saveKey(), JSON.stringify(M)); } catch (e) {} }   // 로그인 전(게이트)엔 저장 안 함

  // ── 조회/스탯 ──
  const base = (id) => ROSTER.find(c => c.id === id);
  function leveledDef(id) {
    const b = base(id), o = M.owned[id] || { level: 1, star: 1 };
    const lv = o.level || 1, st = o.star || 1;
    const am = 1 + (lv - 1) * GROWTH.atkPct + (st - 1) * GROWTH.starAtkPct;
    const hm = 1 + (lv - 1) * GROWTH.hpPct + (st - 1) * GROWTH.starHpPct;
    return Object.assign({}, b, { level: lv, star: st, atk: Math.round(b.atk * am), hp: Math.round(b.hp * hm) });
  }
  // 임의 레벨/성급의 스탯(현재→다음 비교용). gol(골칸)은 고정.
  function statAt(id, lv, st) {
    const b = base(id);
    const am = 1 + (lv - 1) * GROWTH.atkPct + (st - 1) * GROWTH.starAtkPct;
    const hm = 1 + (lv - 1) * GROWTH.hpPct + (st - 1) * GROWTH.starHpPct;
    return { atk: Math.round(b.atk * am), hp: Math.round(b.hp * hm), gol: b.gol };
  }
  const RAR_G = { common: 'g-n', rare: 'g-r', epic: 'g-e', legendary: 'g-l' };   // 등급 배너 클래스
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
  // 드래그 배치: 지정 레인에 캐릭터 할당(다른 레인에 있으면 제거=상호배타). 비어있는 슬롯이면 그 자리에.
  function assignPartySlot(lane, id) {
    if (lane < 0 || lane > 2 || !M.owned[id]) return false;
    const prev = M.party.indexOf(id); if (prev >= 0) M.party[prev] = null;
    M.party[lane] = id; save(); return true;
  }
  function clearPartySlot(lane) { if (lane >= 0 && lane <= 2) { M.party[lane] = null; save(); } }

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
    const b = base(id), o = M.owned[id], R = RARITY[b.rarity] || RARITY.common, g = RAR_G[b.rarity] || 'g-n', owned = !!o;
    let stars = ''; for (let s = 1; s <= GROWTH.starMax; s++) stars += '<span class="sc-st' + (owned && s <= o.star ? ' on' : '') + '">★</span>';
    return '<button class="stchar' + (owned ? '' : ' locked') + (opts.placed ? ' placed' : '') + '" data-char="' + id + '">'
      + '<div class="sc-top"><div class="sc-grade ' + g + '">' + R.name + '</div><div class="sc-star">' + stars + '</div></div>'
      + '<div class="sc-img"><img class="sc-cg" src="' + CharArt.path(id, 'load') + '" alt="" onerror="this.remove()">'
      +   (owned ? '<span class="sc-lv">Lv.' + o.level + '</span>' : '<span class="sc-lv locked">미보유</span>')
      +   (opts.inParty ? '<span class="onbadge">편성</span>' : '')
      + '</div>'
      + '<div class="sc-name">' + b.name + '</div>'
      + '</button>';
  }

  // 홈 = 자동전투 연출(풀블리드) + 방치 보상
  function renderHome() { renderIdleCard(); idleStart(); }

  // 출격 = 스테이지 선택 + 편성 부대 + 출격 버튼
  function renderSortie() {
    const ss = $('stage-select');
    if (ss) {
      let h = '<div class="ss-btns">';
      for (let s = 1; s <= STAGE_MAX; s++) {
        const locked = s > M.maxStage, sel = s === M.stage;
        h += '<button class="ss-btn' + (sel ? ' sel' : '') + (locked ? ' locked' : '') + '" data-stage="' + s + '"' + (locked ? ' disabled' : '') + '>' + (locked ? '🔒' : s) + '</button>';
      }
      ss.innerHTML = h + '</div>';
      const sc = stageScale(M.stage);
      $('stage-info').textContent = 'S' + M.stage + ' · 적 체력×' + sc.hp.toFixed(1) + ' 공격×' + sc.dmg.toFixed(1) + ' · 보상×' + sc.reward.toFixed(1);
    }
    const box = $('sortie-party');
    if (box) {
      box.className = 'lane-slots-view'; box.innerHTML = '';
      partySlots().forEach((id, lane) => {
        const d = document.createElement('div'); d.className = 'lane-slot ro' + (id ? ' on' : ' empty');
        if (id) {
          const c = leveledDef(id), b = base(id), R = RARITY[b.rarity] || RARITY.common, g = RAR_G[b.rarity] || 'g-n';
          d.innerHTML = '<span class="ls-rlbl">' + (lane + 1) + '레인</span>'
            + '<div class="ls-img"><img src="' + CharArt.path(id, 'load') + '" alt="" onerror="this.remove()"></div>'
            + '<div class="ls-nm"><span class="ls-g ' + g + '">' + R.name + '</span><span class="ls-nn">' + c.name + '</span></div>';
        } else d.innerHTML = '<span class="lane-empty">–</span><span class="lane-lbl">' + (lane + 1) + '레인</span>';
        box.append(d);
      });
    }
    const n = partySlots().filter(Boolean).length, warn = $('sortie-warn');
    if (n === 0) { warn.hidden = false; warn.textContent = '편성 탭에서 캐릭터를 1명 이상 배치하세요.'; $('btn-sortie').disabled = true; }
    else { warn.hidden = true; $('btn-sortie').disabled = false; }
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
    function fit() { const dpr = Math.min(2, window.devicePixelRatio || 1); D.w = Math.max(1, cv.clientWidth || 300); D.h = Math.max(1, cv.clientHeight || 260); cv.width = D.w * dpr; cv.height = D.h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
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
        D.bm.push({ x1: charX(ci, chars.length), y1: D.h - 132, x2: t.x, y2: t.y, t: 0.16 });
        t.hp -= 1; t.hit = 0.14;
        if (t.hp <= 0) { D.pop.push({ x: t.x, y: t.y, r: t.r, t: 0.32 }); t.dead = true; }
      }
      D.en = D.en.filter(e => !e.dead && e.y < D.h - 124);   // 방치보상 카드 위에서 소멸(겹침 방지)
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
        const id = chars[i], cx = charX(i, chars.length), cy = D.h - 132;
        const spr = (typeof CharArt !== 'undefined') ? CharArt.sprite(id, 'fire') : null;
        if (spr) { const s = Math.min(D.w / chars.length * 0.86, 168); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(spr, cx - s / 2, cy - s * 0.72, s, s); }
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
      const d = document.createElement('div'); d.className = 'lane-slot' + (id ? ' on' : ' empty'); d.dataset.slot = lane; d.dataset.lane = lane;
      if (id) {
        const c = leveledDef(id), b = base(id), R = RARITY[b.rarity] || RARITY.common, g = RAR_G[b.rarity] || 'g-n';
        d.dataset.char = id;
        d.innerHTML = '<span class="ls-rlbl">' + (lane + 1) + '레인</span>'
          + '<button class="ls-x" data-un="' + lane + '">✕</button>'
          + '<div class="ls-img"><img src="' + CharArt.path(id, 'load') + '" alt="" onerror="this.remove()"></div>'
          + '<div class="ls-nm"><span class="ls-g ' + g + '">' + R.name + '</span><span class="ls-nn">' + c.name + '</span></div>';
      } else d.innerHTML = '<span class="lane-empty">＋</span><span class="lane-lbl">' + (lane + 1) + '레인 · 드래그 배치</span>';
      slots.append(d);
    });
    const list = $('owned-list'); list.innerHTML = ROSTER.map(c => charChip(c.id, { inParty: inParty(c.id), placed: inParty(c.id) })).join('');
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
    else if (k === 'reset') { try { localStorage.removeItem(saveKey()); } catch (e) {} load(); }
    save(); renderCheat(); renderLobby();
  }

  function renderTab() {
    for (const t of ['home', 'sortie', 'formation', 'shop', 'mission']) $('tab-' + t).hidden = (t !== activeTab);
    document.querySelectorAll('#lobby-nav .tabbtn').forEach(x => x.classList.toggle('active', x.dataset.tab === activeTab));
    if (activeTab !== 'home') idleStop();                  // 홈이 아니면 연출 정지
    if (activeTab === 'home') renderHome();
    else if (activeTab === 'sortie') renderSortie();
    else if (activeTab === 'formation') renderFormation();
    else if (activeTab === 'shop') renderShop();
    else if (activeTab === 'mission') renderMissions();
  }
  function renderLobby() { renderBar(); renderTab(); }

  // ── 캐릭터 상세 모달 (스틸앤샷式: 프레임 초상화 + 정보 + 스킬 + 레벨업/승급 탭) ──
  const PEG_NM = { mult2: '×2 증식', mult5: '×5 증식', bumper: '범퍼', attack: '공격', gold: '골드' };
  function skillText(sk) {
    switch (sk.kind) {
      case 'bigHit': return '맨 앞 적에게 공격력 ×' + sk.mult + ' 강타';
      case 'extraShots': return '이번 턴 추가 ' + sk.shots + '발 사격';
      case 'aoe': return '앞 ' + sk.count + '명에게 광역 포격 (공격 ×' + (sk.mult || 1) + ')';
      case 'heal': return '성벽 HP +' + sk.amount + ' 회복';
      case 'stun': return '앞 ' + sk.count + '명 ' + (sk.turns || 1) + '턴 기절';
      case 'addPeg': return '핀볼판에 ' + (PEG_NM[sk.peg] || sk.peg) + ' 페그 +' + sk.n;
      case 'addBall': return '전투 시작 장전 볼 +' + sk.n;
      case 'closeBlank': return '전투 시작 시 꽝 포켓 ' + sk.n + '칸 개방';
      default: return '';
    }
  }
  function cycleChar(dir) {
    const owned = ROSTER.filter(c => M.owned[c.id]).map(c => c.id);
    if (owned.length < 2) return;
    const i = owned.indexOf(cdId);
    openChar(owned[(i + dir + owned.length) % owned.length]);
  }
  function openChar(id) {
    cdId = id;
    const b = base(id), o = M.owned[id], R = RARITY[b.rarity] || RARITY.common;
    const box = $('char-modal-box'); box.classList.add('cd-modal');
    if (!o) { box.innerHTML = '<h2>' + b.name + ' ' + rarTag(b.rarity) + '</h2><p class="muted">미보유 — 상점 가챠로 획득하세요.</p><button class="sns-btn sub" data-close="1">닫기</button>'; $('char-modal').hidden = false; return; }
    const cap = levelCap(id), maxLv = o.level >= cap, maxStar = o.star >= GROWTH.starMax;
    const cl = CLASS[b.cls] || { icon: '', name: '', color: 'var(--cyan)' };
    const gcls = RAR_G[b.rarity] || 'g-n';
    let stars = ''; for (let s = 1; s <= GROWTH.starMax; s++) stars += '<span class="st' + (s <= o.star ? ' on' : '') + '">★</span>';
    // 현재 → 다음 스탯 비교 박스 + 성장 액션(스틸앤샷式)
    const STAT = [['⚔', '공격', 'atk'], ['🛡', '체력', 'hp'], ['🎯', '골칸', 'gol']];
    const cur = statAt(id, o.level, o.star);
    let box6, box7, actLabel, actAttr, actEnabled;
    if (cdTab === 'promote') {
      const nx = statAt(id, o.level, Math.min(GROWTH.starMax, o.star + 1)), pr = GROWTH.promoteCost(o.star);
      actEnabled = !maxStar && (M.shards[id] || 0) >= pr.shards && M.currencies.mats >= pr.mats;
      box6 = '<div class="sc-t">현재 ★' + o.star + '</div>' + STAT.map(s => '<div class="sc-row"><span>' + s[0] + ' ' + s[1] + '</span><b>' + cur[s[2]] + '</b></div>').join('') + '<div class="sc-row"><span>레벨 상한</span><b>' + cap + '</b></div>';
      box7 = maxStar ? '<div class="nx-max">최고 성급 ★' + GROWTH.starMax + '</div>'
        : '<div class="sc-t">승급 → ★' + (o.star + 1) + '</div>' + STAT.map(s => '<div class="nx-row"><span>' + s[0] + ' ' + s[1] + '</span><b>' + nx[s[2]] + '</b></div>').join('') + '<div class="nx-row"><span>레벨 상한</span><b>' + (GROWTH.levelCapByStar[o.star + 1] || cap) + '</b></div>';
      actLabel = maxStar ? '성급 최대' : '✨ 승급 · 🔷' + pr.shards + ' 🔩' + pr.mats;
      actAttr = 'data-promote="' + id + '"';
    } else {
      const nx = statAt(id, Math.min(cap, o.level + 1), o.star), cost = GROWTH.levelUpCost(o.level);
      actEnabled = !maxLv && M.currencies.gold >= cost;
      box6 = '<div class="sc-t">현재 능력치</div>' + STAT.map(s => '<div class="sc-row"><span>' + s[0] + ' ' + s[1] + '</span><b>' + cur[s[2]] + '</b></div>').join('');
      box7 = maxLv ? '<div class="nx-max">레벨 상한 도달<br><span>승급으로 상한 ↑</span></div>'
        : '<div class="sc-t">다음 Lv.' + (o.level + 1) + '</div>' + STAT.map(s => '<div class="nx-row"><span>' + s[0] + ' ' + s[1] + '</span><b>' + nx[s[2]] + (nx[s[2]] !== cur[s[2]] ? '' : '') + '</b></div>').join('');
      actLabel = maxLv ? '레벨 최대' : '⬆️ 레벨업 · 🪙' + cost;
      actAttr = 'data-lvup="' + id + '"';
    }
    box.innerHTML =
      '<div class="cd-head">'
      + '<div class="cd-img"' + (o ? '' : ' style="filter:grayscale(1);opacity:.45"') + ' style="border-color:' + R.color + '"><span class="cd-ph">' + (cl.icon || '🔫') + '</span><img class="cd-pimg" src="' + CharArt.path(id, 'cg') + '" alt="" onerror="this.style.display=\'none\'"></div>'
      + '<div class="cd-info">'
      + '<div class="cd-irow"><div class="cd-grade ' + gcls + '">' + R.name + '</div></div>'
      + '<div class="cd-irow"><div class="cd-ival cd-starsv">' + stars + '</div></div>'
      + '<div class="cd-irow"><div class="cd-ival cd-lvval">Lv.<b>' + o.level + '</b> <span>/ ' + cap + '</span></div></div>'
      + '<div class="cd-irow"><div class="cd-ival cd-nameval">' + b.name + '</div></div>'
      + '<div class="cd-irow"><div class="cd-ival cd-clsval" style="color:' + cl.color + '">' + cl.icon + ' ' + cl.name + ' · ' + (b.weapon || '') + '</div></div>'
      + '</div></div>'
      + '<div class="cd-statcol">'
      + '<div class="cd-tabs"><button class="cd-tab' + (cdTab === 'lvup' ? ' on' : '') + '" data-cdtab="lvup">⬆️ 레벨업</button><button class="cd-tab' + (cdTab === 'promote' ? ' on' : '') + '" data-cdtab="promote">✨ 승급</button></div>'
      + '<div class="cd-cmp"><div class="cd-cur">' + box6 + '</div><div class="cd-arrow">→</div><div class="cd-next">' + box7 + '</div></div>'
      + '</div>'
      + '<div class="cd-skills">'
      + '<div class="cd-skill"><div class="cd-sk-h"><b>' + b.active.name + '</b><span class="cd-sk-tag">액티브 · 게이지 ' + b.active.gauge + '</span></div><div class="cd-sk-d">' + skillText(b.active) + '</div></div>'
      + '<div class="cd-skill"><div class="cd-sk-h"><b>' + b.passive.name + '</b><span class="cd-sk-tag pas">패시브</span></div><div class="cd-sk-d">' + skillText(b.passive) + '</div></div>'
      + '</div>'
      + '<div class="cd-bot">'
      + '<button class="btn cd-place ' + (inParty(id) ? 'sub' : '') + '" data-party="' + id + '">' + (inParty(id) ? '편성 해제' : '🪧 편성') + '</button>'
      + '<button class="btn cd-action" ' + actAttr + (actEnabled ? '' : ' disabled') + '>' + actLabel + '</button>'
      + '</div>'
      + '<button class="cd-x" data-close="1">닫기</button>';
    $('char-modal').hidden = false;
  }

  // ── 가챠 결과 모달 ──
  function showGachaResult(res) {
    const box = $('gacha-modal-box');
    box.innerHTML = '<h2>뽑기 결과</h2><div class="gacha-res">'
      + res.map(r => { const R = RARITY[r.rarity]; return '<div class="gr-item" style="border-color:' + R.color + '"><img class="gr-cg" src="' + CharArt.path(r.id, 'load') + '" alt="" onerror="this.remove()"><b style="color:' + R.color + '">' + r.name + '</b><span>' + R.name + '</span><span class="gr-tag">' + (r.isNew ? 'NEW' : '조각+' + GACHA.dupShards) + '</span></div>'; }).join('')
      + '</div><button class="btn primary" data-close="1">확인</button>';
    $('gacha-modal').hidden = false;
  }

  // ── 이벤트 와이어링(위임) ──
  function init(opts) {
    onSortie = opts && opts.onSortie;
    // 로그인 게이트 배선
    const lgBtn = $('lg-login'); if (lgBtn) lgBtn.onclick = submitLogin;
    const lgId = $('lg-id'); if (lgId) lgId.addEventListener('keydown', e => { if (e.key === 'Enter') { const p = $('lg-pw'); if (p) p.focus(); } });
    const lgPw = $('lg-pw'); if (lgPw) lgPw.addEventListener('keydown', e => { if (e.key === 'Enter') submitLogin(); });
    const acct = $('acct-btn'); if (acct) { acct.textContent = curAcct ? ('👤 ' + curAcct) : ''; acct.style.display = curAcct ? '' : 'none'; acct.onclick = logout; }
    if (needsLogin()) showLogin();
    document.querySelectorAll('#lobby-nav .tabbtn').forEach(t => t.onclick = () => { activeTab = t.dataset.tab; renderTab(); });
    $('btn-sortie').onclick = () => { if (partySlots().some(x => x)) onSortie && onSortie(); };
    $('stage-select').onclick = (e) => { const b = e.target.closest('[data-stage]'); if (b && !b.disabled) { setStage(+b.dataset.stage); renderSortie(); } };
    // 편성 탭: 드래그하여 레인 배치(스틸앤샷式) — 임계 넘으면 고스트, 드롭한 레인에 할당 / 탭=상세
    $('lane-slots').onclick = (e) => {
      const x = e.target.closest('[data-un]'); if (x) { clearPartySlot(+x.dataset.un); renderFormation(); return; }
    };
    let fDrag = null;
    const fmtSlotAt = (x, y) => { const els = document.querySelectorAll('#lane-slots [data-slot]'); for (const el of els) { const r = el.getBoundingClientRect(); if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return +el.dataset.slot; } return -1; };
    const fmtGhost = () => { let g = $('drag-ghost'); if (!g) { g = document.createElement('div'); g.id = 'drag-ghost'; document.body.appendChild(g); } return g; };
    const fmtHi = (x, y) => { const s = fmtSlotAt(x, y); document.querySelectorAll('#lane-slots [data-slot]').forEach(el => el.classList.toggle('drop-hi', +el.dataset.slot === s)); };
    const fmtClearHi = () => document.querySelectorAll('#lane-slots .drop-hi').forEach(el => el.classList.remove('drop-hi'));
    $('owned-list').addEventListener('pointerdown', (e) => {
      const el = e.target.closest('[data-char]'); if (!el || el.classList.contains('locked')) return;
      fDrag = { id: el.dataset.char, pid: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false };
    });
    window.addEventListener('pointermove', (e) => {
      if (!fDrag || e.pointerId !== fDrag.pid) return;
      if (!fDrag.moved) { if (Math.hypot(e.clientX - fDrag.sx, e.clientY - fDrag.sy) < 12) return; fDrag.moved = true; const g = fmtGhost(); const b = base(fDrag.id), cl = CLASS[b.cls] || {}; g.innerHTML = (cl.icon || '🔫') + ' ' + b.name; g.style.display = 'block'; }
      const g = fmtGhost(); g.style.left = e.clientX + 'px'; g.style.top = e.clientY + 'px'; fmtHi(e.clientX, e.clientY);
    });
    window.addEventListener('pointerup', (e) => {
      if (!fDrag || e.pointerId !== fDrag.pid) return; const d = fDrag; fDrag = null;
      const g = fmtGhost(); g.style.display = 'none'; fmtClearHi();
      if (!d.moved) { openChar(d.id); return; }              // 탭 = 상세
      const s = fmtSlotAt(e.clientX, e.clientY);              // 드래그 = 드롭한 레인에 배치
      if (s >= 0 && M.owned[d.id]) { assignPartySlot(s, d.id); renderFormation(); if (typeof Sound !== 'undefined') Sound.play('click'); }
    });
    window.addEventListener('pointercancel', (e) => { if (fDrag && e.pointerId === fDrag.pid) { fDrag = null; fmtGhost().style.display = 'none'; fmtClearHi(); } });
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
      const gt = e.target.closest('[data-cdtab]'), nv = e.target.closest('[data-cnav]');
      const lv = e.target.closest('[data-lvup]'), pr = e.target.closest('[data-promote]'), pt = e.target.closest('[data-party]');
      if (gt) { cdTab = gt.dataset.cdtab; openChar(cdId); }
      else if (nv && !nv.disabled) { cycleChar(+nv.dataset.cnav); }
      else if (lv && !lv.disabled) { levelUp(lv.dataset.lvup); openChar(lv.dataset.lvup); renderBar(); if (typeof Sound !== 'undefined') Sound.play('level'); }
      else if (pr && !pr.disabled) { promote(pr.dataset.promote); openChar(pr.dataset.promote); renderBar(); if (typeof Sound !== 'undefined') Sound.play('level'); }
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

  return { load, save, init, renderLobby, partySlots, leveledDef, onRunEnd, openCheat, stage, maxStage, needsLogin, doLogin: submitLogin, logout, curAccount, get state() { return M; } };
})();
