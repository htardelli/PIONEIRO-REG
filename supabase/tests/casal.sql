-- Testes do banco: permissões do casal, RLS, aprovação e salvamento atômico.
-- Roda depois de pre.sql e schema.sql. Qualquer falha interrompe (ON_ERROR_STOP) com a mensagem "FALHOU: ...".
\set ON_ERROR_STOP 1
grant all on all tables in schema public to authenticated; -- como no Supabase
insert into public.profiles (id, name, email) values ('11111111-1111-1111-1111-111111111111', 'Herbet', 'h@teste') on conflict do nothing;
update public.profiles set is_admin = true, approved = true where id = '11111111-1111-1111-1111-111111111111';
insert into auth.users (id, email, raw_user_meta_data) values
  ('22222222-2222-2222-2222-222222222222', 'j@teste', '{"name":"Jessika"}'),
  ('33333333-3333-3333-3333-333333333333', 'x@teste', '{"name":"Estranho"}'),
  ('44444444-4444-4444-4444-444444444444', 'p@teste', '{"name":"Pendente"}');
update public.profiles set approved = true where id in ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');
insert into public.modalities (id, user_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Casa em Casa'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Casa em Casa'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'Casa em Casa'),
  ('aaaaaaaa-0000-0000-0000-000000000004', '44444444-4444-4444-4444-444444444444', 'Casa em Casa');

