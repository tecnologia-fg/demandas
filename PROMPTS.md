# Prompts prontos para mudar o Dmanda

Prompts para colar na sua IA de programação (Claude Code, Codex, Cursor ou outra que trabalhe na pasta do projeto).
Cada prompt já aponta os arquivos certos. Os exemplos usam valores concretos; se quiser outro valor, troque no texto antes de colar.

Antes de qualquer mudança:

1. Faça um commit (ou uma cópia da pasta) para poder voltar atrás.
2. Rode o sistema com `npm run dev` para ver o resultado na hora.
3. Depois da mudança, peça para a IA rodar `npx tsc --noEmit` e `npm run build` e corrigir o que der erro.

Prompt de partida (use sempre no começo de uma conversa nova):

```text
Leia ARQUITETURA.md e prisma/schema.prisma para entender o projeto Dmanda (Next.js 16, Prisma 6, SQLite). Siga os padrões que já existem: server actions dentro de run(), conferência de sessão com assertUser ou assertAdmin, validação com zod, publishBoard depois de mudar algo de um quadro, textos da tela em português e cores pelas variáveis CSS de src/app/globals.css. Antes de mexer, faça um commit do estado atual. Ao terminar cada mudança, rode npx tsc --noEmit e npm run build e corrija os erros.
```

---

## 1. Trocar cores e logo

### Trocar a cor de destaque padrão

```text
Quero trocar a cor de destaque padrão do Dmanda, hoje verde-água #19C9A9, por azul #2F6FDB. Arquivos: DEFAULT_ACCENT e a primeira sugestão de ACCENT_SUGGESTIONS em src/lib/accent.ts; as variáveis --accent, --accent-hover, --accent-strong, --accent-ink e --focus em src/app/globals.css, no tema claro e no tema escuro; o comentário do campo accentColor em prisma/schema.prisma. Use accentCss de src/lib/accent.ts para calcular os tons com contraste certo em vez de inventar valores. Não mexa nas variáveis --brand (cor do logo). No final, rode node node_modules/tsx/dist/cli.mjs scripts/checks/contraste.ts e me mostre o resultado.
```

### Trocar a paleta das etiquetas, colunas e quadros

```text
Troque a paleta principal do Dmanda (PALETTE em src/lib/domain.ts, hoje em tons de verde-água) por uma paleta de 12 tons de azul e roxo, sólidos e com boa leitura de texto. Ajuste também PRIORITY_META no mesmo arquivo para seguir a nova família de cores (mais urgente, mais escuro). Confira as cores padrão nos campos color de prisma/schema.prisma (User, Board, BoardFolder, Client) e nos modelos de quadro em TEMPLATES de src/app/actions/boards.ts, e troque as que forem da paleta antiga. Depois rode node node_modules/tsx/dist/cli.mjs scripts/checks/contraste.ts e ajuste qualquer cor que falhar.
```

### Trocar as cores de fundo e de texto da interface

```text
Mude o fundo da interface do Dmanda de verde-água claro para um cinza neutro, nos temas claro e escuro. As cores estão nas variáveis de src/app/globals.css: --bg, --surface, --surface-2, --surface-3, --border, --border-strong, --fg, --fg-2, --fg-3 e as manchas --blob-1 a --blob-4. Atualize também themeColor em src/app/layout.tsx para combinar com o novo fundo. Mantenha o contraste do texto bom nos dois temas e não use bordas pontilhadas nem filetes coloridos.
```

### Trocar o nome e o logo do sistema

```text
Quero trocar o nome do sistema de Dmanda para Fluxo e usar um logo novo. Faça assim: troque BRAND em src/components/Logo.tsx e o desenho do símbolo (D_OUTER e D_COLUMNS) por um símbolo simples de três barras verticais arredondadas; troque title, applicationName e o template "%s · Dmanda" em src/app/layout.tsx; atualize src/app/icon.svg com o novo símbolo; ajuste scripts/brand/build-logo.mjs para gerar os arquivos com o nome novo e rode node scripts/brand/build-logo.mjs para recriar public/marca e src/lib/brand-metrics.json; troque os textos "Dmanda" que aparecem para o usuário (procure em src com grep), sem mudar nomes de cookies nem de variáveis internas. Mostre a lista de arquivos alterados no final.
```

### Usar um logo em imagem (PNG ou SVG pronto)

```text
Vou colocar o logo da minha empresa em public/marca/logo-empresa.svg. Altere src/components/Logo.tsx para mostrar essa imagem no lugar do desenho atual, mantendo as mesmas propriedades de tamanho que os outros componentes já usam, e com uma versão para o tema escuro se o arquivo public/marca/logo-empresa-escuro.svg existir. Troque também src/app/icon.svg por um ícone quadrado simples com a inicial da empresa. Se o arquivo do logo ainda não existir, use um texto provisório e me avise.
```

---

## 2. Criar um campo novo na demanda

