# 바자울 모바일 계정·도장 설정 기능 계약

**2026-10-06**, 운영 main **15c38b1030c51be76fc5377b23971891c65811a7**의 실제 소스를 확인했다. 요청 당시 구현과 새 시안의 검수 요구는 구분한다. 이 문서는 Claude 프로토타입 기능 근거이며 실제 인증·API 호출 허가가 아니다.

## 경로와 조회

`/profile`의 ‘계정·도장 설정’ → `/account`. 로그인한 사용자만 접근하는 루트 Stack 자식 화면. 제목 ‘계정·도장 설정’, 뒤로 이동, 하단 탭바 없음. 현재 화면은 내부 ‘계정 정보’와 새로고침, 조회 정보, 도장, 프로필, 비밀번호 순서다. 기존 `useTheme`와 공용 UI를 쓰며 새 시안은 적용된 `useHomeTheme`에 맞춘다.

모바일 API 접두사는 `/api/mobile`. 아래 경로는 접두사를 뺀 값이다. 모든 요청은 현재 사용자 세션으로 처리되며 다른 사용자 ID를 지정하는 기능이 없다.

| 요청 | 실제 응답/의미 |
| --- | --- |
| GET `/account` | `{account:{id,name,email,departmentName,positionName,canChangePassword,profileImage,signatureImage}}` |
| GET `/account/signature-image`, `/account/profile-image` | 본인 이미지 바이트. 필요하면 `?v=updatedAt`. 등록이 없으면404. private/no-store. |
| POST 같은 이미지 경로 | multipart 파일 하나: `signatureImage` 또는 `profileImage`. 성공 `{ok:true,message,image}` |
| DELETE 같은 이미지 경로 | 본인 현재 이미지 제거. 성공 `{ok:true,message,image:{exists:false,mimeType:null,size:null,updatedAt:null}}` |
| POST `/account/password` | `{currentPassword,newPassword,confirmPassword}`. 성공 `{ok:true,message,reauthenticate:true}` |

`AccountImageInfo={exists:boolean,mimeType:string|null,size:number|null,updatedAt:string|null}`. 저장 키·공개 이미지 URL·passwordHash는 계정 응답에 없다. 이메일은 null이면 ‘미등록’. 이름·부서·직급·이메일은 수정 입력이 아니다. 이미지 메타/내부 API 경로를 사용자의 설정 정보로 과도하게 노출하지 않는다.

최초 로딩/오류와 재시도, 마지막 조회 정보 유지가 구현돼 있다. 조회 실패 상태에서 이미지/비밀번호 변경은 비활성. 작업 시작 시 진행 중 조회 응답의 적용을 무효화하며 새로고침은 작업 중 금지. 토큰으로 AccountScreen을 다시 마운트하고 화면 생존·조회 순서 확인으로 늦은 갱신을 막는다.

## 이미지 동작

현재 각 `AccountImageEditor`는 등록 미리보기 또는 미등록 안내, 선택 미리보기/파일명/크기/‘저장 전’, 선택 취소, 다른 이미지 선택, 이미지 저장, 등록 이미지 삭제 확인을 제공한다. 선택 파일이 없고 등록 이미지가 있을 때 삭제 행동이 보인다. 선택 창 취소는 기존 선택을 지우지 않는다. 저장 오류 시 등록과 선택을 유지하고 저장 재시도, 성공 후 등록 메타 갱신 및 선택 해제. 삭제 취소/실패는 등록 이미지 유지, 성공 후 미등록. 저장/삭제 메시지는 서버 응답을 따른다.

원본≤4×1024×1024바이트, JPG/PNG/WEBP 하나. 클라이언트는 파일 크기·매직 바이트·확장자 일치 검사. 서버는 실제 디코딩·4천만 화소 제한·단일 이미지·회전·크기 축소·WebP 압축 후≤2MB 정책을 검사한다. 프로필 최대 변768, 도장1024. 모바일 서버 구현은 프로필quality82/도장90을 사용한다. 품질 단계 배열이 정책 파일에 있다고 모바일이 단계별 반복 압축한다고 설명하지 않는다. 투명 배경을 지원하며 도장에는 PNG를 권장한다. 압축 결과가 정책을 만족하지 못하면 성공으로 처리하지 않는다.

Native는 **Expo DocumentPicker**로 파일 하나를 선택한다. 카메라/사진 촬영/서명 편집/자르기 API가 없다. 캐시 복사본만 정리하고 사용자의 원본은 삭제하지 않는다. 웹은 단일 파일 선택과 private blob 미리보기다. 등록 미리보기는 토큰을 사용한 전용 조회이며 정상 이미지 형식·응답 타입·저장 크기를 확인한다. 미리보기 오류는 별도 재시도, 미등록으로 대체하지 않는다. 도장 잉크는 다크에서도 흰 문서 표면으로 보여준다.

