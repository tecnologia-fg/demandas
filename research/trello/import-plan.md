# Plano de importação

**Atualização de 23/10/2026:** os quatro pontos de implementação foram tratados no [executor revisado e preparação para a VPS](final-import.md). As [decisões de conteúdo](migration-decisions.md) foram confirmadas pelo usuário. Os trechos anteriores abaixo documentam as etapas históricas; o plano real de associações ainda exige revisão antes da carga definitiva.

Atualização em 23/10: [revisão das associações](association-review.md) implementada no ensaio. O nome do quadro sugere o cliente; etiquetas podem ser juntadas em um destino ou ignoradas. `__ignore__` no mapa de etiquetas significa não aplicar a etiqueta, enquanto valor vazio continua significando criar/preservar. O executor definitivo deve validar esse contrato e consumir o mapa revisado/exportado.

**Escopo vigente informado pelo usuário:** somente `agenciaformulagroup`. Preservar cards/comentários dos 33 quadros e binários somente dos 15 exports iniciais. A [captura autenticada](api-capture-2026-10-22.md) gera fontes por quadro, manifesto explícito dos arquivos e relatórios separados de falha de download, política do Dmanda e divergências de contadores. O executor deve usar esse manifesto e não todos os arquivos existentes em disco. A política vale também para os outros quadros que o Trello ainda marca como abertos.

Proposta técnica baseada em `prisma/schema.prisma`, nas actions de quadros/cards, em `src/server/richtext.ts`, `src/server/storage.ts`, `src/server/events.ts` e `src/server/approvals.ts`. Este documento descreve trabalho futuro; o script de catálogo não importa dados no banco.

Em 22/10/2026 foi implementada a primeira prévia administrativa em `/configuracoes/importar-trello`. Ela analisa os JSONs no navegador e exporta decisões, sem executar gravação de dados de importação. O [roadmap](roadmap.md) separa prévia, ensaio no Docker e migração definitiva; os critérios de execução deste plano continuam sendo trabalho das etapas seguintes.

**Fonte final recebida em 22/10:** 15 quadros / 1.828 cards / 1.558 registros de anexos, preservados separadamente da base de pesquisa abaixo. O usuário informou cancelamento da assinatura e acesso somente para leitura. A [atualização de transição](cutover-2026-10-22.md) detalha os novos totais e o contrato obrigatório do relatório por anexo, com recuperação automática e intervenção manual identificadas separadamente. Na execução, os critérios numéricos da base anterior devem ser recalculados a partir do manifesto desse snapshot, sem reutilizar seus 1.766 cards como alvo do lote final.

Escopo atualizado em 21/10/2026: **14 quadros e 1.766 cards** dos arquivos de `Downloads/jsons_trello`. O [relatório consolidado](workspace-analysis.md) substitui a amostra inicial como base de decisão. [all-summary.json](all-summary.json) contém o manifesto por arquivo e [patterns.json](patterns.json) contém os padrões e contagens reproduzíveis. Não somar novamente os dois exports da amostra, já incluídos no conjunto.

## Estratégia

Usar os JSONs como fonte do snapshot inicial. O importador deve receber o export, validar referências, permitir escolher um quadro de destino novo ou existente e apresentar a associação das listas antes de importar os cards. Um segundo passo recupera os binários sem bloquear toda a migração por causa de um arquivo indisponível. A API pode complementar histórico e anexos, se houver credenciais autorizadas; o snapshot funciona sem integração contínua.

A prévia é uma tela autenticada para ADMIN. Começar a execução como comando administrativo em ambiente local com PostgreSQL isolado no Docker, consumindo o plano exportado e revalidando as fontes. Depois disponibilizar o mesmo serviço de execução na interface. Não depender de uploads grandes e centenas de downloads dentro de uma única requisição web. Não aproveitar as actions interativas de criar/mover card: elas atribuem datas atuais, geram notificações e podem disparar repetição ou automações.

Tratar a migração como um projeto com manifesto de fontes, regras versionadas, ensaio, reconciliação e corte de operação. A padronização sugerida deve ser revisável na prévia por quadro. Preservar conteúdo e proveniência em todas as escolhas; mudanças de vocabulário não podem apagar valores originais.

