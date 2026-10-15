# Arquitetura do Dmanda

Este guia explica como o sistema funciona por dentro, pasta por pasta e arquivo por arquivo. Use junto com
a sua IA de programação: quando quiser mudar alguma coisa, ache aqui o arquivo certo e peça a mudança apontando para ele.

## 1. Visão geral

O Dmanda é um sistema de demandas da equipe em quadros kanban, com aprovação de posts pelo cliente.

| Peça | Tecnologia | Onde fica |
|---|---|---|
| Telas e servidor | Next.js 16 (App Router), React 19 | `src/app`, `src/components` |
| Regras de negócio no servidor | Server actions do Next.js | `src/app/actions` |
| Banco de dados | Prisma 6.19.3 + SQLite (um arquivo) | `prisma/schema.prisma`, arquivo `prisma/*.db` |
| Arquivos enviados | Disco local | pasta `storage/` (criada sozinha no primeiro envio) |
| Estilo | Tailwind CSS v4 + variáveis CSS | `src/app/globals.css` |
| Arrastar e soltar | dnd-kit | `src/components/board` |
| Texto formatado | Tiptap (navegador) + sanitize-html (servidor) | `src/components/editor/RichEditor.tsx`, `src/server/richtext.ts` |
| Validação | zod | em todas as actions |
| Sessão | JWT com a biblioteca jose, em cookie httpOnly | `src/server/auth/session.ts` |
| Ícones | lucide-react | componentes |

Caminho de uma ação típica (mover uma demanda):

1. A pessoa arrasta o card na tela (`src/components/board/BoardView.tsx`).
2. A tela chama a server action `moveCard` (`src/app/actions/cards.ts`).
3. A action confere a sessão (`assertUser`), valida os dados com zod, grava no banco numa transação, registra o
   histórico (`logActivity`) e avisa os responsáveis (`notify`).
4. A action chama `publishBoard`, que solta um evento no barramento em memória (`src/server/live.ts`).
5. A rota `/api/ao-vivo` repassa o evento para todos os navegadores conectados.
6. Quem está com o quadro aberto recarrega os dados do quadro (`getBoardSnapshot`).

## 2. Estrutura de pastas

```text
.
├── .env.example            variáveis de ambiente de exemplo (copiar para .env)
├── package.json            dependências e scripts (dev, build, start, db:push, db:seed, db:reset)
├── tsconfig.json           TypeScript; o atalho @/ aponta para src/
├── eslint.config.mjs       regras do ESLint
├── postcss.config.mjs      liga o Tailwind v4
├── prisma/
│   ├── schema.prisma       todas as tabelas do banco
│   └── seed.ts             dados de demonstração (fictícios)
├── public/marca/           logotipos em SVG (gerados por scripts/brand/build-logo.mjs)
├── scripts/
│   ├── demo-completo.ts    demonstração maior, roda depois do seed (fictícia)
│   ├── brand/build-logo.mjs   gera os SVGs da marca e src/lib/brand-metrics.json
│   ├── checks/contraste.ts    confere o contraste de texto sobre todas as cores da paleta
│   └── e2e/simulacao.ts       teste de ponta a ponta com navegador (playwright-core)
└── src/
    ├── proxy.ts            porteiro de todas as requisições (antigo middleware)
    ├── app/                páginas, rotas de API e server actions
    ├── components/         componentes de tela (React, rodam no navegador)
    ├── lib/                funções e constantes usadas no servidor e no navegador
    └── server/             código que só roda no servidor (banco, sessão, arquivos, eventos)
```

Pastas criadas ao usar, que não vão para o git: `node_modules/`, `.next/`, `storage/`, `prisma/*.db`, `.env`.

### 2.1 `src/app`: páginas e rotas

Os nomes entre parênteses, como `(app)` e `(auth)`, são grupos do Next.js: organizam o código mas não aparecem no endereço.

