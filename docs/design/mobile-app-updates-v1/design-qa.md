# 앱 업데이트 v1 구현 검수 — 2026-10-06

final result: passed

이전 검수: [내 정보 v1](../mobile-profile-v1/design-qa.md). 원본 출처·해시·뷰포트 정보는 [source.json](source.json)에 있다.

## 원본과 구현

Claude “바자울 전자결재 앱 디자인” Version20의 app-updates-v1과 다운로드한 `bajaul-app-updates-v1-source.zip`의 `project/AppUpdates.dc.html`을 기준으로 실제 Expo Router `/app-updates`를 구현했다. 기존8개 논리 페이지를 보존한 디자인이다. Claude 편집용 HTML·support.js·모의 provider·실험실은 앱에 이식하지 않았다.

[전체 비교](comparison-light.png)는 왼쪽 Claude/오른쪽 구현 각각390×844이며 [내용 확대 비교](comparison-light-content.png)는 같은 y47~712 영역이다. 원본780×1688은390×844로 정규화했다. 동일한 idle·라이트·앱1.0.5·demo10a1·게시10월5일9시·관찰9시30분·확인10월6일2시30분·다운로드10월5일9시5분이다. Safe Area47/34px을 외부 QA 프레임에서 제공하고 OS 장식을 새로 그리지 않았다. 익명 QA의 뒤로 접근 이름은 로그인, 원본은 내 정보이며 시각 구조는 같다.

검수 주소는 `http://127.0.0.1:8911/device`, 실제 앱 번들은8912에서 제공했다. 로컬 API 주소만 허용하고 모든 업무 API는405로 차단했다. 네이티브 상태는 실제 화면에 주입한 **view-only useAppUpdates fixture**이며 실제 provider 기능은 별도 단위 테스트로 확인했다. 실제 web disabled는 fixture를 제거한 실제 provider 상태다. 운영 직원·문서·기기 기록을 조회하거나 수정하지 않았다.

IAB 캡처는 JPEG를 PNG로 정규화했다. 캡처 전송의 RGB 차이를 확인했으므로 색상 판정은 실제 computed CSS와 기존 HomeTheme 값으로 했다. 기본 버튼의 실제 배경은 #2563EB/opacity1이다. 디자인의 Noto Sans KR 대신 기존 플랫폼 한글 글꼴을 유지해 글리프 폭에 차이가 있다.

## 최종 표현과 수정

자체52px 헤더, 외곽16px, 섹션 간격16px, 패널14px·모서리16px, 상태 아이콘36px, 주 행동48px, 재확인44px이다. 상태17/24·본문13/20·기록값14/21·주석12/18을 사용한다. 현재 상태 → 현재 실행 코드 → 확인·다운로드 기록 순서를 유지했다. 현재·다음 코드의 게시 시각을 구분하고 관찰·확인 시도·다운로드 확인 의미를 명시했다.

검수에서 웹 progressbar의 값이 누락되는 문제를 발견해 native accessibilityValue와 ARIA0~100 값을 함께 제공했다. 장식 스피너는 접근성 트리에서 숨겼다. 오류와 적용 대기 안내는 화면이 활성일 때 기존 공용 포커스 헬퍼로 전달한다. 숫자 없는 진행률은 막대를 만들지 않고,100%는 마무리 중이며 ready로 추정하지 않는다. 처리 중 버튼은 불투명 중립 표면과 읽을 수 있는 텍스트로 잠근다.

적용 대기에는 저장 후 완전 종료·다음 실행 안내만 있으며 확인/다운로드/재시작 버튼이 없다. current 코드·게시·관찰은 다운로드 대상과 분리했다. 다운로드 실패는 기존 대상과 다운로드 재시도를 보존한다. rollback 준비와 기본 버전 비상 실행을 구분하고 보관 실패는 별도 안내다. provider·기록 저장·업데이트 정책·공통 root·버전·runtime·의존성은 변경하지 않았다. 검수 범위에 남은 actionable P0/P1/P2 없음.

