# 알림 v1 — 현재 기능 계약

기준 **2026-10-05 / 운영 main c891eee / PR #27**. `mobile/src/components/notifications-screen.tsx`, `mobile/src/lib/notifications.tsx`, `mobile/src/lib/types.ts`, 탭 레이아웃, `src/lib/mobile-notifications.ts`와 관련 API·테스트를 대조했다. 디자인의 모의 데이터 계약이며 운영 주소·계정·토큰을 포함하지 않는다.

## 조회

`GET /api/mobile/notifications?filter=all&page=1`

| 항목 | 현재 계약 |
| --- | --- |
| 접근 | 로그인한 직원의 본인 알림. 관리자도 본인 범위와 문서 USER 열람 권한을 적용 |
| filter | `all` 또는 `unread`, 기본 all |
| page | 양의 안전한 정수, 기본 1. 서버가 마지막 유효 페이지로 보정 |
| pageSize | 고정 20 |
| 순서 | `createdAt desc`, 같은 시각이면 `id desc` |
| total | 선택한 필터에 맞는 전체 결과 수 |
| unreadCount | 페이지와 무관한 본인의 열람 가능 미읽음 알림 수 |
| totalPages | 최소 1, `ceil(total/20)` |
| 목록 제한 | 본인 소유 + 현재 열람 가능 문서의 알림만. 무관한 문서/타인 알림 제외 |
| 미지원 | 검색, 기간, 유형/부서/기안자 필터, 정렬 선택, 무한 스크롤 |

응답 예시의 앞 3개만 발췌했다. 메인 1페이지에는 이 3개와 읽음 17개가 있어 **20행**, 2페이지에는 읽음 3개가 있다. 발췌 3개를 23건 전체 응답으로 오해하지 않는다.

```json
{
  "filter": "all", "total": 23, "page": 1, "pageSize": 20, "totalPages": 2, "unreadCount": 3,
  "notifications": [
    {
      "id": "qa-alert-001", "title": "최종 승인 완료",
      "message": "\"예시 업무 보고\" 문서가 최종 승인되었습니다.",
      "documentId": "qa-alert-doc-1", "readAt": null, "createdAt": "2026-10-05T00:30:00.000Z"
    },
    {
      "id": "qa-alert-002", "title": "결재 진행 알림",
      "message": "\"예시 업무 보고\" 1차 결재가 승인되었습니다.",
      "documentId": "qa-alert-doc-1", "readAt": null, "createdAt": "2026-10-05T00:15:00.000Z"
    },
    {
      "id": "qa-alert-003", "title": "결재 요청 도착",
      "message": "박예시님이 \"예시 자료 확인\" 결재를 요청했습니다.",
      "documentId": "qa-alert-doc-2", "readAt": null, "createdAt": "2026-10-04T23:50:00.000Z"
    }
  ]
}
```

행 응답 필드는 **`id, title, message, documentId, readAt, createdAt` 6개뿐**이다. `filter`는 서버 응답에 있으며 현재 모바일 `NotificationsResponse` 타입은 이를 선언하지 않고 화면 URL 조건을 사용한다. `readAt=null`이면 미읽음이다. `createdAt`은 생성 시각으로 읽음 시각과 다르다. 첫 세 시각은 한국시간 2026-10-05 09:30, 09:15, 08:50이다.

유형 enum·문서 상태·기안자 ID/아바타·문서번호·첨부·긴급도·금액·현재 결재 가능 여부는 전달되지 않는다. 제목/메시지는 서버 텍스트이며 별도 구조 필드로 추론하지 않는다. 과거 ‘내 결재 차례’라는 제목도 최신 결재 가능 여부를 보장하지 않는다.

## 읽음과 문서 열기

| 행동 | 요청 | 정확한 범위와 결과 |
| --- | --- | --- |
| 개별 읽음 | `POST /api/mobile/notifications/:id/read` | 본인 소유·열람 가능한 알림 하나. 이미 읽었다면 updatedCount 0 |
| 전체 읽음 | `POST /api/mobile/notifications/read-all` | 모든 페이지의 본인 열람 가능 미읽음 알림. 문서/알림 삭제 아님 |
| 문서 열기 사전 확인 | `POST /api/mobile/notifications/read-document` + `{documentId}` | 서버에서 문서 USER 열람 확인 후, 같은 문서의 본인 미읽음 알림 모두 처리 |

성공 응답은 `{ok:true, updatedCount:number, unreadCount:number}`다. 모든 읽음 요청은 반복해도 읽음 시각을 다시 덮지 않는 멱등 처리다. 알림 ID와 문서 ID는 1~100자의 영문/숫자/밑줄/하이픈이어야 한다.

문서 열기는 반환 `ok===true`와 유효한 미읽음 수를 확인하고 배지를 갱신한 뒤 기존 `/documents/:documentId` 상세로 이동한다. 같은 문서 열기는 진행 중 중복 요청을 공유한다. 문서 내용 조회와 최신 결재 권한·상태는 기존 상세 화면에서 다시 검사한다.

