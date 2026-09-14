-- ==============================================================================
-- Arcable Sync Schema for Supabase PostgreSQL
-- ==============================================================================
-- Run this SQL in your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- to initialize tables, indexes, RLS policies, and realtime publications.

-- 1. Create Workspaces Table (State Snapshots)
CREATE TABLE IF NOT EXISTS public.workspaces (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    version BIGINT NOT NULL DEFAULT 1,
    state JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.workspaces IS 'Stores the latest full consolidated workspace JSONB state snapshot and version for each user.';

-- 2. Create Workspace Operations Table (Append-only Ops Log)
CREATE TABLE IF NOT EXISTS public.workspace_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    version BIGINT NOT NULL,
    device_id TEXT NOT NULL,
    type TEXT NOT NULL,
    payload JSONB,
    timestamp BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.workspace_operations IS 'Append-only operation log allowing smart diff calculation and audit history.';

-- 3. Indexes for fast version lookups and diff extraction
CREATE INDEX IF NOT EXISTS idx_workspace_ops_user_version 
    ON public.workspace_operations (user_id, version ASC);

CREATE INDEX IF NOT EXISTS idx_workspace_ops_created_at 
    ON public.workspace_operations (created_at DESC);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_operations ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies: Ensure users can only access their own data
-- Workspaces policies
CREATE POLICY "Users can read own workspace"
    ON public.workspaces
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own workspace"
    ON public.workspaces
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own workspace"
    ON public.workspaces
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Workspace operations policies
CREATE POLICY "Users can read own operations"
    ON public.workspace_operations
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own operations"
    ON public.workspace_operations
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- 6. Enable Realtime on the workspaces table
-- This allows clients to listen for instant remote update broadcasts
ALTER PUBLICATION supabase_realtime ADD TABLE public.workspaces;

-- 7. Optional: Cleanup routine for older operations (retention policy)
-- Can be called periodically or via pg_cron to keep only the last 5,000 operations per user
CREATE OR REPLACE FUNCTION public.prune_old_workspace_operations(p_user_id UUID, p_keep_count INT DEFAULT 2000)
RETURNS VOID AS $$
BEGIN
    DELETE FROM public.workspace_operations
    WHERE id IN (
        SELECT id FROM public.workspace_operations
        WHERE user_id = p_user_id
        ORDER BY version DESC
        OFFSET p_keep_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
