"use client";

import { Fragment, useMemo, useState } from "react";
import { adsCols, MATCH_LABEL, type MetricCol } from "@/lib/metric-cols";
import { METRIC_HELP } from "@/lib/metric-help";
import type { AdsCampaignRow, AdsMetrics, GadsKeywordRow, GadsSearchTermRow, GoogleAdsBreakdown } from "@/lib/types";
import InfoTip from "../InfoTip";

interface Props {
  campaigns: AdsCampaignRow[];
  breakdown?: GoogleAdsBreakdown;
  currency: string;
  totalSpend: number;
  hasValue: boolean;
}

type View = "cascade" | "terms";
type Sub = "keywords" | "terms";

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  }
  return m;
}

function MetricCells({ cols, m }: { cols: MetricCol[]; m: AdsMetrics }) {
  return (
    <>
      {cols.map((c) => (
        <td key={c.key} className={`num${c.tone?.(m) ? ` ${c.tone(m)}` : ""}`}>{c.value(m)}</td>
      ))}
    </>
  );
}

function MetricHeads({ cols }: { cols: MetricCol[] }) {
  return (
    <>
      {cols.map((c) => (
        <th key={c.key} className="num">
          <span className="th-help">{c.label}<InfoTip label={c.label} text={METRIC_HELP[c.help]} /></span>
        </th>
      ))}
    </>
  );
}

function Toggle({ open, onClick, label }: { open: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" className={`tree-toggle${open ? " open" : ""}`} onClick={onClick} aria-expanded={open}
      aria-label={`${open ? "Recolher" : "Expandir"} ${label}`}>
      <span aria-hidden>▸</span>
    </button>
  );
}

function MatchBadge({ type }: { type: string | null }) {
  if (!type) return null;
  return <span className={`match match-${type.toLowerCase()}`}>{MATCH_LABEL[type] ?? type}</span>;
}

