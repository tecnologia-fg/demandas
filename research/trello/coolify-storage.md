# Arquivos do DMandas no Coolify / Ubuntu

## O que o projeto armazena

O PostgreSQL guarda os registros: nome original, tamanho, MIME, identificador e nome físico do arquivo. O conteúdo fica no disco do servidor, em `STORAGE_DIR`. O padrão continua sendo `storage/` dentro do diretório da aplicação; produção pode fixar `STORAGE_DIR=/app/storage`.

Anexos de demandas e arquivos de aprovação usam essa pasta. Fotos de pessoas e clientes usam sua subpasta `imagens/`. Os nomes físicos são gerados pela aplicação. Os arquivos são servidos pelas rotas autenticadas ou pelos links específicos de aprovação, e não precisam de uma pasta pública no servidor web.

O projeto ainda não envia arquivos para S3, Google Drive ou outro storage externo. Configurar S3 para backup do Coolify não muda o lugar onde a aplicação grava seus uploads.

O limite atual de anexos é 25 MiB por arquivo; fotos de perfil têm limite de 5 MiB. Enviar um anexo para aprovação gera uma cópia independente; criar uma demanda a partir de modelo com anexos também copia os arquivos. Reutilizar arquivos de versões de aprovação pode compartilhar o mesmo nome físico. Arquivar um card preserva seus arquivos. Portanto, o uso de disco cresce com o conteúdo e suas cópias, não apenas com o número de cards.

## Configuração de uma Application no Coolify

Antes da importação e de uploads reais:

1. Abra o recurso da aplicação DMandas no projeto/ambiente de produção.
2. Em **Environment Variables**, adicione `STORAGE_DIR=/app/storage`, disponível no runtime. Esse valor também foi acrescentado ao `.env.vps` privado como referência; o Coolify usa as variáveis configuradas no painel.
3. Abra **Persistent Storage** e adicione um **Volume Mount**. Use um nome como `dmanda-storage`, se o painel pedir nome. Deixe **Source Path** vazio para o Docker administrar o volume. Defina **Destination Path** como `/app/storage`. Salve o nome real gerado do volume para inventário e restauração.
4. Salve e faça redeploy para aplicar o mount. O caminho do destino precisa ser exatamente o mesmo da variável.
5. Confirme permissão de escrita pelo usuário do container. No terminal da aplicação, rode `id` e `test -w /app/storage && echo storage-gravavel`. Se houver erro de permissão, ajuste o dono da pasta/volume ao UID/GID real da aplicação; não use `chmod 777` como solução.
6. Envie um arquivo pequeno por um card de teste, faça download, redeploy e repita o download. O arquivo deve continuar disponível. Só depois execute a carga de anexos.

O diretório `/app/storage` é **dentro do container**. O Docker guarda o volume correspondente no disco da VPS. Não é necessário criar `/app/storage` no Ubuntu fora do container quando usar volume nomeado.

Se já houver arquivos no container antes da configuração, preserve-os antes de montar o volume. Um mount pode ocultar o conteúdo anterior e não recupera arquivos de containers removidos. Não excluir/recriar o recurso com remoção de volumes nem executar `docker compose down -v` ou limpeza de volumes usados pela aplicação.

### Se o recurso usa Docker Compose

Nesse caso o Compose é a fonte da configuração, em vez do editor de mounts da Application. Acrescente ao serviço existente, sem trocar as configurações do banco ou criar outro app:

```yaml
services:
  web: # substitua pelo nome real do serviço da aplicação
    environment:
      STORAGE_DIR: /app/storage
    volumes:
      - dmanda-storage:/app/storage

volumes:
  dmanda-storage:
```

Não usar o Compose de ensaio como configuração de produção: ele sobe Next em desenvolvimento e um banco separado de teste.

## Banco, backup e restauração

O PostgreSQL deve manter o próprio volume persistente, separado do volume dos arquivos. Backup apenas do banco não contém os binários; backup apenas do volume dos arquivos não recupera os cards e seus vínculos.

Programar os dois: backup PostgreSQL e backup do volume `dmanda-storage`, com destino fora da VPS. Usar backup de storage no Coolify quando a versão instalada oferecer a opção; caso contrário, agendar uma ferramenta de backup para arquivar o volume. O backup da instância Coolify não substitui automaticamente os backups dos dados da aplicação.

Como política inicial, sugerimos execução diária, retenção de sete diários e quatro semanais, em destino externo. Antes da migração, preservar uma cópia extra do banco e do volume. Para uma cópia consistente entre arquivos e banco, suspender gravações/uploads durante a captura dos dois. Testar restauração em ambiente separado, abrindo um card e baixando seu anexo. Manter `SESSION_SECRET` e os parâmetros de montagem em um cofre/backup privado de configuração.

Os 32 arquivos excepcionais do Trello ficam no backup da captura, fora do storage operacional, até revisão. Essa cópia privada também precisa ser preservada fora da VPS, mesmo depois da importação.

## Espaço e capacidade

A carga atual importa 1.513 arquivos, com **2.962.598.552 bytes**: aproximadamente **2,96 GB / 2,76 GiB**. Os 1.545 arquivos recuperados do escopo ativo, incluindo os 32 adiados, somam cerca de **3,76 GB / 3,50 GiB**. Manter os dois conjuntos na VPS durante a migração consome pelo menos cerca de **6,72 GB**, além de metadados, banco, imagens Docker, sistema e outros serviços. Backups duplicados e arquivos históricos preservados fora desse escopo aumentam esse total.

A oferta KVM 2 consultada informa 2 vCPU, 8 GB de RAM e 100 GB NVMe. A carga inicial de anexos é pequena em relação ao disco contratado; isso não confirma o espaço livre nem o consumo dos demais serviços da VPS. Antes de subir, consultar no Ubuntu `df -h` e `docker system df`, e depois acompanhar a pasta/volume e os recursos no painel. Recomenda-se alerta em 80% de disco ocupado. Não limpar volumes para liberar espaço sem identificar seus dados.

O usuário informou **95 GB disponíveis** em 23/10/2026. Com esse espaço livre, há margem para os anexos operacionais e a cópia temporária da captura durante a migração; o crescimento posterior depende dos novos uploads e cópias de aprovação/modelos.

Os endpoints atuais leem uploads e downloads em memória; arquivos de até 25 MiB costumam ser compatíveis com esse porte de servidor, mas uso concorrente, Next, PostgreSQL, Coolify e outros serviços compartilham RAM/CPU. A capacidade real deve ser observada em produção. Se o volume de mídia crescer muito, uma integração de object storage poderá ser implementada posteriormente.

## Referências

- [Persistent Storage — Applications](https://coolify.io/docs/applications/configuration/persistent-storage)
- [Volumes](https://coolify.io/docs/core/persistent-storage/storage-mounts/volume-mounts)
- [Backup dos mounts](https://coolify.io/docs/core/persistent-storage/storage-mounts/backups)
- [Backup PostgreSQL e outras bases](https://coolify.io/docs/databases/)
- [Plano VPS da Hostinger](https://www.hostinger.com/br/servidor-vps)
