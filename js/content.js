'use strict';
/* PONGTRESS 콘텐츠·수치 데이터 (프로토타입 슬라이스)
 * 밸런스 수치는 여기 한곳. game.js 보다 먼저 로드된다.
 */
const CFG = {
  lanes: 3,                // 캐릭터 편성(방벽) 레인 수 — 탄창·포켓도 이 값 기준
  fieldLanes: 6,           // 적 필드 열 수(캐릭터 레인과 분리). 공격은 레인 무관 맨 앞 타겟
  patSpacing: { grid: 1.15, chevrons: 1, zigzag: 1, diamonds: 0.9, rings: 1, heart: 1, cross: 1.05 },   // 패턴별 간격 배율(간격 = pegSpacing × 배율) — 판마다 볼 한 발의 장전량(APS)이 18~33 안에 들게 맞춘 값(tools/aps.js)
  pegSpacing: 32,          // 이웃한 탄약 중심 사이 간격(px · 기준 판 폭 311 기준). 패턴이 이 간격으로 반듯하게 선다 — 작을수록 촘촘(볼 한 발이 맞히는 탄약↑ = 장전량↑ = 쉬움). 탄약 반경 12~19 라 36 아래는 서로 닿는다
  normalPegHits: 1,        // (레거시) 탄약는 이제 충돌 시 볼로 변환됨 — 내구도 미사용
  harvestPerBall: 8,       // 볼 하나가 이번 궤적에서 장전 볼로 바꿀 수 있는 탄약 최대 수(과장전 방지, 판은 유지)
  battleShotMinDelay: 130, // ms, 전투 발사 최소 간격(탄환 많을 때 자동 단축 하한) — 크면 전투가 느려짐 (예전 90 — 너무 빨리 지나간다는 의견으로 2026-10 늦춤)
  battleWindow: 7500,      // ms, 전투 발사 목표 총 시간(탄환 수로 나눠 간격 자동 결정) — 크면 전투가 느려짐 (예전 4500)
  fieldRows: 5,            // 적 대기 필드 세로 칸 수(레인당)
  spawnMinRow: 2,          // 새 적이 등장할 수 있는 가장 낮은 행(방벽에 바짝 붙은 0~1행엔 등장 금지). 자리가 없으면 다음 턴에 등장
  launchesPerTurn: 2,      // 한 장전 턴에 쏘는 볼 수(기본). 패시브로 증가 예정
  maxBalls: 140,           // 볼 폭주 방지 상한(수확 볼이 동시에 많이 뜨므로 상향)
  gravity: 0,              // 무중력(퍼즐 보블): 볼은 직선+반사로 이동, 무조건 위로 올라감
  restitution: 0.98,       // 탄약 반사 시 에너지 거의 유지(가라앉지 않게)
  wallRestitution: 1.0,    // 벽·바닥 완전 반사
  ballRadius: 9,           // ⚠ 탄약·볼 크기와 속도는 '기준 판 폭 311px(폰 375 화면)' 기준 값 — 실제 판 폭에 비례해 커진다(game.js BU). 폰에서 잘 보이게 예전(7/9)보다 키웠다(2026-10)
  pegRadius: 12,
  launchSpeed: 820,        // 발사 속도(고정). 조준은 각도만
  aimMinUp: 0.3,           // 조준 하한(수평 근처)을 막아 항상 위로 향하게 (vy < -aimMinUp*speed)
  obstMargin: 6,           // 장애물(범퍼·기둥) 가장자리와 탄약 가장자리 사이 최소 여유(px · 기준 판 폭 311 기준) — 이 안에 든 탄약은 판에서 뺀다(작을수록 장애물 곁에 탄약이 더 남는다 · 예전 12 는 장애물 6개짜리 S5 판에서 탄약이 절반으로 깎였다)
  floorHp0: 0.8,           // 층(전투 노드 깊이 0~4)에 따른 적 체력 배수 = floorHp0 + floorHp × f + floorHp2 × f² (층0=0.8 · 1=1.04 · 2=1.5 · 3=2.2 · 4=3.2) — 스테이지 배수에 곱한다(content.js floorHpMul)
  floorHp: 0.12,           //   첫 전투는 워밍업(0.8)이고 뒤로 갈수록 가파르게(제곱항) — 런 안의 레벨업·모듈 성장이 뒤로 갈수록 가팔라서, 직선이면 첫 전투만 위험하고 끝은 시시했다
  floorHp2: 0.12,          //   ⚠ 이 값을 올리면 승률뿐 아니라 런 길이가 같이 는다(전투 하나가 7~9턴, 한 런 30~35턴 ≈ 한 턴 18초) — 올릴 땐 tools/bot.js 의 turns 도 같이 볼 것
  floorDmg0: 0.8,          // 층에 따른 적 공격 배수 = floorDmg0 + floorDmg × f (층0=0.8 … 4=1.2) — 첫 전투에서 새는 한두 마리에 방벽이 무너져 3분 만에 끝나지 않게
  floorDmg: 0.1,
  bossFloor: 2,            // 보스의 체력·공격 층 배수를 이 층 값으로 계산(보스 체력은 기본값이 이미 커서 맨 위 층 배수를 다 곱하면 한 런의 1/4 을 먹는다 — 2층 배수면 보스전 3~5턴)
  ballLifetime: 3.5,       // s, 이 시간 넘으면 제거하지 않고 속도 방향을 상단으로 점점 빠르게 돌려 보낸다(상단 포켓 도달 전엔 절대 소멸 안 함) — 예전 6초: 대형 탄약 판에선 한 발이 10초 넘게 튕기는 일이 잦았다
  battleShotDelay: 380,    // ms, 전투 phase 공격 1발 간 간격(보이게 느리게) — 예전 240
  battleStartDelay: 700,   // ms, 전투 phase 시작 후 첫 공격까지 — 예전 500
  battleEndDelay: 1100,    // ms, 마지막 공격 후 적 전진까지 — 예전 800
  enemyContactFlash: 250
};

// ── 탄약 종류(모양·기능) — 실제 핀볼처럼 다양하게 ──
// shape: 기본 렌더 모양 · size: 기본 크기 배수(반경) · weight: 판 생성 가중치 · oneShot: 맞으면 이번 턴 비활성(다음 턴 부활)
// 기능: split(볼 분열 수) · boost(속도 킥 배수, 영구 범퍼) · gold(획득 골드) · atk(이번 턴 공격 버프)
const PEG_TYPES = {
  normal: { name: '일반',   color: '#8f86d6', shape: 'circle',   size: 1.0,  weight: 52, oneShot: false },
  mult2:  { name: '증식×2', color: '#ffcf5c', shape: 'diamond',  size: 1.05, weight: 15, oneShot: true,  split: 1, label: '×2' },
  mult5:  { name: '증식×5', color: '#ff5db1', shape: 'star',     size: 1.3,  weight: 5,  oneShot: true,  split: 4, label: '×5' },
  bumper: { name: '범퍼',   color: '#46e6d0', shape: 'bumper',   size: 1.5,  weight: 0,  oneShot: false, boost: 1.28 },  // weight0=랜덤 스폰 제외(범퍼는 고정 장애물로 이전, 패시브/보상 설치만)
  gold:   { name: '크레딧', color: '#ffd93b', shape: 'hex',      size: 1.1,  weight: 8,  oneShot: true,  gold: 15, label: '$' },
  charge: { name: '증폭',   color: '#7ef29a', shape: 'triangle', size: 1.15, weight: 6,  oneShot: true,  charge: 3, label: '⚡' },  // 장전 ×3 볼 생성(탄환·스킬게이지 대량 장전)
  // ── 아래는 랜덤 스폰 제외(weight 0): 스킬·적 간섭으로만 생성 ──
  bomb:   { name: '폭탄',   color: '#ff8a3a', shape: 'circle',   size: 1.25, weight: 0,  oneShot: true,  bomb: 0.16, label: '✹' },  // 맞으면 주변 탄약 연쇄 폭발(스킬이 남김)
  scrap:  { name: '파편',   color: '#7a7f8c', shape: 'pentagon', size: 1.35, weight: 0,  oneShot: false, scrap: true },               // 반사만(변환·소멸 없음) — 헤비아머/타이탄이 설치
  sludge: { name: '오염',   color: '#5ad0a0', shape: 'circle',   size: 1.2,  weight: 0,  oneShot: true,  sludge: true, label: '≈' }   // 발사볼을 삼킴(장전 없이 소멸) — 슬러지가 설치
};
// 일반(반사) 탄약는 모두 원형으로 통일(가독성·정렬감).
const NORMAL_SHAPES = ['circle'];

// 탄약 하나 생성: 종류별 기본 크기 × 개별 지터(±) → 물리 반경(pr)·모양(shape) 확정
function makePeg(fx, fy, type) {
  const def = PEG_TYPES[type] || PEG_TYPES.normal;
  const jitter = 0.92 + Math.random() * 0.18;                 // 0.92~1.10 크기 편차(예전 0.82~1.24 — 큰 것끼리 닿아 줄이 흐트러졌다)
  const pr = CFG.pegRadius * (def.size || 1) * jitter;
  const shape = (type === 'normal') ? NORMAL_SHAPES[Math.floor(Math.random() * NORMAL_SHAPES.length)] : def.shape;
  return { fx, fy, type, alive: true, pr, shape, hits: 0 };
}

// 레벨업에 필요한 누적 경험치: 레벨 L→L+1 (장전·처치가 늘어난 만큼 완만하게)
function expToNext(level) { return 16 + level * 11; }

