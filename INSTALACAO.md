# Instalação do Dmanda

Guia passo a passo para instalar o Dmanda no seu computador e, depois, colocar no ar num servidor.
Não precisa saber programar. Em cada etapa tem um prompt pronto para colar na sua IA de programação
caso alguma coisa não dê certo.

Sumário

1. O que você precisa
2. Abrir o projeto na IA
3. Baixar o código
4. Instalar as dependências
5. Criar o arquivo .env
6. Criar o banco de dados
7. Colocar dados de demonstração (opcional)
8. Rodar e abrir no navegador
9. Primeiro login
10. Colocar no ar numa VPS
11. Alternativas à VPS
12. Backup do banco e dos arquivos
13. Atualizar para uma versão nova
14. Problemas comuns e soluções

---

## 1. O que você precisa

| Item | Para que serve | Onde conseguir |
|---|---|---|
| Node.js 20.9 ou mais novo (recomendado 22) | Roda o sistema | nodejs.org, baixe a versão LTS |
| Git | Baixa e atualiza o código | git-scm.com |
| Um editor de código | Ver e editar os arquivos | VS Code (code.visualstudio.com) ou Cursor (cursor.com) |
| Uma IA de programação | Ajuda em cada etapa e faz mudanças | Claude Code, Codex, Cursor ou Lovable |
| Um terminal | Onde você digita os comandos | Mac: app Terminal. Windows: PowerShell ou o terminal do VS Code |

Sobre as IAs:

- **Claude Code, Codex e Cursor** trabalham direto na pasta do projeto no seu computador. Elas leem os arquivos,
  rodam os comandos e corrigem erros. São as melhores para seguir este guia.
- **Lovable** funciona melhor criando telas do zero. Para usar com este projeto, você precisa subir o código
  para o GitHub e conectar o repositório ao Lovable. Para rodar o sistema e colocar no ar, continue usando
  os passos deste guia (o Dmanda precisa de um servidor Node com disco, que o Lovable não oferece).

Para conferir se o Node e o Git estão instalados, abra o terminal e digite:

```bash
node -v
git --version
```

Se aparecer um número de versão nos dois, está tudo certo. O `node -v` precisa mostrar v20.9 ou maior.

Prompt para a IA:

```text
Quero instalar o projeto Dmanda (Next.js 16, Prisma 6 e SQLite) no meu computador. Confira se tenho o Node.js na versão 20.9 ou mais nova e o Git instalados, rodando os comandos de versão no terminal. Se faltar alguma coisa ou a versão for antiga, me explique em passos simples como instalar no meu sistema operacional, e confira de novo no final.
```

---

## 2. Abrir o projeto na IA

Cada IA tem um jeito de abrir uma pasta:

- **Claude Code**: no terminal, entre na pasta do projeto (`cd dmanda-codigo-aluno`) e digite `claude`.
- **Codex**: no terminal, entre na pasta do projeto e digite `codex`.
- **Cursor**: menu File, Open Folder, escolha a pasta do projeto. Use o chat lateral.

Depois de abrir, comece pedindo para a IA ler os guias. Assim ela entende o sistema antes de mexer em qualquer coisa.

Prompt para a IA:

```text
Leia os arquivos README.md, INSTALACAO.md, ARQUITETURA.md e PROMPTS.md desta pasta. Depois me diga, em poucas linhas, o que é este sistema, quais tecnologias ele usa e qual é o próximo passo para eu instalar no meu computador. Não altere nenhum arquivo agora.
```

---

## 3. Baixar o código

Você pode receber o código de dois jeitos.

**Jeito A, arquivo .zip:** baixe o .zip na área do aluno, descompacte numa pasta fácil de achar
(por exemplo, Documentos) e abra o terminal nessa pasta.

**Jeito B, Git:** se o curso passou um endereço de repositório, rode no terminal:

```bash
git clone ENDERECO-DO-REPOSITORIO dmanda-codigo-aluno
cd dmanda-codigo-aluno
```

