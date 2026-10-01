'use strict';
/* PONGTRESS 콘텐츠·수치 데이터 (프로토타입 슬라이스)
 * 밸런스 수치는 여기 한곳. game.js 보다 먼저 로드된다.
 */
const CFG = {
  lanes: 3,                // 캐릭터 편성(방벽) 레인 수 — 골칸·포켓도 이 값 기준
  fieldLanes: 6,           // 적 필드 열 수(캐릭터 레인과 분리). 공격은 레인 무관 맨 앞 타겟
  pegCols: 9,              // 조밀 격자 패턴의 열 수
  pegRows: 12,             // 조밀 격자 패턴의 행 수
  pegStep: 0.05,           // 패턴 선을 따라 페그를 놓는 간격(fx/fy). 작을수록 촘촘
  pegMinGap: 0.05,         // 페그 최소 간격(겹침 방지, 세로 비율 보정). 작을수록 촘촘
  normalPegHits: 1,        // (레거시) 페그는 이제 충돌 시 볼로 변환됨 — 내구도 미사용
  harvestPerBall: 8,       // 볼 하나가 이번 궤적에서 충전 볼로 바꿀 수 있는 페그 최대 수(과충전 방지, 판은 유지)
  battleShotMinDelay: 90,  // ms, 전투 발사 최소 간격(탄환 많을 때 자동 단축 하한) — 크면 전투가 느려짐
  battleWindow: 4500,      // ms, 전투 발사 목표 총 시간(탄환 수로 나눠 간격 자동 결정) — 크면 전투가 느려짐
  fieldRows: 5,            // 적 대기 필드 세로 칸 수(레인당)
  launchesPerTurn: 2,      // 한 장전 턴에 쏘는 볼 수(기본). 패시브로 증가 예정
  maxBalls: 140,           // 볼 폭주 방지 상한(수확 볼이 동시에 많이 뜨므로 상향)
  gravity: 0,              // 무중력(퍼즐 보블): 볼은 직선+반사로 이동, 무조건 위로 올라감
  restitution: 0.98,       // 페그 반사 시 에너지 거의 유지(가라앉지 않게)
  wallRestitution: 1.0,    // 벽·바닥 완전 반사
  ballRadius: 7,
  pegRadius: 9,
  launchSpeed: 820,        // 발사 속도(고정). 조준은 각도만
  aimMinUp: 0.3,           // 조준 하한(수평 근처)을 막아 항상 위로 향하게 (vy < -aimMinUp*speed)
  ballLifetime: 6,         // s, 이 시간 넘으면 제거하지 않고 상단으로 점점 강하게 유도(상단 포켓 도달 전엔 절대 소멸 안 함)
  battleShotDelay: 240,    // ms, 전투 phase 공격 1발 간 간격(보이게 느리게)
  battleStartDelay: 500,   // ms, 전투 phase 시작 후 첫 공격까지
  battleEndDelay: 800,     // ms, 마지막 공격 후 적 전진까지
  enemyContactFlash: 250
};

