CREATE UNIQUE INDEX IF NOT EXISTS idx_user_active_sessions_token
  ON public.user_active_sessions(session_token);
