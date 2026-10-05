# 앱 업데이트 v1 현재 기능 계약

기준 **2026-10-06 / main 67804ba00877af9da0f6fca65e62dbd28182ae12 / PR #30 반영 이후**. 현재 소스를 읽어 작성한 디자인 입력 계약이며 새 화면 구현·실기기 검증을 뜻하지 않는다. 실제 자격 증명·기기 기록·직원 정보·전체 배포 ID를 포함하지 않는다.

## 구현 반영

2026-10-06 Claude Version20의 앱 업데이트 v1을 실제 화면에 반영했다. 자체52px 헤더와 상태·현재 실행 코드·기록 세 그룹, 오류 및 완료 포커스와 진행률 접근 값을 검수했다. 기능 계약은 유지한다. 원본과 실제 화면·검수 한계는 [구현 검수](design/mobile-app-updates-v1/design-qa.md)에 기록했다.

## 근거

- `mobile/src/app/app-updates.tsx`: 상태/주 행동, 실행 코드 정보, 확인·다운로드 기록.
- `mobile/src/providers/AppUpdatesProvider.tsx`: Expo 상태, 중복 잠금, 저장 시각·실행 관찰, 안전한 오류.
- `mobile/src/components/app-update-status.tsx`: 상태 제목, 진행률 의미, 한국시간 표시, 전역 안내.
- `mobile/src/app/_layout.tsx`: 로그인 전후 공통 경로, 한 번만 유지되는 provider.
- `mobile/src/app/(tabs)/profile.tsx`, `mobile/src/components/profile-screen.tsx`: 내 정보 진입.
- `mobile/src/lib/home-theme.ts`: 적용할 기존 HomeTheme.
- `tests/mobile-app-updates-client.test.mts`: 실제 provider·페이지·진행률·공통 경로 계약.

## 경로·수명

`/app-updates`는 로그인한 직원의 내 정보 및 전역 업데이트 안내에서 열 수 있다. 루트 Stack의 인증 보호 그룹 **밖**에 있으므로 로그인 화면에서도 열 수 있다. 하단 업무 탭바를 새로 붙이지 않는다. 현재 앱은 공통 Stack 헤더를 쓰고 있다. 새 디자인에서는 기존 자식 화면과 같은 간결한 자체 헤더로 바꿀 수 있다. 뒤로는 이전 화면, 이력이 없으면 로그인 후 내 정보 또는 로그인 화면이다.

AppUpdatesProvider는 루트에 있으며 화면 전환·로그아웃 때문에 재생성하지 않는다. 데이터는 기기 실행/업데이트 관찰이며 직원 계정 데이터가 아니다. 이 화면에서 네이티브 시작 절차와 별개의 자동 확인을 추가하지 않는다. 전역 AppUpdateStatus는 `/app-updates`에서 숨겨 상태를 중복하지 않는다.

## 공개 값

```ts
type AppUpdatePhase = "disabled" | "idle" | "checking" | "downloading" | "available" | "ready" | "error";
type AppUpdateInfo = { updateId: string | null; publishedAt: string | null; rollback: boolean };
type AppUpdateCurrent = {
  updateId: string | null; runtimeVersion: string | null; publishedAt: string | null;
  embedded: boolean; emergency: boolean;
};
type AppUpdatesValue = {
  enabled: boolean; phase: AppUpdatePhase; busy: boolean; progress: number | null;
  current: AppUpdateCurrent; available: AppUpdateInfo | null; downloaded: AppUpdateInfo | null;
  observedAt: string | null; lastCheckAt: string | null; lastDownloadedAt: string | null;
  error: string | null; storageError: string | null;
  appliedNotice: boolean; dismissAppliedNotice: () => void;
  check: () => Promise<void>; download: () => Promise<void>;
};
```

enabled는 **웹이 아님 + 개발 실행이 아님 + Expo Updates 활성화**일 때만 true다. 웹·개발·업데이트 비활성 설치본은 disabled이며 실제 확인/다운로드를 호출하지 않는다. QA 프로토타입의 네이티브 모의 상태는 실제 web 상태와 구분한다.

phase 우선순위는 disabled → ready → downloading → busy/checking → error → available → idle다. ready와 busy가 함께 관찰돼도 준비된 다운로드 안내를 숨기지 않는다. native 시작·재시작 중도 busy에 포함된다. 이미 준비된 다운로드에는 추가 확인/다운로드가 없다.

## 상태 제목·행동

| phase | 기존 제목 | 행동 조건 |
| --- | --- | --- |
| idle | 현재 버전 사용 중 | 업데이트 확인 |
| checking | 업데이트 확인 중 | 확인 중…; 잠금 |
| downloading | 업데이트 다운로드 n% / 업데이트 다운로드 중 | 다운로드 중…; 잠금 |
| downloading 100% | 다운로드 100% · 마무리 중 | 완료로 단정하지 않음 |
| available | 새 업데이트 다운로드 가능 | 업데이트 다운로드; busy가 아니면 새 업데이트 다시 확인 |
| error | 업데이트 확인 필요 | available이 있으면 다운로드 다시 시도, 없으면 업데이트 다시 확인 |
| ready | 다운로드 완료 · 적용 대기 | 확인·다운로드·재시작 행동 없음 |
| disabled | 설치한 앱에서 확인할 수 있습니다 | 네이티브 행동 없음 |

기존 제목을 유지하거나 의미가 동일한 짧은 문구로 표현할 수 있다. 현재 계약은 idle을 ‘최신’으로 확정하지 않는다. lastCheckAt도 성공 기록이 아니라 **확인 시도**다.