| Arquivo | Endereço | O que faz |
|---|---|---|
| `layout.tsx` | todas | HTML base, fontes Geist, tema claro ou escuro (cookie `demanda_theme`), cor do sistema e nível de vidro da pessoa logada. |
| `globals.css` | todas | Tokens de cor (`--bg`, `--accent`, `--fg` e outros) para tema claro e escuro, vidro fosco, manchas de fundo. |
| `icon.svg` | `/icon.svg` | Ícone da aba do navegador. |
| `(auth)/layout.tsx` | | Moldura das telas de entrada. |
| `(auth)/login/page.tsx` | `/login` | Abas Entrar e Primeiro acesso (esta só aparece enquanto o primeiro acesso estiver aberto). |
| `(auth)/trocar-senha/page.tsx` | `/trocar-senha` | Troca obrigatória da senha temporária. |
| `(app)/layout.tsx` | área logada | Exige login (`requireUser`), carrega quadros, pastas, favoritos e contagem de notificações, e monta o `Shell` (menu). |
| `(app)/page.tsx` | `/` | Início: minhas demandas por prazo, concluídas na semana, favoritos e atividade recente. |
| `(app)/quadros/page.tsx` | `/quadros` | Grade de quadros com pastas, favoritos e arquivados. |
| `(app)/quadros/[id]/page.tsx` | `/quadros/ID` | Um quadro (visões Quadro, Lista e Calendário). Abre uma demanda com `?demanda=ID`. |
| `(app)/agenda/page.tsx` | `/agenda` | Calendário de todos os quadros (prazos de 6 meses atrás a 1 ano à frente, e as abertas sem prazo). |
| `(app)/aprovacoes/page.tsx` | `/aprovacoes` | Painel de aprovações de posts por situação. |
| `(app)/clientes/page.tsx` | `/clientes` | Lista de clientes. |
| `(app)/clientes/[id]/page.tsx` | `/clientes/ID` | Detalhe do cliente: dados, demandas e quadros ligados. |
| `(app)/configuracoes/page.tsx` | `/configuracoes` | Abas Equipe, Etiquetas, Modelos, Marca e Registro (registro só para admin). Abre uma aba com `?aba=`. |
| `(app)/perfil/page.tsx` | `/perfil` | Nome, cor, foto, cor do sistema, vidro e troca de senha. |
| `compartilhado/[token]/page.tsx` | `/compartilhado/TOKEN` | Quadro público só de leitura (sem comentários, anexos nem histórico). |
| `aprovar/[token]/page.tsx` | `/aprovar/TOKEN` | Portal do cliente: todos os posts dele (publicados ficam visíveis por 30 dias). |
| `aprovar/p/[token]/page.tsx` | `/aprovar/p/TOKEN` | Página de um post só, para mandar no WhatsApp. |

Rotas de API (`src/app/api`), usadas para envio e leitura de arquivos e para o tempo real:

| Rota | Método | O que faz | Login |
|---|---|---|---|
| `/api/anexos` | POST | Envia anexo de uma demanda (até 25 MB, lista branca de extensões). | Sim |
| `/api/anexos/[id]` | GET | Baixa ou mostra o anexo. `?baixar` força download. | Sim |
| `/api/imagens` | POST | Foto de perfil da pessoa (`alvo=pessoa`) ou do cliente (`alvo=cliente`). `remover=1` tira a foto. | Sim |
| `/api/imagens/[nome]` | GET | Serve a foto. | Sim |
| `/api/aprovacoes/arquivo` | POST | Envia arte ou vídeo para um post antes de mandar ao cliente. | Sim |
| `/api/aprovacoes/arquivo/[id]` | GET | A equipe vê a arte. | Sim |
| `/api/aprovar/[token]/[file]` | GET | O cliente vê a arte pelo link (só de posts que aquele link mostra). | Não, usa o token |
| `/api/ao-vivo` | GET | Conexão de tempo real (Server-Sent Events). | Sim |

### 2.2 `src/app/actions`: server actions

Server actions são funções que rodam no servidor mas são chamadas direto pelos componentes, como se fossem funções comuns.
Todo arquivo começa com `"use server"`.

| Arquivo | Funções principais |
|---|---|
| `auth.ts` | `login`, `logout`, `changePassword`, `firstAccess` |
| `boards.ts` | `createBoard` (com modelos), `updateBoard`, `archiveBoard`, `deleteBoard` (exige digitar o nome), `toggleFavorite`, `reorderBoards`, `getBoardSnapshot`, `listBoardsForMove`, `listArchivedCards`, `duplicateBoard`, `saveBoardTemplate`, `listBoardTemplates`, `deleteBoardTemplate`, `archiveColumnCards` |
| `columns.ts` | `createColumn`, `updateColumn` (nome, cor, concluída, limite), `reorderColumns`, `deleteColumn` (move as demandas antes) |
| `cards.ts` | `createCard`, `moveCard`, `toggleComplete`, `updateCard`, `setAssignees`, `setClient`, `setLabels`, `archiveCard`, `deleteCard`, `duplicateCard`, `moveCardToBoard`, `getCardDetail`, `findCardByNumber` |
| `card-extras.ts` | comentários (`addComment`, `editComment`, `deleteComment`), checklists e itens, cronômetro (`startTimer`, `stopTimer`), `deleteAttachment` |
| `folders.ts` | `createFolder`, `updateFolder`, `deleteFolder`, `moveBoardToFolder`, `setBoardColor` |
| `clients.ts` | `createClient`, `updateClient`, `setClientActive` (arquivar), `deleteClient` |
| `team.ts` | equipe (`createUser`, `updateUser`, `resetUserPassword`), etiquetas, perfil (`updateProfile`, `setAccentColor`, `setGlassLevel`) |
| `templates.ts` | modelos de demanda: `listTemplates`, `saveTemplate`, `templateFromCard`, `deleteTemplate` |
| `share.ts` | link público do quadro: `getShareLink`, `createShareLink`, `revokeShareLink` |
| `approvals.ts` | lado da equipe na aprovação de posts |
| `approval-public.ts` | lado do cliente (sem login): `decideApproval`, `approveAll`, `sendClientMessage` |
| `notifications.ts` | `listNotifications`, `unreadCount`, `markRead` |
| `search.ts` | `searchCards` (busca global do atalho Ctrl+K ou Cmd+K) |

