'use strict';
/* PONGTRESS 콘텐츠·수치 데이터 (프로토타입 슬라이스)
 * 밸런스 수치는 여기 한곳. game.js 보다 먼저 로드된다.
 */
const CFG = {
  lanes: 3,                // 캐릭터 편성(성벽) 레인 수 — 골칸·포켓도 이 값 기준
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
  gold:   { name: '골드',   color: '#ffd93b', shape: 'hex',      size: 1.1,  weight: 8,  oneShot: true,  gold: 15, label: '$' },
  attack: { name: '공격',   color: '#ff6b6b', shape: 'triangle', size: 1.1,  weight: 6,  oneShot: true,  atk: 2,  label: '＋' }
};
// 일반(반사) 페그는 기능은 같되 모양을 여러 가지로(원 가중). 판이 실제 핀볼처럼 다채롭게 보이도록.
const NORMAL_SHAPES = ['circle', 'circle', 'square', 'pentagon', 'pill'];

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
// atk 공격력(발당 피해) · hp 체력(성벽 HP에 합산) · gol 고정 골칸 수(레인 3칸 중 충전 칸)
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
    passive: { name: '화력 증강', kind: 'addPeg', peg: 'attack', n: 1 } },
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
const DOC_SHOP = { shardsPer: 10, docCost: 20 }; // 문서 20 → 조각 10
const MISSIONS = [
  { id: 'firstWin', name: '첫 승리', desc: '런 1회 클리어', stat: 'runsWon', goal: 1, reward: { gems: 150 } },
  { id: 'kills60', name: '토벌대', desc: '적 60마리 처치', stat: 'kills', goal: 60, reward: { gold: 300 } },
  { id: 'floors12', name: '연전연승', desc: '전투 12회 클리어', stat: 'floors', goal: 12, reward: { gems: 100, mats: 80 } },
  { id: 'wins3', name: '삼전삼승', desc: '런 3회 클리어', stat: 'runsWon', goal: 3, reward: { gems: 200, docs: 20 } }
];
// ── 스테이지 (높을수록 난이도↑) ──
const STAGE_MAX = 5;
function stageScale(s) {
  s = Math.max(1, Math.min(STAGE_MAX, s || 1));
  return {
    hp: 1 + (s - 1) * 0.65,     // 적/보스 체력 배수: S1=1 … S5=3.6
    dmg: 1 + (s - 1) * 0.42,    // 적 공격 배수: S1=1 … S5=2.68 (성벽 압박)
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

// ── 적 ──
// 적 종류 — speed(턴당 전진 칸), armor(피격 시 고정 감소). 스테이지가 높을수록 강한 적 등장.
const ENEMIES = {
  goblin: { name: '고블린', hp: 68,  dmg: 13, exp: 6,  color: '#7ac74f', speed: 1, armor: 0 },
  bat:    { name: '박쥐',   hp: 43,  dmg: 10, exp: 5,  color: '#9b6cff', speed: 1, armor: 0 },
  orc:    { name: '오크',   hp: 138, dmg: 22, exp: 15, color: '#e0733a', speed: 1, armor: 0 },
  wolf:   { name: '늑대',   hp: 51,  dmg: 13, exp: 9,  color: '#d08a55', speed: 2, armor: 0 },   // 빠름(턴당 2칸)·물몸
  brute:  { name: '강철거인', hp: 200, dmg: 24, exp: 22, color: '#7f8aa0', speed: 1, armor: 4 },  // 방어(피격 -4)
  slime:  { name: '슬라임', hp: 84,  dmg: 13, exp: 8,  color: '#5ad0a0', speed: 1, armor: 0 }
};
// 스테이지별 적 풀(가중치) — 상위 스테이지에 강한 적이 섞임
const STAGE_POOL = {
  1: [['goblin', 3], ['bat', 2]],
  2: [['goblin', 3], ['bat', 2], ['orc', 1]],
  3: [['goblin', 3], ['orc', 2], ['wolf', 1]],
  4: [['goblin', 2], ['orc', 2], ['wolf', 2], ['brute', 1], ['slime', 1]],
  5: [['orc', 2], ['wolf', 2], ['brute', 1], ['slime', 2], ['goblin', 1]]
};
function pickEnemyType(s) {
  const pool = STAGE_POOL[Math.min(STAGE_MAX, Math.max(1, s))] || STAGE_POOL[1];
  const tot = pool.reduce((a, p) => a + p[1], 0); let r = Math.random() * tot;
  for (const [t, w] of pool) { r -= w; if (r <= 0) return t; }
  return pool[0][0];
}

// ── 보스 3종 (스테이지 티어별) ──
const BOSSES = {
  golem:  { name: '거대 골렘', kind: 'golem', hp: 1320, dmg: 50, exp: 110, color: '#8a8f9a',
            thresholds: [0.75, 0.5, 0.25], retreat: 2, stunTurns: 1, vulnerable: 0.5 },   // 돌진형: HP% 후퇴+스턴, 스턴 중 피해+50%
  slime:  { name: '거대 슬라임', kind: 'slime', hp: 1080, dmg: 32, exp: 130, color: '#5ad0a0',
            thresholds: [0.66, 0.33], splitCount: 2 },                                     // 분열형: 임계마다 슬라임 분열
  legion: { name: '고블린 군주', kind: 'legion', hp: 1600, dmg: 28, exp: 150, color: '#6fae4f',
            addType: 'goblin' }                                                            // 정지형: 매 턴 부하 소환
};
function stageBoss(s) { return s >= 5 ? 'legion' : s >= 3 ? 'slime' : 'golem'; }
const BOSS_GOLEM = BOSSES.golem;   // 하위호환

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
// 좌표=핀볼판(pins) 비율. t: bumper(강한 반사·발광) / pillar(단단한 반사) / bar(사각 벽).
// 원형: {t,fx,fy,r(폭 비율)}  사각: {t:'bar',fx,fy,fw,fh}(좌상단+크기, fx/fy/fw/fh 비율)
const STAGE_OBST = {
  1: [{ t: 'bumper', fx: 0.30, fy: 0.50, r: 0.07 }, { t: 'bumper', fx: 0.66, fy: 0.58, r: 0.07 }],
  2: [{ t: 'bumper', fx: 0.26, fy: 0.46, r: 0.07 }, { t: 'bumper', fx: 0.72, fy: 0.50, r: 0.07 }, { t: 'bar', fx: 0.36, fy: 0.74, fw: 0.28, fh: 0.03 }],
  3: [{ t: 'bumper', fx: 0.22, fy: 0.40, r: 0.07 }, { t: 'bumper', fx: 0.52, fy: 0.60, r: 0.08 }, { t: 'bumper', fx: 0.80, fy: 0.44, r: 0.07 }, { t: 'bar', fx: 0.12, fy: 0.76, fw: 0.30, fh: 0.03 }],
  4: [{ t: 'pillar', fx: 0.50, fy: 0.34, r: 0.09 }, { t: 'bumper', fx: 0.24, fy: 0.60, r: 0.07 }, { t: 'bumper', fx: 0.76, fy: 0.60, r: 0.07 }, { t: 'bar', fx: 0.08, fy: 0.78, fw: 0.26, fh: 0.03 }, { t: 'bar', fx: 0.62, fy: 0.78, fw: 0.26, fh: 0.03 }],
  5: [{ t: 'pillar', fx: 0.34, fy: 0.32, r: 0.08 }, { t: 'pillar', fx: 0.68, fy: 0.40, r: 0.08 }, { t: 'bumper', fx: 0.50, fy: 0.60, r: 0.09 }, { t: 'bumper', fx: 0.20, fy: 0.72, r: 0.07 }, { t: 'bar', fx: 0.55, fy: 0.80, fw: 0.30, fh: 0.035 }]
};

// ── 전투(웨이브) 구성: 런 = 3 일반전투 + 보스 ──
// 각 전투는 적을 순차 스폰. spawn[i] = 이 턴에 상단에 등장시킬 적 목록(레인은 자동 분배)
// 웨이브는 전투가 진행될수록 점점 커지고 오크 비중↑ (초반 완만, 후반 압박)
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
  { name: '보스 · 거대 골렘', boss: true }
];

// ── 레벨업 보상 후보(3택1) ──
const REWARDS = [
  { id: 'heal',   name: '수리',      desc: '성벽 HP +25', apply: (S) => { S.wallHp = Math.min(S.wallHpMax, S.wallHp + 25); } },
  { id: 'atk',    name: '연마',      desc: '모든 캐릭터 공격력 +1 (이번 런)', apply: (S) => { S.atkBonus += 1; } },
  { id: 'open',   name: '골칸 개방', desc: '꽝 포켓 1칸을 충전 칸으로', apply: (S) => { openOneBlank(S); } },
  { id: 'ball',   name: '증설',      desc: '이번 런 장전 볼 +1', apply: (S) => { S.bonusBalls += 1; } },
  { id: 'mult',   name: '증식판',    desc: '핀볼판에 ×2 페그 추가', apply: (S) => { addPegToBoard(S, 'mult2', 2); } },
  { id: 'buff',   name: '버프 칸',   desc: '꽝 포켓 1칸을 버프(성벽 회복) 칸으로', apply: (S) => { S.buffBonus = (S.buffBonus || 0) + 1; const pk = S.pockets.find(p => p.type === 'blank'); if (pk) pk.type = 'buff'; } },
  { id: 'bumper', name: '범퍼 설치', desc: '핀볼판에 범퍼 2개 추가', apply: (S) => { addPegToBoard(S, 'bumper', 2); } }
];

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
function addPegToBoard(S, type, n) {
  // 기존 살아있는 페그와 최소 간격 확보(겹침 방지). 후보를 여러 번 뽑아 가장 먼 자리를 채택.
  const gap = (CFG.pegMinGap || 0.06), g2 = gap * gap, asp = 1.4;
  for (let i = 0; i < n; i++) {
    let best = null, bestD = -1;
    for (let t = 0; t < 28; t++) {
      const fx = 0.10 + Math.random() * 0.80, fy = 0.08 + Math.random() * 0.56;
      let md = 9;
      for (const p of S.pegs) { if (!p.alive) continue; const dx = fx - p.fx, dy = (fy - p.fy) * asp; const d = dx * dx + dy * dy; if (d < md) md = d; }
      if (md > bestD) { bestD = md; best = { fx, fy }; }
      if (md > g2 * 2.2) break;               // 충분히 떨어진 자리면 즉시 채택
    }
    S.pegs.push(makePeg(best.fx, best.fy, type));
  }
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

// ── FX 이미지 로더 ── assets/fx/<name>.png (muzzle/shell/boom 등). 있으면 사용, 없으면 절차적 렌더로 폴백.
const FxArt = (function () {
  const cache = {};
  function ready(name) {
    let img = cache[name];
    if (!img) { img = new Image(); img.__ok = false; img.onload = function () { img.__ok = img.naturalWidth > 0; }; img.onerror = function () { img.__ok = false; }; img.src = 'assets/fx/' + name + '.png'; cache[name] = img; }
    return (img.__ok && img.complete) ? img : null;
  }
  return { ready: ready };
})();
