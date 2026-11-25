-- ============================================================
-- FLOW TV — Sistema Multi-Tenant de Provedores e Revendedores
-- Execute este script no SQL Editor do Supabase
-- ============================================================

-- 1. Tabela de Provedores (Revendedores Parceiros)
CREATE TABLE IF NOT EXISTS public.providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,                     -- Código único em maiúsculas (ex: PROV101, ALPHA)
    name TEXT NOT NULL,                            -- Nome do Provedor / Revenda
    admin_password TEXT NOT NULL DEFAULT 'admin123',-- Senha de acesso ao painel do provedor
    credits_limit INTEGER NOT NULL DEFAULT 50,     -- Limite de clientes liberados por você
    credits_used INTEGER NOT NULL DEFAULT 0,       -- Contador de clientes ativos
    status TEXT NOT NULL DEFAULT 'active',         -- 'active' (ativo) ou 'suspended' (bloqueado)
    notes TEXT,                                    -- Observações / Contato do revendedor
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE            -- Vencimento da parceria
);

-- Inserir um provedor inicial de teste
INSERT INTO public.providers (code, name, admin_password, credits_limit, status)
VALUES ('PROV101', 'Provedor Alpha TV', 'admin123', 100, 'active')
ON CONFLICT (code) DO NOTHING;

-- 2. Adicionar coluna provider_code e is_blocked nas tabelas existentes para isolamento total
ALTER TABLE public.app_users 
ADD COLUMN IF NOT EXISTS provider_code TEXT DEFAULT 'global';

ALTER TABLE public.app_users 
ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false;

ALTER TABLE public.app_users 
ADD COLUMN IF NOT EXISTS pay_url TEXT;

ALTER TABLE public.watch_history 
ADD COLUMN IF NOT EXISTS provider_code TEXT DEFAULT 'global';

ALTER TABLE public.favorites 
ADD COLUMN IF NOT EXISTS provider_code TEXT DEFAULT 'global';

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_app_users_provider ON public.app_users(provider_code);
CREATE INDEX IF NOT EXISTS idx_watch_history_provider ON public.watch_history(provider_code);
CREATE INDEX IF NOT EXISTS idx_favorites_provider ON public.favorites(provider_code);

-- 3. Desabilitar RLS na tabela providers para acesso do painel
ALTER TABLE public.providers DISABLE ROW LEVEL SECURITY;