### 2.3 `src/server`: só servidor

Todos começam com `import "server-only"`, o que impede que sejam usados por engano no navegador.

| Arquivo | O que faz |
|---|---|
| `db.ts` | Uma instância só do PrismaClient (reaproveitada no modo dev). |
| `action.ts` | `run()`, `fail()` e os validadores `id` e `hex`. Ver seção 5. |
| `auth/session.ts` | Cria, lê e apaga o cookie de sessão (JWT HS256, 7 dias). |
| `auth/current.ts` | `getCurrentUser`, `requireUser`, `requireAdminPage`, `assertUser`, `assertAdmin`, `ActionError`. |
| `auth/password.ts` | `hashPassword` e `verifyPassword` com scrypt, `temporaryPassword`. |
| `setup.ts` | Controle do Primeiro acesso (`isSetupOpen`, chave `setupCompletedAt`) e sufixo `@demanda.local` das contas de exemplo. |
| `events.ts` | `logActivity` (histórico), `notify` (notificações), `audit` (registro administrativo), `nextCardNumber`. |
| `live.ts` | Barramento de eventos em memória: `publish`, `publishBoard`, `subscribe`. |
| `board.ts` | `loadBoard`: quadro com colunas e demandas no formato da tela. |
| `serialize.ts` | Converte linhas do banco para os tipos da tela (`toCardSummary`, `toUserLite`). |
| `lookups.ts` | Equipe ativa, etiquetas e clientes (usados em quase toda tela). |
| `richtext.ts` | Limpeza do HTML de descrições e comentários, extração de menções. |
| `storage.ts` | Pasta `storage/`, limite de 25 MB, lista branca de extensões, nome seguro do arquivo. |
| `images.ts` | Fotos de perfil em `storage/imagens`, detecção do tipo real pelo conteúdo, limite de 5 MB. |
| `approvals.ts` | Regras da aprovação: tokens, colunas de aprovação do quadro, cópia de arquivos, montagem dos dados para a equipe e para o cliente, limpeza de arquivos não usados. |
| `approval-files.ts` | Entrega de arte e vídeo com suporte a Range (o vídeo pula para qualquer ponto no celular). |
| `rate-limit.ts` | Limite de tentativas em memória (janela deslizante) e leitura do IP. |

### 2.4 `src/lib`: compartilhado entre servidor e navegador

| Arquivo | O que tem |
|---|---|
| `domain.ts` | Prioridades (`PRIORITY_META`), repetições, paletas de cor (`PALETTE`, `EXTRA_PALETTE`), textos do histórico (`ACTIVITY_TEXT`), formatos e situações da aprovação (`APPROVAL_META`). |
| `types.ts` | Tipos que viajam do servidor para a tela (`CardSummary`, `BoardData`, `CardDetail`, tipos da aprovação). |
| `dates.ts` | Datas como "dia" (AAAA-MM-DD), sem pular dia por causa do fuso. |
| `color.ts` | Contraste de leitura (APCA): escolhe texto claro ou escuro sobre cada cor (`shapeColors`, `readableOn`). |
| `accent.ts` | Cor do sistema por pessoa: gera os tons de destaque a partir de uma cor (`accentCss`). |
| `cn.ts` | Junta classes CSS. |
| `brand-metrics.json` | Medidas do logotipo (geradas pelo script da marca). |

### 2.5 `src/components`: telas

| Pasta | Componentes |
|---|---|
| `shell/` | `Shell.tsx` (menu lateral no computador, menu no topo no celular, tema, conta), `NotificationBell.tsx`, `SearchDialog.tsx` |
| `board/` | `BoardView.tsx` (quadro inteiro, arrastar e soltar, tempo real), `ColumnView.tsx`, `CardTile.tsx` (card no quadro), `CardModal.tsx` (demanda aberta), `ListView.tsx`, `CalendarView.tsx`, `FilterPanel.tsx` e `filters.ts`, `pickers.tsx` (escolher responsáveis, etiquetas, cliente, datas), `BoardModals.tsx` (duplicar e salvar como modelo), `lookups.tsx` (contexto com equipe, etiquetas e clientes) |
| `boards/` | `BoardsGrid.tsx` (tela de Quadros, pastas e criação de quadro) |
| `home/` | `HomeView.tsx` (Início), `AgendaView.tsx` |
| `approvals/` | `ApprovalsView.tsx` (painel da equipe), `Composer.tsx` (montar e enviar um post), `PostInspector.tsx` (detalhe do post), `ApprovalSection.tsx` (bloco de aprovação dentro da demanda), `ApprovalPortal.tsx` (portal do cliente), `SinglePost.tsx`, `Review.tsx` (arte, legenda, conversa e decisão), `targets.ts`, `ui.tsx` |
| `clients/` | `ClientsView.tsx`, `ClientDetail.tsx` |
| `settings/` | `SettingsView.tsx` (abas), `TemplatesTab.tsx`, `ProfileForm.tsx`, `AccentPicker.tsx`, `BrandManual.tsx` |
| `share/` | `ShareModal.tsx` (gerar link), `SharedBoard.tsx` (quadro público) |
| `auth/` | `AuthTabs.tsx`, `LoginForm.tsx`, `PasswordForm.tsx` |
| `editor/` | `RichEditor.tsx` (Tiptap com negrito, listas, tarefas, links, destaque e @menção) |
| `live/` | `LiveProvider.tsx` e `LiveRefresh.tsx` (tempo real) |
| `ui/` | `basics.tsx` (botão, campo, input), `overlay.tsx` (modal, popover, avisos, confirmação), `ImageUpload.tsx`, `GlassSlider.tsx` |
| raiz | `Logo.tsx` (logotipo desenhado em SVG, nome `BRAND`), `PageHeader.tsx` |

