import type { Metadata } from "next";
import { requireUser } from "@/server/auth/current";
import { PageHeader } from "@/components/PageHeader";
import { ProfileForm } from "@/components/settings/ProfileForm";
import { PasswordForm } from "@/components/auth/PasswordForm";
import { AccentPicker } from "@/components/settings/AccentPicker";
import { GlassSlider } from "@/components/ui/GlassSlider";

export const metadata: Metadata = { title: "Meu perfil" };

export default async function ProfilePage() {
  const user = await requireUser();
  return (
    <div className="pb-10">
      <PageHeader title="Meu perfil" subtitle={user.email} />
      <div className="grid max-w-5xl gap-4 px-4 lg:grid-cols-2 lg:px-6">
        <section className="glass grid content-start gap-4 rounded-[26px] p-5">
          <h2 className="text-lg font-semibold">Seus dados</h2>
          <ProfileForm id={user.id} name={user.name} color={user.color} avatarUrl={user.avatarUrl} />
        </section>
        <section className="glass grid content-start gap-5 rounded-[26px] p-5 lg:col-span-2">
          <div>
            <h2 className="text-lg font-semibold">Aparência</h2>
            <p className="text-sm text-fg-2">Só para você. O logo continua verde-água.</p>
          </div>
          <div className="grid gap-2">
            <h3 className="text-sm font-semibold">Vidro</h3>
            <p className="-mt-1 text-xs text-fg-3">Arraste para deixar a tela mais lisa ou mais transparente.</p>
            <div className="max-w-md">
              <GlassSlider initial={user.glassLevel} />
            </div>
          </div>
          <div className="grid gap-2">
            <h3 className="text-sm font-semibold">Cor do sistema</h3>
            <AccentPicker current={user.accentColor} />
          </div>
        </section>
        <section className="glass grid content-start gap-4 rounded-[26px] p-5">
          <h2 className="text-lg font-semibold">Trocar senha</h2>
          <PasswordForm />
        </section>
      </div>
    </div>
  );
}
