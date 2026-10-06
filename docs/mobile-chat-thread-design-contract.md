# 모바일 직원 대화방 디자인 기능 계약

검증 기준: 2026-10-06, main `79de349ca5f7ca690e1a2de392b071b4d845e7c1`. 이 문서는 로컬 구현·검수용이다. 외부 디자인 메시지는 별도 브리프의 일반 UI 요구와 합성 자료를 사용한다.

## 소스·경로

`mobile/src/app/chat/[peerId].tsx` → `ChatThreadScreen`. 로그인 stack, 현재 제목 직원 대화. 새 헤더는 기존 직원 채팅 디자인 계열을 사용하고 이전 화면이 없을 때 `/chat`로 돌아간다. `KeyboardScreen`의 네이티브 키보드 overlap 측정과 `usePreventRemove` 작성 보호를 보존한다. 별도 `/chat/file-preview` 화면은 다음 작업이다.

`ChatThreadScreen`은 token·peerId 자식 key와 현재 계정 guard를 가진다. 계정·화면 generation·전경 epoch 확인은 표시 분리 이후에도 모든 조회·전송·읽음·파일 작업을 보호한다. 최초/focus/전경 복귀/수동 새로고침은 사적 내용을 가리고 새로운 검증 뒤 표시한다. 배경·blur 시 목록과 파일 작업을 가린다. 401/403/404 조회는 내용과 입력·파일 자원을 제거한다. 일반 네트워크 실패는 같은 현재 전경에서 확인한 기록을 보존할 수 있다.

## 기록·읽음

`/chat/messages?peerId=...`와 `/chat` summary를 확인한다. 이전 기록은 첫 메시지 ID의 `before`로 조회하고 최대 50개를 앞에 합친다. sequence는 큰 정수 문자열 순서이며 ID 중복을 제거한다. gap이면 안내와 이전 메시지 행동을 제공한다. DTO·상대 참여자·정규 ISO 시각 검증을 약화하지 않는다. 한국시간 표시 `formatChatTimestamp`를 유지한다.

FlatList viewability는 100%/250ms. 현재 전경에서 검증된 화면이면서 아래를 보고 있을 때만 실제 보이는 수신 미확인 메시지를 `/chat/read`로 처리한다. 대상 ID는 가장 마지막 실제 보인 수신 메시지, 이전 sequence 이하와 중복 busy는 차단한다. 실패는 `readError` + 읽음 상태 다시 확인. 기록 조회나 스크롤을 임의로 모두 읽음으로 바꾸지 않는다. 기존 viewability·onScroll·onContentSizeChange·maintainVisibleContentPosition 연결을 보존한다.

## 입력·멱등 전송

본문은 trim된 1~2,000자 또는 파일 한 개. `/chat/messages` POST 또는 `uploadChatFile`은 `requestId`와 원래 본문·파일을 `pending`에 보존한다. 성공 응답은 현재 참여자·내 발신·정확한 본문을 검증한 뒤에만 기록을 합치고 입력과 파일을 비운다. 파일만 전송 시 기대 본문은 `파일: ${file.name}`. 실제 파일 전송과 취소·진행률·자원 release는 기존 구현을 사용한다.

일반 검증/거절은 pending을 풀고 입력 보존. 응답 미확인(네트워크/408/5xx/유효하지 않은 2xx) 및 409/404/410은 원래 pending을 유지하고 uncertain으로 잠근다. 같은 전송 다시 확인은 원래 requestId·본문·파일을 재사용한다. 백그라운드/blur 중 완료는 결과를 적용하지 않고 원래 전송 확인을 유지한다. handler lock/ref가 연타와 프로그램 이벤트를 방어한다. 새 표시 버튼도 실제 guard와 disabled를 일치시킨다.

`/chat/files`의 검증된 파일 정책을 조회한 후 기존 `pickChatFile` 사용. 한 개, 일반 최대 4MiB, ZIP 최대 100MiB, 허용 확장자는 서버 정책. OS 선택기 복귀 파일은 새 전경 검증 뒤에 적용한다. 선택 취소는 이전 입력 보존. 별도 새 파일 개별 제거 기능을 임의로 추가하지 않고 기존 작성 내용 버리기 확인으로 처리한다.

dirty는 본문/file/uncertain/busy/selecting/filePending. 나가기와 버리기는 `useConfirmAction`. 진행중/접근 미검증/선택중은 나가기 차단; 미완료 파일 작업은 먼저 닫기 또는 원래 수신 상태 확인. beforeunload 웹 보호 유지. 나가기 확인이 오래 떠 있는 사이 계정·전경이 바뀌면 응답을 적용하지 않는다.

## 첨부·파일 수신

`ChatAttachmentActions`는 attachment ID·발신/수신·scope generation·전경 보호를 사용한다. 파일 메시지는 이름/size/status만으로 표현; `available/downloading/deleting/deleted`를 근거 없는 저장 완료로 번역하지 않는다. 실제 수신 완료 상태는 로컬 transfer 상태와 검증 응답으로 확인한다.

현재 패널의 미리보기(지원 PDF/이미지, ≤4MiB, ready/unknown 아닐 때), iOS 저장·공유 / Android 저장+다른 앱 공유, 요청 취소, 닫기, received handoff 뒤 ‘파일을 저장했습니다 · 수신 완료’, unknown ‘원래 수신 완료 상태 확인’을 보존한다. 수신 완료 확인문은 서버 원본 삭제·재수신 불가를 명확히 경고한다. 공유 종료는 실제 저장 확인이 아니며 사용자가 확인해야 한다. unknown 중 닫기는 차단한다. preview 별도 이동의 registry/guard를 유지한다.

## 검증

production 화면을 실행하는 `tests/mobile-chat-client.test.mts`의 계정/전경/응답/읽음/멱등 전송/파일 guard를 다시 확인한다. 프레젠테이션 분리 시 실제 production 모듈을 테스트하는 lexical harness 연결을 갱신한다. 기존 DTO·파일·session·core 테스트를 유지한다. 모바일 lint/typecheck 및 비례한 회귀 검사, 실제 Expo 웹 390 light/360 dark/1366/200%+주요 상태 비교, production export와 런타임 fingerprint 검증 뒤 배포한다. 합성 QA 도구는 릴리스 소스와 분리한다. 실기기 검증 여부는 추정하지 않는다.
