# 내 정보 v1 현재 기능 계약

기준 **2026-10-05 / codex/claude-mobile-profile-design**, 운영 기준 main **44f09062af518976e7cd9eedaa5333fa2aced4d0**에서 내 정보 v1을 반영한 최신 소스 계약이다. 운영 적용 완료를 의미하지 않는다. 운영 주소·자격 증명·개인 정보는 포함하지 않는다.

## 근거 파일

- `mobile/src/app/(tabs)/profile.tsx`, `mobile/src/components/profile-screen.tsx`: 허브 진입, 계정 요약, 업무 메뉴, 설정 링크, 기기 알림, 로그아웃 확인.
- `mobile/src/lib/profile-state.ts`, `mobile/src/lib/use-profile-logout.ts`: 상태별 표시·재시도 의도, 확인 및 중복 실행 잠금.
- `mobile/src/app/(tabs)/_layout.tsx`: 탭 순서·권한·선택·배지·Safe Area.
- `mobile/src/lib/types.ts`: `MobileUser`와 `ChatSummary`.
- `mobile/src/lib/home-theme.ts`: 적용된 페이지의 라이트·다크 토큰.
- `mobile/src/lib/notifications.tsx`, `mobile/src/lib/push.ts`: 푸시 설정·권한·재시도·계정 범위.
- `mobile/src/lib/chat-provider.tsx`, `mobile/src/lib/chat.ts`: 채팅 건수와 계정 범위·응답 검증.
- `mobile/src/lib/session.tsx`: 로컬 세션 정리와 서버 로그아웃.
- `src/app/api/mobile/push-subscription/route.ts`: 현재 세션의 등록 조회·등록·해제.
- `mobile/src/app/account.tsx`, `mobile/src/app/app-updates.tsx`: 기존 자식 화면. 이번 디자인 범위는 연결 행만이다.

## 사용자·경로·건수

```ts
type MobileUser = {
  id: string;
  name: string;
  role: string;
  positionName: string;
  canApproveDocuments: boolean;
};
```

허브는 `name`과 `positionName`을 표시한다. 부서·이메일·프로필 사진·도장 이미지가 이 객체에 없다. `role`만으로 받은결재 탭을 만들지 않는다.

업무 경로는 직원 채팅 `/chat`, 청소년 관리 `/youth`, 자료실 `/resources`, 급식·카페 `/meal-menu`, 업무일지 `/work-logs`, 업무 일정 `/work-schedules` 순서다. 계정·도장 설정 `/account`, 앱 업데이트 `/app-updates`가 뒤따른다. 채팅·청소년·자료실·급식 링크는 각 provider의 현재 계정 검사 후 이동한다. 허브에 검색·필터·추가 KPI·기기 목록 기능이 없다.

채팅 provider의 `unreadCount`는 검증된 현재 계정 요약의 수다. 실패면 `null`, 아직 확인 전도 `null`. 표시 규칙은 다음과 같다.

| 값 | 현재 표시 의미 |
| --- | --- |
| `null`, 오류 없음 | 직원 채팅 · 확인 중 |
| `null`, 오류 있음 | 직원 채팅 · 확인 필요 |
| `0` | 직원 채팅 |
| `1..99` | 직원 채팅 · 안 읽음 n개 |
| `>=100` | 직원 채팅 · 안 읽음 99+개 |

이 수는 결재 알림 `unreadCount`와 별개다. 채팅128은 시각99+와 접근 이름128로 표시한다. 현재 계정이 아닌 응답을 보이지 않게 하며401은 세션 만료 처리한다. 허브 콘텐츠도 계정·세션 키로 초기화한다.

탭은 `canApproveDocuments=true`일 때 홈/받은결재/문서함/알림/내 정보, false이면 홈/문서함/알림/내 정보다. 알림 배지는 null·0에서 숨김, 1..99 숫자, 100 이상 99+, 접근 이름은 실제 수다. 전역 탭바에는 별도 임시저장 탭이 없다.

## 기기 알림 provider

```ts
pushStatus: { enabled: boolean } | null;
pushLoading: boolean;
pushPending: boolean;
pushError: string | null;
pushMessage: string | null;
pushNeedsSettings: boolean;
pushFailedMode: "auto" | "enable" | "disable" | null;
enablePush(); disablePush(); retryPushRegistration();
refreshPushStatus(); openPushSettings();
```

`pushStatus=null`은 미확인이다. `pushLoading`은 네이티브·로그인·미확인 상태의 조회 진행을 나타낸다. `pushPending`은 해당 계정의 푸시 설정 작업이 진행 중임을 나타낸다. 조회와 설정 작업은 중복 실행을 합친다. 현재 계정·토큰·generation이 바뀐 응답으로 상태를 덮어쓰지 않는다.

다음 API는 모두 모바일 인증이 필요하다. 이 표는 계약 설명이며 Claude 프로토타입은 호출하지 않는다.

| 방식·경로 | 범위·응답 | 확인 뒤 상태 |
| --- | --- | --- |
| GET `/push-subscription` | 현재 로그인 sessionId 등록 존재, `{enabled:boolean}` | 조회 상태 반영 |
| POST `/push-subscription` | `{expoPushToken}` 검증·현재 세션 upsert, `{enabled:true}` | 켜짐과 성공 문구 |
| DELETE `/push-subscription` | 현재 sessionId 등록 삭제, `{enabled:false}` | 꺼짐과 성공 문구 |

