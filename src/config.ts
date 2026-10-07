// Conexão com o Supabase. A chave "anon public" é pública por natureza:
// a segurança dos dados é garantida pelas regras RLS do banco (supabase/schema.sql).
// Pode ser sobrescrita em tempo de build por VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
export const SUPABASE_URL: string =
  import.meta.env.VITE_SUPABASE_URL || 'https://dlrcvcjqofxkdyujfzhy.supabase.co'

export const SUPABASE_ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
