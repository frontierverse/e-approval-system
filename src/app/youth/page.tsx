import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "청소년 관리",
};

export default function YouthPage() {
  redirect("/youth/roster");
}