// ── 페그 종류(모양·기능) — 실제 핀볼처럼 다양하게 ──
// shape: 기본 렌더 모양 · size: 기본 크기 배수(반경) · weight: 판 생성 가중치 · oneShot: 맞으면 이번 턴 비활성(다음 턴 부활)
// 기능: split(볼 분열 수) · boost(속도 킥 배수, 영구 범퍼) · gold(획득 골드) · atk(이번 턴 공격 버프)
const PEG_TYPES = {
  normal: { name: '일반',   color: '#8f86d6', shape: 'circle',   size: 1.0,  weight: 52, oneShot: false },
  mult2:  { name: '증식×2', color: '#ffcf5c', shape: 'diamond',  size: 1.05, weight: 15, oneShot: true,  split: 1, label: '×2' },
  mult5:  { name: '증식×5', color: '#ff5db1', shape: 'star',     size: 1.3,  weight: 5,  oneShot: true,  split: 4, label: '×5' },
  bumper: { name: '범퍼',   color: '#46e6d0', shape: 'bumper',   size: 1.5,  weight: 0,  oneShot: false, boost: 1.28 },  // weight0=랜덤 스폰 제외(범퍼는 고정 장애물로 이전, 패시브/보상 설치만)
  gold:   { name: '크레딧', color: '#ffd93b', shape: 'hex',      size: 1.1,  weight: 8,  oneShot: true,  gold: 15, label: '$' },
  charge: { name: '증폭',   color: '#7ef29a', shape: 'triangle', size: 1.15, weight: 6,  oneShot: true,  charge: 3, label: '⚡' },  // 충전 ×3 볼 생성(탄약·스킬게이지 대량 충전)
  // ── 아래는 랜덤 스폰 제외(weight 0): 스킬·적 간섭으로만 생성 ──
  bomb:   { name: '폭탄',   color: '#ff8a3a', shape: 'circle',   size: 1.25, weight: 0,  oneShot: true,  bomb: 0.16, label: '✹' },  // 맞으면 주변 페그 연쇄 폭발(스킬이 남김)
  scrap:  { name: '파편',   color: '#7a7f8c', shape: 'pentagon', size: 1.35, weight: 0,  oneShot: false, scrap: true },               // 반사만(변환·소멸 없음) — 헤비아머/타이탄이 설치
  sludge: { name: '오염',   color: '#5ad0a0', shape: 'circle',   size: 1.2,  weight: 0,  oneShot: true,  sludge: true, label: '≈' }   // 발사볼을 삼킴(충전 없이 소멸) — 슬러지가 설치
};
// 일반(반사) 페그는 모두 원형으로 통일(가독성·정렬감).
const NORMAL_SHAPES = ['circle'];

// 페그 하나 생성: 종류별 기본 크기 × 개별 지터(±) → 물리 반경(pr)·모양(shape) 확정
function makePeg(fx, fy, type) {
  const def = PEG_TYPES[type] || PEG_TYPES.normal;
  const jitter = 0.82 + Math.random() * 0.42;                 // 0.82~1.24 크기 편차
  const pr = CFG.pegRadius * (def.size || 1) * jitter;
  const shape = (type === 'normal') ? NORMAL_SHAPES[Math.floor(Math.random() * NORMAL_SHAPES.length)] : def.shape;
  return { fx, fy, type, alive: true, pr, shape, hits: 0 };
}

// 레벨업에 필요한 누적 경험치: 레벨 L→L+1 (충전·처치가 늘어난 만큼 완만하게)
function expToNext(level) { return 16 + level * 11; }

// ── 캐릭터 (프로토타입: 처음부터 3명 배치. 편성/가챠는 다음 패스) ──
// atk 공격력(발당 피해) · hp 체력(방벽 HP에 합산) · gol 고정 골칸 수(레인 3칸 중 충전 칸)
// active 액티브 스킬(게이지 N) · passive 패시브(보드 효과, 이번 패스 일부만 구현)
const RARITY = { common: { name: '커먼', color: '#9aa2c0' }, rare: { name: '레어', color: '#5cc8ff' }, epic: { name: '에픽', color: '#c98bff' }, legendary: { name: '레전더리', color: '#ffce54' } };
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
    passive: { name: '탄약 보급', kind: 'addBall', n: 1 } },
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
    passive: { name: '탄약 보급', kind: 'addBall', n: 1 } },
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
    passive: { name: '탄약 투하', kind: 'addBall', n: 2 } }
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
function stageScale(s) {
  s = Math.max(1, Math.min(STAGE_MAX, s || 1));
  return {
    hp: 1 + (s - 1) * 0.65,     // 적/보스 체력 배수: S1=1 … S5=3.6
    dmg: 1 + (s - 1) * 0.42,    // 적 공격 배수: S1=1 … S5=2.68 (방벽 압박)
    exp: 1 + (s - 1) * 0.40,    // 경험치 배수
    reward: 1 + (s - 1) * 0.60  // 메타 화폐 보상 배수: S1=1 … S5=3.4
  };
}

