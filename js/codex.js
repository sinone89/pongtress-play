'use strict';
/* PONGTRESS 도감 — 홈 화면의 [도감] 버튼으로 여는 수집 목록. 탭 3개: 적(처치한 적·보스) · 동료 · 모듈. 카드를 누르면 정보 화면이 열린다.
 *  · 기록은 계정 저장(Meta.state.codex)에 둔다.
 *      kills  { 적 id | boss_<종류>: 처치 수 }      — game.js killEnemy 가 Codex.kill 로 센다
 *      relics { 모듈 id: 고른 최고 레벨(1~2) }       — game.js gainRelic 이 Codex.relic 으로 적는다
 *      seen   { 'e:<적>' | 'c:<동료>' | 'r:<모듈>': 1 } — 정보 화면을 열어 본 것(NEW 점 끄기)
 *    동료는 따로 세지 않고 보유 목록(Meta.state.owned)을 그대로 쓴다.
 *  · ⚠ 도감이 생기기 전의 플레이 기록은 없다 — 기존 계정도 이 빌드부터 적·모듈을 센다(보유 동료는 처음 열 때 이미 본 것으로 둬서 NEW 가 한꺼번에 뜨지 않는다).
 *  · 내용은 content.js 상수(ENEMIES·BOSSES·STAGE_POOL·BOSS_INTENT·ROSTER·RELICS·RELIC_TAGS)에서 읽는다 → 수치가 바뀌어도 어긋나지 않고, 여기선 문구만 쓴다.
 *  · Codex 는 최상위 const 라 window.Codex 로는 안 보인다 — 다른 스크립트에서는 typeof Codex !== 'undefined' 로 확인.
 * 로드 순서: audio → spritemeta → artmeta → content → meta → game → tutorial → help → codex
 */