Exemplo: campo "Link de entrega" (endereço de onde o material final foi publicado ou entregue).

```text
Crie um campo novo na demanda do Dmanda chamado "Link de entrega" (deliveryUrl, texto opcional, só aceita endereços http ou https, até 500 caracteres). Passos:
1. prisma/schema.prisma: acrescente deliveryUrl String? no model Card e rode npx prisma db push.
2. src/app/actions/cards.ts: acrescente o campo em cardPatch (zod, url http ou https, nullable, optional), grave em updateCard, registre no histórico com logActivity tipo "delivery" quando mudar, devolva o campo em getCardDetail e copie o campo em duplicateCard. Não copie em spawnRepeat (a repetição começa sem entrega).
3. src/lib/types.ts: acrescente deliveryUrl em CardDetail.
4. src/lib/domain.ts: acrescente o texto do histórico em ACTIVITY_TEXT para o tipo "delivery".
5. src/components/board/CardModal.tsx: mostre um campo "Link de entrega" junto dos outros campos da demanda, salvando com updateCard ao sair do campo, e um botão para abrir o link em nova aba.
Siga os padrões de run(), assertUser e publishBoard. No final rode npx tsc --noEmit e npm run build.
```

Para um campo que aparece também no card do quadro, acrescente ao prompt:

```text
Mostre também um pequeno ícone de link no card do quadro quando a demanda tiver Link de entrega. Para isso, inclua o campo em CardSummary (src/lib/types.ts), em toCardSummary (src/server/serialize.ts) e mostre o ícone em src/components/board/CardTile.tsx, junto dos outros indicadores.
```

---

## 3. Nova coluna padrão nos modelos de quadro

```text
No modelo de quadro "Básico" do Dmanda, acrescente uma coluna "Aguardando cliente" com a cor #3BB3C3, entre "Revisão" e "Concluído". Os modelos estão em TEMPLATES dentro de src/app/actions/boards.ts, e a lista de colunas que aparece na tela de escolha do modelo está no array de modelos em src/components/board/BoardModals.tsx. Atualize os dois lugares. Quadros que já existem não mudam; explique isso para mim no final.
```

Criar um modelo de quadro novo:

```text
Crie um modelo de quadro novo no Dmanda chamado "Atendimento" com as colunas Novo pedido, Em análise, Em execução, Aguardando cliente (cor #3BB3C3) e Resolvido (coluna de concluídas, isDone true). Acrescente o modelo em TEMPLATES de src/app/actions/boards.ts com o id "atendimento", inclua esse id na validação z.enum dentro de createBoard e acrescente o modelo na lista de src/components/board/BoardModals.tsx, com o nome e as colunas.
```

Lembrete: as colunas que tiverem "aprova" no nome viram a coluna de aprovação do cliente, e as concluídas com "publica" no nome recebem os posts publicados (`approvalColumns` em `src/server/approvals.ts`).

---

## 4. Novo tipo de notificação

Exemplo: aviso de prazo chegando (`DUE_SOON`), que já está previsto no schema mas ainda não é gerado.

```text
Implemente a notificação DUE_SOON no Dmanda: avisar os responsáveis de cada demanda aberta (não concluída, não arquivada, em quadro não arquivado) cujo prazo é amanhã. Passos:
1. Crie scripts/avisar-prazos.ts que usa PrismaClient, encontra essas demandas e cria uma Notification tipo DUE_SOON para cada responsável, com o texto "Prazo amanhã: #NUMERO TITULO" e cardId preenchido. Não crie aviso repetido: confira se já existe DUE_SOON para a mesma pessoa e demanda nas últimas 24 horas.
2. Em src/components/shell/NotificationBell.tsx, acrescente DUE_SOON no mapa ICON com o ícone CalendarClock do lucide-react.
3. Acrescente no package.json o script "avisar-prazos": "tsx --env-file=.env scripts/avisar-prazos.ts".
4. Me explique como agendar o script no cron da VPS para rodar todo dia às 8h, no fuso America/Sao_Paulo.
O script roda fora do servidor Next, então as notificações aparecem no sino na próxima vez que a tela atualizar; diga isso na explicação.
```

Notificação disparada por uma ação do sistema (exemplo: quando alguém conclui uma demanda):

```text
Crie a notificação COMPLETED no Dmanda: quando alguém concluir uma demanda (função setCompleted em src/app/actions/cards.ts, só quando done for true), avise quem criou a demanda (createdById) e os responsáveis, usando notify de src/server/events.ts com o texto "NOME concluiu #NUMERO TITULO". A função notify já não avisa quem fez a ação. Acrescente COMPLETED no mapa ICON de src/components/shell/NotificationBell.tsx com o ícone CircleCheck do lucide-react e atualize o comentário do campo type do model Notification em prisma/schema.prisma.
```

---

## 5. Traduzir ou trocar textos

Trocar um termo em todo o sistema:

```text
No Dmanda, troque a palavra "demanda" por "tarefa" em todos os textos que aparecem para o usuário (singular, plural, maiúsculas e minúsculas, e o gênero das palavras ao redor, por exemplo "nova demanda" vira "nova tarefa"). Procure em src/components, src/app (páginas, actions e mensagens de erro de fail e zod), src/lib/domain.ts (ACTIVITY_TEXT) e src/app/layout.tsx. Não mude nomes de variáveis, funções, rotas, parâmetros de endereço (como ?demanda=), cookies nem tabelas do banco. No final, me mostre uma lista dos textos trocados por arquivo.
```

Traduzir a interface inteira para inglês:

```text
Traduza a interface do Dmanda para inglês. Os textos estão escritos direto nos componentes, sem arquivo de tradução. Passos:
1. Crie src/lib/i18n.ts com um objeto de textos em inglês organizado por tela.
2. Troque os textos visíveis de src/components, das páginas em src/app, das mensagens de erro das actions em src/app/actions (fail e mensagens do zod) e das listas de src/lib/domain.ts (PRIORITY_META, REPEAT_LABEL, ACTIVITY_TEXT, APPROVAL_FORMATS, APPROVAL_META, APPROVAL_FLOW_HINT) e src/lib/dates.ts (meses e dias da semana) para usar esse arquivo.
3. Em src/app/layout.tsx, troque lang="pt-BR" por lang="en" e traduza title e description.
4. Não traduza endereços de páginas (/quadros, /aprovar e outros), nomes de variáveis nem valores gravados no banco.
Faça uma tela por vez, rodando npx tsc --noEmit no fim de cada uma, e me diga o que falta ao final.
```

---

## 6. Ativar HTTPS

Na VPS (o login em produção só funciona com HTTPS):

```text
Meu Dmanda está rodando numa VPS Ubuntu com Nginx e PM2, mas ainda sem HTTPS, e o login volta para a tela de entrada. Explique por que isso acontece olhando src/server/auth/session.ts (cookie __Host- e secure em produção) e me guie, um comando por vez, para instalar o Certbot com o plugin do Nginx, gerar o certificado para o domínio configurado no server_name do Nginx, conferir a renovação automática com certbot renew --dry-run e testar o login de novo. Antes, me peça para colar o conteúdo do arquivo de configuração do Nginx do site para você conferir se o bloco da rota /api/ao-vivo está sem buffer e se os cabeçalhos X-Forwarded-For e X-Forwarded-Proto estão sendo enviados.
```

No seu computador (para testar com https://localhost):

```text
Quero rodar o Dmanda em modo de desenvolvimento com HTTPS no meu computador. Use a opção --experimental-https do next dev, crie um script "dev:https" no package.json mantendo o TZ=America/Sao_Paulo do script dev, e me explique como aceitar o certificado local no navegador. Não mude nada do comportamento de produção.
```

---

## 7. Outros pedidos comuns

Página nova no menu:

```text
Crie uma página nova no Dmanda chamada "Relatórios" no endereço /relatorios, só para pessoas logadas, mostrando quantas demandas cada pessoa concluiu nos últimos 30 dias e quantas estão atrasadas. Crie src/app/(app)/relatorios/page.tsx usando requireUser e consultas com db de src/server/db.ts, acrescente o item no array NAV de src/components/shell/Shell.tsx com o ícone ChartColumn do lucide-react, entre Clientes e Configurações, e use os mesmos componentes de cabeçalho (src/components/PageHeader.tsx) e as mesmas variáveis de cor das outras páginas.
```

Mudar o limite de tamanho dos anexos:

```text
Aumente o limite de anexos do Dmanda de 25 MB para 100 MB. O valor está em MAX_UPLOAD em src/server/storage.ts e é usado em src/app/api/anexos/route.ts e src/app/api/aprovacoes/arquivo/route.ts (inclusive nas mensagens "Arquivo maior que 25 MB"). Procure outros textos com "25 MB" em src e atualize. Depois me lembre de trocar client_max_body_size no Nginx para 110m.
```

Aceitar um tipo de arquivo novo nos anexos:

```text
Faça o Dmanda aceitar arquivos .webm e .m4a nos anexos das demandas. Acrescente as extensões na lista ALLOWED de src/server/storage.ts com o tipo certo (video/webm e audio/mp4). Não acrescente SVG, HTML nem nada que o navegador possa executar.
```

Revisão de segurança depois de mudanças:

```text
Revise as mudanças que fiz no Dmanda desde o último commit com foco em segurança: toda server action nova usa run() e assertUser ou assertAdmin, toda entrada passa por zod, nenhuma rota nova fica pública sem querer (compare com a lista PUBLIC de src/proxy.ts), textos formatados passam por sanitizeRich de src/server/richtext.ts, e uploads usam nomes aleatórios e lista branca de extensões como em src/server/storage.ts. Liste o que encontrar e corrija.
```
