# Pioneiro-REG — Documentação

Aplicativo (PWA) para o casal acompanhar as horas de **pioneiro regular** por **ano de serviço** (setembro → agosto),
com meta anual de **600 h** (mínimo tolerável de **560 h**, com justificativa).

- App: https://htardelli.github.io/PIONEIRO-REG/
- Demonstração (dados fictícios, salvos só no aparelho): https://htardelli.github.io/PIONEIRO-REG/?demo

---

## 1. Arquitetura

```
 Celular / navegador (PWA instalável, atualização automática)
   └─ React 19 + TypeScript (Vite) ── src/
         │  supabase-js (chave pública "anon")
         ▼
 Supabase (Postgres + Auth)
   ├─ Tabelas com RLS: cada usuário lê o seu e o do cônjuge que compartilhou; escreve só o seu
   └─ Funções "security definer" para escrever no plano/realizado do cônjuge (exigem compartilhamento mútuo)

 GitHub (repositório público) ── push em main
   └─ Actions (deploy.yml)
        1. Banco: aplica supabase/schema.sql (idempotente, em transação) — segredo SUPABASE_DB_PASSWORD
        2. Publicação: testes → build → branch gh-pages (GitHub Pages)
```

- **Sem servidor próprio**: o front fala direto com o Supabase. A proteção dos dados é o **RLS** do Postgres
  (a chave `anon` em `src/config.ts` é pública por definição).
- **Modo demonstração** (`?demo`): a mesma interface com uma API local sobre `localStorage` (`src/api.ts`, `src/demo.ts`),
  que simula também as funções do banco. `&hoje=AAAA-MM-DD` simula a data.

## 2. Estrutura de pastas

| Caminho | Conteúdo |
|---|---|
| `src/domain.ts` | Regras puras: ano de serviço, teto de 55 h, ritmo ideal, hh:mm, repetição de datas, conflitos de horário, feriados (nacionais + CE, Páscoa), semana seg–dom, agrupamento de datas seguidas |
| `src/data.ts` | Carga do ano (`loadYear`) e estatísticas: mês, ano, rateio, estado do dia, faltas, realizado × planejado, semana, alerta de plano abaixo do ritmo, exportação `.ics` |
| `src/api.ts` | Camada de dados: Supabase (produção) e local (demonstração) com a mesma interface |
| `src/ui.tsx` | Componentes: barra de abas, cabeçalho, avatar, navegação de mês (grade dos 12 meses), editor de blocos, diálogo de múltipla escolha, legendas |
| `src/screens/` | Telas: `Painel`, `Lancar`, `Mes` (aba com o nome do mês), `Plano`, `Relatorio`, `Casal`, `Config`, `Auth`, `ChangePassword` |
| `src/*.test.ts` | Testes (vitest) das regras de negócio |
| `supabase/schema.sql` | Esquema completo: tabelas, RLS, gatilhos e funções (versões v0.2 → v0.11, idempotente) |
| `.github/workflows/deploy.yml` | Atualização do banco + publicação |
| `docs/` | Esta documentação e os protótipos de layout |

## 3. Modelo de dados (Supabase)

| Tabela | Uso | Acesso (RLS) |
|---|---|---|
| `profiles` | Nome, cor, metas (600/560 h em minutos), foto (`avatar`), `is_admin`, `must_change_password` | Lê o próprio e o de quem compartilhou; altera só o próprio (gatilho impede mudar `is_admin` / religar troca de senha) |
| `shares` | Consentimento: `owner` compartilha os **seus** dados com `viewer` | Leitura por quem participa; criação/remoção só via `link_partner` / `unlink_partner` |
| `modalities` | Modalidades (Cartas, TPE/TPL, Casa em Casa…) com cor e ativa/inativa | Próprio + compartilhado (leitura) |
| `month_records` | Por mês: meta (opcional), estudos bíblicos, justificativa | idem |
| `plan_items` | Plano: data, modalidade, minutos, início/fim, `group_id` (atividade conjunta) | idem |
| `entries` | Realizado: idem + `absent`/`note` (falta por atividade) | idem |
| `day_notes` | Observação do dia / falta do dia ("Faltei · motivo") | idem |
| `credits` | Créditos de horas do mês (tipo, minutos, observação) | idem |
| `day_events` | Eventos do dia (congresso, assembleia…), `group_id` quando vale para o casal | idem |
| `event_types` | Tipos de evento cadastrados em Configurações | idem |