// ── 캐릭터 (12종. 새 계정의 시작 보유·편성은 아래 META_START, 보라·코코는 튜토리얼에서 합류) ──
// atk 공격력(발당 피해) · hp 체력(방벽 HP에 합산) · gol 고정 탄창 수(레인 3칸 중 장전되는 칸)
// active 액티브 스킬(게이지 N) · passive 패시브(보드 효과, 이번 패스 일부만 구현)
const RARITY = { common: { name: '커먼', color: '#9aa2c0', cls: 'g-n' }, rare: { name: '레어', color: '#5cc8ff', cls: 'g-r' }, epic: { name: '에픽', color: '#c98bff', cls: 'g-e' }, legendary: { name: '레전더리', color: '#ffce54', cls: 'g-l' } };
// 등급 딱지(<span class="g-tag g-n">커먼</span>) — 등급을 보여 주는 곳은 모두 이걸 쓴다(어디서나 같은 그림·같은 모양, 스킨은 css/skin.css '등급 딱지', 꺼져 있으면 색 알약). extra = 추가 클래스.
function rarBadge(rar, extra) { const R = RARITY[rar] || RARITY.common; return '<span class="g-tag ' + R.cls + (extra ? ' ' + extra : '') + '">' + R.name + '</span>'; }
// 클래스 3종: 화력을 단일/광역으로 나누고, 힐·제어·버프를 지원으로 묶음
const CLASS = {
  gunner:  { name: '사수', icon: '🎯', color: '#ff6b6b', desc: '단일 표적 고화력' },
  cannon:  { name: '포수', icon: '💥', color: '#ffb057', desc: '광역 다중 타격' },
  support: { name: '지원', icon: '🛠️', color: '#5ce0a0', desc: '수리·제어·버프' }
};

// 캐릭터 = 장전 후 원거리 사격/포격 컨셉(총·대포). 클래스 3종 × 등급 4종 = 12명(각 칸 1명).
//   사수(gunner)=단일 화력, 포수(cannon)=광역 화력, 지원(support)=수리·제어·버프
//   ⚠ 기존 7명 id(knight/archer/guard/rogue/priest/berserker/mage)는 유지 → 구 세이브 호환. 신규 5명만 추가.
// 전원 "미소녀 + 총·대포" 컨셉(2D 아니메 일러스트). concept = 외형·페르소나(프롬프트·상세표시용).
//   등급↑ = 화려↑, 레전더리=골드 트림+대형 화기+날개/후광. 팔레트: 사수 레드 / 포수 오렌지·골드 / 지원 민트·시안.
const ROSTER = [
  // ── 사수(gunner): 단일 표적 고화력 ── atk↑ hp↓ · 레드 계열
  { id: 'knight', cls: 'gunner', name: '루비', weapon: '캐논', rarity: 'common', atk: 8, hp: 30, gol: 1,
    concept: '빨간 베레모의 발랄한 신참 소녀. 크림슨·블랙 전술복. 무광 소형 캐논(레드 포인트)',
    active: { name: '직격탄', gauge: 12, kind: 'bigHit', mult: 3 },
    passive: { name: '예광탄', kind: 'addPeg', peg: 'mult2', n: 1 } },
  { id: 'archer', cls: 'gunner', name: '미나', weapon: '캐논', rarity: 'rare', atk: 10, hp: 26, gol: 2,
    concept: '트윈테일의 활발한 소녀. 크림슨·블랙 전술 재킷. 크림슨 포인트 캐논',
    active: { name: '연속 사격', gauge: 15, kind: 'extraShots', shots: 4 },
    passive: { name: '볼 보급', kind: 'addBall', n: 1 } },
  { id: 'berserker', cls: 'gunner', name: '카린', weapon: '캐논', rarity: 'epic', atk: 14, hp: 34, gol: 1,
    concept: '긴 흑발 크림슨 롱코트의 쿨한 에이스. 디테일이 강조된 대형 캐논(크림슨·미세 골드)',
    active: { name: '강습 포격', gauge: 16, kind: 'bigHit', mult: 4 },
    passive: { name: '증폭탄', kind: 'addPeg', peg: 'charge', n: 1 } },
  { id: 'valkyrie', cls: 'gunner', name: '발키리', weapon: '캐논', rarity: 'legendary', atk: 18, hp: 34, gol: 2,
    concept: '백금·핑크 롱헤어에 흑·금 제복과 날개 장식의 정예. 골드 트림 거대 캐논',
    active: { name: '풀메탈', gauge: 16, kind: 'extraShots', shots: 6 },
    passive: { name: '고폭탄', kind: 'addPeg', peg: 'mult5', n: 1 } },
  // ── 포수(cannon): 광역 다중 타격 ── aoe · 오렌지·골드 계열
  { id: 'grenadier', cls: 'cannon', name: '보라', weapon: '캐논', rarity: 'common', atk: 7, hp: 34, gol: 2,
    concept: '주황 단발의 명랑한 신참. 올리브·오렌지 군용 재킷. 무광 소형 캐논(오렌지 포인트)',
    active: { name: '확산 포격', gauge: 15, kind: 'aoe', count: 3, shots: 1, mult: 1.4 },
    passive: { name: '예광탄', kind: 'addPeg', peg: 'mult2', n: 1 } },
  { id: 'mortar', cls: 'cannon', name: '하나', weapon: '캐논', rarity: 'rare', atk: 9, hp: 36, gol: 2,
    concept: '만두머리의 씩씩한 소녀. 오렌지·블랙 복장. 오렌지 포인트 캐논',
    active: { name: '곡사 포격', gauge: 15, kind: 'aoe', count: 3, shots: 1, mult: 1.6 },
    passive: { name: '볼 보급', kind: 'addBall', n: 1 } },
  { id: 'mage', cls: 'cannon', name: '티아', weapon: '캐논', rarity: 'epic', atk: 12, hp: 30, gol: 2,
    concept: '앰버 롱헤어의 당당한 에이스. 오렌지·크림 군복 드레스. 장식이 들어간 대형 캐논(오렌지·미세 골드)',
    active: { name: '포격', gauge: 15, kind: 'aoe', count: 4, shots: 1, mult: 1.6 },
    passive: { name: '고폭탄', kind: 'addPeg', peg: 'mult5', n: 1 } },
  { id: 'behemoth', cls: 'cannon', name: '레지나', weapon: '캐논', rarity: 'legendary', atk: 15, hp: 40, gol: 2,
    concept: '흑·핑크 세일러 군복에 백금/핑크 롱헤어, 고글 바이저의 여왕. 금장식 거대 캐논(골드 트림·플래그십)',
    active: { name: '융단 포격', gauge: 17, kind: 'aoe', count: 5, shots: 1, mult: 1.8 },
    passive: { name: '고폭탄', kind: 'addPeg', peg: 'mult5', n: 1 } },
  // ── 지원(support): 수리·제어·버프 ── atk↓ hp↑ gol↑ · 민트·시안 계열
  { id: 'guard', cls: 'support', name: '코코', weapon: '캐논', rarity: 'common', atk: 3, hp: 52, gol: 3,
    concept: '민트 짧은 머리의 든든하고 귀여운 소녀. 민트·화이트 전술복. 무광 소형 캐논(민트 포인트)',
    active: { name: '방벽 전개', gauge: 18, kind: 'heal', amount: 24 },
    passive: { name: '진지 구축', kind: 'closeBlank', n: 1 } },
  { id: 'rogue', cls: 'support', name: '루미', weapon: '캐논', rarity: 'rare', atk: 6, hp: 34, gol: 2,
    concept: '은민트 단발 다크슈트의 조용한 침투 요원. 시안 포인트 캐논',
    active: { name: '섬광 포격', gauge: 14, kind: 'stun', count: 3, turns: 1 },
    passive: { name: '지뢰 설치', kind: 'addPeg', peg: 'bumper', n: 1 } },
  { id: 'priest', cls: 'support', name: '미라', weapon: '캐논', rarity: 'epic', atk: 5, hp: 44, gol: 2,
    concept: '민트 트윈테일 테크 드레스의 정비병. 게이지·홀로그램이 달린 대형 캐논(민트·미세 골드)',
    active: { name: '나노 수리', gauge: 16, kind: 'heal', amount: 42 },
    passive: { name: '정비 지원', kind: 'closeBlank', n: 1 } },
  { id: 'seraph', cls: 'support', name: '세라', weapon: '캐논', rarity: 'legendary', atk: 7, hp: 50, gol: 3,
    concept: '백·민트 롱헤어에 후광·날개의 천사 사령관. 골드 트림 거대 캐논',
    active: { name: '대규모 수리', gauge: 17, kind: 'heal', amount: 58 },
    passive: { name: '볼 투하', kind: 'addBall', n: 2 } }
];

