# 직원 전용 비공개 스토어 배포

2026-10-06 결정: Android는 **Managed Google Play 비공개 앱**, iOS는 **Apple Custom Apps의 Private 배포**를 사용한다. 앱 이름은 바자울, Android package와 iOS bundle identifier는 `com.gyeoljaeon.internal`이다. 현재 회사명 기록은 사회적협동조합 청소년자립학교이며, 조직 등록에는 실제 법인 정보와 검증된 관리 계정을 사용한다.

## 준비된 앱 설정

- `mobile/eas.json`의 `private-store` 빌드는 기존 `production` 환경·채널과 기존 EAS 서명을 사용한다. Android 결과물은 AAB, iOS는 스토어 서명 IPA이다. `distribution: store`는 파일 형식·서명 방식이며 스토어 공개 범위를 설정하지 않는다.
- 두 빌드 워크플로는 린트·타입 검사를 실행하며 자동 제출·게시 작업은 없다.
- Android `private-store` 제출은 `production` 트랙의 `draft`이다. 직원 지정 내부 테스트와 정식 비공개 운영 배포를 구분한다.
- `mobile/private-store.json`에는 회사 조직 ID와 실제 콘솔 설정 확인 상태를 기록한다. 미확인 상태는 빈 값·`false`로 남긴다. 확인 상태는 운영자의 기록이며, 스토어 API가 공개 범위를 검증한 결과가 아니다.
- 제출 명령은 회사 조직·비공개 설정을 확인하고 명시한 빌드 ID만 사용한다. iOS는 실제 App Store Connect 앱 ID와 `eas.json`의 `submit.private-store.ios.ascAppId`도 같아야 한다. 미확인 상태에서는 EAS 제출을 실행하지 않는다.
- 서버는 기존 직원 인증과 재직 상태·문서별 권한을 계속 검사한다. 앱을 받았다는 사실만으로 업무 데이터에 접근할 수 없다.

## 현재 확인된 외부 상태

2026-10-06 조회: EAS 프로젝트 `@artemismars2/gyeoljaeon`에 접근할 수 있다. 기존 Android 직원용 `1.0.5 / versionCode 8`은 완료된 내부 배포 APK이며 스토어 업로드용 AAB가 아니다.

초기 Chrome 계정은 2단계 인증이 필요했으나, 사용자가 Brave에서 별도의 Google 계정과 Apple 개발자 계정 인증을 완료했다. 현재 Google 계정은 비영리단체 개발자 계정의 결제 프로필 연결 단계까지 열려 있다. 조직 인증과 가입은 아직 완료되지 않았다.

App Store Connect에 바자울 iOS 앱 레코드 `6819625477`을 생성했다. 한국어 설명·검색어·심사 안내 초안, 버전 `1.0.5`, 수동 릴리스 설정을 저장했다. 실제 심사용 계정·스크린샷·지원/개인정보처리방침 주소는 아직 준비되지 않았다. Private 배포는 회사 조직 ID를 최소 1개 요구하므로 조직 확인 전에는 저장·제출할 수 없다. 선택만 한 화면을 비공개 설정 완료로 기록하지 않는다.

사용자가 기존 Google Workspace·Android 기기 관리 서비스와 Apple Business 조직이 없으며 Android 직원 기기가 25대 이하라고 확인했다. Apple Business 조직명·기존 D-U-N-S 신청의 공개 기관 주소를 입력한 가입 초안을 준비했고, 관리형 Apple 계정 생성과 조직 인증이 남아 있다. Apple 개발자 팀 `NAS4C244M3`은 기존 개인 개발자 회원이며, 배포 대상 회사 조직 ID와 구분한다. 직원이나 기기 등록·약관 동의·결제는 진행하지 않았다.

Android 관리 서비스 후보는 ManageEngine Mobile Device Manager Plus다. 공식 안내에서 무료 25대 요금제와 개인 기기의 업무 프로필(BYOD) 지원을 확인했다. 서비스 선택·가입과 Google 관리 조직 연결은 아직 승인·완료되지 않았고, 유료 전환이나 직원 기기 등록을 실행하지 않는다. 30일 체험과 이후 무료 25대 요금제를 구분하여 가입 화면과 실제 라이선스 상태를 확인한다.

