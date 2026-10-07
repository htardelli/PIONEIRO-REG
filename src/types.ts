export interface Profile {
  id: string
  name: string
  email: string | null
  color: string
  annual_goal_min: number
  min_goal_min: number
  is_admin?: boolean
  must_change_password?: boolean
}

export interface Modality {
  id: string
  user_id: string
  name: string
  color: string
  active: boolean
  sort: number
}

export interface MonthRecord {
  user_id: string
  month: string // YYYY-MM
  goal_min: number
  bible_studies: number
  justification: string
}

/** Item de plano ou de realizado: minutos de uma modalidade num dia. */
export interface DayItem {
  id: string
  user_id: string
  date: string // YYYY-MM-DD
  modality_id: string
  minutes: number
  start_time?: string | null // HH:MM[:SS] (somente no planejamento)
  end_time?: string | null
  group_id?: string | null // atividade conjunta (mesmo id nos participantes)
  absent?: boolean // falta registrada nesta atividade (0 min)
  note?: string // motivo da falta
}

export interface DayNote {
  user_id: string
  date: string
  note: string
}

/** Evento do dia (congresso, assembleia…): explica a ausência de plano. */
export interface DayEvent {
  id: string
  user_id: string
  date: string
  kind: string
  title: string
  group_id?: string | null
}

export interface EventType {
  id: string
  user_id: string
  name: string
  sort: number
}

export interface Credit {
  id: string
  user_id: string
  month: string
  type: string
  minutes: number
  note: string
}

export interface Share {
  owner: string
  viewer: string
}

export interface AuthUser {
  id: string
  email: string
}