Troque `ENDERECO-DO-REPOSITORIO` pelo endereço que está na área do aluno.

Para conferir se está na pasta certa, rode `ls` (Mac e Linux) ou `dir` (Windows). Precisa aparecer
`package.json`, `prisma`, `src` e os arquivos `.md` deste guia.

Prompt para a IA:

```text
Confira se o terminal está na pasta raiz do projeto Dmanda, aquela que tem package.json, a pasta prisma e a pasta src. Se não estiver, encontre a pasta certa e me mostre o comando cd para entrar nela. Depois, se ainda não existir um repositório git nesta pasta, rode git init e faça um commit inicial com todos os arquivos, para eu poder voltar atrás se alguma mudança der errado.
```

---

## 4. Instalar as dependências

As dependências são as bibliotecas que o sistema usa (Next.js, Prisma, React e outras). No terminal, dentro da pasta do projeto:

```bash
npm install
```

Demora de 1 a 5 minutos. No final aparece uma pasta nova chamada `node_modules`. Avisos amarelos (warn) são normais.
Só se preocupe se aparecer `ERR!` em vermelho.

Prompt para a IA:

```text
Rode npm install na pasta do projeto Dmanda e acompanhe até o fim. Se aparecer algum erro (linhas com ERR!), leia a mensagem, descubra a causa e corrija. Avisos (warn) podem ser ignorados. No final, rode npx prisma generate e me diga se as duas coisas terminaram sem erro.
```

---

## 5. Criar o arquivo .env

O `.env` guarda as configurações secretas do sistema. Ele nunca vai para o GitHub.

1. Copie o arquivo de exemplo:

   ```bash
   cp .env.example .env
   ```

   No Windows (PowerShell): `Copy-Item .env.example .env`

2. Gere uma chave para a sessão:

   ```bash
   openssl rand -base64 48
   ```

   Copie o resultado e cole no lugar de `cole-aqui-a-chave-gerada-pelo-openssl`, na linha `SESSION_SECRET`.
   No Windows, se o openssl não existir, peça a chave para a IA (prompt abaixo).

3. Troque `troque-esta-senha` na linha `SEED_ADMIN_PASSWORD` por uma senha de pelo menos 8 caracteres.
   Ela será a senha das contas de demonstração.

4. Deixe `DATABASE_URL="file:./dev.db"` como está. O banco vai ser o arquivo `prisma/dev.db`.

O que cada variável faz está explicado em comentários dentro do próprio `.env.example`.

Prompt para a IA:

```text
Crie o arquivo .env do projeto Dmanda a partir do .env.example. Gere uma chave aleatória forte de 64 caracteres para SESSION_SECRET e uma senha aleatória de 16 caracteres para SEED_ADMIN_PASSWORD, e grave as duas no .env. Mantenha DATABASE_URL como file:./dev.db e SEED_ADMIN_EMAIL como admin@demanda.local. Confirme que o .env está listado no .gitignore. Depois me mostre só a senha de demonstração, para eu anotar, sem mostrar a SESSION_SECRET.
```

---

## 6. Criar o banco de dados

O banco é um arquivo SQLite. O Prisma cria todas as tabelas a partir do arquivo `prisma/schema.prisma`:

```bash
npx prisma db push
```

Se der certo, aparece "Your database is now in sync with your Prisma schema" e surge o arquivo `prisma/dev.db`.

Prompt para a IA:

```text
Rode npx prisma db push no projeto Dmanda para criar o banco SQLite a partir de prisma/schema.prisma. Se der erro, confira se o arquivo .env existe e se a variável DATABASE_URL está certa, corrija e rode de novo. No final, confirme que o arquivo do banco foi criado dentro da pasta prisma.
```

---

## 7. Colocar dados de demonstração (opcional)

Para ver o sistema já cheio de quadros, demandas e clientes de exemplo, rode o seed:

```bash
npm run db:seed
```

Isso cria 5 pessoas de exemplo, etiquetas, 2 clientes, 3 quadros e 21 demandas. Todas as pessoas e empresas são fictícias.