// ── 메타(로비, 런 밖) 설정 ──
// 성장은 기본 스탯 비례(%)로 — 캐릭터마다 같은 배율. 최대(★5 Lv42) ≈ ×2.8
const GROWTH = {
  atkPct: 0.04, hpPct: 0.04,                     // 레벨 1당 기본 스탯의 % (최대 ★5 Lv42 ≈ ×3.4)
  starAtkPct: 0.18, starHpPct: 0.18,             // 성급(★) 1당 기본 스탯의 %
  levelCapByStar: [0, 12, 18, 25, 33, 42],       // ★1~5 레벨 상한(인덱스=성급)
  starMax: 5,
  levelUpCost: (lvl) => 30 + (lvl - 1) * 18,     // lvl→lvl+1 골드(완만화)
  promoteCost: (star) => ({ shards: 8 + star * 8, mats: 20 + star * 20 })  // ★star→star+1 조각+재화
};
const GACHA = {
  cost1: 100, cost10: 900, dupShards: 15,        // 보석 비용, 중복→조각
  rates: [{ rarity: 'common', w: 60 }, { rarity: 'rare', w: 28 }, { rarity: 'epic', w: 9 }, { rarity: 'legendary', w: 3 }]
};
// 문서 상점(스틸앤샷式): 캐릭터 조각만 판매 · 커먼 제외 · 등급별 조각 1개당 문서 비용 · 보유(가챠 획득) 요원만 구매
const DOC_SHOP = { price: { rare: 2, epic: 5, legendary: 12 } };
const MISSIONS = [
  { id: 'firstWin', name: '첫 승리', desc: '런 1회 클리어', stat: 'runsWon', goal: 1, reward: { gems: 150 } },
  { id: 'kills60', name: '섬멸 작전', desc: '적 60기 격파', stat: 'kills', goal: 60, reward: { gold: 300 } },
  { id: 'floors12', name: '연전연승', desc: '전투 12회 클리어', stat: 'floors', goal: 12, reward: { gems: 100, mats: 80 } },
  { id: 'wins3', name: '삼전삼승', desc: '런 3회 클리어', stat: 'runsWon', goal: 3, reward: { gems: 200, docs: 20 } }
];
// ── 스테이지 (높을수록 난이도↑) ──
const STAGE_MAX = 5;
//  ⚠ 적 기본 체력(ENEMIES·BOSSES)은 'S1' 기준이다. 스테이지 배수는 그 위에 곱하고, 층이 깊어지면 CFG.floorHp0·floorHp·floorHp2 로 한 번 더 단단해진다(nodeCombat · 첫 전투 ×0.8 → 5번째 전투 ×3.2).
//  보정 근거(2026-10 봇 시험 · tools/bot.js · balmx.js · aps.js): 스테이지마다 '그 스테이지에 맞는 파티'가 평균 조준으로 승률 75~85% 가 되는 값.
//    S1 시작 3명(루비·보라·코코) Lv1★1 ≈100%(막무가내 조준 ≈88%) · S2 시작 3명 Lv8★1 ≈80%(레어 3명이면 100%) · S3 레어 3명 Lv12★2 ≈83% · S4 에픽 3명 Lv18★3 ≈83%(레어 3명 ≈50%)
//    · S5 레전더리1+에픽2 Lv24★4 ≈83%. 판의 탄약 양(장전량)이 스테이지마다 달라(S1 32 → S5 24) 이 값은 판 배치(STAGE_BOARDS·STAGE_OBST·CFG.pegSpacing)와 한 묶음이다.
//    체력 배수가 ±15% 만 어긋나도 승률이 90%→50% 로 갈릴 만큼 가파르다(런 안 레벨업 눈덩이) — 판·적·성장 중 하나를 바꾸면 봇으로 다시 잴 것.
const STAGE_HP = [0, 1, 1.0, 1.3, 1.7, 2.25];   // 인덱스 = 스테이지
function stageScale(s) {
  s = Math.max(1, Math.min(STAGE_MAX, s || 1));
  return {
    hp: STAGE_HP[s],            // 적/보스 체력 배수: S1=1 … S5=2.25 (S1→S2 는 같다 — 상승분은 적 종류(워커 등장)·공격 배수·'그 스테이지에 맞는 파티'의 성장 폭이 맡는다)
    dmg: 1 + (s - 1) * 0.42,    // 적 공격 배수: S1=1 … S5=2.68 (방벽 압박)
    exp: 1 + (s - 1) * 0.40,    // 경험치 배수
    reward: 1 + (s - 1) * 0.60  // 메타 화폐 보상 배수: S1=1 … S5=3.4
  };
}

// 시작 메타 상태(루비 1명으로 시작 — 보라는 튜토리얼 가챠, 코코는 튜토리얼 완료 선물로 합류한다. 가챠용 보석 지급)
//   ⚠ 신규 계정에만 적용. 개발용 ?sim·?notut 은 Meta.load 가 보라·코코를 더해 3명으로 시작시킨다(TUTORIAL.starter).
const META_START = {
  currencies: { gold: 200, mats: 120, gems: 320, docs: 0 },
  shards: {},
  owned: { knight: { level: 1, star: 1 } },
  party: ['knight', null, null],             // 1레인=루비. 나머지 레인은 비어 있다(동료를 영입해 직접 배치)
  stage: 1, maxStage: 1,
  stats: { runsWon: 0, kills: 0, floors: 0 },
  claimed: {},
  daily: { freeGachaDate: '' },
  idle: { last: 0 }               // 방치 보상 마지막 정산 시각(ms). 0이면 최초 진입 시 now로 초기화
};
// 튜토리얼(js/tutorial.js · meta.js · game.js 가 함께 쓰는 값)
//  · 첫 진입 = 튜토리얼 전투 1회(분기 지도 없이, 루비 1명, 패배 불가) → 상점의 튜토리얼 가챠 1회(보라 확정) → 편성 → 홈 → 출격 → 미션 → 완료 선물(코코 + 재화)
//  · 건너뛰기: 확인 팝업에서 [확인]을 눌러야만 건너뛰고, 그 순간 아직 못 받은 동료(보라·코코)와 완료 재화를 한꺼번에 받는다. 동료는 어떤 경우에도 자동 배치하지 않는다(플레이어가 편성 탭에서 직접).
const TUTORIAL = {
  pullId: 'grenadier',                       // 튜토리얼 가챠 1회의 확정 결과(보라)
  rewardId: 'guard',                         // 튜토리얼 완료 선물 캐릭터(코코)
  reward: { gems: 200, gold: 300 },          // 완료 선물 재화(기존 선물 그대로)
  starter: ['grenadier', 'guard'],           // 건너뛰기로 한꺼번에 받는 동료 · 개발용 신규 계정 지급
  scale: { hp: 0.31, dmg: 0.3, exp: 1, reward: 0 },  // 튜토리얼 전투의 적: 약하게(체력 ×0.31 ≈ 경비봇 48 — 적 기본 체력을 ×2.3 으로 올리기 전 ×0.7 과 같은 값, 공격 ×0.3)
  wallHp: 120,                               // 튜토리얼 전투의 방벽 HP(루비 혼자라도 지지 않게)
  // 튜토리얼 전투: 2웨이브(경비봇 2 → 드론 1 + 경비봇 1). 웨이브 원소가 적 종류 id 면 그 종류로 등장한다.
  combat: { name: '튜토리얼', tutorial: true, waves: [['sentry', 'sentry'], ['drone', 'sentry']] }
};
// 방치(idle) 보상: 홈에서 시간 경과에 따라 골드·재료 누적, 상한 있음. 해금 스테이지가 높을수록 배율↑.
const IDLE = {
  goldPerMin: 5, matsPerMin: 0.35, capHours: 8,
  mul: (maxStage) => 1 + (Math.max(1, maxStage) - 1) * 0.5     // S1 ×1 … S5 ×3
};

// ── 적 — 컨셉: 「폭주 병기군단」(SF 밀리터리 캐릭터와 같은 세계관) ──
// 적 종류 — speed(턴당 전진 칸), armor(피격 시 고정 감소). 스테이지가 높을수록 강한 적 등장.
// 필드 라벨 폭 때문에 이름은 4글자 이내(슬러지=오염된 나노 젤). 이미지: assets/enemy/<id>.png
const ENEMIES = {
  sentry: { name: '경비봇',   hp: 156, dmg: 13, exp: 6,  color: '#6fb1e8', speed: 1, armor: 0 },   // 기본 보병형 로봇(보스 부하도 이 유닛)
  drone:  { name: '해킹드론', hp: 99,  dmg: 10, exp: 5,  color: '#9b6cff', speed: 1, armor: 0 },   // 비행 드론 — 특수 탄약을 해킹(일반화)
  walker: { name: '워커',     hp: 317, dmg: 22, exp: 15, color: '#e0733a', speed: 1, armor: 0 },   // 중형 이족 전투기(고체력·고공격)
  hound:  { name: '하운드',   hp: 117, dmg: 13, exp: 9,  color: '#e8b04a', speed: 2, armor: 0 },   // 사족보행 로봇견 — 빠름(턴당 2칸)·물몸
  heavy:  { name: '헤비아머', hp: 460, dmg: 24, exp: 22, color: '#7f8aa0', speed: 1, armor: 4 },   // 대형 기갑 — 장갑(피격 -4)
  sludge: { name: '슬러지',   hp: 193, dmg: 13, exp: 8,  color: '#5ad0a0', speed: 1, armor: 0 }    // 오염된 나노 젤 — 오염 탄약(볼 흡수)
};
// 스테이지별 적 풀(가중치) — 상위 스테이지에 강한 적이 섞임
const STAGE_POOL = {
  1: [['sentry', 3], ['drone', 2]],
  2: [['sentry', 3], ['drone', 2], ['walker', 1]],
  3: [['sentry', 3], ['walker', 2], ['hound', 1]],
  4: [['sentry', 2], ['walker', 2], ['hound', 2], ['heavy', 1], ['sludge', 1]],
  5: [['walker', 2], ['hound', 2], ['heavy', 1], ['sludge', 2], ['sentry', 1]]
};
function pickEnemyType(s) {
  const pool = STAGE_POOL[Math.min(STAGE_MAX, Math.max(1, s))] || STAGE_POOL[1];
  const tot = pool.reduce((a, p) => a + p[1], 0); let r = Math.random() * tot;
  for (const [t, w] of pool) { r -= w; if (r <= 0) return t; }
  return pool[0][0];
}

