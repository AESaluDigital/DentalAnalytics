"use client";

/* eslint-disable @next/next/no-img-element */
import { Fragment, useEffect, useMemo, useState } from "react";
import { adsCols, type MetricCol } from "@/lib/metric-cols";
import { METRIC_HELP } from "@/lib/metric-help";
import type { AdsCampaignRow, AdsMetrics, MetaAdRow, MetaBreakdown } from "@/lib/types";
import InfoTip from "../InfoTip";

interface Props {
  campaigns: AdsCampaignRow[];
  breakdown?: MetaBreakdown;
  currency: string;
  totalSpend: number;
  hasValue: boolean;
}

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
      {cols.map((c) => {
        const tone = c.tone?.(m);
        return <td key={c.key} className={`num${tone ? ` ${tone}` : ""}`}>{c.value(m)}</td>;
      })}
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

/** Miniatura do criativo; some se a imagem não carregar (links da Meta expiram em relatórios antigos). */
function Thumb({ ad, onOpen }: { ad: MetaAdRow; onOpen: () => void }) {
  const [broken, setBroken] = useState(false);
  const src = ad.creative?.thumbnail ?? ad.creative?.image ?? null;
  if (!src || broken) {
    return <span className="ad-thumb empty" aria-hidden>▣</span>;
  }
  return (
    <button type="button" className="ad-thumb" onClick={onOpen} aria-label={`Ver prévia de ${ad.name}`}>
      <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
    </button>
  );
}

/** Janela com a prévia do criativo. */
function Preview({ ad, onClose }: { ad: MetaAdRow; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const c = ad.creative;
  const src = c?.image ?? c?.thumbnail ?? null;
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal card" role="dialog" aria-modal="true" aria-label={`Prévia: ${ad.name}`} onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ flexWrap: "nowrap" }}>
          <strong className="ellipsis">{ad.name}</strong>
          <button type="button" className="btn icon" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        {src ? <img className="ad-preview-img" src={src} alt={`Criativo do anúncio ${ad.name}`} referrerPolicy="no-referrer" /> :
          <p className="muted">Imagem indisponível.</p>}
        {c?.title && <strong>{c.title}</strong>}
        {c?.body && <p className="ad-preview-body">{c.body}</p>}
        <div className="row">
          {c?.previewLink && (
            <a className="btn primary" href={c.previewLink} target="_blank" rel="noopener noreferrer">Ver anúncio no Facebook ↗</a>
          )}
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          Prévia gerada pela Meta. Vídeos e carrosséis aparecem completos em &quot;Ver anúncio no Facebook&quot;.
        </p>
      </div>
    </div>
  );
}

export default function MetaAdsDrilldown({ campaigns, breakdown, currency, totalSpend, hasValue }: Props) {
  const cols = useMemo(() => adsCols(currency, totalSpend, hasValue), [currency, totalSpend, hasValue]);
  const [openCampaigns, setOpenCampaigns] = useState<Set<string>>(new Set());
  const [openSets, setOpenSets] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<MetaAdRow | null>(null);

  const setsByCampaign = useMemo(() => groupBy(breakdown?.adSets ?? [], (s) => s.campaignId), [breakdown]);
  const adsBySet = useMemo(() => groupBy(breakdown?.ads ?? [], (a) => a.adSetId), [breakdown]);

  const toggle = (setter: typeof setOpenCampaigns, id: string) =>
    setter((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const expandAll = () => {
    setOpenCampaigns(new Set(campaigns.filter((c) => setsByCampaign.has(c.id)).map((c) => c.id)));
    setOpenSets(new Set((breakdown?.adSets ?? []).filter((s) => adsBySet.has(s.id)).map((s) => s.id)));
  };
  const collapseAll = () => {
    setOpenCampaigns(new Set());
    setOpenSets(new Set());
  };

  if (campaigns.length === 0) return <p className="muted">Nenhuma campanha com entrega no período.</p>;
  const hasBreakdown = Boolean(breakdown && breakdown.adSets.length);

  return (
    <div className="stack drill">
      {hasBreakdown && (
        <div className="row no-print" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={expandAll}>Expandir tudo</button>
          <button type="button" className="btn" onClick={collapseAll}>Recolher tudo</button>
        </div>
      )}
      <div className="table-wrap">
        <table className="tree tree-meta">
          <thead>
            <tr>
              <th>Campanha / conjunto / anúncio</th>
              {cols.map((c) => (
                <th key={c.key} className="num">
                  <span className="th-help">{c.label}<InfoTip label={c.label} text={METRIC_HELP[c.help]} /></span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {campaigns.slice(0, 50).map((c) => {
              const sets = setsByCampaign.get(c.id) ?? [];
              const open = openCampaigns.has(c.id);
              return (
                <Fragment key={c.id || c.name}>
                  <tr className={`lvl-0${open ? " is-open" : ""}`}>
                    <td className="name">
                      <span className="tree-cell">
                        {sets.length > 0 ? <Toggle open={open} onClick={() => toggle(setOpenCampaigns, c.id)} label={c.name} />
                          : <span className="tree-spacer" />}
                        <span>
                          {c.name}
                          {sets.length > 0 && <span className="tree-count">{sets.length} conjunto{sets.length > 1 ? "s" : ""}</span>}
                        </span>
                      </span>
                    </td>
                    <MetricCells cols={cols} m={c} />
                  </tr>
                  {open && sets.map((s) => {
                    const ads = adsBySet.get(s.id) ?? [];
                    const sOpen = openSets.has(s.id);
                    return (
                      <Fragment key={s.id}>
                        <tr className={`lvl-1 tree-in${sOpen ? " is-open" : ""}`}>
                          <td className="name">
                            <span className="tree-cell">
                              {ads.length > 0 ? <Toggle open={sOpen} onClick={() => toggle(setOpenSets, s.id)} label={s.name} />
                                : <span className="tree-spacer" />}
                              <span>
                                <span className="tree-kind">Conjunto</span> {s.name}
                                {ads.length > 0 && <span className="tree-count">{ads.length} anúncio{ads.length > 1 ? "s" : ""}</span>}
                              </span>
                            </span>
                          </td>
                          <MetricCells cols={cols} m={s} />
                        </tr>
                        {sOpen && ads.map((a) => (
                          <tr key={a.id} className="lvl-2 tree-in">
                            <td className="name">
                              <span className="tree-cell ad-cell">
                                <Thumb ad={a} onOpen={() => setPreview(a)} />
                                <span>
                                  <span className="tree-kind">Anúncio</span> {a.name}
                                  {a.creative?.title && <span className="tree-count">{a.creative.title}</span>}
                                  {(a.creative?.thumbnail || a.creative?.previewLink) && (
                                    <button type="button" className="link-btn small no-print" onClick={() => setPreview(a)}>ver prévia</button>
                                  )}
                                </span>
                              </span>
                            </td>
                            <MetricCells cols={cols} m={a} />
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
      {campaigns.length > 50 && <p className="muted small">Exibindo as 50 campanhas com maior investimento de {campaigns.length}.</p>}
      {!breakdown && (
        <p className="muted small">
          Este relatório foi gerado antes do detalhamento por conjuntos e anúncios. Gere um novo para ver.
        </p>
      )}
      {breakdown?.notes.map((n) => <p key={n} className="muted small">ⓘ {n}</p>)}
      {preview && <Preview ad={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
