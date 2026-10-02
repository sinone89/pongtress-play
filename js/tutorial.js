'use strict';
/* PONGTRESS 튜토리얼 v2 — 스틸앤샷(steal-and-shot) 방식 · 3챕터
 *  · 가이드 캐릭터(루비)가 말풍선으로 안내하고, 짚는 곳만 밝게 남기는 스포트라이트(어두운 막 4장 + 빛나는 테두리)로 엉뚱한 곳을 못 누르게 한다.
 *  · 카드는 두 종류: 'next'(설명 — [다음] 버튼) / 'do'(직접 해 보기 — 표시된 곳을 누르면 조건을 감지해 자동으로 넘어감).
 *    한 카드 = 한 가지(40자 안팎). 세부는 도움말(?)과 '처음 만났을 때 팁'으로 넘긴다.
 *  · ① TOUR = 온보딩 3챕터(말풍선 위 1/3 표시)
 *       1 첫 전투  — 튜토리얼 전투: 분기 지도 없이 1회 · 루비 1명 · 약한 적 · 패배 불가(game.js startRun mode 'tutorial')
 *       2 영입과 편성 — 상점의 튜토리얼 가챠 1회(보라 확정) → 편성 탭에서 직접 배치
 *       3 홈 · 출격 · 미션 → 완료 선물(기존 재화 + 코코). 코코는 자동 배치하지 않는다(플레이어가 편성 탭에서 직접).
 *    ② TIPS = 처음 만났을 때 한 번(투어가 끝난 뒤 · 한 번에 하나(20초 간격) · 1쪽 · [자세히 ›] → 도움말).
 *  · 건너뛰기: 확인 팝업(경고 + 지금 받는 보상)에서 [확인]을 눌러야만 건너뛴다 — 그 순간 아직 못 받은 동료(보라·코코)와 완료 재화를 받는다(자동 배치 없음).
 *  · 다시 보기(계정 메뉴·도움말): 챕터 선택. 보상·가챠 잠금 없음(review).
 *  · 진행·본 안내는 계정 세이브(Meta.state.tut = { v:2, at, done, offered, seen, battle, pulled, rewarded, review })에 저장 → 새로고침해도 이어진다.
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
  const navBtn = (k) => q('#lobby-nav .tabbtn[data-tab="' + k + '"]');
  const goTab = (k) => { const b = navBtn(k); if (b) b.click(); };
  const partyCount = () => document.querySelectorAll('#lane-slots .lane-slot.on').length;
  const launched = () => { const s = run(); return s ? (s.launchedThisTurn || 0) : 0; };
  const reviewing = () => { const t = tut(); return !!t && !!t.review; };       // 다시 보기 중인가(보상·가챠 없음)
  // 장전 화면이 자리 잡았는가(전투→장전 전환 보간이 끝나고 지도·모달이 없음)
  const loadReady = () => { const s = run(); return !!s && s.phase === 'load' && (s.layoutT || 0) < 0.05 && combatOn() && !vis('map') && !vis('reward') && !vis('run-modal') && !vis('result'); };
  const inTutBattle = () => { const s = run(); return !!s && !!s.tutorial && combatOn(); };

  // ═════════ 짚을 영역 계산 ═════════
  // 영역 = {l,t,w,h}(뷰포트 좌표). 대상은 요소·영역·배열(합집합)·함수 모두 가능.
  function rectOf(t) {
    if (typeof t === 'function') t = t();
    if (!t) return null;
    if (Array.isArray(t)) {
      const rs = t.map(rectOf).filter(Boolean); if (!rs.length) return null;
      const l = Math.min(...rs.map(r => r.l)), tp = Math.min(...rs.map(r => r.t)), rr = Math.max(...rs.map(r => r.l + r.w)), bb = Math.max(...rs.map(r => r.t + r.h));
      return { l, t: tp, w: rr - l, h: bb - tp };
    }
    if (t.getBoundingClientRect) { const r = t.getBoundingClientRect(); return (r.width < 2 || r.height < 2) ? null : { l: r.left, t: r.top, w: r.width, h: r.height }; }
    return t;
  }
  // 전투 캔버스의 영역(field·wall·goal·pins) → 뷰포트 좌표
  function canvasRect(name) {
    const g = game(), cv = $('stage'); if (!g || !cv || !run()) return null;
    const L = g.layout()[name]; if (!L) return null;
    const c = cv.getBoundingClientRect(), k = cv.clientWidth ? c.width / cv.clientWidth : 1;
    return { l: c.left + L.x * k, t: c.top + L.y * k, w: L.w * k, h: L.h * k };
  }
  const center = (t) => { const r = rectOf(t); return r ? { x: r.l + r.w / 2, y: r.t + r.h / 2 } : null; };
  // 조준 시범 손가락: 발사구에서 핀볼 판의 (가로 frac, 세로 35%) 쪽으로
  const aimHand = (frac) => () => { const g = game(), L = g && g.launcher(), P = g && g.layout().pins, cv = $('stage'); if (!L || !cv) return null; const c = cv.getBoundingClientRect(); return { from: { l: c.left + L.x - 2, t: c.top + L.y - 2, w: 4, h: 4 }, to: { l: c.left + P.x + P.w * frac - 2, t: c.top + P.y + P.h * 0.35 - 2, w: 4, h: 4 } }; };

  // ═════════ 문구 치환: {gold} {mats} {gems} {docs} {shards} → 재화 아이콘, {ic:이름|이모지} → 아이콘 ═════════
  function fmt(s) {
    return String(s == null ? '' : s).replace(/\{(gold|mats|gems|docs|shards)\}|\{ic:(\w+)\|([^}]*)\}/g, (m, cur, name, em) => cur ? uiCur(cur) : ui(name, em));
  }
  const charName = (id) => { const b = ROSTER.find(c => c.id === id); return b ? b.name : id; };

  // ═════════ TOUR(온보딩 3챕터) — 단계는 id 로 저장(순서를 바꿔도 진행이 깨지지 않게) ═════════
  // 필드: id · ch(챕터) · ctx('lobby'|'run') · kind('next'|'do') · msg · target · label(버튼 글자) · tap(힌트) · dim(false=막 없이 말풍선만) · pause(전투 정지) · noSkip(건너뛰기 숨김)
  //       buttons(마지막 쪽의 버튼 목록을 돌려주는 함수 → 없으면 기본 [다음]) · onButton(a)
  //       modal(이 단계에서 열려 있어도 되는 모달 id) · onEnter · onLeave · skip(진입 시 이미 충족/해당 없음이면 건너뜀) · done(충족되면 자동 진행) · ready(false 면 잠시 숨김) · hand(끌기 시범) · tab(필요한 로비 탭 — 자동 이동)
  const TOUR = [
    // ── 챕터 1 · 첫 전투 (튜토리얼 전투 — 루비 1명) ──
    { id: 'c1-hello', ch: 1, ctx: 'run', kind: 'next', pause: true, label: '좋아요!', ready: loadReady,
      msg: '어서 와요, 지휘관님! 저는 <b>루비</b>예요. 먼저 한 판 같이 싸워 봐요!' },
    { id: 'c1-aim', ch: 1, ctx: 'run', kind: 'do', ready: loadReady, tap: '표시된 판 위에서 끌었다 놓아요',
      msg: '<b>핀볼 판</b>을 <b>끌어서 조준</b>하고, 손을 떼면 <b>발사</b>돼요!',
      target: () => canvasRect('pins'), hand: aimHand(0.7), done: () => launched() >= 1 },
    { id: 'c1-pocket', ch: 1, ctx: 'run', kind: 'next', dim: false, label: '알겠어요',
      msg: '볼이 위쪽 <b>색 칸</b>에 들어가면 루비의 <b>탄환이 충전</b>돼요.',
      done: () => { const s = run(); return !s || (s.balls.length === 0 && launched() >= 1) || s.phase !== 'load'; } },
    { id: 'c1-aim2', ch: 1, ctx: 'run', kind: 'do', ready: loadReady, tap: '아까처럼 끌었다 놓아요',
      msg: '<b>한 발 더</b> 쏴 봐요!', target: () => canvasRect('pins'), hand: aimHand(0.3),
      done: () => { const s = run(); return !s || s.launchesLeft <= 0 || s.phase !== 'load'; } },
    { id: 'c1-battle', ch: 1, ctx: 'run', kind: 'next', pause: true, ready: () => { const s = run(); return !!s && s.phase === 'battle' && !vis('reward'); },
      msg: '충전한 만큼 루비가 <b>자동으로 사격</b>해요! 적을 모두 쓰러뜨리면 승리예요.',
      target: () => [canvasRect('field'), canvasRect('wall')], onEnter: () => { T.fought = true; } },
    { id: 'c1-again', ch: 1, ctx: 'run', kind: 'next', dim: false, label: '알겠어요', ready: () => loadReady() && !!T.fought,
      msg: '다시 <b>장전</b> 차례예요. 이번엔 <b>마음대로</b> 쏴 봐요!', done: () => { const s = run(); return !!s && s.over; } },
    { id: 'c1-win', ch: 1, ctx: 'run', kind: 'next', noSkip: false, label: '동료 만나러 가기', ready: () => { const s = run(); return !!s && !!s.tutorial && s.over; },
      msg: '<b>첫 승리!</b> 혼자서도 잘 싸우지만… <b>동료</b>가 있으면 더 든든하겠죠?',
      onLeave: () => { const g = game(); try { g && g.exitTutorialBattle(); } catch (e) {} const t = tut(); t.battle = true; persist(); T.fought = false; } },

    // ── 챕터 2 · 영입과 편성 ──
    { id: 'c2-shop', ch: 2, ctx: 'lobby', kind: 'do', tap: '아래 [상점] 탭을 눌러요',
      msg: '이제 <b>동료</b>를 영입하러 가요!', target: () => navBtn('shop'), done: () => tabOn('shop') },
    { id: 'c2-pull', ch: 2, ctx: 'lobby', kind: 'do', tab: 'shop', tap: '[튜토리얼 뽑기]를 눌러요', skip: () => reviewing() || !q('[data-gacha="tutorial"]'),
      msg: '<b>첫 뽑기</b>는 <b>무료</b>예요! 새 동료를 뽑아 봐요.', target: () => q('[data-gacha="tutorial"]'), done: () => vis('gacha-modal') },
    { id: 'c2-pull-r', ch: 2, ctx: 'lobby', kind: 'next', tab: 'shop', skip: () => !reviewing(),
      msg: '<b>가챠</b>에서 새 동료를 뽑아요. 비용은 단일 {gems}' + GACHA.cost1 + ', 10연 {gems}' + GACHA.cost10 + '이에요. <b>ⓘ</b> 버튼에서 <b>확률</b>도 볼 수 있어요.', target: () => q('.gbanner') },
    { id: 'c2-result', ch: 2, ctx: 'lobby', kind: 'do', modal: 'gacha-modal', tap: '[확인]을 눌러요', skip: () => reviewing() || !vis('gacha-modal'),
      msg: '새 동료 <b>' + charName(TUTORIAL.pullId) + '</b>가 합류했어요!', target: () => $('gacha-modal-box'), done: () => !vis('gacha-modal') },
    { id: 'c2-nav-form', ch: 2, ctx: 'lobby', kind: 'do', tap: '아래 [편성] 탭을 눌러요',
      msg: '이제 동료를 <b>편성</b>해서 전투에 내보내요!', target: () => navBtn('formation'), done: () => tabOn('formation') },
    { id: 'c2-place', ch: 2, ctx: 'lobby', kind: 'do', tab: 'formation', dlg: 'bottom', tap: '카드를 끌어다 놓거나, 탭한 뒤 [편성]을 눌러요',
      skip: () => !q('#lane-slots .lane-slot.empty') || !q('#owned-list .stchar:not(.locked):not(.placed)'),
      msg: '<b>' + charName(TUTORIAL.pullId) + '</b>를 <b>빈 레인</b>에 배치해요!',
      target: () => $('tab-formation'),
      hand: () => ({ from: q('#owned-list .stchar:not(.locked):not(.placed)'), to: q('#lane-slots .lane-slot.empty') }),
      onEnter: () => { T.placeFrom = partyCount(); }, done: () => partyCount() > (T.placeFrom || 0) },
    { id: 'c2-lanes', ch: 2, ctx: 'lobby', kind: 'next', tab: 'formation',
      msg: '레인마다 <b>한 명</b>씩 설 수 있어요. 부대 <b>체력의 합</b>이 곧 <b>방벽 HP</b>예요!', target: () => $('lane-slots') },

    // ── 챕터 3 · 홈 · 출격 · 미션 ──
    { id: 'c3-home', ch: 3, ctx: 'lobby', kind: 'next', tab: 'home',
      msg: '<b>홈</b>에서는 편성한 동료가 알아서 싸워요. <b>방치 보상</b>도 차곡차곡 쌓여요!', target: () => [$('idle-canvas'), $('idle-reward')] },
    { id: 'c3-sortie', ch: 3, ctx: 'lobby', kind: 'next', tab: 'sortie',
      msg: '<b>출격</b> 탭에서 스테이지와 모드를 골라 전장으로 나가요.', target: () => [$('mode-select'), $('stage-select')] },
    { id: 'c3-mission', ch: 3, ctx: 'lobby', kind: 'next', tab: 'mission',
      msg: '<b>미션</b>을 달성하면 보상을 받아요. 목표를 채우면 <b>[수령]</b>을 눌러요!', target: () => $('mission-list') },
    { id: 'c3-reward', ch: 3, ctx: 'lobby', kind: 'next', noSkip: true, label: '받기', skip: () => reviewing(),
      msg: () => '수고했어요, 지휘관님! <b>튜토리얼 완료</b> 선물이 도착했어요.<br>' + ui('cls_support', '🛠') + '<b>' + charName(TUTORIAL.rewardId) + '</b> 합류 · {gems}<b>' + TUTORIAL.reward.gems + '</b> · {gold}<b>' + TUTORIAL.reward.gold + '</b>',
      onLeave: () => { const m = meta(); try { m && m.tutGrantRewards(); m && m.renderLobby(); } catch (e) {} } },
    { id: 'c3-go', ch: 3, ctx: 'lobby', kind: 'next', noSkip: true, label: '확인',
      msg: () => reviewing() ? '수고했어요! 모르는 게 생기면 위쪽 <b>?</b> <b>도움말</b>에서 언제든 찾아볼 수 있어요.'
        : '<b>' + charName(TUTORIAL.rewardId) + '</b>는 <b>[편성]</b> 탭에서 직접 배치해 주세요!<br>모르는 게 생기면 위쪽 <b>?</b> <b>도움말</b>에서 언제든 찾아볼 수 있어요.',
      buttons: () => reviewing() ? null : [{ a: 'form', label: '편성하러 가기', primary: true }, { a: 'sortie', label: '출격하러 가기' }],
      onButton: (a) => { finishTour(); goTab(a === 'form' ? 'formation' : 'sortie'); } }
  ];
  const T = {};                                                   // 단계 간 임시 값(저장 안 함)
  const tourIdx = (id) => TOUR.findIndex(s => s.id === id);

  // ═════════ TIPS — 처음 만났을 때 한 번(투어가 끝난 뒤 · 안 본 것만 · 조건이 맞으면 뜸 · 한 번에 하나) ═════════
  // 필드: id · ctx · when(조건) · msg(문자열/함수) · target · modal · pause · label · help(도움말 주제 id → [자세히 ›])
  const TIPS = [
    // ── 로비 ──
    { id: 'mode.daily', ctx: 'lobby', help: 'modes', when: () => tabOn('sortie') && !!q('#mode-select .sns-tab.on[data-mode="daily"]'), target: () => $('mode-select'),
      msg: '<b>일일 도전</b>은 오늘 하루 같은 판에 도전하는 모드예요. 첫 클리어엔 {gems}<b>' + (typeof MODES !== 'undefined' ? MODES.daily.reward.gems : 40) + '</b>을 줘요.' },
    { id: 'mode.endless', ctx: 'lobby', help: 'modes', when: () => tabOn('sortie') && !!q('#mode-select .sns-tab.on[data-mode="endless"]'), target: () => $('mode-select'),
      msg: '<b>무한 모드</b>는 보스를 쓰러뜨릴 때마다 <b>더 강한 막</b>이 이어져요. 최고 기록에 도전해 봐요!' },
    { id: 'char.detail', ctx: 'lobby', help: 'chars', modal: 'char-modal', when: () => vis('char-modal') && !!q('#char-modal .cd-tab.on[data-cdtab="lvup"]'), target: () => q('#char-modal .cd-statcol'),
      msg: '<b>레벨업</b>에는 {gold}크레딧, <b>승급</b>에는 {shards}조각과 {mats}재료가 필요해요. 스킬은 아래에서 볼 수 있어요.' },
    { id: 'char.promote', ctx: 'lobby', help: 'chars', modal: 'char-modal', when: () => vis('char-modal') && !!q('#char-modal .cd-tab.on[data-cdtab="promote"]'), target: () => q('#char-modal .cd-cmp'),
      msg: '<b>승급</b>하면 ★이 올라 스탯과 <b>레벨 상한</b>이 커져요. 조각은 가챠에서 같은 동료가 나올 때나 {docs}문서로 얻어요.' },
    { id: 'shop.doc', ctx: 'lobby', help: 'econ', when: () => tabOn('shop') && !!q('.shoptabs .sns-tab.on[data-stab="doc"]'), target: () => q('.shoptabs'),
      msg: '{docs}문서로 보유한 동료의 <b>조각</b>을 살 수 있어요. 등급이 높을수록 비싸요.' },
    { id: 'shop.pkg', ctx: 'lobby', when: () => tabOn('shop') && !!q('.shoptabs .sns-tab.on[data-stab="pkg"]'), target: () => q('.shoptabs'),
      msg: '<b>패키지</b>는 아직 준비 중이에요. 곧 보석 패키지와 주간 패스가 열릴 예정이에요!' },
    { id: 'mission.claim', ctx: 'lobby', when: () => tabOn('mission') && !!q('#mission-list [data-mission]:not([disabled])'), target: () => q('#mission-list [data-mission]:not([disabled])'),
      msg: '달성한 미션이 있어요! <b>[수령]</b>을 눌러 보상을 받아요.' },
    // ── 런 ──
    { id: 'run.map', ctx: 'run', help: 'map', modal: 'map', when: () => { const s = run(); return !!s && !s.tutorial && vis('map') && !vis('reward') && !vis('run-modal'); }, target: () => $('map-body'),
      msg: '<b>분기 지도</b>예요. 길을 골라 위로 올라가요!<br>{ic:node_battle|💥}전투 {ic:node_elite|💀}정예 {ic:node_shop|🛒}상점 {ic:node_rest|🔧}정비 {ic:node_boss|👾}보스' },
    { id: 'skill', ctx: 'run', pause: true, help: 'battle',
      when: () => { const s = run(); return !!s && !s.tutorial && s.phase === 'load' && loadReady() && s.chars.some(c => c.gauge >= c.ref.active.gauge) && vis('battle-side'); },
      target: () => $('battle-side'),
      msg: '<b>스킬 게이지</b>가 찼어요! 오른쪽 <b>스킬 버튼</b>을 켜 두면 이번 전투에 발동해요. <b>[스킬 자동]</b>을 켜면 매번 알아서 써요.' },
    { id: 'lvl.relic', ctx: 'run', modal: 'reward', help: 'relic', when: () => vis('reward') && !!q('#reward-choices .relic-card'), target: () => q('#reward .modal-box'),
      msg: () => /레벨/.test(($('reward-title') && $('reward-title').textContent) || '')
        ? '<b>레벨 업!</b> 보상 <b>3개 중 1개</b>를 골라요. 짝수 레벨엔 이번 판 동안 쓰는 특수 장비 <b>모듈</b>이 나와요.'
        : '<b>전투 승리!</b> <b>모듈</b> 3개 중 1개를 골라요. 같은 모듈을 또 고르면 <b>개량</b>돼요!' },
    { id: 'lvl.stat', ctx: 'run', modal: 'reward', help: 'map', when: () => vis('reward') && !q('#reward-choices .relic-card') && !!q('#reward-choices .reward-card'), target: () => q('#reward .modal-box'),
      msg: '홀수 레벨엔 <b>스탯 강화</b>가 나와요. 화력·방벽 HP·볼 +1·수리 중 <b>하나</b>를 골라요.' },
    { id: 'relic.bar', ctx: 'run', help: 'relic',
      when: () => { const s = run(); return !!s && combatOn() && Object.keys(s.relics || {}).length > 0 && !vis('reward') && !vis('run-modal') && !vis('result') && (vis('map') || loadReady()); },
      target: () => vis('map') ? $('map-relics') : $('relic-bar'),
      msg: '위쪽 <b>모듈 막대</b>를 탭하면 설명과 <b>세트 진행도</b>를 볼 수 있어요. 같은 <b>태그</b> 모듈이 3개면 세트 보너스!' },
    { id: 'node.shop', ctx: 'run', modal: 'run-modal', help: 'map', when: () => vis('run-modal') && !!q('#run-modal-box [data-buy]'), target: () => $('run-modal-box'),
      msg: '{ic:node_shop|🛒}<b>상점</b>이에요. 모은 {gold}<b>크레딧</b>으로 모듈이나 방벽 수리를 살 수 있어요. 사지 않고 <b>[떠나기]</b>를 눌러도 돼요.' },
    { id: 'node.rest', ctx: 'run', modal: 'run-modal', help: 'map', when: () => vis('run-modal') && !!q('#run-modal-box [data-rest]'), target: () => $('run-modal-box'),
      msg: '{ic:node_rest|🔧}<b>정비</b>예요. <b>수리</b>(방벽 HP 40% 회복)와 <b>개량</b> 중 <b>하나</b>만 고를 수 있어요.' },
    { id: 'node.elite', ctx: 'run', pause: true, help: 'enemy',
      when: () => { const s = run(); return !!s && !!s.combat && !!s.combat.elite && loadReady(); }, target: () => canvasRect('field'),
      msg: '{ic:node_elite|💀}<b>정예</b> 전투예요! 황금빛 <b>정예 적</b>은 강하지만 경험치와 보상이 커요.' },
    { id: 'node.boss', ctx: 'run', pause: true, help: 'enemy',
      when: () => { const s = run(); return !!s && !!s.combat && !!s.combat.boss && loadReady(); }, target: () => canvasRect('field'),
      msg: '{ic:node_boss|👾}<b>보스</b>예요! 보스 곁의 알약에 <b>예고 패턴</b>까지 남은 턴이 떠요. 그 전에 <b>기절</b> 스킬로 묶으면 패턴이 취소돼요!' },
    { id: 'board.interfere', ctx: 'run', pause: true, help: 'enemy',
      when: () => { const s = run(), g = game(); return !!s && !!g && loadReady() && g.anim.floats.some(f => f.note && /교란|오염|파편/.test(f.text)); }, target: () => canvasRect('pins'),
      msg: '적이 <b>핀볼 판을 방해</b>해요! 해킹드론·슬러지·헤비아머를 먼저 잡으면 판이 깨끗해져요.' },
    { id: 'result', ctx: 'run', modal: 'result', when: () => vis('result'), target: () => $('result-box'),
      msg: () => ($('result-box') && $('result-box').classList.contains('win'))
        ? '<b>승리!</b> 스테이지를 <b>처음 클리어</b>하면 다음 스테이지와 새 모듈이 열려요.'
        : '방벽이 무너져도 모은 보상은 받아요. 동료를 키워 다시 도전해요!' }
  ];

  // ═════════ 카드 화면(스포트라이트 + 말풍선) ═════════
  let built = false, active = null, entered = null, enteredAt = 0, shown = null, skipReadyAt = 0, handSig = '', handAnim = null, raf = 0, _toastT = 0;
  const memo = {};                                                // 카드별 표시 상태(쪽 번호 등) — 잠깐 숨었다 돌아와도 유지

  function toast(html) {
    const el = $('toast'); if (!el) return;
    el.innerHTML = html; el.style.setProperty('--c', '#ffcf5c'); el.className = 'toast show big';
    clearTimeout(_toastT); _toastT = setTimeout(() => { el.className = 'toast'; }, 3400);
  }

  function build() {
    if (built) return; built = true;
    const d = document.createElement('div'); d.id = 'tut';
    d.innerHTML = '<div class="tut-block" id="tut-bt"></div><div class="tut-block" id="tut-bb"></div><div class="tut-block" id="tut-bl"></div><div class="tut-block" id="tut-br"></div>'
      + '<div id="tut-shield"></div><div id="tut-ring"></div><div id="tut-hand"></div>'
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
    window.addEventListener('resize', () => { if (shown) place(); });
    document.addEventListener('pointerup', () => setTimeout(tick, 90), true);       // 누른 직후 조건 감지(250ms 폴링을 기다리지 않게)
  }

  const pagesOf = (d) => { const m = typeof d.msg === 'function' ? d.msg() : d.msg; return Array.isArray(m) ? m : [m]; };
  const isTip = (d) => !!d.tip;
  function kindOf(d) { return d.kind === 'offer' ? 'offer' : (d.tip ? 'tip' : (d.kind || 'next')); }

  // 카드 내용 그리기(바뀌었을 때만)
  function renderDialog() {
    const d = shown.def, k = kindOf(d), pages = pagesOf(d), pi = Math.min(shown.page, pages.length - 1);
    const sig = d.id + '|' + pi + '|' + k + '|' + (shown.fallback ? 1 : 0) + '|' + (reviewing() ? 1 : 0);
    if (shown.sig === sig) return;
    shown.sig = sig;
    $('tut-msg').innerHTML = fmt(pages[pi]);
    const doTap = (k === 'do' && !shown.fallback);
    $('tut-tap').textContent = doTap ? (d.tap || '표시된 곳을 눌러요') : '';
    $('tut-tap').style.display = doTap ? 'block' : 'none';
    const pg = $('tut-prog');                                       // 챕터 진행 표시(투어 카드만): 1/3 · 첫 전투
    if (d.ch && !isTip(d) && k !== 'offer') { pg.textContent = d.ch + '/' + CHAPTERS.length + ' · ' + CHAPTERS[d.ch - 1].name + (reviewing() ? ' · 다시 보기' : ''); pg.style.display = 'block'; } else pg.style.display = 'none';
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

  // [다음] — 쪽이 남았으면 다음 쪽, 마지막이면 카드 종료(투어는 단계 이동, 팁은 '봄' 처리)
  function cardNext() {
    if (!shown) return;
    const d = shown.def, pages = pagesOf(d);
    if (shown.page < pages.length - 1) { shown.page++; memo[d.id] = shown; renderDialog(); return; }
    if (isTip(d)) { const t = tut(); t.seen[d.id] = true; T.lastTipAt = Date.now(); persist(); active = null; hide(); }
    else { tourAdvance(); hide(); }
    setTimeout(tick, 30);
  }

  function hide() {
    const e = $('tut'); if (e) e.classList.remove('show');
    shown = null; window.__tutPause = false; handSig = ''; if (handAnim) { try { handAnim.cancel(); } catch (_) {} handAnim = null; }
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  // 스포트라이트·말풍선 위치 계산(매 프레임 가볍게)
  function place() {
    if (!shown || !built) return;
    const d = shown.def, app = $('app').getBoundingClientRect(), W = app.width, H = app.height;
    const dim = d.dim !== false, k = kindOf(d);
    const bt = $('tut-bt'), bb = $('tut-bb'), bl = $('tut-bl'), br = $('tut-br'), ring = $('tut-ring'), sh = $('tut-shield');
    const setB = (el, l, t, w, h) => { el.style.left = l + 'px'; el.style.top = t + 'px'; el.style.width = Math.max(0, w) + 'px'; el.style.height = Math.max(0, h) + 'px'; el.style.display = (w > 0 && h > 0) ? 'block' : 'none'; };
    let hole = null;
    if (d.target) { const r = rectOf(d.target); if (r) { const P = Math.max(5, W * 0.012); hole = { l: Math.max(0, r.l - app.left - P), t: Math.max(0, r.t - app.top - P), w: 0, h: 0 }; hole.w = Math.min(W - hole.l, r.w + P * 2); hole.h = Math.min(H - hole.t, r.h + P * 2); } }
    shown.hasHole = !!hole;
    if (!dim) { [bt, bb, bl, br].forEach(b => { b.style.display = 'none'; }); ring.style.display = 'none'; sh.style.display = 'none'; }
    else if (hole) {
      setB(bt, 0, 0, W, hole.t); setB(bb, 0, hole.t + hole.h, W, H - (hole.t + hole.h)); setB(bl, 0, hole.t, hole.l, hole.h); setB(br, hole.l + hole.w, hole.t, W - (hole.l + hole.w), hole.h);
      ring.style.display = 'block'; ring.style.left = hole.l + 'px'; ring.style.top = hole.t + 'px'; ring.style.width = hole.w + 'px'; ring.style.height = hole.h + 'px';
      if (k === 'do') sh.style.display = 'none';                    // 직접 해 보는 단계 = 구멍을 열어 둔다
      else { sh.style.display = 'block'; sh.style.left = hole.l + 'px'; sh.style.top = hole.t + 'px'; sh.style.width = hole.w + 'px'; sh.style.height = hole.h + 'px'; }   // 설명 단계 = 투명 덮개로 실수 터치 방지
    } else { setB(bt, 0, 0, W, H); [bb, bl, br].forEach(b => { b.style.display = 'none'; }); ring.style.display = 'none'; sh.style.display = 'none'; }
    // 말풍선 위치: 대상이 아래쪽이면 위에, 위쪽이면 아래에, 대상이 없으면 가운데
    const dlg = $('tut-dlg'), cy = hole ? hole.t + hole.h / 2 : H / 2, pos = d.dlg || (!dim ? 'top' : (!hole ? 'mid' : (cy > H * 0.52 ? 'top' : 'bottom')));
    dlg.style.top = 'auto'; dlg.style.bottom = 'auto'; dlg.style.transform = 'translateX(-50%)';
    if (pos === 'top') dlg.style.top = (W * 0.03) + 'px';
    else if (pos === 'bottom') dlg.style.bottom = (W * 0.03) + 'px';
    else { dlg.style.top = '50%'; dlg.style.transform = 'translate(-50%,-50%)'; }
    placeHand(d, app);
  }

  // 끌기·조준 시범 손가락(from → to 를 되풀이)
  function placeHand(d, app) {
    const el = $('tut-hand'); if (!el) return;
    let h = null; try { h = d.hand ? d.hand() : null; } catch (e) { h = null; }
    const a = h && center(h.from), b = h && center(h.to);
    if (!a || !b || (d.dim === false)) { el.style.display = 'none'; if (handAnim) { try { handAnim.cancel(); } catch (_) {} handAnim = null; } handSig = ''; return; }
    const sig = [a.x, a.y, b.x, b.y].map(Math.round).join(',');
    el.style.display = 'block';
    if (sig === handSig) return; handSig = sig;
    if (handAnim) { try { handAnim.cancel(); } catch (_) {} }
    const x0 = a.x - app.left, y0 = a.y - app.top, x1 = b.x - app.left, y1 = b.y - app.top;
    try { handAnim = el.animate([{ transform: 'translate(' + x0 + 'px,' + y0 + 'px) scale(1)', opacity: 0 }, { transform: 'translate(' + x0 + 'px,' + y0 + 'px) scale(.86)', opacity: 1, offset: .15 },
      { transform: 'translate(' + x1 + 'px,' + y1 + 'px) scale(.86)', opacity: 1, offset: .75 }, { transform: 'translate(' + x1 + 'px,' + y1 + 'px) scale(1)', opacity: 0 }], { duration: 1700, iterations: Infinity, easing: 'ease-in-out' }); } catch (e) {}
  }

  function show(d) {
    build();
    if (!shown || shown.def !== d) { shown = memo[d.id] && memo[d.id].def === d ? memo[d.id] : { def: d, page: 0, since: Date.now(), fallback: false, sig: '' }; memo[d.id] = shown; shown.sig = ''; }
    // 직접 해 보는 단계인데 대상이 오래 안 보이거나(없음) 너무 오래 걸리면 [넘어가기]를 열어 둔다(막히지 않게)
    if (kindOf(d) === 'do' && !shown.fallback) {
      const missing = d.target && !rectOf(d.target);
      if (missing) shown.miss = shown.miss || Date.now(); else shown.miss = 0;
      if ((shown.miss && Date.now() - shown.miss > 1200) || Date.now() - shown.since > 14000) shown.fallback = true;
    }
    renderDialog();
    $('tut').classList.add('show');
    place();
    window.__tutPause = !!(d.pause && combatOn());
    if (!raf) { const loop = () => { raf = 0; if (shown) { place(); raf = requestAnimationFrame(loop); } }; raf = requestAnimationFrame(loop); }
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
    entered = null;
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
    persist(); active = null; entered = null; closeSkip(); hide();
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
    entered = null; active = null; Object.keys(memo).forEach(k => delete memo[k]); T.placeFrom = 0; T.fought = false;
    persist(); hide(); setTimeout(tick, 30);
  }
  // 새 계정의 첫 진입(타이틀 탭) — 튜토리얼 전투부터 시작해야 하는가. 그렇다면 1챕터를 처음부터 다시 시작시킨다
  function battleDue() {
    if (disabled) return false;
    const t = tut(); if (!t || (t.v || 1) < 2 || t.done || t.battle || t.review) return false;
    t.at = TOUR[0].id; entered = null; T.fought = false; persist(); return true;
  }

  // 투어: 이번에 띄울 단계(없으면 null)
  function tourStep(t) {
    for (let guard = 0; guard < 14; guard++) {
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
        entered = s.id; enteredAt = Date.now();
        if (s.onEnter) { try { s.onEnter(); } catch (e) {} }
        if (s.skip && s.skip()) { tourAdvance(); continue; }
        if (s.target) { try { const el = typeof s.target === 'function' ? s.target() : s.target; if (el && el.scrollIntoView && !Array.isArray(el)) el.scrollIntoView({ block: 'nearest' }); } catch (e) {} }
      }
      if (s.done && s.done()) { tourAdvance(); continue; }
      if (s.tab && !tabOn(s.tab) && !anyOtherModal('')) goTab(s.tab);       // 새로고침 등으로 탭이 달라졌으면 이 단계가 필요로 하는 탭으로 데려간다
      if (s.ready && !s.ready()) return null;
      return s;
    }
    return null;
  }

  function pick() {
    const t = tut(); if (!t) return null;
    if (!t.done) return tourStep(t);
    if (!t.offered) return lobbyOn() ? OFFER : null;
    if (active && !t.seen[active.id]) { if (ctxOk(active)) return active; return null; }   // 이미 뜬 팁은 닫을 때까지 유지
    active = null;
    if (Date.now() - (T.lastTipAt || 0) < TIP_GAP) return null;                            // 한 번에 하나 — 방금 본 팁과 20초는 간격을 둔다
    for (const d of TIPS) { if (t.seen[d.id] || !ctxOk(d)) continue; let ok = false; try { ok = !!d.when(); } catch (e) { ok = false; } if (ok) { active = d; return d; } }
    return null;
  }
  const ctxOk = (d) => d.ctx === 'run' ? combatOn() : lobbyOn();
  const OFFER = { id: 'offer', ctx: 'lobby', kind: 'offer', msg: '새 <b>튜토리얼</b>이 생겼어요! <b>3챕터</b>로 짧게 안내해 드릴까요?' };
  TIPS.forEach(d => { d.tip = true; });

  function tick() {
    if (disabled) { if (built) hide(); return; }
    try {
      const t = tut(); if (!t || !meta()) return;
      if (T.skipOpen) { window.__tutPause = combatOn(); return; }     // 건너뛰기 확인 팝업이 떠 있는 동안은 아무것도 바꾸지 않는다
      if (loginOn() || (!lobbyOn() && !combatOn())) { hide(); return; }
      const d = pick();
      if (!d) { hide(); return; }
      if (anyOtherModal(d.modal)) { hide(); return; }               // 안내와 상관없는 팝업이 열려 있으면 잠시 숨김(진행은 유지)
      if (d.modal && !vis(d.modal)) { hide(); return; }
      show(d);
    } catch (e) { console.error('[tutorial]', e); disabled = true; try { hide(); } catch (_) {} }
  }
  setInterval(tick, 250);

  // ═════════ 공개 ═════════
  return {
    event(name) { if (disabled) return; setTimeout(tick, 0); },     // 게임에서 알리는 순간(예: 전투 phase 진입·튜토리얼 전투 승리) — 바로 다시 판단
    replay, skip: openSkip, tick, battleDue,
    get disabled() { return disabled; }, set disabled(v) { disabled = !!v; if (disabled) hide(); },
    debug: { TOUR, TIPS, tut, goto(id) { const t = tut(); t.done = false; t.review = 0; t.at = id; entered = null; persist(); tick(); }, active: () => (shown ? shown.def.id : null), state: () => JSON.parse(JSON.stringify(tut())) }
  };
})();
