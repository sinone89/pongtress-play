'use strict';
/* PONGTRESS 튜토리얼 — 스틸앤샷(steal-and-shot) 방식
 *  · 가이드 캐릭터(루비)가 말풍선으로 안내하고, 짚는 곳만 밝게 남기는 스포트라이트(어두운 막 4장 + 빛나는 테두리)로 엉뚱한 곳을 못 누르게 한다.
 *  · 카드는 두 종류: 'next'(설명 — [다음] 버튼) / 'do'(직접 해 보기 — 표시된 곳을 누르면 조건을 감지해 자동으로 넘어감).
 *  · ① TOUR = 온보딩: 로비 5탭 → 첫 출격 → 첫 전투의 장전·전투까지 순서대로 이끈다(새 계정은 자동 시작).
 *    ② TIPS = 처음 만났을 때 한 번: 스킬·레벨 업 보상·모듈·상점·정비·정예·보스·적 간섭·결과·일일/무한 모드 …  → 모든 콘텐츠를 한 번씩 알려 준다.
 *  · 진행·본 안내는 계정 세이브(Meta.state.tut = { at, done, offered, seen })에 저장 → 새로고침해도 이어진다. 건너뛰기·다시 보기(계정 메뉴/치트) 지원.
 *  · 전투 중 설명 카드는 게임을 멈춘다(window.__tutPause 를 game.js 루프가 본다).
 *  · ?sim=1(헤드리스 시뮬)·?notut 에서는 꺼진다.
 * 로드 순서: audio → spritemeta → content → meta → game → tutorial.
 */