const Codex = (function () {
  const $ = (id) => document.getElementById(id);
  let built = false, tab = 'enemy', view = 'list', sel = null;      // 탭 · 보기(list | detail) · 정보 화면의 항목 키

  // ═════════ 목록 정의 ═════════
  const ENEMY_KEYS = Object.keys(ENEMIES).concat(Object.keys(BOSSES).map((k) => 'boss_' + k));            // 일반 적 6 → 보스 3
  const RARS = ['common', 'rare', 'epic', 'legendary'], CLSS = ['gunner', 'cannon', 'support'];             // 동료 목록: 행 = 등급, 열 = 클래스(편성 탭과 같은 순서)
  const CHAR_IDS = [].concat.apply([], RARS.map((r) => CLSS.map((k) => ROSTER.filter((c) => c.rarity === r && c.cls === k)).reduce((a, b) => a.concat(b), []))).map((c) => c.id);
  const TAGS = ['precision', 'explosive', 'guard', 'pinball', 'harvest'];
  const RELIC_IDS = [].concat.apply([], TAGS.map((t) => Object.keys(RELICS).filter((id) => RELICS[id].tag === t)));
  const isBoss = (k) => k.indexOf('boss_') === 0;
  const enemyDef = (k) => isBoss(k) ? BOSSES[k.slice(5)] : ENEMIES[k];
  const KEYS = { enemy: ENEMY_KEYS.map((k) => 'e:' + k), char: CHAR_IDS.map((k) => 'c:' + k), relic: RELIC_IDS.map((k) => 'r:' + k) };

  // 적 설명(종류 이름 · 한두 문장). 수치(칸 수·장갑)는 content.js 에서 읽는다.
  const ENEMY_INFO = {
    sentry: { type: '보병형', note: () => '폭주한 병기군단의 <b>기본 병력</b>이에요. 한 줄로 방벽을 향해 걸어와요. 드론 모함도 이 유닛을 내보내요.' },
    drone: { type: '비행형', note: () => '필드에 있는 동안 장전 때마다 <b>특수 탄약을 일반 탄약으로 교란</b>(해킹)해요. 체력은 낮은 편이라 먼저 잡으면 판이 깨끗해져요.' },
    walker: { type: '중형', note: () => '체력과 공격이 모두 높은 <b>이족 전투기</b>예요. 방벽에 닿으면 크게 아파요.' },
    hound: { type: '고속형', note: () => '사족보행 로봇견이에요. 한 번에 <b>' + ENEMIES.hound.speed + '칸</b>씩 전진해서 놓치면 금세 방벽에 닿아요. 대신 체력은 낮아요.' },
    heavy: { type: '기갑형', note: () => '단단한 <b>장갑</b>을 둘렀어요(맞을 때마다 피해 -' + ENEMIES.heavy.armor + '). 장전 판에 볼을 튕기기만 하는 <b>파편 탄약</b>을 뿌려요.' },
    sludge: { type: '오염체', note: () => '오염된 나노 젤이에요. 장전 판에 닿은 볼을 <b>삼켜 버리는 오염 탄약</b>을 뿌려요. 스웜 코어에서 갈라져 나오기도 해요.' },
    boss_titan: { type: '보스 · 돌격형', note: () => 'HP가 ' + BOSSES.titan.thresholds.map((x) => Math.round(x * 100) + '%').join('·') + '에 이를 때마다 <b>과열</b>로 물러나 멈춰요. 그동안 코어가 드러나 <b>피해 +' + Math.round(BOSSES.titan.vulnerable * 100) + '%</b>를 받아요.' },
    boss_swarm: { type: '보스 · 분리형', note: () => 'HP가 ' + BOSSES.swarm.thresholds.map((x) => Math.round(x * 100) + '%').join('·') + '에 이를 때마다 <b>슬러지 ' + BOSSES.swarm.splitCount + '기</b>로 갈라져요.' },
    boss_carrier: { type: '보스 · 정지형', note: () => '움직이지 않고 매 턴 <b>경비봇을 사출</b>해요. 부하가 쌓이기 전에 빨리 줄여야 해요.' }
  };

  // ═════════ 기록 ═════════
  function data() {
    const m = typeof Meta !== 'undefined' ? Meta.state : null; if (!m) return null;
    if (!m.codex || typeof m.codex !== 'object') {                      // 처음 쓰는 계정: 지금 가진 동료는 '본 것'으로 시작(NEW 가 한꺼번에 뜨지 않게)
      m.codex = { kills: {}, relics: {}, seen: {} };
      Object.keys(m.owned || {}).forEach((id) => { m.codex.seen['c:' + id] = 1; });
    }
    const c = m.codex; c.kills = c.kills || {}; c.relics = c.relics || {}; c.seen = c.seen || {};
    return c;
  }
  function save() { try { if (typeof Meta !== 'undefined') Meta.save(); } catch (e) {} }
  // 적을 쓰러뜨렸다(game.js killEnemy). 처음 만난 종류면 true. 처음일 때만 저장한다(런이 끝날 때 onRunEnd 가 어차피 저장).
  function kill(e) {
    const c = data(); if (!c || !e) return false;
    const key = e.isBoss ? 'boss_' + e.kind : e.type; if (!key || !enemyDef(key)) return false;
    const first = !c.kills[key]; c.kills[key] = (c.kills[key] || 0) + 1;
    if (first) save();
    return first;
  }
  // 모듈을 얻었다/개량했다(game.js gainRelic). 처음 얻은 모듈이면 true.
  function relic(id, lv) {
    const c = data(); if (!c || !RELICS[id]) return false;
    const first = !c.relics[id]; lv = lv || 1;
    if (first || lv > c.relics[id]) { c.relics[id] = Math.max(c.relics[id] || 0, lv); save(); }
    return first;
  }
  // 수집 여부(기록이 있나)
  function found(key) {
    const c = data(); if (!c) return false; const id = key.slice(2), m = Meta.state;
    if (key[0] === 'e') return (c.kills[id] || 0) > 0;
    if (key[0] === 'c') return !!(m.owned && m.owned[id]);
    return (c.relics[id] || 0) > 0;
  }
  const isNew = (key) => { const c = data(); return !!c && found(key) && !c.seen[key]; };
  const count = (t) => KEYS[t].filter(found).length;
  function hasNew() { return Object.keys(KEYS).some((t) => KEYS[t].some(isNew)); }
  // 홈 [도감] 버튼의 NEW 점 — Meta.renderHome·도감을 닫을 때 부른다
  function badge() { const b = $('codex-btn'); if (b) b.classList.toggle('has-new', !!data() && hasNew()); }

  // ═════════ 조각 HTML ═════════
  const num = (n) => Number(n).toLocaleString('ko-KR');
  const spr = (key) => '<i class="cx-spr" style="background-image:url(' + enemyUrl(key) + ');background-size:' + (isBoss(key) ? '400% 200%' : '400% 100%') + '"></i>';   // 적·보스 시트의 첫 프레임
  // 성급 ★ — 글자 별(스킨이 꺼져 있으면 그대로, 켜져 있으면 css/skin.css 가 .st .uic 에 star_on/off 그림을 입힌다)
  const stars = (n) => { let s = ''; for (let i = 1; i <= GROWTH.starMax; i++) s += '<span class="st' + (i <= n ? ' on' : '') + '"><span class="uic"><span class="uic-fb">★</span></span></span>'; return s; };
  const GCLS = { common: 'g-n', rare: 'g-r', epic: 'g-e', legendary: 'g-l' };   // 등급 배지 그림(skin.css)이 읽는 클래스
  const SEC = (t) => '<div class="cx-sect">' + t + '</div>';
  const STAT = (lb, v) => '<div class="cx-st"><span>' + lb + '</span><b>' + v + '</b></div>';

  // ── 카드(목록) ──
  function card(key) {
    const t = key[0], id = key.slice(2), ok = found(key), nw = isNew(key), c = data();
    let img, nm, sub, cls = '', rc = '';
    if (t === 'e') {
      const d = enemyDef(id); img = spr(id); nm = d.name; sub = ok ? '처치 ' + num(c.kills[id]) : '미확인';
      if (isBoss(id)) cls = ' boss';
    } else if (t === 'c') {
      const d = ROSTER.find((x) => x.id === id), o = Meta.state.owned[id];
      img = '<img class="cx-cg" src="' + CharArt.path(id, 'thumb') + '" alt="" draggable="false" onerror="this.remove()">';
      nm = d.name; sub = ok ? 'Lv.' + o.level + ' · ★' + o.star : '미보유'; rc = (RARITY[d.rarity] || RARITY.common).color;
    } else {
      const d = RELICS[id], unl = Meta.unlockedRelics().indexOf(id) >= 0;
      img = uiIcon('relic_' + id, d.icon); nm = d.name; rc = RELIC_TAGS[d.tag].color;
      sub = ok ? (c.relics[id] >= 2 ? '★ 개량 경험' : '획득') : unl ? '미획득' : ui('ic_lock', '🔒') + ' 해금 전';
    }
    return '<button class="cx-card' + (ok ? '' : ' locked') + cls + '"' + (rc ? ' style="--rc:' + rc + '"' : '') + ' data-cx-open="' + key + '">'
      + '<span class="cx-img">' + img + '</span><span class="cx-nm">' + (ok ? nm : '???') + '</span><span class="cx-sub">' + sub + '</span>'
      + (nw ? '<i class="cx-new">NEW</i>' : '') + '</button>';
  }

  // ── 목록 ──
  function listEnemy() {
    const g = (keys) => '<div class="cx-grid">' + keys.map((k) => card('e:' + k)).join('') + '</div>';
    return SEC('적') + g(ENEMY_KEYS.filter((k) => !isBoss(k))) + SEC('보스') + g(ENEMY_KEYS.filter(isBoss));
  }
  function listChar() {
    let head = '<div class="cx-colh">' + CLSS.map((k) => { const c = CLASS[k]; return '<div style="--c:' + c.color + '">' + ui('cls_' + k, c.icon) + ' ' + c.name + '</div>'; }).join('') + '</div>';
    let rows = '';
    RARS.forEach((r) => {
      const R = RARITY[r];
      rows += '<div class="cx-rar" style="--c:' + R.color + '">' + rarBadge(r) + '</div><div class="cx-grid">';   // 등급 딱지(다른 화면과 같은 모양)
      CLSS.forEach((k) => { const c = ROSTER.find((x) => x.rarity === r && x.cls === k); rows += c ? card('c:' + c.id) : '<span></span>'; });
      rows += '</div>';
    });
    return head + rows;
  }
  function listRelic() {
    const unl = Meta.unlockedRelics();
    return TAGS.map((t) => {
      const T = RELIC_TAGS[t], ids = Object.keys(RELICS).filter((id) => RELICS[id].tag === t), have = ids.filter((id) => (data().relics[id] || 0) > 0).length;
      return '<div class="cx-tag" style="--c:' + T.color + '">' + tagIc(t) + '<b>' + T.name + '</b><span>' + have + '/' + ids.length + '</span><em>' + T.set + '</em></div>'
        + '<div class="cx-grid">' + ids.map((id) => card('r:' + id)).join('') + '</div>';
    }).join('');
  }

  // ── 정보 화면 ──
  function detailEnemy(key) {
    const id = key.slice(2), d = enemyDef(id), boss = isBoss(id), info = ENEMY_INFO[id], c = data(), n = c.kills[id] || 0;
    if (!n) return '<div class="cx-hero locked' + (boss ? ' boss' : '') + '">' + spr(id) + '</div>' + '<div class="cx-title"><b>???</b></div>'
      + '<p class="cx-note">아직 쓰러뜨리지 못한 ' + (boss ? '보스' : '적') + '이에요. 쓰러뜨리면 도감에 기록돼요.</p>';
    const stages = [];
    for (let s = 1; s <= STAGE_MAX; s++) { if (boss ? stageBoss(s) === id.slice(5) : (STAGE_POOL[s] || []).some((p) => p[0] === id)) stages.push(s); }
    const stats = STAT('기본 HP', num(d.hp)) + STAT('공격', d.dmg) + (boss ? '' : STAT('이동', d.speed + '칸/턴') + STAT('장갑', d.armor ? d.armor : '–')) + STAT('경험치', d.exp);
    let h = '<div class="cx-hero' + (boss ? ' boss' : '') + '">' + spr(id) + '</div>'
      + '<div class="cx-title"><b>' + d.name + '</b><span class="cx-chip" style="--c:' + (d.color || '#9a92c6') + '">' + info.type + '</span></div>'
      + '<p class="cx-note">' + info.note() + '</p>'
      + SEC('능력치') + '<div class="cx-stats">' + stats + '</div>'
      + '<p class="cx-fine">기본값이에요. 스테이지가 오르거나 지도의 깊은 층일수록 HP와 공격이 커져요.</p>';
    if (boss) {
      const bi = BOSS_INTENT[id.slice(5)];
      h += SEC('예고 패턴') + '<div class="cx-skill"><div class="cx-sk-h"><b>' + bi.name + '</b><span>' + bi.every + '턴마다</span></div><div class="cx-sk-d">' + bi.desc + '. 그 턴이 되기 전에 <b>기절</b> 스킬로 묶으면 취소돼요.</div></div>';
    }
    h += SEC('나오는 스테이지') + '<div class="cx-chips">' + stages.map((s) => '<span class="cx-chip">스테이지 ' + s + '</span>').join('') + '</div>'
      + SEC('기록') + '<p class="cx-note">지금까지 <b>' + num(n) + (boss ? '번' : '기') + '</b> 쓰러뜨렸어요.</p>';
    return h;
  }
  function detailChar(key) {
    const id = key.slice(2), d = ROSTER.find((x) => x.id === id), R = RARITY[d.rarity] || RARITY.common, cl = CLASS[d.cls] || { icon: '', name: '', color: '#9a92c6' };
    const o = Meta.state.owned[id];
    const hero = '<div class="cx-hero char' + (o ? '' : ' locked') + '" style="--rc:' + R.color + '"><img src="' + CharArt.small(id) + '" alt="" draggable="false" onerror="this.style.display=\'none\'"></div>';
    if (!o) return hero + '<div class="cx-title"><b>???</b><span class="cx-grade ' + GCLS[d.rarity] + '" style="--rc:' + R.color + '">' + R.name + '</span></div>'
      + '<p class="cx-note">아직 만나지 못한 동료예요. 상점 <b>가챠</b>에서 얻을 수 있어요.</p>';
    const cur = Meta.leveledDef(id);
    return hero
      + '<div class="cx-title"><b>' + d.name + '</b><span class="cx-grade ' + GCLS[d.rarity] + '" style="--rc:' + R.color + '">' + R.name + '</span></div>'
      + '<div class="cx-sub2"><span style="color:' + cl.color + '">' + ui('cls_' + d.cls, cl.icon) + ' ' + cl.name + ' · ' + (d.weapon || '') + '</span><span class="cx-stars">' + stars(o.star) + '</span><span>Lv.' + o.level + '</span></div>'
      + '<p class="cx-note">' + d.concept + '</p>'
      + SEC('능력치 <small>Lv.' + o.level + ' · ★' + o.star + ' 기준</small>') + '<div class="cx-stats">' + STAT(ui('stat_atk', '💥') + ' 공격', cur.atk) + STAT(ui('stat_hp', '🛡') + ' 체력', cur.hp) + STAT(ui('stat_gol', '🎯') + ' 탄창', d.gol) + '</div>'
      + SEC('스킬')
      + '<div class="cx-skill"><div class="cx-sk-h"><b>' + d.active.name + '</b><span>액티브 · 게이지 ' + d.active.gauge + '</span></div><div class="cx-sk-d">' + Meta.skillText(d.active) + '</div></div>'
      + '<div class="cx-skill pas"><div class="cx-sk-h"><b>' + d.passive.name + '</b><span>패시브</span></div><div class="cx-sk-d">' + Meta.skillText(d.passive) + '</div></div>';
  }
  function detailRelic(key) {
    const id = key.slice(2), d = RELICS[id], T = RELIC_TAGS[d.tag], c = data(), lv = c.relics[id] || 0;
    const hero = '<div class="cx-hero relic' + (lv ? '' : ' locked') + '" style="--rc:' + T.color + '">' + uiIcon('relic_' + id, d.icon) + '</div>';
    const unl = Meta.unlockedRelics().indexOf(id) >= 0;
    if (!lv) return hero + '<div class="cx-title"><b>???</b><span class="cx-chip" style="--c:' + T.color + '">' + tagIc(d.tag) + ' ' + T.name + '</span></div>'
      + '<p class="cx-note">' + (unl ? '아직 얻어 보지 못한 모듈이에요. 전투에서 이기거나 짝수 레벨이 될 때 <b>3개 중 1개</b>로 나와요.' : ui('ic_lock', '🔒') + ' 아직 해금 전이에요. 스테이지를 <b>처음 클리어할 때마다</b> 모듈이 새로 열려요.') + '</p>';
    const mates = Object.keys(RELICS).filter((x) => RELICS[x].tag === d.tag).map((x) => '<span class="cx-chip' + ((c.relics[x] || 0) > 0 ? '' : ' dim') + '" style="--c:' + T.color + '">' + ((c.relics[x] || 0) > 0 ? RELICS[x].name : '???') + '</span>').join('');
    return hero
      + '<div class="cx-title"><b>' + d.name + '</b><span class="cx-chip" style="--c:' + T.color + '">' + tagIc(d.tag) + ' ' + T.name + '</span></div>'
      + SEC('효과')
      + '<div class="cx-lv"><i class="cx-lvt">Lv1</i><span>' + d.lv1.desc + '</span></div>'
      + '<div class="cx-lv evo"><i class="cx-lvt">개량</i><span><b>' + d.lv2.name + '</b> — ' + d.lv2.desc + '</span></div>'
      + '<p class="cx-fine">같은 모듈을 한 번 더 고르거나 정비 노드에서 <b>개량</b>하면 Lv2가 돼요.</p>'
      + SEC('세트 보너스') + '<p class="cx-note">' + T.name + ' 태그 모듈을 <b>' + RELIC_SET_N + '개</b> 모으면: ' + T.set + '</p><div class="cx-chips">' + mates + '</div>'
      + SEC('기록') + '<p class="cx-note">' + (lv >= 2 ? '<b>개량(Lv2)</b>까지 써 봤어요.' : 'Lv1까지 써 봤어요. 개량하면 더 강해져요.') + '</p>';
  }

  // ═════════ 화면 ═════════
  const TABS = [
    { id: 'enemy', name: '적', ic: () => uiIcon('node_elite', '💀', 'width:100%;height:100%'), list: listEnemy, detail: detailEnemy },
    { id: 'char', name: '동료', ic: () => uiIcon('nav_formation', '👥', 'width:100%;height:100%'), list: listChar, detail: detailChar },
    { id: 'relic', name: '모듈', ic: () => uiIcon('relic_crit', '🎯', 'width:100%;height:100%'), list: listRelic, detail: detailRelic }
  ];
  const cur = () => TABS.find((t) => t.id === tab) || TABS[0];

  function build() {
    if (built) return; built = true;
    const m = document.createElement('div');
    m.id = 'codex-modal'; m.className = 'modal'; m.hidden = true; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', '도감');
    m.innerHTML = '<div class="modal-box codex-box">'
      + '<div class="hp-top"><h2>' + ui('ic_codex', '📖') + ' 도감 <span class="cx-total" id="cx-total"></span></h2><button class="hp-x" data-cx-close="1" aria-label="닫기">' + ui('ic_close', '✕') + '</button></div>'
      + '<div class="cx-tabs" id="cx-tabs"></div>'
      + '<div class="cx-bar" id="cx-bar" hidden></div>'
      + '<div class="cx-body" id="cx-body"></div></div>';
    $('app').appendChild(m);
    m.addEventListener('click', (e) => {
      if (e.target === m || e.target.closest('[data-cx-close]')) { close(); return; }
      const t = e.target.closest('[data-cx-tab]'); if (t) { tab = t.dataset.cxTab; view = 'list'; sel = null; render(); click(); return; }
      const o = e.target.closest('[data-cx-open]'); if (o) { openEntry(o.dataset.cxOpen); click(); return; }
      if (e.target.closest('[data-cx-back]')) { view = 'list'; render(); click(); return; }
      const n = e.target.closest('[data-cx-nav]'); if (n) { nav(+n.dataset.cxNav); click(); }
    });
  }
  function click() { try { if (typeof Sound !== 'undefined') Sound.play('click'); } catch (e) {} }
  function openEntry(key) {                                          // 카드 → 정보 화면. 처음 보는 항목이면 NEW 를 끈다
    sel = key; view = 'detail';
    const c = data(); if (c && found(key) && !c.seen[key]) { c.seen[key] = 1; save(); }
    render();
  }
  function nav(dir) {                                                // 정보 화면에서 ‹ › — 같은 탭의 이웃 항목(미수집 포함)
    const ks = KEYS[tab], i = ks.indexOf(sel); if (i < 0) return;
    openEntry(ks[(i + dir + ks.length) % ks.length]);
  }
  function render() {
    const c = data(); if (!c) return;
    const all = Object.keys(KEYS).reduce((s, t) => s + KEYS[t].length, 0), got = Object.keys(KEYS).reduce((s, t) => s + count(t), 0);
    $('cx-total').textContent = got + ' / ' + all;
    $('cx-tabs').innerHTML = TABS.map((t) => '<button class="cx-tab' + (t.id === tab ? ' on' : '') + '" data-cx-tab="' + t.id + '"><span class="hp-ti">' + t.ic() + '</span>' + t.name + ' <small>' + count(t.id) + '/' + KEYS[t.id].length + '</small>' + (KEYS[t.id].some(isNew) ? '<i class="cx-dot"></i>' : '') + '</button>').join('');
    const T = cur(), bar = $('cx-bar'), body = $('cx-body');
    if (view === 'detail' && sel) {
      const ks = KEYS[tab], i = ks.indexOf(sel);
      bar.hidden = false;
      bar.innerHTML = '<button class="cx-back" data-cx-back="1">‹ 목록</button><span class="cx-pos">' + (i + 1) + ' / ' + ks.length + '</span><span class="cx-navs"><button data-cx-nav="-1" aria-label="이전">‹</button><button data-cx-nav="1" aria-label="다음">›</button></span>';
      body.innerHTML = '<div class="cx-det">' + T.detail(sel) + '</div>';
    } else {
      bar.hidden = true; bar.innerHTML = '';
      body.innerHTML = T.list();
    }
    body.scrollTop = 0;
  }
  function open(which) {
    if (!data()) return;
    build();
    if (which && TABS.some((t) => t.id === which)) tab = which;
    view = 'list'; sel = null; render();
    $('codex-modal').hidden = false; click();
  }
  function close() { const m = $('codex-modal'); if (m) m.hidden = true; badge(); }
  const isOpen = () => { const m = $('codex-modal'); return !!m && !m.hidden; };

  // 홈의 [data-codex] 버튼은 문서 위임으로 연다
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-codex]'); if (!b) return; e.stopPropagation(); open(b.dataset.codex === 'open' ? undefined : b.dataset.codex); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) { if (view === 'detail') { view = 'list'; render(); } else close(); } });

  return { kill, relic, badge, open, close, isOpen, data, debug: { KEYS, found, count } };
})();