## Mapeamento

| Trello | Dmanda | Regra proposta |
|---|---|---|
| Quadro `name`, `desc` | `Board.name`, `description` | Preservar nome e descrição. Associar cada quadro a um cliente existente ou criar explicitamente. SPMAR e Complexo Alto do Tietê podem compartilhar cliente/pasta se escolhido, mantendo quadros separados. Não inferir contato ou portal público. |
| Quadro `closed`, `dateClosed` | `Board.archivedAt` | Preservar arquivamento; se faltar data, registrar data técnica e motivo no lote, sem apresentar como data histórica. |
| Lista `name`, `pos` | `Column.name`, `position` e mapa de origem | Associar cada lista a uma coluna existente ou criar uma nova com nome editável. Em quadro novo, ordenar por `pos`, desempatar por ID e converter posições grandes/fracionárias para inteiros 0..n. Preservar a ordem das colunas existentes. |
| Lista `closed` | Novo `Column.archivedAt` | Há 10 listas arquivadas e 75 cards em três delas em Rivellino. Preservar o arquivo de coluna, incluindo os 10 cards sem arquivamento individual. Listas vazias podem permanecer apenas no registro de origem se escolhido. Nunca descartar cards nem reativar arquivos por mapeamento. |
| Card `name`, `desc` | `Card.title`, `description` | Converter Markdown para HTML e aplicar `sanitizeRich`; preservar Markdown original nos metadados. Não inserir Markdown como HTML bruto. |
| Card `id`, `idShort`, URL | Metadados de origem | Não usar `idShort` como `Card.number`, que é único globalmente. Alocar número Dmanda e guardar o número Trello por quadro. |
| Card `idList`, `pos` | `columnId`, `position` | Resolver a coluna pelo mapa escolhido, incluindo os arquivados. Preservar ordem relativa dentro de cada lista de origem e registrar a lista original nos metadados. |
| Card `closed`, `dateClosed` | `archivedAt` | Preservar separadamente de conclusão e de arquivo da coluna. Há 378 cards individualmente arquivados no conjunto. |
| Card `start`, `due` | `startDate`, `dueDate` | Preservar instantes ISO em UTC; exibição usa o fuso da aplicação. Sinalizar datas inválidas/início após prazo. |
| `dueComplete`, `dateCompleted` | `completedAt` e metadados | Exigir política de conclusão na prévia: preservar marca Trello ou alinhar à coluna final. Nunca mudar lista para acomodar a marca. |
| Membros do card | `CardAssignee` | Mapa explícito ID Trello → usuário existente do Dmanda. Nome não é chave confiável; exports não garantem e-mail. Bloquear vínculos não resolvidos ou registrar escolha explícita de deixá-los pendentes. |
| Criador do card | `createdById` | Usar somente ID de origem resolvido. Campo ausente permanece `null`; importador não vira autor histórico. |
| Etiquetas | `Label`, `CardLabel` | Converter cores simbólicas (`blue_dark`, `black_light` etc.) para hex. Deduplicar por nome e cor com prévia e preservar IDs de origem. Para etiqueta sem nome, propor nome descritivo com ID, evitando fusão silenciosa. |
| Campo Prioridade | `Card.priority` | Normal → MEDIUM, Alta → HIGH, Urgente → URGENT; valor ausente → null. Opções desconhecidas exigem revisão. |
| Tipo de Entrega, Pasta do Drive | Catálogo de tipos e referências | Recomenda-se `deliveryTypeId` com catálogo extensível e referência tipada URL/caminho; há entregas compostas e três caminhos locais. Conservar valor original. Não usar só `driveFolderUrl`, pois rejeitaria os caminhos legítimos. Descrição pode exibir referências, sem substituir os dados estruturados. |
| Checklists e itens | `Checklist`, `ChecklistItem` | Manter ordem e `complete` → `done`; preservar extras de origem como prazo/responsável de item nos metadados, pois o schema não os suporta. |
| Ações `commentCard` | `Comment` com autoria externa | Corpo convertido e limpo, `createdAt` original e autor associado quando resolvido. O schema atual exige `userId`; recomenda-se torná-lo opcional com autoria histórica preservada. Até essa adaptação, autor sem mapa é pendência ou exige escolha explícita de conta técnica com autoria original visível. |
| Outras ações | `Activity` e arquivo de origem | Traduzir apenas eventos conhecidos para os tipos de `ACTIVITY_TEXT`. Não reexecutar movimentos antigos. Conservar ações sem tradução no lote; não recriar cards excluídos. |
| Anexos | `Attachment` após obter arquivo | Só criar anexo local quando existir binário íntegro em storage com nome gerado. Antes disso, manter referência pendente e URL de origem. |
| `idAttachmentCover`, `cover` | `coverAttachmentId`, `coverColor` | Vincular capa após importar o arquivo; cores precisam da tabela hex. Guardar outras preferências de capa sem equivalente nos metadados. |
| `dateLastActivity` | Metadados | Não tratar como criação. `createdAt` pode vir de ação `createCard`; quando faltar, registrar estimativa derivada do ID Trello ou data técnica com proveniência explícita. Não inventar precisão histórica. |
| `isTemplate` | Suporte explícito a modelo completo | Há 29 modelos, sete arquivados. Preservar identidade, conteúdo e arquivo. Adicionar `Card.isTemplate` com exclusão das visões de trabalho ou ampliar `CardTemplate` para representar a estrutura completa antes da conversão. Nunca importar silenciosamente como demanda ativa. |
| Recorrência/Power-Ups | Metadados e pendências | Não há `recurrenceRule` preenchida nos 1.766 cards. Não ativar repetições por títulos semelhantes. Conservar demais dados sem equivalente. |