check는 `checkForUpdateAsync()`에서 새 업데이트나 rollback이 확인되면 이어서 `fetchUpdateAsync()`를 호출한다. 새 대상이 없으면 idle로 돌아온다. download는 기존 available 대상에 대한 다운로드 재시도다. 네이티브/수동 확인과 다운로드를 하나의 동기 잠금으로 합친다. 준비 완료 latch는 React ready 반영 전 오래된 callback도 막는다. 실패 후 available은 보존하며 재시도가 확인인지 다운로드인지 구분한다.

네이티브 API의 raw 오류는 표시하지 않는다. 안전한 오류:

- 업데이트를 확인하지 못했습니다. 네트워크를 확인한 뒤 다시 시도하세요.
- 업데이트 확인 또는 다운로드를 완료하지 못했습니다. 네트워크를 확인한 뒤 다시 시도하세요.
- 업데이트 다운로드를 완료하지 못했습니다. 네트워크를 확인한 뒤 다시 시도하세요.

화면 이탈은 업데이트 취소나 기존 업무의 삭제가 아니다. provider가 해제되거나 generation이 바뀐 늦은 결과는 후속 fetch·상태·기록 쓰기로 이어지지 않는다.

## 진행률·적용

progress는 다운로드 중 관찰된 유한한 0~1만 사용한다. 그 밖은 null이다. 0은 0%, null은 미확인이다. 표시 백분율은 `Math.floor(progress * 100)`이고 progressbar에는 0~100 접근 값을 준다. 100%에서 ready를 추정하지 않는다.

ready는 native `isUpdatePending` 또는 확인된 fetched 결과다. downloaded는 준비된 코드이며 current는 **현재 실행 중인 코드**다. 다운로드가 성공해도 current ID·게시 시각·observedAt를 새 코드로 바꾸지 않는다. 화면에 `reloadAsync`, 강제 종료, 즉시 재시작 기능이 없다.

ready 안내: **작성 중인 내용을 저장한 뒤 앱을 완전히 종료하고 다시 실행하세요. 새 업데이트는 다음 실행에서 적용됩니다.**

disabled 안내: **웹·개발 화면에서는 앱 업데이트를 확인하거나 다운로드하지 않습니다.**

rollback 준비도 다음 실행을 기다리는 다운로드 상태이며 지금 실행 중인 코드가 즉시 기본 버전이 되었다고 표시하지 않는다. current.emergency=true는 실제 기본 버전 비상 실행 안내다: **업데이트를 실행하지 못해 기본 버전으로 복구해 실행했습니다. 네트워크를 확인하고 업데이트를 다시 확인하세요.**

## 표시·시각·기기 보관

앱 표시 버전은 `Constants.expoConfig?.version ?? "확인 불가"`다. 소스 `1.0.5`를 유지한다. 코드 버전은 current.updateId 앞 8자이고, ID가 없고 embedded면 **설치 파일에 포함된 기본 버전**, 둘 다 없으면 **확인 불가**다. runtimeVersion은 현재 화면에 표시하지 않는다.

`formatAppUpdateTime()`은 유효한 값만 Asia/Seoul·ko-KR·연/월/일/시/분/초로 표현한다. null·잘못된 날짜는 **확인 기록 없음**이다.

| 행 | 값/의미 |
| --- | --- |
| 게시 시각 | current.publishedAt, 현재 실행 코드의 게시 시각 |
| 이 기기에서 적용 확인 | current 키를 처음 관찰한 observedAt. 실제 설치 시각 아님 |
| 최근 확인 시도 | lastCheckAt, 실패한 시도도 포함 |
| 최근 다운로드 확인 | lastDownloadedAt, 다운로드 준비를 관찰한 시각 |
| 새 업데이트 게시 시각 | available/downloading은 available.publishedAt, ready는 downloaded.publishedAt; 그 외 숨김 |

현재 실행 ID가 같으면 최초 관찰을 재실행 후에도 유지한다. 다른 ID면 새 관찰 시각을 부여하며 게시 시각을 복사하지 않는다. 기본 설치본에서 가짜 OTA 적용 완료 안내를 만들지 않는다. 저장된 기록이 없거나 잘못됐어도 fabricated 시각을 만들지 않는다.

SecureStore 저장 키와 옵션을 바꾸지 않는다. 기록 보관 실패는 **업데이트 시각을 기기에 보관하지 못했습니다. 이번 실행의 상태는 확인할 수 있습니다.**로 알리고 업데이트 행동은 계속 쓸 수 있다. 기기 기록 지우기·초기화·계정별 기록·스토어 이동·새 API를 추가하지 않는다.

## 변경 범위·검수

이번 구현은 상태를 표현하는 화면과 접근성·밀도 개선이다. provider·업데이트 정책·자동 시작·SecureStore·공통 root 수명·전역 다른 화면·네이티브 구성·의존성·앱 버전·runtime을 바꾸지 않는다. 합성 상태는 앱 밖 프로토타입에서 다룬다.

확인 대상은 idle/기록 없음/현재 기본 버전, checking, 다운로드 0/37/100%/null, available, 두 종류 실패/재시도/중복 잠금, ready와 current 분리, disabled의 네이티브 행동 없음, emergency·rollback, 보관 실패, 한국시간·잘못된 날짜·긴 값, 로그인 전/후 경로, 작은 화면·다크·200%·키보드 포커스다. 기존 provider 및 실제 화면 계약 테스트를 유지하고 변경된 화면의 브라우저 검증을 별도로 기록한다.