Funções principais: `can_read`, `is_mutual`, `link_partner`, `unlink_partner`, `admin_create_user`,
`partner_plan_upsert`, `partner_plan_delete(_dates)`, `partner_entries_add`, `partner_absence_add`,
`partner_events_add`, `partner_events_delete`, `partner_modality`. Todas as que escrevem no cônjuge exigem
**compartilhamento mútuo** e não estão disponíveis para o papel anônimo.

## 4. Regras de negócio

- **Ano de serviço**: setembro a agosto. Horas guardadas em minutos e exibidas em **hh:mm** (07:30).
- **Teto mensal**: ministério + crédito ≤ 55 h; o crédito só completa até 55 h e não passa para outro mês (S-236 §11).
- **Alvo do mês**: **plano** do mês; sem plano, a **meta**; sem plano e sem meta, o **rateio**
  (o que falta para 600 h ÷ meses em aberto sem plano e sem meta). Mês encerrado sem plano/meta: só o realizado.
- **Ritmo ideal**: 600 h proporcional aos dias decorridos do ano de serviço.
- **Meta da semana** (seg–dom): o que falta para 600 h (sem contar a semana) ÷ semanas restantes.
- **Alerta de plano abaixo do ritmo**: mês em aberto cujo plano < média necessária por mês (tolerância 30 min). Pode ser fechado; volta se a situação mudar.
- **Falta**: zera as horas planejadas da atividade/dia (não entram no planejado), mas a **justificativa fica no histórico** (Relatório → Faltas do ano).
- **Atividades de hoje**: só podem ser lançadas **depois do horário de término**; até lá contam como pendentes (nunca como falta).
- **Contagem cumpridas/parciais/faltas**: por **atividade planejada** (pareia o realizado com o plano pela atividade conjunta ou pela modalidade).
- **Alerta de ritmo no Relatório**: só para **mês fechado** cujo acumulado do ano ficou abaixo do ritmo ideal no último dia do mês.
- **Feriados**: nacionais (incl. Sexta-feira Santa), Ceará (19/03 e 25/03) e pontos facultativos (Carnaval, Corpus Christi).

## 5. Telas e fluxos

### Painel (ordem: dia → semana → mês → ano)
1. **Alerta** de plano abaixo do ritmo (com ✕ e "Ajustar plano ›").
2. **Hoje** (destaque turquesa): feito / planejado, barra, atividades com horário e descrição, situação, botões **Lançar** e **📅 Agenda** (.ics dos próximos 30 dias).
3. **Esta semana**: feito / meta, ponto ideal, barras por dia (plano tracejado × feito) com horas planejadas; "Meta ideal | Seu plano" e "Sugestão".
4. **Realizado × planejado** do mês até hoje (inclui o plano de hoje), com contagem por atividade e atalho para dias pendentes.
5. **Mês atual**: feito / alvo e quanto falta.
6. **Ano**: anel (adiantado/atrasado) e barra com Feito · Ideal · Mínimo · Meta.
7. **Meses do ano de serviço** (expansível, inicia oculto) + Planejamento anual.

### Lançar
- Seletor de data (calendário). Dias futuros bloqueados.
- **✓ Cumpri o planejado** (ou "as que já terminaram"), **Fiz diferente**, **✗ Faltei** (motivo), **+ Atividade não planejada**, **Editar lançamento**.
- Atividade conjunta: "Jessika também participou?" / "também faltou?" — lança para o cônjuge só o que ele(a) ainda não lançou.

