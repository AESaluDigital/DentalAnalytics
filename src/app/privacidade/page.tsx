import Link from "next/link";
import type { Metadata } from "next";
import Logo from "@/components/Logo";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: "Como a plataforma SuperDental trata dados pessoais, em conformidade com a LGPD (Lei nº 13.709/2018).",
};

/** Data da versão vigente — atualize ao mudar o texto. */
const UPDATED = "25 de novembro de 2026";

const SECTIONS = [
  ["quem-somos", "1. Quem somos"],
  ["abrangencia", "2. A quem esta política se aplica"],
  ["dados", "3. Quais dados tratamos"],
  ["finalidades", "4. Para que usamos os dados e bases legais"],
  ["compartilhamento", "5. Com quem compartilhamos"],
  ["transferencia", "6. Transferência internacional"],
  ["retencao", "7. Por quanto tempo guardamos"],
  ["seguranca", "8. Como protegemos os dados"],
  ["cookies", "9. Cookies e armazenamento no navegador"],
  ["direitos", "10. Seus direitos como titular"],
  ["papeis", "11. Controlador e operador"],
  ["criancas", "12. Crianças e adolescentes"],
  ["incidentes", "13. Incidentes de segurança"],
  ["alteracoes", "14. Alterações desta política"],
  ["contato", "15. Encarregado (DPO) e contato"],
] as const;

