"use client";

import { Fragment, useMemo, useState } from "react";
import { int, money, pct } from "@/lib/format";
import { ratio } from "@/lib/metrics";
import type { SellbotEntry } from "@/lib/types";

/** Níveis da cascata de UTMs. */
const LEVELS = [
  { key: "source", label: "utm_source" },
  { key: "medium", label: "utm_medium" },
  { key: "campaign", label: "utm_campaign" },
  { key: "term", label: "utm_term" },
  { key: "content", label: "utm_content" },
] as const;

interface Node {
  path: string;
  label: string | null;
  depth: number;
  leads: number;
  won: number;
  value: number;
  children: Node[];
}

function build(entries: SellbotEntry[]): Node[] {
  const root: Node = { path: "", label: null, depth: -1, leads: 0, won: 0, value: 0, children: [] };
  for (const e of entries) {
    let node = root;
    for (let d = 0; d < LEVELS.length; d++) {
      const v = e.utm[LEVELS[d].key];
      const path = `${node.path}/${v ?? "∅"}`;
      let child = node.children.find((c) => c.path === path);
      if (!child) {
        child = { path, label: v, depth: d, leads: 0, won: 0, value: 0, children: [] };
        node.children.push(child);
      }
      child.leads++;
      if (e.status === "won") {
        child.won++;
        child.value += e.value;
      }
      node = child;
    }
  }
  // Remove níveis finais vazios (ex.: sem term e sem content) para a cascata não ficar com "—" repetido.
  const prune = (n: Node): Node => {
    const kids = n.children.map(prune);
    const onlyEmpty = kids.length === 1 && kids[0].label === null && kids[0].children.length === 0;
    return { ...n, children: onlyEmpty ? [] : kids.sort((a, b) => b.value - a.value || b.leads - a.leads) };
  };
  return prune(root).children;
}

/** UTMs em cascata (source ▸ medium ▸ campaign ▸ term ▸ content), expansível e recolhível. */
export default function UtmTree({ entries, currency }: { entries: SellbotEntry[]; currency: string }) {
  const tree = useMemo(() => build(entries), [entries]);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const all = useMemo(() => {
    const paths: string[] = [];
    const walk = (ns: Node[]) => ns.forEach((n) => { if (n.children.length) { paths.push(n.path); walk(n.children); } });
    walk(tree);
    return paths;
  }, [tree]);

  const toggle = (p: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });

  const rows = (ns: Node[]): React.ReactNode =>
    ns.map((n) => {
      const isOpen = open.has(n.path);
      return (
        <Fragment key={n.path}>
          <tr className={`lvl-${Math.min(n.depth, 2)}${n.depth ? " tree-in" : ""}${isOpen ? " is-open" : ""}`}>
            <td className="name">
              <span className="tree-cell" style={{ paddingLeft: n.depth * 22 }}>
                {n.children.length > 0 ? (
                  <button type="button" className={`tree-toggle${isOpen ? " open" : ""}`} onClick={() => toggle(n.path)}
                    aria-expanded={isOpen} aria-label={`${isOpen ? "Recolher" : "Expandir"} ${n.label ?? "sem valor"}`}>
                    <span aria-hidden>▸</span>
                  </button>
                ) : <span className="tree-spacer" />}
                <span>
                  <span className="tree-kind">{LEVELS[n.depth].label}</span>{" "}
                  {n.label ?? <span className="muted">(sem valor)</span>}
                  {n.children.length > 0 && <span className="tree-count">{n.children.length} {LEVELS[n.depth + 1]?.label ?? ""}</span>}
                </span>
              </span>
            </td>
            <td className="num">{int(n.leads)}</td>
            <td className="num">{int(n.won)}</td>
            <td className="num">{pct(ratio(n.won, n.leads), 1)}</td>
            <td className="num">{money(n.value, currency)}</td>
          </tr>
          {isOpen && rows(n.children)}
        </Fragment>
      );
    });

  if (!tree.length) return null;
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row between">
        <h3 className="chart-title" style={{ margin: 0 }}>Leads e vendas por UTM</h3>
        <div className="row no-print">
          <button type="button" className="btn small-btn" onClick={() => setOpen(new Set(all))}>Expandir tudo</button>
          <button type="button" className="btn small-btn" onClick={() => setOpen(new Set())}>Recolher tudo</button>
        </div>
      </div>
      <div className="table-wrap">
        <table className="tree">
          <thead>
            <tr>
              <th>source ▸ medium ▸ campaign ▸ term ▸ content</th>
              <th className="num">Leads</th>
              <th className="num">Vendas</th>
              <th className="num">Conv.</th>
              <th className="num">Faturamento</th>
            </tr>
          </thead>
          <tbody>{rows(tree)}</tbody>
        </table>
      </div>
    </div>
  );
}
