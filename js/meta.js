'use strict';
/* PONGTRESS 메타층 — 로비/런 밖. content.js 이후, game.js 이전 로드.
 * 저장(localStorage) · 화폐 · 캐릭터 보유/편성/성장 · 가챠 · 상점 · 미션 + 로비 UI.
 */
const Meta = (function () {
  const KEY = 'pongtress_meta_v1';                         // 레거시(익명) 세이브 키
  const ACCTS_KEY = 'pongtress_accts', CUR_KEY = 'pongtress_cur';
  const $ = (id) => document.getElementById(id);
  let M = null, activeTab = 'home', onSortie = null, cdTab = 'lvup', cdId = null, shopTab = 'gacha';

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
    // 모듈 해금·모드·기록(전방호환)
    if (!Array.isArray(M.relicsUnlocked)) M.relicsUnlocked = RELIC_START_UNLOCKED.slice();
    M.relicsUnlocked = M.relicsUnlocked.filter(id => RELICS[id]);
    M.clearedStages = M.clearedStages || {};
    delete M.startRelic;                                   // 시작 모듈 기능 제거 — 구 세이브에 남은 선택값 정리
    if (!MODES[M.runMode]) M.runMode = 'normal';
    M.dailyRec = M.dailyRec || { date: '', best: 0, rewarded: false };
    M.endlessBest = M.endlessBest || { loop: 0, floors: 0, score: 0 };
    save();
  }
  // ── 모듈 해금 / 출격 옵션(모드·일일 시드) ──
  function unlockedRelics() { return (M && M.relicsUnlocked) ? M.relicsUnlocked.slice() : RELIC_START_UNLOCKED.slice(); }
  function todayKey() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function dateSeed(key) { let h = 2166136261; for (const ch of key) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function runOptions() {
    const mode = M.runMode || 'normal';
    const o = { mode, stage: mode === 'daily' ? M.maxStage : M.stage, seed: 0 };
    if (mode === 'daily') o.seed = dateSeed(todayKey());   // 일일: 날짜 시드로 맵·판 고정
    return o;
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
  // UI 아이콘은 content.js 전역 uiIcon(name, emoji, style) 사용
  function clsIcon(cls) { const c = CLASS[cls] || {}; return ui('cls_' + cls, c.icon || '🔫'); }
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
    const b = base(id); if (!b) return false;
    const price = DOC_SHOP.price[b.rarity]; if (!price) return false;          // 커먼 등 판매 불가 등급
    if (!M.owned[id]) return false;                                            // 가챠로 획득한 요원만
    if (M.currencies.docs < price) return false;
    M.currencies.docs -= price; M.shards[id] = (M.shards[id] || 0) + 1; save(); return true;   // 1회 = 조각 1개
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
    // r = { won, kills, floors, gold, stage, mode, loop, maxCombo, score, relics }
    const mode = r.mode || 'normal';
    const mul = stageScale(r.stage || 1).reward * (1 + (r.loop || 0) * 0.5);
    const earn = {
      gold: Math.round(((r.gold || 0) + (r.floors || 0) * 20) * mul),
      mats: Math.round(((r.floors || 0) * 8 + (r.won ? 30 : 0)) * mul),
      gems: r.won ? Math.round(30 * mul) : 0, docs: Math.floor((r.loop || 0) * 4 + (r.won ? 2 : 0))
    };
    gain(earn);
    M.stats.kills += (r.kills || 0);
    M.stats.floors += (r.floors || 0);
    let unlocked = 0, relicsUnlocked = [], record = false, dailyReward = 0;
    if (r.won) M.stats.runsWon += 1;
    if (r.won && mode === 'normal') {
      if ((r.stage || 1) >= M.maxStage && M.maxStage < STAGE_MAX) { M.maxStage = Math.min(STAGE_MAX, (r.stage || 1) + 1); unlocked = M.maxStage; }
      if (!M.clearedStages[r.stage]) {            // 스테이지 첫 클리어 → 모듈 2종 해금
        M.clearedStages[r.stage] = true;
        relicsUnlocked = RELIC_UNLOCK_ORDER.filter(id => M.relicsUnlocked.indexOf(id) < 0).slice(0, 2);
        M.relicsUnlocked = M.relicsUnlocked.concat(relicsUnlocked);
      }
    }
    if (mode === 'daily') {                       // 일일: 오늘 최고 점수 · 첫 클리어 보상
      const k = todayKey();
      if (M.dailyRec.date !== k) M.dailyRec = { date: k, best: 0, rewarded: false };
      if ((r.score || 0) > M.dailyRec.best) { M.dailyRec.best = r.score || 0; record = true; }
      if (r.won && !M.dailyRec.rewarded) { M.dailyRec.rewarded = true; dailyReward = MODES.daily.reward.gems; M.currencies.gems += dailyReward; }
    }
    if (mode === 'endless' && (r.score || 0) > M.endlessBest.score) { M.endlessBest = { loop: r.loop || 0, floors: r.floors || 0, score: r.score || 0 }; record = true; }
    save();
    return Object.assign(earn, { unlocked, relicsUnlocked, record, dailyReward });
  }

  // ═══════════ 로비 UI ═══════════
  function rarTag(rar) { const R = RARITY[rar] || RARITY.common; return '<span class="rar" style="color:' + R.color + '">' + R.name + '</span>'; }
  function fmtCost(obj) { return Object.entries(obj).filter(([k]) => k !== '_id').map(([k, v]) => uiCur(k) + v).join(' '); }

  // 상단 칩용 축약(만 단위): 9,999 이하는 그대로, 그 위는 1.2만 · 123만 · 1.2억 — 숫자가 커져도 칩이 화면 밖으로 밀리지 않게(정확한 값은 title)
  function fmtCur(n) {
    n = Math.floor(n);
    if (n < 10000) return String(n);
    if (n < 1e6) return (Math.floor(n / 1000) / 10).toFixed(1) + '만';
    if (n < 1e8) return Math.floor(n / 10000) + '만';
    return (Math.floor(n / 1e7) / 10).toFixed(1) + '억';
  }
  function renderBar() {
    for (const [id, k] of [['cur-gold', 'gold'], ['cur-mats', 'mats'], ['cur-gems', 'gems'], ['cur-docs', 'docs']]) { const el = $(id); el.textContent = fmtCur(M.currencies[k]); el.title = String(M.currencies[k]); }
  }

  function charChip(id, opts) {
    opts = opts || {};
    const b = base(id), o = M.owned[id], R = RARITY[b.rarity] || RARITY.common, g = RAR_G[b.rarity] || 'g-n', owned = !!o;
    let stars = ''; for (let s = 1; s <= GROWTH.starMax; s++) stars += '<span class="sc-st' + (owned && s <= o.star ? ' on' : '') + '">★</span>';
    return '<button class="stchar' + (owned ? '' : ' locked') + (opts.placed ? ' placed' : '') + '" data-char="' + id + '">'
      + '<div class="sc-top"><div class="sc-grade ' + g + '">' + R.name + '</div><div class="sc-star">' + stars + '</div></div>'
      + '<div class="sc-img"><img class="sc-cg" src="' + CharArt.path(id, 'thumb') + '" alt="" onerror="this.remove()">'
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
    const mode = M.runMode || 'normal';
    const ms = $('mode-select');                  // 모드: 일반 / 일일 도전 / 무한
    if (ms) {
      const tabs = [['normal', ui('ic_battle', '💥'), '일반'], ['daily', ui('ic_timer', '📅'), '일일 도전'], ['endless', ui('ic_promote', '♾'), '무한']];
      // 설명 문구 없이 '기록·보상 상태'만 표시 (없으면 줄 자체를 만들지 않음)
      const parts = [];
      if (mode === 'daily') {
        const rec = M.dailyRec && M.dailyRec.date === todayKey() ? M.dailyRec : { best: 0, rewarded: false };
        if (rec.best) parts.push('오늘 최고 <b>' + rec.best + '</b>점');
        if (!rec.rewarded) parts.push('첫 클리어 ' + uiCur('gems') + MODES.daily.reward.gems);
      } else if (mode === 'endless' && M.endlessBest.score > 0) {
        parts.push('최고 <b>' + (M.endlessBest.loop + 1) + '막 ' + M.endlessBest.floors + '전투</b> (' + M.endlessBest.score + '점)');
      }
      ms.innerHTML = '<div class="sns-tabs mode-tabs">' + tabs.map(t => '<button class="sns-tab' + (mode === t[0] ? ' on' : '') + '" data-mode="' + t[0] + '">' + t[1] + ' ' + t[2] + '</button>').join('') + '</div>'
        + (parts.length ? '<p class="mode-info">' + parts.join(' · ') + '</p>' : '');
    }
    const ss = $('stage-select');
    if (ss) {
      const daily = mode === 'daily';
      $('stage-head').hidden = daily; ss.hidden = daily;
      let h = '<div class="ss-btns">';
      for (let s = 1; s <= STAGE_MAX; s++) {
        const locked = s > M.maxStage, sel = s === M.stage;
        h += '<button class="ss-btn' + (sel ? ' sel' : '') + (locked ? ' locked' : '') + '" data-stage="' + s + '"' + (locked ? ' disabled' : '') + '>' + (locked ? ui('ic_lock', '🔒') : s) + '</button>';
      }
      ss.innerHTML = h + '</div>';
    }
    // 스테이지 정보 카드(일일 도전 제외): 이 스테이지에 나오는 적 종류 · 보스 · 난이도·보상 배율 — 설명 문장 없이 아이콘과 수치만
    const si = $('stage-info');
    if (si) {
      si.hidden = mode === 'daily';
      if (mode !== 'daily') {
        const s = M.stage, sc = stageScale(s), bk = stageBoss(s), boss = BOSSES[bk];
        const ic = (key, boss) => '<i class="stg-ic" style="background-image:url(assets/enemy/' + key + '.webp);background-size:' + (boss ? '400% 200%' : '400% 100%') + '"></i>';
        si.innerHTML = '<div class="stg-tiles">' + (STAGE_POOL[s] || []).map(p => '<div class="stg-tile">' + ic(p[0]) + '<span>' + ENEMIES[p[0]].name + '</span></div>').join('')
          + '<div class="stg-tile boss">' + ic('boss_' + bk, true) + '<span>' + boss.name + '</span></div></div>'
          + '<div class="stg-mul"><span>적 HP ×' + sc.hp.toFixed(1) + '</span><span>적 공격 ×' + sc.dmg.toFixed(1) + '</span><span>' + uiCur('gold') + ' 보상 ×' + sc.reward.toFixed(1) + '</span></div>';
      }
    }
    const box = $('sortie-party');
    if (box) {
      box.className = 'lane-slots-view'; box.innerHTML = '';
      partySlots().forEach((id, lane) => {
        const d = document.createElement('div'); d.className = 'lane-slot ro' + (id ? ' on' : ' empty');
        if (id) {
          const c = leveledDef(id), b = base(id), R = RARITY[b.rarity] || RARITY.common, g = RAR_G[b.rarity] || 'g-n';
          d.innerHTML = '<span class="ls-rlbl">' + (lane + 1) + '레인</span>'
            + '<div class="ls-img"><img src="' + CharArt.path(id, 'thumb') + '" alt="" onerror="this.remove()"></div>'
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
    el.innerHTML = '<div class="il-top"><b>' + ui('ic_idle', '⏳') + ' 방치 보상</b><span class="il-time">' + (p.capped ? '가득 참 · ' : '') + hh + '시간 ' + mm + '분</span></div>'
      + '<div class="il-row"><span class="il-amt">' + uiCur('gold') + ' ' + p.gold + '  ' + uiCur('mats') + ' ' + p.mats + '</span>'
      + '<button class="sns-btn sm" data-idle="claim"' + (has ? '' : ' disabled') + '>받기</button></div>';
  }

  // ── 방치 홈 자동전투 연출(코스메틱) ──
  // 캐릭터가 '재장전(정면 대기·재장전 동작) → 돌아서서 점사(뒷모습 조준·발사 프레임) → 다시 정면'을 반복한다 — 전투와 같은 CharAnim.
  // 포탄은 실측한 총구(SHEET_META)에서 날아가 '도착한 순간' 피해·타격 이펙트가 나온다(발사 즉시 피해 처리하지 않음).
  // 홈 배경 assets/bg/bg_lobby.webp(1080×1920)에서 뒷벽이 바닥과 만나는 선의 y(이미지 좌표). 배경을 바꾸면 이 값도 다시 잴 것.
  const BG_LOBBY = { w: 1080, h: 1920, farY: 930 };
  let _idleRAF = 0, _idleDbg = null;
  function idleStop() { if (_idleRAF) { cancelAnimationFrame(_idleRAF); _idleRAF = 0; } }
  function idleDebug() { return _idleDbg; }
  function idleStart() {
    const cv = $('idle-canvas'); if (!cv) return; idleStop();
    const ctx = cv.getContext('2d'); const party = partySlots().filter(Boolean);
    const laneCol = ['#46e6d0', '#ffcf5c', '#ff5db1'];
    const eTypes = Object.keys(ENEMIES);                                 // 전투와 같은 적 6종·색(이미지 있으면 EnemyArt 매칭)
    const FX_LIFE = { muz: 0.17, hit: 0.28, boom: 0.55 };
    CharArt.preload(party, ['sheet', 'thumb']);                          // 편성 시트는 미리 받아 둔다(없으면 정면 썸네일 → 원형 순으로 폴백)
    // 모든 치수를 캔버스 크기(D.w/D.h) 비례로 — 현재 UI(프레임 폭) 확대에 맞춰 자동 스케일
    const D = { w: 0, h: 0, U: 1, en: [], pj: [], fx: [], cs: [], cardT: 0, cardH: 0, groundY: 0, charS: 0, now: 0 };
    D.cs = party.map((id, i) => {
      const t = 0.5 + i * 0.55 + Math.random() * 0.4;                    // 캐릭터마다 시작 시점을 어긋나게(동시 사격 방지)
      return { id, i, cls: (base(id) || {}).cls, st: 'ready', t, rl: t, burst: 0, cd: 0, hold: 0, a: CharAnim.create(id) };
    });
    function fit() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      D.w = Math.max(1, cv.clientWidth || 300); D.h = Math.max(1, cv.clientHeight || 260); D.U = D.w / 405;
      cv.width = D.w * dpr; cv.height = D.h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const card = $('idle-reward'); D.cardH = (card && card.offsetHeight) ? card.offsetHeight : D.h * 0.18;
      const n = Math.max(1, D.cs.length);
      D.groundY = D.h - D.cardH - D.h * 0.05;                                  // 캐릭터 발치(방치보상 카드 위)
      D.charS = Math.min(D.w / n * 0.84, D.groundY * 0.66, D.w * 0.34);        // 캐릭터 크기(폭·높이 비례)
      // 배경(bg_lobby, CSS cover·가운데 정렬)에서 뒷벽이 바닥과 만나는 선의 화면 y — 적은 여기서 나타난다
      const bs = Math.max(D.w / BG_LOBBY.w, D.h / BG_LOBBY.h);
      D.farY = Math.min((D.h - BG_LOBBY.h * bs) / 2 + BG_LOBBY.farY * bs, D.groundY - D.h * 0.14);
    }
    fit();
    const cxOf = (i) => D.w * (i + 0.5) / Math.max(1, D.cs.length);

    // ── 적: 하늘에서 떨어지지 않는다 — 바닥 안쪽 끝(뒷벽이 바닥과 만나는 선)에서 나타나 바닥을 따라 걸어오고, 캐릭터 쪽으로 올수록 커진다(원근) ──
    // e.d = 깊이(0 = 먼 끝 → 1 = 캐릭터 발치 줄), e.u = 바닥 폭에 대한 좌우 위치(-1..1; 가까울수록 바닥이 넓어져 부채꼴로 벌어진다)
    const FAR_HALF = 0.25, NEAR_HALF = 0.62;                                   // 바닥 절반 폭(캔버스 폭 비율): 먼 끝 / 캐릭터 줄
    const depthK = (d) => 0.42 + 0.58 * d;                                      // 원근 배율(멀수록 작게)
    const ESZ = { sentry: 0.15, drone: 0.15, walker: 0.19, hound: 0.165, heavy: 0.2, sludge: 0.14 };   // 가까이 왔을 때 스프라이트 한 변(캔버스 폭 비율)
    const ESPD = { sentry: 1, drone: 1.1, walker: 0.85, hound: 1.5, heavy: 0.72, sludge: 0.8 };        // 걸음 속도 배율
    const speedOf = (e) => 0.19 * (ESPD[e.type] || 1) * (0.55 + 0.85 * e.d);                            // 깊이/초(멀수록 느리게 보임)
    // 적의 화면 위치·크기: (x, y)=발 닿는 곳, s=스프라이트 한 변, cy=몸통 중심(조준점), top=머리 쪽. dd 로 미래 깊이를 넣어 조준 보정에도 쓴다
    function ePos(e, dd) {
      const d = dd == null ? e.d : dd, k = depthK(d), s = D.w * e.sz * k * (1 + 0.14 * e.kick);
      const y = D.farY + (D.groundY - D.farY) * d, half = D.w * (FAR_HALF + (NEAR_HALF - FAR_HALF) * d);
      const x = D.w / 2 + e.u * half + Math.sin(D.now * 1.8 + e.ph) * D.w * 0.004 * k;
      const lift = e.type === 'drone' ? s * 0.2 + Math.sin(D.now * 3 + e.ph) * s * 0.025 : 0;   // 드론은 바닥에서 떠서 이동
      return { x, y, s, k, lift, cy: y - lift - s * 0.46, top: y - lift - s * 0.96 };
    }
    function mkEnemy(d) {
      const type = eTypes[Math.floor(Math.random() * eTypes.length)], hp = 2 + Math.floor(Math.random() * 2);
      let u = 0; for (let t = 0; t < 6; t++) { u = (Math.random() * 2 - 1) * 0.7; if (!D.en.some(o => Math.abs(o.d - d) < 0.16 && Math.abs(o.u - u) < 0.3)) break; }   // 같은 자리에 겹쳐 나오지 않게
      return { type, u, d, sz: (ESZ[type] || 0.16) * (0.93 + Math.random() * 0.14), col: (ENEMIES[type] || {}).color || '#fff', hp, mhp: hp, pend: 0, hit: 0, kick: 0, ph: Math.random() * 6.28 };
    }
    function spawn() { if (D.en.length < 8) D.en.push(mkEnemy(0)); }
    for (let i = 0; i < 4; i++) D.en.push(mkEnemy(0.12 + Math.random() * 0.6));

    // 캐릭터 그림 위치·크기 — 그리기와 총구 계산이 같은 값을 쓴다(어긋남 방지). 시트 한 칸(320)을 charS×charS 로, 발(cx, groundY)에 맞춰 그린다
    const muzzleOf = (c, col) => CharAnim.muzzle(c.a, cxOf(c.i), D.groundY, D.charS, col == null ? 1 : col);
    function pickTarget(c) {
      const cx = cxOf(c.i); let best = null, bs = -1e9;
      for (const e of D.en) {
        if (e.dead || e.d < 0.1 || e.hp - e.pend <= 0) continue;                        // 아직 안 보이는(바닥 끝) 적 · 이미 죽을 예정인 적 제외(과잉 사격 방지)
        const sc = e.d * 100 - Math.abs(ePos(e).x - cx) / D.w * 38;                      // 가까이 온(깊이) · 자기 열에 가까운 적 우선
        if (sc > bs) { bs = sc; best = e; }
      }
      return best;
    }
    function shoot(c, e) {
      const cx = cxOf(c.i), p0 = ePos(e), ex = p0.x, T = D.w * 0.09;                    // 표적이 좌우로 충분히 벗어났을 때만 몸을 돌려 반전(자주 뒤집히면 깜빡여 보임)
      CharAnim.fire(c.a, ex < cx - T ? -1 : ex > cx + T ? 1 : 0);                        // 표적 쪽을 향해 f1→f2→f3
      const m = muzzleOf(c, 1), dist = Math.hypot(ex - m.x, p0.cy - m.y);               // 포탄은 발사 프레임(f1)의 총구에서
      const dur = Math.min(0.32, Math.max(0.13, dist / (D.h * 1.8))), q = ePos(e, Math.min(1, e.d + speedOf(e) * dur));   // 걸어오는 만큼 앞을 조준
      const col = (CLASS[c.cls] || {}).color || '#ffe9a8';
      e.pend++;
      D.pj.push({ x1: m.x, y1: m.y, x2: q.x, y2: q.cy, t: 0, dur, e, col });
      D.fx.push({ k: 'muz', x: m.x, y: m.y, t: 1, col, ang: m.ang });                   // 섬광은 포신 방향(홈 연출은 무음)
    }
    function stepChar(c, dt) {
      CharAnim.update(c.a, dt);
      if (c.st === 'ready') {                                   // 재장전 중(정면): 시간이 다 되면 표적이 있을 때 돌아서서 사격 자세로
        c.t -= dt;
        if (c.t <= 0 && pickTarget(c)) { c.st = 'fire'; c.burst = 2 + Math.floor(Math.random() * 3); c.cd = 0.05; c.hold = 0; CharAnim.toAim(c.a, 0); }
      } else if (c.burst > 0) {                                 // 점사 중: 다 돌아선 뒤 일정 간격으로 발사
        if (!CharAnim.isAimed(c.a)) return;
        c.cd -= dt;
        if (c.cd <= 0) {
          const e = pickTarget(c);
          if (e) { shoot(c, e); c.burst--; c.cd = 0.25 + Math.random() * 0.08; } else c.burst = 0;   // 표적이 없으면 점사 종료
          if (c.burst <= 0) c.hold = 0.32;
        }
      } else {                                                  // 점사 후 잠깐 자세 유지 → 정면으로 돌아서 재장전 동작
        c.hold -= dt;
        if (c.hold <= 0) { c.st = 'ready'; c.rl = 1.0 + Math.random() * 0.8; c.t = c.rl; CharAnim.toIdle(c.a, true); }
      }
    }
    function hitAt(p) {                                         // 포탄 도착: 이 순간에 피해·이펙트
      const e = p.e;
      if (e && !e.dead && D.en.indexOf(e) >= 0) {
        const q = ePos(e);
        e.pend = Math.max(0, e.pend - 1); e.hp -= 1; e.hit = 0.2; e.kick = 1;
        D.fx.push({ k: 'hit', x: q.x, y: q.cy, t: 1, col: p.col, kk: q.k });
        if (e.hp <= 0) { e.dead = true; D.fx.push({ k: 'boom', x: q.x, y: q.cy, t: 1, col: e.col, r: q.s * 0.23 }); }
      } else D.fx.push({ k: 'hit', x: p.x2, y: p.y2, t: 1, col: p.col, sm: true });
    }
    function step(dt) {
      D.now += dt;
      if (Math.random() < dt * 1.0) spawn();
      for (const e of D.en) { e.d += dt * speedOf(e); e.hit = Math.max(0, e.hit - dt); e.kick = Math.max(0, e.kick - dt * 8); }
      D.cs.forEach(c => stepChar(c, dt));
      for (const p of D.pj) { p.t += dt / p.dur; if (p.t >= 1 && !p.done) { p.done = true; hitAt(p); } }
      D.pj = D.pj.filter(p => !p.done);
      for (const f of D.fx) f.t -= dt / FX_LIFE[f.k]; D.fx = D.fx.filter(f => f.t > 0);
      D.en = D.en.filter(e => {                                 // 죽은 적 제거 · 캐릭터 줄까지 걸어온 적은 작게 터지며 소멸(캐릭터와 겹침 방지)
        if (e.dead) return false;
        if (e.d >= 0.95) { const q = ePos(e); D.fx.push({ k: 'boom', x: q.x, y: q.cy, t: 1, col: e.col, r: q.s * 0.23, sm: true }); return false; }
        return true;
      });
      D.cardT += dt; if (D.cardT > 2) { D.cardT = 0; renderIdleCard(); }
    }

    function drawEnemy(e) {
      const p = ePos(e), a = Math.max(0, Math.min(1, e.d / 0.09)); if (a <= 0) return;   // 바닥 끝에서 서서히 나타남
      const x = p.x, y = p.y, s = p.s, ty = p.top;
      ctx.save();
      ctx.globalAlpha = a * (p.lift ? 0.2 : 0.34); ctx.fillStyle = '#000';                       // 바닥 그림자(바닥 위를 걷는 느낌)
      ctx.beginPath(); ctx.ellipse(x, y - s * 0.01, s * (p.lift ? 0.2 : 0.3), s * 0.07, 0, 0, 7); ctx.fill();
      ctx.globalAlpha = a;
      const ef = EnemyAnim.frame(e, D.now, true);                  // 걷는 중이라 걷기 프레임을 빠르게 재생
      if (ef) {
        drawCell(ctx, ef.img, ef.sx, ef.sy, ef.sw, ef.sh, x - s / 2, ty, s, s);
        if (e.hit > 0) drawCellTint(ctx, ef.img, ef.sx, ef.sy, ef.sw, ef.sh, x - s / 2, ty, s, s, '#ffffff', Math.min(0.85, e.hit * 4));
      } else { ctx.fillStyle = e.hit > 0.06 ? '#ffffff' : e.col; ctx.beginPath(); ctx.arc(x, p.cy, s * 0.3, 0, 7); ctx.fill(); }
      if (e.hp < e.mhp) {
        const bw = s * 0.55, hbH = Math.max(2, D.h * 0.006), by = ty - D.h * 0.01;
        ctx.fillStyle = '#0008'; ctx.fillRect(x - bw / 2, by, bw, hbH); ctx.fillStyle = '#ff6b6b'; ctx.fillRect(x - bw / 2, by, bw * Math.max(0, e.hp) / e.mhp, hbH);
      }
      ctx.restore();
    }
    function drawChar(c) {
      const cx = cxOf(c.i), cy = D.groundY, s = D.charS, col = laneCol[c.i % 3], ry = Math.max(3, s * 0.08);
      ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = col;                       // 레인색 발판
      ctx.beginPath(); ctx.ellipse(cx, cy, s * 0.3, ry, 0, 0, 7); ctx.fill(); ctx.restore();
      if (c.st === 'ready') {                                                         // 재장전 진행 링(가득 차면 발사 준비 완료)
        const pr = c.rl > 0 ? 1 - Math.max(0, c.t) / c.rl : 1;
        ctx.save(); ctx.strokeStyle = col; ctx.globalAlpha = 0.95; ctx.lineWidth = Math.max(2, s * 0.03); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.ellipse(cx, cy, s * 0.3, ry, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.001, pr)); ctx.stroke(); ctx.restore();
      }
      if (!CharAnim.draw(ctx, c.a, cx, cy, s)) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx, cy - s * 0.4, s * 0.12, 0, 7); ctx.fill(); }   // 시트·썸네일이 없으면 원형 폴백
    }
    function drawShell(p) {
      const U = D.U, tt = Math.min(1, p.t), x = p.x1 + (p.x2 - p.x1) * tt, y = p.y1 + (p.y2 - p.y1) * tt;
      const tail = Math.max(0, tt - 0.3), bx = p.x1 + (p.x2 - p.x1) * tail, by = p.y1 + (p.y2 - p.y1) * tail, hr = 11 * U;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createLinearGradient(bx, by, x, y); gr.addColorStop(0, p.col + '00'); gr.addColorStop(1, p.col);
      ctx.globalAlpha = 0.75; ctx.strokeStyle = gr; ctx.lineWidth = 6 * U; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(x, y); ctx.stroke();
      if (tt < 1 && FxArt.ready('shell')) { ctx.restore(); ctx.save(); FxSheet.shell(ctx, x, y, Math.atan2(p.y2 - p.y1, p.x2 - p.x1), hr * 2.3, D.now); }   // 탄체는 불투명(가산 합성 X)
      else {
        const rg = ctx.createRadialGradient(x, y, 0, x, y, hr); rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.35, p.col); rg.addColorStop(1, p.col + '00');
        ctx.globalAlpha = 1; ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y, hr, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, hr * 0.34, 0, 7); ctx.fill();
      }
      ctx.restore();
    }
    function drawFx(f) {
      const U = D.U, t = Math.max(0, f.t), fr = 1 - t;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      if (f.k === 'muz') {                                                            // 총구 섬광
        const R = D.charS * 0.16 * (0.6 + fr * 0.5);
        ctx.globalCompositeOperation = 'source-over';
        if (!FxSheet.muzzle(ctx, f.x, f.y, f.ang, D.charS * 0.46, fr, f.col)) {      // 섬광 시트(포신 방향·클래스 색 착색) — 없으면 방사형 버스트
          ctx.globalCompositeOperation = 'lighter';
          const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, R); g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, f.col); g.addColorStop(1, f.col + '00');
          ctx.globalAlpha = t; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, 7); ctx.fill();
          ctx.translate(f.x, f.y); ctx.rotate(f.ang); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5 * U; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(R * 1.7, 0); ctx.stroke();
        }
      } else if (f.k === 'hit') {                                                     // 타격: 발광 코어 + 방사 스파크
        const R = (f.sm ? 16 : 26) * U * (f.kk || 1), rr = R * (0.55 + fr * 0.75), g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, rr);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, f.col); g.addColorStop(1, f.col + '00');
        ctx.globalAlpha = t; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, rr, 0, 7); ctx.fill();
        if (!FxSheet.hit(ctx, f.x, f.y, R * 3.2, fr, f.col)) {                        // 히트 스파크 시트(없으면 방사 선)
          ctx.strokeStyle = f.col; ctx.lineWidth = 2.5 * U;
          for (let i = 0; i < 6; i++) { const a = i * 1.047 + f.x * 0.02, d0 = R * (0.35 + fr * 0.9), d1 = d0 + R * 0.5; ctx.beginPath(); ctx.moveTo(f.x + Math.cos(a) * d0, f.y + Math.sin(a) * d0); ctx.lineTo(f.x + Math.cos(a) * d1, f.y + Math.sin(a) * d1); ctx.stroke(); }
        }
      } else if (FxArt.ready('boom')) {                                               // 처치 폭발: 폭발 시트 8프레임
        ctx.globalCompositeOperation = 'source-over'; FxSheet.boom(ctx, f.x, f.y, (f.sm ? 0.9 : 1.7) * f.r * 5.2, fr);
      } else {                                                                        // 처치 폭발(폴백): 화염구 + 충격 링 + 파편
        const R0 = (f.sm ? 0.9 : 1.7) * f.r * 1.8, rr = R0 * (0.4 + fr * 0.9), g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, rr);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, f.col); g.addColorStop(0.7, f.col + '66'); g.addColorStop(1, f.col + '00');
        ctx.globalAlpha = t; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, rr, 0, 7); ctx.fill();
        ctx.globalAlpha = t * 0.9; ctx.strokeStyle = '#fff'; ctx.lineWidth = (f.sm ? 2 : 3.5) * U; ctx.beginPath(); ctx.arc(f.x, f.y, R0 * (0.6 + fr * 1.1), 0, 7); ctx.stroke();
        ctx.strokeStyle = f.col; ctx.lineWidth = 3 * U;
        for (let i = 0; i < 8; i++) { const a = i * 0.785 + f.x * 0.01, d0 = R0 * (0.3 + fr * 1.3), d1 = d0 + R0 * 0.45; ctx.globalAlpha = t; ctx.beginPath(); ctx.moveTo(f.x + Math.cos(a) * d0, f.y + Math.sin(a) * d0); ctx.lineTo(f.x + Math.cos(a) * d1, f.y + Math.sin(a) * d1); ctx.stroke(); }
      }
      ctx.restore();
    }
    function render() {
      ctx.clearRect(0, 0, D.w, D.h);
      D.en.slice().sort((a, b) => a.d - b.d).forEach(drawEnemy);     // 먼 적부터(가까운 적이 위에 그려짐)
      D.cs.forEach(drawChar);
      for (const p of D.pj) drawShell(p);
      for (const f of D.fx) drawFx(f);
    }
    let last = performance.now();
    function frame(now) {
      if (cv.offsetParent === null) { idleStop(); return; }   // 홈이 숨겨지면 자동 정지
      if (Math.abs(cv.clientWidth - D.w) > 1 || Math.abs(cv.clientHeight - D.h) > 1) fit();   // 리사이즈 대응
      const dt = Math.min(0.05, (now - last) / 1000); last = now; step(dt); render();
      _idleRAF = requestAnimationFrame(frame);
    }
    _idleDbg = { D, step, render, fit, muzzle: muzzleOf, stop: idleStop };   // 검증용(수동 스텝·좌표 확인)
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
          + '<button class="ls-x" data-un="' + lane + '">' + ui('ic_close', '✕') + '</button>'
          + '<div class="ls-img"><img src="' + CharArt.path(id, 'thumb') + '" alt="" onerror="this.remove()"></div>'
          + '<div class="ls-nm"><span class="ls-g ' + g + '">' + R.name + '</span><span class="ls-nn">' + c.name + '</span></div>';
      } else d.innerHTML = '<span class="lane-empty">' + uiIcon('ic_add', '＋', 'width:1.2em;height:1.2em') + '</span><span class="lane-lbl">' + (lane + 1) + '레인</span>';
      slots.append(d);
    });
    const list = $('owned-list'); list.innerHTML = ROSTER.map(c => charChip(c.id, { inParty: inParty(c.id), placed: inParty(c.id) })).join('');
    const oc = $('owned-count'); if (oc) oc.textContent = ROSTER.filter(c => M.owned[c.id]).length + '/' + ROSTER.length;
  }

  // ── 상점(스틸앤샷式): 서브탭(가챠/문서/패키지) → 배너·카드 ──
  function shopGachaBody() {
    const free = freeAvailable();
    return '<div class="gbanner">'
      + '<button class="gb-info" data-gachainfo="1">' + ui('ic_info', '❔') + '</button>'          // 확률은 ⓘ 팝업에서만 표시(배너에 중복 표기 안 함)
      + '<div class="gb-t">' + ui('ic_ticket', '🎫') + ' 상시 배너</div>'
      + (free ? '<div class="gb-d"><b>오늘 무료 1회!</b></div>' : '')
      + '<div class="gb-btns">'
      +   '<button class="sns-btn" data-gacha="' + (free ? 'free' : '1') + '">단일 ' + (free ? '무료' : uiCur('gems') + GACHA.cost1) + '</button>'
      +   '<button class="sns-btn" data-gacha="10">10연 ' + uiCur('gems') + GACHA.cost10 + '</button>'
      + '</div></div>';
  }
  function shopDocBody() {
    // 스틸앤샷式: 캐릭터 조각만 판매 · 커먼 제외 · 등급별 조각 1개당 문서 비용 · 보유 요원만 구매(미보유=잠금)
    let h = '';
    const rars = ['legendary', 'epic', 'rare'];   // 커먼 제외(레전더리/에픽/레어만)
    rars.forEach(rar => {
      const list = ROSTER.filter(c => c.rarity === rar); if (!list.length) return;
      const R = RARITY[rar] || {}, g = RAR_G[rar] || 'g-n', price = DOC_SHOP.price[rar];
      h += '<div class="sns-h"><span class="g-tag ' + g + '">' + R.name + '</span> 조각 <span class="sns-sub">· 개당 ' + uiCur('docs') + price + '</span></div>';
      h += list.map(c => {
        const owned = !!M.owned[c.id], can = owned && M.currencies.docs >= price;
        return '<div class="sns-card' + (owned ? '' : ' locked') + '"><div class="sns-row">'
          + '<div class="shop-ico">' + (owned ? '<img src="' + CharArt.path(c.id, 'thumb') + '" alt="" onerror="this.remove()">' : '<span class="lock-ic">' + uiIcon('ic_lock', '🔒', 'width:1.3em;height:1.3em') + '</span>') + '</div>'
          + '<div class="sns-grow"><div class="sns-nm">' + c.name + '</div><div class="sns-ds">' + (owned ? uiCur('shards') + ' 보유 조각 ' + (M.shards[c.id] || 0) : '요원 미보유') + '</div></div>'
          + '<button class="sns-btn sm" data-doc="' + c.id + '"' + (can ? '' : ' disabled') + '>' + (owned ? uiCur('docs') + price : '미보유') + '</button>'
          + '</div></div>';
      }).join('');
    });
    return h;
  }
  function shopPkgBody() {
    return [[uiIcon('cur_gems', '💎', 'width:100%;height:100%'), '보석 패키지', uiCur('gems') + ' 100 / 550 / 1200'], [uiIcon('ic_package', '🚫', 'width:100%;height:100%'), '광고 제거', '전면 광고 제거 + 보너스'], [uiIcon('ic_ticket', '📅', 'width:100%;height:100%'), '주간 패스', '매일 보석 · 재화 지급']]
        .map(p => '<div class="sns-card"><div class="sns-row"><div class="shop-ico emoji">' + p[0] + '</div>'
          + '<div class="sns-grow"><div class="sns-nm">' + p[1] + '</div><div class="sns-ds">' + p[2] + '</div></div>'
          + '<button class="sns-btn sm sub" disabled>준비 중</button></div></div>').join('');
  }
  // 치트(자원 획득): 상점 어느 탭에서나 맨 아래에 — 크레딧·재료·보석·문서를 각각 +9999 (기존 치트창의 '화폐 전체 +9999'와 같은 동작)
  let shopCheatUntil = 0;
  function shopCheatCard() {
    const done = Date.now() < shopCheatUntil;
    return '<div class="shop-cheat"><span class="cheat-lbl">CHEAT</span>'
      + '<button class="sns-btn' + (done ? ' done' : '') + '" data-shopcheat="1">' + (done ? '✔ 지급 완료 · ' : ui('ic_reward', '🎁') + ' 자원 획득 · ') + ['gold', 'mats', 'gems', 'docs'].map(uiCur).join('') + ' +9999</button></div>';
  }
  function renderShop() {
    const el = $('shop-body'); if (!el) return;
    const tabs = [['gacha', 'ic_gacha', '🎰', '가챠'], ['doc', 'cur_docs', '📄', '문서'], ['pkg', 'ic_package', '💳', '패키지']];
    let h = '<div class="sns-tabs shoptabs">' + tabs.map(t => '<button class="sns-tab' + (shopTab === t[0] ? ' on' : '') + '" data-stab="' + t[0] + '">' + uiIcon(t[1], t[2]) + ' ' + t[3] + '</button>').join('') + '</div>';
    h += shopTab === 'doc' ? shopDocBody() : shopTab === 'pkg' ? shopPkgBody() : shopGachaBody();
    h += shopCheatCard();
    el.innerHTML = h;
  }
  function openGachaInfo() {
    const box = $('gacha-modal-box');
    box.innerHTML = '<h2>' + ui('ic_gacha', '🎰') + ' 가챠 확률</h2>'
      + '<div class="gi-rates">' + GACHA.rates.slice().reverse().map(r => { const R = RARITY[r.rarity] || {}, g = RAR_G[r.rarity] || 'g-n'; return '<div class="gi-row"><span class="g-tag ' + g + '">' + R.name + '</span><b>' + r.w + '%</b></div>'; }).join('') + '</div>'
      + '<div class="gi-guide"><div class="gi-g"><b>' + uiCur('shards') + ' 조각</b> — 이미 보유한 요원을 중복 획득하면 조각 ' + GACHA.dupShards + '개(승급 재료)</div></div>'
      + '<button class="btn primary" data-close="1">확인</button>';
    $('gacha-modal').hidden = false;
  }

  function renderMissions() {
    const list = $('mission-list');
    list.innerHTML = MISSIONS.map(m => {
      const p = missionProgress(m), done = p >= m.goal, claimed = !!M.claimed[m.id];
      const pct = Math.min(100, 100 * p / m.goal);
      const label = claimed ? '수령 완료' : done ? ui('ic_reward', '🎁') + ' 수령' : '진행 중';
      return '<div class="sns-card"><div class="sns-row" style="align-items:flex-start">'
        + '<div class="sns-ico">' + uiIcon('ic_mission', '🎯', 'width:100%;height:100%') + '</div>'
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
      + '<p class="muted">' + uiCur('gold') + M.currencies.gold + ' ' + uiCur('mats') + M.currencies.mats + ' ' + uiCur('gems') + M.currencies.gems + ' ' + uiCur('docs') + M.currencies.docs + ' · 보유 ' + Object.keys(M.owned).length + '/' + ROSTER.length + '</p>'
      + '<div class="cd-btns">'
      + '<button class="btn" data-cheat="cur">화폐 전체 +9999</button>'
      + '<button class="btn" data-cheat="unlock">전 캐릭터 획득</button>'
      + '<button class="btn" data-cheat="shards">모든 조각 +999</button>'
      + '<button class="btn" data-cheat="max">전 캐릭터 Lv·★ 최대</button>'
      + '<button class="btn" data-cheat="stages">전 스테이지 해금</button>'
      + '<button class="btn" data-cheat="relics">전 모듈 해금</button>'
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
    else if (k === 'relics') M.relicsUnlocked = Object.keys(RELICS);
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
  const PEG_NM = { mult2: '×2 증식', mult5: '×5 증식', bumper: '범퍼', attack: '공격', gold: '크레딧' };
  function skillText(sk) {
    switch (sk.kind) {
      case 'bigHit': return '맨 앞 적에게 공격력 ×' + sk.mult + ' 강타';
      case 'extraShots': return '이번 턴 추가 ' + sk.shots + '발 사격';
      case 'aoe': return '앞 ' + sk.count + '기에게 광역 포격 (공격 ×' + (sk.mult || 1) + ')';
      case 'heal': return '방벽 HP +' + sk.amount + ' 회복';
      case 'stun': return '앞 ' + sk.count + '기 ' + (sk.turns || 1) + '턴 기절';
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
    const STAT = [[ui('stat_atk', '💥'), '공격', 'atk'], [ui('stat_hp', '🛡'), '체력', 'hp'], [ui('stat_gol', '🎯'), '골칸', 'gol']];
    const cur = statAt(id, o.level, o.star);
    let box6, box7, actLabel, actAttr, actEnabled;
    if (cdTab === 'promote') {
      const nx = statAt(id, o.level, Math.min(GROWTH.starMax, o.star + 1)), pr = GROWTH.promoteCost(o.star);
      actEnabled = !maxStar && (M.shards[id] || 0) >= pr.shards && M.currencies.mats >= pr.mats;
      box6 = '<div class="sc-t">현재 ★' + o.star + '</div>' + STAT.map(s => '<div class="sc-row"><span>' + s[0] + ' ' + s[1] + '</span><b>' + cur[s[2]] + '</b></div>').join('') + '<div class="sc-row"><span>레벨 상한</span><b>' + cap + '</b></div>';
      box7 = maxStar ? '<div class="nx-max">최고 성급 ★' + GROWTH.starMax + '</div>'
        : '<div class="sc-t">승급 → ★' + (o.star + 1) + '</div>' + STAT.map(s => '<div class="nx-row"><span>' + s[0] + ' ' + s[1] + '</span><b>' + nx[s[2]] + '</b></div>').join('') + '<div class="nx-row"><span>레벨 상한</span><b>' + (GROWTH.levelCapByStar[o.star + 1] || cap) + '</b></div>';
      actLabel = maxStar ? '성급 최대' : ui('ic_promote', '✨') + ' 승급 · ' + uiCur('shards') + pr.shards + ' ' + uiCur('mats') + pr.mats;
      actAttr = 'data-promote="' + id + '"';
    } else {
      const nx = statAt(id, Math.min(cap, o.level + 1), o.star), cost = GROWTH.levelUpCost(o.level);
      actEnabled = !maxLv && M.currencies.gold >= cost;
      box6 = '<div class="sc-t">현재 능력치</div>' + STAT.map(s => '<div class="sc-row"><span>' + s[0] + ' ' + s[1] + '</span><b>' + cur[s[2]] + '</b></div>').join('');
      box7 = maxLv ? '<div class="nx-max">레벨 상한 도달</div>'
        : '<div class="sc-t">다음 Lv.' + (o.level + 1) + '</div>' + STAT.map(s => '<div class="nx-row"><span>' + s[0] + ' ' + s[1] + '</span><b>' + nx[s[2]] + (nx[s[2]] !== cur[s[2]] ? '' : '') + '</b></div>').join('');
      actLabel = maxLv ? '레벨 최대' : ui('ic_levelup', '⬆️') + ' 레벨업 · ' + uiCur('gold') + cost;
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
      + '<div class="cd-irow"><div class="cd-ival cd-clsval" style="color:' + cl.color + '">' + clsIcon(b.cls) + ' ' + cl.name + ' · ' + (b.weapon || '') + '</div></div>'
      + '</div></div>'
      + '<div class="cd-statcol">'
      + '<div class="cd-tabs"><button class="cd-tab' + (cdTab === 'lvup' ? ' on' : '') + '" data-cdtab="lvup">' + ui('ic_levelup', '⬆️') + ' 레벨업</button><button class="cd-tab' + (cdTab === 'promote' ? ' on' : '') + '" data-cdtab="promote">' + ui('ic_promote', '✨') + ' 승급</button></div>'
      + '<div class="cd-cmp"><div class="cd-cur">' + box6 + '</div><div class="cd-arrow">→</div><div class="cd-next">' + box7 + '</div></div>'
      + '</div>'
      + '<div class="cd-skills">'
      + '<div class="cd-skill"><div class="cd-sk-h"><b>' + b.active.name + '</b><span class="cd-sk-tag">액티브 · 게이지 ' + b.active.gauge + '</span></div><div class="cd-sk-d">' + skillText(b.active) + '</div></div>'
      + '<div class="cd-skill"><div class="cd-sk-h"><b>' + b.passive.name + '</b><span class="cd-sk-tag pas">패시브</span></div><div class="cd-sk-d">' + skillText(b.passive) + '</div></div>'
      + '</div>'
      + '<div class="cd-bot">'
      + '<button class="btn cd-place ' + (inParty(id) ? 'sub' : '') + '" data-party="' + id + '">' + (inParty(id) ? '편성 해제' : ui('ic_place', '🪧') + ' 편성') + '</button>'
      + '<button class="btn cd-action" ' + actAttr + (actEnabled ? '' : ' disabled') + '>' + actLabel + '</button>'
      + '</div>'
      + '<button class="cd-x" data-close="1">닫기</button>';
    $('char-modal').hidden = false;
  }

  // ── 가챠 결과 모달 ──
  function showGachaResult(res) {
    const box = $('gacha-modal-box');
    const cols = Math.min(4, res.length);
    box.innerHTML = '<h2>뽑기 결과</h2><div class="gacha-res" style="--cols:' + cols + ';max-width:' + (cols * 19) + 'cqw">'
      + res.map((r, i) => { const R = RARITY[r.rarity]; return '<div class="gr-item" style="border-color:' + R.color + ';--rc:' + R.color + ';--d:' + (i * 0.06).toFixed(2) + 's"><img class="gr-cg" src="' + CharArt.path(r.id, 'thumb') + '" alt="" onerror="this.remove()"><b style="color:' + R.color + '">' + r.name + '</b><span>' + R.name + '</span><span class="gr-tag' + (r.isNew ? ' new' : '') + '">' + (r.isNew ? 'NEW' : uiCur('shards') + '+' + GACHA.dupShards) + '</span></div>'; }).join('')
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
    const acct = $('acct-btn'); if (acct) { acct.innerHTML = curAcct ? uiIcon('ic_account', '👤', 'width:72%;height:72%') : ''; acct.title = curAcct ? ('계정: ' + curAcct + ' (누르면 로그아웃)') : ''; acct.style.display = curAcct ? '' : 'none'; acct.onclick = logout; }   // 이름은 공간을 못 쓰므로 아이콘만 — 이름은 title 과 로그아웃 확인창에
    if (needsLogin()) showLogin();
    document.querySelectorAll('#lobby-nav .tabbtn').forEach(t => t.onclick = () => { activeTab = t.dataset.tab; renderTab(); });
    $('btn-sortie').onclick = () => { if (partySlots().some(x => x)) onSortie && onSortie(); };
    $('stage-select').onclick = (e) => { const b = e.target.closest('[data-stage]'); if (b && !b.disabled) { setStage(+b.dataset.stage); renderSortie(); } };
    $('mode-select').onclick = (e) => { const b = e.target.closest('[data-mode]'); if (b && MODES[b.dataset.mode]) { M.runMode = b.dataset.mode; save(); renderSortie(); if (typeof Sound !== 'undefined') Sound.play('click'); } };
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
      if (!fDrag.moved) { if (Math.hypot(e.clientX - fDrag.sx, e.clientY - fDrag.sy) < 12) return; fDrag.moved = true; const g = fmtGhost(); const b = base(fDrag.id); g.innerHTML = clsIcon(b.cls) + ' ' + b.name; g.style.display = 'block'; }
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
    // 상점 탭(서브탭: 가챠/문서/패키지)
    $('shop-body').onclick = (e) => {
      const st = e.target.closest('[data-stab]'); if (st) { shopTab = st.dataset.stab; renderShop(); return; }
      if (e.target.closest('[data-shopcheat]')) {                                   // 치트: 자원 +9999 → 상단 재화 바와 상점 갱신, 버튼은 잠깐 '지급 완료'
        shopCheatUntil = Date.now() + 1400; doCheat('cur'); if (typeof Sound !== 'undefined') Sound.play('charge');
        setTimeout(() => { if (activeTab === 'shop') renderShop(); }, 1450);
        return;
      }
      const gi = e.target.closest('[data-gachainfo]'); if (gi) { openGachaInfo(); return; }
      const gc = e.target.closest('[data-gacha]');
      if (gc && !gc.disabled) {
        const which = gc.dataset.gacha;
        const res = which === 'free' ? gacha(1, true) : gacha(which === '10' ? 10 : 1, false);
        if (res) { if (typeof Sound !== 'undefined') Sound.play('gacha'); showGachaResult(res); renderLobby(); }
        return;
      }
      const dc = e.target.closest('[data-doc]'); if (dc && !dc.disabled) { buyShards(dc.dataset.doc); renderShop(); renderBar(); }
    };
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
    // 치트창: 빌드 표시를 한 번 눌러서는 열리지 않는다(홈 탭 모서리와 겹쳐 오터치 위험) — 2.5초 안에 5번 연속 탭해야 열림. 아래 탭 버튼은 가리지 않도록 표시는 클릭을 가로채지 않고 좌표로 센다
    const tag = $('build-tag');
    if (tag) {
      tag.style.pointerEvents = 'none';
      let taps = [];
      window.addEventListener('pointerdown', (ev) => {
        const r = tag.getBoundingClientRect();
        if (ev.clientX < r.left - 6 || ev.clientX > r.right + 6 || ev.clientY < r.top - 6 || ev.clientY > r.bottom + 6) return;
        const now = Date.now(); taps = taps.filter(t => now - t < 2500); taps.push(now);
        if (taps.length >= 5) { taps = []; openCheat(); }
      }, true);
    }
    $('cheat-modal').onclick = (e) => {
      if (e.target.dataset.close || e.target === $('cheat-modal')) { $('cheat-modal').hidden = true; return; }
      const b = e.target.closest('[data-cheat]'); if (b) doCheat(b.dataset.cheat);
    };
  }

  return { load, save, init, renderLobby, partySlots, leveledDef, onRunEnd, openCheat, stage, maxStage, needsLogin, doLogin: submitLogin, logout, curAccount, runOptions, unlockedRelics, idleDebug, get state() { return M; } };
})();
