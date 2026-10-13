# Contas — Finanças pessoais

Aplicação web mobile-first para organizar finanças pessoais, inspirada em padrões de usabilidade de aplicativos de controle financeiro.

## Stack
- Frontend estático publicado no GitHub Pages.
- PostgreSQL no Neon, projeto `Contas`, banco `neondb`, branch `production`.
- API intermediária no Neon Functions; o navegador não deve receber a `DATABASE_URL` nem credenciais privadas.

## Funcionalidades previstas
- Dashboard mensal com receitas, despesas, saldo e contas a vencer.
- Lançamentos de receitas, despesas e transferências.
- Contas bancárias, dinheiro e cartões.
- Categorias personalizáveis.
- Orçamentos mensais por categoria.
- Metas financeiras.
- Filtros por período, categoria e conta; edição e exclusão de lançamentos.

## Banco de dados
O esquema inicial está em `database/schema.sql`. Ele cria tabelas de contas, categorias, transações, orçamentos e metas, além de índices e categorias iniciais. O script é idempotente e não apaga dados.

## Configuração
A interface deve chamar apenas a API pública do aplicativo. Configure a URL da API no frontend após o deployment da Neon Function. Nunca inclua strings de conexão, senhas ou tokens privados em arquivos servidos pelo GitHub Pages.

## Publicação
Ative GitHub Pages em Settings → Pages → Deploy from a branch → `main` → `/ (root)`.

## Segurança
Este projeto lida com dados financeiros pessoais. Antes de uso real, configure autenticação e isolamento dos dados por usuário na API. Não armazene informações bancárias sensíveis, senhas ou números completos de cartões.
