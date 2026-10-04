# 모바일 청소년 관리

프로필의 ‘청소년 관리’에서 현재 업무 대상 명단·검색, 기본정보 등록·수정, 상세·연락처의 명시 열람, 퇴소 예정일 연장, 개인·공통 일정, 수학 개념 체크·공용 개념, 6개 카테고리 규칙, 결정문 첨부·다운로드와 처리 이력을 제공한다. 보존·파기 검토는 기존 관리자 웹 `/youth/retention`에서 처리하며 모바일에 신규 파기 실행 화면을 추가하지 않는다.

## 권한과 정보 공개

모든 요청은 모바일 세션 이후 DB의 현재 `ACTIVE` 상태와 권한을 다시 확인한다. 실제 퇴소, 파기 시작·완료, 지난 예정퇴소일 때문에 제한된 청소년은 일반 목록·자식 조회에서 제외한다.

| 권한 | 제공 범위 |
| --- | --- |
| 현재 ACTIVE 사용자 | 이름·입소일·예정퇴소일의 기본 명단, 허용된 일정·학습·규칙과 안전한 이력 |
| `canViewYouthDetails` | 명시 열람 후 생년월일·나이·퇴소 연장 정보 |
| `canViewYouthContacts` | 명시 열람 후 본인·가족 연락처 |
| `canDownloadYouthDocuments` | 결정문 목록과 사유를 기록한 다운로드 |
| `canManageYouth` | 프로필·연장·활동 변경, 결정문 업로드·첨부·삭제; 생년·연락처 수정에는 각각의 추가 권한 필요 |

ACTIVE 관리자는 각 권한을 갖는다. 관리 권한만으로 기존 상세·연락처·결정문을 읽을 수는 없다. 아직 열지 않았거나 권한이 없는 필드는 응답에서 제외하며, 숨긴 필드를 빈값으로 덮어쓰지 않는다. 이력도 권한에 맞는 변경 항목만 반환하고 원본 metadata·IP·저장소 키를 전달하지 않는다.

상세·연락처와 다운로드는 actor/request ID/대상 스냅샷에 묶인 감사 기록을 먼저 확정한다. 명시 열람의 공개 시간은 5분이며 같은 요청 재확인으로 시간을 연장하지 않는다. 감사 저장 실패, 권한 회수, 대상 변경·제한, 공개 시간 만료 시 민감 내용을 반환하지 않는다. 앱은 계정 전환·화면 이탈·백그라운드에서 본문을 가리고 최신 권한 확인 후 다시 공개한다. 개인 데이터 캐시는 메모리에서 관리하며 로그아웃 때 관련 메모리와 소유 임시 파일을 정리한다.

## 저장과 파일 처리

변경 요청은 actor별 `requestId`, 부모 청소년 ID와 `updatedAt`, 해당 자식 ID·기준선을 고정한다. 같은 요청은 이미 확정된 결과만 재확인하며 중복 생성·삭제 후 재생성하지 않는다. 통신 결과가 불명확하면 입력과 원래 요청을 유지하고 mutation receipt를 먼저 읽는다. 409 충돌은 자동 덮어쓰기 없이 최신 기준을 확인해 명시적으로 선택한다. 처리 중 중복 제출을 차단하고 검증 실패 시 입력을 보존하며 삭제·입력 폐기는 확인한다.

개인 일정은 병원 동행 자격과 날짜를 검증하고, 공통 일정은 대상 요일·기존 슬롯 ID/token 전체를 확인한 뒤 batch를 원자적으로 처리한다. 수학 체크는 원하는 checked 값과 청소년·개념의 두 기준선을 사용한다. 공용 개념 삭제와 연결 체크 제거도 같은 트랜잭션에서 처리한다. 날짜는 0001~9999의 실제 Gregorian 날짜를 검증하며 반복·10분 간격·24:00 종료 등 기존 웹 정책을 공유한다.

