캐릭터 아트 폴더 — 여기에 PNG를 넣으면 게임에 자동 반영(없으면 폴백: 원형/텍스트).

파일명 규칙: <id>_<state>.png
  state: cg   → 캐릭터 상세·가챠·편성 썸네일 (LD 2D 일러스트, 832×1216 권장)
         load → 전투 '장전' 페이즈 벽면 스프라이트 (SD 픽셀아트, 320×320)
         fire → 전투 '사격' 페이즈 벽면 스프라이트 (SD 픽셀아트, 320×320)
  ※ load/fire는 같은 구도·크기로 만들어야 포즈 교체가 자연스러움.
  ※ 전부 투명 배경.

id 목록(이름/클래스/등급):
  knight    루비   사수 커먼      grenadier 보라   포수 커먼      guard  코코 지원 커먼
  archer    미나   사수 레어      mortar    하나   포수 레어      rogue  루미 지원 레어
  berserker 카린   사수 에픽      mage      티아   포수 에픽      priest 미라 지원 에픽
  valkyrie  발키리 사수 레전더리  behemoth  레지나 포수 레전더리  seraph 세라 지원 레전더리

예: knight_cg.png, knight_load.png, knight_fire.png
프롬프트는 docs/char-art-prompts.md 참고.