## Escolha das colunas na importação

Requisito informado pelo usuário: permitir criar colunas e/ou relacionar as listas do Trello às colunas do Dmanda. A equivalência confirmada é **`PLANEJAMENTO` do Trello → `Caixa de entrada` do Dmanda**. O destino deve ser identificado pelo ID da coluna escolhida, não apenas pelo nome.

Na prévia, cada lista deve mostrar nome original, quantidade de cards e uma escolha entre **usar coluna existente** e **criar nova coluna**. Para uma nova coluna, sugerir o nome original e permitir editar nome e posição. Em um quadro novo, pode-se partir de um modelo do Dmanda e relacionar as listas às colunas desse modelo. Listas sem equivalência podem criar colunas adicionais, como `JOBS` ou `CAPTAÇÃO | REUNIÃO`.

| Lista Trello | Sugestão inicial no Dmanda | Situação |
|---|---|---|
| PLANEJAMENTO | Caixa de entrada | Equivalência informada pelo usuário |
| CAIXA DE ENTRADA | Caixa de entrada | Sugerir se existir no destino |
| EM PLANEJAMENTO | Caixa de entrada | Sugestão a revisar; na CEVISA e SUPERBOM está arquivada e vazia |
| Demais listas | Coluna equivalente existente ou nova com o nome original | Escolher na prévia |

Sugestões por nome normalizado ou equivalência ajudam a preencher a prévia, mas não devem unir colunas silenciosamente. Permitir várias listas de origem na mesma coluna de destino: por exemplo, `PLANEJAMENTO` e `CAIXA DE ENTRADA` podem compartilhar `Caixa de entrada` se essa for a escolha. Cada card continua ligado à sua lista Trello original nos metadados.

Quando várias listas forem reunidas, anexar os cards importados ao fim dos cards já existentes, agrupados pela ordem das listas Trello e depois pela posição original de cada card, com desempate por ID. A prévia deve mostrar essa ordem. Reexecuções não devem reposicionar cards já importados ou editados localmente.

Todas as listas com cards precisam de destino válido antes da gravação. Omissão só é permitida para lista vazia, com registro explícito. Validar que as colunas selecionadas pertencem ao quadro de destino e revalidar dentro da transação; uma coluna excluída durante a prévia deve interromper a execução com erro claro. A quantidade de colunas finais pode diferir das 128 listas abertas de origem.

