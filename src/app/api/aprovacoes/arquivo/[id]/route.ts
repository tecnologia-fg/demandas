import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db";
import { getCurrentUser } from "@/server/auth/current";
import { serveApprovalFile } from "@/server/approval-files";

// Arte de aprovação vista pela equipe (logada).
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const f = await db.approvalFile.findUnique({ where: { id: (await ctx.params).id.slice(0, 40) }, select: { storedName: true, mime: true } });
  if (!f) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  return serveApprovalFile(req, f);
}
