# Ensaio Trello → Dmanda no Docker

**Atualização de 23/10/2026:** os quatro pontos de implementação foram tratados no [executor revisado e preparação para a VPS](final-import.md). As [decisões de conteúdo](migration-decisions.md) foram confirmadas pelo usuário. Os trechos anteriores abaixo documentam as etapas históricas; o plano real de associações ainda exige revisão antes da carga definitiva.

Ensaio realizado em 22/10/2026, com conclusão das verificações já em 23/10 no fuso America/Sao_Paulo. Banco e storage isolados do Dmanda configurado na `.env` principal. O ambiente permanece disponível em **http://localhost:3100**.

## Resultado conferido no banco e no storage

| Entidade | Resultado |
|---|---:|
| Quadros | 33 |
| Colunas, incluindo arquivadas | 330 |
| Cards preservados | 3.737 |
| Modelos incluídos nesses cards | 69 |
| Comentários com autoria histórica | 425 |
| Checklists / itens | 24 / 103 |
| Anexos compatíveis importados | 1.513 |
| Bytes desses anexos | 2.962.598.552 |
| Arquivos recuperados aguardando revisão de política | 32 |
| Binários de quadros históricos importados | 0 |

Os 1.545 binários do backup continuam preservados. O ensaio importou somente os 1.513 compatíveis com a política atual, sem contornar o limite de tamanho ou servir formatos não permitidos. Os 13 links externos permanecem referências no registro de origem. As seis referências sem arquivo retornado pela API e a divergência de um comentário continuam documentadas nos relatórios da captura.

**Cliente SPMAR:** um único cadastro, dois quadros distintos (`SPMAR` e `SPMAR - Complexo Alto do Tietê`) e 142 cards vinculados a esse cliente. Os demais clientes ficaram sem associação automática. Nenhuma pessoa do Trello foi transformada automaticamente em usuário com acesso; nomes, IDs e responsabilidades originais permanecem no registro de origem. A conta de administrador é exclusiva do ensaio.

## O que foi implementado

- PostgreSQL 17, aplicação Next e storage em serviços/volumes próprios. PostgreSQL não expõe porta no host; a aplicação usa somente `127.0.0.1:3100`. O snapshot é montado como somente leitura.
- Executor administrativo restrito ao banco `db/dmanda_trello_rehearsal`, com manifesto/hashes revalidados antes da gravação, transação por quadro, checkpoints por ID e retomada. Os binários são copiados e conferidos antes de criar o anexo no banco.
- Lote e entidades de origem com IDs externos e conteúdo preservado, incluindo as ações e dados sem campo equivalente no Dmanda. Posições fracionárias grandes ficam como texto nos metadados: o transporte JSON do Prisma arredondava esses números. Os arquivos de fonte originais continuam com SHA-256 e bytes intactos.
- Suporte a colunas arquivadas, `Card.isTemplate` e comentários de autoria externa. Modelos e cards de colunas arquivadas são excluídos das visões de trabalho. A consulta administrativa de histórico permite consultá-los sem reativar entidades.
- Conversão de Markdown seguida do mesmo sanitizador usado pela aplicação. O Markdown original permanece preservado.
- Planejamento → Caixa de entrada, sem juntar silenciosamente listas. Demais listas, cards e seus estados são preservados. Conclusão segue a marca Trello; datas técnicas usadas quando faltava uma data histórica estão identificadas nos metadados.
- Na prévia, associação a pessoa/cliente existente ou criação explícita de cadastro. Um cliente criado fica disponível para vários quadros; uma associação de pessoa pelo ID de origem é compartilhada entre os quadros selecionados. A criação ocorre ao clicar em **Criar agora e associar**, antes de importar cards. Contas novas são MEMBER, exigem e-mail informado e troca de senha inicial. A senha temporária aparece na tela e não entra no plano exportado.

## Verificações e evidências privadas

Pasta: `research/trello/local/rehearsal/`, ignorada pelo Git.

