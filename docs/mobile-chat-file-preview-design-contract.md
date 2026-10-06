# 모바일 채팅 파일 미리보기 디자인 기능 계약

검증 기준: 2026-10-06, main `43b0955e0618a2f0a6dede47605ad5e7bac673e9` (직원 대화방 v1 반영). 사용자 승인으로 이 계약과 브리프를 기존 Claude 디자인 작업에 전달하여 정확한 모의 동작을 참고하게 한다. 운영 데이터·자격 증명·실제 파일은 포함하지 않는다.

## 기존 경로와 조회

`mobile/src/app/chat/file-preview.tsx` → `ChatFilePreviewScreen`. route는 `attachmentId`, `peerId` 공개 식별자만 받으며 `chatRouteId`로 정규화한다. 토큰·파일명·로컬 URI·외부 URL·파일 바이트를 route params에 넣지 않는다. 기존 로그인 stack과 화면 안전 영역을 유지한다.

대화의 `ChatAttachmentActions`에서 파일 종류(PDF/이미지), 크기 ≤4MiB, 현재 계정·전경, busy/ready/unknown 조건을 검증하고 `registerChatPreviewAttachment({ attachment, token, peerId })`를 호출한다. 파일 작업 패널을 먼저 닫은 뒤 `/chat/file-preview`로 이동한다. 기존 다운로드/수신 완료 불명확 작업과 미리보기를 섞지 않는다.

화면은 token·peerId·attachmentId keyed child 및 현재 계정 ref guard를 가진다. `lookupChatPreviewAttachment`는 같은 token·peerId·attachmentId의 등록 정보만 반환한다. 등록 정보가 없거나 식별자가 유효하지 않으면 조회를 시작하지 않는다. 주소로 직접 들어왔다고 이름을 유추하거나 등록 정보를 만드는 우회가 없다.

`loadChatPreview`는 기존 인증된 `/chat/files/{id}/preview` GET을 사용한다. 실제 파일 크기가 첨부 크기와 같은지 확인하고 MIME 및 매직 바이트를 확인한 뒤 PDF/이미지 URI와 `release()`를 반환한다. 원본 ≤4MiB, 지원 PDF/PNG/JPEG/GIF/WebP만 허용한다. 조회는 다운로드 lease·receiptToken·수신 완료·원본 삭제·읽음 처리·방송을 만들지 않는다. 서버·API·인증·스토리지 정책은 이번 작업에서 변경하지 않는다.

## 생명주기와 개인정보

`alive`, `focused`, `foreground`, 화면 `epoch`, provider 현재 계정, `foregroundEpoch` 및 `isForegroundCurrent` 조건을 모두 보존한다. `busy` ref가 연타/프로그램 이벤트를 차단한다. 조회 시작 시 이전 preview·file·error를 비우고 `AbortController`를 사용한다. **확인된 GET 성공 이후에만 이름·크기·형식·내용을 렌더링**한다.

blur·background·전경 epoch 변경·계정 전환·unmount는 이전 요청을 abort하고 소유 preview를 release한다. 웹 blob URL revoke와 네이티브 임시 파일 제거를 보존한다. 재진입은 새 인증된 파일 조회를 수행한다. 오래된 성공은 release만 하고 화면에 적용하지 않는다. 오래된 오류는 새 계정 세션을 만료시키거나 새 preview를 제거하지 않는다. 배경/blur 중 캡처한 재확인 handler는 새 요청을 시작하지 않는다.

401은 현재 token 세션만 `expireSession(token)` 한다. 현재 preview용 blob/임시 파일 cleanup은 기존 수신 저장 작업의 자원을 지우지 않는다. 이미지 onError는 해당 preview와 `resource.current`가 같은지 확인한 뒤만 release/error 처리한다. 루트와 모든 접근성 텍스트에서 오래된 사적 파일명·내용·피드백을 제거한다.

## 표시 계층과 네이티브 뷰어

