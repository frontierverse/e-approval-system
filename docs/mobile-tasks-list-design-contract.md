# 모바일 내 할 일 목록 디자인 기능 계약

검증 기준: 2026-10-06, main e87c7c456868f3375db7c11b3292a7d3c2d766bb. 실제 소스를 읽어 작성했다. 운영 자료·인증 정보·실제 직원/업무 기록은 포함하지 않는다.

## 경로와 조회

mobile/src/app/tasks/index.tsx → TasksScreen → token-keyed TasksContent. status는 pending/overdue/completed/all/deleted, page는 양의 정수이며 기본 pending/1이다. 기존 인증된 GET /tasks?status={status}&page={page}을 사용한다. 새 서버/API/권한 정책을 도입하지 않는다.

응답은 status, today, tasks, counts(pending/overdue/completed/deleted), page, pageSize:20, total, totalPages다. 업무에는 id, title, description, meetingTitle, dueDate, completedAt, deletedAt, version 등이 있다. 목록 디자인에서 설명 본문·담당자·부서·내부 식별자를 추가로 노출하지 않는다. 현재 계정 본인에게 배정된 업무만 조회한다. 관리자도 이 모바일 목록에서 타인의 업무를 조회하지 않는다.

pending/overdue는 기한 오름차순, 기한 없는 업무는 뒤, 생성일·id가 동률 순서다. all은 미완료를 먼저 같은 순서로, completed는 완료 시각 내림차순, deleted는 삭제 시각 내림차순이다. UI에서 별도로 새 정렬을 하지 않는다. today는 서버 KST 기준이며 기한 초과는 미완료이면서 dueDate < today다. 전체는 pending+completed, 삭제는 별도다.

## 완료 처리와 경합

완료/완료 취소는 POST /tasks/{id}/completion에 {completed, version}을 보낸다. mutation ref가 동기적으로 연타를 차단한다. 서버의 ok:true 및 동일 id 응답이 확인된 뒤에만 서버 version과 상태를 적용하고 목록을 재조회한다. 진행 중 필터·등록·이전/다음·완료 행동의 잠금을 보존한다. 제목에서 상세로 이동하는 기존 동작은 유지한다.

409/403/404 또는 확정하지 못한 성공 응답은 conflict로 쓰기를 잠근다. 403/404는 기존 목록을 제거한다. 성공적인 최신 GET 후 잠금을 풀고 사용자가 새 서버 version의 업무를 다시 선택해야 한다. 다른 확정 실패의 재시도는 저장해 둔 원래 task/version/completed를 사용한다. 저장 성공 뒤 후속 조회 실패는 GET만 재시도하며 이전 POST를 재전송하지 않는다. 확인 전 요약 건수는 —이고 성공 안내를 유지한다.

상세는 기존 /tasks/[id], 등록은 /tasks/new다. 목록에서 새 삭제/복구/일괄 변경을 넣지 않는다. 상세 삭제의 기존 확인 절차를 건드리지 않는다.

## 조회 상태와 개인정보

path에 일치하는 결과만 표시한다. sequence와 focused guard는 늦은 응답·변경된 필터/페이지·blur 응답을 무시한다. 화면 복귀 시 result를 비운 뒤 새로 조회한다. 계정 token 변경 시 child를 재마운트한다. 처리 중 blur/복귀가 생기면 쓰기 종료 후 최신 path로 다시 조회한다.

현재 403/404 GET 새로고침 후 캐시가 남는 문제가 합성 실제 Expo 화면에서 확인됐다. 이번 변경은 해당 current 요청의 403/404에서 result와 notice를 제거한다. 단순 500 연결/서버 오류의 캐시 보존은 유지하고 오류를 분명히 표시한다. 인증 만료는 기존 session provider가 처리한다. CSS 가림만으로 접근 제한 자료를 보존하지 않는다.

## 표시 구현과 검증

현재 state/request/focus/mutation 구조를 유지하고 표시 컴포넌트·스타일만 필요한 만큼 교체한다. 기존 useHomeTheme/선형 아이콘/타이포그래피를 재사용하고 root Stack header와 중복되지 않게 한다. 실제 SafeArea를 사용하며 제품 화면 안에 가짜 상태바·기기 프레임·검수 제어를 넣지 않는다. 새 패키지·native 설정·runtime 변경 없이 구현한다.

tests/mobile-tasks-screen.test.mts는 실제 production TSX를 실행하며 UI/API/navigation 경계만 대체한다. 필터·페이지 오래된 응답, 중복 POST, original-version 재시도,409/404, blur/복귀, 성공 후 GET 실패, token 변경을 보존한다. 새 회귀는 403/404 refresh의 행·건수 제거와 GET만 복구,500의 기존 자료 보존을 확인한다.

비교 대상 Claude reference와 실제 앱을 같은 viewport/state/content로 검수한다.390 light/dark,360,1366,200% 상당 글자, 긴 제목·큰 건수·빈 목록·오류·권한 변화·완료 잠금·충돌·페이지 상태를 확인한다. first-row40% 기준·44px행동·대비·키보드 포커스·가로 넘침을 실제 DOM/캡처로 기록한다. 웹 모의로 확인하지 못한 native 줄바꿈/OS글자 확대·스크린리더는 미확인으로 남긴다.

관련 테스트, 모바일/루트 lint·typecheck 및 필요한 CI를 통과한 뒤 기존 승인 범위에 따라 PR·merge·배포한다. 검수용 서버/합성 데이터는 release와 분리하고 exact commit CI·운영 배포·GET 점검·runtime fingerprints·공식 EAS production update·원격 자산 해시를 확인한다.

