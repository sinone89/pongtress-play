// 새 그림 슬롯 설정(build 145) — 그림을 assets/ 에 넣고 true 로 켜면 도형·옛 그림 대신 쓴다.
// 켜 두어도 안전하다: 로드에 실패한 그림은 항목별로(칸 하나·발사대 한 부품 단위) 예전 도형으로 되돌아간다.
//   ?art=all · ?art=pocket,launcher,title,lobby(콤마 목록) · ?art=off  — 주소 뒤에 붙이면 이번 접속에서만 켜고 끈다(저장 안 함). 기본이 '켜짐'이므로 옛 모습과 비교할 때 ?art=off.
//   그림 규격·좌표의 근거와 제작 지침: docs/ui-skin-plan.md · 구도 가이드: docs/art-guides/
const ART = (function () {
  // build 152(2026-10-06): 파일럿 그림 20종을 기본 켜짐으로 — 사용자 승인본(PONGTRESS_pilot_20_approved)인데 기본 꺼짐이라 라이브에서 안 보였다.
  const on = { pocket: true, launcher: true, title: true, lobby: true, skin: true };   // 새 그림이 납품되면 해당 항목 그림을 교체(skin = UI 스킨 9분할, css/skin.css). 끄려면 false
  try {
    const m = /[?&]art=([\w,]*)/.exec(location.search);
    if (m) {
      const want = m[1].split(',').filter(Boolean);
      Object.keys(on).forEach(function (k) { on[k] = want.indexOf('all') >= 0 || want.indexOf(k) >= 0; });   // ?art=off(또는 빈 값)이면 전부 꺼짐
    }
  } catch (e) {}

  // 홈 자동전투 연출 — 뒷벽이 바닥과 만나는 선(문턱)에서 적이 나타나 캐릭터 쪽으로 걸어온다. 값은 홈 배경 그림(1080×1920)에서 잰 것.
  //   farY: 문턱의 y(이미지 좌표) · farHalf/nearHalf: 바닥 절반 폭(화면 폭 비율) 문턱 / 캐릭터 줄 · spawnD: 적이 나타나는 깊이(0=문턱, 음수=문턱 너머) · fade: 나타날 때 서서히 보이는 깊이 구간 · rate: 초당 생성 확률
  //   bg: 이 설정이 쓰는 배경 그림(CSS 변수 --bg-lobby 로 홈·로비 배경에 깔린다) — 켜고 끄면 그림과 적 동선이 항상 함께 바뀐다.
  const lobbyClosed = { bg: 'assets/bg/bg_lobby.webp', farY: 930, farHalf: 0.25, nearHalf: 0.62, spawnD: 0, fade: 0.09, rate: 1 };      // 현행 배경(뒷벽이 닫힌 격납고) — 벽 앞 바닥에서 서서히 나타난다
  const lobbyBreach = { bg: 'assets/bg/bg_lobby_breach.webp', farY: 930, farHalf: 0.25, nearHalf: 0.62, spawnD: -0.3, fade: 0.05, rate: 0.8 };  // 폭파로 뚫린 뒷벽(개구부 x 270~810 · 잔해선 y 930) — 개구부 너머 길에서 작게 나타나 잔해선을 넘어 걸어 나온다(확정 2026-10-02)

  return {
    on: on,
    // 탄창: 칸마다 그림 한 장(assets/peg/<이름>.png, 160×304). 탄창은 레인 색별 3장, 꽝·회복 칸, 잭팟 덮개(칸 위를 지나가는 금색 괄호 — 속은 투명)
    pocket: { on: on.pocket, charge: ['pocket_charge_0', 'pocket_charge_1', 'pocket_charge_2'], blank: 'pocket_blank', buff: 'pocket_buff', jackpot: 'pocket_jackpot' },
    // 발사대: 받침(256×256, 회전 중심=정중앙) + 포신(128×224, 회전 중심 (64,160)·총구 끝 (64,0), 위가 앞). 받침 그림 한 변 = 핀볼 판 폭 × size
    //   납품(2026-10-02 파일럿)에서 잰 값: 받침 512px = 256단위(원판 지름 240) · 포신 256×470px = 128×235단위, 허브(회전 중심) (64, 166.7) — tools\split-sheets.ps1 가 출력한다
    launcher: { on: on.launcher, base: 'launcher_base', barrel: 'launcher_barrel', size: 0.18, baseSrc: 256, barrelW: 128, barrelH: 235, pivotX: 64, pivotY: 166.7, recoil: 0.04, flashSize: 0.28, flashColor: '#8ff6ea' },
    // 타이틀 키아트(루비 1인이 적 군단과 전투 중인 9:16 일러스트 — 확정 2026-10-02): 켜면 #title-art 를 교체하고 편성 캐릭터 겹침(#title-hero)을 숨긴다
    title: { on: on.title, src: 'assets/bg/bg_title_key.webp' },
    // 홈 배경: 그림은 bg_lobby.webp 를 교체해서 넣고(뒷벽이 폭파로 뚫린 그림), 이 플래그는 적 동선만 바꾼다(개구부 너머에서 걸어 나옴)
    lobby: Object.assign({ on: on.lobby }, on.lobby ? lobbyBreach : lobbyClosed)
  };
})();
// UI 스킨: <html class="skin"> 이면 css/skin.css 의 규칙이 켜진다(버튼·카드·모달·헤더·칩·내비를 assets/ui/skin/*.png 9분할 그림으로)
if (ART.on.skin) document.documentElement.classList.add('skin');
// 홈·로비 배경 그림 — css/game.css 가 var(--bg-lobby, 옛 그림)으로 읽는다. 절대 주소로 넣어 CSS 파일 위치와 상관없이 같은 파일을 가리키게 한다.
try { document.documentElement.style.setProperty('--bg-lobby', 'url("' + new URL(ART.lobby.bg, document.baseURI).href + '")'); } catch (e) {}
