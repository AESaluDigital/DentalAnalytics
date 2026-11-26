/**
 * Tela de carregamento das páginas logadas. Com ela o Next pré-carrega o esqueleto das rotas dinâmicas e
 * troca de página no mesmo instante do clique, em vez de esperar a resposta do servidor.
 */
export default function Loading() {
  return (
    <div className="page-loading" role="status" aria-label="Carregando…">
      <div className="skel" style={{ height: 34, width: "min(320px, 60%)" }} />
      <div className="skel" style={{ height: 96 }} />
      <div className="skel" style={{ height: 280 }} />
    </div>
  );
}
