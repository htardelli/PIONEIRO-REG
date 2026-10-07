// Camada de acesso a dados. Duas implementações com a mesma interface:
// - Supabase (produção)
// - Local/demonstração (localStorage, com dados de exemplo) — ativa com ?demo ou sem chave configurada.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config'
import type { AuthUser } from './types'
import { buildDemoData, DEMO_ME } from './demo'

export type Table = 'profiles' | 'shares' | 'modalities' | 'month_records' | 'plan_items' | 'entries' | 'day_notes' | 'credits'
export type Row = Record<string, unknown>

export interface Query {
  eq?: Row
  in?: [string, unknown[]]
  range?: [string, string, string] // coluna, de, até (inclusive)
}

export interface Api {
  demo: boolean
  getUser(): Promise<AuthUser | null>
  onAuthChange(cb: () => void): () => void
  signIn(email: string, password: string): Promise<void>
  signUp(email: string, password: string, name: string): Promise<'ok' | 'confirm'>
  signOut(): Promise<void>
  select<T>(table: Table, q?: Query): Promise<T[]>
  insert(table: Table, rows: Row[]): Promise<void>
  upsert(table: Table, rows: Row[], onConflict: string): Promise<void>
  update(table: Table, match: Row, patch: Row): Promise<void>
  remove(table: Table, q: Query): Promise<void>
  rpc<T>(fn: string, args: Row): Promise<T>
}

// ---------- Supabase ----------
function translate(msg: string): string {
  if (/Invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.'
  if (/Email not confirmed/i.test(msg)) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.'
  if (/User already registered/i.test(msg)) return 'Este e-mail já tem cadastro. Use "Entrar".'
  if (/Password should be at least/i.test(msg)) return 'A senha precisa ter pelo menos 6 caracteres.'
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Sem conexão com o servidor. Verifique a internet.'
  return msg
}

function check(error: { message: string } | null) {
  if (error) throw new Error(translate(error.message))
}

function supabaseApi(): Api {
  const sb: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apply = (b: any, q?: Query) => {
    if (q?.eq) for (const [k, v] of Object.entries(q.eq)) b = b.eq(k, v)
    if (q?.in) b = b.in(q.in[0], q.in[1])
    if (q?.range) b = b.gte(q.range[0], q.range[1]).lte(q.range[0], q.range[2])
    return b
  }

  return {
    demo: false,
    async getUser() {
      const { data } = await sb.auth.getSession()
      const u = data.session?.user
      return u ? { id: u.id, email: u.email ?? '' } : null
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange(() => cb())
      return () => data.subscription.unsubscribe()
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password })
      check(error)
    },
    async signUp(email, password, name) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name } } })
      check(error)
      return data.session ? 'ok' : 'confirm'
    },
    async signOut() {
      await sb.auth.signOut()
    },
    async select<T>(table: Table, q?: Query) {
      // Paginação: o Supabase devolve no máximo 1000 linhas por chamada.
      const out: T[] = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await apply(sb.from(table).select('*'), q).range(from, from + 999)
        check(error)
        out.push(...(data as T[]))
        if (!data || data.length < 1000) return out
      }
    },
    async insert(table, rows) {
      if (!rows.length) return
      const { error } = await sb.from(table).insert(rows)
      check(error)
    },
    async upsert(table, rows, onConflict) {
      const { error } = await sb.from(table).upsert(rows, { onConflict })
      check(error)
    },
    async update(table, match, patch) {
      const { error } = await apply(sb.from(table).update(patch), { eq: match })
      check(error)
    },
    async remove(table, q) {
      const { error } = await apply(sb.from(table).delete(), q)
      check(error)
    },
    async rpc<T>(fn: string, args: Row) {
      const { data, error } = await sb.rpc(fn, args)
      check(error)
      return data as T
    },
  }
}

// ---------- Local / demonstração ----------
const LS_KEY = 'pioneiro-reg-demo-v1'

function localApi(): Api {
  type Db = Record<Table, Row[]>
  let db: Db
  try {
    db = JSON.parse(localStorage.getItem(LS_KEY) ?? '') as Db
  } catch {
    db = buildDemoData(new Date()) as unknown as Db
  }
  const save = () => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(db)) } catch { /* modo privado */ }
  }
  save()
  const match = (r: Row, q?: Query) =>
    (!q?.eq || Object.entries(q.eq).every(([k, v]) => r[k] === v)) &&
    (!q?.in || q.in[1].includes(r[q.in[0]])) &&
    (!q?.range || (String(r[q.range[0]]) >= q.range[1] && String(r[q.range[0]]) <= q.range[2]))
  let logged = true
  const listeners = new Set<() => void>()
  const keyOf = (r: Row, cols: string[]) => cols.map((c) => String(r[c])).join('|')

  return {
    demo: true,
    async getUser() {
      return logged ? { id: DEMO_ME, email: 'voce@exemplo.com' } : null
    },
    onAuthChange(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    async signIn() { logged = true; listeners.forEach((l) => l()) },
    async signUp() { logged = true; listeners.forEach((l) => l()); return 'ok' },
    async signOut() {
      localStorage.removeItem(LS_KEY)
      db = buildDemoData(new Date()) as unknown as Db
      save()
      logged = false
      listeners.forEach((l) => l())
    },
    async select<T>(table: Table, q?: Query) {
      return db[table].filter((r) => match(r, q)).map((r) => ({ ...r })) as T[]
    },
    async insert(table, rows) {
      db[table].push(...rows.map((r) => ({ id: crypto.randomUUID(), ...r })))
      save()
    },
    async upsert(table, rows, onConflict) {
      const cols = onConflict.split(',')
      for (const r of rows) {
        const i = db[table].findIndex((x) => keyOf(x, cols) === keyOf(r, cols))
        if (i >= 0) db[table][i] = { ...db[table][i], ...r }
        else db[table].push(r)
      }
      save()
    },
    async update(table, m, patch) {
      db[table] = db[table].map((r) => (match(r, { eq: m }) ? { ...r, ...patch } : r))
      save()
    },
    async remove(table, q) {
      db[table] = db[table].filter((r) => !match(r, q))
      save()
    },
    async rpc<T>() {
      return null as T
    },
  }
}

export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
const wantsDemo = typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo')

export const api: Api = !isConfigured || wantsDemo ? localApi() : supabaseApi()
