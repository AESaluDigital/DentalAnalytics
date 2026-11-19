"use client";

import { useActionState } from "react";
import { saveClientAction, type ClientFormState } from "@/lib/actions/clients";
import type { ClientRow } from "@/lib/types";

export default function ClientForm({ client }: { client?: ClientRow }) {
  const [state, action, pending] = useActionState<ClientFormState, FormData>(saveClientAction, {});

  return (
    <form action={action} className="card stack">
      {client && <input type="hidden" name="id" value={client.id} />}
      <label>
        Nome do cliente
        <input type="text" name="name" required maxLength={120} defaultValue={client?.name} />
      </label>

      <div className="grid-form">
        <label>
          Meta — ID da conta de anúncios
          <input type="text" name="meta_ad_account_id" inputMode="numeric" defaultValue={client?.meta_ad_account_id ?? ""} />
          <span className="hint">Somente números (o prefixo act_ é removido).</span>
        </label>
        <label>
          Meta — evento de conversão
          <input type="text" name="meta_conversion_action" defaultValue={client?.meta_conversion_action ?? "lead"} />
          <span className="hint">action_type da Insights API. Ex.: lead, purchase, onsite_conversion.messaging_conversation_started_7d</span>
        </label>
        <label>
          Google Ads — Customer ID
          <input type="text" name="google_ads_customer_id" defaultValue={client?.google_ads_customer_id ?? ""} />
          <span className="hint">10 dígitos; hífens são removidos.</span>
        </label>
        <label>
          GA4 — ID da propriedade
          <input type="text" name="ga4_property_id" inputMode="numeric" defaultValue={client?.ga4_property_id ?? ""} />
          <span className="hint">Número da propriedade (Admin › Detalhes da propriedade).</span>
        </label>
      </div>

      <label className="checkbox">
        <input type="checkbox" name="active" defaultChecked={client?.active ?? true} /> Cliente ativo
      </label>

      {state.error && <p className="error" role="alert">{state.error}</p>}
      <div className="row">
        <button className="btn primary" type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </form>
  );
}