// 시작 메타 상태(3인 보유로 바로 플레이 가능, 가챠용 보석 지급)
const META_START = {
  currencies: { gold: 200, mats: 120, gems: 320, docs: 0 },
  shards: {},
  owned: { knight: { level: 1, star: 1 }, grenadier: { level: 1, star: 1 }, guard: { level: 1, star: 1 } },
  party: ['knight', 'grenadier', 'guard'],   // 사수·포수·지원 커먼 1명씩
  stage: 1, maxStage: 1,
  stats: { runsWon: 0, kills: 0, floors: 0 },
  claimed: {},
  daily: { freeGachaDate: '' },
  idle: { last: 0 }               // 방치 보상 마지막 정산 시각(ms). 0이면 최초 진입 시 now로 초기화
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
  sentry: { name: '경비봇',   hp: 68,  dmg: 13, exp: 6,  color: '#6fb1e8', speed: 1, armor: 0 },   // 기본 보병형 로봇(보스 부하도 이 유닛)
  drone:  { name: '해킹드론', hp: 43,  dmg: 10, exp: 5,  color: '#9b6cff', speed: 1, armor: 0 },   // 비행 드론 — 특수 페그를 해킹(일반화)
  walker: { name: '워커',     hp: 138, dmg: 22, exp: 15, color: '#e0733a', speed: 1, armor: 0 },   // 중형 이족 전투기(고체력·고공격)
  hound:  { name: '하운드',   hp: 51,  dmg: 13, exp: 9,  color: '#e8b04a', speed: 2, armor: 0 },   // 사족보행 로봇견 — 빠름(턴당 2칸)·물몸
  heavy:  { name: '헤비아머', hp: 200, dmg: 24, exp: 22, color: '#7f8aa0', speed: 1, armor: 4 },   // 대형 기갑 — 장갑(피격 -4)
  sludge: { name: '슬러지',   hp: 84,  dmg: 13, exp: 8,  color: '#5ad0a0', speed: 1, armor: 0 }    // 오염된 나노 젤 — 오염 페그(볼 흡수)
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
  titan:   { name: '타이탄', kind: 'titan', hp: 1320, dmg: 50, exp: 110, color: '#8a8f9a',
             thresholds: [0.75, 0.5, 0.25], retreat: 2, stunTurns: 1, vulnerable: 0.5 },   // 돌격형: HP% 구간마다 과열 정지(후퇴+스턴), 코어 노출 중 피해+50%
  swarm:   { name: '스웜 코어', kind: 'swarm', hp: 1080, dmg: 32, exp: 130, color: '#5ad0a0',
             thresholds: [0.66, 0.33], splitCount: 2 },                                     // 분리형: 임계마다 슬러지 분리
  carrier: { name: '드론 모함', kind: 'carrier', hp: 1600, dmg: 28, exp: 150, color: '#5f8fd0',
             addType: 'sentry' }                                                            // 정지형: 매 턴 경비봇 사출
};
function stageBoss(s) { return s >= 5 ? 'carrier' : s >= 3 ? 'swarm' : 'titan'; }

// ── 스테이지별 고정 페그판 ──
// [전투0, 전투1, 전투2, 보스] 순. 매 판 랜덤이던 것을 스테이지·전투마다 고정 → 밸런스 재현성 확보.
// 중앙 집중형 그림 패턴(heart/star/rings/diamonds)에는 좌우 레일이 자동 추가되어 양옆 레인도 장전 가능(pegLayout 참조).
const STAGE_BOARDS = {
  1: ['grid', 'chevrons', 'diamonds', 'cross'],
  2: ['chevrons', 'zigzag', 'rings', 'grid'],
  3: ['zigzag', 'diamonds', 'heart', 'cross'],
  4: ['cross', 'chevrons', 'star', 'rings'],
  5: ['grid', 'zigzag', 'star', 'heart']
};