결정문은 기존 고정 정책인 파일당 30MiB, 제출당 새 파일 최대 5개와 기본 허용 확장자를 사용한다. 관리자 전역 첨부 설정을 이식하지 않는다. 업로드는 원본 스냅샷·전체 SHA256·크기 확인, private staging, 검증된 immutable 저장, 부모 token에 연결된 첨부 순서로 처리한다. Supabase signed PUT의 2시간 capability와 업로드 receipt 만료는 별개다. 불명확한 전송은 같은 업로드 상태와 완료 결과를 확인하고 임의의 새 업로드로 바꾸지 않는다.

다운로드는 사례지원·외부제출·내부검토·기타 사유를 기록하고 검증된 파일 전체를 내려받은 뒤 저장·공유한다. 기타는 상세 사유가 필요하다. 다운로드가 서버 원본을 소비하거나 자동 삭제하지는 않는다. 취소·오류·권한 변경 시 소유 임시 파일을 정리하고 외부 앱 공유 후 보존은 제한한다. 물리 파일 정리·승인 파기와 pending 증거는 [청소년 보존·파기](youth-retention.md)를 따른다.

## API 경로

아래 경로의 공통 prefix는 `/api/mobile`이다. JSON과 다운로드의 성공·실패 응답은 private/no-store이며 query·body의 모호한 입력은 거부한다.

| 기능 | 경로·메서드 |
| --- | --- |
| 명단·프로필 | `GET/POST /youth`, `GET/PATCH /youth/{id}`, `POST /youth/{id}/extensions` |
| 명시 열람·기본 이력 | `POST /youth/{id}/details`, `POST /youth/{id}/contacts`, `GET /youth/{id}/history` |
| 결과 재확인 | `GET /youth/mutations/{requestId}`, `GET /youth/view-requests/{requestId}` |
| 개인 일정 | `GET/POST /youth/{id}/personal-schedules`, `GET/PUT/DELETE /youth/personal-schedules/{scheduleId}` |
| 공통 시간표 | `GET /youth/common-schedules`, `POST /youth/common-schedules/batch`, `GET /youth/common-schedules/history` |
| 수학·공용 개념 | `GET /youth/{id}/learning`, `PUT /youth/{id}/learning/checks/{conceptId}`, `GET /youth/{id}/learning/history`, `GET/POST /youth/study-concepts`, `DELETE /youth/study-concepts/{id}` |
| 규칙 | `GET/POST /youth/rules`, `DELETE /youth/rules/{id}`, `GET /youth/rules/history` |
| 결정문 연결·다운로드 | `GET /youth/{id}/documents`, `POST /youth/{id}/decision-documents`, `DELETE /youth/decision-documents/{id}`, `POST /youth/decision-documents/{id}/download` |
| 파일 전송·재확인 | `GET /youth/document-upload-policy`, `POST /youth/document-uploads`, `GET/DELETE /youth/document-uploads/{id}`, `POST .../{id}/grant`, `POST .../{id}/complete`, `GET /youth/document-uploads/requests/{requestId}` |

## 배포와 검증 범위

서버는 `20261004090000_mobile_youth_ledgers`의 4개 ledger와 파기 진행 컬럼을 먼저 요구한다. 앱 표시 버전은 1.0.5이며 `runtimeVersion`은 fingerprint 정책이다. 버전 문자열만으로 OTA 호환성을 판단하지 않는다. Android/iOS 각각 설치된 runtime·채널과 일치하는 update만 적용하고, 정확한 update ID·runtime·운영 API origin·전체 asset SHA 검증 후 배포한다. native 의존성이나 fingerprint가 바뀌면 호환되는 새 설치본이 필요하다.

실제 소스의 합성 DB/storage·React 경계 검사, CI PostgreSQL, RN Web 및 웹 합성 화면 검수는 서로 다른 증거다. 이번 기능으로 특정 운영 청소년 파기를 실행하지 않았다. 실제 휴대폰의 OS 파일 선택기·SAF 저장·외부 공유·네이티브 PDF 화면은 아직 실기기 검증하지 않았다. 전체 검사·운영·OTA 완료 여부와 숫자는 별도 확정 릴리스 기록을 따른다.

다음 #12는 기존 웹 급식 메뉴·카페와 모바일 차이를 읽기 전용으로 확인한 뒤 순서대로 구현한다.