| Evidência | Verificação |
|---|---|
| `rollback-test.json` | Falha simulada após criar cards do Magik: quadro/cards/metadados da transação foram revertidos. Os três quadros anteriores permaneceram íntegros. |
| `pilot-audit.json` | Seis pilotos: Magik, CEVISA, Rivellino, Master Med, Liquitudo e Deputada Leci Brandão; 972 cards e 803 anexos compatíveis. |
| `audit.json` | Reconciliação completa por ID: conteúdo original, estado de arquivo/modelo/conclusão, datas, etiquetas, ordem de cards e colunas, checklists/itens, comentários/autoria e SHA-256 dos 1.513 arquivos de destino. |
| `audit.json` com `unchanged: true` | Reexecução com zero novos quadros e impressão digital inalterada dos quadros/cards/comentários/anexos. |
| `browser/destination-test.json` | Login, histórico protegido, 69 modelos consultáveis, criação real de cliente e conta temporários, associação de um cliente a dois quadros distintos e senha excluída do plano. Cadastros temporários foram removidos por seus IDs exatos. |
| `browser/*-interaction.json` | Abertura de cards do CEVISA/Master Med, clique com pequeno movimento do mouse, diálogo Nova demanda e conferência de um download HTTP por hash. |

Tipos, 21 testes automatizados existentes, teste da prévia em desktop/celular, ESLint dos arquivos novos e build de produção no container passaram. A build foi executada em container separado para preservar a aplicação do ensaio em execução.

Foram investigados dois problemas de interação: pequenos movimentos no título podiam iniciar o arraste; o título agora tem abertura explícita sem iniciar esse gesto. Separadamente, o acesso por `127.0.0.1` bloqueava recursos de desenvolvimento do Next, deixando os botões inativos. Foi acrescentada essa origem local à configuração; o usuário confirmou o funcionamento por `localhost`. O ambiente usa webpack/polling para receber alterações nos arquivos montados do Windows.

Verificação final nos dois endereços (`localhost:3100` e `127.0.0.1:3100`): oito aberturas por endereço nos quadros CEVISA/Master Med, incluindo pequenos movimentos do mouse, diálogo Nova demanda funcional, download autenticado com SHA-256 correto e nenhum erro JavaScript. A impressão digital dos dados importados permaneceu inalterada após a reexecução e os testes de navegação.

## Comandos

```powershell
npm run trello:rehearsal
npm run trello:rehearsal:import
npm run trello:rehearsal:audit
```

O primeiro comando cria uma configuração privada somente se ainda não existir, preservando a senha e o banco em retomadas. As credenciais do administrador estão em `local/rehearsal/.env`, nas chaves `REHEARSAL_ADMIN_EMAIL` e `REHEARSAL_ADMIN_PASSWORD`. Não usar `.env` principal para esse executor.

Para desligar preservando dados e arquivos:

```powershell
docker compose -f docker/trello-rehearsal.compose.yml stop
```

Não usar `down -v` para uma simples parada: isso remove os volumes do ensaio.

O executor atual é específico do ensaio com quadros novos e escolhas provisórias, incluindo a relação SPMAR confirmada pelo usuário. A tela exporta o plano de associações, mas ainda não executa a carga. Criar cadastros pela prévia não reassocia automaticamente cards já carregados neste ensaio.

## Antes da migração definitiva

Revisar clientes/pessoas/colunas e implementar o consumo completo desse plano pelo executor final, incluindo destinos existentes e alterações posteriores do usuário. Configurar os destinos de aprovação por ID antes de habilitar o portal: não inferir fluxo a partir da ordem das colunas do Trello. Os 69 modelos já estão preservados e consultáveis; sua utilização como modelos de criação ainda precisa ser integrada ao fluxo de modelos do Dmanda. Resolver/aceitar as pendências de política e conteúdo indisponível, conferir backup do destino e então executar o corte definitivo.

Este ensaio comprova a carga e consulta no Dmanda isolado. Não aplicou migrations, cards, arquivos ou novos cadastros ao banco/storage da instalação principal.
