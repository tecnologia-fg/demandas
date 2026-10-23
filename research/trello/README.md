# Pesquisa de importação Trello → Dmanda

**Carga definitiva concluída em 23/10/2026:** [publicação, transferência e auditoria na VPS](production-cutover.md). A conferência passou para 33 quadros, 3.737 cards, 425 comentários e 1.513 arquivos, com clientes, etiquetas e usuários aprovados. Os relatórios reais e credenciais continuam fora do Git. As seções seguintes registram o histórico da implementação.

**Atualização de 23/10/2026:** implementação e associações aprovadas no ensaio local, conforme [revisão antes da publicação](pre-release-review.md). São 24 clientes em 27 quadros, seis quadros sem cliente, 18 etiquetas consolidadas e 12 usuários associados. Cafu Academy e Cafu Camp são clientes separados. O [executor e preparação para a VPS](final-import.md) descreve a carga; os IDs locais de clientes/etiquetas exigem correspondências explícitas no destino. As [decisões de conteúdo](migration-decisions.md) foram confirmadas pelo usuário. Os trechos seguintes documentam etapas históricas.

**Revisão de associações:** [clientes pelo nome dos quadros, merge/ignorar etiquetas e reversão](association-review.md). Tela administrativa em `/configuracoes/importar-trello/etiquetas`.

**Ensaio no Docker realizado:** [resultado, evidências e operação](docker-rehearsal.md). Ambiente local em `http://localhost:3100`, com banco/storage separados; 33 quadros e 3.737 cards preservados, incluindo 69 modelos, 425 comentários e 1.513 anexos compatíveis.

**Escopo vigente:** captura autenticada somente de `agenciaformulagroup`, com cards e comentários de 33 quadros e download de anexos restrito aos 15 exports iniciais. Veja [captura por API e relatórios](api-capture-2026-10-22.md). Os números abaixo descrevem as etapas anteriores da pesquisa; não são somados à captura atual.

**Exportação mais recente: 15 quadros, 1.828 cards**, em `Downloads/cards-trello-22102026`. Veja a [captura de 22/10 e o relatório de anexos](cutover-2026-10-22.md). A [análise consolidada](workspace-analysis.md) de 14 quadros e 1.766 cards permanece como base histórica da pesquisa; os snapshots não devem ser somados.

O [roadmap de implementação](roadmap.md) registra as três etapas. A primeira prévia funcional está em **Configurações → Importar Trello**, com acesso ADMIN, análise local dos JSONs e exportação/reabertura de um plano de decisões, sem gravação de dados de importação no banco.

## Pesquisa de todos os quadros

Os 14 arquivos de `C:\Users\Wilian\Downloads\jsons_trello` foram preservados byte a byte em `local/workspace/originals/`. Os catálogos por ID de quadro estão em `local/workspace/catalog/` e as pendências detalhadas, identidades e listas de origem em `local/workspace/quality-details.json`. Toda essa pasta é privada no projeto e ignorada pelo Git.

O inventário versionável é [all-summary.json](all-summary.json), incluindo nome original de arquivo e SHA-256; os padrões e indicadores estão em [patterns.json](patterns.json). Os originais da amostra anterior permanecem em `local/originals/`, mas o consolidado lê apenas `local/workspace/originals/` para evitar contagem duplicada.

Para analisar uma pasta e guardar as cópias no projeto:

```powershell
node scripts/trello/workspace.mjs "C:\Users\Wilian\Downloads\jsons_trello"
```

Para reproduzir a análise com as cópias já guardadas:

```powershell
node scripts/trello/workspace.mjs
node --test scripts/trello/workspace.test.mjs
node scripts/trello/verify-workspace.mjs "C:\Users\Wilian\Downloads\jsons_trello"
```

O analisador percorre os JSONs da pasta e subpastas, valida todos antes de escrever e rejeita dois snapshots do mesmo quadro no mesmo conjunto. Não acessa banco, Trello ou URLs de anexos. Os catálogos conservam as listas, seus estados e todos os cards, inclusive modelos e arquivos. Novos conjuntos devem ser guardados em snapshots separados antes de substituir a base atual; o comando mantém os nomes dos arquivos e atualiza seus derivados.

## Amostra inicial: SPMAR e CEVISA

