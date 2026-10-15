# Dmanda, código do aluno

Sistema de demandas da equipe em quadros kanban, com aprovação de posts pelo cliente.
Feito com Next.js 16, React 19, Prisma 6 e PostgreSQL.

Para configurar o banco Neon e as variáveis da Vercel, siga [VERCEL.md](VERCEL.md).
O guia antigo de VPS em INSTALACAO.md descreve a configuração anterior com SQLite;
as instruções de banco `file:...` desse guia não se aplicam ao schema atual.

## Guias

| Arquivo | Para que serve |
|---|---|
| [INSTALACAO.md](INSTALACAO.md) | Passo a passo para instalar no computador, colocar no ar numa VPS, fazer backup, atualizar e resolver problemas. Cada etapa tem um prompt pronto para a IA. |
| [ARQUITETURA.md](ARQUITETURA.md) | Como o sistema funciona por dentro, pasta por pasta e arquivo por arquivo. |
| [PROMPTS.md](PROMPTS.md) | Prompts prontos para pedir mudanças à IA: cores e logo, campo novo, colunas, notificações, tradução, HTTPS. |

## Funcionalidades

- **Quadros** com modelos prontos (Básico, Produção de conteúdo, Semana da equipe, Em branco), cor, favoritos,
  pastas, arquivamento, duplicar e salvar como modelo.
- **Colunas** arrastáveis, com cor, limite de demandas e coluna de concluídas (entrar conclui, sair reabre).
- **Demandas** arrastáveis: número (#123), responsáveis, etiquetas, prioridade, início e prazo, capa de cor ou
  de imagem, estimativa, repetição diária, semanal ou mensal, checklists, anexos até 25 MB, comentários com
  texto formatado e @menção, cronômetro, histórico, duplicar, mover para outro quadro, arquivar.
- **Modelos de demanda** reaproveitáveis.
- **Três visões** por quadro: Quadro, Lista e Calendário.
- **Início** com minhas demandas por prazo, **Agenda** de todos os quadros e **busca** global (Ctrl+K ou Cmd+K).
- **Tempo real**: o que uma pessoa muda aparece na tela das outras sem recarregar.
- **Notificações** de responsável, menção, comentário, mudança de coluna e resposta do cliente.
- **Clientes** com logo, contato e cliente padrão por quadro.
- **Aprovação de posts**: a equipe envia artes, carrosséis, vídeos ou textos; o cliente aprova ou pede ajuste
  por um link sem login, conversa com a equipe e a demanda anda sozinha no quadro. Várias versões por post.
- **Link público** de quadro só para leitura.
- **Equipe**: administrador cria acessos com senha temporária, desativa e gera nova senha. Primeiro acesso cria a conta de dono.
- **Perfil**: foto, cor do sistema, intensidade do vidro, troca de senha.
- Tema claro e escuro, funciona no celular.
- Segurança: senha com scrypt, sessão em cookie httpOnly relida no banco a cada acesso, limite de tentativas,
  validação de toda entrada, uploads com lista branca, cabeçalhos de segurança e registro de ações administrativas.

## Começo rápido

```bash
npm install
cp .env.example .env      # preencha SESSION_SECRET (openssl rand -base64 48) e SEED_ADMIN_PASSWORD
npm run db:deploy        # preencha DATABASE_URL e DIRECT_URL antes
npm run db:seed           # opcional, dados de demonstração fictícios
npm run dev               # abra http://localhost:3000
```

Login de demonstração: `admin@demanda.local` com a senha de `SEED_ADMIN_PASSWORD`.
Sem o seed, use a aba **Primeiro acesso** na tela de entrada.

Detalhes de cada passo em [INSTALACAO.md](INSTALACAO.md).
