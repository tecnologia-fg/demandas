# Captura autenticada do Trello — 22/10/2026

Captura concluída em **22/10/2026 às 23h03 (America/Sao_Paulo)** e auditada offline às 23h04. Os hashes dos 15 exports originais, dos 33 bundles e dos 1.545 binários foram conferidos; paginação e referências entre cards/listas/etiquetas/checklists também foram verificadas. Os 21 testes automatizados passaram, e ESLint dos scripts não apresentou erros.

| Resultado auditado | Total |
|---|---:|
| Quadros do workspace | 33 |
| Cards | 3.737 |
| Comentários disponíveis | 425 |
| Ações disponíveis | 54.068 |
| Cards nos 15 quadros com anexos | 1.828 |
| Comentários nos 15 quadros com anexos | 216 |
| Binários recuperados e verificados | 1.545 |
| Volume de binários do lote | 3.757.171.561 bytes (3,50 GiB) |
| Downloads que falharam | 0 |
| Links externos preservados nos 15 quadros | 13 |
| Arquivos recuperados que exigem revisão de formato/tamanho | 32 |
| Anexos indicados só em contadores nos 15 quadros | 6 |
| Divergências de comentários em todo o workspace | 1 |
| Membros atuais do workspace preservados | 13 |

Nos outros 18 quadros foram preservados **1.909 cards e 209 comentários**. Seus 3.617 registros de anexos ficam somente como metadados. Há 1.513 binários históricos baixados antes da restrição de escopo, preservados fora do manifesto de importação. Eles não contam entre os 1.545 arquivos autorizados.

**Intervenção pendente:** nenhum arquivo identificado falhou no download. Os seis anexos indicados apenas pelos contadores continuam sem nome, ID de anexo ou binário retornado pela API, mesmo após consulta individual dos cards; precisam ser localizados com a equipe, se ainda existirem. Há mais uma divergência de anexo em quadro histórico, fora do escopo de binários. Um comentário indicado pelo contador também não foi retornado após consulta específica. O CSV de divergências identifica os cards afetados. Os 32 arquivos de política já estão baixados; envio manual continua sujeito aos mesmos limites do Dmanda.

O registro global preserva 99 IDs referenciados, dos quais 54 não tiveram perfil resolvido. Isso não representa 99 membros atuais: os 13 membros atuais estão disponíveis, e as identidades históricas desconhecidas permanecem com seus IDs de origem.

## Escopo definido pelo usuário

Somente o workspace `agenciaformulagroup`. A consulta direta ao workspace encontrou 33 quadros (18 abertos e 15 arquivados), incluindo dois que não apareciam na lista de quadros do membro. O critério para baixar anexos é pertencer aos **15 exports iniciais** de `Downloads/cards-trello-22102026`, independentemente do estado aberto/arquivado informado pelo Trello.

- **15 quadros iniciais:** cards, comentários, estrutura, identidades e binários dos uploads acessíveis. Links externos permanecem referências.
- **Outros 18 quadros:** cards e comentários, acompanhados da estrutura necessária para organizá-los. Nenhum novo download de anexos; seus metadados não representam uma pendência de recuperação.
- Arquivos históricos baixados antes da mudança de escopo permanecem preservados, explicitamente fora das fontes de anexos da importação. Nenhuma exclusão automática.

Os 15 exports originais continuam intactos. A API gera uma fonte separada, com data, IDs e hashes próprios. Não somar as duas fontes como se fossem cards diferentes. A captura não é uma sincronização contínua.

## Operação e evidências

Os scripts só fazem GET no Trello. Credenciais são lidas da `.env`, enviadas em cabeçalho e não seguem redirecionamentos para storage. Downloads usam o endpoint fixo do Trello, concorrência três, arquivo temporário, tamanho esperado, SHA-256 e retomada mediante verificação do arquivo existente. Os binários ficam com extensão `.bin`; o manifesto conserva o nome original.

```powershell
npm run trello:capture
npm run trello:verify
npm run test:trello
```

`trello:capture` retoma o snapshot privado existente, com cache de metadados. Não usá-lo como atualização para um novo estado do Trello. `--metadata-only` evita todos os downloads; `--exported` limita também os metadados aos 15 iniciais. A auditoria padrão exige o conjunto completo de quadros do workspace.

Raiz privada, ignorada pelo Git: `research/trello/local/api-capture/2026-10-22/`.

| Arquivo/pasta | Conteúdo |
|---|---|
| `workspace-boards.json` | Inventário obtido diretamente do workspace |
| `workspace-members.json`, `workspace-memberships.json` | Membros atuais e vínculos |
| `boards/<id>/board-export.json` | Fonte consolidada por quadro, compatível com a organização dos exports |
| `boards/<id>/action-pages/` | Páginas originais de ações, com prova de término da paginação |
| `boards/<id>/card-comment-pages/` | Consulta adicional dos cards com divergência nos contadores |
| `boards/<id>/export-only-actions.json` | Ações presentes apenas no export original, separadas do estado atual |
| `members.json` | Identidades referenciadas, com origem e placeholders quando indisponíveis |
| `capture-state.json` | Checkpoints e resultado por arquivo |
| `files/` | Binários privados; inclui sobras históricas fora do lote |
| `reports/import-sources.json` | Fontes por quadro e lista explícita dos binários autorizados para importação |
| `reports/integrity-manifest.json` | SHA-256 dos metadados e dos binários do lote |
| `reports/verification.json` | Totais efetivamente auditados |
| `reports/attachments.csv` | Situação individual de todos os registros, com escopo explícito |
| `reports/manual-recovery.csv` | Somente downloads dos 15 quadros que falharam |
| `reports/import-policy-review.csv` | Arquivos que precisam de decisão de formato/tamanho no Dmanda |
| `reports/counter-discrepancies.csv` | Contadores maiores que os registros disponíveis, sem inventar conteúdo |
| `reports/members.csv` | Identidades disponíveis e identificação dos membros atuais |

Esses relatórios contêm dados privados e URLs de origem; não publicar nem mover para `public/`. O importador deve consumir a lista explícita de `import-sources.json`, nunca varrer `files/`: existem arquivos históricos fora do escopo.

## Limites e próximo passo

Um contador de anexo/comentário não contém o arquivo ou texto. Divergências persistentes após consulta específica permanecem documentadas. Identidades históricas não resolvidas mantêm seus IDs e não devem criar usuários ativos fictícios. A autoria disponível nos comentários é preservada.

Baixar um arquivo não significa importá-lo no Dmanda. A próxima etapa é revisar o mapeamento de clientes, pessoas e colunas, incluindo Planejamento → Caixa de entrada, e executar um ensaio com PostgreSQL isolado no Docker. Esse ensaio deve conferir cards/comentários por ID, autoria, arquivamento, anexos por hash, repetição sem duplicação e o relatório de pendências. A captura não alterou o banco do Dmanda.