Combinar várias listas é permitido somente com compatibilidade de visibilidade e função. Não combinar listas arquivadas com uma coluna ativa por padrão; manter destinos arquivados separados para Rivellino. Se houver decisão explícita de reativação, apresentá-la como mudança de operação por card, com auditoria e contagens. O importador não deve usar arquivamento individual falso para disfarçar ausência de suporte a arquivo de coluna.

As sugestões completas de nomes, áreas e entregas estão no [relatório](workspace-analysis.md). Os modelos atuais do Dmanda não garantem `Caixa de entrada`; essa coluna deve ser buscada no quadro real ou criada na prévia. Oferecer dois perfis iniciais: preservar estrutura Trello e aplicar padrão da agência com equivalências revisáveis. Ambos usam o mesmo mecanismo de mapa por ID.

Salvar no lote as escolhas por ID de lista, incluindo colunas criadas, associações existentes e ordem de reunião. Os registros `ExternalEntity` devem permitir que várias listas externas apontem para a mesma coluna. Colunas reutilizadas mantêm nome, posição, cor, limite e configuração de conclusão; a importação não deve renomeá-las ou alterar suas regras automaticamente.

## Conclusão e aprovação exigem cuidado

Para colunas novas, sugerir `isDone=true` para `CONCLUÍDO`; revisar explicitamente a candidata `APROVADO - CONCLUÍDO` de Liquitudo e manter `APROVADO / AGENDAR` como intermediária. Colunas existentes mantêm sua configuração. Há 185 divergências originais: 173 marcados fora das candidatas a final e 12 desmarcados dentro. Mostrar também divergências introduzidas pelo mapeamento escolhido. Se a opção for alinhar à etapa, considerar `isDone` da coluna de destino e usar a conclusão histórica conhecida quando coerente; se não houver data, registrar uma data técnica com proveniência. Se a opção for preservar a marca, importar `dateCompleted` e aceitar que o estado inicial pode divergir da regra de coluna. Depois da importação, os movimentos do Dmanda aplicam sua regra normal. Não usar `dateLastActivity` como data comprovada de conclusão.

Não gerar `ApprovalPost` ou rodadas aprovadas a partir do nome da coluna. Estar em `APROVADO / AGENDAR` não comprova decisão, autor, versão de arte ou envio pelo portal do Dmanda. Links e tokens públicos devem nascer somente de ações explícitas posteriores.

Há incompatibilidade entre o fluxo exportado e a automação atual: `approvalColumns()` busca a primeira coluna não concluída com “aprova” no nome e escolhe a seguinte ao aprovar. Na ordem ativa exportada, 12 quadros levam a `AJUSTES`; em Master Med, `APROVADO / AGENDAR` é selecionada como entrada de aprovação porque vem antes de `EM APROVAÇÃO`. Liquitudo tem configuração distinta. Antes de habilitar o portal, definir por quadro os IDs para enviar à aprovação, aprovar, pedir ajuste e publicar. O padrão sugerido é aprovar → `Aprovado / Agendar`, pedir ajuste → `Ajustes`, publicar → `Concluído`, com retorno de ajuste à revisão configurável. Validar destinos existentes, ativos, no mesmo quadro e compatíveis com conclusão. Preservar a ordem ou padronizar nomes não resolve essa automação por si só.

## Anexos e histórico

