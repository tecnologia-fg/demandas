# Publicação e carga na VPS — 23/10/2026

O código da migração foi publicado na `main` no commit `46124ea`. A build de produção, os tipos e os 31 testes passaram; ESLint sem erros, com um aviso preexistente no teste de simulação.

A migration `20261022000000_trello_import` foi aplicada na VPS e o catálogo das 12 contas foi conferido antes e depois. O usuário dispensou o backup prévio por haver somente contas cadastradas e pausou o Auto Deploy. O deploy manual foi realizado, e o usuário confirmou que um arquivo enviado por uma demanda continuou disponível depois de outro redeploy.

O acesso SSH foi configurado por chave; a chave privada fica fora do repositório. `.env.ssh`, `.env.vps`, fontes, backups e relatórios reais permanecem privados e ignorados pelo Git.

## Preparação do destino

`scripts/trello/prepare-destinations.mjs` validou e criou 24 clientes e 18 etiquetas, sem criar ou alterar usuários ou quadros. A repetição confirmou zero novas criações. Os bindings explícitos e o plano com IDs de produção ficam em `local/vps/destinations/`.

Os 33 quadros mantêm as escolhas aprovadas: 27 com cliente, seis sem cliente. SPMAR, Master e WINNERS compartilham seus respectivos clientes; Cafu Academy e Cafu Camp têm clientes separados. Etiquetas sem nome, ARRASOU <3 e ajuda noisss são ignoradas.

## Transferência e execução

`scripts/trello/prepare-transfer.mjs` seleciona os arquivos dos manifestos e metadados de integridade, sem empacotar credenciais. A captura transferida tem 4.136.694.784 bytes e SHA-256 `395d27ad7dd5c1c67166cf1cbc323fa673d3f8664107ad6957515fed6ffd7f68`. O checksum foi conferido na VPS.

Uma cópia privada e durável da captura e dos planos está em `/root/dmanda-migration-20261022/`. O staging dentro do container fica em `/app/.trello-migration/` e pode desaparecer no próximo deploy. Os arquivos operacionais foram direcionados ao volume nomeado `dmanda-storage`, montado em `/app/storage`; o staging não substitui esse volume.

O preflight executado localmente contra o destino e novamente dentro do container produziu o mesmo hash do plano: `02786259d416de8f505a7f01c16fc3522dac29d7303015b94fd873c20cc5ace1`. O lote definitivo é `trello_20261022_final`, com 33 quadros concluídos. Não trocar o identificador para repetir a carga.

O usuário confirmou ter excluído a demanda com o anexo de teste e arquivado o quadro de teste durante a preparação. Essas ações devem permanecer preservadas, com o registro explícito da confirmação; a auditoria também verifica o evento de arquivamento no log da aplicação. Não restaurar os dados de teste automaticamente.

## Conferência

A auditoria `scripts/trello/audit-cutover.mjs` passou em 23/10/2026 às 05:47 UTC. Confirmou 33 quadros, 3.737 cards, 69 modelos, 425 comentários e 1.513 arquivos, totalizando 2.962.598.552 bytes. Todos os arquivos operacionais coincidem em tamanho e SHA-256 com o backup. Há 1.491 cards com responsáveis, 2.335 vínculos, 298 comentários associados às contas e 127 com autoria externa; as 12 contas anteriores permanecem preservadas. Os 16 fluxos de aprovação foram conferidos por ID.

O plano definitivo cria 313 colunas. Vinte listas arquivadas e vazias são omitidas como colunas, conforme o padrão da prévia; sua proveniência e o estado `OMITTED_EMPTY` permanecem registrados. A auditoria confirma que nenhuma lista omitida contém cards. As três etapas extras do Liquitudo estão incluídas nas 313 colunas.

Os relatórios reais ficam em `local/vps/production-output/`, com uma cópia fora do container em `/root/dmanda-migration-20261022/output/`. O endpoint de login respondeu HTTP 200 após a carga. O Auto Deploy não foi reativado por esta operação. Ainda cabe à equipe a conferência visual em produção e a configuração dos backups recorrentes do banco e do volume.

Os 32 arquivos adiados permanecem na captura. Seis referências de anexos e o texto de um comentário não recuperados continuam registrados como ausências aceitas. Arquivos dos quadros históricos permanecem fora do escopo de binários.
