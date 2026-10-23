# Revisão das associações — 23/10/2026

**Atualização de 23/10/2026:** os quatro pontos de implementação foram tratados no [executor revisado e preparação para a VPS](final-import.md). As [decisões de conteúdo](migration-decisions.md) foram confirmadas pelo usuário. Os trechos anteriores abaixo documentam as etapas históricas; o plano real de associações ainda exige revisão antes da carga definitiva.

Regra informada pelo usuário: o nome do quadro corresponde ao cliente e deve servir como sugestão ao cadastrar/associar clientes em testes futuros. Um cliente pode ter vários quadros. A prévia sugere o cliente existente por nome exato ou, havendo um único candidato, pelo prefixo `Cliente - Projeto`. Isso cobre SPMAR e o projeto Alto do Tietê sem juntar seus quadros. A sugestão continua editável e não cria cadastros automaticamente.

## Revisão central de etiquetas

No ambiente do Docker, acessar **Configurações → Importar Trello → Revisar e juntar etiquetas** ou `/configuracoes/importar-trello/etiquetas`. Usa diretamente os dados preservados no banco do ensaio, sem exigir nova seleção de JSONs.

O inventário contém 303 definições de origem, com 25 nomes literais diferentes contando o grupo sem nome. Os IDs se repetem semanticamente entre quadros: cada uma das sete áreas principais aparece em 31 quadros. A revisão agrupa nomes equivalentes para não exigir uma decisão para cada ID; etiquetas sem nome permanecem individuais, pois a cor não demonstra equivalência de significado.

Cada grupo mostra quantidade de definições, quadros, cards afetados, cores de origem e destino atual. As opções são:

- **Manter como está:** preserva as associações atuais.
- **Associar/juntar:** várias origens podem usar uma única etiqueta existente do Dmanda. A associação no mesmo card é deduplicada.
- **Criar uma única etiqueta nova:** nome e cor editáveis; todas as origens desse grupo usam o novo cadastro.
- **Ignorar:** remove a associação dessa origem nos cards importados, mantendo a informação original no registro de importação.

Sugestões por nome e o botão de ignorar etiquetas sem nome preenchem escolhas para revisão. A gravação ocorre somente em **Aplicar revisão de etiquetas**. Busca por nome permite localizar rapidamente pares como STORY/STORIES. A exportação **Associações aplicadas** registra cada ID de origem, quadro, nome/cor original e destino ou decisão de ignorar.

Sugestões para começar: conservar as áreas de equipe; revisar STORY/STORIES e Tráfego Pago/trafego_pago para unificação; decidir se etiquetas de status, urgência e formato ainda são úteis diante das colunas e campos do Dmanda. Essas equivalências não foram aplicadas automaticamente.

## Aplicação e reversão

A aplicação é administrativa, transacional e restrita às origens Trello e aos cards importados associados a elas. Mantém outras etiquetas dos cards. Etiquetas órfãs só saem do catálogo quando há evidência de que foram criadas pela importação, não têm vínculos de card, referências de importação ou uso nos modelos salvos. Etiquetas já existentes do Dmanda não são excluídas por esse processo.

O lote de revisão guarda decisões, vínculos e mapeamentos anteriores e posteriores, etiquetas criadas/removidas e impressão digital do estado. O registro administrativo identifica quem aplicou/desfez. **Desfazer última revisão** restaura as associações e os cadastros removidos. Se houver mudança posterior nas etiquetas/cards, a operação pede nova revisão em vez de sobrescrever esse estado silenciosamente.

A prévia por JSON também permite **Ignorar — deixar sem esta etiqueta**. Essa decisão é diferente do valor vazio anterior, que significa criar/preservar a etiqueta. O plano guarda `__ignore__` e identifica essa convenção em `policies.ignoredLabelTarget`; o executor definitivo deve respeitá-la.

## Verificação

25 testes automatizados aprovados; tipos e ESLint dos arquivos alterados aprovados. Teste real no Edge/Docker juntou Audiovisual a Criação e ignorou uma origem sem nome, exportou o resultado e desfez a revisão. A impressão digital dos vínculos, mapeamentos de origem e catálogo voltou exatamente ao valor anterior. Os testes não deixaram essas decisões aplicadas. Fluxo validado em desktop/celular, sem overflow, erro JavaScript ou respostas HTTP 5xx na execução final.

Evidências privadas em `local/rehearsal/label-review/`: exports antes/depois/restaurado, resultado JSON e capturas. O banco principal não foi alterado. As revisões feitas no ensaio devem ser exportadas e revalidadas contra o catálogo do destino definitivo; IDs locais não comprovam que uma etiqueta existe em outro banco.
