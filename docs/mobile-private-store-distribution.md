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

사용자가 기존 Google Workspace·Android 기기 관리 서비스와 Apple Business 조직이 없으며 Android 직원 기기가 25대 이하라고 확인했다. 사용자가 관리형 Apple 계정 생성을 직접 완료했고, Apple Business 홈에서 회사 조직이 생성된 것을 확인했다. 조직 인증은 아직 완료되지 않았으며 인증 화면에서 서로 다른 인증 방법 2종을 요구한다. Apple 개발자 팀 `NAS4C244M3`은 기존 개인 개발자 회원이며, 배포 대상 회사 조직 ID와 구분한다. 직원이나 기기 등록·결제는 진행하지 않았다.

사용자가 Android 관리 서비스로 ManageEngine Mobile Device Manager Plus의 무료 25대 요금제를 선택하고, 정보 제공·가입 약관 동의를 승인했다. 무료 계정을 생성하여 관리 콘솔에 진입했으며 현재 화면은 29일 남은 체험 상태다. 사용자가 새 Zoho 비밀번호 설정과 이메일 인증을 직접 완료했고, 콘솔에서 미인증 경고가 사라진 것을 확인했다. 현재 가입 지역 감지는 US다. 유료 구독·결제·직원 기기 등록은 진행하지 않았다.

사용자가 Managed Google Play 계약 동의와 ManageEngine EMM 연결 권한을 승인했다. 기존 Google 계정으로 Android 전용 조직을 생성해 연결을 완료했고, ManageEngine과 Google 비공개 앱 화면에서 회사명 및 조직 ID `LC00v4uk7o`를 확인했다. 데이터 보호 담당자와 EU 담당자 연락처는 지정하지 않았다. Google Workspace 구독이나 도메인 구매는 진행하지 않았다.

공식 안내와 FAQ는 체험 종료 후 Free Edition으로 전환하면 총 25대까지 무료로 계속 관리할 수 있다고 설명한다. Android와 iPhone 등을 같은 MDM에서 관리할 경우 기기 수를 합산한다. 현재 구독 화면에는 유료 업그레이드 양식만 있으며 무료 상태로 전환된 것을 확인하지 못했으므로 실제 라이선스를 Free 25로 기록하지 않는다. 체험 종료 시 무료 전환 상태와 선택한 관리 기기를 확인한다.

EMM의 Managed Google Play 비공개 앱 게시 화면은 첫 게시 때 등록비 없는 게시 계정을 자동 생성한다. 기존 직원 설치본의 서명을 유지하려면 같은 기존 서명키로 만든 APK를 먼저 게시한다. 이 화면에서 처음부터 AAB를 올리면 Google이 새 앱 서명키를 생성하므로 현재 경로에서는 사용하지 않는다. 첫 게시용 `staff` APK 빌드 `b3e2e82e-0886-42f1-a2ee-175fe8cb4a28`이 `1.0.5 / versionCode 10`으로 완료됐다. ZIP CRC·실제 바이너리 manifest의 패키지/버전·APK v2 RSA 서명·전체 파일의 청크 해시를 검증했고 기존 서명 인증서와 일치했다. 변경한 파일을 거부하는 검사도 통과했다. 실제 Android 설치·업데이트 검증은 남아 있다. versionCode 10을 게시한 이후에는 이전 AAB versionCode 9를 제출하지 않으며, AAB 전환 시 서명 설정을 완료하고 더 높은 versionCode로 새로 빌드한다.

사용자 승인 후 Apple Developer에서 App Store 프로필 `Bajaul Private Store 20261006`을 발급하고 다운로드했다. App ID `NAS4C244M3.com.gyeoljaeon.internal`, 개발자 팀·만료일·스토어 권한·기존 인증서 일련번호·CMS 서명을 검사했다. App Store 프로필 UUID는 `512f1ed9-0917-4f12-bc0a-67f29a8b72f2`이며 2027-10-01 만료된다. 새 Distribution 인증서는 발급하지 않았다.

