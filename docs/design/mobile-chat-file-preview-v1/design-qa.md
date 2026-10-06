# 채팅 파일 미리보기 v1 디자인 검수

final result: passed

검수 경로: 실제 Expo `내 정보 → 직원 채팅 → 김예시 → 파일 작업 → 미리보기`, 합성 API `http://127.0.0.1:8917/device`. 운영 API·직원·파일·DB를 사용하지 않았다. Claude Design Version 27의 13번째 페이지(33개 보드)가 시각 기준이다. 원본 12개 페이지 보존은 Claude 최종 응답에 기록돼 있다.

## 시각 기준과 정규화

- source visual truth: `docs/design/mobile-chat-file-preview-v1/reference-image-390.png` 및 같은 폴더의 `reference-*.png`.
- implementation screenshot: `docs/design/mobile-chat-file-preview-v1/app-image-390-final.png`. 추가 실제 캡처는 원 작업의 `output/design/claude-mobile-chat-file-preview-2026-10-06/`에 보존했다.
- 시안은 게시된 iframe의 실제 렌더링 DOM을 읽고 스크립트만 제거한 정적 사본이다. 문구·스타일·배치를 변경하지 않았다. landscape 그림은 기존 320×189 기관 심볼 파일만 연결했다. ZIP 다운로드는 완료하지 못했고 ZIP을 확보했다고 주장하지 않는다.
- 390×844 light/dark, 360×800 light, 1366×768 desktop: source/app PNG는 각 CSS 크기와 동일한 1배 픽셀 크기다. 앱 외부의 합성 safe area(390: 상47/하34, 360: 상24/하16)를 양쪽에서 제거하여 앱 소유 내용만 비교했다. 본문 비교 크기는 390×763, 360×760, 1366×768이다. 합성 기기 chrome을 앱 소스로 구현하지 않았다.
- 추가 브라우저 200% 검수: 360×800 표시 영역에 실제 Expo iframe 180×380을 2배로 표시했다. Claude의 native textScale=2 보드와는 UI 전체 확대와 텍스트 확대의 차이가 있으므로 같은 상태의 정밀 비교라고 주장하지 않는다. 실제 화면의 가로 넘침, 고정 헤더, 키보드 포커스 및 스크롤 복구를 별도로 확인했다.

## Full-view 및 집중 비교

각 합성 비교 PNG는 **왼쪽 원본 / 오른쪽 실제 Expo 화면**을 같은 입력에 합쳤으며, 모두 열어 직접 확인했다.

| 상태/크기 | 전체 비교 증거 |
| --- | --- |
| 이미지 390 light | `compare-image-390-first.png` |
| 이미지 390 dark | `compare-image-dark.png` |
| 이미지 360 light | `compare-image-small.png` |
| 이미지 1366 desktop | `compare-image-desktop.png` |
| 연결 오류 390 | `compare-error-390-first.png` |
| 이미지 읽기 오류 390 | `compare-image-error.png` |
| 새 조회 중 390 | `compare-loading.png` |
| 웹 PDF 안내 390 | `compare-web-pdf.png` |
| 권한 오류 수정 후 390 | `compare-forbidden-final.png` |

집중 비교 `compare-header-focused.png`에서 제목, 이름, MIME·크기, 안내문, 아이콘, 경계 및 간격을 확인했다. PDF 웹 안내/오류 패널은 전체 비교에서도 글자와 버튼을 충분히 읽을 수 있어 그 패널을 별도 확대하지 않았다. 200% 키보드 복귀는 `app-error-200-keyboard-return.png`를 열어 확인했다.

## Findings와 수정 이력

