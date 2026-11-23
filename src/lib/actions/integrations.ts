"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "../auth";
import { deleteIntegration } from "../integrations";
import { revokeGoogle, revokeMeta } from "../oauth";
import { clearDiscoveryCache, googleAdsAccounts, metaAdAccounts } from "../platforms/discovery";
import { query, queryOne } from "../db";
import { clearGoogleTokenCache } from "../platforms/google-oauth";

/** Desconecta: apaga o token do banco e revoga o acesso na própria plataforma. */
export async function disconnectAction(form: FormData): Promise<void> {
  await requireAdmin();
  const provider = String(form.get("provider"));
  if (provider !== "meta" && provider !== "google") return;

  const token = await deleteIntegration(provider);
  if (token) {
    if (provider === "meta") await revokeMeta(token);
    else await revokeGoogle(token);
  }
  clearDiscoveryCache();
  clearGoogleTokenCache();
  revalidatePath("/settings/integrations");
}

/** Recarrega a lista de contas disponíveis (ignora o cache de 10 min). */
export async function refreshAccountsAction(form?: FormData): Promise<void> {
  await requireAdmin();
  clearDiscoveryCache();
  revalidatePath("/settings/integrations");
  revalidatePath("/settings/google-ads");
  revalidatePath(META_PAGE);
  const to = form?.get("back");
  if (to === "/settings/google-ads" || to === META_PAGE) redirect(to);
}

/* ---------- Vincular contas do MCC (Google Ads) aos clientes ---------- */

const PAGE = "/settings/google-ads";

function back(kind: "msg" | "error", text: string): never {
  redirect(`${PAGE}?${kind}=${encodeURIComponent(text)}`);
}

/** Só aceita contas que a conexão realmente enxerga no MCC (evita IDs digitados/forjados). */
async function mccAccount(customerId: string) {
  const list = await googleAdsAccounts();
  if (!list.ok) back("error", list.error);
  return list.items.find((a) => a.id === customerId);
}

/** Vincula uma conta do MCC a um cliente existente ou cria um cliente novo com o nome da conta. */
export async function linkGoogleAdsAction(form: FormData): Promise<void> {
  await requireAdmin();
  const customerId = String(form.get("customer_id") ?? "").replace(/-/g, "");
  const target = String(form.get("client") ?? "");
  if (!/^\d{10}$/.test(customerId)) back("error", "Conta Google Ads inválida.");
  const account = await mccAccount(customerId);
  if (!account) back("error", "Esta conta não aparece no MCC conectado. Recarregue a lista.");

  let clientName: string;
  if (target === "new") {
    // Uma conta pertence a um cliente só: remove de quem tiver antes de criar.
    await query("UPDATE clients SET google_ads_customer_id = NULL, updated_at = now() WHERE google_ads_customer_id = $1", [customerId]);
    const row = await queryOne<{ name: string }>(
      "INSERT INTO clients (name, google_ads_customer_id) VALUES ($1, $2) RETURNING name",
      [account.name.slice(0, 120), customerId],
    );
    clientName = row!.name;
  } else if (/^\d+$/.test(target)) {
    const row = await queryOne<{ name: string }>(
      "SELECT name FROM clients WHERE id = $1",
      [Number(target)],
    );
    if (!row) back("error", "Cliente não encontrado.");
    await query(
      "UPDATE clients SET google_ads_customer_id = NULL, updated_at = now() WHERE google_ads_customer_id = $1 AND id <> $2",
      [customerId, Number(target)],
    );
    await query("UPDATE clients SET google_ads_customer_id = $1, updated_at = now() WHERE id = $2", [customerId, Number(target)]);
    clientName = row.name;
  } else {
    back("error", "Escolha um cliente.");
  }

  revalidatePath("/");
  revalidatePath(PAGE);
  back("msg", `Conta “${account.name}” vinculada a ${clientName}.`);
}

/** Remove o vínculo da conta (o cliente continua cadastrado). */
export async function unlinkGoogleAdsAction(form: FormData): Promise<void> {
  await requireAdmin();
  const customerId = String(form.get("customer_id") ?? "");
  if (!/^\d{10}$/.test(customerId)) back("error", "Conta Google Ads inválida.");
  await query("UPDATE clients SET google_ads_customer_id = NULL, updated_at = now() WHERE google_ads_customer_id = $1", [customerId]);
  revalidatePath("/");
  revalidatePath(PAGE);
  back("msg", "Vínculo removido. O cliente continua cadastrado.");
}

