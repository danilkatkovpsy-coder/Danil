import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://danilkatkovpsy-coder.github.io",
  "http://127.0.0.1:8000"
]);

function jsonResponse(status: number, body: Record<string, unknown>, headers: Headers) {
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
}

function escapeHtml(value: unknown) {
  const replacements: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  };
  return String(value ?? "").replace(/[&<>"']/g, (character) => replacements[character]);
}

function safeFilePart(value: string) {
  return value.replace(/[^a-z0-9_-]/gi, "-").slice(0, 80) || "invoice";
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin") || "";
  const headers = new Headers({
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  });

  if (allowedOrigins.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (!allowedOrigins.has(origin)) return jsonResponse(403, { error: "Origin is not allowed." }, headers);
  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed." }, headers);

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return jsonResponse(401, { error: "Sign in before sending an invoice." }, headers);
  }

  let body: { invoice_id?: string; pdf_base64?: string; locale?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "Invalid request body." }, headers);
  }

  if (!body.invoice_id || !body.pdf_base64 || body.pdf_base64.length > 6_000_000) {
    return jsonResponse(400, { error: "Invoice or PDF is missing or too large." }, headers);
  }

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = Uint8Array.from(atob(body.pdf_base64), (character) => character.charCodeAt(0));
  } catch {
    return jsonResponse(400, { error: "The invoice attachment is not valid base64." }, headers);
  }
  if (pdfBytes.byteLength > 4 * 1024 * 1024 || new TextDecoder().decode(pdfBytes.slice(0, 5)) !== "%PDF-") {
    return jsonResponse(400, { error: "The invoice attachment must be a PDF under 4 MB." }, headers);
  }

  const projectUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const emailFrom = Deno.env.get("EMAIL_FROM");
  if (!projectUrl || !anonKey || !serviceRoleKey || !resendApiKey || !emailFrom) {
    return jsonResponse(503, { error: "Email delivery is not configured on the server yet." }, headers);
  }

  const userClient = createClient(projectUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authorization } }
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return jsonResponse(401, { error: "Your session has expired. Sign in again." }, headers);

  const { data: invoice, error: invoiceError } = await userClient
    .from("invoices")
    .select("id, organization_id, number, issue_date, due_date, reference_number, note, client_name, client_email, currency, subtotal, tax_total, total")
    .eq("id", body.invoice_id)
    .single();
  if (invoiceError || !invoice) return jsonResponse(404, { error: "Invoice not found or access denied." }, headers);
  if (!invoice.client_email) return jsonResponse(400, { error: "The invoice has no recipient email address." }, headers);

  const { data: canSend, error: roleError } = await userClient.rpc("has_organization_role", {
    target_organization_id: invoice.organization_id,
    allowed_roles: ["owner", "accountant", "administrator"]
  });
  if (roleError || !canSend) return jsonResponse(403, { error: "You do not have permission to send invoices." }, headers);

  const [{ data: items, error: itemsError }, { data: organization, error: organizationError }] = await Promise.all([
    userClient
      .from("invoice_items")
      .select("position, article_number, description, quantity, unit_price, tax_rate")
      .eq("invoice_id", invoice.id)
      .eq("organization_id", invoice.organization_id)
      .order("position"),
    userClient
      .from("organizations")
      .select("name")
      .eq("id", invoice.organization_id)
      .single()
  ]);
  if (itemsError || organizationError || !items?.length || !organization) {
    return jsonResponse(500, { error: "Could not load the invoice details." }, headers);
  }

  const adminClient = createClient(projectUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: ownerMembership, error: ownerMembershipError } = await adminClient
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", invoice.organization_id)
    .eq("role", "owner")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (ownerMembershipError || !ownerMembership) {
    return jsonResponse(500, { error: "Could not find the organization owner for replies." }, headers);
  }
  const { data: ownerResult, error: ownerError } = await adminClient.auth.admin.getUserById(ownerMembership.user_id);
  const replyTo = ownerResult.user?.email;
  if (ownerError || !replyTo) return jsonResponse(500, { error: "The organization owner has no verified reply address." }, headers);

  const { data: delivery, error: deliveryError } = await adminClient
    .from("invoice_email_deliveries")
    .insert({
      organization_id: invoice.organization_id,
      invoice_id: invoice.id,
      recipient_email: invoice.client_email,
      status: "pending"
    })
    .select("id")
    .single();
  if (deliveryError || !delivery) return jsonResponse(500, { error: "Could not record the email delivery." }, headers);

  const locale = body.locale === "et" ? "et" : "ru";
  const numberFormat = new Intl.NumberFormat(locale === "et" ? "et-EE" : "ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const lineRows = items.map((item) => {
    const lineTotal = Number(item.quantity) * Number(item.unit_price);
    return `<tr><td>${escapeHtml(item.description)}</td><td>${numberFormat.format(Number(item.quantity))}</td><td>${numberFormat.format(Number(item.unit_price))} EUR</td><td>${numberFormat.format(lineTotal)} EUR</td></tr>`;
  }).join("");
  const subject = locale === "et"
    ? `Arve ${invoice.number} ettevõttelt ${organization.name}`
    : `Счет ${invoice.number} от ${organization.name}`;
  const greeting = locale === "et" ? "Tere!" : "Здравствуйте!";
  const intro = locale === "et" ? "Saadame teile arve:" : "Направляем вам счет:";
  const totalLabel = locale === "et" ? "Kokku" : "Итого";
  const dueLabel = locale === "et" ? "Maksetähtaeg" : "Срок оплаты";
  const attachmentName = `Invoice-${safeFilePart(invoice.number)}.pdf`;
  const html = `<!doctype html><html lang="${locale}"><body style="margin:0;padding:24px;background:#f4f6f3;font-family:Arial,sans-serif;color:#28352c"><main style="max-width:680px;margin:auto;padding:28px;background:#fff;border:1px solid #dce4dc;border-radius:8px"><h1 style="font-size:20px">${greeting}</h1><p>${intro} <strong>${escapeHtml(invoice.number)}</strong> · ${escapeHtml(organization.name)}</p><table style="width:100%;border-collapse:collapse"><thead><tr><th align="left">${locale === "et" ? "Kirjeldus" : "Описание"}</th><th align="right">${locale === "et" ? "Kogus" : "Кол-во"}</th><th align="right">${locale === "et" ? "Hind" : "Цена"}</th><th align="right">${locale === "et" ? "Summa" : "Сумма"}</th></tr></thead><tbody>${lineRows}</tbody><tfoot><tr><td colspan="3" align="right"><strong>${totalLabel}</strong></td><td align="right"><strong>${numberFormat.format(Number(invoice.total))} EUR</strong></td></tr></tfoot></table>${invoice.due_date ? `<p>${dueLabel}: ${escapeHtml(invoice.due_date)}</p>` : ""}${invoice.note ? `<p>${escapeHtml(invoice.note)}</p>` : ""}<p>${escapeHtml(organization.name)}</p></main></body></html>`;

  let resendResponse: Response;
  let resendResult: Record<string, unknown>;
  try {
    resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: emailFrom,
        to: [invoice.client_email],
        reply_to: replyTo,
        subject,
        html,
        attachments: [{ filename: attachmentName, content: body.pdf_base64 }]
      })
    });
    resendResult = await resendResponse.json().catch(() => ({}));
  } catch (error) {
    const errorMessage = String(error instanceof Error ? error.message : "Email provider request failed.").slice(0, 500);
    await adminClient.from("invoice_email_deliveries").update({ status: "failed", error_message: errorMessage }).eq("id", delivery.id);
    return jsonResponse(502, { error: errorMessage }, headers);
  }

  if (!resendResponse.ok) {
    const errorMessage = String(resendResult.message || resendResult.error || "Email provider rejected the request.").slice(0, 500);
    await adminClient.from("invoice_email_deliveries").update({ status: "failed", error_message: errorMessage }).eq("id", delivery.id);
    return jsonResponse(502, { error: errorMessage }, headers);
  }

  const sentAt = new Date().toISOString();
  const { error: deliveryUpdateError } = await adminClient
    .from("invoice_email_deliveries")
    .update({ status: "sent", provider_message_id: resendResult.id || null, sent_at: sentAt })
    .eq("id", delivery.id);
  if (deliveryUpdateError) console.error("Email sent, but delivery status could not be updated:", deliveryUpdateError.message);
  await adminClient.from("invoices").update({ status: "sent", updated_at: sentAt }).eq("id", invoice.id);

  return jsonResponse(200, { status: "sent", delivery_id: delivery.id }, headers);
});