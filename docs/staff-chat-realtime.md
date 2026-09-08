# 직원 채팅 실시간 연결

채팅은 로그인한 재직 직원 사이의 1:1 메시지를 데이터베이스에 저장한다. 채팅바를 닫아도
읽지 않은 메시지 수를 갱신하며, 메시지 본문과 목록은 참여자를 확인하는 HTTP API로 읽는다.

실시간 알림은 기존 Supabase 서버 설정인 `SUPABASE_URL`(또는
`NEXT_PUBLIC_SUPABASE_URL`)과 `SUPABASE_SERVICE_ROLE_KEY`를 사용한다. 브라우저에는
Supabase 키를 전달하지 않는다. 서버는 서비스 키로 인증한 **private** 채널을 사용하고,
직원별 채널명은 서비스 키를 이용한 HMAC으로 생성한다. 채널명에 직원 ID를 넣지 않으며
이벤트 내용은 빈 객체다. 채팅 테이블을 `supabase_realtime` publication에 추가하거나
익명·일반 클라이언트에 `realtime.messages` 읽기 정책을 열 필요가 없다.

전송 형식은 [Supabase Broadcast REST 문서](https://supabase.com/docs/guides/realtime/broadcast#broadcast-using-the-rest-api)의
배치 엔드포인트 `POST /realtime/v1/api/broadcast`를 따른다. 메시지별 `private` 필드는
[공식 서버의 배치 스키마](https://github.com/supabase/realtime/blob/master/lib/realtime/tenants/batch_broadcast.ex)에 정의되어 있다.
구독은 [Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization)의
`config.private: true`를 사용한다. 서버 클라이언트는 사용자 로그인 세션을 저장하지 않으며,
첫 구독 전에 `realtime.setAuth()`를 완료해 생성자에 전달한 서비스 키로 인증한다.
서비스 역할의 RLS 우회는 [공식 RLS 문서](https://supabase.com/docs/guides/database/postgres/row-level-security#bypassing-row-level-security)에 설명되어 있다.

`GET /api/chat/stream`은 요청 쿠키를 검증하고 활성 재직 직원만 연결한다. 연결 중에도
20초마다 세션 만료와 재직 상태를 확인하며, 4분에 한 번 연결을 갱신해 서버 함수 실행
제한에 대비한다. 브라우저가 닫히거나 연결을 중단하면 구독을 정리한다. 같은 직원이
여러 탭을 열 때 서버 프로세스 안의 업스트림 구독을 공유하고 마지막 연결 종료 때 해제한다.

메시지 저장·읽음 처리 완료 후 서버가 두 참여자에게 무효화 알림을 보낸다. 전송 실패는
이미 저장한 메시지를 실패 처리하지 않는다. 실시간 연결이 끊기거나 Supabase 설정이
없으면 클라이언트가 5초마다 HTTP로 확인하며, 연결 상태에도 재연결 중임을 표시한다.
연결 중에도 30초마다 데이터를 다시 확인해 누락된 알림을 복구한다. 숨긴 탭과 오프라인
상태에서는 연결을 쉬고, 다시 활성화될 때 먼저 데이터를 가져온다.

클라이언트 `useStaffChatSync({ userId, refresh })`의 `refresh`는 HTTP 오류를 throw해야
한다. 그래야 실패 시 재시도가 실행되고 데이터 동기화가 끝나기 전에 연결됨으로 표시하지
않는다. HTTP 401 응답에서는 호출자가 화면의 사적인 메시지 데이터를 지워야 한다.

동작 검증은 `tests/staff-chat-realtime.test.mts`에서 비공개 이벤트, 참여자 분리, 여러 탭의
구독 수명, 인증 만료·퇴사/비활성 계정 차단, 요청 취소, 중첩 갱신, 오프라인 복구를 다룬다.
실제 설치에는 채팅 메시지 테이블 마이그레이션을 적용해야 하며, 이 문서 작성이나 테스트
실행은 운영 데이터베이스 마이그레이션과 배포를 수행하지 않는다.

## 배포 순서

1. 배포 대상 DB에 `npm run db:deploy`로
   `prisma/migrations-postgresql/20260908000000_add_staff_chat/migration.sql`을 적용한다.
2. `npm run db:generate` 및 `npm run build`를 실행한 앱을 배포한다.
3. 별도 테스트 직원 두 명으로 전송·수신·읽음·재접속을 확인한다. 이 저장소의 로컬
   검증에서는 운영 직원에게 메시지를 보내거나 원격 DB를 변경하지 않았다.

채팅 테이블은 RLS를 활성화하고 일반 클라이언트용 정책을 만들지 않는다. 데이터베이스
소유자 또는 서비스 역할로 접속하는 서버가 앱 세션과 대화 참여자를 확인한 뒤 접근한다.

## 화면 검수

`npm run test:chat`은 실제 `StaffChatDock`과 앱 스타일을 로컬 격리 화면 `/`에 렌더링하고,
가상 직원·메시지 API 및 SSE로 검증한다. 운영 로그인과 DB에 의존하지 않는다.

- 1366×768, 390×844, 320×800 및 200% 확대에 해당하는 683×384 화면을 확인했다.
- 첫 화면에는 우측 하단 채팅바와 미확인 수가 표시되고, 열면 대화 목록·직원 검색이
  나타난다. 직원을 선택하면 대화 상대·연결 상태·메시지·입력창·전송 버튼을 확인할 수 있다.
- 가로 넘침 없음, 라이트·다크 모드, 긴 한글 메시지, 빈 상태, 로딩, 오류와 로그인 만료를
  확인했다. Escape 최소화와 실행 버튼으로 포커스 복귀도 검증한다.
- 전송 중 중복 실행 차단, 실패 후 입력·요청 ID 보존, 상대별 임시 작성 내용,
  느린 응답이 다른 대화에 표시되지 않는 동작을 확인했다.
- 스크린샷은 `outputs/chat/`에 저장한다. 전체 앱과 실제 두 직원 사이의 네트워크·DB
  통합 검증은 배포 환경에서 별도로 수행해야 한다.

실제 Supabase 연결도 별도 확인했다. 임의의 비공개 테스트 채널에서 두 독립 서버
클라이언트가 실제 발행 함수의 빈 이벤트를 수신했다. 직원 ID·메시지 본문·DB 변경은
사용하지 않았고 확인 후 테스트 채널과 연결을 정리했다.