## 3. Modelo de dados (`prisma/schema.prisma`)

Ids são `cuid()` em texto. Campos de "tipo" (papel, prioridade, situação) são texto com valores fixos documentados no
comentário do campo, porque o SQLite não tem enum. Campos JSON são guardados como texto.

### Pessoas e acesso

**User**: pessoa da equipe.
- `email` único, `passwordHash` (scrypt, formato `sal:hash`).
- `role`: `ADMIN` ou `MEMBER`.
- `color` (avatar), `accentColor` (cor do sistema escolhida, null usa o verde-água), `avatarUrl`, `glassLevel` (0 a 100).
- `active`: desativar derruba a sessão.
- `mustChangePassword`: obriga a trocar a senha temporária.
- `sessionsValidFrom`: sessões emitidas antes desta data deixam de valer (troca de senha, desativação, mudança de papel).
- `lastLoginAt`.

**AuditLog**: registro de ações administrativas (`action`, `detail`, `actorId`). Aparece em Configurações, Registro.

**AppSetting**: chave e valor da instalação. Hoje guarda `setupCompletedAt` (Primeiro acesso já feito) e `demoCompletoAt` (demonstração aplicada).

### Quadros

**Board**: quadro.
- `name`, `description`, `color`, `position` (ordem na tela), `archivedAt`.
- `clientId`: cliente padrão (demanda nova criada no quadro já nasce com ele).
- `shareToken` e `shareCreatedAt`: link público só de leitura.
- `folderId`: pasta opcional.

**BoardFolder**: pasta que agrupa quadros na tela de Quadros. Apagar a pasta solta os quadros, não apaga.

**BoardFavorite**: quadro favorito de cada pessoa (chave `userId` + `boardId`).

**Column**: coluna do quadro.
- `position`, `color`.
- `isDone`: coluna de concluídas. Entrar nela conclui a demanda; sair reabre.
- `wipLimit`: limite de demandas (0 = sem limite). Só avisa, não bloqueia.

**BoardTemplate**: modelo de quadro salvo pela equipe. `columns` e `cards` são JSON.

### Demandas

