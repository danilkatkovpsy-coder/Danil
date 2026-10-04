alter table public.organizations
  add column if not exists kmkr_number text,
  add column if not exists vat_registered boolean not null default false;

alter table public.organizations
  drop constraint if exists organizations_kmkr_required_for_vat;

alter table public.organizations
  add constraint organizations_kmkr_required_for_vat
  check (not vat_registered or coalesce(kmkr_number, '') ~ '^EE[0-9]{9}$');

alter table public.invoices
  add column if not exists tax_rate numeric(5, 2) not null default 0
    check (tax_rate between 0 and 100),
  add column if not exists seller_kmkr_number text;

drop function if exists public.save_invoice(uuid, text, text, date, date, text, text, text, text, text, text, text, jsonb);

create function public.save_invoice(
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
  item_tax_rate numeric;
  invoice_tax_rate numeric := null;
  calculated_subtotal numeric := 0;
  calculated_tax numeric := 0;
  expected_tax_rate numeric;
  organization_vat_registered boolean;
  organization_kmkr_number text;
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
    item_tax_rate := coalesce(nullif(item ->> 'taxRate', '')::numeric, 0);

    if item_description = '' or item_quantity is null or item_quantity <= 0
      or item_price is null or item_price < 0
      or item_tax_rate not in (0, 24) then
      raise exception 'Invoice item is invalid' using errcode = '22023';
    end if;

    if invoice_tax_rate is null then
      invoice_tax_rate := item_tax_rate;
    elsif invoice_tax_rate <> item_tax_rate then
      raise exception 'Invoice items must use one tax rate' using errcode = '22023';
    end if;

    calculated_subtotal := calculated_subtotal + item_quantity * item_price;
    calculated_tax := calculated_tax + round(item_quantity * item_price * item_tax_rate / 100, 2);
  end loop;

  select vat_registered, kmkr_number
    into organization_vat_registered, organization_kmkr_number
    from public.organizations
    where id = p_organization_id;

  if not found then
    raise exception 'Organization not found' using errcode = '22023';
  end if;

  expected_tax_rate := case when organization_vat_registered then 24 else 0 end;
  if invoice_tax_rate is distinct from expected_tax_rate then
    raise exception 'Invoice tax rate does not match organization settings' using errcode = '22023';
  end if;

  if organization_vat_registered
    and coalesce(organization_kmkr_number, '') !~ '^EE[0-9]{9}$' then
    raise exception 'A valid Estonian KMKR number is required' using errcode = '22023';
  end if;

  insert into public.invoices (
    organization_id, number, status, issue_date, due_date, currency,
    reference_number, note, client_name, client_email, client_address,
    client_type, client_registration_code, client_phone,
    subtotal, tax_total, total, tax_rate, seller_kmkr_number
  ) values (
    p_organization_id, trim(p_number), 'draft', p_issue_date, p_due_date, 'EUR',
    nullif(trim(coalesce(p_reference_number, '')), ''), p_note, trim(p_client_name),
    nullif(trim(coalesce(p_client_email, '')), ''), nullif(trim(coalesce(p_client_address, '')), ''),
    p_client_type, nullif(trim(coalesce(p_client_registration_code, '')), ''),
    nullif(trim(coalesce(p_client_phone, '')), ''),
    round(calculated_subtotal, 2), round(calculated_tax, 2),
    round(calculated_subtotal, 2) + round(calculated_tax, 2), invoice_tax_rate,
    case when organization_vat_registered then organization_kmkr_number else null end
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
    tax_rate = excluded.tax_rate,
    seller_kmkr_number = excluded.seller_kmkr_number,
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
    coalesce(nullif(item_row.item ->> 'taxRate', '')::numeric, 0)
  from jsonb_array_elements(p_items) with ordinality as item_row(item, position);

  return saved_invoice_id;
end;
$$;

revoke all on function public.save_invoice(uuid, text, text, date, date, text, text, text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.save_invoice(uuid, text, text, date, date, text, text, text, text, text, text, text, jsonb) to authenticated;
