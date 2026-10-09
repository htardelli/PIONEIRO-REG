# Segurança — Pioneiro-REG

Revisão de outubro/2026 (banco, funções, front-end e publicação).

## Modelo de proteção

- **Dados no Supabase (Postgres) com RLS em todas as 10 tabelas**: cada pessoa grava só os próprios dados
  (`user_id = auth.uid()`) e lê os próprios e os de quem **compartilhou com ela** (`can_read`).
- **Compartilhamento por consentimento**: cada um compartilha os **seus** dados (`link_partner` grava sempre
  `owner = quem chamou`). Ninguém consegue se colocar como leitor de outra pessoa.
- **Escrita no cônjuge** só por funções `partner_*` e só com **compartilhamento mútuo** — e apenas para
  **atividades conjuntas** (com `group_id`), com datas numa janela razoável e listas limitadas.
- **Perfil**: ninguém se promove a administrador nem religa a troca obrigatória de senha (gatilho `protect_profile_flags`).
- **Contas novas** só pelo administrador (Configurações), com senha provisória e troca obrigatória no primeiro acesso.
- A chave `anon` em `src/config.ts` é **pública por definição**; a proteção é o RLS.

## Achados e correções (v0.12)

| # | Severidade | Achado | Situação |
|---|---|---|---|
| 1 | Média | Compartilhamento mútuo permitia ao cônjuge gravar lançamentos/planos **não conjuntos** (sem `group_id`), em qualquer data e em quantidade ilimitada; textos sem limite | **Corrigido**: `check_partner_items` exige `group_id`, limita a 1000 itens, datas entre −400 e +400 dias (realizado: no máximo até amanhã); textos truncados. Texto da tela Casal ajustado |
| 2 | Média | Funções `can_read`, `link_partner`, `unlink_partner`, `is_mutual` e `partner_modality` executáveis pelo papel anônimo; `partner_modality` sem checagem (vazava o nome do perfil) | **Corrigido**: `revoke` do anônimo; `is_mutual`/`partner_modality` só internas; `partner_modality` exige compartilhamento mútuo |
| 3 | Média | Cadastro público + `link_partner` permitiam descobrir se um e-mail tem conta | **Corrigido no app**: tela de login sem "Criar conta". **Pendente (você)**: desligar o cadastro no Supabase |
| 4 | Média/Baixa | Um estranho que compartilhasse com a vítima podia aparecer como "cônjuge" e usar foto/cor externas (rastreamento) | **Corrigido**: cônjuge = compartilhamento **mútuo** (escolha estável); cor só hexadecimal; foto só JPEG pequeno em data URL (≤150 KB); **CSP** só permite recursos do app e o Supabase do projeto |
| 5 | Baixa | Injeção de fórmula no "Exportar Excel" | **Corrigido**: células iniciadas por `= + - @` são neutralizadas |
| 6 | Baixa | Quebra de linha não escapada no `.ics` | **Corrigido** |
| 7 | Baixa | CI com permissão de escrita em todos os jobs; diagnóstico da senha (tamanho/tipos) no log público | **Corrigido**: permissão mínima (escrita só no job de publicação), checkout do banco sem credenciais, diagnóstico removido |
| 8 | Baixa | Arquivo de teste `erro.txt` com endereço de conexão do banco no **histórico** do repositório público | Arquivo removido. **Pendente (você)**: trocar a senha do banco e atualizar o segredo `SUPABASE_DB_PASSWORD` |
| 9 | Info | Troca obrigatória de senha é imposta no app (não no servidor) | Aceito (contas só do casal) |

## Ações pendentes (manuais, no painel)

1. **Supabase → Authentication → Sign In / Providers → "Allow new users to sign up" → desligar.**
2. **Supabase → Project Settings → Database → Reset database password**, depois atualizar o segredo
   `SUPABASE_DB_PASSWORD` no GitHub (*Settings → Secrets and variables → Actions*).
3. (Opcional) Fixar as actions do workflow por SHA em vez de `@v4`.

## Verificado e OK

- Nenhum `dangerouslySetInnerHTML`/`eval`; o React escapa os textos; links externos com `encodeURIComponent`.
- `shares` sem política de inserção direta; `profiles` sem inserção/remoção direta.
- `admin_create_user`: exige `is_admin`, valida e-mail e senha (8+), senha com bcrypt, indisponível ao anônimo.
- Funções `security definer` com `search_path` fixo e sem SQL dinâmico com entrada do usuário.
- Modo demonstração (`?demo`) totalmente local; service worker só guarda o app (não a API).
- Segredo do banco mascarado no log; publicação só por `push` em `main` ou execução manual.