**Card**: demanda.
- `number`: número sequencial único (#123) para citar em conversa.
- `title`, `description` (HTML limpo), `priority` (`LOW`, `MEDIUM`, `HIGH`, `URGENT`).
- `startDate`, `dueDate` (meia-noite UTC do dia), `completedAt`, `archivedAt`.
- `coverColor` (capa de cor) e `coverAttachmentId` (capa com imagem de um anexo).
- `estimatedMin` (estimativa em minutos).
- `repeatEvery` (`DAILY`, `WEEKLY`, `MONTHLY`) e `repeatSpawned` (já gerou a próxima).
- `position` (ordem na coluna), `boardId`, `columnId`, `createdById`, `clientId`.

**CardAssignee**: responsáveis (pessoa x demanda).

**Label** e **CardLabel**: etiquetas da equipe (valem para todos os quadros) e a ligação com as demandas.

**Checklist** e **ChecklistItem**: listas de tarefas dentro da demanda, com `done` e `position`.

**Comment**: comentário em HTML limpo, com `editedAt`. Menções viram notificação.

**Attachment**: anexo. `name` é o nome original; `storedName` é o nome aleatório no disco; `mime` e `size`.

**Activity**: histórico da demanda. `type` (created, moved, completed, due, priority e outros) e `data` em JSON.
Os textos que aparecem na tela estão em `ACTIVITY_TEXT` (`src/lib/domain.ts`).

**TimeEntry**: cronômetro. Enquanto roda, `endedAt` é null.

**CardTemplate**: modelo de demanda (título, texto, prioridade, estimativa, etiquetas e checklist em JSON).

### Clientes e aprovação

**Client**: cliente da equipe.
- `name`, `contact`, `email`, `phone`, `notes`, `color`, `imageUrl` (logo), `active` (arquivado ou não).
- `approvalToken`: link do portal de aprovação do cliente.

**ApprovalPost**: um post ou peça para o cliente aprovar.
- `token`: link só deste post.
- `title`, `format` (`IMAGEM`, `CARROSSEL`, `REELS`, `STORIES`, `VIDEO`, `TEXTO`).
- `status`: `PENDING`, `CHANGES`, `APPROVED`, `PUBLISHED`, `CANCELED` (arquivado).
- `publishAt`: data prevista de publicação.
- `clientId`, `cardId` (opcional, único: uma demanda tem no máximo um post), `createdById`.

**Approval**: uma versão enviada (rodada).
- `round` (1, 2, 3...), `status` (`PENDING`, `APPROVED`, `CHANGES`, `CANCELED` quando substituída).
- `caption` (legenda), `note` (recado para o cliente).
- `decidedAt`, `decidedBy` (nome que o cliente digitou), `clientComment`, `changeTargets` (JSON com as artes e a legenda marcadas para ajustar).

**ApprovalFile**: arte ou vídeo de uma versão, com cópia própria do arquivo. Sem `approvalId`, é um envio
ainda não usado (some depois de 1 dia).

**ApprovalMessage**: conversa do post. `author` é `CLIENT` ou `TEAM`.

### Notificações

**Notification**: aviso para uma pessoa. `type`, `text`, `readAt`, `actorId` (quem causou), `cardId`.
Ver seção 10.

## 4. Autenticação e sessão

Arquivos: `src/server/auth/*`, `src/app/actions/auth.ts`, `src/proxy.ts`, `src/server/setup.ts`.

- **Senha**: scrypt com sal aleatório de 16 bytes, comparação em tempo constante (`timingSafeEqual`).
- **Login** (`login`): valida com zod, confere limites (8 erros por e-mail e 30 por IP a cada 15 minutos, só os
  erros contam), compara com um hash falso quando o e-mail não existe (não revela quem tem conta), grava
  `lastLoginAt` e cria a sessão. Redireciona para `?next=` só se for caminho interno.
- **Sessão**: JWT assinado com `SESSION_SECRET` (HS256), validade de 7 dias, em cookie `httpOnly`, `sameSite=lax`.
  Em produção o cookie se chama `__Host-demanda_session` e é `secure` (exige HTTPS). Em desenvolvimento, `demanda_session`.
- **Usuário atual** (`auth/current.ts`): a cada requisição o usuário é relido no banco (com `cache` do React,
  uma leitura por requisição). Conta inativa, ou sessão emitida antes de `sessionsValidFrom`, derruba o acesso na hora.
- **Páginas** usam `requireUser()` (redireciona para `/login` ou `/trocar-senha`) e `requireAdminPage()`.
- **Actions e rotas** usam `assertUser()` e `assertAdmin()`, que lançam erro em vez de redirecionar.
- **Primeiro acesso** (`firstAccess`): cria a conta ADMIN e grava `setupCompletedAt` na mesma transação. Se duas
  pessoas tentarem juntas, só a primeira consegue. Pode desativar as contas `@demanda.local` no mesmo passo.
- **Equipe** (`team.ts`): só admin cria pessoas. A senha temporária aparece uma vez na tela e a pessoa é obrigada
  a trocar. O sistema impede ficar sem nenhum administrador ativo.
- **Troca de senha**: exige a senha atual, mínimo de 8 caracteres, derruba as outras sessões e cria uma nova.

## 5. Server actions e o padrão run() / assertUser

Toda action segue o mesmo formato:

```ts
export async function updateColumn(columnId: string, patch: z.input<typeof columnPatch>) {
  return run(async () => {
    const user = await assertUser();          // 1. quem está pedindo (lança erro se não estiver logado)
    const data = columnPatch.parse(patch);    // 2. valida a entrada com zod
    const c = await db.column.update(...);    // 3. grava no banco
    publishBoard(c.boardId, user.id);         // 4. avisa as telas abertas
  });
}
```

O `run()` (`src/server/action.ts`) devolve sempre `{ ok: true, data }` ou `{ ok: false, error }`:

- `ActionError` (lançado por `fail("mensagem")`, `assertUser`, `assertAdmin`) vira a mensagem para a pessoa.
- Erro do zod vira a primeira mensagem de validação.
- Redirecionamento do Next.js passa direto.
- Qualquer outro erro é registrado no console do servidor e a pessoa vê "Não deu certo agora. Tente de novo."

Na tela, o componente confere `res.ok` e mostra `res.error` num aviso. Assim nenhuma action derruba a página.

Validadores prontos: `id` (texto de 1 a 40 caracteres) e `hex` (cor `#RRGGBB`).

Regra de permissão: toda pessoa logada trabalha nas demandas, colunas, quadros, clientes, pastas e etiquetas.
Só ADMIN arquiva e exclui quadro, exclui etiqueta, arquiva e exclui cliente, cria link público de quadro,
troca o link de aprovação do cliente e gerencia a equipe.

## 6. Tempo real (SSE e publishBoard)

Arquivos: `src/server/live.ts`, `src/app/api/ao-vivo/route.ts`, `src/components/live/*`.

1. As actions chamam `publishBoard(boardId, actorId, cardId)` depois de mudar algo, ou `notify()` cria
   notificações e publica um evento `notification`.
2. `live.ts` é um `EventEmitter` guardado em `globalThis` (um por processo).
3. `/api/ao-vivo` abre uma conexão Server-Sent Events por aba logada, repassa os eventos de quadro para todos e os
   de notificação só para a pessoa certa. Manda um batimento a cada 25 segundos para a conexão não cair.
4. No navegador, `LiveProvider` (dentro do `Shell`) abre um `EventSource` só e distribui os eventos com `useLive`.
5. Quem reage:
   - `BoardView`: se o evento é do quadro aberto, busca `getBoardSnapshot` (espera terminar um arraste antes). Também recarrega a cada 60 segundos por segurança.
   - `CardModal`: recarrega a demanda aberta se outra pessoa mexeu nela.
   - `NotificationBell`: atualiza o contador.
   - `LiveRefresh`: nas telas de resumo (Início, Agenda, Quadros, Clientes) faz `router.refresh()`.
6. Ao voltar a internet ou a aba ficar visível, as telas recarregam (podem ter perdido eventos).

O evento não leva dados, só avisa "recarregue". Limitação: funciona com um processo só. Com várias instâncias
seria preciso trocar o barramento por Redis mantendo `publish` e `subscribe`.

## 7. Quadros, colunas, demandas, pastas e cores

**Quadros** (`boards.ts`, `BoardsGrid.tsx`, `BoardView.tsx`)
- Modelos de partida em `TEMPLATES` dentro de `src/app/actions/boards.ts`: `basico`, `conteudo`, `sprint` e `vazio`.
  Também dá para salvar um quadro como modelo (`BoardTemplate`), com ou sem as demandas, e duplicar um quadro.
- Quem cria o quadro já o recebe como favorito. Favoritos aparecem no menu e no Início.
- Arquivar esconde o quadro; excluir exige digitar o nome e apaga tudo dele.
- Três visões: Quadro (`ColumnView`), Lista (`ListView`) e Calendário (`CalendarView`, arrastar para outro dia muda o prazo). Filtros em `FilterPanel` e `filters.ts`.

**Colunas** (`columns.ts`)
- Criar, renomear, colorir, reordenar, marcar como coluna de concluídas e definir limite.
- Excluir coluna com demandas pede uma coluna de destino. As demandas nunca são apagadas junto.
- "Arquivar todas" de uma coluna: `archiveColumnCards`.

**Demandas** (`cards.ts`, `card-extras.ts`, `CardModal.tsx`, `CardTile.tsx`)
- Criar no topo ou no fim da coluna, com prazo, responsáveis, cliente e modelo.
- `moveCard` reescreve a ordem da coluna de destino e aplica a regra de concluídas.
- Repetição: ao concluir uma demanda que repete, nasce a próxima na primeira coluna não concluída, com datas
  avançadas em 1 dia, 7 dias ou 1 mês (31/01 vira 28/02), mesmos responsáveis, etiquetas e checklist.
- Duplicar, mover para outro quadro, arquivar, restaurar, excluir.
- Comentários com @menção, checklists com progresso, cronômetro, anexos até 25 MB, histórico.
- Início antes do prazo é validado (`O início não pode ser depois do prazo`).

**Capa com imagem**: na demanda, um anexo de imagem (JPG, PNG, WebP, GIF; não PSD nem HEIC) pode virar capa
(`coverAttachmentId`). O `CardTile` mostra a imagem por `/api/anexos/ID`. Também existe capa só de cor (`coverColor`).
Se o anexo for apagado, a capa some sozinha (`onDelete: SetNull`).

**Pastas** (`folders.ts`): só organizam a tela de Quadros. Pastas fechadas ficam lembradas no navegador.

**Cores**
- Paletas em `src/lib/domain.ts`: `PALETTE` (família verde-água) e `EXTRA_PALETTE`. O botão "+" aceita qualquer cor.
- Texto sobre cor é escolhido por contraste de leitura em `src/lib/color.ts` (`shapeColors`). O script
  `scripts/checks/contraste.ts` confere todas as cores.
- Cores da interface (fundo, texto, bordas, destaque) são variáveis CSS em `src/app/globals.css`, com versão clara e escura.
- Cor do sistema por pessoa: escolhida no Perfil (`AccentPicker`), salva em `User.accentColor` e aplicada no
  `layout.tsx` com `accentCss()` (`src/lib/accent.ts`), que gera os tons com contraste garantido.
- A cor da marca (logo) fica fixa em `--brand` e não segue a cor do sistema.

## 8. Compartilhar quadro por link

Arquivos: `share.ts`, `ShareModal.tsx`, `compartilhado/[token]/page.tsx`, `SharedBoard.tsx`.

- Só admin cria. O token tem 24 bytes aleatórios (`base64url`).
- O link é `/compartilhado/TOKEN`, montado com o endereço do próprio navegador (`window.location.origin`).
- A página pública mostra colunas e demandas (título, descrição limpa, prioridade, prazo, cliente, etiquetas,
  responsáveis e checklist). Não mostra comentários, anexos nem histórico.
- Trocar o link invalida o antigo na hora. Desligar apaga o token.
- Quadro arquivado deixa de abrir pelo link. A página pede para não ser indexada pelo Google.

## 9. Aprovação de posts pelo cliente

Arquivos: `src/app/actions/approvals.ts`, `src/app/actions/approval-public.ts`, `src/server/approvals.ts`,
`src/server/approval-files.ts`, `src/components/approvals/*`, `src/app/aprovar/*`, rotas `api/aprovacoes` e `api/aprovar`.

**Conceitos**
- Post (`ApprovalPost`): a peça. Pode nascer de uma demanda, ser avulso, ou avulso criando uma demanda num quadro.
- Versão (`Approval`): cada envio ao cliente. Mandar uma nova versão cancela a pendente.
- Arquivos (`ApprovalFile`): cópia própria das artes. Apagar o anexo da demanda não tira a arte do cliente.
  Versões seguintes reaproveitam o mesmo arquivo no disco.
- Conversa (`ApprovalMessage`): cliente e equipe trocam mensagens no post.

**Fluxo da equipe** (`Composer`, `ApprovalSection`, `ApprovalsView`, `PostInspector`)
1. Envia artes por `/api/aprovacoes/arquivo` (imagens e vídeos até 25 MB) ou escolhe anexos da demanda.
2. `createApproval` valida: carrossel com 2 artes ou mais, "só texto" exige legenda, os outros exigem arte.
3. Se o quadro tem uma coluna com "aprova" no nome, a demanda vai para ela (`approvalColumns`).
4. Gera o link do cliente (`/aprovar/TOKEN-DO-CLIENTE`, todos os posts) e o link do post (`/aprovar/p/TOKEN-DO-POST`).
   O inspetor tem botão para mandar no WhatsApp.
5. `sendNewVersion`, `archiveApproval`, `setApprovalPublished` (só depois de aprovado; leva a demanda para a
   coluna de concluídas, de preferência uma com "publica" no nome), `updateApprovalDetails`, `sendTeamMessage`.
6. Trocar links: `regenerateClientApprovalLink` (só admin) e `regeneratePostLink`.

**Fluxo do cliente** (sem login, `ApprovalPortal`, `SinglePost`, `Review`)
1. Abre o link, vê a arte, a legenda e a conversa.
2. Aprova ou pede ajuste digitando o nome. No ajuste, marca quais artes e se a legenda precisa mudar.
   O nome fica lembrado no aparelho.
3. No link do cliente existe "aprovar tudo".
4. `applyDecision` grava a decisão de forma atômica (duas respostas ao mesmo tempo não valem as duas).
5. Aprovado: a demanda anda para a coluna seguinte à de aprovação. Ajuste: volta para a coluna anterior com
   "produ" no nome (ou a imediatamente anterior).
6. A equipe recebe notificação `APPROVED`, `CHANGES` ou `COMMENT`.

**Proteções do lado público**
- Token validado por formato antes de ir ao banco.
- Limite de 60 respostas por IP a cada 10 minutos.
- O post só abre se o token for do post ou do cliente dono do post, se o cliente estiver ativo e o post não estiver arquivado.
- Arquivos só são servidos se pertencem a uma versão já enviada de um post que aquele link mostra.
- O cliente vê só o primeiro nome de quem respondeu pela equipe.
- No portal do cliente, publicados aparecem por 30 dias.

## 10. Notificações

Arquivos: `src/server/events.ts` (`notify`), `src/app/actions/notifications.ts`, `src/components/shell/NotificationBell.tsx`.

`notify()` cria uma notificação para cada destinatário (nunca para quem fez a ação) e publica um evento ao vivo.

| Tipo | Quando | Onde nasce |
|---|---|---|
| `ASSIGNED` | alguém coloca você numa demanda | `cards.ts` (`createCard`, `setAssignees`) |
| `MOVED` | uma demanda sua muda de coluna | `cards.ts` (`moveCard`) |
| `MENTION` | alguém menciona você num comentário | `card-extras.ts` (`addComment`) |
| `COMMENT` | comentário numa demanda sua, ou mensagem do cliente num post | `card-extras.ts`, `approval-public.ts` |
| `APPROVED` | o cliente aprovou | `approval-public.ts` |
| `CHANGES` | o cliente pediu ajuste | `approval-public.ts` |

O schema cita `DUE_SOON` (prazo chegando) no comentário do campo, mas esse tipo ainda não é gerado por nenhuma parte do código.

O ícone de cada tipo fica no mapa `ICON` de `NotificationBell.tsx`. Clicar leva para `/quadros/ID?demanda=ID`.

## 11. Agenda, Início e busca

- **Início** (`(app)/page.tsx`, `HomeView.tsx`): minhas demandas abertas ordenadas por prazo, concluídas nos últimos 7 dias, quadros favoritos e atividade recente.
- **Agenda** (`(app)/agenda/page.tsx`, `AgendaView.tsx`): todas as demandas com prazo entre 6 meses atrás e 1 ano à frente, de todos os quadros não arquivados, mais a lista das abertas sem prazo.
- **Busca** (`search.ts`, `SearchDialog.tsx`): por título, descrição, nome do cliente ou número (#123). Até 20 resultados.

## 12. Clientes

Arquivos: `clients.ts`, `ClientsView.tsx`, `ClientDetail.tsx`, `(app)/clientes/*`.

- Qualquer pessoa da equipe cria e edita. Não deixa dois clientes ativos com o mesmo nome.
- Logo do cliente: `ImageUpload` reduz para 256 px em WebP no navegador e envia para `/api/imagens` com `alvo=cliente`.
- Arquivar (admin) tira o cliente das listas mas mantém nas demandas antigas. Excluir (admin) só se não tiver demandas.
- Um quadro pode ter cliente padrão; a demanda criada nele já nasce com esse cliente.

## 13. Configurações e perfil

- **Equipe**: lista de pessoas, criar acesso (senha temporária), mudar papel, desativar, gerar nova senha.
- **Etiquetas**: criar e editar (todos), excluir (admin), com contagem de uso.
- **Modelos**: modelos de demanda (`templates.ts`, `TemplatesTab.tsx`).
- **Marca**: manual da marca com os logos de `public/marca` (`BrandManual.tsx`).
- **Registro**: últimas 60 ações administrativas (só admin).
- **Perfil**: nome, cor do avatar, foto (`alvo=pessoa`), cor do sistema, intensidade do vidro (`GlassSlider`) e troca de senha.
- **Tema** claro, escuro ou do sistema: escolhido no menu da conta (`Shell.tsx`) e guardado no cookie `demanda_theme`.

## 14. Segurança

**Proxy** (`src/proxy.ts`, roda antes de toda requisição, exceto arquivos estáticos do Next)
- Sem cookie de sessão, manda para `/login?next=...` (ou responde 401 nas rotas `/api`). É só uma checagem
  rápida: a autorização de verdade acontece em cada página e action.
- Rotas públicas: `/login`, `/icon`, `/favicon.ico`, `/manifest.webmanifest`, `/compartilhado`, `/aprovar`, `/api/aprovar`.
- Cabeçalhos: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
  `Permissions-Policy` (sem câmera, microfone, localização) e, em produção, `Strict-Transport-Security`.

**Limites** (`src/server/rate-limit.ts`, em memória)

| O quê | Limite |
|---|---|
| Login com erro | 8 por e-mail e 30 por IP a cada 15 min |
| Primeiro acesso | 10 por IP a cada 15 min |
| Troca de senha | 10 por pessoa a cada 15 min |
| Anexos | 30 por pessoa por minuto |
| Artes da aprovação | 60 por pessoa por minuto |
| Fotos | 20 por pessoa por minuto |
| Comentários | 20 por pessoa por minuto |
| Respostas do cliente | 60 por IP a cada 10 min |

O IP vem de `X-Forwarded-For` ou `X-Real-IP` (configure no Nginx).

**Uploads**
- Anexos: lista branca de extensões em `src/server/storage.ts` (imagens, PDF, Office, txt, csv, zip, mp4, mov,
  mp3, wav, psd, ai, fig). Sem SVG, HTML nem executáveis. Máximo 25 MB.
- Nome no disco sempre aleatório (32 caracteres hexadecimais) e conferido por expressão regular antes de abrir.
- Fotos: o tipo é detectado pelo conteúdo (não pela extensão), só JPG, PNG e WebP, máximo 5 MB.
- Arquivos são servidos com `Content-Security-Policy` de sandbox e `nosniff`. Tipos que o navegador poderia
  executar vão como download.
- Tudo em `storage/` é servido só para quem está logado, exceto as artes de aprovação pelo link com token.

**Outros cuidados**
- Toda entrada passa por zod. Toda action confere a sessão no servidor.
- Descrições e comentários são limpos por `sanitizeRich` antes de gravar (lista fechada de tags, links com `rel="noopener noreferrer nofollow"`).
- Tokens de link com 24 bytes aleatórios e validação de formato.
- Ações administrativas ficam no `AuditLog`.
- Senhas temporárias aparecem uma vez só e obrigam troca.

## 15. Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Modo desenvolvimento (fuso America/Sao_Paulo). |
| `npm run build` | Gera a versão de produção. |
| `npm run start` | Roda a versão de produção. |
| `npm run typecheck` | Confere os tipos do TypeScript. |
| `npm run lint` | ESLint. |
| `npm run db:push` | Cria ou atualiza as tabelas a partir do schema. |
| `npm run db:seed` | Dados de demonstração (banco vazio). |
| `npm run db:reset` | Apaga o banco e roda o seed de novo. |
| `npx tsx --env-file=.env scripts/demo-completo.ts` | Demonstração maior (roda uma vez). |
| `node node_modules/tsx/dist/cli.mjs scripts/checks/contraste.ts` | Confere contraste das cores. |
| `node scripts/brand/build-logo.mjs` | Gera os SVGs do logotipo. |
| `node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/e2e/simulacao.ts` | Teste de ponta a ponta com duas pessoas ao mesmo tempo. Precisa do sistema rodando, do seed aplicado e do Google Chrome instalado (caminho em `E2E_CHROME`). Apaga só o que ele mesmo criou. |
