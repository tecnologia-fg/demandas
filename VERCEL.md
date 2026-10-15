# Preparação para Vercel e Neon

O projeto foi configurado para PostgreSQL com Prisma 6. O SQLite anterior (`file:./dev.db`)
não serve como banco persistente nas Functions da Vercel. Neon é uma opção compatível;
outro PostgreSQL acessível pela rede também funciona. Se já existir um banco Neon para
este projeto, ele pode ser reutilizado: não é necessário criar outra instância.

## Variáveis

O arquivo `.env` na raiz foi preparado para importação na Vercel, com `SESSION_SECRET`
aleatório. Ele está ignorado pelo Git. As URLs do banco ainda são exemplos e precisam
ser substituídas antes de executar migrações ou publicar.

| Variável | Valor |
| --- | --- |
| `DATABASE_URL` | URL PostgreSQL do Neon com **Connection pooling** ativado (host com `-pooler`), SSL e `connection_limit=1`. Usada pela aplicação. |
| `DIRECT_URL` | URL do mesmo banco/branch com pooling desativado. Usada pelo Prisma nas migrações. |
| `SESSION_SECRET` | Chave aleatória já gerada no `.env`. Mantenha o valor entre deploys para preservar sessões. |
| `TZ` | `America/Sao_Paulo`. |

Copie as URLs completas do painel Neon; não monte o host manualmente. Preserve os
parâmetros fornecidos pelo Neon, inclusive `sslmode=require`. Caso a senha contenha
caracteres especiais, use a URL já codificada fornecida pelo painel.

`SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD` só são necessários para dados fictícios de
demonstração. Não são necessários em produção. A conta inicial é criada em **Primeiro
acesso** na tela de entrada. Não é necessário configurar `NODE_ENV`, URLs públicas,
chaves de e-mail ou de OAuth: o código atual não exige essas variáveis.

## Banco e publicação

1. Na Vercel, abra **Storage / Marketplace → Neon** e conecte um banco ao projeto,
   ou use um projeto Neon existente. Prefira uma região próxima das Functions.
2. Copie a conexão com pool para `DATABASE_URL` e a conexão direta para `DIRECT_URL`
   no `.env`. Se a integração fornecer `DATABASE_URL_UNPOOLED`, copie esse valor
   também para `DIRECT_URL`, que é o nome esperado por este schema.
3. Em **Settings → Environment Variables**, importe o `.env` para **Production**.
   Para **Preview**, use outro banco/branch e outra chave de sessão.
   O arquivo local não é enviado pelo Git nem configura o painel automaticamente.
4. Instale as dependências e aplique as migrações no banco configurado:

   ```bash
   npm ci
   npm run db:deploy
   ```

5. Use o preset **Next.js** e o comando de build `npm run build`. O comando gera
   o Prisma Client antes de compilar, inclusive quando a Vercel reaproveita cache.
   As migrações devem ser executadas uma vez por versão, em uma etapa separada do
   build, apontando para o banco do ambiente correspondente.
6. Faça o deploy após configurar as variáveis e o banco. Mudanças de variáveis
   exigem um novo deploy para entrarem em vigor.

As migrações criam a estrutura em um PostgreSQL novo; não transferem dados do SQLite.
Se houver dados existentes, eles exigem exportação e importação próprias. Não use
`db:reset` em produção: esse comando apaga dados. `db:push` é uma ferramenta de
desenvolvimento; para produção, use as migrações versionadas.

## Pendência para uso completo na Vercel

Fotos, anexos e arquivos de aprovação ainda são gravados em `storage/` no disco local
(`src/server/storage.ts`, `src/server/images.ts` e rotas de upload). É necessário
adaptar gravação, leitura, cópia e exclusão para um armazenamento persistente, como
Vercel Blob ou S3, antes de usar esses recursos na Vercel. Configurar uma variável de
Blob sozinha não resolve: o código ainda não tem essa integração. A migração dos
uploads não faz parte desta preparação de ambiente.

Ainda não foi criada uma instância Neon nem validada uma conexão real: as credenciais
do banco não estavam disponíveis no projeto.

Referências oficiais:
- [SQLite na Vercel](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel)
- [Neon com Prisma 6](https://docs.prisma.io/docs/orm/v6/overview/databases/neon)
- [Variáveis na Vercel](https://vercel.com/docs/environment-variables)