// ── 보스 3종 (스테이지 티어별) ── 이미지: assets/enemy/boss_<kind>.png
const BOSSES = {
  titan:   { name: '타이탄', kind: 'titan', hp: 3050, dmg: 50, exp: 110, color: '#8a8f9a',
             thresholds: [0.75, 0.5, 0.25], retreat: 2, stunTurns: 1, vulnerable: 0.5 },   // 돌격형: HP% 구간마다 과열 정지(후퇴+스턴), 코어 노출 중 피해+50%
  swarm:   { name: '스웜 코어', kind: 'swarm', hp: 2500, dmg: 32, exp: 130, color: '#5ad0a0',
             thresholds: [0.66, 0.33], splitCount: 2 },                                     // 분리형: 임계마다 슬러지 분리
  carrier: { name: '드론 모함', kind: 'carrier', hp: 3700, dmg: 28, exp: 150, color: '#5f8fd0',
             addType: 'sentry' }                                                            // 정지형: 매 턴 경비봇 사출
};
function stageBoss(s) { return s >= 5 ? 'carrier' : s >= 3 ? 'swarm' : 'titan'; }

// ── 스테이지별 고정 핀볼 판 ──
// [전투0, 전투1, 전투2, 보스] 순. 매 판 랜덤이던 것을 스테이지·전투마다 고정 → 밸런스 재현성 확보.
// 중앙 집중형 그림 패턴(heart/rings/diamonds)에는 좌우 레일이 자동 추가되어 양옆 레인도 장전 가능(pegPatterns 참조).
//  ⚠ 판 하나의 장전량(APS)은 장애물 때문에 스테이지마다 다르다 — 얇은 선 패턴(별·하트)은 장애물이 선 위에 앉으면 끊겨 장전량이 3~10 까지 떨어졌다(별은 빼고, 하트는 장애물이 적은 S3 보스판에만).
//    새 패턴·장애물을 바꾸면 tools/aps.js 로 (스테이지 × 패턴) 장전량을 다시 재서 18~33 안에 드는지 볼 것.
const STAGE_BOARDS = {
  1: ['grid', 'chevrons', 'diamonds', 'cross'],
  2: ['chevrons', 'zigzag', 'rings', 'grid'],
  3: ['zigzag', 'diamonds', 'heart', 'cross'],
  4: ['cross', 'chevrons', 'rings', 'zigzag'],
  5: ['grid', 'zigzag', 'cross', 'chevrons']
};

// ── 스테이지별 고정 장애물(실제 핀볼판 느낌) ──
// 좌표=핀볼판(pins) 비율. t: bumper(강한 반사·발광) / pillar(단단한 반사).
// {t,fx,fy,r(폭 비율)} — 원형만 사용.
// ⚠ 설계 규칙(무중력·완전반사라 함정이 잘 생김):
//   ① 원형(bumper/pillar)만 — 수평 '바'는 발사구 위에서 볼을 바닥과 무한 반사시켜 금지.
//   ② 발사 부채꼴(하단) 비움: 모든 장애물 fy ≤ 0.58.
//   ③ 중앙 발사 열(fx 0.42~0.58)은 어떤 높이에도 장애물 금지 → 수직 발사가 정면충돌로
//      영구 반사(무한 튕김)되지 않게. 좌우 대칭 페어로 배치. (수직 발사는 중앙 탄약를
//      소모하며 통과 → 탄약는 맞으면 사라지므로 영구 함정이 아님)
//   ④ buildBoard가 장애물과 겹치는 탄약를 자동 제거(겹침 방지).
const STAGE_OBST = {
  1: [{ t: 'bumper', fx: 0.30, fy: 0.44, r: 0.06 }, { t: 'bumper', fx: 0.70, fy: 0.44, r: 0.06 }],
  2: [{ t: 'bumper', fx: 0.24, fy: 0.30, r: 0.065 }, { t: 'bumper', fx: 0.76, fy: 0.30, r: 0.065 }, { t: 'bumper', fx: 0.34, fy: 0.52, r: 0.06 }, { t: 'bumper', fx: 0.66, fy: 0.52, r: 0.06 }],
  3: [{ t: 'pillar', fx: 0.22, fy: 0.30, r: 0.07 }, { t: 'pillar', fx: 0.78, fy: 0.30, r: 0.07 }, { t: 'bumper', fx: 0.32, fy: 0.52, r: 0.06 }, { t: 'bumper', fx: 0.68, fy: 0.52, r: 0.06 }],
  4: [{ t: 'pillar', fx: 0.20, fy: 0.28, r: 0.075 }, { t: 'pillar', fx: 0.80, fy: 0.28, r: 0.075 }, { t: 'bumper', fx: 0.32, fy: 0.50, r: 0.065 }, { t: 'bumper', fx: 0.68, fy: 0.50, r: 0.065 }],
  5: [{ t: 'pillar', fx: 0.22, fy: 0.26, r: 0.07 }, { t: 'pillar', fx: 0.78, fy: 0.26, r: 0.07 }, { t: 'bumper', fx: 0.30, fy: 0.44, r: 0.07 }, { t: 'bumper', fx: 0.70, fy: 0.44, r: 0.07 }, { t: 'bumper', fx: 0.24, fy: 0.57, r: 0.055 }, { t: 'bumper', fx: 0.76, fy: 0.57, r: 0.055 }]
};

// ── 전투(웨이브) 구성: 런 = 3 일반전투 + 보스 ──
// 각 전투는 적을 순차 스폰. spawn[i] = 이 턴에 상단에 등장시킬 적 목록(레인은 자동 분배)
// 웨이브는 전투가 진행될수록 점점 커짐 (초반 완만, 후반 압박)
// 웨이브 길이 = 마릿수(종류는 스테이지 풀에서 결정). 필드 6열×5행=30칸 → 최대 ~18로 압박
const COMBATS = [
  { name: '전투 1', waves: [
    new Array(7).fill('x'),
    new Array(9).fill('x'),
    new Array(11).fill('x'),
    new Array(13).fill('x') ] },
  { name: '전투 2', waves: [
    new Array(9).fill('x'),
    new Array(11).fill('x'),
    new Array(13).fill('x'),
    new Array(15).fill('x') ] },
  { name: '전투 3', waves: [
    new Array(11).fill('x'),
    new Array(13).fill('x'),
    new Array(15).fill('x'),
    new Array(18).fill('x') ] },
  { name: '보스 · 타이탄', boss: true }
];

// ── 레벨업 보상 후보(3택1) ──
// 개편 원칙: 선택 시 '항상' 효과가 있어야 함(무효화 없음) + 판(탄약/장애물)을 건드리지 않음(겹침 방지).
//   → 탄창 개방/버프 칸(포켓 꽉 차면 무효)·증식판/범퍼 설치(탄약 겹침)는 제거하고 순수 스탯 보상으로 교체.
const REWARDS = [
  { id: 'heal',  name: '🔧 수리',      desc: '방벽 HP +30',                  apply: (S) => { S.wallHp = Math.min(S.wallHpMax, S.wallHp + 30); } },
  { id: 'atk',   name: '🔩 화력 조정', desc: '모든 동료 공격력 +1',          apply: (S) => { S.atkBonus += 1; } },
  { id: 'maxhp', name: '🧱 방벽 보강', desc: '방벽 최대 HP +40 (+즉시 회복)', apply: (S) => { S.wallHpMax += 40; S.wallHp += 40; } },
  { id: 'ball',  name: '➕ 볼 증설', desc: '이번 런 발사 볼 +1',           apply: (S) => { S.bonusBalls += 1; } },
  { id: 'power', name: '💥 화력 증폭', desc: '모든 동료 공격력 +2',          apply: (S) => { S.atkBonus += 2; } },
  { id: 'fort',  name: '🛡 요새화',    desc: '방벽 최대 HP +20 & 공격력 +1',  apply: (S) => { S.wallHpMax += 20; S.wallHp += 20; S.atkBonus += 1; } }
];