Para uma demonstração maior (mais 4 pessoas, mais 6 clientes, 3 pastas, mais 7 quadros e 94 demandas no total),
rode também, depois do seed:

```bash
npx tsx --env-file=.env scripts/demo-completo.ts
```

Atenção:

- O seed foi feito para um banco vazio. Rodar de novo num banco que já tem os exemplos dá erro de e-mail repetido.
- Para zerar o banco de teste e recriar os exemplos, use `npm run db:reset`. Esse comando **apaga todos os dados**.
  Nunca rode no banco de produção.

Se quiser começar com o sistema vazio, pule esta etapa e vá direto para a 8.

Prompt para a IA:

```text
No projeto Dmanda, rode npm run db:seed para colocar os dados de demonstração e depois npx tsx --env-file=.env scripts/demo-completo.ts para a demonstração completa. Antes, confira que o banco em uso é o de desenvolvimento (DATABASE_URL no .env apontando para file:./dev.db), porque o seed é só para banco de teste vazio. Se der erro de e-mail repetido, é porque os exemplos já existem; nesse caso me pergunte antes de rodar npm run db:reset, que apaga tudo. Se der outro erro, corrija e rode de novo. No final, me diga quantas pessoas e demandas foram criadas e qual é o e-mail de login.
```

---

## 8. Rodar e abrir no navegador

```bash
npm run dev
```

Quando aparecer "Ready", abra o navegador em **http://localhost:3000**.

Para parar o sistema, volte ao terminal e aperte `Ctrl + C`. Para rodar de novo, `npm run dev`.

Se a porta 3000 já estiver ocupada, use outra: `npm run dev -- -p 3001` e abra http://localhost:3001.

Prompt para a IA:

```text
Rode o projeto Dmanda em modo de desenvolvimento com npm run dev e me diga o endereço para abrir no navegador. Se a porta 3000 estiver ocupada, use a 3001. Se aparecer erro no terminal ao abrir a página, leia a mensagem, corrija a causa e me explique o que era.
```

---

## 9. Primeiro login

Tem dois caminhos.

**Se você rodou o seed (etapa 7):** entre com o e-mail `admin@demanda.local` e a senha que você colocou em
`SEED_ADMIN_PASSWORD`. As outras pessoas de exemplo (ana@demanda.local, bruno@demanda.local e outras) usam a mesma senha.

**Primeiro acesso (conta de dono):** na tela de entrada existe a aba **Primeiro acesso**. Ela cria a sua conta
de administrador com o seu e-mail de verdade. É de uso único: depois do primeiro cadastro, a aba some e as
outras pessoas entram por convite em Configurações, Equipe. No mesmo passo você pode marcar a opção de
desativar as contas de demonstração.

Depois de entrar:

- Configurações, Equipe: crie os acessos da sua equipe. O sistema mostra uma senha temporária, e a pessoa troca no primeiro login.
- Configurações, Etiquetas: ajuste as etiquetas.
- Quadros: crie um quadro novo a partir de um modelo (Básico, Produção de conteúdo, Semana da equipe ou Em branco).
- Perfil: foto, cor do sistema, intensidade do vidro e troca de senha.

Prompt para a IA:

```text
Explique, com base no código do projeto Dmanda (src/app/actions/auth.ts, src/server/setup.ts e src/components/auth/AuthTabs.tsx), como funciona o primeiro login: a diferença entre entrar com a conta de demonstração do seed e usar a aba Primeiro acesso, e o que acontece com as contas de demonstração. Depois me dê um roteiro curto para eu testar o sistema pela primeira vez: criar um quadro, criar uma demanda, mover entre colunas e convidar uma pessoa da equipe.
```

---

## 10. Colocar no ar numa VPS

VPS é um servidor alugado (Hostinger, DigitalOcean, Contabo, Hetzner, Vultr e outros). Este roteiro usa
**Ubuntu 22.04 ou 24.04**, **Nginx** (recebe as visitas), **PM2** (mantém o sistema ligado) e **Certbot** (HTTPS grátis).

