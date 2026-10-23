# Revisão antes da publicação — 23/10/2026

**Revisão final de clientes e etiquetas:** aplicada somente no Docker, com registros transacionais das associações anteriores. São 24 clientes em 27 quadros; seis quadros internos, genéricos ou de teste ficam sem cliente. SPMAR, Master e WINNERS compartilham seus respectivos clientes entre dois quadros; Cafu Academy e Cafu Camp têm clientes separados, conforme correção explícita do usuário. As 303 definições de etiquetas resultam em 18 etiquetas: STORY/STORIES, URGENTE/URGÊNCIA, AJUSTE/ALTERAÇÃO e as grafias de Tráfego Pago foram unificadas. As 11 definições sem nome, ARRASOU <3 e ajuda noisss foram ignoradas. O plano privado `local/rehearsal/reviewed-plan.json` incorpora clientes, usuários e etiquetas e foi validado para os 33 quadros e 16 fluxos de aprovação. Os IDs locais de clientes/etiquetas ainda exigem cadastros e bindings explícitos para a VPS. Nenhuma escrita em produção foi realizada.

**Atualização após aprovação dos nomes:** as 12 correspondências foram aprovadas pelo usuário e aplicadas somente no ensaio Docker. O resultado é 1.491 cards com responsáveis (2.335 vínculos), 298 comentários vinculados à equipe, 127 comentários com autoria externa e 87 identidades externas. A execução repetida não duplicou vínculos. O ensaio tem as 12 contas locais com os IDs do catálogo da VPS, além do administrador de teste. Nenhuma senha de produção foi consultada ou copiada, e nenhuma conta na VPS foi alterada. Clientes e etiquetas ainda exigem a revisão descrita abaixo.

A revisão encontrou e corrigiu problemas de concorrência, preservação de dados e comportamento dos quadros importados. A produção foi consultada somente para exportar o catálogo; nenhuma migration, importação ou alteração de conta foi executada na VPS.

## Correções

- Duplicar quadro e salvar modelo de quadro agora consideram somente colunas ativas e demandas comuns visíveis. Cards de listas arquivadas e modelos do Trello não reaparecem como demandas operacionais.
- Reordenar colunas usa somente as colunas visíveis e rejeita IDs repetidos, preservando listas arquivadas.
- A reserva de números ao copiar/criar quadros compartilha o bloqueio das outras criações e da importação.
- O registro do lote é serializado: dois processos não podem importar planos divergentes para o mesmo lote ou iniciar outro lote da mesma captura.
- O storage não substitui um arquivo existente se seu conteúdo divergir do backup. Arquivos temporários de cópia são removidos também em caso de falha.
- O relatório de anexos precisa coincidir com o manifesto em identidade, caminho, tamanho, hash, escopo e política. Identidades, data de captura e contadores de ausências também passam por conferência de integridade.
- A retomada reconhece as colunas extras de aprovação criadas pelo próprio lote. Colisões sem essa proveniência continuam rejeitadas.
- A exportação de aprovação resolve a lista de origem no quadro correto e usa os nomes atuais das colunas extras.
- Desfazer uma revisão de etiquetas preserva etiquetas usadas por modelos salvos depois da revisão.
- A linha de comando rejeita opções desconhecidas ou incompletas; falhas de conexão do exportador não imprimem credenciais.

## Verificação

A carga completa após as correções passou com 3.737 cards, 425 comentários, 1.513 arquivos, 32 arquivos mantidos somente no backup, 16 fluxos de aprovação e três colunas extras. Incluiu conflito entre planos concorrentes, falha dentro da transação, retomada sem duplicação e preservação de edição posterior.

O teste de migration sobre o schema anterior, já com cadastros, confirmou preservação de usuários, senhas, clientes e comentários. O exportador de catálogo funciona antes da migration Trello.

O teste de navegador confirmou reordenação com lista arquivada, cópia de quadro e criação de modelo sem trazer cards arquivados ou modelos como demandas comuns. Entidades temporárias são removidas por seus IDs de teste. Os relatórios detalhados ficam na pasta privada `local/rehearsal/`.

Os 31 testes automatizados passaram; tipos passaram; ESLint não apresentou erros, com um aviso preexistente em `scripts/e2e/simulacao.ts`.

## Associações reais

O catálogo consultado da VPS contém 12 usuários ativos e nenhum cliente, quadro ou etiqueta. O arquivo privado `local/vps/user-associations.proposed.md` apresenta as 12 correspondências propostas com a equipe do Trello, por nome e e-mail corporativo, vinculadas aos IDs de ambos os sistemas.

As propostas cobrem todos os 1.491 cards com responsáveis. Dos 425 comentários, 298 correspondem a essas contas e 127 permanecem com autoria externa. As outras 87 identidades, incluindo a conta de cliente Deputada Leci Brandão e contas históricas, não são associadas automaticamente. Os números de atribuições por pessoa podem somar mais que 1.491, pois um card admite vários responsáveis.

O arquivo privado `local/vps/label-review.proposed.md` apresenta a consolidação proposta das etiquetas por nomes normalizados, preservando as diferenças de significado e destacando cores diferentes e etiquetas sem nome. Nenhum merge real foi aplicado pela revisão.

O ensaio interativo mantém o plano inicial provisório como registro histórico. As associações de usuários foram aplicadas em um lote separado, `trello_users_review_20261023`, com backup dos vínculos anteriores. Apenas os dois quadros SPMAR têm cliente associado. O arquivo `local/rehearsal/association-review.md` discrimina os quadros e sugere clientes a partir dos nomes, conforme orientação do usuário; propostas de clientes não criam cadastros.

O plano aprovado está em `local/rehearsal/user-associations.approved.json`, o mapa completo de identidades em `local/rehearsal/approved-people-map.json` e a verificação em `local/rehearsal/user-associations-result.json`. O mapa deve ser incorporado às escolhas `people` dos quadros no plano final. O script `scripts/trello/apply-user-review.mjs` é restrito ao banco local do ensaio; não é um executor para produção.

Antes da carga definitiva é necessário aplicar e conferir o plano real de associações localmente, criar os clientes/etiquetas explicitamente escolhidos no destino e validar os respectivos IDs. Depois, gerar backup do banco/storage e executar a subida e importação autorizadas. O código e o plano de dados são entregas distintas: publicar o código não aplica automaticamente a carga Trello.

`.env.vps` contém a conexão privada para comandos explícitos; não é carregado automaticamente pelo Next ou pelo Docker do ensaio e está ignorado pelo Git. Não executar seed ou reset nesse banco.
