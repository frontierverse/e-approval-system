import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { appName, organizationName } from "@/lib/branding";
import { mobileAppInfo } from "@/lib/mobile-app-info";

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description: `${organizationName}의 ${appName} 직원용 앱 및 연결된 업무 시스템 개인정보처리방침`,
  alternates: { canonical: mobileAppInfo.privacyUrl },
};

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-4 border-t border-[var(--border)] py-5">
    <h2 id={`${id}-heading`} className="text-lg font-semibold">{title}</h2>
    <div className="mt-2 space-y-3 text-sm leading-7">{children}</div>
  </section>;
}

const purposes = [
  ["직원 계정·인사", "이름, 이메일(등록 시), 비밀번호 해시, 부서·직위·역할·권한·계정 상태, 생년월일·입사일·퇴사일, 프로필·서명 이미지(등록 시)", "직원 식별, 로그인, 인사·권한 관리, 문서 작성자와 결재자 확인"],
  ["결재·업무 기록", "결재 문서·댓글·보고·일지·일정·할 일, 작성자·결재자와 처리 이력, 자료실 자료·첨부파일 및 파일명·형식·크기", "전자결재, 업무 수행·보고·자료 공유 및 처리 이력 확인"],
  ["직원 업무 대화", "대화 내용, 보낸 직원·대화방, 전송·읽음 시각", "직원 간 업무 연락과 협업"],
  ["청소년·보호자 기록", "청소년 이름·생년월일·나이·연락처, 입소·퇴소·상담·사후관리 날짜, 가족·보호자 이름·관계·연락처, 생활·학습·일정·특이사항·보고, 결정문·첨부파일", "권한을 가진 직원의 보호·상담·생활·학습·사후관리 업무"],
  ["접속·알림·앱 유지", "사용자 식별자, 로그인·접속·업무 처리 시각과 IP 주소(기록되는 경우), 세션 토큰 해시·만료일, 알림 토큰·처리 이력, 업데이트 요청의 운영체제·무작위 식별 토큰·IP 주소 등 통신 정보", "로그인 유지, 접근 통제·보안 점검, 결재·직원 채팅·할 일·일정 등 업무 알림 및 앱 업데이트 제공"],
];
const retention = [
  ["직원 계정·인사 기록", "재직 중 및 퇴직일부터 3년. 퇴직 시 로그인 권한을 해제하고, 문서 증빙에 필요한 작성자·결재자 식별 정보는 해당 문서의 보존 기간까지 분리하여 보관합니다."],
  ["결재·업무 문서, 보고·일지, 일정·할 일 및 자료", "해당 업무가 완료된 날부터 5년. 첨부파일·댓글·서명 증빙도 연결된 기록의 기간을 따릅니다."],
  ["직원 업무 대화", "메시지 작성일부터 1년. 보존이 필요한 결재·사건 증빙은 필요한 부분만 해당 업무 기록으로 관리합니다."],
  ["청소년·가족·보호자 기록", "상담·사후관리 완료일부터 5년. 완료일을 확정하기 전에는 진행 중인 업무 기록으로 관리합니다."],
  ["로그인·접속·보안 감사 기록", "기록일부터 2년. 문서 자체의 결재 이력은 해당 문서의 보존 기간을 따릅니다."],
  ["세션·알림 등록 정보", "로그아웃·계정 이용 종료·알림 해제 또는 유효기간 만료 후 필요가 없어진 정보를 파기합니다. 장애 확인에 필요한 알림 처리 이력은 생성일부터 90일입니다."],
  ["개인정보 문의·권리 행사 기록", "요청 처리 완료일부터 3년. 처리 증빙에 필요한 최소한의 항목만 보관합니다."],
];

