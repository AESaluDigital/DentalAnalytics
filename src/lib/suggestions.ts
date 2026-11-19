import "server-only";
import { ga4Properties, googleAdsAccounts, metaAdAccounts } from "./platforms/discovery";
import type { AccountSuggestions } from "@/components/ClientForm";

/** Sugestões de contas para o formulário de cliente (vazias se a integração não estiver conectada). */
export async function accountSuggestions(): Promise<AccountSuggestions> {
  const [m, g, a] = await Promise.all([metaAdAccounts(), googleAdsAccounts(), ga4Properties()]);
  return {
    meta: m.ok ? m.items : [],
    googleAds: g.ok ? g.items : [],
    ga4: a.ok ? a.items : [],
  };
}