Antes de começar, você precisa de:

- uma VPS com Ubuntu e acesso por SSH (o painel da empresa mostra o IP e a senha ou chave);
- um domínio ou subdomínio (por exemplo `demandas.suaempresa.com.br`) com um registro DNS do tipo A
  apontando para o IP da VPS.

Importante: em produção o login só funciona com **HTTPS**. O cookie de sessão é marcado como seguro e o navegador
não manda esse cookie por http. Por isso o passo do Certbot é obrigatório.

### 10.1 Entrar na VPS e instalar o básico

```bash
ssh root@IP-DA-SUA-VPS
apt update && apt upgrade -y
apt install -y git nginx sqlite3
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
npm install -g pm2
node -v
```

### 10.2 Baixar o código e instalar

```bash
mkdir -p /var/www && cd /var/www
git clone ENDERECO-DO-REPOSITORIO dmanda
cd dmanda
npm ci
```

Se você recebeu o .zip, envie a pasta para a VPS com `scp -r` ou suba o código para um repositório seu
no GitHub e clone de lá.

### 10.3 Criar o .env de produção

```bash
cp .env.example .env
nano .env
```

- `DATABASE_URL="file:./prod.db"`
- `SESSION_SECRET` com uma chave nova, gerada na própria VPS com `openssl rand -base64 48`
- `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD` só importam se for rodar o seed (em produção, normalmente não).

Salve com `Ctrl + O`, Enter, e saia com `Ctrl + X`.

### 10.4 Banco, build e PM2

```bash
npx prisma db push
npm run build
pm2 start npm --name dmanda -- start -- -p 3000 -H 127.0.0.1
pm2 save
pm2 startup
```

O `pm2 startup` mostra um comando para copiar e rodar. Ele faz o sistema voltar sozinho se a VPS reiniciar.

Use **uma instância só** no PM2 (não use o modo cluster). A atualização ao vivo e o limite de tentativas de
login ficam na memória do processo; com várias instâncias, uma não enxerga a outra.

### 10.5 Nginx

Crie o arquivo `/etc/nginx/sites-available/dmanda`:

```nginx
server {
    listen 80;
    server_name demandas.suaempresa.com.br;

    # anexos de até 25 MB
    client_max_body_size 30m;

    # atualização ao vivo (Server-Sent Events): sem buffer e com conexão longa
    location /api/ao-vivo {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 1h;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Troque `demandas.suaempresa.com.br` pelo seu domínio. Depois:

```bash
ln -s /etc/nginx/sites-available/dmanda /etc/nginx/sites-enabled/dmanda
nginx -t
systemctl reload nginx
```

O cabeçalho `X-Forwarded-For` é importante: o sistema usa o IP de quem acessa para limitar tentativas de login.
Sem ele, todo mundo aparece com o mesmo IP.

### 10.6 HTTPS com Certbot

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d demandas.suaempresa.com.br
```

O Certbot pede um e-mail, aceita os termos e ajusta o Nginx sozinho. O certificado renova automaticamente.

### 10.7 Firewall e primeiro acesso

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
```

Abra `https://demandas.suaempresa.com.br` e faça o **Primeiro acesso** logo em seguida. Enquanto ninguém
fizer, qualquer pessoa que abrir o endereço consegue criar a conta de dono.

Prompt para a IA:

```text
Quero colocar o projeto Dmanda no ar numa VPS Ubuntu com Nginx, PM2 e Certbot, seguindo a seção 10 do INSTALACAO.md. Me guie um passo por vez: primeiro me pergunte o IP da VPS e o domínio, depois me diga exatamente quais comandos rodar via SSH em cada etapa (instalar Node 22, git, nginx e pm2, clonar, npm ci, criar o .env de produção com SESSION_SECRET nova, prisma db push, build, PM2 com uma instância só, configuração do Nginx com o bloco da rota /api/ao-vivo sem buffer, Certbot e firewall). Espere eu colar a saída de cada comando antes de passar para o próximo e corrija qualquer erro que aparecer.
```