계정 전환/로그아웃 시 이미지 작업·임시 캐시·blob 리소스를 정리하고 이전 세대 응답을 무시한다. 등록 미리보기 unmount에서 조회 취소·리소스 정리, 선택 unmount에서 선택 리소스 정리. 현재 업로드 화면 생존 guard와 계정 전환의 전역 취소를 ‘뒤로 가면 서버 저장이 반드시 취소됨’으로 과장하지 않는다.

현재 삭제 확인은 인라인이며 다음 문구와 취소/삭제 확인이다. 도장 ‘등록된 결재 도장/서명 이미지를 삭제하시겠습니까? 다음 결재에는 기본 도장이 사용됩니다.’ 프로필 ‘등록된 프로필 이미지를 삭제하시겠습니까? 이름 첫 글자가 기본 이미지로 표시됩니다.’ 새 시안에서 모달을 선택하면 완전한 포커스 동작은 구현/검수 대상이다.

화면 전체의 변경 작업 lock이 파일 선택·업로드·삭제·비밀번호 요청을 직렬화한다. busy 상태에서 관련 버튼/입력/새로고침을 비활성화한다. 확인 중 해당 이미지 선택/저장은 비활성. 종료/계정 변경 뒤 피드백을 새 계정에 전달하지 않는다.

## 비밀번호 정책

`canChangePassword=Boolean(passwordHash)`이며 false일 때 세 입력과 행동 대신 ‘비밀번호 로그인 계정이 아닙니다. 관리자에게 문의하세요.’. true일 때 보안 입력 세 개와 변경 행동이다.

| 서버 검증 | 실제 필드 오류 |
| --- | --- |
| 현재 비밀번호 미입력 | 현재 비밀번호를 입력하세요. |
| 새 비밀번호4자 미만 | 새 비밀번호는 4자 이상 입력하세요. |
| 새 비밀번호128자 초과 | 새 비밀번호는 128자 이내로 입력하세요. |
| 현재와 동일 | 현재 비밀번호와 다른 비밀번호를 사용하세요. |
| 확인 미입력 | 새 비밀번호 확인을 입력하세요. |
| 확인 불일치 | 새 비밀번호가 서로 일치하지 않습니다. |
| 현재 비밀번호 검증 실패 | 현재 비밀번호가 올바르지 않습니다. |

현재와 확인은 trim하지 않는다. 새 입력/확인은 maxLength128. 반환 필드 오류의 우선순위는 현재→새→확인, 첫 해당 입력으로 포커스한다. 변경 실패 시 입력을 지우지 않는다. 편집은 해당 필드 오류와 일반 오류를 해제하고 다른 필드 오류를 유지한다. Next는 다음 입력, Done/버튼은 같은 제출 경로와 동기 lock을 따른다. `KeyboardScreen`·`KeyboardScrollView`를 사용한다.

서버는 트랜잭션에서 현재 본인 계정/세션·현재 비밀번호를 검증하고 해시를 갱신하며 **본인의 모든 mobileSession을 삭제**한다. 현재 요청 세션도 포함한다. 응답 ‘비밀번호가 변경되었습니다. 새 비밀번호로 다시 로그인하세요.’ 뒤 클라이언트는 세 입력 초기화, `signOut({message})`, 모의 검토에서는 로그인으로 이동. 다른 기기는 다음 인증 요청 시 만료될 수 있으므로 즉시 모든 화면 전환이라고 표현하지 않는다. 감사 기록은 비밀번호 원문을 포함하지 않는다. 새 정책·계정 삭제·웹 세션 전체 강제 로그아웃은 이 화면 계약으로 추가하지 않는다.

401은 기존 SessionProvider의 세션 만료 처리와 이미지 요청의 expireSession을 따른다. 기존 계정이나 private 입력을 복구하거나 다른 계정에서 완료 피드백을 보여주지 않는다. 운영에서 실제 비밀번호 변경은 디자인/검수 대상이 아니다.

## 적용할 시각 토큰

| 토큰 | 라이트 | 다크 |
| --- | --- | --- |
| background | #F7F8FA | #11151B |
| surface | #FFFFFF | #1C222B |
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
| dangerFill | #A52C39 | #A52C39 |
| dangerSoft | #FBECEF | #492831 |
| success | #176345 | #8BE2B8 |

HomeTheme·Feather·44px 행동·줄바꿈·포커스·4.5:1 대비를 적용한다. 소스 근거: `mobile/src/app/account.tsx`, `mobile/src/app/_layout.tsx`, `mobile/src/components/account-image-editor.tsx`, `account-password-form.tsx`, `account-feedback.tsx`, `mobile/src/lib/account-image-core.ts`, `.native.ts`, `.web.ts`, `types.ts`, `session.tsx`, `src/lib/mobile-account.ts`, `password-change-policy.ts`, `profile-image-policy.ts`, `signature-image-policy.ts`.

원본 기능 캡처는390×844 Expo 웹·이예시/예시 부서/시설장·이메일null·이미지 미등록·변경 가능 합성 계정이다. API 주소를127.0.0.1:8908로 강제하며 모의 GET 조회 외 모든 `/account/` 변경은405로 차단했다. 실제 OS 파일 선택/키보드·native fontScale/스크린리더·운영 계정 검증은 하지 않았다.