## 실제 화면 검수

- **390×844 기본:** 상태와 주 행동, 현재 코드3행, 확인·다운로드2행 및 주석까지 첫 화면에 보인다. 주 행동은 iframe y188/전체 y235에서 시작한다. 너비=scrollWidth=390, h1은1개다. 원본과 패널 경계 차이는2~3px이다.
- **360×800 다크:** 현재 상태·주 행동·실행 코드·기록이 읽히며 너비=scrollWidth=360이다. 긴10시 게시 시각은 다음 줄로 흐른다. ready rollback은 다음 실행 안내와 기존 current를 보존한다.
- **두 배 확대:** CSS180×380을2배 렌더한360×800으로 확인했다. 너비=scrollWidth=180, 제목·행동·긴 한글·날짜·완료 안내가 세로 흐름과 스크롤로 접근 가능하다. 실제 native fontScale2 실기기 검증은 아니며 fontScale2의100% 라벨 배치는 단위 테스트로 확인했다.
- **1366×768:** 최대720px 내용 폭과 우선순위를 유지하며 가로 넘침이 없다. 웹 업무 관리자 화면은 이번 변경 대상이 아니다.
- **상태:** checking,0/37/100%/null 다운로드, available, 확인 실패, 대상 보존 다운로드 실패, ready, rollback, empty/embedded/unknown, emergency, storage를 확인했다. 숫자0과 미확인,100%와 적용 대기를 구분한다. 날짜 없는 기록은 가짜 시각을 만들지 않는다. [metrics.json](metrics.json)에27개 뷰포트/상태 기록이 있다.
- **탐색·키보드:** 이름 있는44px 뒤로와48px 주 행동,44px 재확인. Tab은 뒤로→주 행동 순서로 이동하며 포커스가 보인다. 오류 안내와 ready 제목 포커스를 확인했다. 실제 뒤로 이력 및 익명/로그인 fallback은 실제 페이지 단위 테스트에서 확인했다.
- **합성 재시도:** 다운로드 재시도 클릭 후 unknown→37%→100%→ready 화면으로 이동했다. 합성 이벤트는 download1회, current는demo10a1 유지, ready에는 뒤로만 남는다. 실제 네이티브 API 실행 검증과 구분한다.
- **실제 웹:** ‘설치한 앱에서 확인할 수 있습니다’와 비활성 이유·확인 불가·기록 없음이며 업데이트 행동이 없다. 기본 화면 콘솔 error0개다.
- **대비:** 두 테마의 실제 다운로드/기록 텍스트는 최소5.47:1이다([contrast.json](contrast.json)). 주 버튼 흰색/#2563EB는5.17:1, 다크 진행 막대#8DB7FF/#262E39는6.75:1이다. 색상과 함께 제목·수치·설명을 제공한다.

## 자동 검증과 한계

모바일/루트 TypeScript·ESLint, 실제 업데이트 provider와 페이지의35개 테스트, Android/iOS/web 최종 Expo export를 통과했다. 전체 단위 테스트는2225개 중2194통과·31건너뜀·실패0이며 로컬 Node22.21 로더 문제는 공식 최신 Node22 패치로 실행해 해결했다. PR CI의 PostgreSQL·생산 빌드·브라우저 검증 및 실제 운영 전달 증거는 배포 기록에 별도로 남긴다.

실기기 iOS/Android Safe Area·큰 글꼴·VoiceOver/TalkBack·실제 cold launch 및 수신 확인은 미검증이다. 합성 브라우저 검수나 Hermes 전달 확인을 실기기 검증으로 보고하지 않는다.

- [x] 같은 상태의 원본/구현 전체 및 확대 비교
- [x] 기본·작은 화면·두 테마·200%·키보드·상태 UI
- [x] 실제 provider·페이지35개 테스트 및 lint/typecheck
- [x] Android/iOS/web production export
- [ ] 실기기 스크린리더·큰 글꼴·다음 실행 적용 확인

final result: passed
