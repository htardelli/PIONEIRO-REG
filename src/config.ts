// Conexão com o Supabase. A chave "anon public" é pública por natureza:
// a segurança dos dados é garantida pelas regras RLS do banco (supabase/schema.sql).
// Pode ser sobrescrita em tempo de build por VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
export const SUPABASE_URL: string =
  import.meta.env.VITE_SUPABASE_URL || 'https://dlrcvcjqofxkdyujfzhy.supabase.co'

export const SUPABASE_ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRscmN2Y2pxb2Z4a2R5dWpmemh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzMDgwNTksImV4cCI6MjEwNjg4NDA1OX0.F5DKaOpuXPk5sqBzDINXSS_drF9qyOVoaKGxEMLnGWo'