// ═══════════════ 모듈(구 '유물/렐릭' — 표시명만 변경, 내부 id·상수명 RELICS 등은 그대로) ═══════════════
// 태그 5종(클래스 3 + 보드 2). 같은 태그 모듈 3개 → 세트 보너스.
const RELIC_TAGS = {
  precision: { name: '정밀', icon: '🎯', color: '#ff6b6b', cls: 'gunner',  set: '모든 사격 치명타 확률 +20%' },
  explosive: { name: '폭발', icon: '💥', color: '#ffb057', cls: 'cannon',  set: '모든 사격이 인접 적에게 20% 스플래시' },
  guard:     { name: '방호', icon: '🛡', color: '#5ce0a0', cls: 'support', set: '방벽이 무너질 때 1회 HP 50%로 버팀' },
  pinball:   { name: '핀볼', icon: '🟣', color: '#b58cff', cls: null,      set: '매 턴 첫 발사 볼의 콤보 보너스 ×2' },
  harvest:   { name: '보급', icon: '📦', color: '#ffd93b', cls: null,      set: '볼이 탄창에 닿을 때마다 장전 +1' }
};
const RELIC_SET_N = 3;
// 모듈: 같은 모듈을 다시 고르면 Lv2 = 개량(구 '진화' — 이름·효과 변경). lv1/lv2 = 효과 파라미터.
const RELICS = {
  // 🎱 핀볼
  elastic:    { tag: 'pinball',   icon: '🟢', name: '탄성 코어', lv1: { desc: '장애물 범퍼에 맞으면 20% 확률로 장전 볼 +1', p: 0.2 },
                lv2: { name: '분열탄', desc: '장애물 범퍼에 맞으면 50% 확률로 장전 볼 +1', p: 0.5 } },
  chain:      { tag: 'pinball',   icon: '⛓', name: '연쇄 반응', lv1: { desc: '한 볼로 10콤보마다 판에 증폭 탄약 생성(전투당 최대 6)', every: 10 },
                lv2: { name: '연쇄 폭주', desc: '한 볼로 6콤보마다 판에 증폭 탄약 생성(전투당 최대 6)', every: 6 } },
  multishot:  { tag: 'pinball',   icon: '🔫', name: '다중 발사', lv1: { desc: '매 턴 첫 발사 때 볼 2개 동시 발사', n: 2 },
                lv2: { name: '삼연발', desc: '매 턴 첫 발사 때 볼 3개 동시 발사', n: 3 } },
  // 📦 보급
  midas:      { tag: 'harvest',   icon: '🪙', name: '자원 회수기', lv1: { desc: '크레딧 탄약이 장전 볼 +1 추가', balls: 1, gmul: 1 },
                lv2: { name: '대량 회수기', desc: '크레딧 탄약: 크레딧 ×2 · 장전 볼 +2', balls: 2, gmul: 2 } },
  overcharge: { tag: 'harvest',   icon: '⚡', name: '초과 장전', lv1: { desc: '증폭 탄약 장전 ×3 → ×4', charge: 4 },
                lv2: { name: '극한 장전', desc: '증폭 탄약 장전 ×5', charge: 5 } },
  lucky:      { tag: 'harvest',   icon: '🍀', name: '행운 포켓', lv1: { desc: '탄창에 닿으면 15% 확률로 장전 ×3', p: 0.15 },
                lv2: { name: '대박 포켓', desc: '탄창에 닿으면 30% 확률로 장전 ×3', p: 0.3 } },
  // 🎯 정밀
  crit:       { tag: 'precision', icon: '🎯', name: '치명탄', lv1: { desc: '치명타 15% (피해 ×2)', p: 0.15, mult: 2 },
                lv2: { name: '급소 사격', desc: '치명타 25% (피해 ×2.5)', p: 0.25, mult: 2.5 } },
  pierce:     { tag: 'precision', icon: '📌', name: '관통탄', lv1: { desc: '사격이 뒤 적 1기를 추가 관통(50% 피해)', n: 1, mult: 0.5 },
                lv2: { name: '철갑탄', desc: '사격이 뒤 적 2기를 추가 관통(70% 피해)', n: 2, mult: 0.7 } },
  focus:      { tag: 'precision', icon: '🔭', name: '락온 사격', lv1: { desc: '같은 적을 연속 타격할수록 피해 +10% (최대 5중첩)', per: 0.10 },
                lv2: { name: '풀 락온', desc: '같은 적을 연속 타격할수록 피해 +15% (최대 5중첩)', per: 0.15 } },
  // 💥 폭발
  shrapnel:   { tag: 'explosive', icon: '🧨', name: '파편탄', lv1: { desc: '적 처치 시 인접 적에게 처치 피해의 30%', mult: 0.3, rad: 1 },
                lv2: { name: '유탄 파편', desc: '적 처치 시 주변 2칸 적에게 처치 피해의 50%', mult: 0.5, rad: 2 } },
  blast:      { tag: 'explosive', icon: '🎆', name: '연쇄 폭발', lv1: { desc: '광역 스킬 타격 수 +2', count: 2, mult: 1 },
                lv2: { name: '대폭발', desc: '광역 스킬 타격 수 +4 · 피해 +20%', count: 4, mult: 1.2 } },
  powder:     { tag: 'explosive', icon: '🛢', name: '선제 포격', lv1: { desc: '전투 시작 시 모든 적에게 (총 탄환 × 1) 피해', mult: 1 },
                lv2: { name: '집중 포화', desc: '전투 시작 시 모든 적에게 (총 탄환 × 2) 피해', mult: 2 } },
  // 🛡 방호
  steel:      { tag: 'guard',     icon: '🧱', name: '재생 방벽', lv1: { desc: '방벽 최대 HP +20% · 매 턴 5 회복', pct: 0.2, heal: 5 },
                lv2: { name: '초재생 방벽', desc: '방벽 최대 HP +35% · 매 턴 10 회복', pct: 0.35, heal: 10 } },
  plate:      { tag: 'guard',     icon: '🔰', name: '장갑판', lv1: { desc: '방벽이 받는 피해 -20%', red: 0.2 },
                lv2: { name: '복합 장갑', desc: '방벽이 받는 피해 -35%', red: 0.35 } },
  delay:      { tag: 'guard',     icon: '🔌', name: '전자 교란', lv1: { desc: '적이 전진할 때 10% 확률로 멈춤', p: 0.1 },
                lv2: { name: 'EMP 펄스', desc: '적이 전진할 때 20% 확률로 멈춤', p: 0.2 } }
};
// 메타 해금: 처음엔 보드 태그(핀볼·보급) 전부 + 클래스 태그 1종씩(=첫 판부터 세트 가능).
// 스테이지 첫 클리어마다 RELIC_UNLOCK_ORDER 순서로 2종씩 해금 → S3 첫 클리어 시 전 모듈 해금.
const RELIC_START_UNLOCKED = ['elastic', 'chain', 'multishot', 'midas', 'overcharge', 'lucky', 'crit', 'shrapnel', 'steel'];
const RELIC_UNLOCK_ORDER = ['pierce', 'blast', 'plate', 'focus', 'powder', 'delay'];

// ═══════════════ 분기 맵(A안: 스테이지 안의 한 판) ═══════════════
// 층 0 = 첫 전투, 층 1~4 = 갈림길(일반/정예/상점/정비), 층 5 = 보스.
const MAP_CFG = {
  floors: 6,
  nodeTypes: { battle: { icon: '💥', name: '전투' }, elite: { icon: '💀', name: '정예' }, shop: { icon: '🛒', name: '상점' },
               rest: { icon: '🔧', name: '정비' }, boss: { icon: '👾', name: '보스' } },
  weights: { battle: 48, elite: 18, shop: 16, rest: 18 }
};
// 노드별 전투 구성(웨이브 = 마릿수). 층이 깊을수록 커짐. 정예 노드는 정예 적 1 포함 + 웨이브 증가.
//  hpMul·dmgMul = 층(0~4)이 깊을수록 적이 단단하고 아파진다(CFG.floorHp·floorHp2·floorDmg). 런 안에서 레벨·모듈로 강해지는 속도를 따라가게 — 이게 없으면 첫 전투만 위험하고 뒤는 시시하다.
const floorHpMul = (f) => CFG.floorHp0 + CFG.floorHp * f + CFG.floorHp2 * f * f;
const floorDmgMul = (f) => CFG.floorDmg0 + CFG.floorDmg * f;
function nodeCombat(type, floor) {
  const base = 6 + floor * 2, mk = n => new Array(n).fill('x'), hpMul = floorHpMul(floor), dmgMul = floorDmgMul(floor);
  if (type === 'elite') return { name: '정예', elite: true, hpMul, dmgMul, waves: [mk(base + 1), mk(base + 3), mk(base + 5)] };
  return { name: '전투', hpMul, dmgMul, waves: [mk(base), mk(base + 2), mk(base + 4)] };
}
const ELITE = { hpMul: 3.2, dmgMul: 1.8, expMul: 4, gold: 60 };   // 정예 적 배수·보상
const SHOP_PRICE = { relic: 120, relicEvo: 150, heal: 60 };        // 상점(런 골드)
const REST_HEAL = 0.4;                                             // 정비: 최대 HP 40% 회복

// ═══════════════ 스킬 → 다음 판 변화 / 적 → 판 간섭 ═══════════════
// 스킬을 쓰면 다음 장전 판에 흔적을 남김(빌드·연계 재미). kind: 판에 추가할 탄약 or 포켓 효과.
const SKILL_BOARD = {
  bigHit:     { peg: 'bomb',  n: 1, text: '폭탄 탄약 설치' },
  extraShots: { peg: 'mult2', n: 2, text: '증식 탄약 +2' },
  aoe:        { peg: 'bomb',  n: 2, text: '폭탄 탄약 +2' },
  heal:       { buff: 1,              text: '회복 칸 +1' },
  stun:       { peg: 'bumper', n: 1, text: '범퍼 설치' }
};
// 적이 판에 간섭(장전 시작 시 적용, 해당 적이 필드에 있는 동안). 전투에서 먼저 잡을 대상이 생김.
const ENEMY_BOARD = {
  drone:  { steal: 1, text: '해킹드론이 특수 탄약을 교란했어요!' },        // 특수 탄약 → 일반 탄약(해킹)
  sludge: { peg: 'sludge', n: 1, text: '슬러지가 오염 탄약을 뿌렸어요!' },   // 오염 탄약(볼 흡수)
  heavy:  { peg: 'scrap',  n: 1, text: '헤비아머가 파편을 흩뿌렸어요!' }    // 파편(반사만)
};
const ENEMY_BOARD_CAP = 4;   // 적 간섭으로 추가되는 탄약 최대(판이 막히지 않게)
// 보스 예고 패턴: N턴마다 강력한 행동 예고 → 그 턴에 기절시키면 저지.
const BOSS_INTENT = {
  titan:   { every: 3, name: '돌격 모드', desc: '다음 전진 때 2칸 돌진 · 피해 ×1.5' },
  swarm:   { every: 3, name: '대분리 준비', desc: '다음 전진 때 슬러지 3기 분리' },
  carrier: { every: 3, name: '증원 요청', desc: '다음 전진 때 경비봇 4기 사출' }
};
const MANUAL_SKILL_BONUS = 0.2;   // 자동이 아닌 수동 스킬 사용 시 피해 +20%(타이밍 보상)

// ═══════════════ 모드(일일 도전 · 무한) ═══════════════
const MODES = {
  normal:  { name: '일반 출격' },
  daily:   { name: '일일 도전', desc: '오늘의 고정 판 · 같은 시드로 기록 도전', reward: { gems: 40 } },
  endless: { name: '무한 모드', desc: '보스를 잡을 때마다 더 강한 막이 이어짐 · 최고 기록 도전', loopScale: 0.35 }
};
// 콤보: N콤보마다 보너스 장전볼(장전량 = 콤보/COMBO_STEP, 최대 COMBO_MAX)
const COMBO_STEP = 5, COMBO_MAX = 4;
const COMBO_TEXT_SCALE = 0.7;                       // 장전 화면 텍스트 배율(70%) — 팝업 크기·외곽선·글로우와 볼 위 "N HIT" 카운터가 공유
const LOAD_POPUP_PX = 44 * COMBO_TEXT_SCALE;        // 장전 화면 팝업 공통 글자 크기(≈31px): 콤보·JACKPOT·+G·장전·연쇄·포켓 장전 등 종류 불문 동일
// 움직이는 잭팟 포켓: 상단 탄창 위를 좌우로 이동, 그 위로 착지하면 ×JACKPOT_MUL
const JACKPOT_MUL = 3, JACKPOT_SPEED = 1.1;   // 속도 = 초당 포켓 칸 수

