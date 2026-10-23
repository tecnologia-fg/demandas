# Roadmap — importação Trello → Dmanda

**Atualização de 23/10/2026:** os quatro pontos de implementação foram tratados no [executor revisado e preparação para a VPS](final-import.md). As [decisões de conteúdo](migration-decisions.md) foram confirmadas pelo usuário. Os trechos anteriores abaixo documentam as etapas históricas; o plano real de associações ainda exige revisão antes da carga definitiva.

**Fonte vigente:** [captura por API](api-capture-2026-10-22.md) do workspace `agenciaformulagroup`: 33 quadros com cards/comentários; anexos somente dos 15 iniciais. Os critérios numéricos históricos deste documento devem ser substituídos pelo manifesto auditado em `local/api-capture/2026-10-22/reports/`. O ensaio deve manter os outros 18 quadros sem importação de binários, incluindo arquivos históricos já baixados antes da restrição.

Atualizado em 22/10/2026. Branch: `research/trello-import`. Base de referência: 14 quadros, 1.766 cards. Ver [análise](workspace-analysis.md) e [plano técnico](import-plan.md).

**Atualização de transição:** o usuário cancelou a assinatura e informou que os quadros seguem somente para leitura. A exportação mais recente contém **15 quadros e 1.828 cards**; ver [captura de 22/10](cutover-2026-10-22.md). Preservar os binários por ZIP/API é a prioridade antes de executar a migração. A prévia já exporta o relatório individual de anexos; o ensaio deve implementar recuperação, envio e resolução de pendências manuais.

## 1. Prévia e decisões de importação

**Objetivo:** revisar o resultado esperado antes de gravar dados. **Estado:** primeira versão implementada, disponível para revisão funcional.

Entregas desta versão:

- Página administrativa `/configuracoes/importar-trello`, acessível por Configurações.
- Seleção de vários JSONs; validação de formato, IDs/referências e detecção de quadros repetidos. Análise dos arquivos no navegador, sem enviar seus conteúdos ao servidor.
- Resumo por quadro, modelos, arquivos, comentários e pendências. Escolha de quadro novo/existente e cliente, associação de listas a colunas existentes ou novas e nome editável. Sugestão Planejamento → Caixa de entrada.
- Associação de pessoas e etiquetas; opção explícita de preservar identidade externa. Política de conclusão e preservação dos modelos/colunas arquivadas.
- Exportação e reabertura de um plano versionado vinculado aos hashes dos JSONs. Rascunho pode conter decisões incompletas; revisão concluída exige destinos válidos e revisão de cada quadro.

**Limite desta etapa:** a exportação registra decisões para o ensaio; não executa importação, cria usuários ou recupera arquivos. A capacidade do modelo atual de gravar arquivos de coluna, modelos completos e autoria externa será implementada na etapa 2. “Revisado” significa decisões da prévia revisadas, não migração aprovada ou completa.

**Saída para a etapa 2:** plano revisado em conjunto, equivalências aceitas e pendências identificadas. A próxima decisão do usuário é revisar esta prévia e definir o plano que será usado no ensaio.

## 2. Ensaio em ambiente isolado no Docker

**Objetivo:** comprovar gravação e comportamento sem afetar o banco real. **Estado:** carga piloto e completa realizadas no Docker, com mapeamento provisório e relação de cliente SPMAR confirmada. Ver [resultado do ensaio](docker-rehearsal.md). O consumo completo do plano de destinos revisado, a reutilização dos modelos e a configuração dos destinos de aprovação permanecem necessários antes da migração definitiva.

Entregas:

- PostgreSQL isolado, variáveis de conexão explícitas, migrations e armazenamento próprio.
- Serviço de importação que revalida fontes e mapas, registra lotes/IDs externos e grava estrutura, cards e relações com transação e retomada.
- Suporte de dados e interface para colunas arquivadas, modelos completos, referências de anexos/links e autoria histórica. Configuração dos destinos de aprovação por ID.
- Pilotos: Magik, CEVISA, Rivellino, Master Med, Liquitudo e Deputada Leci Brandão, seguidos do lote completo.
- Recuperação de binários conforme a fonte disponível e decisões para formatos/tamanhos excepcionais; reconciliação de comentários e anexos ausentes.
- Testes de repetição sem duplicação, concorrência, falha/retomada, integridade e comportamento das telas. Relatório por entidade, transformações e pendências.

