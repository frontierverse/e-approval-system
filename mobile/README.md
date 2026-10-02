# 바자울 모바일 앱

직원 전용 Expo 앱이다. 공개 App Store·Play Store로 출시하지 않는다. 웹 프로젝트와 같은 데이터베이스와 결재 규칙을 쓰며, iOS와 Android에 동일한 코드로 배포한다. 일반 직원에게는 홈의 내 상신 진행 상황, 알림, 내 정보와 문서·첨부파일 열람을 제공한다. 직급이 시설장인 직원만 받은결재 탭과 본인 결재 순서의 승인·반려를 사용한다. 관리자 역할만으로 결재 권한이 부여되지는 않는다. 문서 작성과 관리자 기능은 웹에서 사용한다. 서버는 유효한 bearer 세션, 활성 직원 상태, 현재 직급, 문서별 열람·결재 권한을 확인한다.

## 2026-10-02 작업 인계

앱 표시 이름은 `바자울`이다. 휴대폰 홈 화면 이름, 로그인 화면과 기기 알림 권한 안내에 적용하며, 서버 푸시 알림 제목도 `바자울`을 사용한다. 기존 설치본의 홈 화면 이름을 바꾸려면 새 APK/IPA가 필요하다. 기존 앱 위에 업데이트할 수 있도록 Expo slug·project ID, URL scheme, Android package, iOS bundle identifier, 서명 키와 세션 저장 키는 유지한다. 이전 APK·AAB에는 당시 이름이 남아 있다.