Android 앱 `com.gyeoljaeon.internal`을 회사 조직 `LC00v4uk7o`의 Google 비공개 앱 화면에서 `바자울`로 생성하고 ManageEngine에 선택·저장·동기화했다. 앱 저장소에서 `Google Hosted Private App`, 버전 `1.0.5`로 확인됐고 1개 동기화 성공을 확인했다. 해당 조직과 비공개 설정을 운영자 기록에 반영했다. 최초 생성 직후에는 `Not available yet`였으나 후속 조회에서 해당 대기 표시가 사라지고 회사의 비공개 앱 목록에 표시되는 것을 확인했다. 직원 기기는 아직 0대이며 실제 설치 완료로 기록하지 않는다. 첫 실제 기기 배포와 설치·업데이트를 확인한다.

검증한 프로필을 기존 EAS 프로젝트 `@artemismars2/gyeoljaeon`의 App Store 빌드 자격 증명에 연결했다. 인증서 개인키·P12·비밀번호를 조회하거나 내보내지 않고 기존 인증서 ID와 프로필만 연결했으며, 연결 후 프로필 UUID·인증서 일련번호·App Store 배포 형식을 재확인했다. iOS 비공개 스토어 빌드 워크플로 `01a110be-0dc9-71dc-93e5-090c50029fa1`과 빌드 `90e76550-a1a2-45fc-b4af-97a788a8cf7f`가 `1.0.5 / build 1`로 완료됐다. 다운로드한 IPA의 ZIP CRC·bundle ID/버전·프로필 CMS 서명·스토어 권한·승인한 기존 인증서를 확인했고 `codesign --verify --deep --strict`로 코드 서명과 리소스 무결성을 검증했다. 실제 iPhone 동작 검증·스토어 제출은 아직 완료되지 않았다.

2026-10-06 사용자가 기존 개발자 계정으로 App Store Connect 로그인을 완료했다. 바자울의 Primary Category `Business`와 한국어 부제 `직원 전용 전자결재·업무 관리`를 저장했고 `Saved` 상태를 확인했다. Private 배포 초안에 회사명을 입력했으며 조직 ID는 아직 확인되지 않아 저장·제출하지 않았다. Apple Business의 기존 관리형 회사 계정과 App Store Connect의 개발자 계정은 구분한다. 사용자가 기존 관리형 계정으로 로그인했고 회사 조직 홈에서 사회적협동조합 청소년자립학교를 확인했다. 중복 조직을 만들지 않는다.

사용자는 회사 등록증과 기관 도메인 인증을 조직 검증 방법으로 선택했다. 제공한 홈페이지 주소는 `youth.bajaul.com`이며 해당 주소는 기존 Vercel CNAME 연결이 있다. 사용자가 상위 도메인 `bajaul.com`의 기관 소유·관리 권한을 확인했고, 인증 대상으로 선택했다. 제공한 사업자등록증 PDF를 로컬에서 확인했으며 기관명과 주소가 기존 조직 정보와 일치했다.

사용자가 Apple 화면에서 발급된 도메인 인증용 TXT 값을 제공하고 Cloudflare 관리 계정으로 로그인했다. `bajaul.com` 루트에 해당 TXT를 TTL Auto로 추가했고 Cloudflare 레코드 목록에서 저장 결과를 확인했다. Cloudflare의 두 네임서버와 기본 DNS 조회에서 정확한 Apple 인증 값을 확인했다. Apple 인증 화면은 컴퓨터 제어 제한으로 조회할 수 없으므로 사용자가 `Send for Review`를 직접 눌렀고 심사 중·검토 대기 상태가 표시됐다고 확인했다. 조직 인증 심사는 사용자 확인에 따라 접수된 것으로 기록한다. 조직 승인과 검증된 배포 대상 조직 ID는 아직 확인되지 않았으며 iOS 제출 가드를 유지한다.

실제 앱에 포함된 fingerprint는 Android APK versionCode 10이 `93cd48e41f372202d0c64a600e24d314978b19ac`, iOS build 1이 `170acad74bd1a06928924cffcbe5855fe0aa9d91`이다. iOS의 Expo 설정에서 production 채널과 기존 EAS 업데이트 프로젝트를 확인했다. 초기 AAB versionCode 9 및 기존 직원 APK versionCode 8과 별도로 호환되는 네이티브 런타임을 유지하고, 새 스토어 앱 설치를 확인하기 전에는 OTA 호환성을 추정하지 않는다.

