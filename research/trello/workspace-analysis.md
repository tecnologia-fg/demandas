# Análise consolidada dos quadros Trello

Base: todos os 14 JSONs encontrados em `C:\Users\Wilian\Downloads\jsons_trello`, analisados em 21/10/2026 na branch `research/trello-import`. Os originais e catálogos estão em `local/workspace/`, ignorados pelo Git. A análise cobre todos os arquivos fornecidos; a pasta, por si só, não comprova que nenhum quadro ficou fora da exportação da conta.

As evidências reproduzíveis estão em [all-summary.json](all-summary.json), por arquivo com SHA-256, e [patterns.json](patterns.json), com frequências e exceções. A análise inicial de SPMAR/CEVISA continua como referência histórica em [README.md](README.md); esses dois quadros já estão incluídos nos 14 e não devem ser somados novamente.

## Dimensão e cobertura

| Indicador | Resultado |
|---|---:|
| Quadros / IDs de quadro distintos | 14 / 14 |
| Cards / IDs de card distintos | 1.766 / 1.766 |
| Cards individualmente arquivados | 378 |
| Listas abertas / arquivadas | 128 / 10 |
| Cards em listas arquivadas | 75, todos em Rivellino |
| Desses 75, sem arquivamento individual | 10 |
| Cards marcados como modelo | 29, dos quais 7 arquivados |
| Registros de anexos | 1.546: 1.533 uploads e 13 links |
| Tamanho declarado dos anexos | 3.684.618.138 bytes, aproximadamente 3,43 GiB |
| Checklists / itens | 7 / 50 |
| Membros distintos em `members` | 13, com 120 vínculos a quadros |
| Definições de etiqueta / nomes normalizados | 116 / 20 |
| Ações disponíveis | 9.966; 9 quadros no limite de 1.000 |
| Comentários exportados / ausentes indicados por badges | 109 / 105 |
| Cards com prazo / início | 1.455 / 4 |
| Cards sem responsável | 796, incluindo modelos e histórico |

Os conjuntos de arquivados, modelos, concluídos e anexos com exceções podem se sobrepor. Não somar essas categorias como se fossem cards ou arquivos distintos. As contagens representam o snapshot completo, sem afirmar que os cards sem responsável são trabalho atual.

| Quadro | Cards | Arquivados | Modelos | Anexos | Comentários disponíveis | Ausentes indicados |
|---|---:|---:|---:|---:|---:|---:|
| Master Med | 166 | 7 | 2 | 284 | 9 | 11 |
| SPMAR - Complexo Alto do Tietê | 9 | 0 | 2 | 6 | 4 | 0 |
| Liquitudo | 29 | 6 | 2 | 40 | 11 | 0 |
| _Formula Group | 18 | 1 | 2 | 0 | 0 | 0 |
| SUPERBOM | 165 | 3 | 2 | 69 | 8 | 11 |
| Master Health | 135 | 2 | 2 | 161 | 11 | 15 |
| Cafu Camp | 19 | 0 | 2 | 13 | 0 | 0 |
| Primordial cuidados | 104 | 0 | 2 | 74 | 5 | 2 |
| CEVISA | 161 | 3 | 2 | 131 | 8 | 25 |
| Rivellino | 224 | 106 | 3 | 308 | 25 | 15 |
| SPMAR | 133 | 11 | 2 | 143 | 7 | 3 |
| TGA Group | 218 | 17 | 2 | 254 | 21 | 20 |
| Deputada Leci Brandão | 375 | 222 | 2 | 63 | 0 | 3 |
| Magik | 10 | 0 | 2 | 0 | 0 | 0 |

## Padrões de fluxo e proposta de colunas

Há sete famílias de lista presentes nos 14 quadros, considerando também listas arquivadas: Captação/Reunião, Em produção, Revisão interna, Em aprovação, Ajustes, Aprovado/Agendar e a etapa final. Seis famílias têm o mesmo nome normalizado nos 14; a sétima é a etapa final, `CONCLUÍDO` em 13 e `APROVADO - CONCLUÍDO` em Liquitudo.

Sugestão de fluxo de conteúdo: **Ideias → Caixa de entrada → Produção → Revisão interna → Aprovação do cliente → Aprovado / Agendar → Concluído**. Ajustes é um destino de retorno configurável ligado à revisão/aprovação. Captação/Reunião pode permanecer como coluna de apoio conforme a rotina da equipe. Todas as equivalências devem aparecer na prévia, com opções de usar coluna existente ou criar uma nova.

