-- ============================================================
-- SQL Completo do FLOW TV para o seu Supabase
-- Execute este script no SQL Editor do Supabase para liberar exclusão e sync
-- ============================================================

-- 1. Tabela de Configurações Globais (DNS, Logo, Fundo, Banners)
CREATE TABLE IF NOT EXISTS public.app_config (
    id TEXT PRIMARY KEY DEFAULT 'global',
    dns_list JSONB DEFAULT '[]'::jsonb,
    logo TEXT,
    background TEXT,
    banner TEXT,
    banner_link TEXT,
    banners JSONB DEFAULT '[]'::jsonb,
    payment_info JSONB,
    payment_status TEXT,
    admin_password TEXT DEFAULT 'admin123',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Inserir registro inicial
INSERT INTO public.app_config (id, dns_list, admin_password)
VALUES ('global', '[]'::jsonb, 'admin123')
ON CONFLICT (id) DO NOTHING;

-- 2. Tabela de Usuários que acessam o App
CREATE TABLE IF NOT EXISTS public.app_users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    email TEXT,
    dns TEXT,
    exp_date TEXT,
    status TEXT DEFAULT 'active',
    is_blocked BOOLEAN DEFAULT false,
    last_login TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. Liberar Acesso e Operações (Desabilitar RLS para permitir Leitura, Inserção, Atualização e Exclusão pelo App)
ALTER TABLE public.app_config DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites DISABLE ROW LEVEL SECURITY;
