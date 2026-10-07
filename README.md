# Pioneiro-REG

Registro e acompanhamento das horas do pioneiro regular, por **ano de serviço (set → ago)**.

- Meta anual (600 h) e mínimo tolerável (560 h) configuráveis
- 12 cards de meses no painel (verde = concluído · vermelho = encerrado abaixo · amarelo = em andamento · cinza = a vir)
- Planejamento por dia com horário de início/fim (bloqueia conflitos), repetição no mês ou no ano e exclusão por dia, semana, mês ou ano
- Lançamento diário: "Cumpri o planejado" em 1 toque ou ajuste por modalidade
- Créditos de horas com o teto de **55 h/mês** (ministério + crédito) e sem transferência (S-236 §10–11)
- Relatório mensal (horas, estudos, crédito em Observações), exportação para Excel (CSV)
- Visão do casal: cada um edita o seu e vê o do outro

App: https://htardelli.github.io/PIONEIRO-REG/ · Demonstração: https://htardelli.github.io/PIONEIRO-REG/?demo

## Configuração (uma vez)

1. **Banco** — automático: cada push em `main` aplica `supabase/schema.sql` (idempotente, em transação) antes de publicar.
   Requer o segredo `SUPABASE_DB_PASSWORD` (só a senha do banco) no GitHub (*Settings → Secrets and variables → Actions*);
   o endereço do Session pooler é montado pelo workflow. Sem o segredo, a etapa é ignorada com aviso.
2. **Chave** — a URL e a *anon public key* já estão em `src/config.ts` (são públicas; a proteção é o RLS).
3. **Publicação** — automática: cada push em `main` testa, compila e publica no branch `gh-pages` (GitHub Pages).
4. (Opcional) Supabase → *Authentication → Sign In / Providers → Email* → desligar *Confirm email*
   para entrar sem precisar confirmar o e-mail.
5. Cada pessoa cria a sua conta no app; uma delas vincula o cônjuge pelo e-mail na aba **Casal**.

## Desenvolvimento

```bash
npm install
npm run dev      # http://localhost:5173/PIONEIRO-REG/?demo
npm test         # regras de negócio (src/domain.test.ts)
npm run build
```

Estrutura: `src/domain.ts` (regras), `src/data.ts` (carga e estatísticas), `src/api.ts` (Supabase / modo demo),
`src/screens/*` (telas), `supabase/schema.sql` (tabelas + RLS).