// UI 아이콘(DOM): assets/ui/<name>.png 있으면 이모지 대체, 없으면 이모지 폴백(spr-box)
function uiIcon(name, emoji, style) { return '<span class="uic"' + (style ? (' style="' + style + '"') : '') + '><span class="uic-fb">' + emoji + '</span><img class="uic-im" alt="" src="assets/ui/' + name + '.png" onload="this.parentNode.classList.add(\'ok\')" onerror="this.remove()"></span>'; }
// 글줄 속 작은 아이콘(글자 높이 ≈1.15em). 재화는 cur_* 이름을 그대로: ui('cur_gold','🪙')
function ui(name, emoji) { return uiIcon(name, emoji, 'width:1.15em;height:1.15em;vertical-align:-0.2em'); }
const UI_CUR = { gold: ['cur_gold', '🪙'], mats: ['cur_mats', '🔩'], gems: ['cur_gems', '💎'], docs: ['cur_docs', '📄'], shards: ['cur_shard', '🔷'] };
const uiCur = (k) => ui(UI_CUR[k][0], UI_CUR[k][1]);   // 재화 키(gold/mats/gems/docs/shards) → 아이콘
const tagIc = (t) => ui('tag_' + t, RELIC_TAGS[t].icon);   // 모듈 태그(precision/explosive/guard/pinball/harvest) 아이콘
// 숫자 뒤 조사 '을/를' — 읽을 때 받침이 있으면(끝자리 0·1·3·6·7·8) '을', 없으면 '를' (10을 · 15를 · 40을). 수치가 바뀌어도 문장이 맞도록 문구에서 쓴다
const eulReul = (n) => ('013678'.indexOf(String(n).replace(/\D/g, '').slice(-1)) >= 0 ? '을' : '를');
// 도움말 버튼(? 아이콘): [data-help] 는 js/help.js 가 문서 위임으로 연다 → 지도 머리말처럼 다시 그려지는 곳에도 그대로 쓸 수 있다(로비·전투 머리말은 index.html 에 같은 모양으로 직접 써 둠)
const helpBtn = (cls) => '<button class="help-btn ' + cls + '" data-help="open" aria-label="도움말">' + uiIcon('ic_info', '❔') + '</button>';

// ── 전역 헬퍼(보상·패시브에서 사용) ──
// 탄창 개방(보상): 캐릭터가 있고 아직 3칸 안 찬 레인의 탄창을 영구히 +1(다음 전투에도 유지) + 현재 판 즉시 반영
function openOneBlank(S) {
  if (!S.pocketBonus) S.pocketBonus = [0, 0, 0];
  const lane = S.chars.map(c => c.lane).find(l => {
    const c = S.chars.find(ch => ch.lane === l);
    return c && (c.ref.gol + (S.pocketBonus[l] || 0)) < 3;
  });
  if (lane === undefined) return false;                 // 모든 레인 탄창이 이미 꽉 참
  S.pocketBonus[lane] = (S.pocketBonus[lane] || 0) + 1;
  const pk = S.pockets.find(p => p.lane === lane && p.type === 'blank');
  if (pk) pk.type = 'charge';                           // 현재 판에도 즉시 반영
  return true;
}
// 임시 탄창 개방(패시브): 현재 판의 꽝 칸 하나만 탄창으로(영구 아님, 다음 전투엔 재계산)
function openBlankTemp(S) {
  const lanesWithChar = new Set(S.chars.map(c => c.lane));
  const cand = S.pockets.filter(p => p.type === 'blank' && lanesWithChar.has(p.lane));
  if (cand.length) cand[0].type = 'charge';
}
// 판에 탄약 추가(보상·모듈·스킬·적 간섭 공용). 반환: 추가된 탄약 배열.
//  - 모든 탄약(터진 탄약 포함 — 다음 턴 부활하므로)과 최소 간격 확보(px 로 잰다 — 가로·세로 같은 잣대)
//  - 고정 장애물(범퍼/기둥)과 겹치지 않게 회피
//  - opts.avoidLaunch: 중앙 발사열(fx 0.42~0.58) 회피(영구 반사체용 — 수직 발사 정면충돌 방지)
const PEG_BOARD = { w: 311, h: 341 };   // 기준 판 크기(px) — game.js REF_PINS_W 와 같은 가로, 세로는 같은 화면 비율(9:16 프레임이라 늘 같다)
function addPegToBoard(S, type, n, opts) {
  opts = opts || {};
  const RW = PEG_BOARD.w, RH = PEG_BOARD.h, need = CFG.pegSpacing * 0.8, out = [];
  const obst = S.obstacles || [];
  const blocked = (fx, fy) => {
    for (const o of obst) {
      if (o.t === 'bar') { if (fx > o.fx - 0.05 && fx < o.fx + o.fw + 0.05 && fy > o.fy - 0.05 && fy < o.fy + o.fh + 0.05) return true; continue; }
      const dx = (fx - o.fx) * RW, dy = (fy - o.fy) * RH, rr = (o.r || 0.06) * RW + CFG.ballRadius + CFG.pegRadius * 1.3;
      if (dx * dx + dy * dy < rr * rr) return true;
    }
    return opts.avoidLaunch && fx > 0.42 && fx < 0.58;
  };
  for (let i = 0; i < n; i++) {
    let best = null, bestD = -1;
    for (let t = 0; t < 40; t++) {
      const fx = 0.12 + Math.random() * 0.76, fy = 0.12 + Math.random() * 0.58;
      if (blocked(fx, fy)) continue;
      let md = 1e9;
      for (const p of S.pegs) { const d = Math.hypot((fx - p.fx) * RW, (fy - p.fy) * RH); if (d < md) md = d; }
      if (md > bestD) { bestD = md; best = { fx, fy }; }
      if (md >= need * 1.4) break;               // 충분히 떨어진 자리면 즉시 채택
    }
    if (!best || bestD < need) continue;         // 자리가 없으면 추가 생략(겹침보다 생략이 낫다)
    const p = makePeg(best.fx, best.fy, type); S.pegs.push(p); out.push(p);
  }
  return out;
}

// ══════════ 이미지 에셋 로더 · 스프라이트 시트 ══════════
// 이미지가 없거나 로딩 중이면 null/false 를 돌려주고, 호출한 쪽이 도형·이모지로 폴백한다.
function loadImg(src) {
  const img = new Image();
  img.decoding = 'async';
  img.__ok = false;
  img.onload = function () { img.__ok = img.naturalWidth > 0; };
  img.onerror = function () { img.__ok = false; };
  img.src = src;
  return img;
}

// 그림 주소 캐시 버스트 — index.html 이 이 스크립트를 부를 때 붙인 ?v=NNN 을 캐릭터·적 그림 주소에도 붙인다(그림만 바꿔 배포해도 브라우저가 옛 파일을 쓰지 않게)
const ASSET_Q = (function () { try { const m = /[?&]v=([\w.-]+)/.exec(document.currentScript.src); return m ? '?v=' + m[1] : ''; } catch (e) { return ''; } })();

// ── 캐릭터 아트 로더 ──
// assets/char/<id>_cg.webp(CG) · <id>_sheet.webp(애니메이션 시트 4×4) · <id>_thumb.webp(편성칩·상점·가챠용 정면 대기 컷 320×320)
// 시트·CG·썸네일은 변환 때 샤프닝(tools/sharpen.ps1)이 걸려 있다 — 도트풍 그림이 줄어들 때 뭉개져 보이는 것을 막기 위함.
const CharArt = (function () {
  const cache = {};   // key '<id>_<state>' → Image
  const SUF = { cg: '_cg', cgm: '_cgm', sheet: '_sheet', thumb: '_thumb' };   // cgm = 가로 640 중간 크기 CG(작게 보이는 상세 팝업용 — 큰 CG 를 3배 넘게 줄이면 뭉개짐)
  const norm = (state) => SUF[state] ? state : 'thumb';          // 구 'load'/'fire'(2장 스프라이트) 요청은 썸네일로
  function path(id, state) { return 'assets/char/' + id + SUF[norm(state)] + '.webp' + ASSET_Q; }
  // 작게 보이는 칸(캐릭터 상세 팝업)용 CG 주소 — 앱 가로 기기 픽셀(CSS px × DPR)이 1700 이하면 중간 크기(cgm), 그보다 크면 원본(cg)
  function small(id) { const app = document.getElementById('app'), w = (app ? app.clientWidth : window.innerWidth) * (window.devicePixelRatio || 1); return path(id, w > 1700 ? 'cg' : 'cgm'); }
  function load(id, state) { const k = id + '_' + norm(state); return cache[k] || (cache[k] = loadImg(path(id, state))); }
  // 캔버스용: 로드 완료+성공이면 Image, 아니면 null
  function sprite(id, state) { const img = load(id, state); return (img.__ok && img.complete) ? img : null; }
  // 미리 받아 두기(편성 3인의 시트는 출격 직전에)
  function preload(ids, states) { (ids || []).forEach(function (id) { if (id) (states || ['sheet']).forEach(function (s) { load(id, s); }); }); }
  return { path: path, small: small, load: load, sprite: sprite, preload: preload };
})();

