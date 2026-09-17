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
  bumper: { name: '범퍼',   color: '#46e6d0', shape: 'bumper',   size: 1.5,  weight: 10, oneShot: false, boost: 1.28 },
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
const RARITY = { common: { name: '커먼', color: '#9aa2c0' }, rare: { name: '레어', color: '#5cc8ff' }, epic: { name: '에픽', color: '#c98bff' } };

const ROSTER = [
  { id: 'knight', name: '검사', rarity: 'common', atk: 8, hp: 34, gol: 1,
    active: { name: '강타', gauge: 12, kind: 'bigHit', mult: 3 },   // 맨 앞 적에게 atk*3
    passive: { name: '예광', kind: 'addPeg', peg: 'mult2', n: 1 } },
  { id: 'archer', name: '궁수', rarity: 'common', atk: 5, hp: 20, gol: 2,
    active: { name: '연사', gauge: 15, kind: 'extraShots', shots: 4 }, // 이번 턴 추가 4발
    passive: { name: '보급', kind: 'addBall', n: 1 } },               // 시작 볼 +1
  { id: 'guard', name: '방패병', rarity: 'common', atk: 3, hp: 52, gol: 3,
    active: { name: '방벽', gauge: 18, kind: 'heal', amount: 24 },     // 성벽 HP 회복
    passive: { name: '정리', kind: 'closeBlank', n: 1 } },            // 시작 시 꽝 1칸 닫힘(→충전)
  { id: 'rogue', name: '도적', rarity: 'common', atk: 6, hp: 22, gol: 1,
    active: { name: '난사', gauge: 13, kind: 'extraShots', shots: 5 },
    passive: { name: '재장전', kind: 'addBall', n: 1 } },
  { id: 'priest', name: '사제', rarity: 'rare', atk: 4, hp: 30, gol: 2,
    active: { name: '치유', gauge: 16, kind: 'heal', amount: 36 },
    passive: { name: '축복', kind: 'closeBlank', n: 1 } },
  { id: 'berserker', name: '광전사', rarity: 'rare', atk: 11, hp: 40, gol: 1,
    active: { name: '광란', gauge: 16, kind: 'bigHit', mult: 3 },
    passive: { name: '분노', kind: 'addPeg', peg: 'attack', n: 1 } },
  { id: 'mage', name: '마법사', rarity: 'epic', atk: 12, hp: 18, gol: 2,
    active: { name: '폭발', gauge: 14, kind: 'bigHit', mult: 4 },
    passive: { name: '증폭', kind: 'addPeg', peg: 'mult5', n: 1 } }
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
  rates: [{ rarity: 'common', w: 68 }, { rarity: 'rare', w: 27 }, { rarity: 'epic', w: 5 }]
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
    hp: 1 + (s - 1) * 0.60,     // 적/보스 체력 배수: S1=1 … S5=3.4
    dmg: 1 + (s - 1) * 0.40,    // 적 공격 배수: S1=1 … S5=2.6 (성벽 압박)
    exp: 1 + (s - 1) * 0.40,    // 경험치 배수
    reward: 1 + (s - 1) * 0.60  // 메타 화폐 보상 배수: S1=1 … S5=3.4
  };
}

// 시작 메타 상태(3인 보유로 바로 플레이 가능, 가챠용 보석 지급)
const META_START = {
  currencies: { gold: 200, mats: 120, gems: 320, docs: 0 },
  shards: {},
  owned: { knight: { level: 1, star: 1 }, archer: { level: 1, star: 1 }, guard: { level: 1, star: 1 } },
  party: ['knight', 'archer', 'guard'],
  stage: 1, maxStage: 1,
  stats: { runsWon: 0, kills: 0, floors: 0 },
  claimed: {},
  daily: { freeGachaDate: '' }
};