1. [P1, 해결] 첫 오류 구현은 alert를 표시했으나 오류 요약으로 포커스를 옮기지 않았다. 최초 `app-error-390-first.png` 캡처와 초기 오류 상태를 확인한 뒤 기존 `focusAccountNotice`를 재사용했다. 수정 후 `image-error-390-dom.json`은 activeElementRole=alert, 표시 버튼은 뒤로44px·재확인48px·복귀48px를 기록한다. Tab으로 재확인 → 복귀 이동과 포커스 경계도 직접 확인했다.
2. [P2, 해결] 삭제/권한 상태에서 서버 오류와 제목이 같은 내용을 반복했다. `app-forbidden-390.png` 초기 캡처에서 확인했다. status 기반 표시 의미는 유지하고 부문 설명을 복귀/원본 확인 안내로 바꿨다. `app-forbidden-390-final.png`, `forbidden-390-final-dom.json`, `compare-forbidden-final.png`로 수정 후 상태를 다시 캡처·비교했다. DOM은 파일명·크기·이미지 없이 접근 거절과 다음 행동만 표시한다.
3. [해결, 생명주기] 기존 blur 정리는 파일/URI를 지워도 이전 오류가 남을 수 있었다. release 시 오류 정리와 reactive screenFocused 가림을 보완했다. 실제 production 모듈의 blur/retry/back/새 focus 테스트로 이전 안내 제거와 캡처한 handler 차단을 확인했다. OS 생명주기 실기기 검증이라고 주장하지 않는다.

수정 후 actionable P0/P1/P2 없음.

## 필수 충실도 표면

- **Fonts/typography:** source Noto Sans KR 17/15/12/16/13px 및 line-height와 weight를 기존 앱 typography로 대응했다. 새 폰트나 의존성을 추가하지 않았다. 앱은 기존 시스템 폰트를 유지하여 자간·안티앨리어싱·일부 오류 설명 줄바꿈이 다르다. 이미지 읽기 설명은 source 2줄/app 1줄로 패널 높이 약19.5px 차이가 나지만 정보/버튼/읽기 영역을 손상시키지 않는다. 이는 기존 OS 폰트 유지에 따른 명시적 허용 차이이며 고정 줄 수로 문구를 잘라 맞추지 않았다. 제목과 긴 파일명은 전체 접근 이름과 자연스러운 줄바꿈을 유지한다.
- **Spacing/layout:** 52px 최소 헤더, 44px 뒤로, 정보 16px 바깥 여백/8·10px 세로 여백, 이미지12px padding, 패널16px/반경16px, 행동48px/간격8px가 비교에서 대응한다. Desktop header/info max760px, image max720px가 실제 측정/캡처에서 유지된다. 390의 첫 화면에 이름·형식·크기·짧은 안내와 전체 이미지가 표시되고 세로 공간 대부분을 내용에 사용한다. 별도 탭바·hero·중복 header 없음.
- **Colors/tokens:** source와 같은 useHomeTheme의 light/dark 표면·본문·보조문자·경계·blue action·danger를 사용한다. 삭제는 중립 아이콘/표면이다. 이미지 원래 흰 배경과 그림 색을 dark에서도 변경하지 않았다. Focus outline는 앱의 기존 가시성 기준을 따른다.
- **Image/asset quality:** 기존 42,034-byte 320×189 기관 심볼을 유지했다. Full-view에 동일 그림과 비율/전체 범위를 확인했고 Image resizeMode=contain을 production 모듈 테스트로 확인했다. 가짜 portrait/tall 슬롯·합성 PDF 페이지·기기 chrome·새 SVG 그림을 production에 넣지 않았다. 확대 시 원본 래스터 해상도 한계도 원본과 동일하다.
- **Copy/content:** 일반 h1, 확인된 파일명·실제 MIME·크기, non-consuming 안내 한 번, 오류/복구 행동과 웹 PDF 안내가 대응한다. 연결/미지원/선택 오류의 안전한 기존 chatError 설명은 API 의미를 보존한다. 원본 정리 이유를 추정하지 않는다. 저장·공유·삭제·수신 완료·가짜 page count·zoom 버튼을 추가하지 않았다. 아이콘은 기존 Feather를 사용해 source의 선형 언어와 대응한다.