export default function GoogleAdsDrilldown({ campaigns, breakdown, currency, totalSpend, hasValue }: Props) {
  const cols = useMemo(() => adsCols(currency, totalSpend, hasValue), [currency, totalSpend, hasValue]);
  const [view, setView] = useState<View>("cascade");
  const [openCampaigns, setOpenCampaigns] = useState<Set<string>>(new Set());
  const [openGroups, setOpenGroups] = useState<Map<string, Sub>>(new Map());
  const [filter, setFilter] = useState("");
  const [limit, setLimit] = useState(100);

  const groupsByCampaign = useMemo(() => groupBy(breakdown?.adGroups ?? [], (g) => g.campaignId), [breakdown]);
  const kwByGroup = useMemo(() => groupBy(breakdown?.keywords ?? [], (k) => k.adGroupId), [breakdown]);
  const termsByGroup = useMemo(() => groupBy(breakdown?.searchTerms ?? [], (t) => t.adGroupId), [breakdown]);
  const campaignName = useMemo(() => new Map(campaigns.map((c) => [c.id, c.name])), [campaigns]);
  const groupName = useMemo(() => new Map((breakdown?.adGroups ?? []).map((g) => [g.id, g.name])), [breakdown]);

  const toggleCampaign = (id: string) =>
    setOpenCampaigns((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleGroup = (id: string, sub: Sub = "keywords") =>
    setOpenGroups((m) => {
      const n = new Map(m);
      if (n.has(id)) n.delete(id);
      else n.set(id, sub);
      return n;
    });
  const setSub = (id: string, sub: Sub) => setOpenGroups((m) => new Map(m).set(id, sub));

  const expandAll = () => {
    setOpenCampaigns(new Set(campaigns.filter((c) => groupsByCampaign.has(c.id)).map((c) => c.id)));
    setOpenGroups(new Map((breakdown?.adGroups ?? []).filter((g) => kwByGroup.has(g.id) || termsByGroup.has(g.id))
      .map((g) => [g.id, kwByGroup.has(g.id) ? "keywords" : "terms"] as const)));
  };
  const collapseAll = () => {
    setOpenCampaigns(new Set());
    setOpenGroups(new Map());
  };

  const terms = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = breakdown?.searchTerms ?? [];
    return q ? list.filter((t) => t.term.toLowerCase().includes(q) || t.keyword?.toLowerCase().includes(q)) : list;
  }, [breakdown, filter]);

  const nCols = cols.length + 1;
  const hasBreakdown = Boolean(breakdown && (breakdown.adGroups.length || breakdown.searchTerms.length));

  if (campaigns.length === 0) return <p className="muted">Nenhuma campanha com entrega no período.</p>;

  return (
    <div className="stack drill">
      <div className="row between no-print">
        <div className="seg" role="group" aria-label="Visualização">
          <button type="button" className="btn" aria-pressed={view === "cascade"} onClick={() => setView("cascade")}>
            Campanhas › Grupos › Palavras-chave
          </button>
          <button type="button" className="btn" aria-pressed={view === "terms"} onClick={() => setView("terms")}
            disabled={!breakdown}>
            Termos de pesquisa{breakdown ? ` (${breakdown.searchTerms.length})` : ""}
          </button>
        </div>
        {view === "cascade" && hasBreakdown && (
          <div className="row">
            <button type="button" className="btn" onClick={expandAll}>Expandir tudo</button>
            <button type="button" className="btn" onClick={collapseAll}>Recolher tudo</button>
          </div>
        )}
        {view === "terms" && (
          <input type="search" placeholder="Filtrar termo ou palavra-chave…" value={filter} aria-label="Filtrar termos"
            onChange={(e) => { setFilter(e.target.value); setLimit(100); }} style={{ flex: "0 1 300px" }} />
        )}
      </div>

      {view === "cascade" ? (
        <div className="table-wrap">
          <table className="tree">
            <thead>
              <tr>
                <th>Campanha / grupo / palavra-chave</th>
                <MetricHeads cols={cols} />
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const groups = groupsByCampaign.get(c.id) ?? [];
                const open = openCampaigns.has(c.id);
                return (
                  <Fragment key={c.id || c.name}>
                    <tr className={`lvl-0${open ? " is-open" : ""}`}>
                      <td className="name">
                        <span className="tree-cell">
                          {groups.length > 0 ? <Toggle open={open} onClick={() => toggleCampaign(c.id)} label={c.name} />
                            : <span className="tree-spacer" />}
                          <span>
                            {c.name}
                            {groups.length > 0 && <span className="tree-count">{groups.length} grupo{groups.length > 1 ? "s" : ""}</span>}
                          </span>
                        </span>
                      </td>
                      <MetricCells cols={cols} m={c} />
                    </tr>
                    {open && groups.map((g) => {
                      const kws = kwByGroup.get(g.id) ?? [];
                      const ts = termsByGroup.get(g.id) ?? [];
                      const sub = openGroups.get(g.id);
                      const canOpen = kws.length > 0 || ts.length > 0;
                      return (
                        <Fragment key={g.id}>
                          <tr className={`lvl-1 tree-in${sub ? " is-open" : ""}`}>
                            <td className="name">
                              <span className="tree-cell">
                                {canOpen ? <Toggle open={Boolean(sub)} onClick={() => toggleGroup(g.id, kws.length ? "keywords" : "terms")} label={g.name} />
                                  : <span className="tree-spacer" />}
                                <span>
                                  <span className="tree-kind">Grupo</span> {g.name}
                                  {kws.length > 0 && <span className="tree-count">{kws.length} palavra{kws.length > 1 ? "s" : ""}-chave</span>}
                                </span>
                              </span>
                            </td>
                            <MetricCells cols={cols} m={g} />
                          </tr>
                          {sub && (
                            <tr className="lvl-2 tree-in tree-switch">
                              <td colSpan={nCols}>
                                <div className="seg small-seg" role="group" aria-label={`Detalhe de ${g.name}`}>
                                  <button type="button" className="btn" aria-pressed={sub === "keywords"}
                                    disabled={!kws.length} onClick={() => setSub(g.id, "keywords")}>
                                    Palavras-chave ({kws.length})
                                  </button>
                                  <button type="button" className="btn" aria-pressed={sub === "terms"}
                                    disabled={!ts.length} onClick={() => setSub(g.id, "terms")}>
                                    Termos de pesquisa ({ts.length})
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}
                          {sub === "keywords" && kws.map((k: GadsKeywordRow) => (
                            <tr key={`k${k.id}`} className="lvl-2 tree-in">
                              <td className="name">
                                <span className="tree-cell">
                                  <span className="tree-spacer" />
                                  <span>{k.text} <MatchBadge type={k.matchType} /></span>
                                </span>
                              </td>
                              <MetricCells cols={cols} m={k} />
                            </tr>
                          ))}
                          {sub === "terms" && ts.map((t: GadsSearchTermRow, i) => (
                            <tr key={`t${i}${t.term}`} className="lvl-2 tree-in">
                              <td className="name">
                                <span className="tree-cell">
                                  <span className="tree-spacer" />
                                  <span>
                                    <span className="term">“{t.term}”</span>
                                    {t.keyword && <span className="tree-count">via {t.keyword}</span>}
                                  </span>
                                </span>
                              </td>
                              <MetricCells cols={cols} m={t} />
                            </tr>
                          ))}
                        </Fragment>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th><span className="th-help">Termo pesquisado<InfoTip label="Termo de pesquisa" text={METRIC_HELP.searchTerm} /></span></th>
                <th><span className="th-help">Palavra-chave<InfoTip label="Correspondência" text={METRIC_HELP.matchType} /></span></th>
                <th>Campanha / grupo</th>
                <MetricHeads cols={cols} />
              </tr>
            </thead>
            <tbody>
              {terms.slice(0, limit).map((t, i) => (
                <tr key={`${i}${t.term}${t.adGroupId}`}>
                  <td className="name"><span className="term">“{t.term}”</span></td>
                  <td>{t.keyword ?? <span className="muted">—</span>} <MatchBadge type={t.matchType} /></td>
                  <td className="small">
                    {campaignName.get(t.campaignId) ?? "—"}
                    <div className="muted">{groupName.get(t.adGroupId) ?? ""}</div>
                  </td>
                  <MetricCells cols={cols} m={t} />
                </tr>
              ))}
            </tbody>
          </table>
          {terms.length === 0 && <p className="muted">Nenhum termo encontrado.</p>}
          {terms.length > limit && (
            <div className="row no-print" style={{ justifyContent: "center", marginTop: 12 }}>
              <button type="button" className="btn" onClick={() => setLimit((l) => l + 200)}>
                Mostrar mais ({terms.length - limit} restantes)
              </button>
            </div>
          )}
        </div>
      )}

      {!breakdown && (
        <p className="muted small">
          Este relatório foi gerado antes do detalhamento por grupos, palavras-chave e termos. Gere um novo para ver.
        </p>
      )}
      {breakdown && !hasBreakdown && (
        <p className="muted small">Sem grupos/palavras-chave no período (ex.: campanhas Performance Max não detalham por palavra-chave).</p>
      )}
      {breakdown?.notes.map((n) => <p key={n} className="muted small">ⓘ {n}</p>)}
    </div>
  );
}