// ── 적 ──
// 적 종류 — speed(턴당 전진 칸), armor(피격 시 고정 감소). 스테이지가 높을수록 강한 적 등장.
const ENEMIES = {
  goblin: { name: '고블린', hp: 55,  dmg: 11, exp: 6,  color: '#7ac74f', speed: 1, armor: 0 },
  bat:    { name: '박쥐',   hp: 34,  dmg: 8,  exp: 5,  color: '#9b6cff', speed: 1, armor: 0 },
  orc:    { name: '오크',   hp: 110, dmg: 18, exp: 15, color: '#e0733a', speed: 1, armor: 0 },
  wolf:   { name: '늑대',   hp: 40,  dmg: 10, exp: 9,  color: '#d08a55', speed: 2, armor: 0 },   // 빠름(턴당 2칸)·물몸
  brute:  { name: '강철거인', hp: 160, dmg: 20, exp: 22, color: '#7f8aa0', speed: 1, armor: 3 },  // 방어(피격 -3)
  slime:  { name: '슬라임', hp: 66,  dmg: 10, exp: 8,  color: '#5ad0a0', speed: 1, armor: 0 }
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
  golem:  { name: '거대 골렘', kind: 'golem', hp: 1100, dmg: 48, exp: 110, color: '#8a8f9a',
            thresholds: [0.75, 0.5, 0.25], retreat: 2, stunTurns: 1, vulnerable: 0.5 },   // 돌진형: HP% 후퇴+스턴, 스턴 중 피해+50%
  slime:  { name: '거대 슬라임', kind: 'slime', hp: 900, dmg: 30, exp: 130, color: '#5ad0a0',
            thresholds: [0.66, 0.33], splitCount: 2 },                                     // 분열형: 임계마다 슬라임 분열
  legion: { name: '고블린 군주', kind: 'legion', hp: 1350, dmg: 26, exp: 150, color: '#6fae4f',
            addType: 'goblin' }                                                            // 정지형: 매 턴 부하 소환
};
function stageBoss(s) { return s >= 5 ? 'legion' : s >= 3 ? 'slime' : 'golem'; }
const BOSS_GOLEM = BOSSES.golem;   // 하위호환

// ── 전투(웨이브) 구성: 런 = 3 일반전투 + 보스 ──
// 각 전투는 적을 순차 스폰. spawn[i] = 이 턴에 상단에 등장시킬 적 목록(레인은 자동 분배)
// 웨이브는 전투가 진행될수록 점점 커지고 오크 비중↑ (초반 완만, 후반 압박)
const COMBATS = [
  { name: '전투 1', waves: [
    ['goblin', 'goblin', 'bat', 'goblin'],
    ['goblin', 'bat', 'goblin', 'bat', 'goblin'],
    ['bat', 'goblin', 'goblin', 'bat', 'goblin', 'bat'],
    ['goblin', 'goblin', 'bat', 'goblin', 'bat', 'goblin', 'goblin'] ] },
  { name: '전투 2', waves: [
    ['goblin', 'bat', 'goblin', 'orc', 'goblin'],
    ['orc', 'goblin', 'bat', 'bat', 'goblin', 'orc'],
    ['bat', 'orc', 'goblin', 'bat', 'goblin', 'orc', 'goblin'],
    ['goblin', 'orc', 'goblin', 'bat', 'orc', 'goblin', 'bat', 'orc'] ] },
  { name: '전투 3', waves: [
    ['orc', 'goblin', 'bat', 'orc', 'goblin'],
    ['bat', 'orc', 'goblin', 'orc', 'goblin', 'orc'],
    ['orc', 'orc', 'goblin', 'bat', 'orc', 'goblin', 'orc'],
    ['goblin', 'orc', 'bat', 'orc', 'goblin', 'orc', 'orc', 'goblin', 'orc'] ] },
  { name: '보스 · 거대 골렘', boss: true }
];

// ── 레벨업 보상 후보(3택1) ──
const REWARDS = [
  { id: 'heal',   name: '수리',      desc: '성벽 HP +25', apply: (S) => { S.wallHp = Math.min(S.wallHpMax, S.wallHp + 25); } },
  { id: 'atk',    name: '연마',      desc: '모든 캐릭터 공격력 +1 (이번 런)', apply: (S) => { S.atkBonus += 1; } },
  { id: 'open',   name: '골칸 개방', desc: '꽝 포켓 1칸을 충전 칸으로', apply: (S) => { openOneBlank(S); } },
  { id: 'ball',   name: '증설',      desc: '이번 런 장전 볼 +1', apply: (S) => { S.bonusBalls += 1; } },
  { id: 'mult',   name: '증식판',    desc: '핀볼판에 ×2 페그 추가', apply: (S) => { addPegToBoard(S, 'mult2', 2); } }
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
  for (let i = 0; i < n; i++) {
    S.pegs.push(makePeg(0.12 + Math.random() * 0.76, 0.15 + Math.random() * 0.6, type));
  }
}