export default function MobileAppPrivacyPage() {
  return <main className="min-h-screen bg-[var(--background)] px-4 py-6 text-[var(--foreground)] sm:py-8">
    <article className="mx-auto max-w-3xl">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{appName} 개인정보처리방침</h1>
          <p className="mt-2 text-sm leading-6">{organizationName}</p>
          <p className="text-sm leading-6">방침 버전: 2026년 10월 7일 · 시행일: 2026년 10월 7일</p>
        </div>
        <button type="button" data-theme-toggle aria-label="화면 테마 변경" className="min-h-11 shrink-0 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm font-medium hover:bg-[var(--surface-muted)]">테마 변경</button>
      </header>
      <p className="my-4 text-sm leading-7">{organizationName}(이하 “기관”)은 {appName} 직원용 모바일 앱과 연결된 업무 시스템의 개인정보를 아래 기준으로 처리합니다. 앱은 기관이 등록한 활성 직원 계정으로 이용하며, 청소년이나 일반 이용자에게 직접 회원가입을 제공하지 않습니다.</p>
      <nav aria-label="개인정보처리방침 목차" className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {[["data", "처리 항목"], ["retention", "보관·파기"], ["providers", "처리 업체"], ["rights", "권리·문의"]].map(([id, label]) => <a key={id} href={`#${id}`} className="inline-flex min-h-11 min-w-11 items-center underline underline-offset-4">{label}</a>)}
      </nav>
      <Section id="data" title="1. 처리 목적과 개인정보 항목">
        <dl className="divide-y divide-[var(--border)]">
          {purposes.map(([name, items, purpose]) => <div key={name} className="py-3 first:pt-0"><dt className="font-semibold">{name}</dt><dd className="mt-1">{items}</dd><dd className="mt-1">목적: {purpose}</dd></div>)}
        </dl>
        <p>기관은 직원·정보주체가 제공하거나 권한을 가진 직원이 업무 과정에서 등록한 정보와 시스템 이용 시 생성되는 정보를 처리합니다. 선택 항목은 해당 기능을 사용하는 경우에만 등록하며, 파일·자유서술에는 업무에 필요한 최소한의 정보만 입력하도록 관리합니다.</p>
        <p>직원 인사·업무 수행, 청소년 보호·상담 업무에 적용되는 법령, 계약의 이행 또는 적법한 동의 등 해당 처리의 근거에 따라 정보를 처리합니다. 이 방침의 게시나 앱 로그인 자체를 별도 동의로 간주하지 않습니다.</p>
      </Section>
      <Section id="retention" title="2. 보관 기간과 파기">
        <dl className="divide-y divide-[var(--border)]">
          {retention.map(([name, period]) => <div key={name} className="py-3 first:pt-0 sm:grid sm:grid-cols-[12rem_1fr] sm:gap-4"><dt className="font-semibold">{name}</dt><dd>{period}</dd></div>)}
        </dl>
        <p>위 기간은 기관의 운영 기준입니다. 근로자 명부·근로계약 중요 서류의 법정 보존 기간 등 별도 법령이 적용되는 기록은 그 법령에서 정한 기산일·기간을 따릅니다. 법원 요청, 감사, 진행 중인 분쟁 등 구체적인 보존 사유가 있으면 근거와 해제 조건을 기록하고 필요한 범위에서 기간을 연장합니다.</p>
        <p>보존 기간 또는 처리 목적이 끝나면 운영 담당자가 대상과 보존 예외를 확인해 지체 없이 파기합니다. 기간 경과만으로 모든 기록이 자동 삭제되는 방식은 아닙니다. 전자 기록은 복구가 어렵도록 삭제하고, 종이 기록은 분쇄 등으로 폐기합니다. 관련 첨부파일·서명 사본·내보낸 파일도 함께 확인합니다.</p>
        <p>별도 보존이 필요한 기록은 이용 목적과 접근 권한을 제한합니다. 백업은 운영 기록과 구분해 복원 목적에만 사용하고 서비스의 백업 교체·만료 주기에 따라 제거하며, 복원 시 이미 파기한 정보를 다시 업무에 사용하지 않도록 확인합니다. 이용자가 기관 관리 범위 밖으로 공유한 사본은 해당 사본의 보관 주체가 별도로 관리해야 합니다.</p>
      </Section>
      <Section id="providers" title="3. 외부 서비스와 국외 처리">
        <p>앱과 업무 시스템 운영에 다음 서비스를 사용합니다. 서버·저장소 운영은 업무 처리 위탁이며, 알림·업데이트 제공 시에는 기능에 필요한 정보만 전송합니다.</p>
        <dl className="divide-y divide-[var(--border)]">
          <div className="py-3"><dt className="font-semibold">Vercel Inc. — 업무 서버 운영</dt><dd>웹·API 요청에 포함된 업무 정보와 접속 정보. 서버 실행 리전은 대한민국 서울이며, 서비스의 네트워크·운영·지원 과정에서 미국 등 국외 인프라가 사용될 수 있습니다. 업무 기록은 기관 보관 기준을, 서비스 운영 기록은 제공업체의 보존 기준을 따릅니다. 문의: privacy@vercel.com.</dd><dd><a href="https://vercel.com/legal/privacy-notice" className="inline-flex min-h-11 min-w-11 items-center underline underline-offset-4">Vercel 개인정보 안내</a></dd></div>
          <div className="py-3"><dt className="font-semibold">Supabase Pte. Ltd. — 데이터베이스·파일 저장</dt><dd>직원 계정·업무·청소년 기록 및 첨부파일. 주 저장 리전은 대한민국 서울이며, 싱가포르 사업자와 미국 지원 법인 등 서비스 운영·지원 주체가 관여할 수 있습니다. 서비스 이용 중 기관 보관 기준에 따라 보관·삭제하며, 계약 종료 후 반환·삭제는 서비스 계약의 조건을 따릅니다. 문의: privacy@supabase.io.</dd><dd><a href="https://supabase.com/legal/customer-resources/data-processing-addendum" className="inline-flex min-h-11 min-w-11 items-center underline underline-offset-4">Supabase 처리·보존 안내</a></dd></div>
          <div className="py-3"><dt className="font-semibold">650 Industries, Inc. (Expo) — 업무 알림·앱 업데이트</dt><dd>미국 소재 서비스입니다. 알림을 켜면 Expo 알림 토큰, 알림 문구와 문서 또는 알림의 내부 식별자를 알림 발생 시 HTTPS로 전송합니다. 직원 텍스트 채팅 알림의 미리보기에는 보낸 직원 이름과 메시지 앞부분이 포함됩니다. 파일 도착과 다른 업무 알림은 업무 종류를 안내하며 문서 제목·본문이나 첨부파일 내용을 넣지 않습니다. 잠금 화면의 미리보기 표시 여부는 기기 알림 설정에 따릅니다. Expo는 전달 대기 중 알림 정보를 일시 처리하고 Apple APNs(iPhone) 또는 Google FCM(Android)에 전달합니다. 업데이트 요청 시 운영체제와 무작위 식별 토큰, IP 주소 등 통신 정보가 전송되며, 제공업체는 서비스 제공에 필요한 기간 동안 처리합니다. 문의는 Expo 공식 개인정보 안내의 문의 양식으로 접수할 수 있습니다.</dd><dd><a href="https://expo.dev/privacy" className="inline-flex min-h-11 min-w-11 items-center underline underline-offset-4">Expo 개인정보 안내</a></dd></div>
          <div className="py-3"><dt className="font-semibold">Apple Inc.·Google LLC — 기기 알림 전달</dt><dd>미국 소재 사업자의 APNs·FCM이 기기로 알림을 전달하는 과정에서 기기 알림 식별자와 알림 내용을 처리합니다. 보존·삭제 조건은 각 알림 서비스의 정책을 따릅니다.</dd><dd className="flex flex-wrap gap-x-4"><a href="https://www.apple.com/legal/privacy/" className="inline-flex min-h-11 min-w-11 items-center underline underline-offset-4">Apple 개인정보 안내</a><a href="https://policies.google.com/privacy" className="inline-flex min-h-11 min-w-11 items-center underline underline-offset-4">Google 개인정보 안내</a></dd></div>
        </dl>
        <p>국외 처리가 필요한 경우 기관은 적용되는 법적 근거와 고지·동의 요건을 갖추어 처리합니다. 알림은 기기 설정이나 앱의 알림 설정에서 끌 수 있고, 알림을 꺼도 기본 업무 기능을 이용할 수 있습니다. 국외 처리 관련 문의·처리정지 요청은 아래 담당 창구로 접수할 수 있으며, 필수 서버·업데이트 처리를 중단하면 해당 앱 서비스 이용이 제한될 수 있습니다.</p>
      </Section>
      <Section id="sharing" title="4. 제3자 제공과 민감정보·아동 정보">
        <p>기관은 위 업무 목적과 권한 범위에서 정보를 사용합니다. 다른 기관 등에 개인정보를 제공해야 하는 경우 정보주체의 동의 또는 법령상 근거 등 적법한 요건을 확인하고 필요한 최소 범위만 제공합니다. 외부 서비스의 운영 위탁과 제3자 제공은 구분하여 관리합니다.</p>
        <p>상담 내용·결정문·특이사항 등에 건강·범죄경력 등 민감정보가 포함될 수 있습니다. 이러한 정보는 별도 동의 또는 법령상 허용 근거가 있는 업무에 한하여 처리하고, 담당 직원의 접근 권한을 제한합니다. 기관은 업무상 필요와 법적 근거가 없는 주민등록번호 등 고유식별정보를 앱에 입력하지 않도록 관리합니다.</p>
        <p>만 14세 미만 아동의 정보를 동의에 근거하여 처리할 때에는 법정대리인의 동의와 권리 행사 절차를 적용합니다. 아동·보호자는 직원용 앱 계정을 만들 필요 없이 아래 창구로 문의할 수 있습니다.</p>
      </Section>
      <Section id="device" title="5. 기기 저장·접근 권한·쿠키">
        <p>앱은 로그인 토큰과 작성 복구 정보를 기기의 보안 저장소에 저장하고, 문서 표시·첨부를 위한 임시 파일을 사용할 수 있습니다. 로그아웃·인증 만료·계정 변경 시 관련 임시 정보를 정리합니다. 기기에서 앱을 삭제하는 것과 기관 서버의 업무 기록을 삭제하는 것은 별도 절차입니다.</p>
        <p>알림 권한은 결재·직원 채팅·할 일·일정 등 업무 알림에 사용하고, 파일 선택·공유는 이용자가 해당 기능을 실행할 때 사용합니다. 선택 권한을 거부하면 관련 기능이 제한되며 기본 로그인·업무 조회는 이용할 수 있습니다.</p>
        <p>웹 시스템은 로그인 세션 쿠키와 화면 테마 저장을 사용합니다. 브라우저 설정에서 쿠키를 차단·삭제할 수 있으나 로그인 유지가 제한될 수 있습니다. 로그인 유효기간과 개인정보 보관 기간은 서로 다릅니다. 앱은 광고 목적의 추적 기능을 제공하지 않습니다.</p>
      </Section>
      <Section id="security" title="6. 개인정보 보호 조치">
        <p>활성 직원 확인, 역할·업무 권한에 따른 접근 통제, 로그인·감사 기록, 비밀번호 해시, 세션 검증 및 HTTPS 통신을 사용합니다. 기관은 계정·권한을 관리하고 불필요한 정보 입력과 무단 공유를 제한합니다. 운영 담당자는 보관·파기 대상과 서비스 제공업체의 처리 조건을 점검합니다.</p>
      </Section>
      <Section id="rights" title="7. 권리 행사와 담당 창구">
        <p>정보주체 또는 적법한 대리인은 개인정보 열람·정정·삭제·처리정지, 동의 철회 및 개인정보 관련 불만 처리를 요청할 수 있습니다. 만 14세 미만 아동의 법정대리인도 권리를 행사할 수 있습니다.</p>
        <dl><dt className="font-semibold">{mobileAppInfo.privacyContact}</dt><dd><a href={`mailto:${mobileAppInfo.supportEmail}`} className="inline-flex min-h-11 min-w-11 max-w-full items-center break-all underline underline-offset-4">{mobileAppInfo.supportEmail}</a></dd></dl>
        <p>요청 대상과 요청 내용을 보내 주시면 필요한 최소한의 본인·대리권 확인 후 관련 법령에 따라 처리하고 결과를 안내합니다. 최초 문의 이메일에 비밀번호·인증번호·주민등록번호나 청소년 기록 원문을 보내지 마세요. 법령상 보존 의무 등으로 요청을 제한하는 경우 그 이유와 이의 제기 방법을 안내합니다. 직원 계정 이용 종료는 기관의 계정 담당자를 통해 처리합니다.</p>
        <p>개인정보 침해 상담은 개인정보침해 신고센터(국번 없이 118, privacy.kisa.or.kr), 분쟁 조정은 개인정보분쟁조정위원회(kopico.go.kr)에 요청할 수 있습니다.</p>
      </Section>
      <Section id="changes" title="8. 방침 변경">
        <p>이 방침은 2026년 10월 7일부터 적용합니다. 처리 목적·항목·보관 기간·외부 서비스 등 중요한 내용을 변경하면 이 페이지와 업무 시스템 공지 등으로 변경 사항과 적용일을 알리고, 별도 동의가 필요한 변경은 해당 절차를 거칩니다.</p>
      </Section>
      <nav aria-label="관련 페이지" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Link href="/mobile-app/support" className="inline-flex min-h-11 min-w-11 items-center underline underline-offset-4">앱 지원</Link>
        <Link href="/login" className="inline-flex min-h-11 min-w-11 items-center underline underline-offset-4">업무 시스템 로그인</Link>
        <a href="https://youth.bajaul.com/" className="inline-flex min-h-11 min-w-11 items-center underline underline-offset-4">기관 홈페이지</a>
      </nav>
    </article>
  </main>;
}