const Tutorial = (function () {
  const $ = (id) => document.getElementById(id);
  const qs = new URLSearchParams(location.search);
  let disabled = qs.has('sim') || qs.has('notut');
  const GUIDE = { id: 'knight', name: '루비' };
  const REWARD = { gems: 200, gold: 300 };                      // 투어 완료 선물

  // ═════════ 상태·조회 도우미 ═════════
  const meta = () => (typeof Meta !== 'undefined' ? Meta : null);
  function tut() {
    const m = meta() && meta().state; if (!m) return null;
    if (!m.tut || typeof m.tut !== 'object') m.tut = { v: 1, at: 'welcome', done: true, offered: false, seen: {} };   // 방어: 기존 계정 취급
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
  const modeOn = (m) => !!q('#mode-select .sns-tab.on[data-mode="' + m + '"]');
  const partyCount = () => document.querySelectorAll('#lane-slots .lane-slot.on').length;
  const launched = () => { const s = run(); return s ? (s.launchedThisTurn || 0) : 0; };
  // 장전 화면이 자리 잡았는가(전투→장전 전환 보간이 끝나고 지도·모달이 없음)
  const loadReady = () => { const s = run(); return !!s && s.phase === 'load' && (s.layoutT || 0) < 0.05 && combatOn() && !vis('map') && !vis('reward') && !vis('run-modal') && !vis('result'); };

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
  // 특정 종류 페그 하나 둘레(없으면 null)
  function pegRect(types) {
    const g = game(), s = run(), cv = $('stage'); if (!g || !s || !cv || !s.pegs) return null;
    for (const ty of types) {
      const p = s.pegs.find(x => x.alive && x.type === ty && !x.temp); if (!p) continue;
      const L = g.layout().pins, c = cv.getBoundingClientRect(), k = cv.clientWidth ? c.width / cv.clientWidth : 1, R = (p.pr || 9) * 2.4 * k;
      return { l: c.left + (L.x + p.fx * L.w) * k - R, t: c.top + (L.y + p.fy * L.h) * k - R, w: R * 2, h: R * 2 };
    }
    return null;
  }
  const center = (t) => { const r = rectOf(t); return r ? { x: r.l + r.w / 2, y: r.t + r.h / 2 } : null; };

  // ═════════ 문구 치환: {gold} {mats} {gems} {docs} {shards} → 재화 아이콘, {ic:이름|이모지} → 아이콘 ═════════
  function fmt(s) {
    return String(s == null ? '' : s).replace(/\{(gold|mats|gems|docs|shards)\}|\{ic:(\w+)\|([^}]*)\}/g, (m, cur, name, em) => cur ? uiCur(cur) : ui(name, em));
  }

  // ═════════ TOUR(온보딩) — 단계는 id 로 저장(순서를 바꿔도 진행이 깨지지 않게) ═════════
  // 필드: id · ctx('lobby'|'run') · kind('next'|'do') · msg · target · label(버튼 글자) · tap(힌트) · dim(false=막 없이 말풍선만) · pause(전투 정지)
  //       modal(이 단계에서 열려 있어도 되는 모달 id) · onEnter · skip(진입 시 이미 충족이면 건너뜀) · done(충족되면 자동 진행) · ready(false 면 잠시 숨김) · hand(끌기 시범)
  const TOUR = [
    { id: 'welcome', ctx: 'lobby', kind: 'next', label: '시작하기',
      msg: '어서 오세요, 지휘관님! 저는 <b>루비</b>예요.<br>폭주한 병기군단에 맞서 <b>방벽</b>을 지켜 내는 게임이에요. 필요한 건 제가 하나씩 알려 드릴게요!',
      onEnter: () => goTab('home') },
    { id: 'wallet', ctx: 'lobby', kind: 'next',
      msg: '먼저 위쪽 <b>재화</b>예요.<br>{gold}<b>크레딧</b>은 레벨업, {mats}<b>재료</b>는 승급, {gems}<b>보석</b>은 가챠, {docs}<b>문서</b>는 조각 교환에 써요.',
      target: () => $('lobby-top') },
    { id: 'home', ctx: 'lobby', kind: 'next', tab: 'home',
      msg: '<b>홈</b>에서는 편성한 캐릭터들이 알아서 싸우고 있어요.<br>출격하지 않아도 <b>방치 보상</b>이 쌓이니, 가끔 <b>[받기]</b>로 챙겨 주세요!',
      target: () => $('idle-reward') },
    { id: 'nav-formation', ctx: 'lobby', kind: 'do', tap: '아래 [편성] 탭을 눌러요',
      msg: '이제 <b>편성</b> 탭으로 가 볼까요?',
      target: () => navBtn('formation'), done: () => tabOn('formation') },
    { id: 'lanes', ctx: 'lobby', kind: 'next', tab: 'formation',
      msg: '여기가 <b>3개의 레인</b>이에요. 레인마다 캐릭터 한 명! 레인 <b>색</b>은 전투 때 핀볼 판의 같은 색 <b>포켓</b>과 이어져요.<br>부대 <b>체력의 합</b>이 곧 <b>방벽 HP</b>예요.',
      target: () => $('lane-slots') },
    { id: 'roster', ctx: 'lobby', kind: 'next', tab: 'formation',
      msg: '아래는 <b>보유 캐릭터</b>예요. <b>가로</b>는 클래스 — {ic:cls_gunner|🎯}사수(단일 고화력) · {ic:cls_cannon|💥}포수(광역 타격) · {ic:cls_support|🛠}지원(수리·제어·버프) — <b>세로</b>는 등급(커먼 → 레전더리)이에요.',
      target: () => $('owned-list') },
    { id: 'unplace', ctx: 'lobby', kind: 'do', tab: 'formation', tap: '1레인의 ✕를 눌러요',
      msg: '한번 해 볼게요! 1레인 캐릭터의 <b>✕</b>를 눌러 <b>배치를 해제</b>해 보세요.',
      target: () => q('#lane-slots .ls-x[data-un="0"]'), done: () => !q('#lane-slots .lane-slot[data-slot="0"].on') },
    { id: 'place', ctx: 'lobby', kind: 'do', tab: 'formation', dlg: 'bottom', tap: '카드를 빈 레인으로 끌어다 놓아요',
      msg: '이번엔 아래 목록의 캐릭터를 <b>빈 레인으로 끌어다</b> 놓아 보세요(드래그).<br>카드를 <b>탭</b>해서 상세 화면의 <b>[편성]</b>을 눌러도 돼요.',
      target: () => $('tab-formation'),
      hand: () => ({ from: q('#owned-list .stchar:not(.locked):not(.placed)') || q('#owned-list .stchar:not(.locked)'), to: q('#lane-slots .lane-slot.empty') }),
      onEnter: () => { T.placeFrom = partyCount(); }, done: () => partyCount() > (T.placeFrom || 0) },
    { id: 'detail', ctx: 'lobby', kind: 'do', tab: 'formation', tap: '카드를 눌러요',
      msg: '캐릭터 카드를 <b>탭</b>하면 <b>상세 정보</b>가 열려요. 하나 열어 볼까요?',
      target: () => q('#owned-list .stchar:not(.locked)'), done: () => vis('char-modal') },
    { id: 'detail-stat', ctx: 'lobby', kind: 'next', modal: 'char-modal', skip: () => !vis('char-modal'),
      msg: '<b>레벨업</b>은 {gold}크레딧, <b>승급</b>은 {shards}조각 + {mats}재료가 필요해요. 화살표 오른쪽이 <b>다음 능력치</b> — 승급하면 레벨 상한도 늘어요.',
      target: () => q('#char-modal .cd-statcol') },
    { id: 'detail-skill', ctx: 'lobby', kind: 'next', modal: 'char-modal', skip: () => !vis('char-modal'),
      msg: '<b>액티브 스킬</b>은 전투 중 게이지가 차면 쓰는 필살기, <b>패시브</b>는 늘 걸려 있는 효과로, 주로 핀볼 판을 바꿔 줘요. 누굴 편성하느냐가 곧 <b>내 판</b>을 만들어요!',
      target: () => q('#char-modal .cd-skills') },
    { id: 'detail-close', ctx: 'lobby', kind: 'do', modal: 'char-modal', tap: '[닫기]를 눌러요', skip: () => !vis('char-modal'),
      msg: '<b>편성 / 편성 해제</b>와 좌우 화살표(다른 캐릭터 보기)도 여기서 해요. 다 봤으면 <b>닫기</b>!',
      target: () => q('#char-modal .cd-x'), done: () => !vis('char-modal') },
    { id: 'nav-shop', ctx: 'lobby', kind: 'do', tap: '아래 [상점] 탭을 눌러요',
      msg: '다음은 <b>상점</b>이에요.',
      target: () => navBtn('shop'), done: () => tabOn('shop') },
    { id: 'gacha', ctx: 'lobby', kind: 'do', tab: 'shop', tap: '[단일 무료]를 눌러요', skip: () => !q('[data-gacha="free"]'),
      msg: '<b>가챠</b>로 새 요원을 영입해요! 오늘은 <b>무료 1회</b> — 눌러 보세요.',
      target: () => q('[data-gacha="free"]'), done: () => vis('gacha-modal') },
    { id: 'gacha-result', ctx: 'lobby', kind: 'do', modal: 'gacha-modal', tap: '[확인]을 눌러요', skip: () => !vis('gacha-modal'),
      msg: '새 캐릭터는 <b>NEW</b>! 이미 가진 캐릭터가 나오면 {shards}<b>조각</b>이 쌓여요(승급 재료).<br><b>확인</b>을 눌러 닫아요.',
      target: () => $('gacha-modal-box'), done: () => !vis('gacha-modal') },
    { id: 'shop-more', ctx: 'lobby', kind: 'next', tab: 'shop',
      msg: '<b>문서</b> 탭에서는 {docs}문서로 보유 요원의 <b>조각</b>을 살 수 있어요. ⓘ를 누르면 <b>가챠 확률</b>이 나와요. <b>패키지</b>는 준비 중이에요.',
      target: () => q('.shoptabs') },
    { id: 'nav-mission', ctx: 'lobby', kind: 'do', tap: '아래 [미션] 탭을 눌러요',
      msg: '이번엔 <b>미션</b> 탭이에요.',
      target: () => navBtn('mission'), done: () => tabOn('mission') },
    { id: 'mission', ctx: 'lobby', kind: 'next', tab: 'mission',
      msg: '<b>미션</b>을 달성하면 {gems}보석·{mats}재료 같은 보상을 받아요. 진행도가 가득 차면 <b>[수령]</b>!',
      target: () => $('mission-list') },
    { id: 'nav-sortie', ctx: 'lobby', kind: 'do', tap: '아래 [출격] 탭을 눌러요',
      msg: '마지막으로 <b>출격</b> 탭이에요!',
      target: () => navBtn('sortie'), done: () => tabOn('sortie') },
    { id: 'sortie-mode', ctx: 'lobby', kind: 'next', tab: 'sortie',
      msg: '<b>일반 출격</b>은 스테이지를 깨며 다음 스테이지를 여는 기본 모드, <b>일일 도전</b>은 오늘 고정된 판으로 점수에 도전(첫 클리어 {gems}보너스), <b>무한</b>은 보스를 잡을수록 더 강한 막이 이어져요.',
      target: () => $('mode-select') },
    { id: 'sortie-stage', ctx: 'lobby', kind: 'next', tab: 'sortie',
      msg: '<b>스테이지</b>를 고르면 아래에 <b>나오는 적</b>과 <b>보스</b>, 난이도·보상 배율이 떠요. 클리어하면 다음 스테이지가 열려요.',
      target: () => [$('stage-select'), $('stage-info')] },
    { id: 'sortie-party', ctx: 'lobby', kind: 'next', tab: 'sortie',
      msg: '마지막으로 <b>편성 부대</b>를 확인! 준비됐으면 <b>출격</b>해요.',
      target: () => $('sortie-party') },
    { id: 'go-run', ctx: 'lobby', kind: 'do', tab: 'sortie', tap: '[출격]을 눌러요',
      msg: '<b>출격!</b> 첫 전투를 함께 해 봐요.',
      target: () => $('btn-sortie'), done: () => combatOn() },
    // ── 첫 판(런) ──
    { id: 'map-intro', ctx: 'run', kind: 'next', ready: () => vis('map'),
      msg: '<b>분기 지도</b>예요. 아래에서 위로 올라가며 <b>6층</b>, 꼭대기는 <b>보스</b>! 갈림길에서는 길을 골라 가요.',
      target: () => $('map-body') },
    { id: 'map-nodes', ctx: 'run', kind: 'next', ready: () => vis('map'),
      msg: '{ic:node_battle|💥}<b>전투</b> · {ic:node_elite|💀}<b>정예</b>(강적, 보상↑) · {ic:node_shop|🛒}<b>상점</b> · {ic:node_rest|🔧}<b>정비</b> · {ic:node_boss|👾}<b>보스</b> — 길 위에서 이런 곳을 만나요.',
      target: () => $('map-body') },
    { id: 'pick-node', ctx: 'run', kind: 'do', ready: () => vis('map'), tap: '빛나는 노드를 눌러요',
      msg: '빛나는 노드가 지금 갈 수 있는 곳이에요. <b>첫 전투</b>로 가요!',
      target: () => q('.map-node.reach'), done: () => { const s = run(); return !!s && s.phase === 'load'; } },
    { id: 'load-field', ctx: 'run', kind: 'next', pause: true, ready: loadReady,
      msg: '위쪽은 <b>적 필드</b>예요. 적은 매 턴 <b>한 칸씩</b> 방벽 쪽으로 다가오고, 방벽에 닿으면 <b>방벽 HP</b>가 깎여요.',
      target: () => canvasRect('field') },
    { id: 'load-wall', ctx: 'run', kind: 'next', pause: true, ready: loadReady,
      msg: '여기가 <b>방벽</b>과 우리 캐릭터예요. 방벽 HP가 <b>0이 되면 패배</b>! 초록 막대가 남은 HP예요.',
      target: () => canvasRect('wall') },
    { id: 'load-pockets', ctx: 'run', kind: 'next', pause: true, ready: loadReady,
      msg: '방벽 아래 <b>색 칸</b>이 <b>포켓</b>이에요. 볼이 들어가면 <b>같은 색 레인</b> 캐릭터의 <b>탄환이 충전</b>돼요(◆ 충전 칸 · ✕ 꽝). 좌우로 움직이는 <b>잭팟 칸</b>에 들어가면 ×3!',
      target: () => canvasRect('goal') },
    { id: 'load-board', ctx: 'run', kind: 'next', pause: true, ready: loadReady,
      msg: '아래 <b>핀볼 판</b>에서 볼을 쏘아 포켓을 채워요. 볼은 페그에 맞아 <b>튕기며 위로</b> 올라가요. 색 있는 <b>특수 페그</b>는 맞으면 효과가 있고, 한 턴에 한 번만 터져요.',
      target: () => canvasRect('pins') },
    { id: 'peg-mult', ctx: 'run', kind: 'next', pause: true, ready: loadReady, skip: () => !pegRect(['mult5', 'mult2']),
      msg: '금색 ◆ <b>증식 ×2</b>, 분홍 ★ <b>증식 ×5</b> — 맞히면 볼이 <b>분열</b>해서 포켓을 한꺼번에 채워요!',
      target: () => pegRect(['mult5', 'mult2']) },
    { id: 'peg-other', ctx: 'run', kind: 'next', pause: true, ready: loadReady, skip: () => !pegRect(['charge', 'gold']),
      msg: '초록 ▲ <b>증폭</b>은 충전 ×3 볼, 노란 ⬡ <b>크레딧</b>은 상점에서 쓸 {gold}<b>크레딧</b>을 줘요. 판에 박힌 큰 <b>범퍼</b>는 볼을 세게 튕겨 내요.',
      target: () => pegRect(['charge', 'gold']) },
    { id: 'aim', ctx: 'run', kind: 'do', ready: loadReady, tap: '화면을 눌러 끌어 조준 → 손을 떼면 발사',
      msg: '이제 쏴 볼까요? 판을 <b>누른 채 끌어서 조준</b>하고, 손을 떼면 <b>발사</b>! 점선이 <b>예상 경로</b>예요.',
      target: () => canvasRect('pins'),
      hand: () => { const g = game(), L = g && g.launcher(), P = g && g.layout().pins, cv = $('stage'); if (!L || !cv) return null; const c = cv.getBoundingClientRect(); return { from: { l: c.left + L.x - 2, t: c.top + L.y - 2, w: 4, h: 4 }, to: { l: c.left + P.x + P.w * 0.7 - 2, t: c.top + P.y + P.h * 0.35 - 2, w: 4, h: 4 } }; },
      done: () => launched() >= 1 },
    { id: 'watch', ctx: 'run', kind: 'next', dim: false, label: '알겠어요',
      msg: '맞힌 페그가 늘수록 <b>콤보</b>가 쌓여요! <b>5콤보</b>마다 보너스 충전볼이 생기고, 포켓에 들어가면 +N <b>충전</b>돼요.',
      done: () => { const s = run(); return !s || (s.balls.length === 0 && launched() >= 1) || s.phase !== 'load'; } },
    { id: 'aim2', ctx: 'run', kind: 'do', ready: loadReady, tap: '한 번 더 쏴요',
      msg: '<b>한 발 더!</b> 볼은 한 턴에 기본 <b>2개</b>예요. 이번엔 다른 색 레인을 노려 봐요.',
      target: () => canvasRect('pins'),
      hand: () => { const g = game(), L = g && g.launcher(), P = g && g.layout().pins, cv = $('stage'); if (!L || !cv) return null; const c = cv.getBoundingClientRect(); return { from: { l: c.left + L.x - 2, t: c.top + L.y - 2, w: 4, h: 4 }, to: { l: c.left + P.x + P.w * 0.3 - 2, t: c.top + P.y + P.h * 0.35 - 2, w: 4, h: 4 } }; },
      done: () => { const s = run(); return !s || s.launchesLeft <= 0 || s.phase !== 'load'; } },
    { id: 'battle-intro', ctx: 'run', kind: 'next', pause: true, ready: () => { const s = run(); return !!s && s.phase === 'battle' && !vis('reward'); },
      msg: '<b>전투 시작!</b> 충전된 탄환만큼 캐릭터가 <b>자동으로 사격</b>해요. 표적은 <b>맨 앞 적</b>. 사격이 끝나면 적이 한 칸 전진하고 다시 장전 단계로 돌아가요 — 이걸 반복해 적을 모두 쓰러뜨리면 승리!',
      target: () => [canvasRect('field'), canvasRect('wall')] },
    { id: 'tour-end', ctx: 'run', kind: 'next', pause: true, label: '받기', ready: () => combatOn() && !vis('reward') && !vis('result'),
      msg: '여기까지가 기본이에요! 스킬·레벨 업 보상·모듈·상점·정비·보스는 <b>처음 만날 때마다</b> 제가 알려 드릴게요.<br>작은 선물도 드려요 — {gems}<b>보석 ' + REWARD.gems + '</b> · {gold}<b>크레딧 ' + REWARD.gold + '</b>!' }
  ];
  const T = {};                                                   // 단계 간 임시 값(저장 안 함)
  const tourIdx = (id) => TOUR.findIndex(s => s.id === id);

  // ═════════ TIPS — 처음 만났을 때 한 번(투어가 끝난 뒤 · 안 본 것만 · 조건이 맞으면 뜸) ═════════
  // 필드: id · ctx · when(조건) · msg(문자열/배열(쪽)/함수) · target · modal · pause · label
  const TIPS = [
    // ── 로비 ──
    { id: 'mode.daily', ctx: 'lobby', when: () => tabOn('sortie') && modeOn('daily'), target: () => $('mode-select'),
      msg: '<b>일일 도전</b>은 <b>오늘 하루 고정된 판</b>이에요. 같은 판을 반복해 <b>최고 점수</b>에 도전하고, 오늘 첫 클리어엔 {gems}<b>보석 ' + (typeof MODES !== 'undefined' ? MODES.daily.reward.gems : 40) + '</b>을 줘요.' },
    { id: 'mode.endless', ctx: 'lobby', when: () => tabOn('sortie') && modeOn('endless'), target: () => $('mode-select'),
      msg: '<b>무한 모드</b>는 보스를 쓰러뜨릴 때마다 <b>더 강한 막</b>(적 +35%)이 이어져요. 방벽이 무너질 때까지 간 <b>막·전투 수</b>가 최고 기록이에요.' },
    { id: 'char.promote', ctx: 'lobby', modal: 'char-modal', when: () => vis('char-modal') && !!q('#char-modal .cd-tab.on[data-cdtab="promote"]'), target: () => q('#char-modal .cd-cmp'),
      msg: '<b>승급</b>은 {shards}<b>조각</b>과 {mats}<b>재료</b>로 ★을 올려요. 스탯이 크게 오르고 <b>레벨 상한</b>도 늘어요. 조각은 가챠 중복과 {docs}문서 교환으로 모아요.' },
    { id: 'shop.doc', ctx: 'lobby', when: () => tabOn('shop') && !!q('.shoptabs .sns-tab.on[data-stab="doc"]'), target: () => q('.shoptabs'),
      msg: '<b>문서</b> 탭이에요. 가챠로 얻은 요원의 <b>조각</b>을 {docs}문서로 살 수 있어요(등급이 높을수록 비싸요). 커먼 조각은 가챠 중복으로만 모여요.' },
    { id: 'shop.pkg', ctx: 'lobby', when: () => tabOn('shop') && !!q('.shoptabs .sns-tab.on[data-stab="pkg"]'), target: () => q('.shoptabs'),
      msg: '<b>패키지</b>는 아직 준비 중이에요. 곧 보석 패키지와 주간 패스가 열려요!' },
    { id: 'mission.claim', ctx: 'lobby', when: () => tabOn('mission') && !!q('#mission-list [data-mission]:not([disabled])'), target: () => q('#mission-list [data-mission]:not([disabled])'),
      msg: '달성한 미션이 있어요! <b>[수령]</b>을 눌러 보상을 받아요.' },
    // ── 런 ──
    { id: 'skill', ctx: 'run', pause: true,
      when: () => { const s = run(); return !!s && s.phase === 'load' && loadReady() && s.chars.some(c => c.gauge >= c.ref.active.gauge) && vis('battle-side'); },
      target: () => $('battle-side'),
      msg: ['<b>스킬 게이지</b>가 찼어요! 오른쪽 <b>스킬 버튼</b>을 눌러 두면 이번 전투에 <b>발동</b>해요(직접 켜면 피해 +20%). 게이지는 턴을 넘겨 쌓이고, 쓰면 0이 돼요.',
            '<b>[스킬 자동]</b>을 켜면 게이지가 찰 때마다 알아서 쓰고, <b>[전투 자동]</b>은 볼 발사까지 맡겨요. 손이 바쁠 때 켜 두세요.'] },
    { id: 'lvl.relic', ctx: 'run', modal: 'reward', when: () => vis('reward') && !!q('#reward-choices .relic-card'), target: () => q('#reward .modal-box'),
      msg: () => {
        const t = ($('reward-title') && $('reward-title').textContent) || '';
        const first = /레벨/.test(t)
          ? '<b>레벨 업!</b> 적을 쓰러뜨려 위쪽 경험치 바가 차면 레벨이 올라요. 올릴 때마다 보상을 <b>3개 중 1개</b> — <b>짝수 레벨</b>은 <b>모듈</b>, <b>홀수 레벨</b>은 <b>스탯 강화</b>예요.'
          : '<b>전투 승리!</b> 전투를 클리어하면 <b>모듈</b>을 <b>3개 중 1개</b> 받아요. 이미 가진 모듈의 <b>개량</b> 후보가 한 칸 들어 있어요.';
        return [first, '<b>모듈</b>은 이번 판 동안만 쓰는 특수 장비예요. {ic:tag_precision|🎯}정밀 · {ic:tag_explosive|💥}폭발 · {ic:tag_guard|🛡}방호 · {ic:tag_pinball|🟣}핀볼 · {ic:tag_harvest|📦}보급 — 같은 <b>태그 3개</b>를 모으면 <b>세트 보너스</b>! 같은 모듈을 또 고르면 ★<b>개량</b>(Lv2)돼요.'];
      } },
    { id: 'lvl.stat', ctx: 'run', modal: 'reward', when: () => vis('reward') && !q('#reward-choices .relic-card') && !!q('#reward-choices .reward-card'), target: () => q('#reward .modal-box'),
      msg: '홀수 레벨은 <b>스탯 강화</b> 보상이에요. {ic:rw_atk|🔩}화력 · {ic:rw_maxhp|🧱}방벽 HP · {ic:rw_ball|➕}장전 볼 +1 · {ic:rw_heal|🔧}수리 중 <b>하나</b>를 골라요. 이번 판 동안 유지돼요.' },
    { id: 'relic.bar', ctx: 'run',
      when: () => { const s = run(); return !!s && combatOn() && Object.keys(s.relics || {}).length > 0 && !vis('reward') && !vis('run-modal') && !vis('result') && (vis('map') || loadReady()); },
      target: () => vis('map') ? $('map-relics') : $('relic-bar'),
      msg: '위쪽에 <b>모은 모듈</b>이 표시돼요. 탭하면 <b>설명</b>과 <b>세트 진행도</b>를 볼 수 있어요.' },
    { id: 'node.shop', ctx: 'run', modal: 'run-modal', when: () => vis('run-modal') && !!q('#run-modal-box [data-buy]'), target: () => $('run-modal-box'),
      msg: '{ic:node_shop|🛒}<b>상점</b>이에요. 판에서 모은 {gold}<b>크레딧</b>으로 <b>모듈</b>(가진 건 개량)이나 <b>방벽 수리</b>를 살 수 있어요. 쓴 크레딧은 정산에서 빠지니 고민해 보세요. 안 사도 <b>[떠나기]</b>!' },
    { id: 'node.rest', ctx: 'run', modal: 'run-modal', when: () => vis('run-modal') && !!q('#run-modal-box [data-rest]'), target: () => $('run-modal-box'),
      msg: '{ic:node_rest|🔧}<b>정비</b>예요. <b>수리</b>(방벽 HP 40% 회복)와 <b>개량</b>(가진 모듈 1개를 Lv2로) 중 <b>하나</b>만 고를 수 있어요.' },
    { id: 'node.elite', ctx: 'run', pause: true,
      when: () => { const s = run(); return !!s && !!s.combat && !!s.combat.elite && loadReady(); }, target: () => canvasRect('field'),
      msg: '{ic:node_elite|💀}<b>정예</b> 전투예요! 체력·공격이 센 <b>정예 적</b>(황금빛 오라)이 섞여 있어요. 쓰러뜨리면 경험치가 크고 보상도 커요.' },
    { id: 'node.boss', ctx: 'run', pause: true,
      when: () => { const s = run(); return !!s && !!s.combat && !!s.combat.boss && loadReady(); }, target: () => canvasRect('field'),
      msg: ['{ic:node_boss|👾}<b>보스</b>예요! 체력이 매우 높고 <b>예고 패턴</b>이 있어요. 보스 곁의 알약에 패턴까지 <b>남은 턴</b>이 떠요.',
            '그 턴이 0이 되기 전에 <b>기절</b> 스킬로 보스를 묶으면 패턴이 <b>취소</b>(저지)돼요! 타이탄은 돌격, 스웜 코어는 분리, 드론 모함은 증원을 해요.'] },
    { id: 'board.interfere', ctx: 'run', pause: true,
      when: () => { const s = run(), g = game(); return !!s && !!g && loadReady() && g.anim.floats.some(f => f.note && /교란|오염|파편/.test(f.text)); }, target: () => canvasRect('pins'),
      msg: '적이 <b>판에 간섭</b>해요! 해킹드론은 특수 페그를 <b>교란</b>(일반 페그로), 슬러지는 <b>오염 페그</b>(볼을 삼킴), 헤비아머는 <b>파편 페그</b>(반사만)를 뿌려요. 이런 적을 먼저 쓰러뜨리면 판이 깨끗해져요.' },
    { id: 'result', ctx: 'run', modal: 'result', when: () => vis('result'), target: () => $('result-box'),
      msg: () => ($('result-box') && $('result-box').classList.contains('win'))
        ? '<b>승리!</b> 처치·콤보·점수와 얻은 {gold}{mats}{gems}{docs}가 정리돼요. 스테이지를 <b>처음 클리어</b>하면 <b>다음 스테이지</b>와 <b>새 모듈</b>이 해금돼요.'
        : '<b>결과</b>예요. 쓰러져도 지금까지 모은 보상은 받아요({gems}보석은 클리어할 때만). 캐릭터를 키우고 다시 도전해요!' }
  ];

  // ═════════ 카드 화면(스포트라이트 + 말풍선) ═════════
  let built = false, active = null, entered = null, enteredAt = 0, shown = null, skipReadyAt = 0, handSig = '', handAnim = null, raf = 0;
  const memo = {};                                                // 카드별 표시 상태(쪽 번호 등) — 잠깐 숨었다 돌아와도 유지

  function build() {
    if (built) return; built = true;
    const d = document.createElement('div'); d.id = 'tut';
    d.innerHTML = '<div class="tut-block" id="tut-bt"></div><div class="tut-block" id="tut-bb"></div><div class="tut-block" id="tut-bl"></div><div class="tut-block" id="tut-br"></div>'
      + '<div id="tut-shield"></div><div id="tut-ring"></div><div id="tut-hand"></div>'
      + '<div class="tut-dlg" id="tut-dlg"><div class="tut-por" id="tut-por"></div><div class="tut-body"><div class="tut-name">' + GUIDE.name + '</div>'
      + '<div class="tut-msg" id="tut-msg"></div><div class="tut-tap" id="tut-tap"></div><div class="tut-row" id="tut-row"></div></div></div>';
    $('app').appendChild(d);
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
    const sig = d.id + '|' + pi + '|' + k + '|' + (shown.fallback ? 1 : 0) + '|' + (shown.confirm ? 1 : 0);
    if (shown.sig === sig) return;
    shown.sig = sig;
    $('tut-msg').innerHTML = fmt(pages[pi]);
    const doTap = (k === 'do' && !shown.fallback);
    $('tut-tap').textContent = doTap ? (d.tap || '표시된 곳을 눌러요') : '';
    $('tut-tap').style.display = doTap ? 'block' : 'none';
    let btns = '';
    if (shown.confirm) {
      btns = '<span class="tut-ask">튜토리얼을 건너뛸까요? 계정 메뉴에서 다시 볼 수 있어요.</span><button class="tut-skip" data-a="keep">계속 볼게요</button><button class="tut-next" data-a="skip">건너뛰기</button>';
    } else if (k === 'offer') {
      btns = '<button class="tut-skip" data-a="no">괜찮아요</button><button class="tut-next" data-a="yes">볼래요</button>';
    } else {
      const last = pi >= pages.length - 1, canNext = (k === 'next' || k === 'tip' || shown.fallback);
      if (!isTip(d) && k !== 'offer') btns += '<button class="tut-skip" data-a="ask" id="tut-skipbtn">건너뛰기</button>';
      if (canNext) btns += '<button class="tut-next" data-a="next">' + (last ? (shown.fallback ? '넘어가기' : (d.label || (k === 'tip' ? '알겠어요' : '다음'))) : '다음') + '</button>';
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
    else if (a === 'ask') { if (Date.now() < skipReadyAt) return; shown.confirm = true; renderDialog(); }
    else if (a === 'keep') { shown.confirm = false; renderDialog(); }
    else if (a === 'skip') skipAll();
    else if (a === 'yes') replay();
    else if (a === 'no') declineOffer();
  }

  // [다음] — 쪽이 남았으면 다음 쪽, 마지막이면 카드 종료(투어는 단계 이동, 팁은 '봄' 처리)
  function cardNext() {
    if (!shown) return;
    const d = shown.def, pages = pagesOf(d);
    if (shown.page < pages.length - 1) { shown.page++; memo[d.id] = shown; renderDialog(); return; }
    if (isTip(d)) { const t = tut(); t.seen[d.id] = true; persist(); active = null; hide(); }
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
    if (!shown || shown.def !== d) { shown = memo[d.id] && memo[d.id].def === d ? memo[d.id] : { def: d, page: 0, since: Date.now(), fallback: false, confirm: false, sig: '' }; memo[d.id] = shown; shown.sig = ''; }
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

  // ═════════ 진행 로직 ═════════
  function anyOtherModal(allow) {
    const ms = document.querySelectorAll('.modal'); for (const m of ms) { if (m.getClientRects().length > 0 && m.id !== allow) return true; } return false;
  }
  function rewind(s) { const t = tut(); t.at = 'nav-sortie'; entered = null; persist(); }
  function tourAdvance() {
    const t = tut(); const i = tourIdx(t.at), s = TOUR[i];
    if (s && s.onLeave) { try { s.onLeave(); } catch (e) {} }
    entered = null;
    if (i + 1 >= TOUR.length) { finishTour(); return; }
    t.at = TOUR[i + 1].id; persist();
  }
  function finishTour() {
    const t = tut(), m = meta() && meta().state;
    t.done = true; t.at = TOUR[0].id;
    if (!t.rewarded && m) { t.rewarded = true; m.currencies.gems += REWARD.gems; m.currencies.gold += REWARD.gold; }
    persist(); try { meta().renderLobby(); } catch (e) {}
  }
  function markAllSeen() { const t = tut(); TIPS.forEach(d => { t.seen[d.id] = true; }); }
  function skipAll() { const t = tut(); t.done = true; t.offered = true; markAllSeen(); persist(); active = null; entered = null; hide(); }
  function declineOffer() { const t = tut(); t.offered = true; markAllSeen(); persist(); active = null; hide(); }
  function replay() {
    const t = tut(); if (!t) return;
    t.done = false; t.offered = true; t.at = TOUR[0].id; t.seen = {};
    entered = null; active = null; Object.keys(memo).forEach(k => delete memo[k]); T.placeFrom = 0;
    persist(); hide(); setTimeout(tick, 30);
  }

  // 투어: 이번에 띄울 단계(없으면 null)
  function tourStep(t) {
    for (let guard = 0; guard < 14; guard++) {
      let i = tourIdx(t.at); if (i < 0) { t.at = TOUR[0].id; i = 0; persist(); }
      const s = TOUR[i];
      if (s.ctx === 'run') { if (!combatOn()) { if (lobbyOn()) { rewind(s); continue; } return null; } }   // 런 단계인데 로비 → 출격 탭부터 다시
      else if (!lobbyOn()) {                                                                              // 로비 단계인데 로비가 안 보임(전투 화면 등)
        if (entered === s.id && s.done && s.done()) { tourAdvance(); continue; }                          // 이미 보여 준 단계의 완료 조건이 충족(예: 출격 눌러 전투 화면) → 진행
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
    for (const d of TIPS) { if (t.seen[d.id] || !ctxOk(d)) continue; let ok = false; try { ok = !!d.when(); } catch (e) { ok = false; } if (ok) { active = d; return d; } }
    return null;
  }
  const ctxOk = (d) => d.ctx === 'run' ? combatOn() : lobbyOn();
  const OFFER = { id: 'offer', ctx: 'lobby', kind: 'offer', msg: '새로 <b>튜토리얼</b>이 생겼어요! 게임 내용을 처음부터 한 번씩 짚어 드릴까요?' };
  TIPS.forEach(d => { d.tip = true; });

  function tick() {
    if (disabled) { if (built) hide(); return; }
    try {
      const t = tut(); if (!t || !meta()) return;
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
    event(name) { if (disabled) return; setTimeout(tick, 0); },     // 게임에서 알리는 순간(예: 전투 phase 진입) — 바로 다시 판단
    replay, skip: skipAll, tick,
    get disabled() { return disabled; }, set disabled(v) { disabled = !!v; if (disabled) hide(); },
    debug: { TOUR, TIPS, tut, goto(id) { const t = tut(); t.done = false; t.at = id; entered = null; persist(); tick(); }, active: () => (shown ? shown.def.id : null), state: () => JSON.parse(JSON.stringify(tut())) }
  };
})();
