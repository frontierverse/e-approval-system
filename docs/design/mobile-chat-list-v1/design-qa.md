# 직원 채팅 목록 v1 구현 검수 — 2026-10-06

final result: passed

미해결 P0/P1/P2는 없다. 실제 Expo 화면을 Claude Design의 기존 `바자울 전자결재 앱 디자인` Version23에 맞췄다. 기존10페이지와 추가된 채팅 페이지의27개 아트보드를 참고했다. 출처와 취득 방식은 `source.json`에 기록했다. 이 문서의 파일 경로는 `docs/design/mobile-chat-list-v1/` 기준이다.

## 원본과 비교 조건

원본 시각 증거: `reference-light.jpg`, `reference-periodic-light.jpg`. 최종 실제 구현: `main-light-390-final.jpg`. [기존 Claude 작업](https://claude.ai/cowork/cse_019QmmgaB7zLPe4E3LvQLRnB?artifact=82497355-1c7d-45ce-933b-9e3b90d2ed7a)의 게시된 캔버스 iframe DOM srcdoc와 원본 컴포넌트 소스 맵에서 `ChatList.dc.html`을 추출했다. SHA-256은 `dcc761ca61bb66fa6c5d3e0b62843c80da3e912dde995d567e420b0beb5faa2f`이다. ZIP 다운로드는 완료되지 않았다. 실행 스크립트를 제외한 원본 렌더 DOM/CSS의 정적 사본을 캡처했다.

양쪽 이미지와 CSS 크기는390×844, DPR1, Safe Area 위47/아래34px이다. 인증 완료·라이트·대화4/안 읽은 메시지7 상태의 동일한 합성 이름/메타/본문/파일명/한국 날짜를 비교했다. 문서 좌표의 full-page clip으로 외부 브라우저 여백과 임시 스크롤 차이를 제거했다. 실제 업무 데이터를 사용하지 않았다.

전체 비교 `comparison-light-iteration2.png`(780×844, 왼쪽 원본/오른쪽 구현), 같은 내용 확대 `comparison-light-content-iteration2.png`, 주기 실패 전체·집중 비교 `comparison-periodic-iteration2.png`, `comparison-periodic-content-iteration2.png`를 직접 열어 검수했다.

## 발견 사항과 수정 이력

1. [P2, 해결] 새로고침 아이콘이 원본의 단일 회전 화살표와 달랐다. Feather `refresh-cw`를 `rotate-cw`로 수정하고 새 번들에서 재캡처했다. `comparison-light-iteration1.png` → `comparison-light-iteration2.png`에서 확인했다.
2. [P2, 해결] 주기 실패 안내가129px 세로 패널로 쌓여 첫 행이 콘텐츠43%로 밀렸다. 원본처럼 짧은 안내와44px 재시도를 가로 흐름으로 수정했다. 초기 실패에는 오류 아이콘을 추가했다. `comparison-periodic-content-iteration2.png`에서 원본과 패널·첫 행 배치가 일치하며 첫 행은 헤더 제외 콘텐츠 약34%에서 시작한다.
3. [P3, 수용] 기존 시스템 한글 글꼴을 유지한다. 원본 Noto Sans KR과 작은 글리프 폭 차이는 있으나 대표 상태의 줄바꿈·행 높이·영역 비율에 영향을 주지 않는다. 새 네이티브 폰트 의존성은 추가하지 않는다.

## 시각 표면

- **글꼴:** 기존 시스템 글꼴과 `DetailText`의 큰 글꼴 처리를 사용한다. 제목17/23px, 직원15/21px, 메타·날짜12/19px, 미리보기13/20px, 검색15/21px. 안 읽은 행과 숫자는 굵기로 강조하며 날짜·건수는 tabular nums다. 긴 이름·메타는 줄바꿈, 미리보기·파일명은 두 줄까지 표시한다. 전체 내용은 접근 이름에 남는다. 큰 글꼴/좁은 폭은 날짜·메타를 아래 흐름으로 보내며 날짜 내부 공백은 NBSP다. 브라우저 글꼴 렌더링 차이를 별도 스타일로 모방하지 않았다.
- **간격:** 최소52px 헤더,16px 좌우 패딩,12px 그룹 간격, 최소68px 행, 패널16px·컨트롤12px 반경이다. 얇은 경계·차분한 배경을 유지하며 그림자·장식 애니메이션이 없다. 정상390/360/1366에서 첫 행은 iframe y218px이다. 390×844의 헤더 제외 콘텐츠 약23%로40% 기준을 충족한다.
- **색:** 기존 `useHomeTheme` 라이트/다크 토큰을 재사용한다. 파랑은 선택/주 행동/안 읽음, 위험색은 실제 실패/확인 필요에 사용한다. `contrast.json`의 실제 사용 텍스트·배경 및 컨트롤 외부 경계 조합30개가 기준을 충족한다. 텍스트 최소4.86:1, 선택·경계3:1 이상. 비활성 상태는 읽을 수 있는 중립 표면이다.
- **자산:** 신규 사진·로고·일러스트가 없는 화면이다. 표준 뒤로/회전/추가/검색/첨부/오류 아이콘은 기존 Feather로 대응했다. 원본 고유 이미지나 사용자 이미지를 CSS·이모지로 대체하지 않았다. 기존 브랜드 자산은 유지한다.
- **문구:** 실제 서버 건수·한국 날짜를 유지하며 검색 결과는 전체 건수와 구별한다. `기록`은 현재 대화 기록만 확인 가능, 배지99+의 접근 이름은 실제128개다. 직원 찾기에는 본문이 없고 검색 대상은 이름/부서/직급이다. 정상 빈 목록·검색 없음·직원 없음·초기/주기 실패를 구별한다.

## 실제 브라우저 상태 검수

실제 Expo 웹 렌더를 합성 API에 연결했다. 테스트 프록시는 운영 API를 사용하지 않고 채팅 읽음/전송/파일 변경 요청을 차단한다. 테마 제어는 테스트 서버에만 있다. `layout-metrics.json`에 실제 측정을 기록했다.

| 조건 | 증거 | 결과 |
| --- | --- | --- |
| 390×844 라이트 | `main-light-390-final.jpg` | 대화4/안 읽음7, 첫 행23%, 가로 넘침 없음 |
| 360×800 다크 | `main-dark-360.jpg` | 대비·헤더·행·숫자 정상, 넘침 없음 |
| 360 다크 긴 이름·파일 | `long-dark-360.jpg` | 메타 줄바꿈·날짜 유지·파일 두 줄 |
| 360 다크 안 읽음128 | `large-unread-dark-360.jpg` | 총132, 배지99+, 접근 이름128 |
| 200% 확대 | `long-light-360-200percent.jpg`, `long-light-360-200percent-keyboard.jpg` | 360×800 안 논리180px 폭을2배 확대. 헤더 재배치, 가로 넘침 없음, Tab으로 다음 행 이동·포커스·스크롤 |
| 200% 오류 | `fresh-error-light-360-200percent.jpg` | 이전 데이터 제거, 오류와 재시도 접근 가능 |
| 1366×768 대화60 | `many-light-1366.jpg` |760px 내용 폭, 여러 행 즉시 표시, 서버 순서 유지 |
| 1366 대화1 | `one-light-1366.jpg` | 처음/마지막 경계·모서리 정상 |
| 검색·탭 | `finder-search-light-390.jpg`, `list-search-preserved-light-390.jpg` | 지원 검색 직원2/대화1, 검색어·전체 건수 유지 |
| 키보드 | `keyboard-focus-clear-light-390.jpg` | 검색→Tab 지우기→Enter 후 입력 포커스 |
| 대화0/직원0 | `empty-conversations-light-390.jpg`, `empty-employees-light-390.jpg` | 다음 행동 구별, 직원0에 잘못된 다른 검색 권유 없음 |
| 주기503 | `comparison-periodic-content-iteration2.png` | 검증 목록 유지, 안 읽음 확인 필요, 재시도44px |
| 수동503 | `fresh-error-light-390.jpg` | 데이터·건수 제거, 조작 잠김, 오류로 포커스 |
| 최종 로딩 | `loading-private-masked-light-390-final.jpg`, `loading-accessibility-final.json` | 이름/본문/건수 제거, 정적 스켈레톤, 조작 잠김, 장식 progressbar에 aria-hidden 부모 |

측정한 활성 컨트롤은 모두 최소44×44px, 보이는 h1은 하나다. 정상 최종 콘솔 오류0개. 의도적인503은 오류 복구 테스트로 구분했다. QA 이벤트581개 중 채팅 POST0개다. 새 대화는 검색어를 지우고 직원 찾기·입력 포커스로 이동한다. 행은 기존 채팅 경로를 사용한다. 검색/새로고침이 읽음·전송을 호출하지 않는 점은 이벤트와 회귀 테스트에서 확인했다.

## 자동 검증과 배포 후보

- 전체 로컬 테스트2,235개:2,204통과/실패0/격리 PostgreSQL 전용31건 건너뜀. DB 테스트는 PR CI에서 실행한다.
- 최종 채팅 관련75개 모두 통과. 검색·탭·새 대화·실패·계정 교체·늦은 응답·중복 조작·실제 발표 컴포넌트 접근 이름·fontScale2 분기를 포함한다.
- 루트/모바일 ESLint·TypeScript, Next 운영 Webpack 빌드, Android/iOS/web 운영 주소 Expo export 통과.
- 공식 production fingerprint: Android `2f70ec05a18af71c8d229c2f5a9b7c784ac38f2e`, iOS `410c5cf2288a9c64386597963a471ce3f1bb286e`. 기존 설치 앱과 일치한다.
- Hermes 후보 새 디자인·이전 기능/경로322/321개 마커·운영 주소 확인. QA origin/계정/제어 문자열 없음. Android SHA-256 `007b8d51c1774245b7025902337e090847a4136a9fc70db9bf70ec0b922b9dd5`, iOS `cfadb6a32d97fe4abb286fd33f8d9f2d74348ccac72934061bdc32f544442401`.
- passed는 구현·시각 검수 결과다. 실제 CI·배포·업데이트 ID/자산 검증은 별도 release-result.json에 기록한다.

## 검증 한계

물리 기기의 VoiceOver/TalkBack, OS 큰 글꼴, 실제 키보드/Safe Area 및 설치 앱의 OTA 수신은 직접 확인하지 않았다. 브라우저200%와 네이티브 fontScale2 경계 테스트를 실기기 검증으로 표현하지 않는다. 새 네이티브 의존성/설정/런타임 변경은 없으며 기존 lifecycle·권한·읽음·전송·파일·백그라운드 보호를 유지한다. 잠금 해제가 불가능한 사용자 환경을 우회하지 않는다.
