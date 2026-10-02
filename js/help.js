'use strict';
/* PONGTRESS 도움말 — 튜토리얼을 놓쳤거나 잊은 사람이 게임 정보를 다시 찾아보는 팝업(주제별 탭).
 *  · 여는 곳: 로비 상단·전투 헤더·분기 지도 머리말의 ? 버튼. 문서 위임이라 [data-help] 요소는 어디에 있든 누르면 열린다
 *    (값이 open 이면 상황에 맞는 주제부터, 주제 id 면 그 주제부터).
 *  · 열 때 상황에 맞는 주제를 먼저 보여 준다(지도 화면 → 지도·보상, 장전 → 핀볼 판, 전투 → 전투, 로비 탭별 …).
 *  · 내용은 content.js 상수(PEG_TYPES·RELICS·ENEMIES·BOSSES·GACHA·MODES …)에서 읽어 온다 → 수치가 바뀌어도 어긋나지 않고, 여기선 문구만 쓴다.
 *  · 런 중에 열면 게임이 멈춘다(window.__helpPause — game.js 루프가 본다). 닫으면 이어진다.
 *  · Help 는 최상위 const 라 window.Help 로는 안 보인다 — 다른 스크립트에서는 typeof Help !== 'undefined' 로 확인.
 * 로드 순서: audio → spritemeta → content → meta → game → tutorial → help.
 */