기존 `useHomeTheme`와 대화방/목록 typography를 재사용한다. 표시 분리는 lifecycle·조회 함수를 그대로 연결하여 수행한다. 필요하면 route 자체의 Stack header를 끄고 앱 공통의 간결한 헤더를 쓰되 중복 헤더·기기 safe area 모사를 만들지 않는다. 뒤로는 `router.canGoBack()`이면 back, 아니면 유효한 peerId의 대화 route, 없으면 `/chat`로 이동한다. 대화 재진입에는 기존 새 검증을 유지한다.

기존 native `PdfPreview`는 `react-native-pdf` 7.x, `source.cache=false`, `trustAllCerts=false`, 기존 오류·재시도 상태를 사용한다. 채팅은 인증된 파일 바이트를 이미 받은 로컬 URI와 빈 token으로 이 컴포넌트를 호출한다. PDF 뷰어에 세션 토큰·외부 서비스·임의 URL을 새로 전달하지 않는다. 기존 문서·자료실도 쓰는 공통 뷰어를 광범위하게 변경하지 않는다. 이미지의 `resizeMode="contain"`과 기존 실패 handler를 유지한다. 이미지에 새 확대/회전 기능을 넣지 않는다.

웹 PDF는 현재 안내만 렌더링한다. 실제 모바일 PDF 뷰어와 웹 안내를 별도 상태로 캡처한다. Claude의 합성 PDF 보드는 시각 참고이며, 실제 네이티브 PDF 렌더 성공·페이지 수·확대 동작 증거가 아니다. 새 패키지·네이티브 설정·Expo 런타임·버전 변경 없이 기존 앱의 OTA 배포 범위에서 구현한다.

## 오류·복구

기존 `ApiError` status와 `chatError` 메시지를 보존하거나 같은 의미의 짧은 표시로 연결한다. 오류 문자열 때문에 지원 형식/권한/삭제 상태를 추측하는 비즈니스 분기를 만들지 않는다. 파일 선택 정보 없음·400/403/404/410/415·연결/타임아웃 실패는 민감한 정보 없이 표현한다. 조회 오류에서 기존 `미리보기 다시 확인`은 동일 attachment ID로 새 GET만 수행하며 다운로드·수신 완료 작업은 시작하지 않는다. 삭제/미지원·registry 없음은 대화로 돌아가 파일 작업을 확인하도록 안내한다.

## 검증과 인수 기준

기존 `tests/mobile-chat-client.test.mts`의 preview 전경 가림·abort·늦은 URI release·권한 실패·구 계정 응답·오래된 이미지 error·batched foreground 테스트를 유지한다. `tests/mobile-chat-file-core.test.mts`, `tests/mobile-chat-file-transfer.native.test.mts`, `tests/staff-chat-files.test.mts`, `tests/mobile-chat.test.mts`의 non-consuming 조회·MIME/크기·registry·자원 정리·서버 권한 테스트도 보존한다. presentation harness는 실제 production module을 실행하고 외부 UI 포트만 mock한다.

관련 모바일/루트 lint·typecheck, 의미 있는 회귀 검사와 필요 빌드/CI를 통과한다. 실제 Expo 합성 환경에서 이미지 정상·조회/이미지 실패·등록 정보 없는 진입·로딩/복귀 가림·뒤로를 390 light/360 dark/1366/200%에서 확인한다. Claude reference와 실제 앱을 같은 viewport/state/content로 나란히 비교하고 불일치를 수정한다. PDF native 표시·실기기·스크린리더·설치 업데이트 적용은 직접 확인하지 않았으면 명확히 남긴다. 합성 QA 인프라·파일·주소는 릴리스와 분리한다. 검증한 export 파일 해시와 기존 runtime fingerprints를 확인하고 exact commit CI·운영 배포·운영 GET 점검 뒤 공식 EAS production update를 한 번 발행하여 원격 번들과 자산도 대조한다.