---

## 11. Alternativas à VPS

O Dmanda guarda o banco num arquivo (SQLite) e os anexos na pasta `storage/`. Por isso ele precisa de um
servidor com **disco permanente** e **um processo Node sempre ligado**.

| Opção | Funciona? | Observação |
|---|---|---|
| VPS (seção 10) | Sim | Mais controle e mais barato. |
| Railway, Render, Fly.io | Sim, com disco | Crie um volume persistente e aponte o banco e a pasta storage para ele. Sem volume, os dados somem a cada publicação. |
| Coolify ou CapRover na sua VPS | Sim | Painel que faz o deploy pelo GitHub. Configure um volume para prisma e storage. |
| Vercel, Netlify | Não, como está | São serverless: não têm disco permanente nem processo contínuo. Exigiria trocar o banco por Postgres, os anexos por um armazenamento externo e a atualização ao vivo por outro serviço. |
| Computador da empresa na rede local | Sim | `npm run build` e `npm run start`. Para acesso de fora, precisa de HTTPS (por exemplo, com um túnel). |

Prompt para a IA:

```text
Leia o código do projeto Dmanda (principalmente prisma/schema.prisma, src/server/storage.ts, src/server/live.ts e src/server/rate-limit.ts) e me explique quais requisitos de hospedagem ele tem: banco, pasta de arquivos, processo contínuo e quantidade de instâncias. Depois compare VPS, Railway, Render e Vercel para este projeto específico, dizendo o que precisaria mudar em cada um. Não altere nenhum arquivo.
```

---

## 12. Backup do banco e dos arquivos

Tudo o que importa fica em dois lugares:

- o arquivo do banco: `prisma/prod.db` (ou `prisma/dev.db` no seu computador);
- a pasta `storage/`: anexos das demandas, artes das aprovações e fotos de perfil (em `storage/imagens`).

Backup manual na VPS:

```bash
cd /var/www/dmanda
mkdir -p backups
sqlite3 prisma/prod.db ".backup 'backups/banco-$(date +%F).db'"
tar -czf backups/arquivos-$(date +%F).tar.gz storage
```

O comando `.backup` do sqlite3 copia o banco com segurança mesmo com o sistema ligado. Não copie o `.db` com
`cp` enquanto o sistema está rodando.

Backup automático todo dia às 3h, guardando os últimos 14 dias:

```bash
crontab -e
```

E acrescente no final:

```cron
0 3 * * * cd /var/www/dmanda && sqlite3 prisma/prod.db ".backup 'backups/banco-$(date +\%F).db'" && tar -czf backups/arquivos-$(date +\%F).tar.gz storage && find backups -type f -mtime +14 -delete
```

Guarde uma cópia fora da VPS de vez em quando (baixe com `scp` ou use um serviço de armazenamento).
Se a VPS for perdida, um backup que está só nela vai junto.

Para restaurar: pare o sistema (`pm2 stop dmanda`), copie o backup por cima de `prisma/prod.db`, descompacte
os arquivos com `tar -xzf backups/arquivos-DATA.tar.gz` e ligue de novo (`pm2 start dmanda`).

Prompt para a IA:

```text
Monte para mim uma rotina de backup do projeto Dmanda numa VPS Ubuntu, com base na seção 12 do INSTALACAO.md: backup diário do banco SQLite com sqlite3 .backup, compactação da pasta storage, apagar backups com mais de 14 dias e um jeito simples de copiar os backups para fora da VPS. Escreva um script backup.sh comentado em português, explique como agendar no cron e como testar se o backup restaura certo.
```

---

## 13. Atualizar para uma versão nova

Sempre faça backup antes (seção 12). Depois, na VPS:

```bash
cd /var/www/dmanda
git pull
npm ci
npx prisma db push
npm run build
pm2 restart dmanda
```

