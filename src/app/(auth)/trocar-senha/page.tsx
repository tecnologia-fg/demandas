import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current";
import { PasswordForm } from "@/components/auth/PasswordForm";

export const metadata: Metadata = { title: "Criar sua senha" };

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <>
      <h1 className="text-[26px] font-semibold tracking-tight">Crie sua senha</h1>
      <p className="mb-6 mt-1 text-sm text-fg-2">Oi, {user.name.split(" ")[0]}. Troque a senha temporária para começar.</p>
      <PasswordForm submitLabel="Salvar e entrar" />
    </>
  );
}