POST는 같은 푸시 토큰이 다른 세션에 연결되어 있으면 현재 세션으로 연결을 정리한다. DELETE는 모든 계정·모든 기기의 해제가 아니다. 서버 enabled는 OS 권한이나 실제 도착을 보증하는 필드가 아니다. 프로토타입에서 실제 토큰 형식·인증 헤더·서버 주소는 필요 없다.

자동 조회는 OS 권한 팝업을 열지 않는다. 등록이 켜져 있으면 허용된 기존 권한으로 토큰을 재확인한다. 사용자가 켜기를 실행하고 권한이 미결정이며 다시 요청 가능할 때만 OS 권한을 요청한다. 거부 상태에서는 기기 설정 안내를 사용한다. iOS provisional/ephemeral도 허용으로 처리한다.

명시적 켜기/끄기 실패는 내부 `failedPushMode`에 해당 의도를 보존하고, 읽기 전용 `pushFailedMode`로 허브에 전달한다. **끄기 실패 뒤 재시도는 disable**이며 자동 ON 재등록으로 그 의도를 없애지 않는다. 허브도 ‘알림 끄기 다시 시도’로 표시한다. 실패를 false나 true 성공 상태로 만들지 않는다. `retryPushRegistration`은 보존된 실패 mode를 재시도한다.

확인된 끄기 성공 문구는 ‘이 기기의 결재 알림을 껐습니다.’, 켜기 성공은 ‘이 기기에서 결재 알림을 받습니다.’다. 권한 오류는 ‘기기 설정에서 바자울 알림 권한을 허용한 뒤 다시 등록하세요.’, 기기 설정 열기 실패는 ‘기기 설정을 열지 못했습니다. 설정 앱에서 바자울 알림을 허용하세요.’다. 연결 실패는 재시도 안내를 제공한다.

현재 허브의 네이티브 행동:

- 최초 확인 중: 로딩 안내. confirmed OFF 이전에는 켜기 행동을 만들지 않는다.
- needsSettings: 기기 알림 설정 열기 + 알림 등록 다시 시도.
- confirmed OFF: 이 기기에서 알림 받기, 오류가 있으면 실패 작업 재시도.
- confirmed ON: 이 기기 알림 끄기.
- 오류 + ON 또는 미확인: 알림 설정 다시 시도.
- 등록값 ON + needsSettings이면 설정 열기/다시 시도와 끄기 모두 존재할 수 있다. OS 거부를 서버 OFF로 바꾸지 않는다.
- 설정 행동은 pending 동안 비활성화하고 현재 작업을 표시한다. 업무 메뉴 전체를 비활성화하지 않는다.
- 허브 focus와 앱 foreground에서 자동 재확인한다. 설정 앱에서 돌아왔다는 이유만으로 성공 처리하지 않는다.
- 웹은 ‘설치한 모바일 앱에서 설정할 수 있습니다.’ 안내만 표시한다. 웹에서 실제 권한 요청·등록 행동이 없다.

푸시 설정은 결재 알림 읽음/삭제/승인과 채팅 건수 변경을 수행하지 않는다.

## 로그아웃·세션

웹과 네이티브 허브 모두 ‘로그아웃 / 이 기기에서 로그아웃하시겠습니까? / 취소·로그아웃’ 확인을 제공한다. 확인 전 실행하지 않고 취소는 로그인 상태를 유지한다. 확인 시 동기 잠금으로 signOut을 한 번만 실행하며 처리 중 두 행동을 비활성화한다. 계정 이탈 후 늦은 완료/오류로 이전 계정의 피드백을 표시하지 않는다. 웹의 포커스 진입·내부 순환·Escape/취소·실행 행 복귀를 검수했다.

`signOut`은 auth generation을 변경하고 현재 세션의 로컬 정보·private provider 상태를 먼저 만료시킨 뒤 POST `/auth/logout`를 시도한다. 원격 통신 실패는 무시하며 로컬 로그아웃을 되돌리지 않는다. 토큰 저장 정리는 직렬 처리하여 이전 로그아웃이 새 로그인 토큰을 지우지 않게 한다. 저장 정리 오류의 일반 피드백은 있을 수 있지만 이전 계정의 private 화면을 복구하는 근거가 아니다.

로그아웃은 모든 기기 로그아웃·계정 삭제·서버 문서 삭제가 아니다. 서버 문서나 private 입력을 외부로 백업하는 디자인을 추가하지 않는다. 401/계정 변경에서 이전 계정 요약·채팅 수·설정 상태를 남기지 않는다.

## 적용된 HomeTheme 핵심 토큰

| 토큰 | 라이트 | 다크 |
| --- | --- | --- |
| background | #F7F8FA | #11151B |
| surface/tab | #FFFFFF | #1C222B |
| surfaceMuted | #F0F2F5 | #262E39 |
| text | #191F28 | #F4F6FA |
| secondary | #5C6675 | #AFB8C7 |
| muted | #647084 | #A4AEC0 |
| border | #E8ECF1 | #303947 |
| controlBorder | #86909E | #647084 |
| accent | #2563EB | #8DB7FF |
| accentSoft | #EDF4FF | #202F49 |
| actionFill | #2563EB | #2563EB |
| danger | #A52C39 | #FF98A4 |
| dangerFill | #A52C39 | #A52C39 |
| dangerSoft | #FBECEF | #492831 |
| success | #176345 | #8BE2B8 |

내 정보는 HomeTheme·Feather 선형 아이콘을 사용하고 기존 탭 선택 배경을 이어간다. 이 문서의 UI 상태 검수는 합성 자료 기준이며 실제 OS 권한·푸시 도착·실기기 검증 완료를 뜻하지 않는다. 상세 증거는 [구현 검수](design/mobile-profile-v1/design-qa.md)를 따른다.