## 상호작용·접근성·자동 검증

- 실제 화면: 이미지 정상/이미지 decode 실패/연결 실패/조회 중/권한 거절403/삭제410/웹 PDF 안내/대화 복귀 및 재진입을 확인했다. 오류와 조회 중 화면·접근성 tree에는 이전 파일명/크기/내용이 없다.
- 전체 native/Android/iOS OS가 아닌 Expo web 렌더링이다. Source PDF 보드는 합성 시각 참고다. 실제 native PdfPreview와 react-native-pdf의 local URI·빈 token·cache=false·trustAllCerts=false를 유지하고 새 verified URI로 재진입 시 remount한다.
- 첫 화면/overflow: 390·360·1366의 정상과 오류 측정에서 html.scrollWidth==CSS viewport width. 표시 h1 하나, 뒤로44px, 오류행동48px. 200%는 width180 logical/표시360이며 가로 넘침 없음. 복귀 버튼은 keyboard Tab 시 스크롤 후 top289.125/bottom347.125가 logical height380 안에 있고 visible focus를 확인했다. 세로 스크롤은 큰 글자 내용의 증가에 대응한다.
- `preview-non-consuming-proof.json`: 새 조회 GET1, read/send/fileMutations 모두0. 수신 완료·다운로드·원본 삭제 요청은 합성 서버가 차단/계수하며 이번 preview 검수에서 시도되지 않았다.
- 실제 production 모듈 테스트: 기존 전경 가림·abort·late result release·구 계정·이미지 오래된 onError·batched foreground 회귀를 유지했다. 추가 blur 오류 정리, 중복 retry GET1, captured navigation 차단, missing registry/invalid peer, 기존 peer fallback, 웹 PDF, 실제 presentation semantics/targets/focus/중복 copy 테스트를 확인했다. 최종 관련84개 통과/실패0/skip0.
- 변경 전 전체 로컬 suite2252개:2221통과, 실패0, DB31skip. 최종 permission-copy 회귀1개 추가 후 CI 기대 total2253; 운영 배포 전 PR/main CI에서 모든 DB 테스트 포함 통과를 확인한다.
- root/mobile lint/typecheck 통과. Native 공식 fingerprint: Android `2f70ec05a18af71c8d229c2f5a9b7c784ac38f2e`, iOS `410c5cf2288a9c64386597963a471ce3f1bb286e` 유지. 운영 export를 생성하고 새 미리보기12개 marker 및 기존 기능 marker를 모두 검사했다. 배포 자체는 별도 release proof에서 확인한다.
- 브라우저 콘솔의 app error0을 확인했다. 기존 web notifications/pointerEvents 경고 및 브라우저 확장 경고는 이번 화면 오류와 구분했다.

## 남은 검증 범위/Follow-up polish

실제 native PDF 렌더·확대·세로 스크롤, 실기기 safe area/큰 글꼴/VoiceOver·TalkBack, 앱 설치 OTA 적용, 실제 세로/매우 긴 이미지의 화면 검증은 수행하지 않았다. 핵심 lifecycle/format/권한/non-consuming 규칙은 실제 코드 회귀 테스트와 기존 서버 테스트로 보존하며 이를 실기기 증거로 대신하지 않는다. 시스템 폰트와 표준 ActivityIndicator의 미세 차이는 허용한 P3 polish다.

## Implementation checklist

- [x] Published source와 actual Expo를 동일 viewport/state/content로 비교
- [x] P1 focus/P2 반복 설명 수정 후 재캡처
- [x] 필수 typography/spacing/colors/image/copy 검토
- [x] Light/dark/small/desktop/200%·키보드·오류·loading 검수
- [x] 현존 core/API/저장/수신 완료/native viewer·runtime 보존
- [x] 관련 테스트·lint·typecheck·공식 production export 검증
- [ ] Exact-source PR/main CI·운영 배포·공식 production OTA 및 원격 byte/asset 확인 (배포 증거에 기록)
