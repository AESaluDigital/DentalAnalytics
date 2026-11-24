import "server-only";
import { todayIso } from "./dates";
import { PlatformError } from "./platforms/http";

/**
 * Importação de clientes a partir de uma planilha do Google (compartilhada como "qualquer pessoa com o link").
 * Só aceita links do Google Planilhas: o ID é extraído e a URL de exportação é montada aqui (sem SSRF).
 */

export interface SheetClient {
  name: string;
  /** 10 dígitos, sem hífen. */
  googleAdsId: string | null;
  status: string;
  /** Orçamento do mês usado no import (mensal informado, ou diário × dias do mês). */
  budget: number | null;
  budgetSource: "mensal" | "diário × dias" | null;
  monthly: string;
  daily: string;
}

export function sheetIdFrom(url: string): string | null {
  const m = url.trim().match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]{20,100})/);
  return m ? m[1] : null;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** "R$ 1.200,00" → 1200 ; vazio/inválido → null */
function money(raw: string): number | null {
  const s = raw.replace(/[R$\s]/g, "").trim();
  if (!s) return null;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/\.(?=\d{3}(\D|$))/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

function daysInCurrentMonth(): number {
  const [y, m] = todayIso().split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** Lê a aba da planilha e devolve os clientes com o status pedido (ex.: ATIVO). */
export async function readSheetClients(url: string, tab: string, status: string): Promise<SheetClient[]> {
  const id = sheetIdFrom(url);
  if (!id) throw new PlatformError("Planilha", "Link inválido: use o link do Google Planilhas (docs.google.com/spreadsheets/...).");
  const csvUrl = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
  const res = await fetch(csvUrl, { cache: "no-store", redirect: "follow" });
  if (!res.ok) {
    throw new PlatformError("Planilha", `Não foi possível ler a planilha (HTTP ${res.status}). Confira se ela está compartilhada como "qualquer pessoa com o link".`);
  }
  const text = await res.text();
  if (text.trimStart().startsWith("<")) {
    throw new PlatformError("Planilha", 'A planilha não está pública. Compartilhe como "qualquer pessoa com o link pode ver".');
  }
  const rows = parseCsv(text);
  const head = (rows[0] ?? []).map(norm);
  const col = (...names: string[]) => head.findIndex((h) => names.some((n) => h === n || h.startsWith(n)));
  const iName = col("cliente", "nome");
  const iAcc = col("numero da conta", "conta", "customer id", "id da conta");
  const iStatus = col("status");
  const iMonth = col("orcamento mes", "orcamento mensal", "investimento");
  const iDay = col("orcamento diario");
  if (iName < 0 || iAcc < 0) {
    throw new PlatformError("Planilha", `A aba "${tab}" precisa das colunas "Cliente" e "Numero da conta".`);
  }

  const days = daysInCurrentMonth();
  const wanted = norm(status);
  return rows
    .slice(1)
    .filter((r) => (r[iName] ?? "").trim())
    .filter((r) => !wanted || norm(r[iStatus] ?? "") === wanted)
    .map((r) => {
      const digits = (r[iAcc] ?? "").replace(/\D/g, "");
      const monthly = iMonth >= 0 ? (r[iMonth] ?? "").trim() : "";
      const daily = iDay >= 0 ? (r[iDay] ?? "").trim() : "";
      const m = money(monthly);
      const d = money(daily);
      const budget = m && m > 0 ? m : d && d > 0 ? Math.round(d * days * 100) / 100 : null;
      return {
        name: (r[iName] ?? "").trim().slice(0, 200),
        googleAdsId: digits.length === 10 ? digits : null,
        status: (r[iStatus] ?? "").trim(),
        budget,
        budgetSource: m && m > 0 ? "mensal" : d && d > 0 ? "diário × dias" : null,
        monthly,
        daily,
      } satisfies SheetClient;
    });
}