| Origem | Frequência / cards | Sugestão e cuidado |
|---|---|---|
| `PLANEJAMENTO` | 2 quadros / 307 cards | `Caixa de entrada`, equivalência informada pelo usuário |
| `CAIXA DE ENTRADA` | 12 / 119 | `Caixa de entrada` |
| `EM PLANEJAMENTO` | 2 / 0, ambas arquivadas | Relacionar à entrada ou conservar só como histórico de origem |
| `EM PRODUÇÃO` | 14 / 2 | `Produção`; o snapshot não basta para medir uso real da etapa |
| `REVISÃO INTERNA` | 14 / 28 | `Revisão interna`; uma lista arquivada |
| `EM APROVAÇÃO` | 14 / 31 | `Aprovação do cliente` |
| `AJUSTES` | 14 / 13 | `Ajustes`, com retorno definido explicitamente |
| `APROVADO / AGENDAR` | 14 / 17 | Etapa intermediária; uma lista arquivada |
| `CONCLUÍDO` | 13 / 1.079 | `Concluído` |
| `APROVADO - CONCLUÍDO` | Liquitudo / 10 | Revisar se aprovação é o encerramento contratual nesse quadro antes de marcar como final |
| `IDEIAS` | 9 / 6 | `Ideias`; uma lista arquivada |
| `CAPTAÇÃO` ou `CAPTACÃO \| REUNIÃO` | 14 / 28 | Corrigir grafia apenas no nome de destino; conservar original |
| `JOBS` | 5 / 17 | Preservar inicialmente; oferecer classificação por tipo de trabalho em evolução posterior |
| `Tráfego Pago` | 4 / 26 | Preservar inicialmente; considerar filtro/área, pois descreve especialidade e não etapa |
| `DOCUMENTOS` | Master Med / 8 | Manter coluna de apoio; não concluir automaticamente documentos de referência |
| `AUDIOVISUAL` | Rivellino / 0 | Coluna opcional ou classificação de área, com decisão explícita |
| `RIVELLINO`, `RIVELLINO \| JOBS`, `RIVELLINO \| POSTS` | Rivellino / 75 | Conservar listas arquivadas e seus cards; não despejar tudo na entrada |

O código atual dos modelos do Dmanda não garante uma coluna chamada `Caixa de entrada`: o modelo de conteúdo contém `Ideias`, `Briefing`, `Produção`, `Revisão interna`, `Aprovação do cliente` e `Publicado`. Portanto, a prévia precisa consultar as colunas reais do quadro de destino, sugerir `Caixa de entrada` e criá-la quando escolhida e ausente. Não associar por um nome presumido.

**Automação:** em 12 quadros, a heurística de coluna seguinte à aprovação levaria a `AJUSTES`. Em Master Med, `APROVADO / AGENDAR` aparece antes de `EM APROVAÇÃO`, e a busca por “aprova” selecionaria a primeira delas como entrada de aprovação. Liquitudo exige política própria para sua etapa final. Configurar IDs de destino por evento e por quadro, sem depender de ordem ou fragmentos de nomes.

**Conclusão:** existem 173 cards com `dueComplete=true` fora das candidatas a final e 12 sem a marca dentro delas: 185 divergências para revisão. `APROVADO - CONCLUÍDO` foi considerado candidato apenas para medir esse indicador; a análise não aprovou essa equivalência. Arquivamento, conclusão, publicação e aprovação devem continuar sendo estados distintos.

## Campos e vocabulário de entregas

Os 14 quadros têm os mesmos três campos: **Prioridade**, **Tipo de Entrega** e **Pasta do Drive**. A base é adequada para um padrão compartilhado com extensões por cliente.

| Campo | Preenchimento | Sugestão |
|---|---:|---|
| Prioridade | 924 cards: Normal 671, Alta 216, Urgente 37 | Normal → MEDIUM, Alta → HIGH, Urgente → URGENT; manter 842 ausências como null |
| Tipo de Entrega | 935 cards, 17 grafias/opções distintas nas definições | Catálogo de tipos com código estável e nomes editáveis; manter a escolha original |
| Pasta do Drive | 757 cards | Recurso de referência com tipo URL ou caminho local; 3 valores são caminhos de disco/Drive, não URLs |

Proposta para o catálogo de entregas:

