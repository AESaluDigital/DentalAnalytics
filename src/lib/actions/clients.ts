"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "../auth";
import { query, queryOne } from "../db";

export interface ClientFormState {
  error?: string;
}

const blankToNull = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};

const ClientInput = z.object({
  name: z.string().trim().min(2, "Nome muito curto").max(120),
  meta_ad_account_id: z.preprocess(
    (v) => blankToNull(v)?.replace(/^act_/i, "") ?? null,
    z.string().regex(/^\d+$/, "ID da conta Meta deve ser numérico (sem act_)").nullable(),
  ),
  meta_conversion_action: z.preprocess(
    (v) => blankToNull(v) ?? "lead",
    z.string().regex(/^[a-z0-9_.]+$/i, "action_type inválido").max(120),
  ),
  google_ads_customer_id: z.preprocess(
    (v) => blankToNull(v)?.replace(/-/g, "") ?? null,
    z.string().regex(/^\d{10}$/, "Customer ID do Google Ads deve ter 10 dígitos").nullable(),
  ),
  ga4_property_id: z.preprocess(
    (v) => blankToNull(v)?.replace(/^properties\//, "") ?? null,
    z.string().regex(/^\d+$/, "ID da propriedade GA4 deve ser numérico").nullable(),
  ),
  active: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
});

function parse(form: FormData) {
  return ClientInput.safeParse({
    name: form.get("name"),
    meta_ad_account_id: form.get("meta_ad_account_id"),
    meta_conversion_action: form.get("meta_conversion_action"),
    google_ads_customer_id: form.get("google_ads_customer_id"),
    ga4_property_id: form.get("ga4_property_id"),
    active: form.get("active"),
  });
}

export async function saveClientAction(_prev: ClientFormState, form: FormData): Promise<ClientFormState> {
  await requirePermission("manage_clients");
  const parsed = parse(form);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const c = parsed.data;

  const idRaw = form.get("id");
  const id = idRaw ? Number(idRaw) : null;
  let savedId: number;

  if (id) {
    const row = await queryOne<{ id: number }>(
      `UPDATE clients SET name=$1, meta_ad_account_id=$2, meta_conversion_action=$3,
         google_ads_customer_id=$4, ga4_property_id=$5, active=$6, updated_at=now()
       WHERE id=$7 RETURNING id`,
      [c.name, c.meta_ad_account_id, c.meta_conversion_action, c.google_ads_customer_id, c.ga4_property_id, c.active, id],
    );
    if (!row) return { error: "Cliente não encontrado." };
    savedId = row.id;
  } else {
    const row = await queryOne<{ id: number }>(
      `INSERT INTO clients (name, meta_ad_account_id, meta_conversion_action, google_ads_customer_id, ga4_property_id, active)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [c.name, c.meta_ad_account_id, c.meta_conversion_action, c.google_ads_customer_id, c.ga4_property_id, c.active],
    );
    savedId = row!.id;
  }

  revalidatePath("/");
  redirect(`/clients/${savedId}`);
}

export async function deleteClientAction(form: FormData): Promise<void> {
  await requirePermission("manage_clients");
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return;
  await query("DELETE FROM clients WHERE id = $1", [id]);
  revalidatePath("/");
  redirect("/");
}