초기 합성 데이터의 개별 `qa-alert-001/read`는 1건 처리 후 미읽음 **2건**이다. 초기 상태의 `read-document`에 `qa-alert-doc-1`을 보내면 1·2행 **2건**을 처리한 뒤 미읽음 **1건**이다. 전체 읽음은 모든 페이지를 대상으로 하지만 요청 이후 새 알림이 오면 반환 미읽음 수가 1 이상일 수 있다. 항상 서버 반환값을 쓰고 임의로 0을 확정하지 않는다.

전체 필터에서는 읽은 행을 유지하며 개별 읽음 행동을 제거한다. 안 읽음 필터에서는 읽은 행을 제거한다. 처리 후 원래 필터·페이지를 다시 조회하고 서버 보정 페이지를 반영한다. ‘읽지 않음으로 되돌리기’, 삭제, 보관, 스와이프 읽음, 다중 선택 기능은 현재 없다. 전체 읽음은 현재 별도 확인창 없이 실행한다.

## 오류·상태·안전

- 비로그인 401은 세션 종료와 로그인 안내로 이어진다. ID/필터/페이지 입력 오류는 400이다.
- 타인·열람 불가·없는 알림의 개별 읽음은 같은 **404 알림을 찾을 수 없습니다**. 문서 열람 불가·없음은 같은 **404 문서를 찾을 수 없습니다**. 존재 여부나 내용 차이를 공개하지 않는다.
- 저장소 실패는 일반적인 500 오류와 재시도를 제공하며 내부 키·예외를 노출하지 않는다. 권한 실패와 단순 연결 실패를 구분한다.
- 현재 화면에는 최초 로딩, 전체/미읽음 빈 상태, 갱신, 조회/변경 오류와 재시도, 개별·전체 읽음 진행, 문서 열기 진행, 성공 안내, 20건 페이지 도구가 있다.
- 같은 조건 재조회는 기존 결과를 유지한다. 새 시안에서는 오래된 결과임을 명시하고, 다른 조건의 결과를 재활용하지 않으며, 권한·계정 실패에서는 이전 데이터를 제거한다. 화면의 모든 안전 기준이 이미 구현되었다고 주장하지 않는다.
- 계정별 Provider 재생성 및 세대/토큰 검사로 이전 계정의 늦은 응답·문서 이동을 막는다. 미읽음 갱신 요청을 모으며 읽음 변경 후 더 오래된 건수가 덮어쓰지 않도록 한다.
- 전역 Provider는 알림 수신·앱 foreground 복귀 때 건수와 조회 revision을 갱신한다. 현재 탭에 포커스가 있을 때 목록도 갱신한다. 알림 수신과 OS 권한은 모의 UI 검수로 실기기 검증을 대체할 수 없다.

## 탭과 기존 화면 연결

`canApproveDocuments=true`이면 홈/받은결재/문서함/알림/내 정보 5탭이다. false이면 받은결재를 제외한 4탭이다. 알림 탭 자체는 시설장 권한과 무관하다.

`notificationBadge`: 미확인 null·0은 숨김, 1~99는 실제 숫자, 100 이상은 **99+**. 접근 이름은 ‘알림, 읽지 않은 알림 n건’이다. 미확인을 0건으로 확정하지 않는다. 푸시 등록·해제·OS 설정 연결은 **내 정보**에 이미 있으므로 새 알림 목록에 옮기지 않는다.

## HomeTheme와 시각 기준

| 토큰 | 라이트 | 다크 |
| --- | --- | --- |
| background | #F7F8FA | #11151B |
| surface / tab | #FFFFFF | #1C222B |
| surfaceMuted | #F0F2F5 | #262E39 |
| text | #191F28 | #F4F6FA |
| secondary | #5C6675 | #AFB8C7 |
| muted | #647084 | #A4AEC0 |
| border | #E8ECF1 | #303947 |
| controlBorder | #86909E | #647084 |
| accent | #2563EB | #8DB7FF |
| actionFill | #2563EB | #2563EB |
| accentSoft | #EDF4FF | #202F49 |
| danger | #A52C39 | #FF98A4 |
| success | #176345 | #8BE2B8 |

Feather 선형 아이콘과 현재 탭 선택 배경을 쓴다. 현재 알림 화면은 이전 `useTheme`/공유 TextAction을 사용하므로 그 남색을 새 스타일로 복제하지 않는다. 현재 `formatDate`는 KST 월/일/시각이며 새 시안에서는 연도 포함을 요청한다. API나 날짜의 의미는 그대로 유지한다.

## 참고 캡처의 의미

참고용 현재 화면은 최신 main과 같은 소스를 실제 Expo 웹 렌더로 띄우고, 전부 합성인 로컬 API에서 얻는다. 운영 주소·직원·문서·토큰은 사용하지 않는다. 현재 기능 참고 캡처와 새 디자인의 개선 기준을 구분한다. 웹 캡처는 실제 iOS/Android 기기·OS 상태바·스크린리더·푸시 수신 검증이 아니다.

참고 파일: `05-current-all-function.png`은 전체 23건·미읽음 3건의 첫 페이지다. `06-current-read-function.png`은 안 읽음 필터에서 첫 알림 한 건만 읽은 직후로 미읽음 2건·2행과 성공 안내·배지 2를 보여준다. `04-applied-home-style.png`과 `07-applied-inbox-style.png`은 적용된 새 시각 체계의 기준이다.
