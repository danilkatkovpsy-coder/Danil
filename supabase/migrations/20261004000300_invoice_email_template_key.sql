alter table public.organization_accounting_data
  drop constraint if exists organization_accounting_data_data_key_check;

alter table public.organization_accounting_data
  add constraint organization_accounting_data_data_key_check
  check (data_key in (
    'purchases', 'expenses', 'suppliers', 'supplierInvoices', 'articles',
    'background', 'logo', 'color', 'theme', 'designTokens',
    'invoiceNumberStart', 'paymentTermsDays', 'permissions', 'emailTemplate'
  ));
