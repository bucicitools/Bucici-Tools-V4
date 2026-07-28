-- 1. Buat Tabel Products dengan tenant_id
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    price NUMERIC DEFAULT 0 NOT NULL,
    cost_price NUMERIC DEFAULT 0 NOT NULL,
    stock INT DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. Buat Tabel Transactions dengan tenant_id
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    total_amount NUMERIC NOT NULL,
    tax_amount NUMERIC DEFAULT 0,
    payment_status TEXT DEFAULT 'LUNAS',
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 3. Aktifkan Row Level Security (RLS)
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. Kebijakan RLS: Pengguna dengan tenant_id yang sama BISA membaca & menulis data
CREATE POLICY "Akses Produk Berdasarkan Tenant" ON public.products
    FOR ALL USING (
        tenant_id IN (
            SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Akses Transaksi Berdasarkan Tenant" ON public.transactions
    FOR ALL USING (
        tenant_id IN (
            SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Akses Profil Rekan Se-Tenant" ON public.profiles
    FOR ALL USING (
        tenant_id IN (
            SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
        )
    );