| Variantes de origem | Nome padrão sugerido | Regra |
|---|---|---|
| Post Estático | Post estático | Código estável `STATIC_POST` |
| Post Estático + Story / Post estático + Story | Post estático + stories | Mesma entrega, diferença de caixa; 207 cards no total |
| Carrossel | Carrossel | Manter tipo próprio |
| Carrossel + Story / Carrossel + Stories | Carrossel + stories | 79 cards no total; preservar composição |
| Story | Stories | Nome de exibição padronizado |
| Reels / Vídeo Curto | Reels / vídeo curto | Não presumir plataforma ou duração exata |
| Vídeo Longo | Vídeo longo | Separado do vídeo curto |
| Post animado | Post animado | Não fundir com versão que inclui stories |
| Post animado (Feed e Story) | Post animado + stories | Preservar a composição |
| Landing Page / Website | Landing page / Website | Tipos distintos |
| Campanha Ads / Relatório / Material Gráfico / Outro | Campanha de anúncios / Relatório / Material gráfico / Outro | Tipos distintos; `Outro` continua disponível |

Recomendação: modelar uma entrega composta como tipo de demanda com componentes de saída (feed, stories etc.) se o produto precisar filtrar ou controlar entregáveis separadamente. Não desdobrar automaticamente um card em vários, porque isso muda prazo, atribuição, contagem e histórico. `ApprovalPost.format` não representa todo esse catálogo e não deve ser usado como campo genérico de tipo de demanda.

## Etiquetas e pessoas

As sete etiquetas de área aparecem em todos os quadros com as mesmas cores simbólicas: Criação, Audiovisual, ADM, Social Media, Desenvolvimento, Tráfego Pago e Atendimento. Criar um catálogo global dessas áreas evita replicar 98 definições equivalentes. A etiqueta ADM não está ligada a cards neste snapshot; não removê-la apenas por estar sem uso.

Cafu Camp e Rivellino acrescentam formato (`ESTÁTICO`, `CARROSSEL`, `VÍDEO`, `STORY`/`STORIES`), urgência (`PRIORIDADE`, `URGÊNCIA`), revisão (`AJUSTE`, `REVISÃO ARTE`) e etiquetas informais. Sugerir sua classificação na prévia. Manter etiquetas originais até aceitar a conversão; uma etiqueta `URGÊNCIA` não deve sobrescrever silenciosamente uma prioridade preenchida diferente. Há ainda uma etiqueta sem nome em CEVISA, aplicada a um card.

Usar IDs Trello para reunir identidades entre quadros. `members` contém 13 pessoas distintas; autores de ações acrescentam quatro IDs, chegando a 17 identidades nesses dois conjuntos. Há 41 IDs de criadores de cards, dos quais 30 não aparecem em nenhum desses conjuntos e afetam 134 cards. Isso não comprova 30 contas novas a criar: preservar a autoria externa e permitir associação posterior. Os 673 casos de criador fora dos membros do próprio quadro não significam 673 autores desconhecidos; cruzar primeiro todos os arquivos.

As listas de membros e papéis do Trello não autorizam criar contas administrativas no Dmanda. O mapa de pessoas serve para responsabilidade/autoria. Credenciais e privilégios precisam seguir o gerenciamento de equipe do sistema.

## Qualidade, anexos e histórico

