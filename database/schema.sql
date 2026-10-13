-- Contas: esquema inicial para Neon PostgreSQL.
-- Seguro para reexecução; não remove nem altera dados existentes.
CREATE TABLE IF NOT EXISTS public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('checking','savings','cash','credit_card','investment','other')),
  institution text,
  initial_balance numeric(14,2) NOT NULL DEFAULT 0,
  color text NOT NULL DEFAULT '#16a34a',
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('income','expense')),
  color text NOT NULL DEFAULT '#64748b',
  icon text NOT NULL DEFAULT 'circle',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(name,kind)
);
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('income','expense','transfer')),
  description text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  paid boolean NOT NULL DEFAULT true,
  paid_at timestamptz,
  payment_method text,
  notes text,
  transfer_group uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.categories(id) ON DELETE CASCADE,
  month date NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(category_id,month)
);
CREATE TABLE IF NOT EXISTS public.goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  target_amount numeric(14,2) NOT NULL CHECK (target_amount > 0),
  current_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (current_amount >= 0),
  target_date date,
  color text NOT NULL DEFAULT '#16a34a',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transactions_date_idx ON public.transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS transactions_due_date_idx ON public.transactions(due_date);
CREATE INDEX IF NOT EXISTS transactions_account_idx ON public.transactions(account_id);
CREATE INDEX IF NOT EXISTS transactions_category_idx ON public.transactions(category_id);
INSERT INTO public.categories(name,kind,color,icon,is_default) VALUES
 ('Salário','income','#16a34a','wallet',true),
 ('Rendimentos','income','#0d9488','trending-up',true),
 ('Outras receitas','income','#64748b','plus-circle',true),
 ('Moradia','expense','#f97316','house',true),
 ('Alimentação','expense','#eab308','utensils',true),
 ('Transporte','expense','#3b82f6','car',true),
 ('Saúde','expense','#ec4899','heart-pulse',true),
 ('Educação','expense','#8b5cf6','book-open',true),
 ('Lazer','expense','#06b6d4','clapperboard',true),
 ('Contas da casa','expense','#64748b','receipt',true),
 ('Compras','expense','#d946ef','shopping-bag',true),
 ('Assinaturas','expense','#6366f1','repeat',true),
 ('Outros gastos','expense','#94a3b8','circle',true)
ON CONFLICT(name,kind) DO NOTHING;
