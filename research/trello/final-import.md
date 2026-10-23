# Executor revisado e preparação para a VPS

Atualizado em 23/10/2026. A implementação consome o plano revisado da prévia e foi validada em um segundo banco PostgreSQL local, separado do ensaio interativo. A VPS ainda não foi alterada. A escolha real de usuários, clientes, etiquetas e destinos de aprovação continua sendo uma revisão da equipe.

**Atualização posterior:** as associações reais foram aprovadas e aplicadas no Docker, conforme [revisão antes da publicação](pre-release-review.md). O plano privado `local/rehearsal/reviewed-plan.json` cobre os 33 quadros, 24 clientes, 18 etiquetas e as 12 contas da VPS. Os cadastros e bindings de clientes/etiquetas do destino ainda precisam ser preparados; publicar o código não importa os dados. O usuário dispensou o backup prévio do banco por conter somente usuários, confirmou as variáveis atualizadas e informou que o Auto Deploy está parado.

## Os quatro pontos

1. **Executor do plano:** `scripts/trello/import.mjs` valida hashes, escopo completo de 33 quadros, revisão de cada quadro e destinos existentes antes de gravar. Consome usuários, clientes, quadros, colunas novas/existentes, conclusão e etiquetas novas/associadas/ignoradas. Um cliente pode atender vários quadros. Colunas associadas recebem cards ao final, preservando os anteriores. Um quadro arquivado de origem requer destino novo, para manter seu arquivo.
2. **Cadastros existentes:** usuários e clientes são associados por ID, sem atualização de senha, perfil ou cadastro. A criação explícita continua disponível na prévia. IDs da VPS podem diferir dos locais; `--bindings` informa a correspondência explícita. O executor nunca usa uma coincidência de nome para criar ou substituir uma conta. Catálogos inválidos impedem a execução.
3. **Conteúdo excepcional:** [decisões do usuário](migration-decisions.md) registram 32 arquivos mantidos somente no backup até revisão e a aceitação de seis referências de anexos e um comentário não recuperados. O outro contador de anexo pertence ao histórico fora do escopo de binários. O ensaio já registra essas decisões; a carga final também as grava por entidade e no plano efetivo. A tela **Decisões de conteúdo** lista os casos. Aceitar uma ausência não a classifica como conteúdo recuperado.
4. **Modelos e aprovação:** modelos ativos aparecem em **Nova demanda**, com identificação do quadro de origem. A criação copia texto, prioridade, estimativa, etiquetas, checklists com seus títulos/ordens e anexos disponíveis com arquivos próprios, incluindo a capa. Itens da cópia começam desmarcados; responsáveis e prazos históricos não são herdados. O modelo original e seus metadados históricos permanecem preservados. Modelos arquivados continuam consultáveis no histórico. Em **Destinos de aprovação**, o administrador escolhe quatro colunas por ID: envio, aprovado, ajustes e publicado. O portal exige essa configuração nos quadros importados. Alterar nome/posição mantém o destino; excluir/arquivar uma coluna exige revisão. Fluxos salvos podem ser exportados para a importação final.

## Executar com revisão e conferência

O arquivo de ambiente de destino deve fornecer `DATABASE_URL` e `DIRECT_URL` idênticos. Não coloque credenciais em argumentos ou no plano. A execução padrão é somente validação; gravar requer `--apply`.

```powershell
node --env-file=<ambiente-destino> --import tsx scripts/trello/import.mjs --catalog --output <relatorios-privados>
node --env-file=<ambiente-destino> --import tsx scripts/trello/import.mjs --plan <plano-revisado.json> --output <relatorios-privados>
```

O `--root` padrão é `research/trello/local/api-capture/2026-10-22`. Essa pasta privada precisa estar disponível com manifestos, fontes e os arquivos permitidos. O `--storage` usa `STORAGE_DIR` quando definida; sem ela, usa `storage`. Na VPS, usar explicitamente `/app/storage`. Conferir o plano efetivo produzido pela validação antes de adicionar `--apply` para a execução autorizada da carga conferida.

Opções de revisão:

- `--bindings <arquivo.json>`: mapas `users`, `clients`, `boards`, `columns` e `labels`, cada um com `{ "id-local": "id-no-destino" }`. Use o catálogo exportado do destino para revisar os IDs. O mapa não cria cadastros; estes devem existir antes da execução.
- `--label-plan <arquivo.json>`: exportação das associações globais aplicadas na tela de etiquetas. Deve cobrir todas as etiquetas da fonte e coincidir com seus nomes/cores. Os destinos passam pela mesma validação de catálogo e pelos bindings.
- `--approval-flows <arquivo.json>`: exportação dos fluxos salvos. Referências a listas de origem são resolvidas às colunas do plano; colunas já existentes usam bindings. Fluxos incompatíveis são rejeitados. Quadros sem fluxo permanecem sem envio ao portal até configuração explícita.
- `--decisions <arquivo.json>`: por padrão usa `research/trello/migration-decisions.json`, com as decisões já tomadas pelo usuário.
- `--batch <id>`: identificador da carga, por padrão `trello_20261022_final`. Retomar exige a mesma fonte e o mesmo plano efetivo.

O lote guarda o plano e o hash das fontes. Cada quadro é transacional. A retomada pula quadros concluídos, preservando edições posteriores. Uma tentativa de importar a mesma origem em outro lote é rejeitada; não se deve trocar o nome do lote para repetir uma carga. A numeração compartilha bloqueio com a criação normal de demandas. A importação não envia notificações nem cria posts de aprovação.

No ensaio, **16 quadros** têm destinos salvos. Quinze usam as quatro etapas já existentes, identificadas pelos IDs das listas de origem; o Master Med usa a lista exata “Em aprovação”, independentemente de onde ela aparece. Para o **Liquitudo**, o usuário autorizou criar “Ajustes”, “Aprovado / Agendar” e “Publicado”: as três foram acrescentadas sem mover cards ou alterar a coluna antiga “Aprovado - Concluído”. A exportação inclui essas criações para reprodução na carga final. `_Tráfego Pago` e `Renea` não apresentam as quatro etapas de aprovação; permanecem bloqueados para esse fluxo até configuração explícita. A exportação local está em `local/rehearsal/standard-approval-flows.json`.

Os JSONs `effective-plan.json`, `result.json` e `last-run.json` ficam na pasta privada de saída. Fontes, relatórios com nomes/IDs reais, credenciais e binários não fazem parte do Git.

## Evidência local

O teste integral carregou 3.737 cards, 425 comentários e 1.513 arquivos em um banco novo, mantendo 32 arquivos no backup. Reutilizou usuário, clientes, quadro e colunas previamente cadastrados, juntou e ignorou etiquetas, associou 1.491 cards e vinculou os dois quadros SPMAR ao mesmo cliente. Verificou rejeição de destino inválido sem gravações, validação sem gravações, falha transacional, retomada sem duplicação e preservação de uma edição posterior. A checagem usa associações artificiais de teste; não representa aprovação dos responsáveis reais.

A segunda carga também conferiu os 16 fluxos exportados e a criação das três colunas extras do Liquitudo. O teste pelo Edge passou por criação a partir de modelo, arquivos independentes, preservação do original, bloqueio sem configuração, exportação, renomeação/reordenação de colunas, envio, pedido de ajuste, nova versão, aprovação e publicação. As decisões de conteúdo foram conferidas na interface e em tela de celular. Os cadastros temporários do teste foram removidos.

Resultado: **29 testes automatizados aprovados**, tipos aprovados, ESLint sem erros (um aviso preexistente em `scripts/e2e/simulacao.ts`) e build de produção aprovada. O download das fontes do Google exigiu tentativas, mas a build terminou com sucesso.

Os 33 JSONs da API foram copiados com verificação de hash, sem alterar as fontes, para `research/trello/local/rehearsal/review-inputs/`. Selecione todos os arquivos dessa pasta na prévia para revisar o escopo completo; os 15 JSONs originais sozinhos não representam os outros 18 quadros preservados. O script `scripts/trello/prepare-review.mjs` reproduz essa preparação.

Comandos reproduzíveis:

```powershell
npm run test:trello
npm run typecheck
npm run lint
npm run test:trello:final
npm run test:trello:flows
```

`test:trello:final` exige o Docker do ensaio e cria um banco novo a cada execução, sem resetar bancos anteriores. `test:trello:flows` cria somente entidades temporárias identificadas, verifica os fluxos pelo Edge e remove essas entidades ao terminar. Evidências detalhadas ficam em `research/trello/local/rehearsal/`, ignoradas pelo Git.