// ── 캔버스 이미지 로더(공통) ── 있으면 Image, 없으면 null(게임이 도형으로 폴백)
function makeCanvasLoader(dir, ext, exts, bust) {     // bust=true 면 주소에 ?v=빌드 를 붙인다(자주 바뀌는 그림만)
  const cache = {};
  function ready(name) {
    let img = cache[name];
    if (!img) { img = loadImg(dir + name + '.' + ((exts && exts[name]) || ext || 'png') + (bust ? ASSET_Q : '')); cache[name] = img; }
    return (img.__ok && img.complete) ? img : null;
  }
  function preload(names) { (names || []).forEach(ready); }
  return { ready: ready, preload: preload };
}
// FX 시트: assets/fx/<name>.png — muzzle 512×128(4) · shell 256×128(2) · boom 1024×512(4×2) · hit_spark 512×128(4)
const FxArt = makeCanvasLoader('assets/fx/', 'png');
// 적/보스 시트: assets/enemy/<id>.webp — 일반 1024×256(4프레임) · 보스 2048×1024(행0 이동 4 + 행1 상태 프레임)
const EnemyArt = makeCanvasLoader('assets/enemy/', 'webp', null, true);
const enemyUrl = (key) => 'assets/enemy/' + key + '.webp' + ASSET_Q;   // CSS 배경으로 쓰는 곳(적 요약 줄·스테이지 정보)도 같은 주소(캐시 공유·버스트)
// 탄약/장애물: assets/peg/<id>.png (peg_normal/…, obst_bumper/…). 없으면 도형 폴백.
const PegArt = makeCanvasLoader('assets/peg/', 'png');
// 배경/영역 레이어: assets/bg/<name>.webp (bg_field/bg_wall/bg_board) · frame_pocket 만 png
const BgArt = makeCanvasLoader('assets/bg/', 'webp', { frame_pocket: 'png' });
// UI 아이콘(캔버스에 그릴 때): assets/ui/<name>.png (DOM 에서는 uiIcon/ui 사용)
const UiArt = makeCanvasLoader('assets/ui/', 'png');
// UI 스킨 조각(캔버스에 그리는 것): assets/ui/skin/<이름>.png — 레인 이름표(pocket_plate)·전투 시작 띠(band_battle)·스킬 컷인 띠(band_cutin). DOM 쪽 스킨은 css/skin.css 가 맡는다.
const SkinArt = makeCanvasLoader('assets/ui/skin/', 'png');

// 캔버스 해상도 배율(전투·홈 캔버스 공용): 기기 화소 비율을 그대로 따른다 — 이전엔 2 로 막아서 DPR 3 폰에서 캔버스가 CSS 로 1.5배 늘어나 전부 흐렸다.
// 2 이하는 그대로, 2 초과는 최대 3 까지 올리되 백킹 스토어가 너무 커지면(≈3.2M 화소) 줄이되 2 아래로는 내리지 않는다.
function canvasDpr(w, h) {
  const d = window.devicePixelRatio || 1;
  if (d <= 2) return d;
  return Math.max(2, Math.min(3, d, Math.sqrt(3.2e6 / Math.max(1, w * h))));
}

// ── 시트 그리기 도구 ──
// 큰 시트를 2배 이상 줄여 그리면 계단·반짝임이 생기므로, 절반(1/2, 1/4) 크기 사본을 한 번 만들어 거기서 샘플링한다.
const SpriteMip = (function () {
  const cache = new WeakMap();
  function level(img, l) {
    let a = cache.get(img); if (!a) { a = [img]; cache.set(img, a); }
    for (let i = 1; i <= l; i++) {
      if (a[i]) continue;
      const p = a[i - 1], c = document.createElement('canvas');
      c.width = Math.max(1, Math.round((p.naturalWidth || p.width) / 2)); c.height = Math.max(1, Math.round((p.naturalHeight || p.height) / 2));
      const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(p, 0, 0, c.width, c.height);
      a[i] = c;
    }
    return a[l];
  }
  // need = (화면에 그릴 크기 ÷ 원본 크기). 0.5 이하면 한 단계(0.25 이하면 두 단계) 줄인 사본과 그 배율(f)을 돌려준다
  function pick(img, need) { let l = 0; while (l < 2 && need * (2 << l) <= 1.0001) l++; return { src: l ? level(img, l) : img, f: 1 / (1 << l) }; }
  return { pick: pick };
})();
function _devScale(ctx) { const m = ctx.getTransform ? ctx.getTransform() : null; return m ? (Math.hypot(m.c, m.d) || 1) : 1; }   // 세로축 배율(좌우 반전·섬광 회전의 영향을 받지 않음)
// 시트의 한 칸(sx,sy,sw,sh = 원본 좌표)을 (dx,dy,dw,dh)에 그린다.
function drawCell(ctx, img, sx, sy, sw, sh, dx, dy, dw, dh) {
  const mp = SpriteMip.pick(img, (dw * _devScale(ctx)) / sw), f = mp.f;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(mp.src, sx * f, sy * f, sw * f, sh * f, dx, dy, dw, dh);
}
// 같은 칸을 단색으로 덮어 그린다(피격 흰 번쩍임·기절 색조) — 스프라이트 실루엣 안쪽만 칠해진다.
const _tintBuf = { c: null, g: null };
function drawCellTint(ctx, img, sx, sy, sw, sh, dx, dy, dw, dh, color, alpha) {
  const sc = _devScale(ctx), tw = Math.max(1, Math.ceil(dw * sc)), th = Math.max(1, Math.ceil(dh * sc)), t = _tintBuf;
  if (!t.c) { t.c = document.createElement('canvas'); t.c.width = t.c.height = 128; t.g = t.c.getContext('2d'); }
  if (t.c.width < tw || t.c.height < th) { t.c.width = Math.max(t.c.width, tw); t.c.height = Math.max(t.c.height, th); }   // 커질 때만 재할당
  const g = t.g, mp = SpriteMip.pick(img, tw / sw), f = mp.f;
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.clearRect(0, 0, t.c.width, t.c.height);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(mp.src, sx * f, sy * f, sw * f, sh * f, 0, 0, tw, th);
  g.globalCompositeOperation = 'source-atop'; g.globalAlpha = alpha; g.fillStyle = color; g.fillRect(0, 0, tw, th);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  ctx.drawImage(t.c, 0, 0, tw, th, dx, dy, dw, dh);
}

