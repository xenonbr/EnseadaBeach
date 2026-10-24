# Arquitetura, Segurança, Setup e Implantação — Cabana Enseada Beach Trancoso

## 1. Visão Geral da Arquitetura
- **Frontend / Backend Web:** Next.js 16.4.3 (App Router, React 19, TypeScript, Tailwind CSS v4), com Server Components, Server Actions e Route Handlers.
- **Banco de Dados, Autenticação, Storage e Tempo Real:** Supabase (PostgreSQL com Row Level Security em 100% das tabelas públicas, Supabase Auth, Supabase Storage bucket `menu-images` e Supabase Realtime).
- **Princípios de Integridade:**
  1. **Banco de dados como única fonte da verdade:** Realtime (`src/components/RealtimeRefresh.tsx`) atua apenas como gatilho de atualização (`router.refresh()`); na reconexão (`online` / `visibilitychange`), o cliente reconsulta o banco.
  2. **Precisão monetária em centavos inteiros (`integer`):** Nenhum valor financeiro usa ponto flutuante. Todos os preços, subtotais, descontos e pagamentos são armazenados em centavos (`price_cents`, `total_cents`, `amount_cents`).
  3. **Snapshots históricos imutáveis:** No momento da criação do pedido (`place_order`), o servidor recalcula os preços diretamente das tabelas `products` e `options` e grava snapshots (`product_name_snapshot`, `unit_price_cents_snapshot`, `options_price_cents_snapshot`, `sector_snapshot`, `group_name_snapshot`, `option_name_snapshot`, `price_cents_snapshot`). Edições posteriores no cardápio não alteram pedidos passados.
  4. **Confirmação presencial obrigatória server-side:** Todo pedido nasce em `AGUARDANDO_CONFIRMACAO` sem gerar tarefas de produção. Um trigger (`guard_production_task_confirmed`) bloqueia inserção em `production_tasks` para pedidos não confirmados. Somente funcionários com papel `admin`, `manager` ou `attendant` podem assumir (`claim_order_verification`) e confirmar (`confirm_order_presencial`), momento em que as tarefas de `kitchen` e/ou `bar` são geradas transacionalmente.

---

## 2. Estrutura de Migrations e Reversão (Rollback)
Todas as migrations estão versionadas em `supabase/migrations/` com seus respectivos scripts de reversão em `supabase/rollback/`:
1. `20261024000001_foundation.sql` (`0001_down.sql`): Papéis (`app_role`), `profiles`, `audit_log`, proteção do último administrador (`guard_last_admin`) e funções de verificação de permissão.
2. `20261024000002_tables_sessions.sql` (`0002_down.sql`): `sectors`, `dining_tables` (carga inicial idempotente de `Mesa 01` a `Mesa 40` desativadas e tokens públicos não sequenciais), `table_sessions` (índice único parcial garantindo no máximo 1 sessão aberta por mesa).
3. `20261024000003_menu.sql` (`0003_down.sql`): `menu_categories`, `products`, `option_groups`, `options`, políticas RLS de publicação e auditoria de preços.
4. `20261024000004_menu_storage.sql`: Bucket público `menu-images` com limite server-side de 5 MB e MIME types restritos a `image/jpeg`, `image/png` e `image/webp`.
5. `20261024000005_orders_and_confirmation.sql` (`0005_down.sql`): `orders`, `order_items`, `order_item_options`, `production_tasks`, `order_events`, RPCs `place_order`, `get_my_orders`, `claim_order_verification`, `confirm_order_presencial`, `cancel_order`.
6. `20261024000006_kitchen_bar_and_calls.sql` (`0006_down.sql`): `service_calls`, RPCs `start_production_task`, `complete_production_task`, `set_product_availability_sector`, `mark_order_delivered`, `create_service_call`, `update_service_call_status`.
7. `20261024000007_billing_and_payments.sql` (`0007_down.sql`): `session_payments`, `session_adjustments`, RPCs `get_session_account_summary`, `record_session_payment`, `reverse_session_payment`, `record_session_adjustment` e trava financeira em `session_has_pending`.
8. `20261024000008_site_settings_and_staff.sql` (`0008_down.sql`): `site_settings` e RPC `upsert_staff_by_email`.

---

## 3. Setup Local
1. Copie `.env.example` para `.env.local` e preencha:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://nymwfmjmwkhpmljrdatn.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   ```
   > **Segurança:** Nunca exponha `service_role` ou secret keys no navegador, em variáveis `NEXT_PUBLIC_` ou no Git.
2. Instale dependências e execute os testes automatizados (rodam em banco PostgreSQL isolado em memória via PGlite, sem tocar no banco real):
   ```powershell
   npm install
   npm test
   ```
3. Inicie o servidor de desenvolvimento:
   ```powershell
   npm run dev
   ```

---

## 4. Provisionamento Seguro do Administrador
1. No painel do Supabase, acesse **Authentication > Users > Add user** e crie o usuário do proprietário com senha forte definida exclusivamente por ele.
2. Em **Authentication > Providers > Email**, recomenda-se desativar **"Enable Sign Ups"** (cadastro público) para que apenas usuários criados pelo administrador existam em `auth.users`.
3. Execute o script `supabase/provisioning/first_admin.sql` no SQL Editor (funciona apenas se ainda não existir nenhum administrador).
4. Para adicionar novos funcionários posteriormente, crie o login em **Authentication > Users** e vincule o e-mail na tela `/admin/equipe`.

---

## 5. Implantação na Vercel
1. Conecte o repositório Git ao projeto na Vercel (Framework Preset: **Next.js**).
2. Configure as variáveis de ambiente na Vercel (Production / Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `NEXT_PUBLIC_SITE_URL` (domínio final de produção, ex.: `https://cabanaenseadabeach.com.br`, utilizado na geração dos links dos QR Codes).
3. Após o deploy, gere/imprima os QR Codes definitivos em `/admin/mesas` para que apontem para o domínio oficial.

---

## 6. Backup e Recuperação
- **Backups Automáticos (Supabase):** Ative e acompanhe os backups diários na aba **Database > Backups** do painel Supabase.
- **Exportação Manual de Segurança (pg_dump):**
  ```powershell
  npx supabase db dump --linked -f backup_schema.sql
  npx supabase db dump --linked --data-only -f backup_dados.sql
  ```
- **Recuperação de Emergência:** Em caso de necessidade de restauração, utilize o Point-in-Time Recovery / Restore no painel do Supabase ou aplique `backup_schema.sql` seguido de `backup_dados.sql` em instância limpa.
