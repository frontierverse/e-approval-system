# 모바일 직원 채팅 목록 디자인 기능 계약

검증 기준: **2026-10-06 / main aa6fbc910868f3bf4a6c0506d002a996ac313d4b**.
이 문서는 Claude 디자인용 합성 프로토타입에 전달할 기능 경계다. 운영 코드·직원·메시지를 첨부하거나 API를 호출하는 지시가 아니다.

## 경로와 접근

`mobile/src/app/chat/index.tsx`는 `ChatScreen`을 렌더한다. 인증 stack 안의 `/chat`이며 내 정보의 직원 채팅 메뉴에서 진입한다. 현재 stack 헤더는 ‘직원 채팅’이고 이전 화면이 있을 때 뒤로 버튼을 제공한다. 새 디자인은 공통 디자인 헤더와 deep link 뒤로 fallback `/profile`을 제공할 수 있다. 목록에는 하단 탭바가 없다.

직원을 선택하면 `router.push({ pathname: "/chat/[peerId]", params: { peerId: peer.id } })`로 이동한다. 이번 모의 화면에서는 해당 목적지 정보만 앱 밖에 표시한다. 실제 전송·읽음 처리·파일 미리보기는 이번 범위에 없다.

## 조회와 데이터

`ChatProvider.refreshSummary()`가 인증 HTTP `/chat` 요청 결과를 `isChatSummary(value, userId)`로 검증한다. 확인한 값은 다음 형태다.

```ts
type ChatEmployee = {
  id: string; name: string; departmentName: string; positionName: string; active: boolean;
};
type ChatSummary = {
  employees: ChatEmployee[]; // 나를 제외한 재직 직원, 서버 제공 순서
  conversations: {
    peer: ChatEmployee; // 비활성 상대의 기존 기록 포함 가능
    lastMessage: {
      id: string; sequence: string; senderId: string; recipientId: string;
      body: string; createdAt: string; readAt: string | null;
      attachment?: { id: string; originalName: string; size: number;
        status: "available" | "downloading" | "deleting" | "deleted" } | null;
    };
    unreadCount: number;
  }[];
  unreadCount: number; // conversations의 unreadCount 합과 일치하는 전체 메시지 수
};
```

`src/lib/staff-chat.ts`는 직원 목록을 부서 정렬·이름·ID로, 대화 목록을 마지막 메시지 sequence 내림차순으로 반환한다. 모바일은 서버 순서를 유지한다. unreadCount는 읽지 않은 메시지 수이고 대화 수가 아니다. 0 이상 안전한 정수만 수용한다. 읽음 처리 API는 목록 컴포넌트에서 호출하지 않는다.

이름·부서·직급 문자열을 붙이고 한국어 소문자로 바꿔 `search.trim()` 포함 여부로 두 목록을 로컬 필터링한다. 현재 검색 입력은 직원 찾기에만 보이지만 필터는 대화 목록에도 적용된다. **새 시안에서 검색 입력을 두 목록에 보여주는 것은 숨은 필터를 제거하는 표시 개선**이다. 메시지 본문 검색·새 서버 검색·검색어에 따른 전체 건수 변경은 없다.

직원 찾기는 재직 직원 배열에서 같은 peer의 기존 대화를 찾아 안 읽음 표시를 재사용할 수 있다. 새 대화는 직원 찾기를 켜고 검색어를 비운다. 대화 목록/직원 찾기 전환은 검색어를 유지한다. 검색 지우기는 로컬 입력만 바꾼다.

## 표시 계약

- 대화 수: `conversations.length`, 안 읽음: `unreadCount`. 필터 결과 수와 구분.
- 미리보기: `lastMessage.body || lastMessage.attachment?.originalName || "파일 메시지"`.
- 시각: 기존 `formatChatTimestamp`, `Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })`.
- `ChatBadge`는 0이면 숨기고 100 이상 99+로 보이며 실제 수를 접근 이름으로 제공한다.
- 비활성 상대: 이름에 ‘기록’, 접근 이름에 ‘현재 대화 기록만 확인 가능’. 직원 찾기에 비활성 상대는 없다.
- 직원 찾기에서 부서·직급을 명확하게 표시하는 것은 이번 표시 개선이다. 사진/아바타 URL/온라인/입력 중/마지막 접속은 데이터에 없다.

## 수명·프라이버시·중복 방어

`ChatScreen`은 token별 자식 key와 현재 계정 guard를 갖는다. `ChatScreenContent`는 alive/focused/generation/verified/foregroundEpoch/isCurrentAccount/isForegroundCurrent를 확인한다. 첫 진입·다시 focus·앱 복귀·수동 `load(true)`는 이전 내용을 가리고 새 조회가 성공한 뒤에만 내용을 표시한다. 화면을 벗어나면 세대가 바뀌고 data를 비운다. 앱이 background/Android blur로 바뀌어도 이전 내용을 제거한다.

수동 load는 busy 중 다시 요청하지 않는다. 행 이동·검색·전환은 현재 계정이면서 해당 전경 epoch의 조회가 검증된 경우에만 가능하다. 화면을 벗어나거나 계정·전경 세대가 바뀐 뒤 도착한 응답은 private data와 navigation을 갱신할 수 없다. 디자인 표시 개선으로 이 guard를 약화하지 않는다.

Provider는 전경에서 5초마다 HTTP로 다시 확인하며 모바일 목록 자체에 SSE나 온라인 표시가 없다. 요청이 진행 중이면 같은 Promise를 재사용한다. background 진입은 summary와 error를 비운다. 401이면 현재 세션 만료 절차를 따른다. 401/403/404이면 summary를 제거한다. 일반 네트워크 오류는 같은 계정·전경에서 검증된 summary를 유지할 수 있지만 provider의 unreadCount는 error가 있으면 null이다.

따라서 최초/수동 조회 실패는 private 내용을 가린 오류·재시도, 주기 조회 실패는 기존 확인 목록 + ‘안 읽음 확인 필요’ + 오류·재시도일 수 있다. 이전 계정 캐시를 네트워크 실패 상태로 남겨서는 안 된다. 원래 모바일 목록은 일부 로딩에서 input이 잠기지 않아도 handler가 차단하는 차이가 있다. 새 디자인은 시각적 비활성과 실제 handler guard를 일치시킨다.

## 테스트와 구현 경계

기존 `tests/mobile-chat-client.test.mts`는 실제 production 목록·provider·대화·파일 컴포넌트를 lexical native boundary에서 실행한다. `tests/mobile-chat-session.test.mts`, `tests/mobile-chat-core.test.mts`, `tests/mobile-chat.test.mts`, `tests/mobile-chat-postgresql.test.mts`가 계정·참여자·정합성 계약을 보완한다. 물리 키보드·FlatList viewability·실제 OS 검증을 대체하지 않는다.

실제 앱 반영 때 presentation 분리와 검색 입력/상태/접근성 개선만 수행하고 provider/API/서버/전송·읽음·첨부 정책/런타임·네이티브 설정을 유지한다. 합성 QA harness는 release source와 분리한다. 모바일 lint·typecheck, 관련 보호 회귀 테스트, 라이트/다크·작은 화면·큰 글자·키보드 검수와 production export를 수행한다. 배포는 디자인 시안 완료와 실제 구현 검증 뒤 Codex가 별도로 진행한다.