모바일 앱 초기 코드와 검증 수정은 GitHub `main`, `codex/staff-mobile-api`에 반영되어 있다. 초기 코드 기준 커밋은 `db584765c5e148ce06a929eed19d7bff3116ea23`이며 [해당 CI](https://github.com/frontierverse/e-approval-system/actions/runs/36937827929)는 성공했다. 이후 바자울 이름 변경과 `1.0.2`의 EAS Update 설정·배포 워크플로는 `main`에 추가 반영했다. 이 인계 문서는 배포 진행 상태를 기록하며 앱 런타임을 바꾸지 않는다.

- Android 실제 기기에서 설치, 로그인, 문서와 첨부파일 열기, 대상 기기 테스트 푸시 수신을 확인했다. 실제 기기에서 승인·반려 및 업무 문서 생성에 따른 자동 푸시 전체 흐름은 아직 검증하지 않았다. 추가 실제 결재나 테스트 알림은 별도 요청 없이 실행하지 않는다.
- 시험용 APK `1.0.0 / versionCode 1`은 [EAS 빌드](https://expo.dev/accounts/artemismars2/projects/gyeoljaeon/builds/45d8786c-f901-40ac-bddc-ef2481a8fd41)에 있다. Google Play 업로드용 AAB `1.0.0 / versionCode 2`도 [EAS 빌드](https://expo.dev/accounts/artemismars2/projects/gyeoljaeon/builds/57ac37c6-6bba-488c-9034-333c72cc369f)에서 Finished 상태이며 서명과 파일 무결성을 검증했다. 파일 다운로드에는 프로젝트 접근 권한이 있는 Expo 로그인이 필요하다.
- Google Play 신규 조직 계정은 비영리단체, 기관명은 `사회적협동조합 청소년자립학교`, 개발자 표시 이름은 `결재온`으로 준비했다. 조직 결제 프로필 생성·계정 인증·가입비 결제·AAB 업로드·테스터 등록·내부 테스트 게시가 남아 있으며, 아직 Play 배포는 하지 않았다. 직원 100명 이하를 대상으로 내부 테스트를 준비한다.
- 2026-10-02(한국시간), Apple의 [D-U-N-S 조회·신청](https://developer.apple.com/enroll/duns-lookup/)에서 기존 번호 조회가 일치 항목을 반환하지 않았다. 조회용 영문명 `Social Cooperative Youth Independence School`과 기관의 공개 주소 `38 Muwang-ro 7-gil, Iksan-si`, 우편번호 `54543`로 무료 신규 신청을 1회 제출했다. 사용자 승인에 따라 개인정보 제공 동의를 적용했고, 화면에서 `Your information is being processed.`와 D&B 확인 이메일 예정 안내를 확인했다. 번호 발급 및 D&B의 정확한 영문 법인명 검증은 아직 완료되지 않았다. 추가 신청을 중복 제출하지 않고 신청에 사용한 계정의 확인 이메일·증빙 요청을 확인한다. 담당자 연락처와 화면 캡처는 이 저장소에 포함하지 않는다.
- Android FCM과 iOS Distribution 인증서·APNs 키는 EAS에 이미 등록되어 있다. iPhone 등록 기기와 프로비저닝이 준비되지 않아 iOS 설치본은 아직 없다. 자격 증명을 다시 만들 필요는 없다.
- 푸시 실패 재시도와 영수증 확인을 위한 `push-dispatch` 외부 스케줄러는 아직 구성하지 않았다. 아래 알림 운영 순서에 따라 별도로 마무리한다.

다른 컴퓨터의 새 폴더에서는 다음과 같이 받는다.

```bash
git clone https://github.com/frontierverse/e-approval-system.git
cd e-approval-system
git switch main
```

기존 저장소를 사용한다면 `git status`로 미커밋 작업을 확인한 뒤, 깨끗한 `main`에서 `git pull --ff-only origin main`으로 최신 내용을 받는다. 이어서 이 문서의 로컬 실행 절차를 따른다. 원래 컴퓨터의 별도 작업 폴더에는 다른 기능의 미커밋 변경이 남아 있으며 이번 모바일 반영에 포함되지 않았다.

환경변수, `google-services.json`, 인증서 개인 키 및 서버 비밀 값은 GitHub에 들어 있지 않다. EAS 자격 증명은 계정에 보관되어 있으므로 프로젝트에 로그인해 기존 설정을 사용한다. 웹 서버를 로컬에서 개발할 때 필요한 비밀 값은 기존의 안전한 경로로 별도 준비한다. APK·AAB와 로컬 검증 보고서도 GitHub 대신 EAS 빌드 및 원래 컴퓨터에 보관되어 있다.

## 로컬 실행

1. 웹 프로젝트의 PostgreSQL에 마이그레이션을 적용하고 웹 API를 실행한다.
2. 이 폴더에서 `npm ci`를 실행한다.
3. `.env.example`을 참고해 `.env.local`에 `EXPO_PUBLIC_API_URL`을 설정한다. 실제 기기에서는 컴퓨터의 LAN 주소 또는 접근 가능한 HTTPS 서버를 사용한다.
4. `npx expo start --dev-client`를 실행한다.

PDF 미리보기는 네이티브 모듈을 사용하므로 Expo Go 대신 개발 빌드가 필요하다. `npx eas-cli@latest build --profile development --platform ios` 또는 `--platform android`로 개발 빌드를 만든다.

## 빌드와 배포 준비

- EAS 프로젝트는 개인 계정의 [@artemismars2/gyeoljaeon](https://expo.dev/accounts/artemismars2/projects/gyeoljaeon)에 연결되어 있다. `app.json`에 프로젝트 ID가 저장되어 있고, Android 서명 키는 EAS에 생성되어 있다.
- 현재 iOS bundle identifier와 Android package는 `com.gyeoljaeon.internal`이다. iOS App ID는 Apple 팀 `NAS4C244M3`에 `Gyeoljaeon Internal`로 등록되어 있고 Push Notifications 기능이 켜져 있다. 내부 배포 설치에는 테스트할 iPhone의 기기 등록과 프로비저닝 프로파일이 추가로 필요하다.
- 앱 서버 주소는 `https://www.bajaul.com`이다. `bajaul.com`은 이 주소로 리디렉션하므로 최종 origin에 직접 요청한다. EAS의 `development`, `preview`, `production` 환경에 `EXPO_PUBLIC_API_URL`을 이 값으로 설정한다. `npm run check:release`와 EAS 빌드 전 검사는 주소 누락, 예시 주소, localhost, HTTP를 차단한다.
- Android는 Firebase의 `gyeoljaeon` 프로젝트에 `com.gyeoljaeon.internal` 앱으로 등록되어 있다. 다운로드한 `google-services.json`은 EAS의 개발·테스트·운영 환경에 `GOOGLE_SERVICES_JSON` 파일 변수(Secret)로 연결되어 있다. `app.config.ts`가 빌드 서버의 파일 경로를 연결한다. 로컬에서는 이 폴더의 Git 제외 파일을 사용한다. 릴리스 검사는 파일 누락과 package 불일치를 차단한다.
- Android FCM V1 키는 EAS에 등록되어 있다. 전용 서비스 계정 `gyeoljaeon-expo-fcm@gyeoljaeon.iam.gserviceaccount.com`은 `gyeoljaeon` 프로젝트의 `Firebase Cloud Messaging API Admin` 역할을 사용한다. 비공개 키는 앱 소스나 빌드 압축본에 넣지 않는다.
- EAS 프로젝트의 `Unauthenticated access to internal distribution builds` 설정은 꺼져 있다. 사내 테스트 설치 파일을 받으려면 이 프로젝트에 접근 권한이 있는 Expo 계정으로 로그인해야 한다.
- `npx eas-cli@latest build --profile preview --platform all`로 사내 테스트 빌드를 만든다.
- iOS 서명 설정은 `npx eas-cli@latest credentials:configure-build --platform ios --profile preview`로 진행한다. 터미널 인증이 어려우면 Apple Developer 웹에서 인증서와 프로비저닝 프로파일을 발급한 뒤 EAS에 등록할 수 있다. 내부 배포 프로파일에는 설치할 iPhone의 기기 등록이 필요하다.
- Apple 팀 `NAS4C244M3`의 기존 Distribution 인증서는 EAS에 등록되어 있다. USB 연결 없이 기기를 등록하려면 Expo 계정의 `Apple devices > Register Apple device`에서 만든 링크를 설치할 iPhone의 Safari로 열어 등록 프로필을 설치한다. 등록한 기기를 Apple 프로비저닝 프로파일에 포함한 뒤 iOS 내부 배포 빌드를 만든다.
- iOS APNs 키 `5H8962CTM3`는 EAS에 등록되어 이 앱에 연결되어 있다. Apple 팀 `NAS4C244M3`의 Production 환경에서 `com.gyeoljaeon.internal` 토픽만 허용한다. 내부 배포 빌드의 운영 푸시에 사용하며 실제 기기 도착 여부는 기기 등록과 빌드 이후 확인한다.
- iOS 서명 없이 컴파일을 확인하려면 `npx eas-cli@latest build --profile preview-simulator --platform ios`를 사용한다. 이 결과물은 iPhone에 설치하는 빌드가 아니다.
- 바자울의 배포 대상은 회사 직원이다. 현재 회사는 Google Workspace나 직원 휴대폰 관리 서비스를 사용하지 않고 Android 사용자는 100명 이하이다. Google Play 초기 시험 배포는 직원 Google 계정을 지정하는 내부 테스트(최대 100명)로 준비한다. 테스트 트랙은 직원 전용 정식 운영 배포와 구분한다. 내부 테스트 시작에는 신규 개인 계정의 운영 출시용 12명·14일 요건이 적용되지 않는다. Google Play 개발자 계정과 업로드용 AAB가 필요하며, 일반 운영 출시를 선택하면 계정 유형에 따른 출시 요건을 충족해야 한다.
- Android 제출 프로필은 내부 테스트의 초안으로 구성한다. Google Play Console에서 직원 계정 목록과 설치 대상을 확인한 뒤 해당 트랙에 릴리스한다.
- Android APK는 최종 스토어 배포 전 시험용이다. 기존 서명 키를 재사용하고 직원 인증이 있는 배포 채널 또는 MDM으로 전달한다. 업데이트도 동일한 package와 서명 키를 유지해야 한다.
- iOS 시험 배포는 유료 Apple Developer 계정과 등록된 직원 기기 UDID가 있는 Ad Hoc 빌드로 진행한다. 새 기기가 추가되면 프로비저닝 프로필을 갱신하고 새 빌드 또는 재서명이 필요하다. 인증서·프로필 만료도 관리한다.
- iOS 장기 운영은 지정 조직만 볼 수 있는 Apple Custom Apps의 Private 배포를 우선 검토한다. Apple Business(기존 Apple Business Manager) 또는 Apple School Manager의 조직 ID와 Apple Developer 계정이 필요하며, Apple 심사 후 MDM이나 redemption code로 직원에게 배포한다. 공개 스토어 제출은 하지 않는다. TestFlight는 초대한 직원의 시험용이며 각 빌드는 90일 후 만료된다.
- EAS 내부 배포 URL도 기본적으로 URL을 아는 사람이 다운로드할 수 있다. 프로젝트의 Unauthenticated access to internal builds 설정과 직원 배포 채널을 확인한다. Expo 계정 로그인 요구는 서버의 직원 로그인·권한 검사를 대신하지 않는다. 보안 설정 변경, 신규 서명 키 생성, 비용·약관 수락은 별도 승인을 받는다.
- 앱 API는 `../src/app/api/mobile/`에 있고, 세션 토큰은 기기 SecureStore와 서버 해시로 관리한다. 서버 배포 전에 `20260930000000_mobile_app` 마이그레이션이 필요하다.
- 저장소 루트의 `.easignore`가 모바일 소스만 업로드한다. 서버 코드와 서버 환경파일은 네이티브 빌드 압축본에서 제외된다.

웹 서버 배포 확인: 인증 없이 `GET https://www.bajaul.com/api/mobile/auth/me`를 요청하면 JSON `401`이 반환되어야 한다. 로그인 페이지로 `307` 리디렉션되면 모바일 API와 `src/proxy.ts` 변경을 서버에 배포한다. 앱 세션은 bearer 토큰으로 인증하므로 웹 로그인 쿠키 없이 API에 도달해야 한다. 배포 대상의 도메인·프로젝트·커밋과 마이그레이션 상태를 확인한 뒤 배포하며, 운영 데이터로 시험하지 않는다.

## 알림 상태

앱 안의 알림 목록은 웹의 알림 데이터를 읽는다. 사용자가 `내 정보 > 기기 알림`에서 허용하면 앱은 Expo Push Token을 서버에 등록한다. 새 문서 알림은 서버에서 Expo Push Service로 보내며, 푸시 본문은 일반적인 안내만 담는다. 탭할 문서를 찾기 위한 문서 ID는 푸시 데이터에 포함된다. 로그아웃하거나 이 기기의 알림을 끄면 등록이 삭제된다.

원격 푸시 운영 순서:

1. 대상 서버 데이터베이스에서 `20260930000000_mobile_app` PostgreSQL migration의 적용 상태를 확인한다. 과거 다른 환경에서 적용한 기록만으로 운영 대상의 적용을 가정하지 않는다.
2. 연결된 EAS 프로젝트의 `app.json` 식별자를 사용한다. 앱의 EAS project ID가 빌드에 포함되어야 토큰을 받을 수 있다.
3. EAS에서 iOS APNs와 Android FCM V1 자격 증명을 설정하고, 개발 빌드 또는 내부 배포 빌드를 새로 만든다. Android 앱 설정 `google-services.json`과 FCM V1 서비스 계정 비밀 키는 서로 다른 파일이다. 앱 설정은 `GOOGLE_SERVICES_JSON` 파일 변수로, 비밀 키는 EAS의 FCM V1 자격 증명으로 등록한다. 비밀 키는 소스 폴더 밖에 보관한다. 알림은 실제 iPhone과 Android 기기에서 검증한다.
4. 웹 서버 환경에 `CRON_SECRET`을 긴 랜덤 문자열로 등록한다. Expo 프로젝트에서 push access-token 보안을 켰다면 `EXPO_ACCESS_TOKEN`도 서버에만 등록한다.
5. HTTPS 스케줄러가 10~15분마다 `GET https://www.bajaul.com/api/mobile/push-dispatch`를 `Authorization: Bearer <CRON_SECRET>` 헤더로 호출하게 한다. 이 작업은 실패한 전송 재시도와 Expo 영수증 확인을 처리한다. 서버의 새 알림은 요청 완료 후 즉시 전송을 시도한다.
6. 시험 계정으로 양쪽 기기에 로그인해 알림을 켠 뒤, 새 결재 알림을 만들고 앱 종료 상태·포그라운드·알림 탭 이동을 확인한다. 서버의 `MobilePushDelivery`에서 `ticketId`, `receiptCheckedAt`, `lastError`를 점검한다.

APNs/FCM 자격 증명, 운영 도메인과 스케줄러가 준비되기 전에는 실기기 도착까지 검증할 수 없다. 스케줄러가 없으면 즉시 전송은 시도하지만 실패 재시도와 영수증 확인은 실행되지 않는다.

## 검증

`npx tsc --noEmit`, `npx expo lint`, `EXPO_PUBLIC_API_URL=https://www.bajaul.com npx expo export --platform all`을 실행한다. 실제 기기에서 로그인, 승인·반려, PDF와 이미지 첨부를 최종 확인한다.

## 업데이트

`1.0.2`부터 `expo-updates`와 EAS Update를 사용한다. 기존 APK에는 자동 업데이트 기능이 없으므로 최초 지원 설치본을 한 번 설치해야 한다. Android 직원용 APK는 `npm run build:staff`로 만들며, 기존 package와 EAS 서명 키를 유지한다. 휴대폰에서 권한이 있는 Expo 계정으로 빌드 설치 링크를 열어 기존 앱 위에 업데이트한다.

최초 지원 설치본 `1.0.2 / versionCode 3`은 [Android 설치 링크](https://expo.dev/accounts/artemismars2/projects/gyeoljaeon/builds/8cae705d-9395-48f2-8694-f9648c933ad6)에 있다. 2026-10-02 빌드와 배포 워크플로 모두 성공했으며, `staff` 내부 배포 APK·`com.gyeoljaeon.internal`·`production` 채널을 확인했다. 기존 앱을 삭제하지 않고 이 APK로 업데이트한다.

직원용 `staff` 프로필과 스토어용 `production` 프로필은 `production` 채널·환경을 사용한다. 시험용 `preview` 프로필은 `preview` 채널·환경을 사용한다. 시험용 업데이트가 직원용 앱에 전달되지 않도록 채널을 유지한다. 개발 빌드는 운영 업데이트 검증을 대신하지 않는다.

앱은 실행 시 호환되는 업데이트를 확인하고 백그라운드로 다운로드한다. 내려받은 업데이트는 다음 앱 실행에 적용한다. 결재 중 강제로 다시 시작하지 않으며, 네트워크가 없어도 설치본 또는 마지막 정상 업데이트로 실행한다. `fingerprint` runtime 정책이 네이티브 구성에 따라 호환성을 결정한다. 네이티브 모듈·권한·홈 화면 이름 등을 바꾸면 새 APK/IPA가 필요하다.

화면·문구·JS 오류 수정 배포는 모바일 폴더에서 다음 순서로 진행한다.

```bash
npm run lint
npm run typecheck
npm run update:preview -- --input message="변경 내용"
# 같은 네이티브 구성을 가진 preview 설치본에서 확인한 뒤 배포한다.
npm run update:production -- --input message="변경 내용"
```

위 명령은 EAS Workflows에서 빌드·업데이트를 생성한다. `GOOGLE_SERVICES_JSON`은 EAS 서버에서만 읽을 수 있는 파일 변수이므로, 같은 환경의 파일로 fingerprint를 계산한다. 업데이트 작업은 린트·타입·릴리스 검사를 통과해야 발행한다. `EXPO_PUBLIC_API_URL`은 빌드와 업데이트 모두 `https://www.bajaul.com`을 사용한다. 서버 비밀 값·직원 정보·세션 토큰은 업데이트에 포함하지 않는다. GitHub 푸시와 서버 배포만으로 앱 업데이트가 발행되지는 않는다. 로컬에서 직접 `eas update`를 실행하려면 동일한 Firebase 앱 설정 파일을 별도로 준비하고 runtime 일치를 확인해야 한다.

운영 배포 후 새 Android 설치본에서 앱을 완전히 종료하고 다시 열어 다운로드한 뒤, 한 번 더 종료·실행하여 적용을 확인한다. EAS Update의 runtime과 설치본의 runtime이 일치해야 한다. iOS는 별도 기기 등록과 지원 설치본 배포가 끝난 뒤 같은 절차로 확인한다. 문제가 생기면 EAS 대시보드의 해당 채널에서 이전 정상 업데이트로 롤백한다.

2026-10-02 운영 업데이트 검증: [배포 워크플로](https://expo.dev/accounts/artemismars2/projects/gyeoljaeon/workflows/01a0fa86-3eed-7bca-a572-e7ccdf46ad5c)가 성공했다. Android 업데이트 ID는 `01a0fa87-f240-7c59-9b1c-79dd2dbea06e`, runtime은 `3fbb2aedbf34795a7701a252f72d36d780405b5b`이며 직원용 Android 빌드의 runtime과 일치한다. 앱과 같은 프로토콜로 `production` 채널의 manifest와 실행 번들을 받아 HTTP `200`, 번들의 SHA-256 일치, 운영 API 주소 포함을 확인했다. 실제 휴대폰에서 새 설치본 설치와 업데이트 적용 여부는 별도 확인이 필요하다.

참고: [Expo 내부 배포](https://docs.expo.dev/build/internal-distribution/), [Apple Custom Apps](https://developer.apple.com/support/volume-purchase-and-custom-apps/), [Google Play 비공개 앱](https://support.google.com/work/android/answer/9563481), [TestFlight](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/).
