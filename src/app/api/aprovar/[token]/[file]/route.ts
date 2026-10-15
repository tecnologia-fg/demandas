import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db";
import { validToken } from "@/server/approvals";
import { serveApprovalFile } from "@/server/approval-files";

// Arte ou vídeo de um post, pelo link do cliente ou do post (sem login). Só serve arquivos de versões
// já enviadas de posts que este link mostra.
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string; file: string }> }) {
  const { token, file } = await ctx.params;
  if (!validToken(token)) return NextResponse.json({ error: "Link inválido." }, { status: 404 });
  const f = await db.approvalFile.findUnique({
    where: { id: file.slice(0, 40) },
    select: { storedName: true, mime: true, approval: { select: { post: { select: { token: true, status: true, client: { select: { approvalToken: true, active: true } } } } } } },
  });
  const post = f?.approval?.post;
  if (!f || !post || post.status === "CANCELED" || !post.client.active || (post.token !== token && post.client.approvalToken !== token)) {
    return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  }
  return serveApprovalFile(req, f);
}
