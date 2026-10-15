import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current";
import { isSetupOpen } from "@/server/setup";
import { AuthTabs } from "@/components/auth/AuthTabs";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; aba?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const { next, aba } = await searchParams;
  const setupOpen = await isSetupOpen();
  return <AuthTabs next={typeof next === "string" ? next : ""} setupOpen={setupOpen} initialTab={aba === "primeiro-acesso" ? "primeiro" : "entrar"} />;
}
