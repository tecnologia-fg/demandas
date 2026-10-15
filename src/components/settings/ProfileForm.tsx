"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui/basics";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { useFeedback } from "@/components/ui/overlay";
import { ColorGrid } from "@/components/board/pickers";
import { updateProfile } from "@/app/actions/team";

export function ProfileForm({ id, name: n, color: c, avatarUrl }: { id: string; name: string; color: string; avatarUrl: string | null }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [name, setName] = useState(n);
  const [color, setColor] = useState(c);
  const [saving, setSaving] = useState(false);
  return (
    <div className="grid gap-4">
      <ImageUpload url={avatarUrl} name={name} color={color} target="pessoa" id={id} onChange={() => router.refresh()} />
      {!avatarUrl && (
        <Field group label="Cor das iniciais (sem foto)">
          <ColorGrid value={color} onChange={(v) => v && setColor(v)} size={24} />
        </Field>
      )}
      <Field label="Nome">
        <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div>
        <Button
          variant="primary"
          loading={saving}
          onClick={async () => {
            setSaving(true);
            const res = await updateProfile({ name, color });
            setSaving(false);
            if (!res.ok) return toast(res.error, "error");
            toast("Perfil salvo");
            router.refresh();
          }}
        >
          Salvar
        </Button>
      </div>
    </div>
  );
}
