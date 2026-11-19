"use client";

import { useActionState } from "react";
import { generateReportAction, type GenerateState } from "@/lib/actions/reports";

/** Gera um relatório salvo (com link e análise) a partir do cliente/período do dashboard. */
export default function SnapshotButton({ clientId, start, end }: { clientId: number; start: string; end: string }) {
  const [state, action, pending] = useActionState<GenerateState, FormData>(generateReportAction, {});
  return (
    <form action={action} className="row">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="start" value={start} />
      <input type="hidden" name="end" value={end} />
      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? "Gerando relatório…" : "Gerar relatório deste período"}
      </button>
      {state.error && <span className="error" role="alert">{state.error}</span>}
    </form>
  );
}