// ── 스테이지별 고정 장애물(실제 핀볼판 느낌) ──
// 좌표=핀볼판(pins) 비율. t: bumper(강한 반사·발광) / pillar(단단한 반사).
// {t,fx,fy,r(폭 비율)} — 원형만 사용.
// ⚠ 설계 규칙(무중력·완전반사라 함정이 잘 생김):
//   ① 원형(bumper/pillar)만 — 수평 '바'는 발사구 위에서 볼을 바닥과 무한 반사시켜 금지.
//   ② 발사 부채꼴(하단) 비움: 모든 장애물 fy ≤ 0.58.
//   ③ 중앙 발사 열(fx 0.42~0.58)은 어떤 높이에도 장애물 금지 → 수직 발사가 정면충돌로
//      영구 반사(무한 튕김)되지 않게. 좌우 대칭 페어로 배치. (수직 발사는 중앙 페그를
//      소모하며 통과 → 페그는 맞으면 사라지므로 영구 함정이 아님)
//   ④ buildBoard가 장애물과 겹치는 페그를 자동 제거(겹침 방지).
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
// 개편 원칙: 선택 시 '항상' 효과가 있어야 함(무효화 없음) + 판(페그/장애물)을 건드리지 않음(겹침 방지).
//   → 골칸 개방/버프 칸(포켓 꽉 차면 무효)·증식판/범퍼 설치(페그 겹침)는 제거하고 순수 스탯 보상으로 교체.
const REWARDS = [
  { id: 'heal',  name: '🔧 수리',      desc: '방벽 HP +30',                  apply: (S) => { S.wallHp = Math.min(S.wallHpMax, S.wallHp + 30); } },
  { id: 'atk',   name: '🔩 화력 조정', desc: '모든 캐릭터 공격력 +1',         apply: (S) => { S.atkBonus += 1; } },
  { id: 'maxhp', name: '🧱 방벽 보강', desc: '방벽 최대 HP +40 (+즉시 회복)', apply: (S) => { S.wallHpMax += 40; S.wallHp += 40; } },
  { id: 'ball',  name: '➕ 탄창 증설', desc: '이번 런 장전 볼 +1',           apply: (S) => { S.bonusBalls += 1; } },
  { id: 'power', name: '💥 화력 증폭', desc: '모든 캐릭터 공격력 +2',         apply: (S) => { S.atkBonus += 2; } },
  { id: 'fort',  name: '🛡 요새화',    desc: '방벽 최대 HP +20 & 공격력 +1',  apply: (S) => { S.wallHpMax += 20; S.wallHp += 20; S.atkBonus += 1; } }
];