Os 1.546 registros contêm 1.533 uploads e 13 links externos; os binários não estão nos JSONs. O tamanho declarado é aproximadamente 3,43 GiB. Obter preferencialmente o ZIP do Workspace com anexos originais. Para alternativa por API, usar autenticação e documentação oficial no momento da implementação; não guardar tokens em URLs, logs ou no repositório. A [introdução oficial à API](https://developer.atlassian.com/cloud/trello/guides/rest-api/api-introduction/) descreve autorização, tokens e paginação.

O Dmanda atualmente aceita até 25 MiB e uma lista fechada de extensões. Há 15 registros acima desse limite e 23 uploads com extensões não aceitas (`m4a`, `rar`, `dng`, `svg`, `cr2`, `avif`), formando 31 uploads distintos com pelo menos uma exceção. Cada caso deve virar pendência visível ou receber suporte deliberado na política de storage; não descartar ou renomear extensão para contornar validação. Recomenda-se conservar o original em armazenamento privado e, quando houver conversão, registrar original, derivado e checksum separadamente. O suporte visual de formatos como SVG requer tratamento próprio.

Downloads precisam de controle de host e redirecionamentos, limite real de bytes durante streaming, verificação de tipo, timeout, checksum e limpeza de temporários. Links externos permanecem links, sem download automático de conteúdo arbitrário. Só usar `Attachment.storedName` para um arquivo realmente existente, nunca para a URL do Trello.

Há 9.966 ações disponíveis, com nove quadros no limite de 1.000. Recuperar comentários completos via exportação de Workspace ou API paginada é necessário para fidelidade histórica completa. A prévia deve mostrar 109 comentários disponíveis e 105 indicados como ausentes em 83 cards. Os badges de anexos também indicam seis registros não detalhados em três cards; manter essa divergência como pendência de origem, separada de falha de download. Não reconstruir texto, autoria ou anexos a partir de contagens. As janelas de ações por quadro estão em `all-summary.json`.

## Rastreabilidade, transação e retomada

Adicionar modelos de migração antes de gravar em banco:

- `ImportBatch`: provedor, ID do quadro de origem, hash do arquivo, usuário executor, opções, status, contagens, avisos e datas. Armazenar fonte privada fora de `public/`.
- `ExternalEntity`: provedor, tipo, ID externo, ID Dmanda, lote e metadados originais. Restrição única por `(provider, entityType, externalId)`; para fontes com IDs apenas locais, incluir o escopo/quadro. Tipos incluem quadro, lista, card, membro, etiqueta, checklist, item, comentário, ação e anexo.
- `ImportFile`: referência do anexo, estado pendente/baixando/concluído/falhou/ignorado, checksum, tentativas e erro seguro. Conservar origem mesmo quando o arquivo não puder ser recuperado.

O lote deve referenciar um manifesto fechado com o hash de todos os arquivos selecionados e uma versão do plano: mapas de quadro/coluna, pessoas/clientes, etiquetas, tipos de entrega, conclusão e destino dos modelos. A execução usa essa versão; mudanças na origem ou no mapa invalidam a prévia anterior. Cada quadro é uma unidade de execução e reconciliação dentro do lote global.

Estados sugeridos: analisado, aguardando revisão, pronto, em execução, parcial, concluído e falhou. “Parcial” inclui cards importados com arquivos ou histórico pendentes. Cada pendência registra código, entidade, impacto, decisão, responsável pela decisão e evidência de resolução ou aceite. Não converter “ignorado” automaticamente em “recuperado”.

Na primeira versão, reexecutar o mesmo lote deve retomar arquivos e ignorar entidades já concluídas. Um snapshot diferente do mesmo quadro deve pedir um modo explícito: rejeitar como já importado ou atualizar com política de conflitos. Não sobrescrever edições locais silenciosamente. Restrições únicas e lock por quadro de origem precisam impedir duplicação em execuções concorrentes.

Criar estrutura, cards e relações numa transação por quadro, junto dos mapas externos. Reservar números globais de card sob lock/transação adequada ou sequência PostgreSQL: a função atual `nextCardNumber()` usa máximo + 1 e não resolve concorrência sozinha. Importar sem notificações individuais, repetições, favoritos automáticos de autores ou eventos de aprovação. Ao concluir, registrar auditoria do lote e emitir atualização do quadro uma vez.

Anexos ficam numa fase retomável fora dessa transação. Em rollback administrativo de um lote, remover apenas entidades e arquivos criados por ele que não tenham sido editados/reutilizados; nunca apagar usuários, clientes ou etiquetas preexistentes associados durante a importação.

Para o volume observado, um worker retomável e um registro persistente de tarefas no PostgreSQL são um ponto de partida suficiente. Separar a requisição de envio/prévia da execução, limitar concorrência e tamanho dos downloads, aplicar tentativas com espera crescente para falhas transitórias e encerrar falhas permanentes como pendências. A interface acompanha progresso por quadro, entidade e arquivo, sem depender de uma conexão HTTP longa.

## Melhorias do modelo e padrão operacional

Priorizar suporte a colunas arquivadas, modelos completos, referências de arquivos/links, origem e autoria histórica antes da migração definitiva. Para `Comment`, preferir autor externo preservado com `userId` opcional e campos de nome/ID de origem, em vez de atribuir comentários a uma conta técnica por padrão. Há três comentários cujo autor não consta em `members` do próprio quadro; resolver primeiro no conjunto global de membros e ações. Criadores ausentes podem permanecer sem usuário Dmanda, com autoria externa visível e sem conceder acesso.

Implantar catálogo de áreas com as sete etiquetas comuns e catálogo de tipos de entrega com códigos estáveis, aliases e componentes para entregas compostas. O [relatório consolidado](workspace-analysis.md) traz equivalências específicas e contagens. O mapeamento de etiqueta para prioridade, tipo ou etapa é uma transformação separada e revisável; não sobrescrever campo estruturado com uma inferência de etiqueta.

Manter configurações de fluxo por quadro com IDs de coluna para entrada, produção, revisão, aprovação, ajuste, aprovado/agendar e conclusão. Usar nomes para exibição e aliases para sugestões de importação. Não gerar eventos de aprovação ou publicação retroativos ao aceitar esse padrão.

Referências de Drive devem aceitar URL e caminho textual, sem transformar os três caminhos locais encontrados em links quebrados. Títulos ficam intactos na migração: há 163 títulos com prefixo de data e sem prazo estruturado. Uma eventual extração exige prévia, ano, significado e fuso definidos; não deve fazer parte da importação padrão.

Propor modelos compartilhados de briefing e captação/reunião com campos mínimos para novas demandas (cliente, área, entrega, responsável e datas relevantes), sem obrigar a completar esses campos em todo o histórico. Indicadores e limites de trabalho em andamento devem excluir arquivos e modelos. Não inferir atraso ou capacidade a partir dos 796 cards sem responsável no snapshot.

## Ensaio, corte de operação e acompanhamento

1. **Preparação:** fechar manifesto de 14 arquivos e mapas, classificar as pendências e confirmar qual fonte será usada para recuperar anexos/comentários. Distinguir migração dos snapshots fornecidos de migração integral da conta. Se for necessária prova de cobertura de todos os quadros, reconciliar os IDs com um inventário autorizado do Workspace.
2. **Ensaio no Docker:** aplicar migrations em PostgreSQL isolado e importar uma cópia integral. Escolher pilotos que cubram comportamento: Magik para estrutura/modelos, CEVISA para entregas compostas e lacunas de comentários, Rivellino para listas arquivadas e anexos, Master Med para ordem de aprovação, Liquitudo para etapa final e Deputada Leci Brandão para grande lista com histórico. Depois executar o lote completo.
3. **Revisão funcional:** revisar destinos, visibilidade dos arquivos, modelos, autoria e exceções por quadro. A pessoa que executa deve ter relatório legível de antes/depois e mudanças de vocabulário antes de aplicar no ambiente real.
4. **Corte:** definir janela sem novas edições no Trello ou gerar exports finais e analisar diferenças antes da execução. Não misturar snapshots antigos com novos sem decisão registrada. Fazer backup do banco e storage de destino e registrar os hashes do lote final. Evitar operação simultânea nos dois sistemas sem sincronização projetada.
5. **Execução e reconciliação:** executar por quadro, retomar arquivos pendentes e conferir valores/relações por ID. A quantidade é um indicador, não prova suficiente de fidelidade. Manter mapas de links antigos e novos para consulta; links internos a cards podem ganhar alternativa Dmanda quando o destino existir, conservando o original.
6. **Entrega e acompanhamento:** disponibilizar relatório de importados, preservados como modelos/arquivos, transformações, falhas e aceites. Liberar o trabalho e o portal conforme os critérios validados. Conservar a fonte e a trilha do lote para auditoria e eventual reversão controlada; qualquer exclusão posterior de fontes deve seguir decisão de retenção própria do projeto.

## Execução e critérios de aceite futuros

1. Validar JSON, unicidade dos IDs, referências, datas, tamanhos e campos desconhecidos. A entrada é dado, nunca instrução executável.
2. Mostrar prévia com listas, arquivados, campos, conclusão, pessoas, etiquetas, comentários e arquivos pendentes. Selecionar quadro, clientes, política de conclusão e destino de cada lista: coluna existente ou nova. Exibir `PLANEJAMENTO` → `Caixa de entrada` como equivalência sugerida conforme orientação do usuário.
3. Subir PostgreSQL isolado no Docker, aplicar migrations nesse banco e executar primeiro a simulação. Definir `DATABASE_URL` e `DIRECT_URL` explicitamente para esse banco, sem aproveitar implicitamente `.env`.
4. Executar importação dos 14 quadros. Conferir por ID externo os 1.766 registros de card (incluindo os 29 modelos), 378 arquivamentos individuais, o mapeamento das 128 listas abertas e dez arquivadas, sete checklists com 50 itens e 1.546 referências de anexos/links. Os 75 cards em listas arquivadas devem manter a visibilidade de arquivo, incluindo os dez não arquivados individualmente. Se modelos forem convertidos, reconciliar a soma de demandas e modelos com os 1.766 IDs de origem. A contagem de colunas finais deve corresponder ao mapa escolhido, sem exigir uma coluna por lista.
5. Comparar título, descrição renderizada, ordem, datas, etiquetas, responsáveis, autoria externa, campos e comentários por card. Verificar os 109 comentários disponíveis e informar os 105 indicados como ausentes. Reconciliar os seis registros de anexo indicados apenas nos badges e os dois itens de checklist com prazo/responsável; recuperação ou aceite deve ficar registrada. Não declarar esses dados como recuperados com base em contagens.
6. Reexecutar o lote e executar concorrência: nenhum card, relação ou número duplicado. Simular falha no meio da transação e falha de download; a primeira reverte o quadro, a segunda deixa pendência recuperável.
7. Conferir binários por checksum e abrir amostras no sistema. Arquivos indisponíveis, grandes ou não suportados devem continuar identificados.
8. Testar pela interface os quadros, cards arquivados, calendário, checklists, comentários e capas, além de confirmar ausência de notificações em massa. Se o portal for habilitado, validar aprovar/ajustar/publicar com os destinos explícitos.
9. Testar mapeamento para coluna existente, criação com nome editado e reunião de várias listas numa coluna. Conferir ordem dos cards, preservação dos cards preexistentes e dos nomes/configurações das colunas reutilizadas. Rejeitar coluna de outro quadro, destino excluído e lista com cards sem destino. Reexecutar sem duplicar colunas ou cards e sem reordenar trabalho local.
10. Testar que arquivos de coluna e modelos não aparecem indevidamente na agenda, resumo, busca de trabalho ativo ou notificações. Confirmar que mudar a apresentação não altera `card.closed` de origem. Validar os sete modelos arquivados e a preservação das suas datas e conteúdos.
11. Reconciliar 1.533 uploads e 13 links como classes diferentes. Para os 31 uploads com exceção de política, conferir a decisão individual; se houver conversão, abrir original/derivado e conferir hashes. Nenhuma referência deve fingir que o binário existe em storage.
12. Verificar permissões administrativas no importador, ausência de criação implícita de contas ou promoção de papéis, isolamento de fontes/URLs privadas e logs sem credenciais. Testar reexecução com mapa alterado, entrada alterada e conflito com edição local.
13. Emitir relatório de reconciliação por origem/tipo/ID com resultado preservado, transformado, pendente ou aceito. Critério obrigatório: nenhum ID de origem sem destino ou decisão explícita; nenhuma transformação sem regra/proveniência; nenhuma duplicação em retomada. Registrar duração, volume e falhas do ensaio para dimensionar a janela real.

Só chamar a migração de completa quando não houver pendências não aceitas. A existência do catálogo comprova a pesquisa e a preservação local do snapshot; não comprova uma importação executada.