기존 D-U-N-S 신청은 2026-10-02 제출 기록이 있다. 발급 여부와 정확한 법인명을 확인하고 중복 신청하지 않는다. 조직 등록·서비스 선택·직원 기기 등록·약관·결제는 준비된 실제 화면과 정보를 바탕으로 진행한다.

## Android 진행 순서

1. 선택한 ManageEngine 무료 계정을 준비하고 회사의 Android Enterprise 관리 환경을 연결한 뒤 Managed Google Play **조직 ID**를 확인한다. 개인 휴대폰은 업무 프로필로 설치한다. 연결 권한·약관은 실제 화면에서 확인한다.
2. ManageEngine의 Managed Play 비공개 앱 게시 화면을 사용한다. 첫 게시 때 등록비 없는 게시 계정이 자동 생성되므로 별도의 유료 Play Console 계정을 자동 생성하지 않는다.
3. 첫 게시에는 검증한 기존 서명키의 APK를 사용한다. 현재 조직에만 승인되는 비공개 앱인지 실제 표시와 조직 ID를 확인한다. 공개 운영 앱을 먼저 게시하지 않는다.
4. 이후 AAB로 전환하려면 Play App Signing의 **앱 서명 인증서**가 기존 설치본과 일치하도록 기존 키 등록을 준비한다. AAB 업로드 인증서와 Google이 최종 APK에 사용하는 앱 서명 인증서는 다를 수 있다. 키 전송은 실제 대상·방식이 준비된 후 승인받는다. EAS Submit의 후속 업로드를 사용하려면 Google Play 제출용 서비스 계정을 별도로 연결한다. 기존 FCM 푸시 키는 제출용 권한을 대신하지 않는다.
5. `mobile/private-store.json`의 Android 조직 ID와 확인 상태를 입력한다. EMM 화면의 첫 APK 게시와 EAS의 후속 AAB 제출을 구분한다. 아래 EAS 제출 명령은 검증한 `private-store` AAB만 허용하며 APK는 허용하지 않는다. EAS 제출 시 초안을 만든 뒤 콘솔에서 비공개 대상 조직과 버전을 확인하고 릴리스한다.
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

기관 홈페이지 `https://youth.bajaul.com/`에서 공개 문의 영역 `#contact`를 확인했다. 앱 지원 페이지 후보로 기록하되 사용자가 앱 문의처를 선택하기 전에는 확정한 지원 연락처로 사용하지 않는다. 홈페이지 전체 접근성 상태에서 개인정보처리방침 링크는 관찰되지 않았으며, 기존 개인정보처리방침 페이지의 존재·주소를 사용자에게 확인한다.

## 공식 근거

- [Google 비공개 앱 개요](https://support.google.com/work/android/answer/9563481?hl=en)
- [Managed Google Play 계정 연결](https://support.google.com/work/android/answer/7042221?hl=en)
- [Play Console에서 비공개 앱 게시](https://support.google.com/googleplay/work/answer/6145139?hl=en)
- [EMM에서 비공개 앱 게시와 첫 APK의 서명키 유지](https://support.google.com/googleplay/work/answer/9146439)
- [ManageEngine의 Managed Play 비공개 앱 게시](https://www.manageengine.com/in/mobile-device-management/how-to/mdm-publish-enterprise-apps-as-private-apps-directly-from-mdm.html)
- [Google Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756?hl=en)
- [Apple의 Public/Private 배포 설정](https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/set-distribution-methods)
- [Apple Business의 Custom Apps](https://support.apple.com/en-ie/guide/business/axm58ba3112a/web)
- [Apple Business 가입·조직 인증](https://support.apple.com/en-euro/guide/business/axm402206497/web)
- [Apple Business 도메인 추가·인증](https://support.apple.com/en-euro/guide/business/axm48c3280c0/web)
- [ManageEngine 무료 25대 관리](https://www.manageengine.com/mobile-device-management/free-mobile-device-management-software.html)
- [ManageEngine 체험 종료와 Free Edition 전환 FAQ](https://www.manageengine.com/mobile-device-management/faq.html)
- [ManageEngine Android 개인 기기 업무 프로필](https://www.manageengine.com/mobile-device-management/help/enrollment/enroll_android_devices.html)
- [Expo 빌드 설정](https://docs.expo.dev/build/eas-json/)
- [Expo 제출 설정](https://docs.expo.dev/submit/eas-json/)