### Aba do mês (nome do mês vigente)
- Calendário do realizado (cores por situação, contorno nos dias lançados, feriados/eventos) e detalhe do dia com **Plano | Realizado** lado a lado.

### Plano
- Calendário (semana começa na segunda), grade dos 12 meses ao tocar no nome do mês.
- Editor de blocos com horário, sem conflito; repetir no mês/ano (avisa e pergunta antes de substituir); excluir por dia/semana/mês/ano.
- **Selecionar vários dias**: excluir plano ou marcar evento. **📌 Marcar evento** com período (De/Até).
- Feriados e eventos do mês (dias seguidos do mesmo evento numa linha), meta do mês (hh:mm), alvo, planejado no mês e anual.

### Relatório
- Texto do relatório (S-4), estudos, créditos com teto de 55 h, exportação para Excel (CSV), justificativa, **Faltas do ano**, alerta de mês fechado abaixo do ritmo.

### Casal
- Compartilhar os **meus** dados (consentimento de cada um), comparativo, semana do casal e painel do cônjuge.

### Configurações
- Foto do perfil (recortada e reduzida no aparelho), nome, metas, cor, modalidades, **tipos de evento**,
  criação de conta com senha provisória (somente administrador), sair, versão.

## 6. Publicação e operação

- **Push em `main`** → GitHub Actions aplica o banco (se `supabase/` mudou) e publica o app.
- **Segredo**: `SUPABASE_DB_PASSWORD` (só a senha). O log nunca exibe a senha (máscara + diagnóstico só de tamanho/tipos).
- **PWA**: atualiza sozinho ao abrir (verifica a cada 30 min e ao voltar ao app); a versão aparece em Configurações.

## 7. Desenvolvimento

```bash
npm install
npm run dev     # http://localhost:5173/PIONEIRO-REG/?demo
npm test        # regras de negócio
npm run build
```

## 8. Segurança

Ver [SEGURANCA.md](SEGURANCA.md) — modelo de ameaças, revisão e pendências.

## 9. Revisão de fluxos (outubro/2026)

**Corrigido**
- "Fiz diferente" deixava a atividade do plano pendente e "Cumpri" depois somava horas em dobro: dia passado lançado não tem mais pendências, e o "Cumpri" verifica conflito de horário.
- Ano de serviço anterior: no início de setembro dá para lançar agosto (Lançar volta até 01/09 do ano anterior) e ver o Relatório de agosto (‹ no Relatório).
- "Hoje" não congela mais com o app aberto (virada do dia e ao voltar ao app).
- Plano: "Repetir" + "Pular dias" + "Para todos" não apaga mais a atividade do cônjuge nos dias pulados; desmarcar "Com cônjuge" desvincula a atividade.
- Falta conjunta parcial não aparece mais como "faltou o dia"; conta como falta (não como "não lançada").
- Falta conjunta lançada pelo cônjuge pode ser desfeita ("Desfazer falta").
- Dia passado sem lançamento aparece como pendente (tracejado) no Mês e no Plano, não como falta.
- "Repetir no mês" não reescreve dias passados.
- A nota "Faltei…" é limpa quando o dia passa a ter horas; o relatório S-4 não mostra "00:00 de crédito".
- Alerta do Painel do cônjuge não fecha o seu.

**Pendências conhecidas (baixo impacto)**
- Salvar o dia/plano não é atômico (remove e insere em chamadas separadas): uma queda de rede no meio pode perder o lançamento do dia.
- Salvar o dia sem nenhuma atividade vira falta sem justificativa.
- "Excluir planejamento" por semana/ano a partir de um dia passado preserva dias passados (inclusive o escolhido) se "incluir dias que já passaram" não estiver marcado.
- Dias restantes: o anel não conta hoje; o card do mês conta.
- Evento que atravessa meses aparece em duas linhas; o mesmo evento pode ser marcado duas vezes no mesmo dia.
- Meta anual em Configurações em horas inteiras; o .ics exporta também atividades com falta.