export default function PrivacyPage() {
  const email = env().PRIVACY_CONTACT_EMAIL;
  const contact = email ? (
    <a href={`mailto:${email}`}>{email}</a>
  ) : (
    <>o canal de atendimento da Salu Digital informado no contrato de prestação de serviços</>
  );

  return (
    <main className="legal-shell">
      <header className="legal-head">
        <Link href="/" aria-label="Início"><Logo height={36} /></Link>
        <h1>Política de Privacidade</h1>
        <p className="muted">Última atualização: {UPDATED}</p>
      </header>

      <article className="card legal">
        <p>
          Esta Política de Privacidade explica como a plataforma <strong>SuperDental · Relatórios</strong> (&quot;Plataforma&quot;)
          coleta, usa, armazena, compartilha e protege dados pessoais, e quais são os seus direitos, conforme a Lei Geral de
          Proteção de Dados Pessoais — <strong>LGPD (Lei nº 13.709/2018)</strong> — e o Marco Civil da Internet (Lei nº 12.965/2014).
        </p>

        <nav aria-label="Sumário" className="legal-toc">
          <strong>Sumário</strong>
          <ol>
            {SECTIONS.map(([id, label]) => (
              <li key={id}><a href={`#${id}`}>{label.replace(/^\d+\.\s/, "")}</a></li>
            ))}
          </ol>
        </nav>

        <section id="quem-somos">
          <h2>1. Quem somos</h2>
          <p>
            A Plataforma é operada pela <strong>Salu Digital</strong>, agência de marketing digital que a utiliza para reunir, em
            relatórios de performance, os resultados de mídia paga (Meta Ads e Google Ads), de acesso ao site (Google Analytics 4) e
            de vendas (CRM) das clínicas e empresas que atende (&quot;Clientes&quot;).
          </p>
        </section>

        <section id="abrangencia">
          <h2>2. A quem esta política se aplica</h2>
          <ul>
            <li><strong>Usuários da equipe</strong>: pessoas que têm login na Plataforma (colaboradores da agência e pessoas autorizadas).</li>
            <li><strong>Clientes</strong>: empresas cujos dados de anúncios, site e vendas são consultados para gerar os relatórios.</li>
            <li><strong>Destinatários de relatórios</strong>: quem acessa um relatório por um link de compartilhamento.</li>
          </ul>
          <p>
            A Plataforma é de uso restrito e profissional. Ela não é destinada ao público em geral nem a pacientes das clínicas.
          </p>
        </section>

        <section id="dados">
          <h2>3. Quais dados tratamos</h2>
          <h3>3.1 Dados dos usuários da equipe</h3>
          <ul>
            <li><strong>Cadastro</strong>: nome, e-mail (ou login) e senha. A senha é guardada só como <em>hash</em> criptográfico (bcrypt), nunca em texto.</li>
            <li><strong>Acesso e permissões</strong>: papel (administrador ou usuário), permissões, situação da conta (ativa, pendente de aprovação) e data de criação.</li>
            <li><strong>Registros de autoria</strong>: quem gerou um relatório, conectou uma integração ou alterou um orçamento, e quando.</li>
            <li><strong>Dados técnicos</strong>: cookie de sessão e registros de acesso mantidos pelos provedores de hospedagem (como endereço IP, data e hora), conforme o art. 15 do Marco Civil da Internet.</li>
          </ul>
          <h3>3.2 Dados dos Clientes e das plataformas conectadas</h3>
          <ul>
            <li><strong>Cadastro do Cliente</strong>: nome da empresa e identificadores das contas de anúncios, do Google Analytics e do CRM.</li>
            <li><strong>Métricas agregadas</strong>: investimento, impressões, cliques, conversões, sessões no site e dados de campanhas, conjuntos, anúncios e palavras-chave. São números agregados, que não identificam pessoas.</li>
            <li>
              <strong>Dados de vendas do CRM (Sellbot)</strong>: para cada negócio, apenas data de criação, situação (aberto, ganho,
              perdido), valor, origem, campanha, parâmetros UTM e motivo de perda. <strong>Não armazenamos nome, telefone, e-mail ou
              qualquer outro dado que identifique os leads ou pacientes.</strong>
            </li>
            <li><strong>Orçamentos</strong>: valores de orçamento mensal definidos pela equipe.</li>
            <li><strong>Credenciais de integração</strong>: tokens de acesso às APIs (Meta, Google, Sellbot), guardados criptografados.</li>
          </ul>
          <h3>3.3 Dados que não tratamos</h3>
          <p>
            Não coletamos dados pessoais sensíveis (art. 5º, II, da LGPD), como dados de saúde, prontuários ou informações clínicas
            de pacientes, nem dados de pagamento.
          </p>
        </section>

        <section id="finalidades">
          <h2>4. Para que usamos os dados e bases legais</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Finalidade</th><th>Dados</th><th>Base legal (art. 7º da LGPD)</th></tr></thead>
              <tbody>
                <tr><td>Criar e manter a conta, autenticar o acesso e controlar permissões</td><td>Cadastro e acesso do usuário</td><td>Execução de contrato e procedimentos preliminares (V)</td></tr>
                <tr><td>Gerar relatórios, dashboards e análises de performance para os Clientes</td><td>Métricas, vendas do CRM, orçamentos</td><td>Execução de contrato (V) e legítimo interesse (IX)</td></tr>
                <tr><td>Compartilhar relatórios por link com o Cliente</td><td>Conteúdo do relatório</td><td>Execução de contrato (V)</td></tr>
                <tr><td>Segurança, prevenção a fraudes e acessos indevidos</td><td>Dados técnicos e de acesso</td><td>Legítimo interesse (IX)</td></tr>
                <tr><td>Guardar registros de acesso pelo prazo legal</td><td>Registros de acesso</td><td>Cumprimento de obrigação legal (II)</td></tr>
                <tr><td>Exercer direitos em processos judiciais, administrativos ou arbitrais</td><td>Dados necessários ao caso</td><td>Exercício regular de direitos (VI)</td></tr>
              </tbody>
            </table>
          </div>
          <p>
            Quando usamos o legítimo interesse, avaliamos se o tratamento é necessário, se respeita as expectativas dos titulares e
            se não prejudica seus direitos (art. 10 da LGPD). Não vendemos dados pessoais e não os usamos para publicidade.
          </p>
        </section>

        <section id="compartilhamento">
          <h2>5. Com quem compartilhamos</h2>
          <p>Compartilhamos dados somente com prestadores de serviço necessários para a Plataforma funcionar:</p>
          <ul>
            <li><strong>Hospedagem e banco de dados</strong>: Vercel (aplicação) e Supabase (banco de dados PostgreSQL).</li>
            <li><strong>Plataformas de origem dos dados</strong>: Meta (Facebook/Instagram Ads), Google (Google Ads, Google Analytics 4 e Planilhas Google, na importação de clientes) e Sellbot (CRM), consultadas com autorização do Cliente e só para leitura.</li>
            <li>
              <strong>Inteligência artificial</strong>: a Anthropic (Claude) recebe um resumo das métricas agregadas para escrever o
              texto de análise do relatório. Esse resumo não contém dados pessoais nem identificadores das contas.
            </li>
            <li><strong>Autoridades</strong>: quando houver obrigação legal ou ordem judicial.</li>
          </ul>
          <p>
            Relatórios compartilhados por link podem ser vistos por qualquer pessoa que tenha o link, enquanto ele for válido.
            O link tem prazo de validade e pode ser revogado a qualquer momento pela equipe.
          </p>
        </section>

        <section id="transferencia">
          <h2>6. Transferência internacional</h2>
          <p>
            Alguns prestadores (como Vercel, Supabase, Meta, Google e Anthropic) podem processar dados em servidores fora do Brasil,
            principalmente nos Estados Unidos. Essas transferências seguem o art. 33 da LGPD e a Resolução CD/ANPD nº 19/2024, com
            base em cláusulas contratuais e garantias de proteção oferecidas por esses prestadores.
          </p>
        </section>

        <section id="retencao">
          <h2>7. Por quanto tempo guardamos</h2>
          <ul>
            <li><strong>Conta de usuário</strong>: enquanto o acesso estiver ativo. Depois que a conta é excluída ou o contrato termina, apagamos os dados, salvo quando a lei exigir guardá-los.</li>
            <li><strong>Relatórios</strong>: enquanto durar o contrato com o Cliente, ou até a exclusão pelo Cliente ou pela equipe.</li>
            <li><strong>Credenciais de integração</strong>: até a desconexão da integração.</li>
            <li><strong>Sessão</strong>: o cookie de login expira em até 10 horas ou ao sair da conta.</li>
            <li><strong>Registros de acesso</strong>: no mínimo 6 meses, conforme o art. 15 do Marco Civil da Internet.</li>
          </ul>
          <p>Ao fim do prazo, os dados são eliminados ou anonimizados, exceto nas hipóteses do art. 16 da LGPD.</p>
        </section>

        <section id="seguranca">
          <h2>8. Como protegemos os dados</h2>
          <ul>
            <li>Conexões criptografadas (HTTPS/TLS) entre o navegador, a Plataforma e o banco de dados.</li>
            <li>Senhas guardadas com <em>hash</em> bcrypt e tokens de integração criptografados no banco.</li>
            <li>Cookie de sessão protegido (<em>HttpOnly</em>, <em>Secure</em> e <em>SameSite</em>), com expiração automática.</li>
            <li>Controle de acesso por papéis e permissões individuais. Novos cadastros precisam ser aprovados por um administrador.</li>
            <li>Minimização: não armazenamos dados pessoais dos leads e pacientes do CRM.</li>
            <li>Links de relatório com prazo de validade e possibilidade de revogação.</li>
          </ul>
          <p>
            Nenhum sistema é totalmente imune a riscos. Por isso, revisamos as medidas de segurança continuamente (art. 46 da LGPD).
          </p>
        </section>

        <section id="cookies">
          <h2>9. Cookies e armazenamento no navegador</h2>
          <ul>
            <li><strong>Cookie de sessão</strong> (estritamente necessário): mantém você conectado depois do login. Sem ele, a Plataforma não funciona.</li>
            <li><strong>Preferências de aparência</strong> (armazenamento local do navegador): tema claro ou escuro e cor principal escolhida. Esses dados ficam só no seu navegador.</li>
          </ul>
          <p>
            Não usamos cookies de publicidade, de rastreamento nem de análise de terceiros. As fontes do site são servidas pela
            própria Plataforma, sem chamadas a serviços externos.
          </p>
        </section>

        <section id="direitos">
          <h2>10. Seus direitos como titular</h2>
          <p>Conforme o art. 18 da LGPD, você pode pedir, a qualquer momento e sem custo:</p>
          <ul>
            <li>confirmação de que tratamos seus dados e acesso a eles;</li>
            <li>correção de dados incompletos, inexatos ou desatualizados;</li>
            <li>anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade com a LGPD;</li>
            <li>portabilidade dos dados a outro fornecedor;</li>
            <li>eliminação dos dados tratados com base no consentimento, quando for o caso;</li>
            <li>informação sobre com quem compartilhamos seus dados;</li>
            <li>informação sobre a possibilidade de não dar consentimento e as consequências disso;</li>
            <li>revogação do consentimento, quando for o caso;</li>
            <li>oposição a tratamento feito com base em legítimo interesse, quando houver descumprimento da LGPD;</li>
            <li>revisão de decisões tomadas só com base em tratamento automatizado (art. 20). A Plataforma não toma decisões automatizadas sobre pessoas.</li>
          </ul>
          <p>
            Para exercer seus direitos, entre em contato pelo canal indicado na seção 15. Responderemos em até 15 dias, conforme o
            art. 19 da LGPD. Podemos pedir informações para confirmar sua identidade. Você também pode apresentar reclamação à{" "}
            <strong>Autoridade Nacional de Proteção de Dados (ANPD)</strong>, em <a href="https://www.gov.br/anpd" target="_blank" rel="noreferrer">gov.br/anpd</a>.
          </p>
        </section>

        <section id="papeis">
          <h2>11. Controlador e operador</h2>
          <p>
            Para os dados dos usuários da equipe, a Salu Digital é a <strong>controladora</strong>. Para os dados das contas de anúncios,
            do site e do CRM dos Clientes, a Salu Digital atua como <strong>operadora</strong>, tratando os dados em nome do Cliente
            (controlador) e conforme as instruções dele (arts. 37 a 40 da LGPD). Se o seu pedido for sobre dados de um Cliente, ele
            será encaminhado ao Cliente responsável.
          </p>
        </section>

        <section id="criancas">
          <h2>12. Crianças e adolescentes</h2>
          <p>A Plataforma é profissional e não se destina a menores de 18 anos. Não tratamos intencionalmente dados de crianças e adolescentes.</p>
        </section>

        <section id="incidentes">
          <h2>13. Incidentes de segurança</h2>
          <p>
            Se houver um incidente de segurança que possa causar risco ou dano relevante aos titulares, vamos comunicar a ANPD e os
            titulares afetados nos prazos e na forma do art. 48 da LGPD e da Resolução CD/ANPD nº 15/2024. Também tomaremos as
            medidas para conter e corrigir o incidente.
          </p>
        </section>

        <section id="alteracoes">
          <h2>14. Alterações desta política</h2>
          <p>
            Podemos atualizar esta política para refletir mudanças na Plataforma ou na legislação. A data da última atualização
            fica no topo da página. Se a mudança for relevante, avisaremos os usuários dentro da Plataforma.
          </p>
        </section>

        <section id="contato">
          <h2>15. Encarregado (DPO) e contato</h2>
          <p>
            Para dúvidas sobre esta política, pedidos sobre seus direitos ou comunicações sobre proteção de dados, fale com o
            Encarregado pelo Tratamento de Dados Pessoais da Salu Digital pelo e-mail {contact}.
          </p>
        </section>
      </article>

      <p className="legal-back"><Link href="/login">← Voltar para a Plataforma</Link></p>
    </main>
  );
}