-- Auxiliares de teste (removidos no fim)
create function public.t_ok(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FALHOU: %', msg; end if; end $$;
create function public.t_fails(cmd text, msg text, pat text default '') returns void language plpgsql as $$
begin
  begin execute cmd; exception when others then
    if pat <> '' and sqlerrm not ilike '%' || pat || '%' then raise exception 'FALHOU: % (erro inesperado: %)', msg, sqlerrm; end if;
    return;
  end;
  raise exception 'FALHOU: % (deveria ter sido bloqueado)', msg;
end $$;
create function public.t_item(d int, g text, s text, e text, extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('date', current_date + d, 'group_id', g, 'modality', 'Casa em Casa', 'start', s, 'end', e) || extra $$;
grant execute on function public.t_ok(boolean, text), public.t_fails(text, text, text), public.t_item(int, text, text, text, jsonb) to authenticated, anon;

-- ===== Herbet (H) e Jessika (J) =====
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select t_fails($$select partner_plan_upsert('22222222-2222-2222-2222-222222222222', jsonb_build_array(t_item(1, 'bbbbbbbb-0000-0000-0000-000000000001', '08:00', '09:00')))$$,
  'sem compartilhamento não grava no cônjuge', 'compartilhado');
select link_partner('j@teste');
select t_fails($$select partner_plan_upsert('22222222-2222-2222-2222-222222222222', jsonb_build_array(t_item(1, 'bbbbbbbb-0000-0000-0000-000000000001', '08:00', '09:00')))$$,
  'compartilhamento de um lado só não grava no cônjuge', 'compartilhado');
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select link_partner('h@teste');
-- J tem um plano próprio às 10h (para testar conflito)
insert into public.plan_items (date, modality_id, minutes, start_time, end_time) values (current_date + 1, 'aaaaaaaa-0000-0000-0000-000000000002', 60, '10:00', '11:00');

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select partner_plan_upsert('22222222-2222-2222-2222-222222222222', jsonb_build_array(t_item(1, 'bbbbbbbb-0000-0000-0000-000000000001', '08:00', '09:00')));
select t_ok((select count(*) from plan_items where user_id = '22222222-2222-2222-2222-222222222222' and group_id = 'bbbbbbbb-0000-0000-0000-000000000001') = 1,
  'plano conjunto gravado no cônjuge');
select partner_plan_upsert('22222222-2222-2222-2222-222222222222', jsonb_build_array(t_item(1, 'bbbbbbbb-0000-0000-0000-000000000001', '08:00', '09:30')));
select t_ok((select count(*) from plan_items where user_id = '22222222-2222-2222-2222-222222222222' and group_id = 'bbbbbbbb-0000-0000-0000-000000000001') = 1,
  'reenviar o mesmo grupo substitui (não duplica)');
select t_fails($$select partner_plan_upsert('22222222-2222-2222-2222-222222222222', jsonb_build_array(t_item(1, 'bbbbbbbb-0000-0000-0000-000000000002', '10:30', '11:30')))$$,
  'conflito de horário no plano do cônjuge', 'Conflito');
select t_fails($$select partner_plan_upsert('22222222-2222-2222-2222-222222222222', jsonb_build_array(t_item(1, '', '12:00', '13:00')))$$,
  'atividade não conjunta (sem group_id) no cônjuge', 'conjuntas');
select t_fails($$select partner_plan_upsert('22222222-2222-2222-2222-222222222222', jsonb_build_array(t_item(500, 'bbbbbbbb-0000-0000-0000-000000000003', '12:00', '13:00')))$$,
  'data fora da janela', 'Data');
select t_fails($$select partner_plan_upsert('22222222-2222-2222-2222-222222222222', (select jsonb_agg(t_item(1, gen_random_uuid()::text, '12:00', '13:00')) from generate_series(1, 1001)))$$,
  'lista acima de 1000 itens', 'máx');
select t_fails($$select partner_entries_add('22222222-2222-2222-2222-222222222222', jsonb_build_array(t_item(5, 'bbbbbbbb-0000-0000-0000-000000000004', '08:00', '09:00')))$$,
  'realizado no futuro (além de amanhã)', 'Data');
-- realizado conjunto: não duplica se o cônjuge já lançou
select t_ok(partner_entries_add('22222222-2222-2222-2222-222222222222', jsonb_build_array(t_item(0, 'bbbbbbbb-0000-0000-0000-000000000005', '08:00', '09:00'))) = 1, 'realizado conjunto gravado');
select t_ok(partner_entries_add('22222222-2222-2222-2222-222222222222', jsonb_build_array(t_item(0, 'bbbbbbbb-0000-0000-0000-000000000005', '08:00', '09:00'))) = 0, 'realizado conjunto não duplica');
-- falta conjunta só na atividade do grupo
select t_ok(partner_absence_add('22222222-2222-2222-2222-222222222222', current_date + 1, array['bbbbbbbb-0000-0000-0000-000000000001']::uuid[], 'Faltei (saúde)') = 1, 'falta conjunta gravada');
select t_ok((select count(*) from entries where user_id = '22222222-2222-2222-2222-222222222222' and date = current_date + 1 and absent) = 1, 'falta só da atividade conjunta');
-- eventos do casal
select partner_events_add('22222222-2222-2222-2222-222222222222', jsonb_build_array(t_item(2, 'cccccccc-0000-0000-0000-000000000001', '', '', '{"kind":"Assembleia"}')));
select partner_events_add('22222222-2222-2222-2222-222222222222', jsonb_build_array(t_item(2, 'cccccccc-0000-0000-0000-000000000001', '', '', '{"kind":"Assembleia"}')));
select t_ok((select count(*) from day_events where user_id = '22222222-2222-2222-2222-222222222222') = 1, 'evento conjunto não duplica');
-- J já tinha o mesmo evento por conta própria: o conjunto não duplica, passa a ser do casal
reset role;
insert into public.day_events (user_id, date, kind) values ('22222222-2222-2222-2222-222222222222', current_date + 6, 'Congresso');
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select partner_events_add('22222222-2222-2222-2222-222222222222', jsonb_build_array(t_item(6, 'cccccccc-0000-0000-0000-000000000002', '', '', '{"kind":"Congresso"}')));
select t_ok((select count(*) from day_events where user_id = '22222222-2222-2222-2222-222222222222' and date = current_date + 6) = 1, 'evento igual do cônjuge vira o conjunto');
select t_fails($$insert into day_events (date, kind) values (current_date + 7, 'Visita'), (current_date + 7, 'Visita')$$, 'mesmo evento duas vezes no dia', 'day_events_unique');
reset role;
delete from public.day_events where user_id = '22222222-2222-2222-2222-222222222222' and date = current_date + 6;
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select partner_events_delete('22222222-2222-2222-2222-222222222222', array['cccccccc-0000-0000-0000-000000000001']::uuid[], array[current_date + 2]);
select t_ok((select count(*) from day_events where user_id = '22222222-2222-2222-2222-222222222222') = 0, 'evento conjunto removido');
select partner_plan_delete_dates('22222222-2222-2222-2222-222222222222', array['bbbbbbbb-0000-0000-0000-000000000001']::uuid[], array[current_date + 1]);
select t_ok((select count(*) from plan_items where user_id = '22222222-2222-2222-2222-222222222222' and group_id is not null) = 0, 'plano conjunto removido das datas');
select t_ok((select count(*) from plan_items where user_id = '22222222-2222-2222-2222-222222222222' and group_id is null) = 1, 'plano próprio do cônjuge preservado');
-- RLS: lê o do cônjuge (compartilhado), não grava direto nele, não vira admin
select t_ok((select count(*) from modalities where user_id = '22222222-2222-2222-2222-222222222222') = 1, 'lê dados do cônjuge que compartilhou');
select t_fails($$insert into entries (user_id, date, modality_id, minutes) values ('22222222-2222-2222-2222-222222222222', current_date, 'aaaaaaaa-0000-0000-0000-000000000002', 60)$$,
  'gravar direto no cônjuge', 'row-level security');
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select t_fails($$update profiles set is_admin = true where id = auth.uid()$$, 'virar administrador', 'administrador');
select t_fails($$update profiles set approved = false where id = auth.uid()$$, 'mexer na própria aprovação', 'aprova');

-- ===== Estranho (X) =====
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select t_ok((select count(*) from entries where user_id <> auth.uid()) = 0, 'estranho não lê dados do casal');
select link_partner('h@teste'); -- X compartilha com H, mas H não com X
select t_fails($$select partner_entries_add('11111111-1111-1111-1111-111111111111', jsonb_build_array(t_item(0, 'dddddddd-0000-0000-0000-000000000001', '14:00', '15:00')))$$,
  'estranho grava em quem não compartilhou de volta', 'compartilhado');

-- ===== Conta pendente (P) =====
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
select t_ok((select count(*) from modalities) = 0, 'conta pendente não lê nem os próprios dados');
select t_fails($$select link_partner('h@teste')$$, 'conta pendente compartilha', 'aprovação');
select t_fails($$select save_day(current_date, '[]', '', '{}')$$, 'conta pendente lança', 'row-level security');
select t_fails($$select admin_set_approval(auth.uid(), true)$$, 'conta pendente se aprova', 'administradores');
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select t_ok((select count(*) from admin_pending_users()) = 1, 'admin vê o cadastro pendente');
select admin_set_approval('44444444-4444-4444-4444-444444444444', true);
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
select t_ok((select count(*) from modalities) = 1, 'conta aprovada passa a ver os próprios dados');

-- ===== Senha provisória =====
reset role;
update public.profiles set must_change_password = true where id = '33333333-3333-3333-3333-333333333333';
set role authenticated; set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select t_ok((select count(*) from modalities) = 0, 'senha provisória bloqueia os dados');
select t_fails($$update profiles set must_change_password = false where id = auth.uid()$$, 'desligar a troca sem trocar a senha', 'senha');
reset role;
update auth.users set encrypted_password = 'novo' where id = '33333333-3333-3333-3333-333333333333';
set role authenticated; set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select t_ok((select count(*) from modalities) = 1, 'após trocar a senha, volta a ver os dados');

-- ===== Salvamento atômico =====
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select save_day(current_date - 1, '[{"modality_id":"aaaaaaaa-0000-0000-0000-000000000001","minutes":60,"start":"08:00","end":"09:00"}]', 'ok', '{}');
select t_fails($$select save_day(current_date - 1, '[{"modality_id":"aaaaaaaa-0000-0000-0000-000000000001","minutes":60,"start":"10:00","end":"09:00"}]', 'nova', '{}')$$,
  'horário inválido no lançamento', 'time_order');
select t_ok((select sum(minutes) from entries where user_id = auth.uid() and date = current_date - 1) = 60, 'falha não apaga o lançamento anterior');
select t_ok((select note from day_notes where user_id = auth.uid() and date = current_date - 1) = 'ok', 'falha não troca a observação');
select save_plan(array[current_date + 3, current_date + 4], '[{"modality_id":"aaaaaaaa-0000-0000-0000-000000000001","minutes":60,"start":"08:00","end":"09:00"}]');
select t_fails($$select save_plan(array[current_date + 3], '[{"modality_id":"aaaaaaaa-0000-0000-0000-000000000002","minutes":60,"start":"08:00","end":"09:00"}]')$$,
  'plano com modalidade de outra pessoa', 'Modalidade');
select t_ok((select count(*) from plan_items where user_id = auth.uid() and date in (current_date + 3, current_date + 4)) = 2, 'falha no plano mantém o anterior');

-- ===== Papel anônimo =====
reset role; set role anon; set request.jwt.claim.sub = '';
select t_fails($$select partner_entries_add('22222222-2222-2222-2222-222222222222', '[]')$$, 'anônimo chama função do casal', 'permission');
select t_fails($$select save_day(current_date, '[]', '', '{}')$$, 'anônimo lança', 'permission');

reset role;
drop function public.t_ok(boolean, text), public.t_fails(text, text, text), public.t_item(int, text, text, text, jsonb);
\echo 'TODOS OS TESTES DO BANCO PASSARAM'
