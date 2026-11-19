"use client";

import { useActionState } from "react";
import { saveClientAction, type ClientFormState } from "@/lib/actions/clients";
import type { ClientRow } from "@/lib/types";
import type { AccountOption } from "@/lib/platforms/discovery";

export interface AccountSuggestions {
  meta: AccountOption[];
  googleAds: AccountOption[];
  ga4: AccountOption[];
}

function Options({ id, items }: { id: string; items: AccountOption[] }) {
  return (
    <datalist id={id}>
      {items.map((a) => (
        <option key={a.id} value={a.id}>{`${a.name}${a.detail ? ` — ${a.detail}` : ""}`}</option>
      ))}
    </datalist>
  );
}

export default function ClientForm({ client, suggestions }: { client?: ClientRow; suggestions?: AccountSuggestions }) {
  const [state, action, pending] = useActionState<ClientFormState, FormData>(saveClientAction, {});
  const s = suggestions ?? { meta: [], googleAds: [], ga4: [] };
  const hint = (n: number) => (n > 0 ? ` ${n} conta(s) da integração disponíveis — comece a digitar o nome ou ID.` : "");

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
          <input type="text" name="meta_ad_account_id" list="sug-meta" autoComplete="off" defaultValue={client?.meta_ad_account_id ?? ""} />
          <Options id="sug-meta" items={s.meta} />
          <span className="hint">Somente números (o prefixo act_ é removido).{hint(s.meta.length)}</span>
        </label>
        <label>
          Meta — evento de conversão
          <input type="text" name="meta_conversion_action" defaultValue={client?.meta_conversion_action ?? "lead"} />
          <span className="hint">action_type da Insights API. Ex.: lead, purchase, onsite_conversion.messaging_conversation_started_7d</span>
        </label>
        <label>
          Google Ads — Customer ID
          <input type="text" name="google_ads_customer_id" list="sug-gads" autoComplete="off" defaultValue={client?.google_ads_customer_id ?? ""} />
          <Options id="sug-gads" items={s.googleAds} />
          <span className="hint">10 dígitos; hífens são removidos.{hint(s.googleAds.length)}</span>
        </label>
        <label>
          GA4 — ID da propriedade
          <input type="text" name="ga4_property_id" list="sug-ga4" autoComplete="off" defaultValue={client?.ga4_property_id ?? ""} />
          <Options id="sug-ga4" items={s.ga4} />
          <span className="hint">Número da propriedade (Admin › Detalhes da propriedade).{hint(s.ga4.length)}</span>
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
