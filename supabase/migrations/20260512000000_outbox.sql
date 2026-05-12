CREATE TABLE IF NOT EXISTS public.outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event text NOT NULL,
  module text NOT NULL,
  payload jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
  retries int NOT NULL DEFAULT 0,
  last_error text,
  next_retry_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_outbox_status ON public.outbox(status, next_retry_at);

ALTER TABLE public.outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "outbox_service_insert" ON public.outbox
  FOR INSERT WITH CHECK (true);

CREATE POLICY "outbox_service_update" ON public.outbox
  FOR UPDATE USING (true);

CREATE POLICY "outbox_no_select" ON public.outbox
  FOR SELECT USING (false);

CREATE POLICY "outbox_no_delete" ON public.outbox
  FOR DELETE USING (false);
