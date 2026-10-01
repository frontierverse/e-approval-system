# 결재온 모바일 앱

직원 전용 Expo 앱이다. 공개 App Store·Play Store에 제출하지 않는다. 웹 프로젝트와 같은 데이터베이스와 결재 규칙을 쓰며, iOS와 Android에 동일한 코드로 배포한다. 앱은 홈, 받은결재, 알림, 내 정보의 하단 탭과 문서 상세, 첨부파일 미리보기, 승인·반려를 제공한다. 문서 작성과 관리자 기능은 웹에서 사용한다. 서버는 유효한 bearer 세션, 활성 직원 상태, 문서별 열람·결재 권한을 확인한다.

## 로컬 실행

1. 웹 프로젝트의 PostgreSQL에 마이그레이션을 적용하고 웹 API를 실행한다.
2. 이 폴더에서 `npm ci`를 실행한다.
3. `.env.example`을 참고해 `.env.local`에 `EXPO_PUBLIC_API_URL`을 설정한다. 실제 기기에서는 컴퓨터의 LAN 주소 또는 접근 가능한 HTTPS 서버를 사용한다.
4. `npx expo start --dev-client`를 실행한다.

PDF 미리보기는 네이티브 모듈을 사용하므로 Expo Go 대신 개발 빌드가 필요하다. `npx eas-cli@latest build --profile development --platform ios` 또는 `--platform android`로 개발 빌드를 만든다.

## 빌드와 배포 준비

- EAS 프로젝트는 개인 계정의 [@artemismars2/gyeoljaeon](https://expo.dev/accounts/artemismars2/projects/gyeoljaeon)에 연결되어 있다. `app.json`에 프로젝트 ID가 저장되어 있고, Android 서명 키는 EAS에 생성되어 있다.
- 현재 iOS bundle identifier와 Android package는 `com.gyeoljaeon.internal`이다. iOS 서명 설정에서 Apple 개발자 계정의 등록 가능 여부를 확인한다.
- 앱 서버 주소는 `https://www.bajaul.com`이다. `bajaul.com`은 이 주소로 리디렉션하므로 최종 origin에 직접 요청한다. EAS의 `development`, `preview`, `production` 환경에 `EXPO_PUBLIC_API_URL`을 이 값으로 설정한다. `npm run check:release`와 EAS 빌드 전 검사는 주소 누락, 예시 주소, localhost, HTTP를 차단한다.
- Android는 Firebase에 `com.gyeoljaeon.internal` 앱을 등록한 뒤 다운로드한 `google-services.json`을 EAS의 `GOOGLE_SERVICES_JSON` 파일 변수로 등록한다. `app.config.ts`가 빌드 서버의 파일 경로를 연결한다. 로컬에서는 이 폴더에 해당 파일을 둘 수 있다. 릴리스 검사는 파일 누락과 package 불일치를 차단한다.
- `npx eas-cli@latest build --profile preview --platform all`로 사내 테스트 빌드를 만든다.
- iOS 서명 설정은 `npx eas-cli@latest credentials:configure-build --platform ios --profile preview`로 진행한다. Apple 계정 로그인 세션이 만료되면 터미널에서 직접 인증한다.
- iOS 서명 없이 컴파일을 확인하려면 `npx eas-cli@latest build --profile preview-simulator --platform ios`를 사용한다. 이 결과물은 iPhone에 설치하는 빌드가 아니다.
- 최종 Android 배포는 관리형 Google Play의 비공개 앱을 사용한다. 기존 조직의 Android Enterprise·EMM/기기 관리 연결, 관리형 Google Play 조직 ID와 앱 게시 권한을 확인하고 해당 조직만 대상으로 설정한다. 직원은 조직에서 관리하는 Play Store에서 설치한다. 개인 휴대폰은 조직 정책에 따른 업무 프로필이 필요할 수 있다. 계정·조직 등록, 관리 권한, 비용·약관은 승인 없이 새로 만들거나 수락하지 않는다.
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

현재 프로젝트에는 `expo-updates`, runtime version, EAS Update channel 설정이 없다. JS 변경도 새 빌드를 직원에게 재배포한다. 네이티브 모듈 변경은 항상 새 바이너리가 필요하다. OTA 업데이트를 도입하려면 호환 runtime과 채널을 명시하고 최초 지원 빌드를 배포해야 하며, 직원 접근 통제를 유지한다.

참고: [Expo 내부 배포](https://docs.expo.dev/build/internal-distribution/), [Apple Custom Apps](https://developer.apple.com/support/volume-purchase-and-custom-apps/), [Google Play 비공개 앱](https://support.google.com/work/android/answer/9563481), [TestFlight](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/).