/** Cria um cliente para cada conta do MCC que ainda não tem vínculo. */
export async function importGoogleAdsAction(): Promise<void> {
  await requireAdmin();
  const list = await googleAdsAccounts();
  if (!list.ok) back("error", list.error);
  const linked = new Set(
    (await query<{ google_ads_customer_id: string }>(
      "SELECT google_ads_customer_id FROM clients WHERE google_ads_customer_id IS NOT NULL",
    )).map((r) => r.google_ads_customer_id),
  );
  const missing = list.items.filter((a) => !linked.has(a.id));
  for (const a of missing) {
    await query("INSERT INTO clients (name, google_ads_customer_id) VALUES ($1, $2)", [a.name.slice(0, 120), a.id]);
  }
  revalidatePath("/");
  revalidatePath(PAGE);
  back("msg", missing.length ? `${missing.length} cliente(s) criado(s) a partir do MCC.` : "Todas as contas já estão vinculadas.");
}

/* ---------- Vincular contas de anúncio da Meta (portfólios) aos clientes ---------- */

const META_PAGE = "/settings/meta-ads";

function metaBack(kind: "msg" | "error", text: string): never {
  redirect(`${META_PAGE}?${kind}=${encodeURIComponent(text)}`);
}

/** Só aceita contas que a conexão da Meta realmente enxerga (evita IDs digitados/forjados). */
async function metaAccount(accountId: string) {
  const list = await metaAdAccounts();
  if (!list.ok) metaBack("error", list.error);
  return list.items.find((a) => a.id === accountId);
}

const metaId = (form: FormData) => String(form.get("account_id") ?? "").replace(/^act_/, "");

/** Vincula uma conta de anúncio da Meta a um cliente existente ou cria um cliente novo com o nome da conta. */
export async function linkMetaAction(form: FormData): Promise<void> {
  await requireAdmin();
  const accountId = metaId(form);
  const target = String(form.get("client") ?? "");
  if (!/^\d+$/.test(accountId)) metaBack("error", "Conta de anúncio Meta inválida.");
  const account = await metaAccount(accountId);
  if (!account) metaBack("error", "Esta conta não aparece na conexão da Meta. Recarregue a lista.");

  let clientName: string;
  if (target === "new") {
    // Uma conta pertence a um cliente só: remove de quem tiver antes de criar.
    await query("UPDATE clients SET meta_ad_account_id = NULL, updated_at = now() WHERE meta_ad_account_id = $1", [accountId]);
    const row = await queryOne<{ name: string }>(
      "INSERT INTO clients (name, meta_ad_account_id) VALUES ($1, $2) RETURNING name",
      [account.name.slice(0, 120), accountId],
    );
    clientName = row!.name;
  } else if (/^\d+$/.test(target)) {
    const row = await queryOne<{ name: string }>("SELECT name FROM clients WHERE id = $1", [Number(target)]);
    if (!row) metaBack("error", "Cliente não encontrado.");
    await query(
      "UPDATE clients SET meta_ad_account_id = NULL, updated_at = now() WHERE meta_ad_account_id = $1 AND id <> $2",
      [accountId, Number(target)],
    );
    await query("UPDATE clients SET meta_ad_account_id = $1, updated_at = now() WHERE id = $2", [accountId, Number(target)]);
    clientName = row.name;
  } else {
    metaBack("error", "Escolha um cliente.");
  }

  revalidatePath("/");
  revalidatePath(META_PAGE);
  metaBack("msg", `Conta “${account.name}” vinculada a ${clientName}.`);
}

/** Remove o vínculo da conta Meta (o cliente continua cadastrado). */
export async function unlinkMetaAction(form: FormData): Promise<void> {
  await requireAdmin();
  const accountId = metaId(form);
  if (!/^\d+$/.test(accountId)) metaBack("error", "Conta de anúncio Meta inválida.");
  await query("UPDATE clients SET meta_ad_account_id = NULL, updated_at = now() WHERE meta_ad_account_id = $1", [accountId]);
  revalidatePath("/");
  revalidatePath(META_PAGE);
  metaBack("msg", "Vínculo removido. O cliente continua cadastrado.");
}

/** Cria um cliente para cada conta Meta sem vínculo (de um portfólio, se informado, ou de todos). */
export async function importMetaAction(form: FormData): Promise<void> {
  await requireAdmin();
  const group = String(form.get("group") ?? "");
  const list = await metaAdAccounts();
  if (!list.ok) metaBack("error", list.error);
  const linked = new Set(
    (await query<{ meta_ad_account_id: string }>(
      "SELECT meta_ad_account_id FROM clients WHERE meta_ad_account_id IS NOT NULL",
    )).map((r) => r.meta_ad_account_id),
  );
  const missing = list.items.filter((a) => !linked.has(a.id) && (!group || (a.groupId ?? "none") === group));
  for (const a of missing) {
    await query("INSERT INTO clients (name, meta_ad_account_id) VALUES ($1, $2)", [a.name.slice(0, 120), a.id]);
  }
  revalidatePath("/");
  revalidatePath(META_PAGE);
  metaBack("msg", missing.length ? `${missing.length} cliente(s) criado(s) a partir das contas da Meta.` : "Todas as contas já estão vinculadas.");
}
