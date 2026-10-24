# Contas — Finanças pessoais

Aplicativo de finanças pessoais com interface responsiva, lançamentos persistidos no PostgreSQL e acesso por senha privada.

## Arquitetura
- **Frontend e API:** Vercel, com funções Node.js na pasta `api/`.
- **Banco de dados:** Neon PostgreSQL, projeto `Contas`, banco `neondb`, branch `production`.
- **Código-fonte:** GitHub, repositório `leorbr27/Contas`.
- **Acesso:** senha privada e cookie de sessão `HttpOnly`, `Secure` e `SameSite=Strict`.

Use o endereço de produção da Vercel para abrir o aplicativo. A versão do GitHub Pages é apenas hospedagem estática e não oferece as funções de API necessárias para persistência no Neon.

## Funcionalidades implementadas
- Dashboard com receitas, despesas, saldo e lançamentos pendentes calculados a partir do Neon.
- Criar, editar e excluir lançamentos.
- Categorias e contas carregadas do banco.
- Backup JSON e importação de lançamentos.
- Login por senha privada e encerramento de sessão.

As telas de orçamentos e metas ainda são informativas e não possuem cadastros funcionais.

## Banco de dados
O esquema inicial está em `database/schema.sql`. Ele cria tabelas de contas, categorias, transações, orçamentos e metas, índices e categorias iniciais. O script é idempotente e não apaga dados existentes.

## Variáveis de ambiente da Vercel
Configure estas variáveis como **Sensitive** para Production, Preview e Development:
- `DATABASE_URL`: string de conexão do Neon. Usada apenas no servidor.
- `APP_PASSWORD`: senha privada de acesso ao aplicativo.
- `SESSION_SECRET`: segredo aleatório para assinar cookies de sessão.

Nunca inclua esses valores em `app.js`, `index.html`, no repositório ou em qualquer arquivo servido ao navegador. Depois de alterar variáveis, gere uma nova implantação.

## Desenvolvimento local
Requer Node.js 20+ e npm. Instale as dependências com `npm install`, configure as três variáveis em um arquivo `.env` local (não o envie ao GitHub) e execute com a Vercel CLI. O arquivo `.gitignore` exclui arquivos de ambiente e artefatos locais.

## Segurança
A API valida a sessão antes de ler ou modificar dados e usa consultas SQL parametrizadas. Não armazene senhas bancárias, números completos de cartões ou outros dados de autenticação financeira no aplicativo.