**Saída para a etapa 3:** 1.766 IDs reconciliados entre demandas/modelos, arquivo preservado, ordens/valores conferidos, destinos de aprovação corretos e pendências resolvidas ou aceitas explicitamente. Registrar duração e espaço usados para planejar a execução definitiva.

## 3. Migração definitiva e acompanhamento

**Objetivo:** transferir a operação com rastreabilidade. **Estado:** planejado, depende do ensaio aprovado.

Entregas:

- Janela de corte definida; exports finais e comparação com o plano ensaiado. Alteração de fonte ou mapa exige nova prévia/revalidação.
- Backup do banco e storage, execução do lote final e acompanhamento por quadro/arquivo.
- Reconciliação dos valores e relações, verificação funcional com a equipe e liberação do portal após conferir as automações.
- Relatório final, consulta aos IDs/links de origem, pendências aceitas e procedimento de reversão que preserve entidades preexistentes ou editadas depois da importação.

**Conclusão:** nenhuma entidade de origem sem destino ou decisão registrada; nenhuma duplicação em retomada; nenhuma perda silenciosa de conteúdo, autoria, modelos ou arquivo. Comentários/arquivos não recuperados permanecem identificados como pendências aceitas, sem constar como recuperados.

## Como revisar a prévia

1. Acessar **Configurações → Importar Trello**, com conta ADMIN.
2. Selecionar os 14 JSONs da pasta `Downloads/jsons_trello`.
3. Revisar cada quadro, destinos, cliente, pessoas, etiquetas e política de conclusão. Confirmar as decisões de cada quadro depois da revisão.
4. Exportar o plano JSON para revisão. Guardá-lo fora de `public/` e do Git: contém nomes e IDs reais. Ao reabrir, selecionar os mesmos exports e carregar o plano; hashes divergentes são rejeitados.
5. Usar esse plano como contrato da próxima etapa. Esta versão não tem botão de executar a migração.

## Contrato e verificação da primeira versão

O plano exportado usa `kind: dmanda-trello-preview` e `schemaVersion: 1`. Contém hashes SHA-256, identificação dos exports, decisões por ID de quadro/lista/pessoa/etiqueta, política de conclusão, resumo e pendências. Não inclui o conteúdo integral dos cards. Identidade externa e criação de etiqueta são escolhas explícitas. Etiquetas novas equivalentes deverão ser reconciliadas globalmente no ensaio, preservando seus IDs de origem.

As pessoas com o mesmo ID compartilham a associação entre os quadros carregados. Mudanças nas decisões invalidam a revisão dos quadros afetados. A reabertura valida versão, conjunto de fontes, hashes e estrutura dos mapas e exige nova revisão; destinos que deixaram de existir são exibidos como decisões a corrigir. O status `reviewed` não aceita mapas inválidos ou associações conflitantes entre quadros.

Verificações reproduzíveis:

```powershell
npm run test:trello
npm run test:trello:ui
npm run typecheck
npm run build
```

O teste de navegador usa o componente real, os 14 exports privados e destinos fictícios, sem iniciar o Next ou acessar banco. Precisa do Edge instalado no Windows, ou de `E2E_CHROME` apontando para um Chromium compatível. Gera capturas e planos de teste em `research/trello/local/ui-preview/`, ignorados pelo Git. O harness isola requisições injetadas pelo antivírus local; as requisições da aplicação são verificadas separadamente.

Cobertura: leitura dos 1.766 cards, sugestões/validação de colunas, preservação de modelos e arquivo, divergências reais, edição, invalidação de revisão, exportação, reabertura e rejeição de hash diferente; desktop e celular. A build inclui a rota administrativa, protegida por `requireAdminPage()` antes das consultas de destino. A validação de sessão e dos catálogos reais com a aplicação em execução fica para o ensaio integrado no Docker. Esta etapa não modificou schema, migrations ou dados de negócio.

Resultado em 22/10/2026: 13 testes automatizados aprovados (incluindo os 14 exports reais), fluxo do componente aprovado no Edge em desktop/celular, tipos e build de produção aprovados. ESLint sem erros, com um aviso preexistente de variável não usada em `scripts/e2e/simulacao.ts`. As capturas são de um harness com destinos fictícios; não são evidência de importação ou de gravação no banco.