- **Arquivamento:** os 75 cards nas três listas antigas de Rivellino precisam manter a visibilidade de arquivo. Dez deles não têm `card.closed=true`; transformar somente o campo individual faria esses cards voltarem à área ativa. Implementar arquivo de coluna e consultas coerentes em quadro, busca, agenda e resumo.
- **Modelos:** todos os quadros têm modelos de briefing e captação/reunião, com uma duplicação adicional de briefing em Rivellino. São 29 cards marcados por `isTemplate`; sete estão arquivados. Recomenda-se suporte explícito a modelos completos, sem colocá-los na carga de trabalho. O `CardTemplate` atual não cobre toda a estrutura de um card; a conversão exige ampliar o modelo ou preservar `Card.isTemplate` com filtragem adequada.
- **Títulos e datas:** 1.321 títulos começam com uma data numérica; 163 desses cards não têm `due`. Não converter `dd/mm` em prazo automaticamente: falta ano e a data pode representar reunião ou publicação. Recomenda-se manter título original e usar campos separados para prazo e publicação nas novas demandas.
- **Duplicidade:** não há IDs de card repetidos entre os 14 exports. Há 61 grupos de títulos iguais após normalização; isso inclui modelos e pode incluir recorrências legítimas. Nunca deduplicar por título.
- **Arquivos:** 15 registros excedem 25 MiB; 23 uploads têm extensões fora da política atual (`m4a`, `rar`, `dng`, `svg`, `cr2`, `avif`). São 31 uploads distintos com pelo menos uma dessas exceções, pois sete pertencem aos dois grupos. Decidir suporte por formato, conversão com original preservado ou pendência aceita; manter SVG fora de renderização ativa sem tratamento apropriado.
- **Links:** 13 anexos são links externos, incluindo destinos em Trello. Tipo de registro (`isUpload`) é evidência melhor que o domínio. Criar referência de link em vez de arquivo falso em storage.
- **Divergência de anexos:** três cards têm mais anexos nos badges do que no array, diferença total de seis registros (dois em Master Med e quatro no quadro Deputada Leci Brandão). A integridade é dos 1.546 registros presentes; não prometer todos os anexos existentes na conta sem reconciliação adicional.
- **Comentários:** 105 textos indicados pelos badges não estão nos JSONs, afetando 83 cards. Os 109 disponíveis devem ser preservados com autoria e data. A [documentação oficial](https://support.atlassian.com/trello/docs/exporting-data-from-trello/) confirma o limite de 1.000 ações por export de quadro e descreve exportação de Workspace para comentários e anexos originais.
- **Checklists:** dois itens em Master Health usam prazo e/ou responsável de item, recursos ausentes no schema atual. Preservar metadados e expor a pendência, ou ampliar o modelo antes da migração final.

## Melhorias sugeridas por prioridade

| Prioridade | Entrega | Razão concreta |
|---|---|---|
| P0, para importar | Prévia por quadro com mapeamento de colunas, pessoas, clientes e etiquetas | 14 fluxos com exceções reais; equivalência Planejamento → Caixa de entrada |
| P0 | Colunas arquivadas e classificação de modelos | Evitar reativar 75 cards históricos ou contar 29 modelos como trabalho |
| P0 | Registro de lote, origem, versão do mapa e execução retomável | Reimportação, falhas e auditoria sem duplicação |
| P0 | Autoria histórica independente de usuário ativo e referências de anexos/links | Criadores sem correspondência e arquivos ainda indisponíveis |
| P0 | Reconciliação por entidade e painel de pendências | 105 comentários indicados como ausentes, seis anexos não detalhados e 31 arquivos com exceções |
| P0, antes de ativar portal | Destinos de aprovação configurados por ID | Heurística atual leva a destinos incorretos |
| P1, padronização | Catálogo global de áreas e tipos de entrega compostos | Campos comuns em todos os quadros, rótulos locais sobrepostos |
| P1 | Modelos reutilizáveis de briefing e captação/reunião | Repetidos em todos os quadros |
| P1 | Visões por área, tipo, responsável e período | Reduz uso de coluna para representar especialidade |
| P1 | Indicadores de cards sem prazo/responsável apenas no trabalho ativo | Snapshot mistura histórico, modelos e demandas atuais |
| P2, evolução | Itens de checklist com responsável/prazo, planejamento editorial e métricas de fluxo | Necessidades observadas; adotar conforme a rotina da equipe |

Não definir um limite de trabalho em andamento só pela quantidade de cards do export: a lista de Planejamento de Deputada Leci Brandão tem 295 cards, incluindo histórico. Medir trabalho ativo após classificar arquivos e modelos. O mesmo vale para estimativas de capacidade e atrasos.

A execução proposta, as decisões pendentes e os critérios de aceite estão no [plano atualizado](import-plan.md). Esta pesquisa não executou importação no banco nem recuperou binários.

## Verificação da pesquisa

As 14 cópias foram comparadas byte a byte com a pasta informada. O verificador confere o conjunto de arquivos contra o manifesto, hashes, resumos por quadro, todos os 1.766 cards e seus campos catalogados, ordem, metadados de anexos, checklists/itens, campos personalizados e comentários disponíveis. Padrões e pendências detalhadas foram recalculados; totais de cards, arquivos, modelos, arquivados, comentários e itens também foram conferidos diretamente nas fontes.

Os seis testes automatizados cobrem normalização de nomes, arquivo de coluna sem alteração do arquivo individual, sobreposição das exceções de arquivos, lacunas de comentários por card, rejeição de quadro duplicado/lista ausente e alinhamento da política de extensões com `storage.ts`. Os scripts passaram por validação de sintaxe e ESLint. Fontes privadas continuam ignoradas pelo Git.

Essas verificações comprovam integridade local e fidelidade da catalogação dos dados disponíveis. Os testes de importação no PostgreSQL e de comportamento na interface continuam como critérios futuros do plano.
