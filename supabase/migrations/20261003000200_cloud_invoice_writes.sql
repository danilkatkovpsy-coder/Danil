alter table public.clients
  add column if not exists reference_number text;

alter table public.invoices
  add column if not exists client_type text not null default 'person'
    check (client_type in ('company', 'person')),
  add column if not exists client_registration_code text,
  add column if not exists client_phone text;

drop policy if exists "Members can manage invoices" on public.invoices;
drop policy if exists "Members can manage invoice items" on public.invoice_items;
drop policy if exists "Organization members can read invoices" on public.invoices;
drop policy if exists "Authorized roles can create invoices" on public.invoices;
drop policy if exists "Authorized roles can update invoices" on public.invoices;
drop policy if exists "Owners and administrators can delete invoices" on public.invoices;
drop policy if exists "Organization members can read invoice items" on public.invoice_items;
drop policy if exists "Authorized roles can create invoice items" on public.invoice_items;
drop policy if exists "Authorized roles can update invoice items" on public.invoice_items;
drop policy if exists "Owners and administrators can delete invoice items" on public.invoice_items;

create policy "Organization members can read invoices"
  on public.invoices for select to authenticated
  using ((select public.is_organization_member(organization_id)));

create policy "Authorized roles can create invoices"
  on public.invoices for insert to authenticated
  with check ((select public.has_organization_role(organization_id, array['owner', 'accountant', 'administrator'])));

create policy "Authorized roles can update invoices"
  on public.invoices for update to authenticated
  using ((select public.has_organization_role(organization_id, array['owner', 'accountant', 'administrator'])))
  with check ((select public.has_organization_role(organization_id, array['owner', 'accountant', 'administrator'])));

create policy "Owners and administrators can delete invoices"
  on public.invoices for delete to authenticated
  using ((select public.has_organization_role(organization_id, array['owner', 'administrator'])));

create policy "Organization members can read invoice items"
  on public.invoice_items for select to authenticated
  using ((select public.is_organization_member(organization_id)));

create policy "Authorized roles can create invoice items"
  on public.invoice_items for insert to authenticated
  with check ((select public.has_organization_role(organization_id, array['owner', 'accountant', 'administrator'])));

create policy "Authorized roles can update invoice items"
  on public.invoice_items for update to authenticated
  using ((select public.has_organization_role(organization_id, array['owner', 'accountant', 'administrator'])))
  with check ((select public.has_organization_role(organization_id, array['owner', 'accountant', 'administrator'])));

create policy "Owners and administrators can delete invoice items"
  on public.invoice_items for delete to authenticated
  using ((select public.has_organization_role(organization_id, array['owner', 'administrator'])));

create or replace function public.save_invoice(
  p_organization_id uuid,
  p_number text,
  p_reference_number text,
  p_issue_date date,
  p_due_date date,
  p_note text,
  p_client_name text,
  p_client_email text,
  p_client_address text,
  p_client_type text,
  p_client_registration_code text,
  p_client_phone text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_invoice_id uuid;
  item jsonb;
  item_description text;
  item_quantity numeric;
  item_price numeric;
  calculated_subtotal numeric := 0;
begin
  if (select auth.uid()) is null
    or not public.has_organization_role(p_organization_id, array['owner', 'accountant', 'administrator']) then
    raise exception 'Organization access denied' using errcode = '42501';
  end if;

  if p_number is null or length(trim(p_number)) = 0
    or p_issue_date is null
    or p_client_name is null or length(trim(p_client_name)) = 0
    or p_client_type not in ('company', 'person') then
    raise exception 'Invoice details are invalid' using errcode = '22023';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Invoice must contain at least one item' using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 500 then
    raise exception 'Invoice item count is invalid' using errcode = '22023';
  end if;

  for item in select element from jsonb_array_elements(p_items) as item_rows(element)
  loop
    item_description := trim(coalesce(item ->> 'description', ''));
    item_quantity := nullif(item ->> 'quantity', '')::numeric;
    item_price := nullif(item ->> 'price', '')::numeric;

    if item_description = '' or item_quantity is null or item_quantity <= 0
      or item_price is null or item_price < 0 then
      raise exception 'Invoice item is invalid' using errcode = '22023';
    end if;

    calculated_subtotal := calculated_subtotal + item_quantity * item_price;
  end loop;

  insert into public.invoices (
    organization_id, number, status, issue_date, due_date, currency,
    reference_number, note, client_name, client_email, client_address,
    client_type, client_registration_code, client_phone,
    subtotal, tax_total, total
  ) values (
    p_organization_id, trim(p_number), 'draft', p_issue_date, p_due_date, 'EUR',
    nullif(trim(coalesce(p_reference_number, '')), ''), p_note, trim(p_client_name),
    nullif(trim(coalesce(p_client_email, '')), ''), nullif(trim(coalesce(p_client_address, '')), ''),
    p_client_type, nullif(trim(coalesce(p_client_registration_code, '')), ''),
    nullif(trim(coalesce(p_client_phone, '')), ''),
    round(calculated_subtotal, 2), 0, round(calculated_subtotal, 2)
  )
  on conflict (organization_id, number) do update set
    issue_date = excluded.issue_date,
    due_date = excluded.due_date,
    reference_number = excluded.reference_number,
    note = excluded.note,
    client_name = excluded.client_name,
    client_email = excluded.client_email,
    client_address = excluded.client_address,
    client_type = excluded.client_type,
    client_registration_code = excluded.client_registration_code,
    client_phone = excluded.client_phone,
    subtotal = excluded.subtotal,
    tax_total = excluded.tax_total,
    total = excluded.total,
    updated_at = now()
  returning id into saved_invoice_id;

  delete from public.invoice_items
  where invoice_id = saved_invoice_id
    and organization_id = p_organization_id;

  insert into public.invoice_items (
    organization_id, invoice_id, position, article_number,
    description, quantity, unit_price, tax_rate
  )
  select
    p_organization_id,
    saved_invoice_id,
    item_row.position::integer,
    nullif(trim(coalesce(item_row.item ->> 'articleNumber', '')), ''),
    trim(item_row.item ->> 'description'),
    (item_row.item ->> 'quantity')::numeric,
    (item_row.item ->> 'price')::numeric,
    0
  from jsonb_array_elements(p_items) with ordinality as item_row(item, position);

  return saved_invoice_id;
end;
$$;

revoke all on function public.save_invoice(uuid, text, text, date, date, text, text, text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.save_invoice(uuid, text, text, date, date, text, text, text, text, text, text, text, jsonb) to authenticated;