Pesquisa realizada em 21/10/2026 na branch `research/trello-import`. Escopo: guardar os dois exports, catalogar todos os cards e definir um caminho de importação com base no schema e no código atuais. O importador que grava no banco ainda não foi implementado. Nenhum dado foi gravado no banco do Dmanda.

## Arquivos e reprodução

| Artefato | Conteúdo |
|---|---|
| `local/originals/spmar.json` | Cópia integral de `C:\Users\Wilian\Downloads\iT8sXgPj - spmar.json` |
| `local/originals/cevisa.json` | Cópia integral de `C:\Users\Wilian\Downloads\g5vG08EU - cevisa.json` |
| `local/catalog/spmar.json` | Catálogo dos 133 cards, ordenados por lista e posição |
| `local/catalog/cevisa.json` | Catálogo dos 161 cards, ordenados por lista e posição |
| [summary.json](summary.json) | Inventário agregado, contagens, hashes SHA-256, campos, distribuição por lista e avisos |
| [Plano de importação](import-plan.md) | Mapeamento para o Dmanda, adaptações e critérios de validação |
| [Gerador](../../scripts/trello/catalog.mjs) | Leitura e catalogação local, sem banco nem downloads |

Execute na raiz do projeto:

```powershell
node scripts/trello/catalog.mjs
```

O gerador substitui apenas os catálogos e o resumo derivados. Preserva os originais byte a byte. Cada card do catálogo contém título, descrição original em Markdown, lista, ordem, IDs, URL, datas, estado, responsáveis, etiquetas, campos resolvidos por nome/opção, checklists, comentários disponíveis e metadados dos anexos. Os originais são a fonte integral para os demais campos e ações.

A pasta `local/` está no `.gitignore`: contém dados reais dos clientes, nomes de pessoas e URLs privadas. Os arquivos estão armazenados neste projeto, mas não acompanham um clone da branch. O resumo e os documentos podem ser versionados. Não colocar os exports em `public/`.

## Inventário

As contagens incluem cards arquivados; não são uma contagem apenas do trabalho em aberto.

| Item | SPMAR | CEVISA | Total |
|---|---:|---:|---:|
| Cards | 133 | 161 | 294 |
| Cards arquivados | 11 | 3 | 14 |
| Listas abertas | 9 | 10 | 19 |
| Listas arquivadas | 0 | 1 | 1 |
| Membros por quadro | 9 | 9 | 18 vínculos, não pessoas únicas |
| Etiquetas por quadro | 7 | 8 | 15 definições locais |
| Checklists / itens | 1 / 4 | 0 / 0 | 1 / 4 |
| Cards com prazo | 102 | 152 | 254 |
| Cards com início | 1 | 1 | 2 |
| Cards com descrição | 121 | 157 | 278 |
| Anexos referenciados | 143 | 131 | 274 |
| Bytes declarados dos anexos | 497.403.153 | 424.434.160 | 921.837.313 |
| Anexos acima de 25 MiB | 1 | 1 | 2 |
| Ações exportadas | 1.000 | 1.000 | 2.000 |
| Comentários exportados | 7 | 8 | 15 |
| Comentários indicados em `badges.comments` | 10 | 33 | 43 |