// ═══════════════ 모듈(구 '유물/렐릭' — 표시명만 변경, 내부 id·상수명 RELICS 등은 그대로) ═══════════════
// 태그 5종(클래스 3 + 보드 2). 같은 태그 모듈 3개 → 세트 보너스.
const RELIC_TAGS = {
  precision: { name: '정밀', icon: '🎯', color: '#ff6b6b', cls: 'gunner',  set: '모든 사격 치명타 확률 +20%' },
  explosive: { name: '폭발', icon: '💥', color: '#ffb057', cls: 'cannon',  set: '모든 사격이 인접 적에게 20% 스플래시' },
  guard:     { name: '방호', icon: '🛡', color: '#5ce0a0', cls: 'support', set: '방벽이 무너질 때 1회 HP 50%로 버팀' },
  pinball:   { name: '핀볼', icon: '🟣', color: '#b58cff', cls: null,      set: '매 턴 첫 발사 볼의 콤보 보너스 ×2' },
  harvest:   { name: '보급', icon: '📦', color: '#ffd93b', cls: null,      set: '모든 충전 착지 +1' }
};
const RELIC_SET_N = 3;
// 모듈: 같은 모듈을 다시 고르면 Lv2 = 개량(구 '진화' — 이름·효과 변경). lv1/lv2 = 효과 파라미터.
const RELICS = {
  // 🎱 핀볼
  elastic:    { tag: 'pinball',   icon: '🟢', name: '탄성 코어', lv1: { desc: '장애물 범퍼에 맞으면 20% 확률로 충전볼 +1', p: 0.2 },
                lv2: { name: '분열탄', desc: '장애물 범퍼에 맞으면 50% 확률로 충전볼 +1', p: 0.5 } },
  chain:      { tag: 'pinball',   icon: '⛓', name: '연쇄 반응', lv1: { desc: '한 볼로 10콤보마다 판에 증폭 페그 생성(전투당 최대 6)', every: 10 },
                lv2: { name: '연쇄 폭주', desc: '한 볼로 6콤보마다 판에 증폭 페그 생성(전투당 최대 6)', every: 6 } },
  multishot:  { tag: 'pinball',   icon: '🔫', name: '다중 발사', lv1: { desc: '매 턴 첫 발사 때 볼 2개 동시 발사', n: 2 },
                lv2: { name: '삼연발', desc: '매 턴 첫 발사 때 볼 3개 동시 발사', n: 3 } },
  // 📦 보급
  midas:      { tag: 'harvest',   icon: '🪙', name: '자원 회수기', lv1: { desc: '크레딧 페그가 충전볼 +1 추가', balls: 1, gmul: 1 },
                lv2: { name: '대량 회수기', desc: '크레딧 페그: 크레딧 ×2 · 충전볼 +2', balls: 2, gmul: 2 } },
  overcharge: { tag: 'harvest',   icon: '⚡', name: '과충전', lv1: { desc: '증폭 페그 충전 ×3 → ×4', charge: 4 },
                lv2: { name: '초과충전', desc: '증폭 페그 충전 ×5', charge: 5 } },
  lucky:      { tag: 'harvest',   icon: '🍀', name: '행운 포켓', lv1: { desc: '충전 칸 착지 시 15% 확률로 충전 ×3', p: 0.15 },
                lv2: { name: '대박 포켓', desc: '충전 칸 착지 시 30% 확률로 충전 ×3', p: 0.3 } },
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
  powder:     { tag: 'explosive', icon: '🛢', name: '선제 포격', lv1: { desc: '전투 시작 시 모든 적에게 (총 탄약 × 1) 피해', mult: 1 },
                lv2: { name: '집중 포화', desc: '전투 시작 시 모든 적에게 (총 탄약 × 2) 피해', mult: 2 } },
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
function nodeCombat(type, floor) {
  const base = 6 + floor * 2, mk = n => new Array(n).fill('x');
  if (type === 'elite') return { name: '정예', elite: true, waves: [mk(base + 1), mk(base + 3), mk(base + 5)] };
  return { name: '전투', waves: [mk(base), mk(base + 2), mk(base + 4)] };
}
const ELITE = { hpMul: 3.2, dmgMul: 1.8, expMul: 4, gold: 60 };   // 정예 적 배수·보상
const SHOP_PRICE = { relic: 120, relicEvo: 150, heal: 60 };        // 상점(런 골드)
const REST_HEAL = 0.4;                                             // 정비: 최대 HP 40% 회복

// ═══════════════ 스킬 → 다음 판 변화 / 적 → 판 간섭 ═══════════════
// 스킬을 쓰면 다음 장전 판에 흔적을 남김(빌드·연계 재미). kind: 판에 추가할 페그 or 포켓 효과.
const SKILL_BOARD = {
  bigHit:     { peg: 'bomb',  n: 1, text: '폭탄 페그 설치' },
  extraShots: { peg: 'mult2', n: 2, text: '증식 페그 +2' },
  aoe:        { peg: 'bomb',  n: 2, text: '폭탄 페그 +2' },
  heal:       { buff: 1,              text: '회복 칸 +1' },
  stun:       { peg: 'bumper', n: 1, text: '범퍼 설치' }
};
// 적이 판에 간섭(장전 시작 시 적용, 해당 적이 필드에 있는 동안). 전투에서 먼저 잡을 대상이 생김.
const ENEMY_BOARD = {
  drone:  { steal: 1, text: '해킹드론이 특수 페그를 교란했다!' },        // 특수 페그 → 일반 페그(해킹)
  sludge: { peg: 'sludge', n: 1, text: '슬러지가 오염 페그를 뿌렸다!' },   // 오염 페그(볼 흡수)
  heavy:  { peg: 'scrap',  n: 1, text: '헤비아머가 파편을 흩뿌렸다!' }    // 파편(반사만)
};
const ENEMY_BOARD_CAP = 4;   // 적 간섭으로 추가되는 페그 최대(판이 막히지 않게)
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
// 콤보: N콤보마다 보너스 충전볼(충전량 = 콤보/COMBO_STEP, 최대 COMBO_MAX)
const COMBO_STEP = 5, COMBO_MAX = 4;
const COMBO_TEXT_SCALE = 0.7;                       // 장전 화면 텍스트 배율(70%) — 팝업 크기·외곽선·글로우와 볼 위 "N HIT" 카운터가 공유
const LOAD_POPUP_PX = 44 * COMBO_TEXT_SCALE;        // 장전 화면 팝업 공통 글자 크기(≈31px): 콤보·JACKPOT·+G·충전·연쇄·포켓 충전 등 종류 불문 동일
// 움직이는 잭팟 포켓: 상단 골칸 위를 좌우로 이동, 그 위로 착지하면 ×JACKPOT_MUL
const JACKPOT_MUL = 3, JACKPOT_SPEED = 1.1;   // 속도 = 초당 포켓 칸 수

// UI 아이콘(DOM): assets/ui/<name>.png 있으면 이모지 대체, 없으면 이모지 폴백(spr-box)
function uiIcon(name, emoji, style) { return '<span class="uic"' + (style ? (' style="' + style + '"') : '') + '><span class="uic-fb">' + emoji + '</span><img class="uic-im" alt="" src="assets/ui/' + name + '.png" onload="this.parentNode.classList.add(\'ok\')" onerror="this.remove()"></span>'; }

// ── 전역 헬퍼(보상·패시브에서 사용) ──
// 골칸 개방(보상): 캐릭터가 있고 아직 3칸 안 찬 레인의 골칸을 영구히 +1(다음 전투에도 유지) + 현재 판 즉시 반영
function openOneBlank(S) {
  if (!S.pocketBonus) S.pocketBonus = [0, 0, 0];
  const lane = S.chars.map(c => c.lane).find(l => {
    const c = S.chars.find(ch => ch.lane === l);
    return c && (c.ref.gol + (S.pocketBonus[l] || 0)) < 3;
  });
  if (lane === undefined) return false;                 // 모든 레인 골칸이 이미 꽉 참
  S.pocketBonus[lane] = (S.pocketBonus[lane] || 0) + 1;
  const pk = S.pockets.find(p => p.lane === lane && p.type === 'blank');
  if (pk) pk.type = 'charge';                           // 현재 판에도 즉시 반영
  return true;
}
// 임시 골칸 개방(패시브): 현재 판의 꽝칸 하나만 충전칸으로(영구 아님, 다음 전투엔 재계산)
function openBlankTemp(S) {
  const lanesWithChar = new Set(S.chars.map(c => c.lane));
  const cand = S.pockets.filter(p => p.type === 'blank' && lanesWithChar.has(p.lane));
  if (cand.length) cand[0].type = 'charge';
}
// 판에 페그 추가(보상·모듈·스킬·적 간섭 공용). 반환: 추가된 페그 배열.
//  - 모든 페그(터진 페그 포함 — 다음 턴 부활하므로)와 최소 간격 확보
//  - 고정 장애물(범퍼/기둥)과 겹치지 않게 회피
//  - opts.avoidLaunch: 중앙 발사열(fx 0.42~0.58) 회피(영구 반사체용 — 수직 발사 정면충돌 방지)
function addPegToBoard(S, type, n, opts) {
  opts = opts || {};
  const gap = (CFG.pegMinGap || 0.06), g2 = gap * gap, asp = 1.4, out = [];
  const obst = S.obstacles || [];
  const blocked = (fx, fy) => {
    for (const o of obst) {
      if (o.t === 'bar') { if (fx > o.fx - 0.05 && fx < o.fx + o.fw + 0.05 && fy > o.fy - 0.05 && fy < o.fy + o.fh + 0.05) return true; continue; }
      const dx = fx - o.fx, dy = (fy - o.fy) * asp, rr = (o.r || 0.06) + 0.055;
      if (dx * dx + dy * dy < rr * rr) return true;
    }
    return opts.avoidLaunch && fx > 0.42 && fx < 0.58;
  };
  for (let i = 0; i < n; i++) {
    let best = null, bestD = -1;
    for (let t = 0; t < 40; t++) {
      const fx = 0.10 + Math.random() * 0.80, fy = 0.08 + Math.random() * 0.62;
      if (blocked(fx, fy)) continue;
      let md = 9;
      for (const p of S.pegs) { const dx = fx - p.fx, dy = (fy - p.fy) * asp; const d = dx * dx + dy * dy; if (d < md) md = d; }
      if (md > bestD) { bestD = md; best = { fx, fy }; }
      if (md > g2 * 2.2) break;               // 충분히 떨어진 자리면 즉시 채택
    }
    if (!best || bestD < g2 * 0.6) continue;   // 자리가 없으면 추가 생략(겹침보다 생략이 낫다)
    const p = makePeg(best.fx, best.fy, type); S.pegs.push(p); out.push(p);
  }
  return out;
}

// ── 캐릭터 아트 로더 ──
// assets/char/<id>_<state>.png (state: cg | load | fire). 이미지가 있으면 사용, 없으면 게임이 폴백(원형/이모지).
const CharArt = (function () {
  const cache = {};   // key '<id>_<state>' → Image
  function path(id, state) { return 'assets/char/' + id + '_' + state + '.png'; }
  function load(id, state) {
    const k = id + '_' + state;
    if (cache[k]) return cache[k];
    const img = new Image();
    img.decoding = 'async';
    img.__ok = false;
    img.onload = function () { img.__ok = img.naturalWidth > 0; };
    img.onerror = function () { img.__ok = false; };
    img.src = path(id, state);
    cache[k] = img;
    return img;
  }
  // 캔버스용: 로드 완료+성공이면 Image, 아니면 null
  function sprite(id, state) { const img = load(id, state); return (img.__ok && img.complete) ? img : null; }
  return { path: path, load: load, sprite: sprite };
})();

// ── 총구 앵커(실측) ──
// 사격 스프라이트(assets/char/<id>_fire.png)에서 총구 섬광 중심의 위치를 [x, y] = 스프라이트 폭·높이 대비 비율로 기록.
// 포탄·머즐 이펙트가 캐논 끝에서 나가도록 홈 연출·전투 모두 이 값을 쓴다. ⚠ 사격 스프라이트를 새로 그리면 다시 측정할 것.
const MUZZLE = {
  knight: [0.799, 0.223], archer: [0.836, 0.202], berserker: [0.885, 0.197], valkyrie: [0.882, 0.149],
  grenadier: [0.821, 0.236], mortar: [0.838, 0.191], mage: [0.879, 0.178], behemoth: [0.885, 0.142],
  guard: [0.831, 0.230], rogue: [0.830, 0.204], priest: [0.874, 0.179], seraph: [0.885, 0.182]
};
function muzzleAnchor(id) { return MUZZLE[id] || [0.85, 0.2]; }

// ── 캔버스 이미지 로더(공통) ── 있으면 Image, 없으면 null(게임이 도형으로 폴백)
function makeCanvasLoader(dir) {
  const cache = {};
  function ready(name) {
    let img = cache[name];
    if (!img) { img = new Image(); img.decoding = 'async'; img.__ok = false; img.onload = function () { img.__ok = img.naturalWidth > 0; }; img.onerror = function () { img.__ok = false; }; img.src = dir + name + '.png'; cache[name] = img; }
    return (img.__ok && img.complete) ? img : null;
  }
  return { ready: ready };
}
// FX: assets/fx/<name>.png (muzzle/shell/boom). 있으면 사용, 없으면 절차적 렌더 폴백.
const FxArt = makeCanvasLoader('assets/fx/');
// 적/보스: assets/enemy/<id>.png (sentry/…, boss_titan/…). 없으면 색 원 폴백.
const EnemyArt = makeCanvasLoader('assets/enemy/');
// 페그/장애물: assets/peg/<id>.png (peg_normal/…, obst_bumper/…). 없으면 도형 폴백.
const PegArt = makeCanvasLoader('assets/peg/');
// 배경/영역 레이어: assets/bg/<name>.png (bg_field/bg_wall/bg_board/frame_pocket/bg_launcher…). 없으면 현행 도형 폴백.
const BgArt = makeCanvasLoader('assets/bg/');
