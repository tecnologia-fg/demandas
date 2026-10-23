import { requireAdminPage } from "@/server/auth/current";
import { db } from "@/server/db";
import { labelReviewState } from "@/server/trello-label-review";
import { TrelloLabelReview } from "@/components/settings/TrelloLabelReview";

export const metadata = { title: "Revisar etiquetas do Trello" };
export default async function TrelloLabelsPage() {
  await requireAdminPage();
  const [state, latest] = await Promise.all([labelReviewState(), db.importBatch.findFirst({ where: { source: "trello-label-review", status: "APPLIED" }, orderBy: { startedAt: "desc" }, select: { id: true } })]);
  return <TrelloLabelReview groups={state.groups} labels={state.labels} fingerprint={state.fingerprint} latestReview={latest?.id ?? null} />;
}