Há evidência de 28 comentários ausentes pelo comparativo com os badges: 3 em SPMAR e 25 em CEVISA. São 22 cards afetados. Os badges são indicadores do snapshot, não substituem o texto dos comentários. O JSON de quadro inclui as últimas 1.000 ações, incluindo comentários, conforme a [documentação oficial de exportação](https://support.atlassian.com/trello/docs/exporting-data-from-trello/). Portanto, não prometer histórico completo com estes arquivos. CEVISA também contém três ações de exclusão referentes a cards que já não constam em `cards`; elas não devem recriar esses cards.

Todos os 274 anexos têm `isUpload=true` e URL no Trello. Seus bytes não estão embutidos nos JSONs. O volume declarado é aproximadamente 879 MiB. Para obter os binários, usar exportação de Workspace com a opção de incluir anexos originais ou uma etapa autenticada de recuperação. A [documentação oficial](https://support.atlassian.com/trello/docs/exporting-data-from-trello/) explica a exportação em ZIP com anexos e a opção de exportar todos os comentários pelo Workspace.

## Como a equipe usa os quadros

O fluxo comum é captação/reunião → planejamento/entrada → produção → revisão interna → aprovação → ajustes ou aprovado/agendar → concluído. SPMAR inclui `JOBS` e `PLANEJAMENTO`; CEVISA inclui `Tráfego Pago`, `IDEIAS`, `CAIXA DE ENTRADA` e uma lista arquivada `EM PLANEJAMENTO`, vazia. Preservar essas diferenças em vez de impor um template único.

Na importação, permitir associar cada lista a uma coluna existente do Dmanda ou criar uma nova com nome editável. Equivalência informada pelo usuário: **`PLANEJAMENTO` do Trello → `Caixa de entrada` do Dmanda**. Também permitir reunir várias listas numa coluna, preservando a origem de cada card e mostrando a ordem na prévia. As regras estão detalhadas no [plano de importação](import-plan.md#escolha-das-colunas-na-importação).

| Lista | SPMAR | CEVISA |
|---|---:|---:|
| CAPTAÇÃO / REUNIÃO | 2 | 2 |
| JOBS | 3 | — |
| PLANEJAMENTO | 12 | — |
| Tráfego Pago | — | 3 |
| IDEIAS | — | 2 |
| CAIXA DE ENTRADA | — | 8 |
| EM PLANEJAMENTO (arquivada) | — | 0 |
| EM PRODUÇÃO | 0 | 0 |
| REVISÃO INTERNA | 6 | 0 |
| EM APROVAÇÃO | 3 | 2 |
| AJUSTES | 1 | 0 |
| APROVADO / AGENDAR | 0 | 7 |
| CONCLUÍDO | 106 | 137 |

As etiquetas representam áreas da equipe: Criação, Audiovisual, ADM, Social Media, Desenvolvimento, Tráfego Pago e Atendimento. CEVISA tem ainda uma etiqueta verde sem nome. Etiquetas com o mesmo significado têm IDs diferentes entre quadros; o Dmanda usa etiquetas globais.

Os três campos personalizados são:

- **Prioridade**: Normal, Alta e Urgente. Proposta: `MEDIUM`, `HIGH`, `URGENT`. Ausência permanece `null`. São 131 cards com valor e 163 sem prioridade.
- **Tipo de Entrega**: preenchido em 21 cards SPMAR e 117 CEVISA. Inclui materiais gráficos, posts, carrosséis, vídeos, stories, sites e entregas combinadas. CEVISA adiciona `Post Estático + Story` e `Carrossel + Stories`; não reduzir esses valores a um único formato de aprovação.
- **Pasta do Drive**: preenchido em 69 cards SPMAR e 86 CEVISA. Preservar como link/metadado; não corresponde a um arquivo local.

`dueComplete` não identifica de forma confiável a etapa final do trabalho: há 9 cards SPMAR e 12 CEVISA marcados fora de `CONCLUÍDO`; em SPMAR há também um card em `CONCLUÍDO` sem a marca. Conservar o dado de origem e apresentar a divergência na prévia. A regra de conclusão precisa ser explícita; veja o plano.

## Resultado da pesquisa

A importação via JSON é viável para a estrutura e o conteúdo disponível. A proposta é um importador administrativo com prévia, associação de pessoas/clientes, registro dos IDs de origem e execução por lote, seguido da recuperação de anexos. O schema atual cobre boa parte dos dados, mas precisa de rastreabilidade de importação, preservação dos campos extras e tratamento das listas arquivadas e links de anexos.

A pesquisa foi validada sem subir a aplicação, porque esta etapa somente lê arquivos e código. O Docker disponibilizado pode ser usado na implementação para criar um PostgreSQL isolado e testar a gravação antes de usar o banco configurado em `.env`.

## Validação realizada

- Comparação byte a byte das duas cópias com os arquivos em Downloads e conferência dos hashes no resumo.
- Comparação por ID de todos os 294 cards: campos catalogados, valores personalizados resolvidos, responsáveis, etiquetas, metadados de anexos, checklists/itens e comentários disponíveis conferem com os originais.
- Execuções em memória produzem o mesmo resultado. Casos alterados de lista ausente e ID duplicado foram rejeitados; prioridade desconhecida gerou aviso.
- `node --check scripts/trello/catalog.mjs`, `npx eslint scripts/trello/catalog.mjs` e `git diff --check` passaram. O Git confirma que originais e catálogos detalhados são ignorados.

Essa validação cobre a preservação e a catalogação dos exports. Os critérios de gravação e de interface do importador permanecem descritos como trabalho futuro no plano.
