// Formatos que trafegam do servidor para o navegador (tudo serializável).

export type UserLite = { id: string; name: string; color: string; initials: string; avatarUrl?: string | null };
export type LabelLite = { id: string; name: string; color: string };
export type ClientLite = { id: string; name: string; color: string; imageUrl?: string | null };

export type ColumnData = {
  id: string;
  name: string;
  color: string | null;
  position: number;
  isDone: boolean;
  wipLimit: number;
};

export type CardSummary = {
  id: string;
  number: number;
  title: string;
  boardId: string;
  columnId: string;
  position: number;
  priority: string | null;
  startDate: string | null; // AAAA-MM-DD
  dueDate: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  coverColor: string | null;
  /** anexo de imagem usado como capa */
  coverImageId: string | null;
  repeatEvery: string | null;
  clientId: string | null;
  hasDescription: boolean;
  assigneeIds: string[];
  labelIds: string[];
  checklist: { done: number; total: number };
  commentCount: number;
  attachmentCount: number;
  timerRunning: boolean;
  /** Situação do post de aprovação ligado à demanda */
  approval: ApprovalStatus | null;
  createdAt: string;
};

/** Situação do post: com o cliente, ajuste pedido, aprovado, publicado. */
export type ApprovalStatus = "PENDING" | "APPROVED" | "CHANGES" | "PUBLISHED";
export type ApprovalFormat = "IMAGEM" | "CARROSSEL" | "REELS" | "STORIES" | "VIDEO" | "TEXTO";
export type ApprovalMedia = { id: string; name: string; video: boolean };
/** Uma versão enviada ao cliente. */
export type ApprovalRound = {
  id: string;
  round: number;
  status: "PENDING" | "APPROVED" | "CHANGES" | "CANCELED";
  format: ApprovalFormat;
  caption: string | null;
  note: string | null;
  media: ApprovalMedia[];
  sentAt: string;
  sentBy: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  clientComment: string | null;
  /** O que o cliente marcou para ajustar: "1", "2"... (artes) e "legenda" */
  changeTargets: string[];
};
export type ApprovalMessage = { id: string; author: "CLIENT" | "TEAM"; name: string; body: string; createdAt: string };
/** Post de aprovação completo (equipe). Rodadas da mais nova para a mais antiga. */
export type ApprovalPostView = {
  id: string;
  token: string;
  title: string;
  format: ApprovalFormat;
  status: ApprovalStatus | "CANCELED";
  publishAt: string | null;
  createdAt: string;
  updatedAt: string;
  client: { id: string; name: string; color: string; imageUrl: string | null; token: string | null };
  card: { id: string; number: number; boardId: string; boardName: string } | null;
  rounds: ApprovalRound[];
  messages: ApprovalMessage[];
};

export type BoardData = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  clientId: string | null;
  favorite: boolean;
  columns: ColumnData[];
  cards: CardSummary[];
};

export type CardDetail = CardSummary & {
  description: string | null;
  estimatedMin: number | null;
  boardName: string;
  columnName: string;
  boardColumns: { id: string; name: string; color: string | null; isDone: boolean }[];
  createdBy: UserLite | null;
  checklists: { id: string; title: string; items: { id: string; text: string; done: boolean }[] }[];
  comments: { id: string; body: string; createdAt: string; editedAt: string | null; user: UserLite }[];
  attachments: { id: string; name: string; mime: string; size: number; createdAt: string; uploadedBy: string | null }[];
  activities: { id: string; type: string; data: Record<string, string>; createdAt: string; user: UserLite | null }[];
  timeSpentMin: number;
  myTimerStartedAt: string | null;
  /** Post de aprovação desta demanda (null = nunca enviada ao cliente) */
  approvalPost: ApprovalPostView | null;
};

/** Post como o cliente vê no link: só a versão atual e a conversa. */
export type PortalPost = {
  id: string;
  title: string;
  format: ApprovalFormat;
  status: ApprovalStatus;
  publishAt: string | null;
  round: number;
  caption: string | null;
  note: string | null;
  media: ApprovalMedia[];
  sentAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  clientComment: string | null;
  changeTargets: string[];
  messages: ApprovalMessage[];
};
