import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { LoginForm } from "@/components/login-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCurrentUser } from "@/lib/auth";
import { appName, organizationName } from "@/lib/branding";

export const metadata: Metadata = {
  title: "로그인",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/");
  }

  return (
    <main className="relative grid min-h-screen place-items-center bg-[#f6f7f9] px-4 py-10 text-[#16181d]">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <section className="w-full max-w-md rounded-md border border-[#d9dee7] bg-white p-6 shadow-sm">
        <div className="flex items-center">
          <div>
            <h1 className="text-xl font-semibold">{appName} 로그인</h1>
            <p className="mt-1 text-sm text-[#697386]">
              {organizationName}
            </p>
          </div>
        </div>

        <LoginForm />

        <div className="mt-6 rounded-md bg-[#f7f9fc] px-4 py-3 text-center text-sm leading-6 text-[#697386]">
          <p>초기비밀번호는 숫자 0000</p>
        </div>
      </section>
    </main>
  );
}
