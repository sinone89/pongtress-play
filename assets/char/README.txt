캐릭터 아트 폴더 (build 136~, 샤프닝 build 140~) — WebP. 파일이 없으면 게임이 폴백(정면 썸네일 → 원형)으로 대신한다.

파일명 규칙: <id>_<종류>.webp
  cg     캐릭터 일러스트 원본 크기 1037×1516, 투명 배경 — 타이틀 중앙 연출·아주 큰 화면의 캐릭터 상세
  cgm    같은 일러스트를 가로 640 으로 미리 줄인 뒤 샤프닝한 중간 크기 — 캐릭터 상세 팝업·스킬 컷인(작게 보이는 곳)
  sheet  애니메이션 시트 1280×1280 = 셀 320×320 의 4열×4행
           행0 idle   i0~i3  정면 3/4, 루프 ≈6fps
           행1 reload r0~r3  1회 재생, r3 = i0
           행2 fire   f0~f3  뒷모습: f0 조준 · f1 발사 · f2 반동 · f3 복귀 (섬광 없음 — 섬광은 fx/muzzle)
           행3 turn   t0,t1  정면→뒷모습 순재생 / 뒷모습→정면 역재생 (뒤 2칸은 예약)
         발바닥 기준선 y=292, 발 중심 x≈160 — 정렬 규칙은 docs/char-art-prompts.md §1
  thumb  편성칩·상점·가챠용 정면 대기 컷 320×320 (시트 i0 를 줄이지 않고 그대로 잘라 낸 것 — build 139 까지는 256 으로 줄였음)

⚠ 이 폴더의 시트·thumb·cg·cgm 은 변환 때 샤프닝(언샤프 마스크)이 이미 걸려 있다(tools/sharpen.ps1).
  도트풍 그림이 화면 크기에 맞춰 줄어들 때 모서리가 뭉개져 흐려 보이는 것을 막기 위함이라, 이 파일을 다시 샤프닝하지 말 것.
  원본 PNG(PONGTRESS_approved_images)에서 다시 만들 때만 아래 도구를 쓴다.

원본 PNG → 이 폴더(WebP) 변환·샤프닝·썸네일/중간 CG 생성:  tools/import-assets.ps1 -Only char   (양 조절: -SharpSheet 1.0 -SharpCg 0.8 -SharpSigma 1.1, 끄려면 0)
총구 좌표·발 중심 측정(js/spritemeta.js 생성):  tools/measure-sheets.ps1   ← ⚠ 시트를 새로 그리면 반드시 다시 실행(샤프닝은 위치를 바꾸지 않아 다시 안 돌려도 됨)

id 목록(이름/클래스/등급):
  knight    루비   사수 커먼      grenadier 보라   포수 커먼      guard  코코 지원 커먼
  archer    미나   사수 레어      mortar    하나   포수 레어      rogue  루미 지원 레어
  berserker 카린   사수 에픽      mage      티아   포수 에픽      priest 미라 지원 에픽
  valkyrie  발키리 사수 레전더리  behemoth  레지나 포수 레전더리  seraph 세라 지원 레전더리

예: knight_cg.webp, knight_cgm.webp, knight_sheet.webp, knight_thumb.webp