const Help = (function () {
  const $ = (id) => document.getElementById(id);
  const vis = (id) => { const e = $(id); return !!e && e.getClientRects().length > 0; };
  let built = false, cur = 'basic';

  // ═════════ 조각 HTML 도우미 ═════════
  const H = (t) => '<div class="hp-h">' + t + '</div>';
  const P = (t) => '<p class="hp-p">' + t + '</p>';
  const TIP = (t) => '<div class="hp-tip"><i>팁</i><span>' + t + '</span></div>';
  const ROW = (ic, nm, ds, cls) => '<div class="hp-row' + (cls ? ' ' + cls : '') + '"><div class="hp-ic">' + ic + '</div><div class="hp-tx"><div class="hp-nm">' + nm + '</div>' + (ds ? '<div class="hp-ds">' + ds + '</div>' : '') + '</div></div>';
  const STEPS = (a) => '<ol class="hp-steps">' + a.map((s) => '<li>' + s + '</li>').join('') + '</ol>';
  const LINK = (topic, t) => '<button class="hp-link" data-topic="' + topic + '">' + t + ' ›</button>';
  const big = (name, emoji) => uiIcon(name, emoji, 'width:100%;height:100%');                  // 아이콘 박스를 가득 채우는 UI 아이콘(이미지 없으면 이모지)
  const pegImg = (file) => '<img src="assets/peg/' + file + '.png" alt="" draggable="false" onerror="this.remove()">';
  const spr = (key, boss) => '<i class="hp-spr" style="background-image:url(' + enemyUrl(key) + ');background-size:' + (boss ? '400% 200%' : '400% 100%') + '"></i>';   // 적·보스 시트의 첫 프레임
  const gl = (txt, c) => '<span class="hp-gl" style="--c:' + c + '">' + txt + '</span>';
  const cost = (o) => Object.keys(o).map((k) => uiCur(k) + o[k]).join(' ');
  const pct = (x) => Math.round(x * 100);
  const num = (n) => Number(n).toLocaleString('ko-KR');

  // ═════════ 주제 ═════════
  function tBasic() {
    return P('<b>폭주한 병기군단</b>이 <b>방벽</b>으로 몰려와요. 핀볼로 동료의 <b>탄환을 충전</b>하고, 그 탄환으로 적을 쓰러뜨려 <b>보스</b>를 돌파하면 승리! 방벽 HP가 <b>0이 되면 패배</b>예요.')
      + H('한 런의 흐름')
      + STEPS([
        '<b>출격</b> 탭에서 스테이지와 편성 부대를 확인하고 출격해요.',
        '<b>분기 지도</b>(' + MAP_CFG.floors + '층)에서 갈 노드를 골라요. 맨 위는 보스예요.',
        '전투는 <b>장전 → 전투</b>를 적이 모두 쓰러질 때까지 되풀이해요.',
        '이기면 <b>모듈</b>을 하나 받고 지도로 돌아와요. 레벨이 오를 때도 보상이 있어요.',
        '보스를 쓰러뜨리면 클리어! 처음 클리어한 스테이지는 다음 스테이지와 새 모듈이 열려요.'
      ])
      + H('장전과 전투')
      + ROW(pegImg('peg_normal'), '장전 단계', '핀볼 판에 볼을 쏴서(기본 ' + CFG.launchesPerTurn + '발) 위쪽 <b>포켓</b>을 채워요. 포켓에 닿은 볼은 같은 색 레인 동료의 <b>탄환</b>이 돼요.')
      + ROW(big('ic_battle', '💥'), '전투 단계', '충전된 탄환만큼 동료가 <b>자동으로 사격</b>해요. 표적은 맨 앞 적! 끝나면 적이 한 칸 전진하고 다시 장전으로 돌아가요.')
      + ROW(big('stat_hp', '🛡'), '방벽 HP', '편성한 동료 <b>체력의 합</b>이에요. 적이 방벽에 닿으면 깎이고, 0이 되면 패배해요.')
      + TIP('주제 탭을 눌러 핀볼 판·전투·모듈·적·동료·재화·모드를 자세히 볼 수 있어요.');
  }

  const PEG_ORDER = ['normal', 'mult2', 'mult5', 'charge', 'gold', 'bomb', 'bumper', 'scrap', 'sludge'];
  const PEG_DESC = {
    normal: () => '맞으면 터져서 <b>충전볼 1개</b>가 돼요. 판의 대부분이 이 페그예요.',
    mult2: () => '충전볼이 <b>' + (1 + PEG_TYPES.mult2.split) + '개</b>로 늘어나요.',
    mult5: () => '충전볼이 <b>' + (1 + PEG_TYPES.mult5.split) + '개</b>로 늘어나요!',
    charge: () => '<b>충전 ×' + PEG_TYPES.charge.charge + '</b> 볼 1개 — 한 번에 탄환을 많이 채워요.',
    gold: () => '충전볼과 함께 <b>크레딧 ' + PEG_TYPES.gold.gold + '</b>' + eulReul(PEG_TYPES.gold.gold) + ' 줘요(상점에서 써요).',
    bomb: () => '맞으면 <b>주변 페그를 연쇄로 터뜨려요</b>. 스킬을 쓴 다음 판에 생겨요.',
    bumper: () => '볼을 <b>세게 튕겨 내요</b>. 사라지지 않고 콤보도 올리지 않아요. 기절 스킬 등으로 생겨요.',
    scrap: () => '볼을 튕기기만 해요(효과 없음). 헤비아머가 뿌려요.',
    sludge: () => '닿은 볼을 <b>삼켜 버려요</b>(충전 없음). 슬러지가 뿌려요.'
  };
  function tBoard() {
    let pegs = '';
    PEG_ORDER.forEach((k) => { pegs += ROW(pegImg('peg_' + k), PEG_TYPES[k].name, PEG_DESC[k]()); });
    return H('조준·발사')
      + P('판을 <b>누른 채 끌어서 조준</b>하고, 손을 떼면 <b>발사</b>해요. <b>점선</b>은 볼이 갈 길을 처음 3번 튕기는 곳까지 그대로 보여 줘요(하얀 <b>고리</b>는 부딪힐 페그, 끝까지 닿으면 도착할 칸에 하얀 테두리가 켜져요). 볼은 장전마다 기본 <b>' + CFG.launchesPerTurn + '발</b>이고, 탄창 증설이나 패시브로 늘어나요.')
      + P('볼은 페그에 맞아 튕기며 위로 올라가요. 위쪽 <b>포켓</b>에 닿으면 충전되고(발사한 볼은 +1), 맞힌 페그는 <b>충전볼</b>이 되어 함께 올라가요. 터진 페그는 <b>다음 장전에 되살아나요</b>.')
      + H('페그')
      + pegs
      + H('장애물')
      + ROW(pegImg('obst_bumper'), '고정 범퍼', '판에 박힌 큰 장애물. 볼을 <b>세게 튕겨요</b>(속도 ×1.25). 사라지지 않아요.')
      + ROW(pegImg('obst_pillar'), '기둥', '볼을 단단하게 튕겨 내요. 사라지지 않아요. 둘 다 콤보에는 안 들어가요.')
      + H('포켓')
      + P('판 위쪽 9칸이 포켓이에요. 레인마다 3칸이고, 그 레인 동료의 <b>골칸</b> 수만큼이 충전 칸이에요.')
      + ROW(gl('◆', '#46e6d0'), '충전 칸', '들어간 볼이 그 레인 동료의 <b>탄환</b>과 <b>스킬 게이지</b>를 채워요.')
      + ROW(gl('✕', '#8a85a8'), '꽝 칸', '들어가도 충전되지 않아요(회복 칸·패시브로 바뀌기도 해요).')
      + ROW(gl('×' + JACKPOT_MUL, '#ffd93b'), '잭팟 칸', '좌우로 움직이는 칸이에요. 여기에 들어가면 충전이 <b>×' + JACKPOT_MUL + '</b>! 꽝 칸이어도 크레딧 +10을 줘요.')
      + H('콤보')
      + P('한 볼이 <b>페그를 연속으로 터뜨린 수</b>가 콤보예요. <b>' + COMBO_STEP + '콤보마다</b> 보너스 충전볼이 생겨요(' + COMBO_STEP + '→+1, ' + COMBO_STEP * 2 + '→+2, ' + COMBO_STEP * 3 + '→+3, ' + COMBO_STEP * 4 + ' 이상은 +' + COMBO_MAX + ').')
      + TIP('충전볼은 터진 자리에서 거의 곧장 위로 올라가요. 충전하고 싶은 동료의 <b>충전 칸 아래쪽 페그</b>를 노려 보세요!');
  }

  // 스킬 종류(content.js ROSTER 의 active.kind) — 누가 가졌는지는 ROSTER 에서 읽어 온다
  const SKILL_KIND = [
    ['bigHit', '직격', '맨 앞 적에게 공격력의 여러 배를 한 번에 꽂아요.'],
    ['extraShots', '연속 사격', '추가로 여러 발을 연달아 쏴요.'],
    ['aoe', '광역 포격', '여러 적을 한꺼번에 타격해요.'],
    ['stun', '기절', '적 몇 기를 한 턴 동안 묶어요. 보스의 예고 패턴도 막을 수 있어요.'],
    ['heal', '방벽 수리', '방벽 HP를 회복해요.']
  ];
  const skillName = (kind) => (SKILL_KIND.find((k) => k[0] === kind) || [])[1] || kind;
  function tBattle() {
    let kinds = '';
    SKILL_KIND.forEach((k) => {
      const own = ROSTER.filter((c) => c.active && c.active.kind === k[0]);
      const cls = own.length ? own[0].cls : 'gunner';
      kinds += ROW(big('cls_' + cls, CLASS[cls].icon), k[1], k[2] + (own.length ? '<br><span class="hp-st">' + own.map((c) => c.name).join(' · ') + '</span>' : ''));
    });
    return H('전투 단계')
      + P('장전이 끝나면 충전된 <b>탄환 수만큼</b> 동료들이 차례로 사격해요. 한 발의 피해는 동료의 <b>공격력</b>이고, 표적은 레인과 상관없이 <b>맨 앞 적</b>이에요.')
      + P('사격이 끝나면 적이 <b>한 칸</b>(빠른 적은 두 칸) 전진해요. 방벽에 닿은 적은 사라지면서 방벽 HP를 깎아요. 적을 다 쓰러뜨리면 전투 승리!')
      + P('전투가 길게 느껴지면 위쪽 <b>×1</b> 버튼을 눌러 <b>×2</b> 속도로 볼 수 있어요. 버튼은 이 기기에 기억돼요.')
      + H('화면 읽는 법')
      + ROW(big('ic_levelup', '⬆'), '경험치 막대', '머리글 아래 가는 막대예요. 적을 쓰러뜨리면 차고, 가득 차면 <b>레벨업 보상</b>!')
      + ROW(big('relic_crit', '🎯'), '모듈 막대', '지금까지 모은 모듈이에요. 눌러서 설명과 <b>세트 진행도</b>를 볼 수 있어요.')
      + ROW(spr('sentry'), '적 요약 줄', '필드에 있는 적의 종류별 마릿수와 <b>남은 총 HP</b>예요. +N은 아직 등장하지 않은 적이에요.')
      + ROW(big('stat_hp', '🛡'), '방벽 HP 막대', '동료 아래 초록 막대가 방벽의 남은 HP예요.')
      + H('액티브 스킬')
      + P('동료마다 <b>스킬 게이지</b>가 있어요. 충전 칸에 볼이 들어갈 때마다 탄환과 함께 차고, 가득 차면 오른쪽 <b>스킬 버튼</b>이 켜져요. 스킬을 쓰면 게이지는 0이 돼요.')
      + ROW(big('ic_reward', '🎁'), '직접 켜기', '버튼을 눌러 두면 이번 전투에 발동해요. 직접 켜면 <b>피해 +' + pct(MANUAL_SKILL_BONUS) + '%</b>!')
      + ROW(big('ic_promote', '⏫'), '스킬 자동', '켜 두면 게이지가 찰 때마다 알아서 써요(피해 보너스는 없어요).')
      + ROW(big('ic_battle', '💥'), '전투 자동', '장전 단계의 볼 발사까지 알아서 해줘요.')
      + H('스킬 종류')
      + kinds
      + H('스킬의 흔적')
      + P('스킬을 쓰면 <b>다음 판</b>에 흔적이 남아요. ' + Object.keys(SKILL_BOARD).map((k) => '<b>' + skillName(k) + '</b> → ' + SKILL_BOARD[k].text).join(' · ') + '.')
      + TIP('스킬 게이지는 충전 칸에 볼이 들어갈 때 같이 차요. 스킬을 쓰고 싶은 동료의 레인을 집중해서 채워 보세요.');
  }

  const TAG_ORDER = ['precision', 'explosive', 'guard', 'pinball', 'harvest'];
  function relicRow(id, unlocked) {
    const d = RELICS[id], lock = unlocked.indexOf(id) < 0;
    return ROW(big('relic_' + id, d.icon), d.name + (lock ? ' ' + ui('ic_lock', '🔒') : ''),
      '<span class="hp-lv">Lv1</span> ' + d.lv1.desc + '<br><span class="hp-lv evo">개량</span> <b>' + d.lv2.name + '</b> — ' + d.lv2.desc, lock ? 'lock' : '');
  }
  function tMap() {
    const T = MAP_CFG.nodeTypes;
    let rw = '';
    REWARDS.forEach((r) => { rw += ROW(big('rw_' + r.id, r.name.split(' ')[0]), r.name.replace(/^\S+\s/, ''), r.desc); });
    return H('분기 지도')
      + P('<b>' + MAP_CFG.floors + '층</b>짜리 길이에요. 빛나는 노드만 갈 수 있고, 맨 위는 보스예요.')
      + ROW(big('node_battle', T.battle.icon), T.battle.name, '적과 싸워요. 이기면 모듈을 <b>3개 중 1개</b> 골라요.')
      + ROW(big('node_elite', T.elite.icon), T.elite.name, '강한 정예 적이 섞인 큰 전투예요. 정예를 쓰러뜨리면 경험치가 크고 크레딧 +' + ELITE.gold + '.')
      + ROW(big('node_shop', T.shop.icon), T.shop.name, '런 크레딧으로 모듈(' + SHOP_PRICE.relic + ', 가진 모듈 개량 ' + SHOP_PRICE.relicEvo + ')이나 방벽 수리(' + SHOP_PRICE.heal + ')를 사요. 쓴 크레딧은 정산에서 빠져요.')
      + ROW(big('node_rest', T.rest.icon), T.rest.name, '방벽 HP <b>' + pct(REST_HEAL) + '% 회복</b> 또는 모듈 1개 <b>개량</b> 중 하나만 골라요.')
      + ROW(big('node_boss', T.boss.icon), T.boss.name, '맨 위에서 기다려요. 쓰러뜨리면 스테이지 클리어!')
      + H('레벨업 보상')
      + P('적을 쓰러뜨리면 경험치가 쌓여 레벨이 올라요. 올릴 때마다 보상을 <b>3개 중 1개</b> 골라요 — <b>짝수 레벨은 모듈</b>, <b>홀수 레벨은 능력치 강화</b>예요.')
      + rw
      + LINK('relic', '모듈 목록 보기');
  }
  function tRelic() {
    const unlocked = (typeof Meta !== 'undefined' && Meta.unlockedRelics) ? Meta.unlockedRelics() : Object.keys(RELICS);
    let mods = '', anyLock = false;
    TAG_ORDER.forEach((t) => {
      const tg = RELIC_TAGS[t];
      mods += '<div class="hp-tag" style="--c:' + tg.color + '">' + tagIc(t) + '<b>' + tg.name + '</b><span class="hp-set">세트(' + RELIC_SET_N + '개): ' + tg.set + '</span></div>';
      Object.keys(RELICS).filter((id) => RELICS[id].tag === t).forEach((id) => { if (unlocked.indexOf(id) < 0) anyLock = true; mods += relicRow(id, unlocked); });
    });
    return P('<b>모듈</b>은 이번 런 동안만 쓰는 특수 장비예요. 전투에서 이기거나 짝수 레벨이 되면 <b>3개 중 1개</b>를 골라요. 같은 모듈을 또 고르면 <b>개량(Lv2)</b>돼서 더 강해져요.')
      + P('모듈은 <b>태그</b> 5종으로 나뉘어요. 같은 태그를 <b>' + RELIC_SET_N + '개</b> 모으면 <b>세트 보너스</b>가 켜져요.')
      + mods
      + (anyLock ? P('🔒 표시는 아직 해금 전이에요. 스테이지를 <b>처음 클리어할 때마다 2종씩</b> 열려요.') : '')
      + TIP('전투·지도 화면의 모듈 막대를 누르면 지금 가진 모듈의 설명과 세트 진행도를 볼 수 있어요.');
  }

  const ENEMY_ORDER = ['sentry', 'drone', 'walker', 'hound', 'heavy', 'sludge'];
  function enemyNote(k) {
    const e = ENEMIES[k];
    return ({
      sentry: '기본 병력이에요. 드론 모함도 이 유닛을 내보내요.',
      drone: '필드에 있는 동안 장전 때마다 <b>특수 페그를 일반 페그로 교란</b>해요.',
      walker: '체력과 공격이 높은 중형 전투기예요.',
      hound: '<b>빨라요</b> — 한 번에 ' + e.speed + '칸씩 전진해요. 체력은 낮아요.',
      heavy: '<b>장갑</b>이 단단해요(맞을 때마다 피해 -' + e.armor + '). <b>파편 페그</b>를 뿌려요.',
      sludge: '<b>오염 페그</b>(볼을 삼킴)를 뿌려요.'
    })[k] || '';
  }
  function tEnemy() {
    let en = '';
    ENEMY_ORDER.forEach((k) => {
      const e = ENEMIES[k];
      en += ROW(spr(k), e.name, enemyNote(k) + '<br><span class="hp-st">HP ' + e.hp + ' · 공격 ' + e.dmg + '</span>');
    });
    const bossNote = {
      titan: '<b>돌격형</b>. HP가 ' + BOSSES.titan.thresholds.map((x) => pct(x) + '%').join('·') + '에 이를 때마다 <b>과열</b>로 물러나 멈추고, 그동안 코어가 드러나 <b>피해 +' + pct(BOSSES.titan.vulnerable) + '%</b>예요.',
      swarm: '<b>분리형</b>. HP가 ' + BOSSES.swarm.thresholds.map((x) => pct(x) + '%').join('·') + '에 이를 때마다 슬러지 ' + BOSSES.swarm.splitCount + '기로 <b>분리</b>돼요.',
      carrier: '<b>정지형</b>. 움직이지 않고 매 턴 <b>경비봇을 사출</b>해요.'
    };
    let bs = '';
    ['titan', 'swarm', 'carrier'].forEach((k) => {
      const b = BOSSES[k];
      let st = []; for (let s = 1; s <= STAGE_MAX; s++) if (stageBoss(s) === k) st.push(s);
      bs += ROW(spr('boss_' + k, true), b.name + ' <span class="hp-sub">스테이지 ' + st.join('·') + '</span>', bossNote[k] + '<br><span class="hp-st">' + BOSS_INTENT[k].every + '턴마다 예고: ' + BOSS_INTENT[k].name + ' — ' + BOSS_INTENT[k].desc + '</span><br><span class="hp-st">HP ' + num(b.hp) + ' · 공격 ' + b.dmg + '</span>', 'boss');
    });
    const stunner = ROSTER.find((c) => c.active && c.active.kind === 'stun');
    return H('적 종류')
      + P('아래 수치는 <b>스테이지 1</b> 기준이에요. 스테이지가 높을수록 적이 튼튼하고 세져요.')
      + en
      + H('판 간섭')
      + P('일부 적은 필드에 있는 동안 장전 판을 <b>방해</b>해요(간섭 페그는 한 번에 최대 ' + ENEMY_BOARD_CAP + '개). 장전 화면에 “…했어요!” 안내가 뜨면, 그 적을 먼저 쓰러뜨려 판을 깨끗하게 만들 수 있어요.')
      + H('정예')
      + P('정예 노드의 첫 웨이브에는 <b>정예 적</b>(황금빛 오라) 한 기가 섞여 있어요. 체력 ×' + ELITE.hpMul + ', 공격 ×' + ELITE.dmgMul + '로 세지만 경험치 ×' + ELITE.expMul + ', 쓰러뜨리면 크레딧 +' + ELITE.gold + eulReul(ELITE.gold) + ' 줘요.')
      + H('보스')
      + bs
      + P('보스 곁의 알약에 패턴까지 <b>남은 턴</b>이 떠요. 그 턴이 0이 되기 전에 <b>기절</b> 스킬로 묶으면 패턴이 <b>취소(저지)</b>돼요.')
      + TIP('기절 스킬' + (stunner ? '(' + stunner.name + '의 ' + stunner.active.name + ')' : '') + '을 보스 예고 직전에 아껴 두면 큰 피해를 막을 수 있어요.');
  }

  const PASSIVE_NOTE = '판에 페그를 더하거나(예광탄·증폭탄·고폭탄·지뢰 설치), 볼을 늘리거나(탄약 보급·투하), 꽝 칸을 충전 칸으로 바꾸는(진지 구축·정비 지원) 늘 켜진 효과예요.';
  function tChars() {
    let cl = '';
    const clsNote = { gunner: '공격력이 높고 체력이 낮아요. 스킬은 <b>직격·연속 사격</b>이에요.', cannon: '여러 적을 노려요. 스킬은 <b>광역 포격</b>이에요.', support: '체력과 골칸이 많아요. 스킬은 <b>방벽 수리·기절</b>이에요.' };
    ['gunner', 'cannon', 'support'].forEach((k) => {
      const c = CLASS[k];
      cl += ROW(big('cls_' + k, c.icon), '<span style="color:' + c.color + '">' + c.name + '</span> <span class="hp-sub">' + c.desc + '</span>', clsNote[k]);
    });
    const rar = Object.keys(RARITY).map((k) => '<span class="hp-chip" style="--c:' + RARITY[k].color + '">' + RARITY[k].name + '</span>').join('');
    const pc = GROWTH.promoteCost(1);
    return H('클래스')
      + cl
      + H('등급')
      + P(rar + '<br>클래스마다 등급별로 1명씩, 모두 <b>' + ROSTER.length + '명</b>이에요. 가챠로 모아요.')
      + H('능력치')
      + ROW(big('stat_atk', '🔩'), '공격', '한 발의 피해예요.')
      + ROW(big('stat_hp', '🛡'), '체력', '편성한 동료 체력의 합이 <b>방벽 HP</b>예요.')
      + ROW(big('stat_gol', '🎯'), '골칸', '레인 포켓 3칸 중 <b>충전 칸</b>의 수(1~3)예요. 많을수록 장전이 쉬워요.')
      + H('스킬·패시브')
      + ROW(big('ic_battle', '💥'), '액티브 스킬', '게이지가 가득 차면 쓰는 필살기예요. 전투 중 오른쪽 스킬 버튼으로 켜요.')
      + ROW(big('ic_info', '❔'), '패시브', PASSIVE_NOTE)
      + H('성장')
      + ROW(big('ic_levelup', '⬆'), '레벨업', uiCur('gold') + '크레딧으로 올려요. 레벨 상한은 ★마다 늘어요(' + GROWTH.levelCapByStar.slice(1).join(' → ') + ').')
      + ROW(big('ic_promote', '⏫'), '승급', uiCur('shards') + '조각과 ' + uiCur('mats') + '재료로 ★을 올려요(최대 ★' + GROWTH.starMax + '). 능력치가 크게 오르고 레벨 상한도 늘어요. ★1→2: ' + uiCur('shards') + pc.shards + ' · ' + uiCur('mats') + pc.mats + '.')
      + H('편성')
      + P('<b>편성</b> 탭에서 동료를 <b>3개 레인</b>에 배치해요. 목록의 카드를 빈 레인으로 <b>끌어다 놓거나</b>, 카드를 눌러 상세 화면에서 <b>[편성]</b>을 눌러요. 레인 색은 전투 때 포켓 색과 이어져요.');
  }

  function tEcon() {
    let ms = '';
    MISSIONS.forEach((m) => { ms += ROW(big('ic_mission', '📋'), m.name, m.desc + ' → ' + cost(m.reward)); });
    const rates = GACHA.rates.map((r) => RARITY[r.rarity].name + ' ' + r.w + '%').join(' · ');
    return H('재화')
      + ROW(big('cur_gold', '🪙'), '크레딧', '동료 <b>레벨업</b>에 써요. 런 중에는 상점에서 모듈을 사는 데 쓰고, 런이 끝나면 남은 크레딧이 정산돼요.')
      + ROW(big('cur_mats', '🔩'), '재료', '동료 <b>승급</b>에 써요.')
      + ROW(big('cur_gems', '💎'), '보석', '<b>가챠</b>에 써요. 스테이지 클리어·일일 도전·미션 보상으로 받아요.')
      + ROW(big('cur_docs', '📄'), '문서', '상점 문서 탭에서 동료 <b>조각</b>과 바꿔요.')
      + ROW(big('cur_shard', '🔷'), '조각', '동료 승급 재료예요. 가챠에서 이미 가진 동료가 나오면 +' + GACHA.dupShards + '.')
      + H('가챠')
      + P('단일 ' + uiCur('gems') + GACHA.cost1 + ' · 10연 ' + uiCur('gems') + GACHA.cost10 + ' · <b>하루 무료 1회</b>.<br>확률: ' + rates + '. 이미 가진 동료가 나오면 조각으로 바뀌어요.')
      + H('문서 교환')
      + P('문서로 <b>보유한 동료</b>의 조각을 살 수 있어요(커먼 제외). 조각 1개당 레어 ' + uiCur('docs') + DOC_SHOP.price.rare + ', 에픽 ' + uiCur('docs') + DOC_SHOP.price.epic + ', 레전더리 ' + uiCur('docs') + DOC_SHOP.price.legendary + '.')
      + H('패키지')
      + ROW(big('ic_package', '📦'), '보석 패키지·주간 패스', '아직 준비 중이에요. 곧 열려요!')
      + H('미션')
      + ms
      + P('진행도가 가득 차면 <b>[받기]</b> 버튼이 켜져요.')
      + H('방치 보상')
      + ROW(big('ic_idle', '💤'), '홈에서 쌓여요', '출격하지 않아도 시간이 지나면 ' + uiCur('gold') + '크레딧(분당 ' + IDLE.goldPerMin + ')과 ' + uiCur('mats') + '재료(분당 ' + IDLE.matsPerMin + ')가 쌓여요. 최대 ' + IDLE.capHours + '시간, 해금한 스테이지가 높을수록 많아요(최대 ×' + IDLE.mul(STAGE_MAX) + ').')
      + H('런 정산')
      + P('런이 끝나면(승리·패배 모두) <b>남은 크레딧</b>과 <b>클리어한 전투 수</b>에 따라 크레딧·재료를 받아요. <b>승리하면</b> 보석과 문서도 더해져요. 스테이지가 높을수록 보상 배율이 커져요.');
  }

  function tModes() {
    let tbl = '<div class="hp-tbl"><div class="hp-tr hd"><span>스테이지</span><span>적 HP</span><span>적 공격</span><span>보상</span><span>보스</span></div>';
    for (let s = 1; s <= STAGE_MAX; s++) {
      const sc = stageScale(s);
      tbl += '<div class="hp-tr"><span>' + s + '</span><span>×' + sc.hp.toFixed(1) + '</span><span>×' + sc.dmg.toFixed(1) + '</span><span>×' + sc.reward.toFixed(1) + '</span><span>' + BOSSES[stageBoss(s)].name + '</span></div>';
    }
    tbl += '</div>';
    return H('모드')
      + ROW(big('ic_battle', '💥'), MODES.normal.name, '스테이지 1~' + STAGE_MAX + '을 차례로 깨요. 처음 클리어하면 <b>다음 스테이지</b>와 <b>새 모듈</b>이 열려요.')
      + ROW(big('ic_timer', '⏱'), MODES.daily.name, '<b>오늘 하루 고정된 판</b>(같은 시드)에 도전해 <b>최고 점수</b>를 겨뤄요. 오늘 첫 클리어엔 ' + uiCur('gems') + MODES.daily.reward.gems + '.')
      + ROW(big('ic_promote', '⏫'), MODES.endless.name, '보스를 쓰러뜨릴 때마다 <b>더 강한 막</b>이 이어져요(막마다 적 +' + pct(MODES.endless.loopScale) + '%). 방벽이 무너질 때까지 간 <b>막·전투 수</b>가 기록이에요.')
      + H('스테이지 난이도')
      + P('스테이지가 높을수록 적이 튼튼하고 세지만 보상도 커져요.')
      + tbl
      + H('모듈 해금')
      + P('스테이지를 <b>처음 클리어할 때마다</b> 모듈이 2종씩 해금돼요(세 번째 클리어에 전부 열려요).')
      + TIP('막히면 편성한 동료를 키우거나 승급해서 다시 도전해 보세요. 낮은 스테이지를 반복해도 재화를 모을 수 있어요.');
  }

  const TOPICS = [
    { id: 'basic', name: '기본', ic: () => big('nav_home', '🏠'), build: tBasic },
    { id: 'board', name: '핀볼 판', ic: () => pegImg('peg_mult2'), build: tBoard },
    { id: 'battle', name: '전투', ic: () => big('ic_battle', '💥'), build: tBattle },
    { id: 'map', name: '지도·보상', ic: () => big('ic_reward', '🎁'), build: tMap },
    { id: 'relic', name: '모듈', ic: () => big('relic_crit', '🎯'), build: tRelic },
    { id: 'enemy', name: '적·보스', ic: () => big('node_elite', '💀'), build: tEnemy },
    { id: 'chars', name: '동료', ic: () => big('nav_formation', '👥'), build: tChars },
    { id: 'econ', name: '재화·상점', ic: () => big('nav_shop', '🛒'), build: tEcon },
    { id: 'modes', name: '모드', ic: () => big('nav_sortie', '🚀'), build: tModes }
  ];

  // ═════════ 팝업 ═════════
  function ctxTopic() {                                              // 지금 화면에 맞는 주제부터
    if (vis('combat')) {
      if (vis('map')) return 'map';
      const g = window.__PONGTRESS__, s = g && g.S;
      return (s && s.phase === 'battle') ? 'battle' : 'board';
    }
    const act = document.querySelector('#lobby-nav .tabbtn.active'), t = act && act.dataset.tab;
    return t === 'formation' ? 'chars' : (t === 'shop' || t === 'mission') ? 'econ' : t === 'sortie' ? 'modes' : 'basic';
  }
  function build() {
    if (built) return; built = true;
    const m = document.createElement('div');
    m.id = 'help-modal'; m.className = 'modal'; m.hidden = true; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', '도움말');
    m.innerHTML = '<div class="modal-box help-box">'
      + '<div class="hp-top"><h2>' + ui('ic_info', '❔') + ' 도움말</h2><button class="hp-x" data-hp="close" aria-label="닫기">' + ui('ic_close', '✕') + '</button></div>'
      + '<div class="hp-tabs" id="hp-tabs"></div><div class="hp-body" id="hp-body"></div><div class="hp-foot" id="hp-foot"></div></div>';
    $('app').appendChild(m);
    m.addEventListener('click', (e) => {
      if (e.target === m) { close(); return; }
      const t = e.target.closest('[data-topic]'); if (t) { show(t.dataset.topic); return; }
      const b = e.target.closest('[data-hp]'); if (!b) return;
      if (b.dataset.hp === 'close') close();
      else if (b.dataset.hp === 'tut') { close(); if (typeof Tutorial !== 'undefined') Tutorial.replay(); }
    });
  }
  function renderTabs() {
    $('hp-tabs').innerHTML = TOPICS.map((t) => '<button class="hp-tab' + (t.id === cur ? ' on' : '') + '" data-topic="' + t.id + '"><span class="hp-ti">' + t.ic() + '</span>' + t.name + '</button>').join('');
  }
  function renderBody() {
    const t = TOPICS.find((x) => x.id === cur) || TOPICS[0];
    let h = '';
    try { h = t.build(); } catch (e) { console.error('[help]', e); h = P('내용을 불러오지 못했어요.'); }
    const b = $('hp-body'); b.innerHTML = h; b.scrollTop = 0;
  }
  function renderFoot() {
    const canTut = vis('lobby') && !vis('combat') && typeof Tutorial !== 'undefined' && !Tutorial.disabled;   // 튜토리얼은 로비에서 시작하므로 런 중에는 안 보인다
    $('hp-foot').innerHTML = (canTut ? '<button class="sns-btn sub" data-hp="tut">튜토리얼 다시 보기</button>' : '') + '<button class="sns-btn" data-hp="close">닫기</button>';
  }
  function show(id) { cur = id; renderTabs(); renderBody(); }
  function open(topic) {
    build();
    cur = TOPICS.some((t) => t.id === topic) ? topic : ctxTopic();
    renderTabs(); renderBody(); renderFoot();
    $('help-modal').hidden = false;
    window.__helpPause = vis('combat');                              // 런 중이면 게임을 멈춘다(game.js 루프)
    try { if (typeof Sound !== 'undefined') Sound.play('click'); } catch (e) {}
  }
  function close() {
    const m = $('help-modal'); if (m) m.hidden = true;
    window.__helpPause = false;
  }
  const isOpen = () => { const m = $('help-modal'); return !!m && !m.hidden; };

  // [data-help] 버튼(로비·전투·지도 머리말)은 문서 위임으로 연다 — 지도 머리말처럼 다시 그려지는 곳에서도 그대로 동작
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-help]'); if (!b) return;
    e.stopPropagation(); open(b.dataset.help === 'open' ? undefined : b.dataset.help);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) close(); });

  return { open, close, isOpen, show, debug: { TOPICS, ctxTopic } };
})();