EAS의 `private-store` iOS 자격 증명 조회에서는 기존 Distribution 인증서를 확인했다. 이를 재사용하는 설정은 App Store 프로비저닝 프로필 생성 단계에서 Apple Developer 로그인을 요구하여 중단했다. 새 인증서나 프로필을 생성하지 않았다. 인증서만으로 iOS 설치본이 준비된 것은 아니다.

로그인 후 Apple Developer에서 App Store 프로필 초안 `Bajaul Private Store 20261006`을 준비했다. App ID는 `NAS4C244M3.com.gyeoljaeon.internal`, 선택한 기존 인증서는 2027-10-01 만료 Distribution 인증서다. Generate 실행과 EAS 연결은 아직 완료하지 않았으며 발급 승인과 검증을 거쳐 진행한다. Apple Business 가입은 별도의 관리형 Apple 계정 비밀번호·전화번호·본인 인증을 사용자가 입력하는 단계에서 대기한다.

기존 D-U-N-S 신청은 2026-10-02 제출 기록이 있다. 발급 여부와 정확한 법인명을 확인하고 중복 신청하지 않는다. 조직 등록·서비스 선택·직원 기기 등록·약관·결제는 준비된 실제 화면과 정보를 바탕으로 진행한다.

## Android 진행 순서

1. 회사의 Android Enterprise 관리 환경을 연결하고 Managed Google Play **조직 ID**를 확인한다. Google Workspace 또는 선택한 EMM을 통한 관리가 필요하다. 개인 휴대폰은 해당 관리 방식에 따라 업무 프로필로 설치한다. 현재 서비스가 없으므로 서비스 선택·비용·직원 기기 관리 범위는 먼저 확정해야 한다.
2. 게시 계정을 준비한다. 기존 Play Console 경로 또는 EMM의 Managed Play 비공개 앱 게시 경로를 사용할 수 있다. 두 경로는 가입 절차와 필요 자격 증명이 다르므로 신규 유료 계정을 자동 생성하지 않는다.
3. Play Console에서 해당 앱의 **Managed Google Play → Organizations**에 확인한 회사 조직만 등록하고, 실제 비공개 표시와 대상 조직을 확인한다. 공개 운영 앱을 먼저 게시하지 않는다.
4. 첫 AAB 업로드는 콘솔에서 진행한다. 기존 직원 APK에서 삭제 없이 업데이트하려면 Play App Signing의 **앱 서명 인증서**가 기존 설치본과 일치해야 한다. AAB 업로드 인증서와 Google이 최종 APK에 사용하는 앱 서명 인증서는 다를 수 있다. 초기 등록에서 기존 앱 서명키 유지 방법을 확인하며 새 앱 서명키를 자동 선택하지 않는다. 키 전송은 실제 대상·방식이 준비된 후 승인받는다. EAS Submit의 후속 업로드를 사용하려면 Google Play 제출용 서비스 계정을 별도로 연결한다. 기존 FCM 푸시 키는 제출용 권한을 대신하지 않는다.
5. `mobile/private-store.json`의 Android 조직 ID와 확인 상태를 입력하고, 아래 제출 검사를 실행한다. EAS 제출 시 초안을 만든 뒤 콘솔에서 비공개 대상 조직과 버전을 확인하고 릴리스한다.
6. 직원의 관리형 Play Store에서 설치·업데이트 및 로그인·퇴직 계정 차단을 실제 Android로 확인한다.

## iOS 진행 순서

