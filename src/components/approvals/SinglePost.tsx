"use client";

import { useState } from "react";
import type { PortalPost } from "@/lib/types";
import { NameModal, TopBar, useApproverName } from "./ApprovalPortal";
import { Review } from "./Review";
import { ClientMark } from "./ui";

/** Página de um post só (link do post). */
export function SinglePost({ token, client, post }: { token: string; client: { name: string; color: string; imageUrl: string | null }; post: PortalPost }) {
  const name = useApproverName();
  const [editName, setEditName] = useState(false);
  return (
    <div className="min-h-dvh pb-10">
      <TopBar name={name} onEdit={() => setEditName(true)} />
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-4 flex items-center gap-3">
          <ClientMark client={client} size={40} round />
          <div className="min-w-0">
            <p className="truncate font-semibold">{client.name}</p>
            <p className="text-sm text-fg-3">{post.status === "PENDING" ? "Este post espera a sua aprovação" : "Post para aprovação"}</p>
          </div>
        </div>
        <div className="overflow-hidden rounded-[32px] bg-surface shadow-md md:h-[min(780px,calc(100dvh-140px))]">
          <Review token={token} post={post} client={client} name={name} onName={() => {}} />
        </div>
      </div>
      {editName && <NameModal initial={name} onClose={() => setEditName(false)} />}
    </div>
  );
}