Se o `prisma db push` avisar que vai perder dados ("data loss"), pare e leia o aviso. Não use
`--accept-data-loss` sem backup. Isso acontece quando a versão nova remove ou muda um campo do banco.

Durante o `npm run build` o sistema antigo continua no ar. O `pm2 restart` troca para a versão nova em poucos segundos.

Prompt para a IA:

```text
Preciso atualizar o Dmanda que está rodando numa VPS com PM2 para a versão mais nova do repositório. Me passe a sequência segura, explicando cada comando: backup do banco e da pasta storage, git pull, npm ci, prisma db push, build e pm2 restart. Diga o que fazer se o prisma db push avisar perda de dados e como voltar para a versão anterior com git e o backup se algo der errado.
```

---

## 14. Problemas comuns e soluções

| Problema | Causa provável | Solução |
|---|---|---|
| `SESSION_SECRET ausente ou curto demais` | Falta o .env ou a chave tem menos de 32 caracteres | Crie o .env (etapa 5) e gere a chave com `openssl rand -base64 48`. |
| `Environment variable not found: DATABASE_URL` | O .env não existe ou está em outra pasta | O .env precisa ficar na raiz do projeto, junto do package.json. |
| `Defina SEED_ADMIN_PASSWORD` ao rodar o seed | Senha vazia ou com menos de 8 caracteres | Preencha SEED_ADMIN_PASSWORD no .env. |
| `The table ... does not exist` | O banco ainda não foi criado | Rode `npx prisma db push`. |
| `@prisma/client did not initialize yet` | Faltou gerar o cliente do Prisma | Rode `npx prisma generate`. |
| `Port 3000 is already in use` | Outro programa usa a porta | `npm run dev -- -p 3001`. |
| No servidor, faz login e volta para a tela de entrada | Site sem HTTPS (o cookie seguro não é enviado) | Configure o Certbot (seção 10.6) e acesse por https://. |
| A tela não atualiza sozinha quando outra pessoa mexe | Nginx guardando a resposta da rota ao vivo | Use o bloco `location /api/ao-vivo` com `proxy_buffering off` (seção 10.5). |
| Erro 413 ao anexar arquivo | Limite de tamanho do Nginx | `client_max_body_size 30m;` no Nginx. |
| "Muitas tentativas" para todo mundo ao mesmo tempo | Nginx sem `X-Forwarded-For`, todos com o mesmo IP | Acrescente os cabeçalhos da seção 10.5. Reiniciar o processo zera os contadores. |
| Esqueci a senha do administrador | Não há recuperação por e-mail | Outro administrador gera uma senha nova em Configurações, Equipe. Se não houver outro, peça ajuda à IA (prompt abaixo). |
| `npm run build` falha baixando fontes | O build busca as fontes Geist no Google | Confira a internet da máquina e rode de novo. |
| Datas um dia antes ou depois | Fuso horário | Os scripts `dev` e `start` já usam `TZ=America/Sao_Paulo`. No Windows, rode pelo terminal do Git Bash ou WSL. |

Prompt para a IA:

```text
O projeto Dmanda está com um problema. Leia a tabela de problemas comuns na seção 14 do INSTALACAO.md, rode o projeto, reproduza o erro e veja as mensagens do terminal e do navegador. Descubra a causa real olhando o código e a configuração (.env, prisma/schema.prisma, src/proxy.ts, src/server/auth/session.ts), corrija e me explique em linguagem simples o que estava errado e o que foi mudado.
```

Prompt para recuperar o acesso de administrador:

```text
Perdi a senha do único administrador do meu Dmanda. Crie um script temporário em scripts/ que, usando o PrismaClient e a função hashPassword de src/server/auth/password.ts, gere uma senha temporária aleatória para o primeiro usuário com role ADMIN, marque mustChangePassword como true e atualize sessionsValidFrom para agora. Antes de rodar, faça um backup do arquivo do banco. Rode o script com npx tsx --env-file=.env, me mostre a senha temporária e depois apague o script.
```
