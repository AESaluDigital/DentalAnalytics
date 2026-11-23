# Dashboard de Relatórios

App interno para navegar pelas contas dos clientes (Meta Ads, Google Ads, GA4) e gerar
relatórios padronizados com link público de compartilhamento.

- **Next.js 16 + TypeScript**, Postgres, login só para usuários cadastrados.
- O navegador **nunca** chama as APIs de Meta/Google/Claude: tudo passa pelo servidor
  (server actions em `src/lib/actions`), e os tokens ficam só no `.env`.
- Números, gráficos e tabelas vêm do template (`src/components/report`). A Claude só escreve
  os textos de análise (`src/lib/report/analysis.ts`), a partir de um resumo enxuto dos números.

## Requisitos

- Node.js 20.9 ou superior (https://nodejs.org)
- Postgres 13 ou superior

## Configuração

```powershell
npm install
copy .env.example .env      # preencha os valores (veja abaixo)
npm run db:dev              # opcional: Postgres local embutido (deixe rodando em outro terminal)
npm run db:migrate          # cria as tabelas
npm run user:create -- --login voce@empresa.com.br --name "Seu Nome" --role admin
npm run dev                 # http://localhost:3000
```

Produção: `npm run build` e depois `npm start`, atrás de HTTPS (o cookie de sessão é `secure` em produção).
Defina `APP_URL` com o domínio público, porque ele é usado para montar os links compartilhados.

### Usuários

Não existe cadastro aberto. Usuários são criados ou atualizados com `npm run user:create`
(a senha é pedida no terminal). `--login` aceita e-mail ou nome de usuário (ex.: `--login MariaSilva`),
e a tela de login não diferencia maiúsculas de minúsculas. A senha deve ter 12+ caracteres;
para aceitar de 8 a 11, defina `ALLOW_SHORT_PASSWORD=1` ao rodar o comando.
`--role admin` pode criar, editar e excluir clientes e conectar as Integrações. `user` pode
navegar e gerar relatórios. Para bloquear alguém, rode
`UPDATE users SET active = false WHERE email = '...'`: o acesso cai na hora.

**Conta master:** os logins listados em `MASTER_ADMINS` (no `.env`, separados por vírgula) são sempre
administradores e têm acesso a tudo, mesmo que o papel no banco seja alterado.

### Integrações (recomendado): conectar com login de administrador

Na tela **Integrações** (menu do admin), clique em **Conectar Meta** e **Conectar Google** e entre
com a conta administradora de cada plataforma, pelo login oficial delas. O app:

- pede só permissões de leitura: Meta `ads_read` + `business_management` (para listar os portfólios); Google Ads e Analytics `readonly`;
- não vê nem guarda senhas, e guarda o token criptografado no banco (AES-256-GCM, chave `INTEGRATIONS_KEY`);
- lista as contas de anúncio e as propriedades GA4 acessíveis e as sugere no cadastro de clientes;
- em **Desconectar**, apaga o token e revoga o acesso na própria plataforma.

Configuração única no `.env`: `INTEGRATIONS_KEY`, `META_APP_ID` + `META_APP_SECRET` (app da Meta
com Login do Facebook) e `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (cliente OAuth "Aplicativo da Web").
As URIs de redirecionamento a cadastrar aparecem na própria tela.

**Uso responsável das APIs (evita bloqueios).** As consultas passam por uma fila com no máximo 4
chamadas simultâneas por plataforma. Em `429` ou `RESOURCE_EXHAUSTED`, o app espera (`Retry-After`
ou backoff exponencial) antes de tentar de novo. Quando a Meta sinaliza limite de uso, o app para
na hora e pausa novas consultas por 5 minutos. O dashboard usa cache de 3 minutos e a lista de contas,
de 10 minutos.

O token da Meta vale cerca de 60 dias. A tela avisa quando estiver perto de vencer e basta clicar em
**Reconectar**. Os tokens fixos do `.env` (abaixo) continuam funcionando como alternativa.

### Meta Ads (alternativa: token fixo)

1. No Business Manager, crie um **System User** e atribua a ele as contas de anúncio dos clientes.
2. Gere um token com a permissões `ads_read` e `business_management` → `META_ACCESS_TOKEN`.
3. Recomendado: `META_APP_SECRET` (o app passa a enviar `appsecret_proof`).
4. No cadastro do cliente, informe o ID numérico da conta e o `action_type` que conta como
   conversão (ex.: `lead`, `purchase`, `onsite_conversion.messaging_conversation_started_7d`).

Endpoint usado: `GET /{versão}/act_{id}/insights` (nível conta e campanha).

### Google Ads + GA4

1. No Google Cloud, ative as APIs "Google Ads API", "Google Analytics Data API" e
   "Google Analytics Admin API". Depois crie um **cliente OAuth** do tipo
   **App para computador** → `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
2. Rode `npm run google:auth`: o navegador abre, você entra com uma conta que tenha acesso ao MCC
   e às propriedades GA4, e o `GOOGLE_REFRESH_TOKEN` é gravado direto no `.env`.
3. `GOOGLE_ADS_DEVELOPER_TOKEN`: Central de API da conta MCC (precisa de acesso Básico ou Padrão
   para contas reais).
4. `GOOGLE_ADS_LOGIN_CUSTOMER_ID`: ID do MCC, se as contas forem acessadas por ele.

Endpoints usados: Google Ads `POST /{versão}/customers/{id}/googleAds:search` (GAQL) e
GA4 `POST /v1beta/properties/{id}:batchRunReports`.

### Conferir as credenciais

`npm run check:credentials` testa cada token e lista as contas de anúncio Meta, as contas
Google Ads e as propriedades GA4 acessíveis, com os IDs para cadastrar os clientes.
Depois coloque `DEMO_MODE=false` e reinicie o `npm run dev`.

### Claude (análise em texto)

`ANTHROPIC_API_KEY` ativa os textos de análise (modelo padrão `claude-opus-5-5`, com fallback
automático do servidor em caso de recusa). Sem a chave, o relatório é gerado normalmente,
só que sem os textos.

## Dashboard ao vivo

`/dashboard` (a página inicial após o login) consulta Meta, Google Ads e GA4 na hora, no mesmo
layout do relatório.

- O seletor no topo (e as setas ← →) troca entre os clientes ativos.
- Há períodos rápidos (hoje, 7 e 30 dias, mês atual e mês passado) ou datas livres.
- **Atualizar agora** força uma nova consulta. Sem ela, o resultado fica em cache por 3 minutos,
  para não estourar os limites das APIs.
- **Auto (5 min)** atualiza sozinho enquanto a página estiver aberta.
- **Gerar relatório deste período** salva o que está na tela como relatório, com análise e link.
- **Exportar PDF** abre a impressão do navegador. Escolha "Salvar como PDF". O botão também
  aparece nos relatórios salvos e no link público.

## Como funciona o relatório

1. Na página do cliente, escolha o período e clique em **Gerar relatório**.
2. O servidor consulta as plataformas vinculadas em paralelo, incluindo o período anterior de
   mesma duração para calcular as variações, e salva um *snapshot* em `reports.data`.
3. A Claude recebe só totais, KPIs e as principais campanhas e canais (sem IDs de conta nem
   dados pessoais) e devolve JSON validado por schema.
4. O link `/r/{token}` mostra o snapshot sem login. Ele expira em `SHARE_LINK_DAYS` dias e pode
   ser revogado ou trocado a qualquer momento.

Se uma plataforma falhar, as outras seções continuam no relatório e a seção afetada mostra o erro.

## Versões das APIs

As versões ficam no `.env` (`META_API_VERSION`, `GOOGLE_ADS_API_VERSION`) para facilitar a
atualização. Valores padrão conferidos em nov/2026: Meta `v26.0`, Google Ads `v26`.
Consulte os changelogs antes de trocar:

- https://developers.facebook.com/docs/graph-api/changelog
- https://developers.google.com/google-ads/api/docs/release-notes