// ── 캐릭터 애니메이션 ──
// 시트 4×4(셀 320): 행0 idle(정면 3/4, 루프) · 행1 reload(1회, r3≡i0) · 행2 fire(뒷모습: f0 조준·f1 발사·f2 반동·f3 복귀) · 행3 turn(t0,t1 — 앞→뒤 순재생 / 뒤→앞 역재생)
// 상태: idle → [toBack → aim → fire…] → toFront → idle.  발 중심(x)·총구 좌표는 js/spritemeta.js(SHEET_META, tools/measure-sheets.ps1 로 측정)
const CharAnim = (function () {
  const CELL = 320, FOOT_Y = 292;
  const SEQ = {
    idle:    { f: [[0, 0], [0, 1], [0, 2], [0, 3]], d: [1 / 6], loop: true },
    reload:  { f: [[1, 0], [1, 1], [1, 2], [1, 3]], d: [0.09], next: 'idle' },
    toBack:  { f: [[3, 0], [3, 1]], d: [0.075], next: 'aim' },
    aim:     { f: [[2, 0]], d: [1], loop: true },
    fire:    { f: [[2, 1], [2, 2], [2, 3]], d: [0.05, 0.08, 0.09], next: 'aim' },
    toFront: { f: [[3, 1], [3, 0]], d: [0.075], next: 'idle' }
  };
  const dur = (s, i) => s.d[Math.min(i, s.d.length - 1)];
  const FRONT = { idle: 1, reload: 1, toFront: 1 };           // 정면을 보고 있는 상태
  function set(a, st, keep) { a.st = st; a.i = 0; if (!keep) a.t = 0; }
  function create(id) {
    const a = { id: id, st: 'idle', i: 0, t: 0, face: 1, faceT: 1, q: null, wait: 0, then: null };
    a.i = Math.floor(Math.random() * 4); a.t = Math.random() * (1 / 6);            // 캐릭터마다 숨쉬기 위상을 어긋나게
    return a;
  }
  function update(a, dt) {
    if (a.wait > 0) { a.wait -= dt; if (a.wait <= 0 && a.then) { const n = a.then; a.then = null; set(a, n); } }   // 시차 대기 중에도 숨쉬기(idle)는 계속
    let s = SEQ[a.st]; a.t += dt;
    for (let guard = 0; guard < 8; guard++) {
      const d = dur(s, a.i);
      if (a.t < d) break;
      a.t -= d;
      if (a.i + 1 < s.f.length) a.i++;
      else if (s.loop) a.i = (a.i + 1) % s.f.length;
      else { const nx = a.q || s.next; a.q = null; set(a, nx, true); s = SEQ[a.st]; }
    }
    // 좌우 반전은 뒷모습(조준·발사)에서만 — 돌아서는 동작과 정면 자세는 항상 원본 방향(손이 바뀌어 보이는 것 방지). 방향이 바뀔 땐 몸을 휙 돌리듯 폭이 줄었다 펴진다
    const wf = (a.st === 'aim' || a.st === 'fire') ? a.faceT : 1;
    if (a.face !== wf) { const st = dt * 16; a.face = Math.abs(wf - a.face) <= st ? wf : a.face + Math.sign(wf - a.face) * st; }
  }
  // 정면 자세로: 뒷모습(조준·발사·돌아서는 중)이면 돌아서고, reload=true 면 돌아선 뒤 재장전 동작을 한 번 재생
  function toIdle(a, reload) {
    a.wait = 0; a.then = null;
    if (a.st === 'aim' || a.st === 'fire') { set(a, 'toFront'); a.q = reload ? 'reload' : 'idle'; }
    else if (a.st === 'toBack') { const i = a.i; set(a, 'toFront'); a.i = 1 - i; a.q = reload ? 'reload' : 'idle'; }   // 도는 중이면 그 지점에서 되감기
    else if (a.st === 'toFront') a.q = reload ? 'reload' : 'idle';
    else if (reload && a.st === 'idle') set(a, 'reload');
  }
  // 조준 자세로(뒷모습): delay 초 뒤에 돌기 시작(캐릭터별 시차)
  function toAim(a, delay) {
    if (!FRONT[a.st]) return;                                    // 이미 돌아섰거나 도는 중
    if (a.st === 'toFront') { const i = a.i; set(a, 'toBack'); a.i = 1 - i; a.q = null; return; }
    if (delay > 0) { a.wait = delay; a.then = 'toBack'; return; }
    set(a, 'toBack');
  }
  // 발사 동작(f1→f2→f3→f0). dir = -1/+1: 목표가 있는 쪽을 바라보도록 좌우 반전(생략 시 현 방향 유지)
  function fire(a, dir) {
    if (dir) a.faceT = dir < 0 ? -1 : 1;
    a.wait = 0; a.then = null;
    if (FRONT[a.st]) { toAim(a, 0); a.q = 'fire'; return; }      // 아직 정면이면 돌아선 뒤 바로 발사
    set(a, 'fire');
  }
  function reload(a) { if (a.st === 'idle') set(a, 'reload'); }
  const isAimed = (a) => a.st === 'aim' || a.st === 'fire';
  const isFront = (a) => !!FRONT[a.st] && !(a.wait > 0);
  // 현재 칸 [행, 열]
  function cell(a) { const s = SEQ[a.st]; return s.f[Math.min(a.i, s.f.length - 1)]; }
  // 행별 발 중심 x(프레임 평균 — 프레임마다 피벗을 옮기면 몸이 출렁여 보임)
  const pivCache = {};
  function pivotX(id, row) {
    const k = id + row; if (pivCache[k] !== undefined) return pivCache[k];
    const m = (typeof SHEET_META !== 'undefined') && SHEET_META[id]; let v = 160;
    if (m) { const n = row === 3 ? 2 : 4; let s = 0; for (let c = 0; c < n; c++) s += m.foot[row * 4 + c]; v = s / n; }
    return (pivCache[k] = v);
  }
  // 시트 현재 칸을 발(x, feetY) 기준으로 size×size 에 그린다. 시트가 아직 없으면 정면 썸네일로 대신하고, 둘 다 없으면 false
  function draw(ctx, a, x, feetY, size) {
    const k = size / CELL, fc = Math.abs(a.face) < 0.22 ? (a.face < 0 ? -0.22 : 0.22) : a.face;   // 방향 전환 중에도 완전히 사라지지 않게 최소 폭 유지
    const sheet = CharArt.sprite(a.id, 'sheet');
    ctx.save(); ctx.translate(x, feetY); if (fc !== 1) ctx.scale(fc, 1);
    let ok = false;
    if (sheet) { const rc = cell(a), r = rc[0], c = rc[1]; drawCell(ctx, sheet, c * CELL, r * CELL, CELL, CELL, -pivotX(a.id, r) * k, -FOOT_Y * k, size, size); ok = true; }
    else { const th = CharArt.sprite(a.id, 'thumb'); if (th) { drawCell(ctx, th, 0, 0, 320, 320, -size * 0.5, -size * (FOOT_Y / CELL), size, size); ok = true; } }   // 썸네일 = 시트 i0 를 줄이지 않고 잘라 낸 320×320
    ctx.restore(); return ok;
  }
  // 총구 좌표(캔버스 좌표) — col: 사격 프레임 0~3. 반환 ang = 포신 방향(라디안, 캔버스 좌표계: 0=오른쪽, 위쪽은 음수)
  function muzzle(a, x, feetY, size, col) {
    const m = (typeof SHEET_META !== 'undefined') && SHEET_META[a.id], k = size / CELL, f = a.faceT;
    if (!m) return { x: x + f * size * 0.25, y: feetY - size * 0.7, ang: f > 0 ? -0.8 : -2.34 };
    const z = m.muz[Math.max(0, Math.min(3, col | 0))], rad = z[2] * Math.PI / 180;
    return { x: x + (z[0] - pivotX(a.id, 2)) * k * f, y: feetY + (z[1] - FOOT_Y) * k, ang: Math.atan2(-Math.sin(rad), Math.cos(rad) * f) };
  }
  return { create: create, update: update, toIdle: toIdle, toAim: toAim, fire: fire, reload: reload, isAimed: isAimed, isFront: isFront, draw: draw, muzzle: muzzle, cell: cell };
})();

// ── 적/보스 애니메이션 ──
// 일반 적: 1024×256 = 이동 4프레임(제자리에선 느리게, 이동 중엔 빠르게 재생). 보스: 2048×1024 = 행0 이동 4 + 행1 상태 프레임
//  titan[돌격 준비, 돌격, 과열 열림, 과열 정점] · swarm[분리 준비, 분리 폭발] · carrier[해치 열림, 투하]
const EnemyAnim = (function () {
  const POSE = {
    titan:   { charge: [[0, 0.42], [1, 0.60]], overheat: [[2, 0.30], [3, 0.55]] },
    swarm:   { split: [[0, 0.34], [1, 0.46]] },
    carrier: { launch: [[0, 0.30], [1, 0.50]] }
  };
  const nameOf = (e) => e.isBoss ? 'boss_' + (e.kind || 'titan') : e.type;
  // 상태 프레임 재생 시작(예: pose(e, 'charge')) — 보스 전용
  function pose(e, name) { const s = e.isBoss && POSE[e.kind] && POSE[e.kind][name]; if (!s) return 0; let tot = 0; for (const f of s) tot += f[1]; e.pose = { seq: s, t0: performance.now() / 1000, total: tot }; return tot; }
  // 현재 프레임 {img, sx, sy, sw, sh} (시트가 없으면 null). now = 초, moving = 이동 중 여부
  function frame(e, now, moving) {
    const img = EnemyArt.ready(nameOf(e)); if (!img) return null;
    const boss = !!e.isBoss, cs = boss ? 512 : 256;
    if (e.ph === undefined) e.ph = Math.random() * 4;
    let row = 0, col;
    const P = e.pose;
    if (boss && P && now < P.t0 + P.total) {
      let t = now - P.t0, c = P.seq[P.seq.length - 1][0];
      for (const f of P.seq) { if (t < f[1]) { c = f[0]; break; } t -= f[1]; }
      row = 1; col = c;
    } else if (boss && e.kind === 'titan' && e.stun > 0) { row = 1; col = 2 + (Math.floor(now * 2.5) & 1); }   // 기절 = 과열 환기
    else col = Math.floor(now * (moving ? 9 : 3) + e.ph) & 3;
    return { img: img, sx: col * cs, sy: row * cs, sw: cs, sh: cs };
  }
  return { pose: pose, frame: frame, name: nameOf };
})();

// ── FX 시트 그리기 ── 시트가 없으면 false(호출한 쪽이 절차적 효과로 폴백)
const FxTint = (function () {
  const cache = {};
  function get(name, color, alpha) {
    const img = FxArt.ready(name); if (!img) return null;
    const k = name + '|' + color + '|' + alpha; if (cache[k]) return cache[k];
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0); g.globalCompositeOperation = 'source-atop'; g.globalAlpha = alpha; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
    return (cache[k] = c);
  }
  return { get: get };
})();
const FxSheet = {
  // 총구 섬광(위쪽이 앞) — (x,y)=섬광 밑동, ang=포신 방향(라디안), size=칸 한 변(화면 px), p=진행 0→1, color=착색(클래스 색)
  muzzle: function (ctx, x, y, ang, size, p, color) {
    const img = FxArt.ready('muzzle'); if (!img) return false;
    const src = (color && FxTint.get('muzzle', color, 0.5)) || img;
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang + Math.PI / 2);
    drawCell(ctx, src, Math.min(3, Math.floor(p * 4)) * 128, 0, 128, 128, -size / 2, -size * (114 / 128), size, size);
    ctx.restore(); return true;
  },
  // 포탄(위쪽이 탄두, 아래가 꼬리 불꽃) — (x,y)=탄체 중심, ang=비행 방향(라디안), tsec=시간(초, 꼬리 불꽃 2프레임 번갈아)
  shell: function (ctx, x, y, ang, size, tsec) {
    const img = FxArt.ready('shell'); if (!img) return false;
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang + Math.PI / 2);
    drawCell(ctx, img, (Math.floor(tsec * 16) & 1) * 128, 0, 128, 128, -size / 2, -size * (57 / 128), size, size);
    ctx.restore(); return true;
  },
  // 폭발(8프레임 4×2) — (x,y)=중심, p=진행 0→1
  boom: function (ctx, x, y, size, p) {
    const img = FxArt.ready('boom'); if (!img) return false;
    const i = Math.min(7, Math.floor(p * 8));
    drawCell(ctx, img, (i % 4) * 256, Math.floor(i / 4) * 256, 256, 256, x - size / 2, y - size / 2, size, size); return true;
  },
  // 히트 스파크(4프레임) — (x,y)=중심, p=진행 0→1, color=착색
  hit: function (ctx, x, y, size, p, color) {
    const img = FxArt.ready('hit_spark'); if (!img) return false;
    const src = (color && FxTint.get('hit_spark', color, 0.6)) || img;
    drawCell(ctx, src, Math.min(3, Math.floor(p * 4)) * 128, 0, 128, 128, x - size / 2, y - size / 2, size, size); return true;
  }
};