1. 회사 Apple Business(기존 Apple Business Manager) 조직을 등록·검증하거나 기존 관리 계정에 로그인하고 **조직 ID**를 확인한다. 개발자 서명의 Apple 팀 ID와 배포 대상 회사의 조직 ID는 서로 다른 값이다.
2. 기존 Apple Developer 자격 증명을 확인하고 이 bundle identifier의 **App Store용 프로비저닝 프로필**을 EAS에 연결한다. Ad Hoc 프로필은 Custom Apps 스토어 제출에 사용할 수 없다.
3. App Store Connect 앱 레코드를 만들고 **Pricing and Availability → App Distribution Methods → Private**를 선택한 뒤 회사 조직 ID만 지정한다. 승인 후 Public↔Private 변경은 새 앱 레코드와 재심사가 필요하므로 처음부터 Private로 설정한다.
4. 실제 App Store Connect 앱 ID를 확인하여 `mobile/private-store.json`과 `eas.json`의 `submit.private-store.ios.ascAppId`에 동일하게 입력한다.
5. 스토어 IPA를 업로드하고 앱 설명·지원/개인정보처리방침 주소·데이터 공개 항목·실제 앱 스크린샷·심사용 계정을 준비해 심사를 요청한다. 심사용 계정에는 합성 자료를 사용하고 직원·청소년의 운영 정보를 제공하지 않는다.
6. 승인 후 Apple Business에서 설치 코드 또는 조직의 기기 관리 방식으로 직원에게 배포한다. 실제 iPhone에서 로그인·업데이트·문서 처리·알림을 확인한다.

## 명령

모바일 폴더에서 실행한다. 빌드는 조직 등록 전에도 준비할 수 있지만 스토어 비공개 설정을 대신하지 않는다.

```bash
npm run lint
npm run typecheck
npm run test:api
npm run test:private-store
npm run build:private-store:android -- --non-interactive
npm run build:private-store:ios -- --non-interactive
```

회사 조직과 콘솔의 비공개 설정을 확인한 다음 플랫폼별로 검사한다. 아래 `--id`에는 플랫폼·스토어 배포 형식·서명·실기기 확인을 마친 EAS 빌드의 UUID를 사용한다. 현재 조직 정보가 비어 있으므로 검사와 제출은 실패하는 것이 정상이다.

```bash
npm run check:private-store -- android
npm run check:private-store -- ios
npm run submit:private-store:android -- --id VERIFIED_ANDROID_BUILD_UUID
npm run submit:private-store:ios -- --id VERIFIED_IOS_BUILD_UUID
```

`npm run build:staff`는 기존 직원 시험용 APK 빌드를 유지한다. `submit.production`도 기존 내부 테스트 초안 설정을 유지한다. 스토어 업로드만으로 심사·게시·직원 설치가 완료되지는 않는다. EAS OTA 업데이트도 조직 등록이나 최초 스토어 설치를 대신하지 않는다.

## 스토어 자료

`mobile-private-store-listing.json`은 앱 설명·심사 안내 초안이다. 앱 ID·조직 ID·지원 연락처·개인정보처리방침 URL·심사용 로그인 정보는 미확인 값을 채우지 않는다. 개인정보 공개 항목은 실제 데이터 흐름과 외부 처리 업체를 검토해 확정한다. 계정·업무 문서와 첨부·직원 대화·알림 토큰·로그인/감사 기록 및 청소년 관련 데이터의 실제 취급을 포함해야 한다. 운영 개인정보가 보이는 화면을 스토어에 올리지 않는다.

## 공식 근거

- [Google 비공개 앱 개요](https://support.google.com/work/android/answer/9563481?hl=en)
- [Managed Google Play 계정 연결](https://support.google.com/work/android/answer/7042221?hl=en)
- [Play Console에서 비공개 앱 게시](https://support.google.com/googleplay/work/answer/6145139?hl=en)
- [Google Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756?hl=en)
- [Apple의 Public/Private 배포 설정](https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/set-distribution-methods)
- [Apple Business의 Custom Apps](https://support.apple.com/en-ie/guide/business/axm58ba3112a/web)
- [Apple Business 가입·조직 인증](https://support.apple.com/en-euro/guide/business/axm402206497/web)
- [ManageEngine 무료 25대 관리](https://www.manageengine.com/mobile-device-management/free-mobile-device-management-software.html)
- [ManageEngine Android 개인 기기 업무 프로필](https://www.manageengine.com/mobile-device-management/help/enrollment/enroll_android_devices.html)
- [Expo 빌드 설정](https://docs.expo.dev/build/eas-json/)
- [Expo 제출 설정](https://docs.expo.dev/submit/eas-json/)
