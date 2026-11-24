import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { deleteClientAction } from "@/lib/actions/clients";
import ClientForm from "@/components/ClientForm";
import { accountSuggestions } from "@/lib/suggestions";
import type { ClientRow } from "@/lib/types";

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("manage_clients");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const client = await queryOne<ClientRow>(
    `SELECT id, name, meta_ad_account_id, meta_conversion_action, google_ads_customer_id, ga4_property_id, active
     FROM clients WHERE id = $1`,
    [id],
  );
  if (!client) notFound();

  return (
    <div className="stack">
      <h1>Editar {client.name}</h1>
      <ClientForm client={client} suggestions={await accountSuggestions()} />
      <form action={deleteClientAction} className="card row between">
        <span className="ink-2">Excluir o cliente apaga também todos os relatórios e links dele.</span>
        <input type="hidden" name="id" value={client.id} />
        <label className="checkbox">
          <input type="checkbox" name="confirm" required /> Confirmo a exclusão
        </label>
        <button className="btn danger" type="submit">Excluir cliente</button>
      </form>
    </div>
  );
}
