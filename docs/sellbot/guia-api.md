# Guia do Integrador Sellbot

Conecte seu sistema à Sellbot seguindo exemplos prontos. Em cada rota você encontra a explicação, o endereço completo, os headers, o body e a resposta esperada.

|                        |                                                 |
| ---------------------- | ----------------------------------------------- |
| **Base URL**           | `https://api.sellbot.tech/v1`                   |
| **Onde gerar o token** | Sellbot → Configurações → API Tokens            |
| **Claude e ChatGPT**   | Use o [conector MCP](/ajuda/mcp), sem programar |

---

# Primeiros passos

## Comece por aqui

Siga esta ordem antes de integrar as rotas:

1. No Sellbot, abra **Configurações → API Tokens**.
2. Crie um token com as permissões que sua integração precisa.
3. Copie o token quando ele for exibido. Por segurança, ele não será mostrado novamente.
4. Guarde o token no backend da sua integração.
5. Faça a primeira consulta com `GET /contacts/leads`.
6. Guarde o header `X-Request-Id` de cada resposta. Ele identifica a chamada no suporte Sellbot.

As rotas sem `/v1` continuam funcionando durante a transição, mas novas integrações devem usar sempre a Base URL versionada acima.

### Use o token em todas as rotas

Todas as rotas abaixo exigem:

```http
Authorization: Bearer sbt_SEU_TOKEN_AQUI
```

O token já identifica a conta e o usuário. Não envie `client_uuid` nem `user_id` na query ou no body.

### Token da conta ou token de um número

Existem dois tipos de token:

- **Conta inteira** (o padrão para tokens novos): vale para todos os números de WhatsApp da conta. Leads, negócios, empresas, notas e mensagens vêm de todos os números.
- **Um número**: vale só para um número. É o tipo dos tokens antigos, que continuam funcionando como sempre. Com ele, não envie `wpp_session`: o número vem do token.

Com o token da conta, as ações que acontecem **em um número** pedem `wpp_session` (na query ou no body):

| Rota                                                      | Por quê                                                                       |
| --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `POST /contacts/leads` (lead novo)                        | O lead nasce num número                                                       |
| `POST /contacts/organizations`                            | A empresa nasce num número (a busca de duplicada — id, CNPJ ou nome — é nele) |
| `POST /crm/deals` sem `lead_id`                           | O lead novo do negócio nasce num número                                       |
| `POST /conversions`                                       | A conversão cadastra o lead num número                                        |
| `POST /templates/send`                                    | O template sai de um número                                                   |
| `GET /templates/{id}` e `GET /templates?integration=waba` | O catálogo é do número                                                        |
| `GET /integrations/api4com`                               | O ramal é do número                                                           |

- Conta com **um número só**: não precisa enviar; ele é usado automaticamente.
- Conta com vários números e sem `wpp_session`: HTTP **400**, com a lista dos números válidos na mensagem.
- `wpp_session` que não é da conta: HTTP **403**. O mesmo vale para o filtro `wpp_sessions` das listas.

As rotas por id (lead, empresa, negócio) acham o registro em qualquer número da conta e seguem com o número dele. Leads e negócios trazem o campo `wpp_session` (o número deles) para você saber qual usar.

Use o token somente no backend da integração. Não coloque tokens `sbt_…` em frontend, aplicativo mobile distribuído, repositório público ou código entregue ao usuário final.

### Libere somente as permissões necessárias

Cada token tem permissões. Exemplos: `contacts:read`, `crm:read` e `deals:write`. Se faltar uma permissão, a API responde com HTTP **403**. As mensagens do lead têm permissão própria, `conversations:read`, que não vem junto com as de Contatos.

### O token vale o que o criador pode

Além das permissões do token, cada chamada confere o que **o usuário que criou o token** pode fazer no app, lido do cadastro dele a cada chamada. Tokens criados pelo responsável pela conta (ou pela equipe Sellbot) não mudam nada.

Para um usuário com acesso restrito (perfil de vendedor ou de time):

- **Módulos:** só lê e escreve nas áreas liberadas no cadastro (CRM, Base de leads, Empresas, Relatórios, Automações, Templates, Transmissões, Agentes, Integrações). Detalhe, mensagens, etiquetas e anotações do lead fazem parte da Central e valem para todos.
- **Operações:** criar, editar e excluir são liberados por módulo. `POST` de criação exige criar; `PATCH`, mover, status, etiquetar exigem editar; `DELETE` e mesclar exigem excluir.
- **Configuração do CRM** (motivos de perda, catálogo de etiquetas de negócio, campos personalizados): exige a permissão "Configurar o CRM".
- **Templates:** excluir exige "Gerenciar templates". Enviar template (`POST /templates/send`) exige criar na Central.
- **Exportar** leads ou empresas (`POST /contacts/leads/export`, `POST /contacts/organizations/export`): só o responsável pela conta.
- **Importar** planilha (`POST /imports`): exige criar na Base de leads.
- **Integrações por área** (desde 12/11/2026): dentro de Integrações, cada área tem criar, editar e excluir próprios — WhatsApp (`whatsapp`), Agenda (`calendar`), Formulários do site (`site_forms`), Conversões da Meta (`conversions`) e Api4Com (`api4com`). Criar e editar formulário do site (`POST /integrations/plugins`, `PATCH /integrations/plugins/{form_id}`) exigem criar e editar em Formulários do site; listar (`GET /integrations/plugins`) e a situação das integrações seguem só com o módulo Integrações. A área só vale com o módulo Integrações liberado. Usuário que já existia não muda: sem a entrada da área, vale o que ele tem em Integrações. Remarcar e cancelar reservas da própria agenda continuam livres.

Sem a permissão, a resposta é HTTP **403** com a mensagem do que falta, por exemplo `Seu usuário não pode excluir no CRM.`, `Seu usuário não pode acessar Automações.` ou `Seu usuário não pode criar em Formulários do site.` O 403 vem antes de qualquer mudança: nada é gravado. Para liberar, o responsável pela conta ajusta o usuário em **Configurações → Usuários** (ou por `PATCH /users/{user_id}`, campos `session_module_ops` — as áreas de Integrações têm entrada própria, como `{"integrations": ["edit"], "site_forms": ["create", "edit"]}` — e `session_sensitive_ops`).

### Entenda as respostas

- **Consultas (`GET`):** não envie body. Use os filtros da query quando precisar.
- **Escritas (`POST`, `PATCH`, `PUT`, `DELETE`):** envie JSON no body com apenas os campos indicados. Use `PATCH` ou `PUT` (equivalentes) para editar e `DELETE` no path do recurso para excluir.
- **Aliases legados:** algumas edições ainda aceitam `POST` no path do recurso (ex.: `POST /crm/deals/{deal_id}`) — prefira `PATCH`/`PUT`.
- **Erros:** todas as rotas retornam `{ "success": false, "error": "CODIGO", "code": "CODIGO", "message": "mensagem", "text": "mensagem" }`. Os pares `code`/`text` permanecem como aliases para integrações anteriores.
- **Paginação:** quase sempre `page` (começa em 1) e `limit`.
- **Rastreamento:** toda resposta inclui `X-Request-Id`, criado automaticamente. Guarde-o ao abrir um chamado.

### Falhas temporárias e novas tentativas

- Consultas `GET` podem ser tentadas até três vezes pela API quando o serviço responde com erro transitório (`408`, `429`, `502`, `503`, `504`), respeitando `Retry-After`.
- Operações de escrita têm uma única tentativa e nunca são repetidas automaticamente.
- Se uma escrita retornar `504`, consulte o recurso antes de repetir manualmente: o serviço remoto pode ter concluído a ação mesmo sem responder a tempo.
- O cliente não precisa criar nem enviar chave de idempotência.

### Campos personalizados

São campos extras configurados no painel Sellbot (ex.: segmento, origem, volume estimado).

**Como descobrir quais existem:** `GET /custom-fields?category=lead` (leads), `category=crm` (negócios) ou `category=organization` (empresas). Cada item traz `field_key` (chave para GET/consulta), `field_name` (alias legado), `sb_cf_title` (rótulo), `sb_cf_type` e `sb_cf_options` (quando for lista).

**Como enviar na escrita:**

| Onde                                            | Formato no body                                              |
| ----------------------------------------------- | ------------------------------------------------------------ |
| Lead (`POST /contacts/leads` e edit)            | Array `custom_fields` — cada item é `{ "<chave>": <valor> }` |
| Negócio (`POST /crm/deals` e edit)              | Array `custom_fields` — cada item é `{ "<chave>": <valor> }` |
| Empresa (`POST /contacts/organizations` e edit) | Array `custom_fields` — cada item é `{ "<chave>": <valor> }` |

**Formato do array (leads, negócios e empresas):**

```json
"custom_fields": [
  { "segmento": "PME" },
  { "canal_de_entrada": "Indicação" }
]
```

**Não use (qualquer entidade):**

- `{ "field_key": "segmento", "value": "PME" }` (formato antigo — `400`)
- `"segmento": "PME"` solto na raiz do body (use `custom_fields[]`)

**Na leitura (GET de detalhe):** `custom_fields` vem como **objeto** `{ "segmento": "PME" }` — as chaves são as mesmas de `GET /custom-fields` (`field_key`). Só a escrita usa o array. Campos sem valor vêm como `null`.

As listagens (`GET /contacts/leads`, `GET /contacts/organizations`, `GET /crm/deals`) **não** incluem `custom_fields`. Para ler os valores, use o GET por id.

Se o valor foi gravado com prefixo (`sb_cf_segmento`) e o catálogo usa `segmento`, o GET devolve a chave do catálogo (`segmento`).

**Dicas:**

- Envie só os campos que quer criar ou alterar.
- Em campos do tipo lista, use um valor de `sb_cf_options` (valor exato), não o rótulo traduzido.
- Para ver valores atuais: `GET /contacts/leads/{id}`, `GET /crm/deals/{id}` ou `GET /contacts/organizations/{id}` → objeto `custom_fields`.

---

## Busca

Uma busca só em leads, empresas, negócios e conversas, para quando você não sabe onde a pessoa ou o negócio está.

### `GET /search` — Buscar em tudo

**Explicação:** procura o termo nos quatro tipos e devolve resultados curtos. Para o detalhe, use a rota do tipo com o `id` retornado. Ignora acento e maiúsculas, e telefone funciona com ou sem DDI e nono dígito.

**Rota:** `GET https://api.sellbot.tech/v1/search`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Query:** `q` (obrigatório, de 2 a 100 caracteres), `types` (opcional: `leads`, `organizations`, `deals`, `conversations`, separados por vírgula) e `limit` (por tipo, de 1 a 20; padrão 5).

**Body:** não envie body nesta rota.

**Escopo:** cada tipo pede o escopo da lista dele: `contacts:read` para leads e empresas, `deals:read` ou `crm:read` para negócios, `conversations:read` para conversas. Tipo sem escopo volta em `unavailable`.

**Exemplo:**

```bash
curl -s 'https://api.sellbot.tech/v1/search?q=joao%20silva&types=leads,deals' \
  -H 'Authorization: Bearer sbt_SEU_TOKEN'
```

**Resposta (200):**

```json
{
  "query": "joao silva",
  "results": {
    "leads": [
      {
        "id": "b1c2",
        "name": "João Silva",
        "phone": "5541999991234",
        "email": null,
        "owner_name": "Ana"
      }
    ],
    "deals": []
  },
  "unavailable": []
}
```

Confira sempre `unavailable`: um tipo que falhou ou está fora do alcance aparece ali, com o motivo em `reason`, e os outros seguem normalmente.

---

# Conversas

## Central de conversas

As conversas de WhatsApp da conta, na ordem da mais recente. O alcance é o da Central: quem vê a conta alcança tudo, e o vendedor só as caixas dele. Para ler várias conversas de uma vez, peça `GET /conversations` com `messages`: cada conversa vem com as últimas mensagens dela. Para uma conversa inteira, `GET /contacts/leads/{lead_id}/messages`. A fila de conversas diz quem espera resposta agora, como a **Fila Agora** da Central (o endereço antigo, `/work-lists/conversation-queue`, continua respondendo).

### `GET /conversations` — Listar conversas

**Explicação:** lista as conversas em aberto, com a última mensagem, o responsável, o número e o lead ligado. Use `waiting=true` para ver quem espera resposta. Com `messages`, cada conversa traz também as últimas mensagens dela, para ler várias de uma vez. Para ler uma conversa inteira, use `GET /contacts/leads/{lead_id}/messages` com o `lead_id` retornado.

**Rota:** `GET https://api.sellbot.tech/v1/conversations`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Query (opcional):** `status` (`open`, `pending`, `snoozed`, `resolved`, separados por vírgula; padrão `open,pending`), `assignee` (`me`, `unassigned` ou `any`; padrão `any`), `waiting` (`true` para só as que esperam resposta), `wpp_session` (só as de um número), `lead_id` (só as conversas deste lead; lead fora do seu alcance responde `404`), `limit` (de 1 a 50; padrão 20), `page` (padrão 1) e `messages` (de 1 a 50: as últimas mensagens de cada conversa; com ele, a página traz no máximo 20 conversas, e `limit` maior é cortado em 20).

**Body:** não envie body nesta rota.

**Escopo:** `conversations:read`

**Exemplo:**

**Filtro de inatividade:** `last_activity_before=AAAA-MM-DD` traz só as conversas sem atividade desde essa data. É o filtro das limpezas em massa.

```bash
curl -s 'https://api.sellbot.tech/v1/conversations?waiting=true&assignee=me' \
  -H 'Authorization: Bearer sbt_SEU_TOKEN'
```

**Resposta (200):**

```json
{
  "conversations": [
    {
      "id": 628,
      "contact_name": "João Silva",
      "phone": "+5541999991234",
      "inbox": "Vendas",
      "status": "open",
      "assignee_name": "Ana",
      "labels": ["quente"],
      "waiting_since": "2026-11-05T11:40:00.000Z",
      "last_activity_at": "2026-11-05T11:40:00.000Z",
      "last_message": {
        "direction": "incoming",
        "text": "Consegue me mandar o orçamento?",
        "at": "2026-11-05T11:40:00.000Z"
      },
      "lead_id": "b1c2",
      "wpp_session": "loja_centro"
    }
  ],
  "page": 1,
  "has_more": false
}
```

`waiting_since` indica desde quando o cliente espera resposta; `null` quando não espera. `last_message.direction` é `incoming` (cliente) ou `outgoing` (atendimento). Nota privada não entra.

**Com `messages=20`:** cada conversa ganha `messages`, as últimas mensagens dela no número da conversa, na ordem em que aconteceram, e `messages_has_more`, se há mensagens mais antigas. Cada mensagem vem em formato curto: `timestamp`, `from` (`lead`, `ai`, `user`, `automation`, `device` ou `unknown`), `name` (o atendente), `type` e `text` (texto, legenda ou transcrição do áudio, cortado em 600 caracteres; mídia sem texto vira `[image]`, `[document]`…). Sem link de mídia: para isso, use a rota de mensagens do lead. Conversa sem lead, ou com lead fora do alcance do token, vem com `messages: null`.

```json
"messages": [
  { "timestamp": "2026-11-05T11:39:10.000Z", "from": "lead", "name": null, "type": "text", "text": "Quanto custa o plano anual?" },
  { "timestamp": "2026-11-05T11:39:40.000Z", "from": "ai", "name": null, "type": "text", "text": "O anual sai por R$ 1.188." }
],
"messages_has_more": true
```

### `GET /contacts/leads/{lead_id}/messages` — Listar mensagens do lead

Com token `sbt_…`, vale o alcance de quem criou o token: registro de outra pessoa, para quem só vê o que é seu, responde `404`.

**Explicação:** lista as mensagens de WhatsApp trocadas com o lead, da mais recente para a mais antiga. Com o token da conta, vêm as conversas de todos os números (cada mensagem diz o seu em `wpp_session`); com o token de um número, só as daquele número.

**Rota:** `GET https://api.sellbot.tech/v1/contacts/leads/{lead_id}/messages`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** não envie body nesta rota.

**Escopo:** `conversations:read`. Esta permissão não vem com `contacts:read` nem com `contacts:write`: marque **Conversas · Leitura** no token.

**Query:**

| Campo    | Descrição                                                                 |
| -------- | ------------------------------------------------------------------------- |
| `limit`  | Mensagens por página, de 1 a 100. Padrão: 50                              |
| `cursor` | O `next_cursor` da página anterior. Na primeira página, não envie o campo |

**Resposta:** `lead_id`, `messages[]`, `has_more`, `next_cursor`

| Campo em `messages[]` | Descrição                                                                                                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                  | Identificador da mensagem                                                                                                                                                                      |
| `timestamp`           | Data e hora em UTC (ISO 8601)                                                                                                                                                                  |
| `direction`           | `incoming` (o lead enviou) ou `outgoing` (sua empresa enviou)                                                                                                                                  |
| `type`                | `text`, `audio`, `image`, `video`, `document`, `sticker`, `reaction`, `contact`, `location`, `button_reply` (clique em botão), `interactive` (mensagem com botões ou lista), `poll` ou `other` |
| `text`                | O texto da mensagem, o rótulo do botão clicado ou a legenda de imagem, vídeo e documento                                                                                                       |
| `sender.type`         | `lead`, `ai` (agente de IA), `user` (alguém da equipe), `device` (celular ou WhatsApp Web), `automation` ou `unknown`                                                                          |
| `sender.user_id`      | Usuário da equipe que enviou, quando registrado                                                                                                                                                |
| `sender.name`         | Nome desse usuário                                                                                                                                                                             |
| `wpp_session`         | Número (sessão) da conversa em que a mensagem foi trocada                                                                                                                                      |
| `transcription`       | Áudio: o texto falado (transcrição automática). `null` quando não há                                                                                                                           |
| `media`               | Arquivo da mensagem (áudio, imagem, vídeo, documento): `url` (link fixo, não expira), `mime_type` e `file_name`. `null` quando não há                                                          |

**Paginação:** enquanto `has_more` for `true`, chame de novo passando `cursor` com o `next_cursor` recebido. O cursor não pula nem repete mensagens quando chegam mensagens novas entre as chamadas.

**Exemplo de resposta:**

```json
{
  "lead_id": "6ad01d3e2e6eb822a7c9955e",
  "messages": [
    {
      "id": "3175390",
      "timestamp": "2026-10-22T14:21:21.000Z",
      "direction": "incoming",
      "type": "button_reply",
      "text": "Sim, quero saber",
      "sender": { "type": "lead", "user_id": null, "name": null },
      "wpp_session": "loja_centro",
      "transcription": null,
      "media": null
    }
  ],
  "has_more": true,
  "next_cursor": "2026-10-22T14:21:21.000000Z|3175390"
}
```

**Limites:**

- Mídia (áudio, imagem, vídeo, documento), figurinha e reação vêm só com o `type`: o arquivo, a legenda, a transcrição e o emoji não estão disponíveis.
- O histórico começa em 27/11/2025. Mensagens anteriores não estão disponíveis.

**Erros:** `404 LEAD_NOT_FOUND` quando o lead não existe na sessão do token. `403` quando o token não tem `conversations:read`.

**Mídia:** transcrição, legenda e arquivo existem para mensagens recebidas a partir de 24/10/2026. Mensagens anteriores podem vir com esses campos `null`.

### `POST /conversations/{conversation_id}/assign` — Atribuir conversa

Atribui como a Central: avisa a pessoa e leva o dono ao lead e aos negócios.

**Rota:** `POST https://api.sellbot.tech/v1/conversations/{conversation_id}/assign`

**Escopo:** `conversations:write`

**Corpo:** `assignee_user_id` (obrigatório): usuário da conta.

```bash
curl -s -X POST 'https://api.sellbot.tech/v1/conversations/168/assign' \
  -H 'Authorization: Bearer sbt_...' \
  -H 'Content-Type: application/json' \
  -d '{ "assignee_user_id": "id-do-usuario" }'
```

**Erros:** `404` quando a conversa está fora do alcance do token. `403` sem `conversations:write`.

### `POST /conversations/{conversation_id}/status` — Mudar situação da conversa

Abre, resolve, deixa pendente ou adia. Sem `snoozed_until`, a conversa adiada volta na próxima mensagem do cliente. Resolver em caixa com pesquisa de satisfação ligada envia a pesquisa ao cliente.

**Rota:** `POST https://api.sellbot.tech/v1/conversations/{conversation_id}/status`

**Escopo:** `conversations:write`

**Corpo:** `status` (obrigatório): `open`, `resolved`, `pending` ou `snoozed`. `snoozed_until`: data, ao adiar.

```bash
curl -s -X POST 'https://api.sellbot.tech/v1/conversations/168/status' \
  -H 'Authorization: Bearer sbt_...' \
  -H 'Content-Type: application/json' \
  -d '{ "status": "snoozed", "snoozed_until": "2026-12-01T12:00:00Z" }'
```

**Erros:** `404` quando a conversa está fora do alcance do token. `403` sem `conversations:write`.

### `POST /conversations/{conversation_id}/labels` — Etiquetar conversa

Adiciona ou remove uma etiqueta já cadastrada. Vale também para o lead da conversa.

**Rota:** `POST https://api.sellbot.tech/v1/conversations/{conversation_id}/labels`

**Escopo:** `conversations:write`

**Corpo:** `add` ou `remove`, um de cada vez.

```bash
curl -s -X POST 'https://api.sellbot.tech/v1/conversations/168/labels' \
  -H 'Authorization: Bearer sbt_...' \
  -H 'Content-Type: application/json' \
  -d '{ "add": "quente" }'
```

**Erros:** `404` quando a conversa está fora do alcance do token. `403` sem `conversations:write`.

### `POST /conversations/{conversation_id}/notes` — Adicionar nota interna à conversa

Grava uma nota visível só para a equipe. O cliente não recebe.

**Rota:** `POST https://api.sellbot.tech/v1/conversations/{conversation_id}/notes`

**Escopo:** `conversations:write`

**Corpo:** `content` (obrigatório): até 4.000 caracteres.

```bash
curl -s -X POST 'https://api.sellbot.tech/v1/conversations/168/notes' \
  -H 'Authorization: Bearer sbt_...' \
  -H 'Content-Type: application/json' \
  -d '{ "content": "Cliente pediu retorno na segunda." }'
```

**Erros:** `404` quando a conversa está fora do alcance do token. `403` sem `conversations:write`.

### `GET /conversations/queue` — Fila de conversas

**Explicação:** quem espera resposta há até 7 dias, com negócio aberto primeiro e o mais avançado antes. Para ler a conversa, use `GET /contacts/leads/{lead_id}/messages`.

**Rota:** `GET https://api.sellbot.tech/v1/conversations/queue`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Query:** `assignee` (`me`, `unassigned` ou `any`; padrão `any`), `wpp_session`, `limit` (de 1 a 50; padrão 20) e `page`.

**Escopo:** `conversations:read`. Sem `deals:read` ou `crm:read`, os negócios não aparecem e `unavailable` traz `deals`.

**Exemplo:**

**Totais:** a fila olha só quem espera há até 7 dias (`window_days`). `waiting_total` é o total esperando de qualquer data, o mesmo número do card "Precisam de resposta" da Central, e `waiting_older` quantas esperam há mais de 7 dias.

```bash
curl -s 'https://api.sellbot.tech/v1/conversations/queue?assignee=me' \
  -H 'Authorization: Bearer sbt_SEU_TOKEN'
```

**Resposta 200:**

```json
{
  "conversations": [
    {
      "id": 4821,
      "contact_name": "João",
      "status": "open",
      "waiting_since": "2026-11-05T12:00:00.000Z",
      "lead_id": "lead_9",
      "deal": {
        "id": "deal_123",
        "title": "Plano anual",
        "value": 1500,
        "pipeline_name": "Vendas",
        "stage_name": "Proposta"
      },
      "reasons": [
        { "code": "waiting_reply", "label": "Cliente esperando resposta" },
        { "code": "open_deal", "label": "Negócio aberto em Proposta" },
        { "code": "late_stage", "label": "Negócio na reta final do funil" },
        { "code": "deal_value", "label": "Negócio de R$ 1.500,00" }
      ]
    }
  ],
  "total": 1,
  "page": 1,
  "has_more": false,
  "truncated": false,
  "unavailable": []
}
```

As conversas trazem os mesmos campos de `GET /conversations`, mais `deal` e `reasons`.

**Erros das listas:** `400` para filtro inválido, `403` para token sem o escopo ou número fora da conta, e `503` quando o banco de conversas está fora, em `conversation-queue`.

---

# CRM

## CRM — Negócios

Negócios do CRM, e duas listas prontas para decidir o que fazer agora: os negócios parados e a fila de negócios, na ordem dos critérios de prioridade da conta. Cada item das listas traz o motivo em `reasons`. Os endereços antigos, `/work-lists/stalled-deals` e `/work-lists/deal-queue`, continuam respondendo.

### `GET /crm/deals` — Listar negócios

**Explicação:** lista os negócios do CRM. Use os filtros para consultar um pipeline, uma etapa, um responsável ou um período.

**Rota:** `GET https://api.sellbot.tech/v1/crm/deals`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** não envie body nesta rota.

**Escopo:** `deals:read` ou `crm:read`

**Query úteis:** `pipeline_id` (obrigatório na prática), `page`, `limit`, `stage_id`, `status`, `owner_id`, `s` (busca), `tags`, `date_from`, `date_to`

**Cada item em `deals[]`:**

| Campo                                                                                                                                        | Descrição                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `deal_id`                                                                                                                                    | ID do negócio                                                                               |
| `lead_id`                                                                                                                                    | Lead vinculado                                                                              |
| `deal_status`                                                                                                                                | `open`, `won`, `lost`                                                                       |
| `deal_title`                                                                                                                                 | Título                                                                                      |
| `deal_value`                                                                                                                                 | Valor numérico                                                                              |
| `lead_name`, `lead_phone`                                                                                                                    | Dados do lead                                                                               |
| `deal_pipeline_id`, `deal_stage_id`                                                                                                          | Pipeline e etapa                                                                            |
| `deal_probability`                                                                                                                           | Probabilidade (%)                                                                           |
| `deal_expected_close_date`                                                                                                                   | Previsão de fechamento                                                                      |
| `deal_owner_id`, `deal_owner_name`                                                                                                           | Responsável                                                                                 |
| `deal_visibility`                                                                                                                            | Visibilidade                                                                                |
| `deal_description`                                                                                                                           | Descrição                                                                                   |
| `deal_source_channel`                                                                                                                        | Canal de origem                                                                             |
| `org_id`, `org_name`                                                                                                                         | Empresa                                                                                     |
| `deal_products`                                                                                                                              | Produtos na proposta                                                                        |
| `deal_tags`                                                                                                                                  | Tags                                                                                        |
| `deal_date_added`, `deal_date_updated`                                                                                                       | Datas                                                                                       |
| `deal_date_closed`                                                                                                                           | Data de fechamento (ganho ou perda)                                                         |
| `deal_date_won`, `deal_date_lost`                                                                                                            | Data do ganho / da perda                                                                    |
| `deal_lost_reason`                                                                                                                           | Motivo da perda (o rótulo, como aparece no CRM)                                             |
| `deal_lost_description`                                                                                                                      | O que aconteceu, escrito ao marcar a perda                                                  |
| `utm_*`, `meta_campaign`, `lead_campaign`                                                                                                    | Atribuição                                                                                  |
| `meta_campaign_id`, `meta_campaign_name`, `meta_adset_id`, `meta_adset_name`, `meta_ad_id`, `meta_ad_name`, `meta_form_id`, `meta_form_name` | Origem Meta Lead Ads do lead do negócio (IDs e nomes). Também no `GET /crm/deals/{deal_id}` |
| `pending_activities`                                                                                                                         | Atividades pendentes (resumo)                                                               |

**Conversa:** `conversation_id` é o número da conversa do lead na Central quando o negócio foi criado (o mesmo `id` de `GET /conversations`). Para a conversa atual do lead, use `GET /contacts/leads/{lead_id}`.

**Produto em `deal_products[]`:** `product_id`, `product_name`, `product_code`, `quantity`, `unit_price`, `subtotal`, `total`, `currency`

Campos personalizados **não** entram nesta listagem. Use `GET /crm/deals/{deal_id}` → `custom_fields`.

### `GET /crm/deals/{deal_id}` — Detalhe do negócio

Com token `sbt_…`, vale o alcance de quem criou o token: registro de outra pessoa, para quem só vê o que é seu, responde `404`.

**Explicação:** retorna o negócio completo, com atividades, empresa, pipeline, campos personalizados e linha do tempo.

**Rota:** `GET https://api.sellbot.tech/v1/crm/deals/{deal_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** não envie body nesta rota.

**Escopo:** `deals:read` ou `crm:read`

**Resposta:**

| Campo           | Descrição                                                                                |
| --------------- | ---------------------------------------------------------------------------------------- |
| `deal`          | Negócio completo (campos acima)                                                          |
| `activities`    | Atividades vinculadas (mesmo contrato de `GET /crm/activities`, com horário e reunião)   |
| `custom_fields` | Campos personalizados do tenant (`field_key` → valor)                                    |
| `organization`  | Empresa                                                                                  |
| `pipeline`      | Pipeline e etapas (`pipeline_id`, `pipeline_name`, `pipeline_stages[]`)                  |
| `timeline`      | Linha do tempo — `created_at`, `current_stage`, `stages[]`, `total_days`, `events_count` |
| `owner_history` | Passagens de responsável — `first_owner` e `changes[]` (veja abaixo)                     |

**Exemplo de `custom_fields`:**

```json
{
  "custom_fields": {
    "canal_de_entrada": "Indicação",
    "sb_form_volume_estimado": 150000
  }
}
```

**Passagens de responsável (`owner_history`):** quem estava com o negócio quando ele nasceu e cada troca de responsável depois disso. É o mesmo dado da seção "Passagens" do negócio no CRM. Registrado desde 30/09/2026; nos negócios mais antigos, o responsável inicial vem de antes da primeira troca registrada (`inferred: true`).

| Campo                                        | Descrição                                                 |
| -------------------------------------------- | --------------------------------------------------------- |
| `first_owner.id`, `first_owner.name`         | Responsável inicial                                       |
| `first_owner.inferred`                       | `true` quando deduzido (negócio anterior a 30/09/2026)    |
| `changes[].at`                               | Quando a troca aconteceu (ISO)                            |
| `changes[].from_owner_id`, `from_owner_name` | Responsável antes                                         |
| `changes[].to_owner_id`, `to_owner_name`     | Responsável depois                                        |
| `changes[].source`                           | Como trocou: `user`, `automation`, `ai`, `lead`, `system` |
| `changes[].actor_id`, `actor_name`           | Quem fez a troca (quando foi uma pessoa)                  |
| `changes[].stage_id`, `stage_name`           | Etapa do negócio no momento da troca                      |

Para achar o último SDR antes do closer, por exemplo: a última troca em `changes[]` cujo `to_owner_id` é o closer traz o SDR em `from_owner_id`.

```json
{
  "owner_history": {
    "first_owner": { "id": "u_sdr", "name": "Ana", "inferred": false },
    "changes": [
      {
        "at": "2026-10-03T14:00:00.000Z",
        "from_owner_id": "u_sdr",
        "from_owner_name": "Ana",
        "to_owner_id": "u_closer",
        "to_owner_name": "Bruno",
        "source": "user",
        "actor_id": "u_sdr",
        "actor_name": "Ana",
        "stage_id": "st_reuniao",
        "stage_name": "Reunião agendada"
      }
    ]
  }
}
```

### `POST /crm/deals` — Criar negócio

**Explicação:** cria um negócio em uma etapa do CRM. Vincule um lead existente ou use `is_new_lead` para criar o lead na mesma chamada.

**Rota:** `POST https://api.sellbot.tech/v1/crm/deals`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `deals:write` ou `crm:write`

**Body (campos usuais):**

| Campo                           | Descrição                                                                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `deal_pipeline_id`              | Pipeline (funil) — obrigatório                                                                                               |
| `deal_stage_id`                 | Etapa inicial — obrigatório                                                                                                  |
| `lead_id`                       | Lead existente; use este campo ou `is_new_lead`                                                                              |
| `is_new_lead` / `new_lead_data` | Cria o lead na mesma chamada quando não houver `lead_id`                                                                     |
| `deal_title`                    | Título — obrigatório                                                                                                         |
| `deal_value`                    | Valor                                                                                                                        |
| `deal_owner_id`                 | Responsável — obrigatório                                                                                                    |
| `deal_visibility`               | Visibilidade (`all`, `team`, `owner`)                                                                                        |
| `deal_products`                 | Array de produtos na proposta                                                                                                |
| `deal_tags`                     | Tags (IDs)                                                                                                                   |
| `custom_fields`                 | Campos personalizados — array `[{ "<chave>": <valor> }]` — ver [Campos personalizados](#configuracoes-campos-personalizados) |
| `deal_description`              | Descrição                                                                                                                    |
| `deal_probability`              | Probabilidade (%)                                                                                                            |
| `deal_expected_close_date`      | Data prevista (ISO ou `YYYY-MM-DD`)                                                                                          |
| `deal_date_added`               | Data de criação original, para migração — ver abaixo. Sem ela, o negócio nasce na data da chamada                            |

**Resposta 200:** objeto com `deal_id` e dados do negócio criado.

**Data de criação na migração (`deal_date_added`):** ao trazer negócios de outro CRM, envie a data em que cada um foi criado lá. Ela passa a ser a data de criação do negócio na Sellbot: entra no filtro e na ordenação por data de criação do CRM, nos relatórios ("negócios criados" no período) e no histórico do negócio.

- Formato ISO 8601: só a data (`"2024-05-20"`) ou data e hora **com fuso** (`"2024-05-20T14:30:00-03:00"` ou `"2024-05-20T17:30:00Z"`). Hora sem fuso é recusada. Só a data vale como o dia inteiro (gravada às 09:00 de Brasília).
- Não pode estar no futuro (há folga de alguns minutos para diferença de relógio) nem ser anterior a 01/01/2000.
- Data fora dessas regras: `400` com a mensagem do motivo, e o negócio não é criado.
- O negócio criado com a data original guarda também quando entrou de fato na Sellbot, em `deal_date_imported`.
- Para negócios que já foram ganhos ou perdidos no outro CRM, use depois `POST /crm/deals/{deal_id}/status` com `deal_date_closed`, que guarda a data do fechamento.

**Exemplo com campos personalizados:**

```json
{
  "lead_id": "6a32177605cc37fab3b3b357",
  "deal_title": "Proposta PME",
  "deal_pipeline_id": "{pipeline_id}",
  "deal_stage_id": "{stage_id}",
  "deal_owner_id": "{owner_id}",
  "custom_fields": [{ "segmento": "PME" }]
}
```

### `PATCH /crm/deals/{deal_id}` — Editar negócio

**Explicação:** atualiza os dados do negócio. Para ganhar, perder, reabrir, mover de etapa ou excluir, use as rotas específicas abaixo.

**Rota:** `PATCH https://api.sellbot.tech/v1/crm/deals/{deal_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `deals:write` ou `crm:write`

**Body:** envie só o que mudou.

| Campo                      | Descrição                                |
| -------------------------- | ---------------------------------------- |
| `deal_title`               | Título                                   |
| `deal_value`               | Valor total                              |
| `deal_owner_id`            | Responsável                              |
| `deal_visibility`          | `all`, `team` ou `owner`                 |
| `deal_team_id`             | Time (quando visibilidade = `team`)      |
| `deal_description`         | Descrição                                |
| `deal_probability`         | Probabilidade %                          |
| `deal_expected_close_date` | Previsão de fechamento                   |
| `deal_products`            | Lista de produtos (ver estrutura no GET) |
| `deal_tags`                | Array de IDs de tags                     |
| `org_id`                   | Empresa vinculada                        |
| `custom_fields`            | Campos personalizados CRM — ver abaixo   |

A data de criação (`deal_date_added`) não muda depois que o negócio existe: ela só é aceita na criação.

**Campos personalizados no negócio** — array na raiz do body:

```json
{
  "deal_title": "Proposta revisada",
  "deal_value": 18000,
  "custom_fields": [{ "canal_de_entrada": "Indicação" }, { "sb_form_volume_estimado": 150000 }]
}
```

Chaves válidas: `GET /custom-fields?category=crm` ou valores atuais em `GET /crm/deals/{deal_id}` → `custom_fields`.

**Resposta 200:** confirmação com `deal_id` e dados atualizados.

**Erros:** `404` negócio inexistente · `400` validação de campos

### `POST /crm/deals/{deal_id}/lead` — Trocar o lead do negócio

**Explicação:** põe outro lead no negócio. Atividades, notas e automações do negócio vão junto para o novo lead, como na tela. Se a conta usa um negócio por lead e o novo lead já tem um negócio aberto, a troca é recusada: junte os negócios.

**Rota:** `POST https://api.sellbot.tech/v1/crm/deals/{deal_id}/lead`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `deals:write` ou `crm:write`

**Body:**

| Campo              | Descrição                                                     |
| ------------------ | ------------------------------------------------------------- |
| `lead_id`          | ID do novo lead — obrigatório                                 |
| `lead_wpp_session` | Número onde o lead está, se souber; sem ele, procura em todos |

```json
{ "lead_id": "{lead_id}" }
```

**Resposta 200:** `deal_id`, `lead_id`, `previous_lead_id`, `org_changed`, `activities_moved` e `automations_updated`.

**Erros:** `404` negócio ou lead inexistente · `400` o negócio já está com esse lead · `409` o lead já tem negócio aberto e a conta usa um por lead

### `POST /crm/deals/merge` — Mesclar negócios duplicados

**Explicação:** junta o duplicado no principal e exclui o duplicado. Atividades e notas vão para o principal, valores e produtos somam, etiquetas se juntam e campos vazios do principal recebem os do duplicado. Os dois negócios precisam estar no mesmo número.

**Rota:** `POST https://api.sellbot.tech/v1/crm/deals/merge`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `deals:write` ou `crm:write`

**Body:**

| Campo              | Descrição                        |
| ------------------ | -------------------------------- |
| `survivor_deal_id` | Negócio que fica — obrigatório   |
| `source_deal_id`   | Duplicado que some — obrigatório |

```json
{ "survivor_deal_id": "{deal_id}", "source_deal_id": "{deal_id_duplicado}" }
```

**Resposta 200:** `{ "success": true, "data": { "survivor_deal_id", "source_deal_id", "source_deal_title" } }`.

**Erros:** `400` com `error` em `SAME_DEAL`, `SESSION_MISMATCH`, `SOURCE_ALREADY_MERGED`, `SURVIVOR_NOT_FOUND` ou `SOURCE_NOT_FOUND` · `404` negócio fora do alcance do token

### `POST /crm/deals/{deal_id}/products` — Adicionar produtos ao negócio

**Explicação:** põe produtos do catálogo no negócio. Manda só o que entra: as linhas que já estavam ficam. Nome, código, preço e moeda saem do catálogo quando não vierem. Desconto e imposto são em porcentagem, como na tela. Por padrão, o valor do negócio passa a ser a soma dos produtos.

**Rota:** `POST https://api.sellbot.tech/v1/crm/deals/{deal_id}/products`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `deals:write` ou `crm:write`

**Body:**

| Campo                   | Descrição                                                     |
| ----------------------- | ------------------------------------------------------------- |
| `products`              | Lista de 1 a 50 linhas — obrigatório                          |
| `products[].product_id` | ID do produto no catálogo — obrigatório                       |
| `products[].quantity`   | Quantidade; padrão 1                                          |
| `products[].unit_price` | Preço unitário; padrão, o preço do catálogo                   |
| `products[].discount`   | Desconto em porcentagem, de 0 a 100                           |
| `products[].tax`        | Imposto em porcentagem                                        |
| `products[].notes`      | Observação da linha                                           |
| `update_value`          | `false` mantém o valor atual do negócio; padrão `true` (soma) |

```json
{
  "products": [{ "product_id": "{product_id}", "quantity": 2, "discount": 10 }]
}
```

**Resposta 200:** `deal_id`, `deal_value` e a lista `deal_products` como ficou.

**Erros:** `404` negócio ou produto inexistente · `400` validação de campos

### `POST /crm/deals/{deal_id}/products/{product_id}/remove` — Remover produto do negócio

**Explicação:** tira do negócio todas as linhas deste produto. As outras ficam. Por padrão, o valor do negócio passa a ser a soma dos produtos que sobraram.

**Rota:** `POST https://api.sellbot.tech/v1/crm/deals/{deal_id}/products/{product_id}/remove`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `deals:write` ou `crm:write`

**Body:**

| Campo          | Descrição                                                     |
| -------------- | ------------------------------------------------------------- |
| `update_value` | `false` mantém o valor atual do negócio; padrão `true` (soma) |

```json
{}
```

**Resposta 200:** `deal_id`, `deal_value` e a lista `deal_products` como ficou.

**Erros:** `404` negócio inexistente ou produto que não está no negócio

### `POST /crm/deals/{deal_id}/move` — Mover de etapa

**Explicação:** move um negócio identificado pelo ID para outra etapa e, opcionalmente, para outro pipeline.

**Rota:** `POST https://api.sellbot.tech/v1/crm/deals/{deal_id}/move`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `deals:write` ou `crm:write`

**Body:**

| Campo                | Descrição                                           |
| -------------------- | --------------------------------------------------- |
| `target_stage_id`    | ID da etapa de destino — obrigatório                |
| `target_pipeline_id` | ID do pipeline de destino, se também mudar de funil |

```json
{
  "target_stage_id": "{stage_id}",
  "target_pipeline_id": "{pipeline_id}"
}
```

**Resposta 200:** confirmação da movimentação.

### `POST /crm/deals/{deal_id}/status` — Atualizar status

**Explicação:** marca o negócio como ganho ou perdido, ou reabre um negócio fechado.

**Rota:** `POST https://api.sellbot.tech/v1/crm/deals/{deal_id}/status`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `deals:write` ou `crm:write`

**Body:**

| Campo              | Descrição                                               |
| ------------------ | ------------------------------------------------------- |
| `status`           | `open`, `won` ou `lost`                                 |
| `lost_reason`      | Motivo da perda; obrigatório quando `status` for `lost` |
| `deal_date_closed` | Data de fechamento em formato ISO; opcional             |

```json
{
  "status": "won"
}
```

**Resposta 200:** confirmação.

### `DELETE /crm/deals/{deal_id}` — Excluir negócio

**Explicação:** exclui o negócio. Confirme o ID antes de chamar esta rota.

**Rota:** `DELETE https://api.sellbot.tech/v1/crm/deals/{deal_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `deals:write` ou `crm:write`

**Body:** `{}`

**Resposta 200:** confirmação de exclusão.

### `POST /crm/deals/move-by-lead` — Mover negócio por lead

**Explicação:** localiza o negócio aberto de um lead e o move usando a chave da etapa. Use esta rota quando sua integração conhece o `lead_id`, mas não o `deal_id`.

**Rota:** `POST https://api.sellbot.tech/v1/crm/deals/move-by-lead`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `deals:write` ou `crm:write`

**Body:**

| Campo                | Descrição                                                                       |
| -------------------- | ------------------------------------------------------------------------------- |
| `lead_id`            | ID do lead — obrigatório                                                        |
| `stage_key`          | Chave da etapa, como `opportunity`, `converted` ou `started_flow` — obrigatória |
| `target_pipeline_id` | Restringe a busca a um pipeline; opcional                                       |

```json
{
  "lead_id": "6a32177605cc37fab3b3b357",
  "stage_key": "opportunity"
}
```

**Resposta 200:** confirmação.

### `GET /crm/deals/stalled` — Negócios estagnados

**Explicação:** negócios abertos há mais dias na etapa do que o limite daquela etapa, configurado em Funis. Etapa sem limite nunca estagna. Olhe `coverage`: lista vazia com `stages_with_limit: 0` quer dizer que o limite não foi configurado, e não que está tudo em dia.

**Rota:** `GET https://api.sellbot.tech/v1/crm/deals/stalled`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Query:** `owner` (`me` ou `any`; padrão `any`), `pipeline_id`, `wpp_session`, `limit` (de 1 a 50; padrão 20) e `page`.

**Escopo:** `deals:read` ou `crm:read`

**Exemplo:**

```bash
curl -s 'https://api.sellbot.tech/v1/crm/deals/stalled?owner=me' \
  -H 'Authorization: Bearer sbt_SEU_TOKEN'
```

**Resposta 200:**

```json
{
  "deals": [
    {
      "id": "deal_123",
      "title": "Plano anual",
      "value": 1500,
      "pipeline_id": "pipe_1",
      "pipeline_name": "Vendas",
      "stage_id": "stage_2",
      "stage_name": "Proposta",
      "owner_name": "Ana",
      "lead_id": "lead_9",
      "lead_name": "João",
      "org_name": null,
      "days_in_stage": 12,
      "stage_entered_at": "2026-10-24T13:00:00.000Z",
      "stage_limit_days": 7,
      "days_over_limit": 5
    }
  ],
  "total": 1,
  "page": 1,
  "has_more": false,
  "truncated": false,
  "coverage": {
    "open_stages": 5,
    "stages_with_limit": 3,
    "open_deals": 137,
    "deals_in_stages_with_limit": 134
  }
}
```

`truncated: true` quer dizer que a conta passou do teto de negócios avaliados e a lista é parcial.

### `GET /crm/deals/queue` — Fila de negócios

**Explicação:** negócios abertos com algum motivo para agir agora, do mais quente ao mais frio: cliente esperando resposta, atividade para hoje, atividade atrasada e previsão de fechar em 7 dias. Negócio sem nenhum motivo fica fora, mesmo estagnado: esses estão em `GET /crm/deals/stalled`.

**Rota:** `GET https://api.sellbot.tech/v1/crm/deals/queue`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Query:** a mesma de `GET /crm/deals/stalled`.

**Escopo:** `deals:read` ou `crm:read`. Sem `conversations:read`, o motivo "cliente esperando" não aparece e `unavailable` traz `conversations`.

**Exemplo:**

```bash
curl -s 'https://api.sellbot.tech/v1/crm/deals/queue?owner=me&limit=10' \
  -H 'Authorization: Bearer sbt_SEU_TOKEN'
```

**Resposta 200:**

```json
{
  "deals": [
    {
      "id": "deal_123",
      "title": "Plano anual",
      "stage_name": "Proposta",
      "days_in_stage": 12,
      "stage_limit_days": 7,
      "reasons": [{ "code": "customer_waiting", "label": "Cliente esperando resposta" }]
    }
  ],
  "total": 1,
  "page": 1,
  "has_more": false,
  "truncated": false,
  "unavailable": [],
  "deals_evaluated": 137,
  "priority_criteria": "Indicação vale mais que formulário."
}
```

`priority_criteria` é o texto que a conta definiu como prioridade, ou `null`. A API não o aplica: ordene por ele na sua aplicação. A fila de conversas traz o mesmo campo.

Os negócios trazem os campos de `GET /crm/deals/stalled`, menos `stage_entered_at` e `days_over_limit`. `code` pode ser `customer_waiting`, `activity_today`, `overdue_activity` ou `closing_soon`.

---

## CRM — Atividades

Atividades, os tipos de atividade, as anotações de cada uma e os horários ocupados na agenda de uma pessoa.

### `GET /crm/activities` — Listar atividades

**Explicação:** lista tarefas, ligações, reuniões e outras atividades do CRM.

**Rota:** `GET https://api.sellbot.tech/v1/crm/activities`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** não envie body nesta rota.

**Escopo:** `crm:read`

**Query:**

| Parâmetro         | Padrão / valores                    | Descrição                                                                  |
| ----------------- | ----------------------------------- | -------------------------------------------------------------------------- |
| `page`            | `1`                                 | Página                                                                     |
| `limit`           | `25` (máx. `5000`)                  | Itens por página                                                           |
| `search`          | —                                   | Assunto, nome do lead ou título do negócio                                 |
| `type`            | —                                   | `task`, `call`, `meeting`, `email`, `whatsapp`, `follow_up`, `contract`    |
| `category`        | —                                   | Slug da categoria (`activity_category`)                                    |
| `status`          | `pending`                           | `pending`, `completed`, `cancelled`, `all`                                 |
| `priority`        | —                                   | `low`, `normal`, `high`                                                    |
| `owner_id`        | —                                   | Responsável                                                                |
| `owner_ids`       | CSV                                 | Vários responsáveis                                                        |
| `deal_id`         | —                                   | Filtra pelo negócio                                                        |
| `lead_id`         | —                                   | Filtra pelo lead                                                           |
| `date_filter`     | —                                   | `overdue`, `today`, `tomorrow`, `this_week`                                |
| `date_from`       | —                                   | Início do intervalo (`YYYY-MM-DD`)                                         |
| `date_to`         | —                                   | Fim do intervalo (`YYYY-MM-DD`)                                            |
| `sort_by`         | `due_date`                          | `due_date`, `subject`, `priority`, `type`, `date_added`, `owner`, `status` |
| `sort_order`      | `asc`                               | `asc` ou `desc`                                                            |
| `user_role`       | legado app                          | Omitir com token `sbt_…`                                                   |
| `user_visibility` | legado app (`all`, `team`, `owner`) | Omitir com token `sbt_…`                                                   |
| `team_ids`        | CSV, legado app                     | Omitir com token `sbt_…`                                                   |

**Resposta:** `activities[]`, `total`, `page`, `pages`, `counts` (`overdue`, `today`, `tomorrow`, `this_week`)

**Campos de cada item em `activities[]`:**

| Campo                                | Descrição                              |
| ------------------------------------ | -------------------------------------- |
| `activity_id`                        | ID                                     |
| `activity_subject`                   | Assunto                                |
| `activity_type`                      | Tipo (`task`, `call`, `meeting`, …)    |
| `activity_status`                    | `pending`, `completed`, `cancelled`    |
| `activity_priority`                  | `low`, `normal`, `high`                |
| `activity_busy_flag`                 | `free` ou `busy`                       |
| `activity_due_date`                  | Data prevista (`YYYY-MM-DD`)           |
| `activity_due_time`                  | Horário de início (`HH:mm`)            |
| `activity_end_date`                  | Data de término (`YYYY-MM-DD`)         |
| `activity_end_time`                  | Horário de término (`HH:mm`)           |
| `activity_duration`                  | Duração em minutos                     |
| `activity_description`               | Descrição                              |
| `activity_deal_id`                   | Negócio vinculado                      |
| `activity_deal_title`                | Título do negócio                      |
| `activity_lead_id`                   | Lead vinculado                         |
| `activity_lead_name`                 | Nome do lead                           |
| `activity_lead_phone`                | Telefone do lead                       |
| `activity_org_id`                    | Empresa vinculada                      |
| `activity_org_name`                  | Nome da empresa                        |
| `activity_owner_id`                  | Responsável                            |
| `activity_owner_name`                | Nome do responsável                    |
| `activity_completed_at`              | Conclusão (ISO)                        |
| `activity_date_added`                | Criação                                |
| `activity_date_updated`              | Última alteração                       |
| `activity_google_meet_uri`           | Link do Google Meet (após booking)     |
| `activity_google_calendar_html_link` | Link HTML do evento no Google Calendar |
| `activity_event_url`                 | URL/slug do evento público de agenda   |
| `activity_slot_time`                 | Início ISO do slot reservado           |
| `activity_meeting_participants`      | E-mails da reunião (`string[]`)        |
| `activity_meeting_notes`             | Notas da reunião                       |
| `activity_meeting_location`          | Local (preenchido pelo booking)        |
| `activity_meeting_timezone`          | Fuso (preenchido pelo booking)         |
| `activity_meeting_summary`           | Título do evento na agenda (booking)   |
| `activity_calendar_event_id`         | ID do evento no catálogo de agenda     |
| `activity_calendar_reservation_id`   | ID da reserva (booking)                |
| `activity_calendar_id`               | Agenda usada                           |
| `activity_outcome`                   | Resultado ao concluir                  |
| `activity_outcome_description`       | Detalhe escrito ao concluir            |
| `activity_completed_by`              | Quem concluiu                          |
| `activity_category`                  | Tipo personalizado (slug)              |

### `GET /crm/activities/{activity_id}` — Detalhe + ligações VoIP

**Explicação:** retorna a atividade e as ligações VoIP relacionadas, quando existirem.

**Rota:** `GET https://api.sellbot.tech/v1/crm/activities/{activity_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** não envie body nesta rota.

**Escopo:** `crm:read`

**Resposta:** `activity[]` (array com 1 item), `calls[]`

O item em `activity[]` usa os **mesmos campos da listagem**.

**Exemplo (reunião com horário e booking):**

```json
{
  "activity": [
    {
      "activity_id": "a1b2c3…",
      "activity_subject": "Reunião comercial",
      "activity_type": "meeting",
      "activity_status": "pending",
      "activity_due_date": "2026-08-31",
      "activity_due_time": "14:30",
      "activity_end_date": "2026-08-31",
      "activity_end_time": "15:30",
      "activity_duration": 60,
      "activity_busy_flag": "busy",
      "activity_owner_id": "d83b2c37acb3c530",
      "activity_owner_name": "Ana Silva",
      "activity_lead_id": "6a32177605cc37fab3b3b357",
      "activity_lead_name": "Cliente Exemplo",
      "activity_meeting_notes": "Alinhamento de proposta",
      "activity_meeting_participants": ["ana@empresa.com"],
      "activity_meeting_location": "Google Meet",
      "activity_meeting_timezone": "America/Sao_Paulo",
      "activity_meeting_summary": "Reunião comercial",
      "activity_slot_time": "2026-08-31T14:30:00",
      "activity_event_url": "https://calendar.google.com/…",
      "activity_google_meet_uri": "https://meet.google.com/abc-defg-hij",
      "activity_google_calendar_html_link": "https://www.google.com/calendar/event?eid=…",
      "activity_calendar_event_id": "56c0ff3d42f90133",
      "activity_calendar_reservation_id": "res_123",
      "activity_calendar_id": "primary"
    }
  ],
  "calls": []
}
```

**Cada ligação em `calls[]`:**

| Campo                   | Descrição              |
| ----------------------- | ---------------------- |
| `call_id`               | ID da ligação          |
| `call_direction`        | Entrada/saída          |
| `call_status`           | Status                 |
| `call_started_at`       | Início                 |
| `call_ended_at`         | Fim                    |
| `call_duration_seconds` | Duração                |
| `call_disposition`      | Resultado              |
| `call_summary`          | Resumo (se disponível) |
| `lead_id`               | Lead                   |
| `lead_name`             | Nome do lead           |

### `POST /crm/activities` — Criar atividade

**Explicação:** agenda uma tarefa, ligação, reunião ou outro compromisso no CRM.

**Rota:** `POST https://api.sellbot.tech/v1/crm/activities`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `crm:write`

**Body — obrigatórios:**

| Campo               | Descrição                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `activity_subject`  | Assunto / título                                                                                           |
| `activity_type`     | `task`, `call`, `meeting`, `email`, `whatsapp`, `follow_up`, `contract` (outros slugs são aceitos)         |
| `activity_due_date` | Data (`YYYY-MM-DD`). Datetime ISO (`2026-08-31T14:30:00`) também vale — o relógio vira `activity_due_time` |
| `activity_owner_id` | Responsável                                                                                                |

**Body — horário:**

| Campo                | Descrição                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| `activity_due_time`  | Início (`HH:mm`). Use em reunião com horário fixo. `HH:mm:ss` e `9:05` são normalizados para `HH:mm` |
| `activity_duration`  | Minutos. Se o fim não vier, a API preenche `activity_end_date` e `activity_end_time`                 |
| `activity_end_date`  | Término (`YYYY-MM-DD`)                                                                               |
| `activity_end_time`  | Término (`HH:mm`). Em reunião na agenda sem `activity_duration`, é ele que dá a duração do evento    |
| `activity_busy_flag` | `free` ou `busy` (padrão `free`)                                                                     |

**Body — classificação:**

| Campo                   | Descrição                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| `activity_priority`     | `low`, `normal`, `high` (padrão `normal`)                                                                 |
| `activity_status`       | `pending`, `completed`, `cancelled` (criação costuma omitir → `pending`)                                  |
| `activity_category`     | Slug da categoria (ex. `reuniao_onboarding`). **Aceito na escrita; o GET externo não devolve este campo** |
| `activity_description`  | Texto livre                                                                                               |
| `activity_completed_at` | ISO da conclusão (em geral preenchido ao mudar status)                                                    |

**Body — vínculos (aliases `lead_id` / `deal_id` também valem):**

| Campo                 | Descrição                                            |
| --------------------- | ---------------------------------------------------- |
| `activity_lead_id`    | Lead                                                 |
| `activity_lead_name`  | Nome do lead (a API pode enriquecer se omitido)      |
| `activity_deal_id`    | Negócio                                              |
| `activity_deal_title` | Título do negócio (a API pode enriquecer se omitido) |
| `activity_org_id`     | Empresa                                              |
| `activity_org_name`   | Nome da empresa                                      |
| `lead_id`             | Alias de `activity_lead_id`                          |
| `deal_id`             | Alias de `activity_deal_id`                          |

**Body — responsável (além do id obrigatório):**

| Campo                   | Descrição                                                        |
| ----------------------- | ---------------------------------------------------------------- |
| `activity_owner_name`   | Nome (a API pode enriquecer)                                     |
| `activity_owner_avatar` | URL do avatar (**aceito na escrita; o GET externo não devolve**) |

**Body — template WhatsApp (quando o tipo dispara mensagem):**

| Campo                        | Descrição                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `activity_template_id`       | ID do template (**escrita; GET externo não devolve**)                        |
| `activity_template_name`     | Nome (**escrita; GET externo não devolve**)                                  |
| `activity_template_campaign` | Campanha (**escrita; GET externo não devolve**)                              |
| `activity_template_channel`  | Canal (**escrita; GET externo não devolve**)                                 |
| `activity_msg_type`          | `sellbot_proactive` ou `sellbot_waba` (**escrita; GET externo não devolve**) |

**Body — reunião / agenda (`activity_type: meeting`):**

| Campo                              | Descrição                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `activity_schedule_meeting`        | `true` agenda no Google Calendar do responsável. `false` impede o booking mesmo com evento+horário. **Só escrita** |
| `activity_meeting_participants`    | Array de e-mails (também aceita JSON string). No GET volta `string[]`                                              |
| `activity_meeting_notes`           | Notas; entram na descrição do convite                                                                              |
| `activity_event_url`               | Slug/URL do evento público de agenda                                                                               |
| `activity_calendar_event_id`       | ID do evento no catálogo                                                                                           |
| `activity_calendar_id`             | Agenda; se omitido, usa a do `activity_owner_id`                                                                   |
| `activity_slot_time`               | Início ISO do slot (alternativa a `due_date` + `due_time` no booking)                                              |
| `activity_calendar_reservation_id` | ID da reserva (em geral preenchido pelo booking; pode ser enviado no edit/status/delete)                           |

O GET preenche, após o booking: `activity_google_meet_uri`, `activity_google_calendar_html_link`, `activity_meeting_location`, `activity_meeting_timezone`, `activity_meeting_summary`, `activity_calendar_reservation_id`, `activity_slot_time`. Esses campos **não** se enviam no create — vêm da reserva.

**Body — resultado (mais comum no status; também aceitos no create/edit):**

| Campo                          | Descrição                            |
| ------------------------------ | ------------------------------------ |
| `activity_outcome`             | Resultado ao concluir (volta no GET) |
| `activity_outcome_description` | Detalhe (volta no GET)               |

**Não envie:** `client_uuid` nem `user_id` (vêm do token). Campos fora desta lista → `400`.

O GET devolve os mesmos campos da listagem de atividades.

**Exemplo — reunião com horário:**

```json
{
  "activity_subject": "Reunião comercial",
  "activity_type": "meeting",
  "activity_due_date": "2026-08-31",
  "activity_due_time": "14:30",
  "activity_duration": 60,
  "activity_owner_id": "d83b2c37acb3c530",
  "activity_lead_id": "6a32177605cc37fab3b3b357",
  "activity_meeting_notes": "Alinhamento de proposta",
  "activity_meeting_participants": ["ana@empresa.com"]
}
```

Datetime ISO no lugar da data também vale: `"activity_due_date": "2026-08-31T14:30:00"` (a API grava `2026-08-31` + `14:30`).

```bash
curl -s -X POST 'https://api.sellbot.tech/v1/crm/activities' \
  -H 'Authorization: Bearer sbt_SEU_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"activity_subject":"Reunião comercial","activity_type":"meeting","activity_due_date":"2026-08-31","activity_due_time":"14:30","activity_duration":60,"activity_owner_id":"d83b2c37acb3c530","activity_meeting_notes":"Alinhamento de proposta","activity_meeting_participants":["ana@empresa.com"]}'
```

**Resposta 200:** `{ "activity_id", "success", … }`

### `PATCH /crm/activities/{activity_id}` — Editar atividade

**Explicação:** atualiza os campos da atividade. Envie somente o que mudou.

**Rota:** `PATCH https://api.sellbot.tech/v1/crm/activities/{activity_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `crm:write`

**Body:** os mesmos campos do create, todos opcionais — envie só o que mudou. Inclui horário (`activity_due_time`, `activity_duration`, `activity_end_*`), reunião (`activity_meeting_*`, `activity_schedule_meeting`, ids de agenda) e classificação (`activity_category`, templates, `activity_status`). Body vazio → `400` `NO_FIELDS_TO_UPDATE`.

**Exemplo — alterar horário:**

```json
{
  "activity_due_date": "2026-09-01",
  "activity_due_time": "10:00",
  "activity_duration": 45
}
```

**Resposta 200:** confirmação com `activity_id`.

### `POST /crm/activities/{activity_id}/status` — Concluir / cancelar

**Explicação:** conclui, cancela ou reabre uma atividade. Você também pode registrar o resultado da execução.

**Rota:** `POST https://api.sellbot.tech/v1/crm/activities/{activity_id}/status`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `crm:write`

**Body:**

| Campo                              | Obrigatório | Descrição                                   |
| ---------------------------------- | ----------- | ------------------------------------------- |
| `activity_status`                  | sim         | `pending`, `completed`, `cancelled`         |
| `activity_completed_at`            | não         | ISO; padrão `now` quando `completed`        |
| `activity_outcome`                 | não         | Resultado (volta no GET)                    |
| `activity_outcome_description`     | não         | Detalhe (volta no GET)                      |
| `activity_cancel_meeting`          | não         | `true` cancela a reunião no Google Calendar |
| `activity_calendar_reservation_id` | não         | Override do id da reserva                   |
| `activity_cancel_reason`           | não         | Motivo enviado ao cancel                    |

**Resposta 200:** confirmação.

### `DELETE /crm/activities/{activity_id}` — Excluir atividade

**Explicação:** exclui a atividade. Se houver uma reunião vinculada, você pode controlar o cancelamento no Google Calendar pelo body.

**Rota:** `DELETE https://api.sellbot.tech/v1/crm/activities/{activity_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `crm:write`

**Body:**

| Campo                              | Descrição                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| `{}`                               | Exclusão padrão. Se houver `activity_calendar_reservation_id`, cancela a reunião automaticamente |
| `activity_cancel_meeting`          | `false` para não cancelar a reunião no Google Calendar                                           |
| `activity_calendar_reservation_id` | Override do id da reserva                                                                        |
| `activity_cancel_reason`           | Motivo do cancel                                                                                 |

**Resposta 200:** confirmação.

### `GET /crm/calendar/availability` — Horários ocupados de uma pessoa

**Explicação:** quando uma pessoa está ocupada, para marcar reunião sem bater horário. Junta a agenda do Google conectada e as atividades do CRM. Só os intervalos saem daqui: título, convidados e descrição dos compromissos nunca. Horário de Brasília.

**Rota:** `GET https://api.sellbot.tech/v1/crm/calendar/availability?owner_id={user_id}&date_from=2026-11-10&date_to=2026-11-12`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Escopo:** `crm:read`

**Query:**

| Campo       | Descrição                                                  |
| ----------- | ---------------------------------------------------------- |
| `owner_id`  | De quem; sem ele, do dono do token                         |
| `date_from` | Primeiro dia, `AAAA-MM-DD` — obrigatório                   |
| `date_to`   | Último dia, até 14 dias depois; sem ele, só o primeiro dia |

**Resposta 200:**

```json
{
  "owner_id": "{user_id}",
  "has_calendar": true,
  "calendar": "agenda@empresa.com",
  "date_from": "2026-11-10",
  "date_to": "2026-11-12",
  "busy": [
    {
      "start": "2026-11-10T14:00:00-03:00",
      "end": "2026-11-10T15:00:00-03:00",
      "all_day": false,
      "source": "google"
    }
  ]
}
```

Para marcar a reunião, crie a atividade com `activity_type: "meeting"`, `activity_due_date`, `activity_due_time`, o `lead_id` de um lead com e-mail e `activity_schedule_meeting: true`. Ela cai na agenda do responsável e o lead recebe o convite. Sem agenda conectada (`has_calendar: false`), a atividade é criada sem convite.

### `GET /crm/activity-types` — Listar tipos de atividade

**Explicação:** os tipos de atividade da conta, na ordem de Configurações › Atividades, com os desfechos de cada um. Use `value` em `activity_category` e `kind` em `activity_type` ao criar a atividade: `kind` é o comportamento (`meeting` marca agenda, `whatsapp` envia template, `task`, `call`, `email`, `follow_up`, `contract`). Ao concluir, `activity_outcome` é o `value` de um dos `outcomes` do tipo da atividade; `counts_as_completed: false` marca desfecho que não conta como feito (ex.: faltou). Conta que nunca configurou recebe os sete tipos padrão.

**Rota:** `GET https://api.sellbot.tech/v1/crm/activity-types`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Escopo:** `crm:read`

**Resposta 200:**

```json
{
  "activity_types": [
    {
      "value": "consulta_agendada",
      "label": "Consulta agendada",
      "kind": "meeting",
      "title_template": "Consulta - {{nome}}",
      "outcomes": [
        { "value": "compareceu", "label": "Compareceu", "counts_as_completed": true },
        { "value": "faltou", "label": "Faltou", "counts_as_completed": false }
      ]
    }
  ]
}
```

### `GET /crm/activities/{activity_id}/notes` — Listar anotações da atividade

**Rota:** `GET https://api.sellbot.tech/v1/crm/activities/{activity_id}/notes`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Escopo:** `crm:read`

**Query:** `page`, `limit`

**Resposta:** `notes[]`, `total`, `page`, `pages`

### `POST /crm/activities/{activity_id}/notes` — Criar anotação da atividade

**Explicação:** a nota entra também no histórico do lead quando a atividade tem lead.

**Rota:** `POST https://api.sellbot.tech/v1/crm/activities/{activity_id}/notes`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `crm:write`

**Body:** `{ "note_content": "Cliente pediu para levar o contrato" }`

**Resposta 200:** `{ "success": true, "note_id": "..." }` · atividade inexistente: `{ "success": false, "error": "ACTIVITY_NOT_FOUND" }`

### `PATCH /crm/activities/{activity_id}/notes/{note_id}` — Editar anotação da atividade

**Explicação:** a nota precisa ser desta atividade; nota de outra atividade responde `NOTE_NOT_FOUND`.

**Rota:** `PATCH https://api.sellbot.tech/v1/crm/activities/{activity_id}/notes/{note_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `crm:write`

**Body:** `{ "note_content": "Texto atualizado" }`

**Resposta 200:** `{ "success": true, "note_id": "..." }` · `{ "success": false, "error": "NOTE_NOT_FOUND" }`

### `DELETE /crm/activities/{activity_id}/notes/{note_id}` — Excluir anotação da atividade

**Rota:** `DELETE https://api.sellbot.tech/v1/crm/activities/{activity_id}/notes/{note_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `crm:write`

**Body:** `{}`

**Resposta 200:** `{ "success": true, "note_id": "..." }` · `{ "success": false, "error": "NOTE_NOT_FOUND" }`

---

### `GET /crm/calendar/pages` — Páginas de agendamento

**Explicação:** as páginas de agendamento (o link que o lead usa para marcar): título, ativa ou não, endereço, duração, dono, número e campanha. Com `scope=all`, as da conta inteira, só para quem gerencia a conta; os outros recebem as deles.

**Rota:** `GET https://api.sellbot.tech/v1/crm/calendar/pages`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Escopo:** `crm:read`.

### `GET /crm/calendar/pages/{page_id}` — Página de agendamento

**Explicação:** uma página com a disponibilidade por dia da semana, o intervalo entre reuniões e a antecedência mínima.

**Rota:** `GET https://api.sellbot.tech/v1/crm/calendar/pages/{page_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Escopo:** `crm:read`.

### `GET /crm/calendar/reservations` — Reservas da agenda

**Explicação:** as reuniões marcadas pelas páginas: `type=upcoming` (padrão), `previous` ou `canceled`, com `page` e `limit` (até 100). `scope=all` só para quem gerencia a conta; os outros veem as das páginas e agendas deles.

**Rota:** `GET https://api.sellbot.tech/v1/crm/calendar/reservations`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Escopo:** `crm:read`.

### `GET /crm/calendar/reservations/{reservation_id}` — Reserva da agenda

**Explicação:** uma reserva: quando, com quem, em que página e a situação. Reserva fora do alcance de quem chama responde `404`.

**Rota:** `GET https://api.sellbot.tech/v1/crm/calendar/reservations/{reservation_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Escopo:** `crm:read`.

### `POST /crm/calendar/reservations/{reservation_id}/cancel` — Cancelar reserva

**Explicação:** cancela a reunião. Ela sai da agenda do Google, e o lead e os participantes recebem e-mail de cancelamento, com o `reason` se vier. Cancelar de novo responde `already_canceled: true`.

**Rota:** `POST https://api.sellbot.tech/v1/crm/calendar/reservations/{reservation_id}/cancel`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
```

**Escopo:** `crm:write`.

**Body:**

```json
{ "reason": "Cliente pediu outro dia" }
```

### `POST /crm/calendar/reservations/{reservation_id}/reschedule` — Remarcar reserva

**Explicação:** muda o horário. A agenda do Google muda, e o lead e os participantes recebem e-mail com o horário novo. Reserva cancelada não remarca (`409`).

**Rota:** `POST https://api.sellbot.tech/v1/crm/calendar/reservations/{reservation_id}/reschedule`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
```

**Escopo:** `crm:write`.

**Body:**

```json
{ "start": "2026-11-20T15:00:00-03:00", "end": "2026-11-20T15:30:00-03:00" }
```

---

## CRM — Produtos

### `GET /crm/products` — Listar produtos

**Explicação:** lista os produtos do catálogo CRM com preços, categoria, responsável e status.

**Rota:** `GET https://api.sellbot.tech/v1/crm/products`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** não envie body nesta rota.

**Escopo:** `crm:read`

**Query opcional:** `page`, `limit`, `search`, `category`, `active` e `owner_id`.

**Cada produto:** `product_id`, `product_name`, `product_code`, `product_description`, `product_unit`, `product_tax_percentage`, `product_category`, `product_billing_frequency`, `product_active`, `product_owner_id`, `product_owner_name`, `product_followers_count`, `product_date_added`, `product_date_updated`, `product_prices[]`

### `GET /crm/products/{product_id}` — Detalhe

**Explicação:** retorna um produto completo do catálogo.

**Rota:** `GET https://api.sellbot.tech/v1/crm/products/{product_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** não envie body nesta rota.

**Escopo:** `crm:read`

**Resposta:** `{ "product": { ... } }`

### `GET /crm/products/{product_id}/deals` — Negócios com o produto

**Explicação:** lista os negócios que usam o produto informado.

**Rota:** `GET https://api.sellbot.tech/v1/crm/products/{product_id}/deals`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** não envie body nesta rota.

**Escopo:** `crm:read`

**Resposta:** `{ "product_deals": [...], "total" }` — cada item: `deal_id`, `deal_title`, `deal_value`, `deal_pipeline_id`, `deal_stage_id`, `deal_owner_id`, `deal_owner_name`, `deal_date_updated`

### `POST /crm/products` — Criar produto

**Explicação:** adiciona um produto ao catálogo CRM.

**Rota:** `POST https://api.sellbot.tech/v1/crm/products`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `crm:write`

**Body:** `product_name` e `product_owner_id` são obrigatórios. Você também pode enviar `product_code`, `product_description`, `product_unit`, `product_category`, `product_billing_frequency`, `product_prices[]` e `product_active`.

```json
{
  "product_name": "Licença Sellbot",
  "product_owner_id": "{user_id}",
  "product_code": "SELLBOT-MENSAL",
  "product_billing_frequency": "recurring",
  "product_active": true
}
```

**Resposta 200:** `{ "product_id", "success", … }`

### `PATCH /crm/products/{product_id}` — Editar produto

**Explicação:** atualiza os dados de um produto. Envie somente os campos que mudaram.

**Rota:** `PATCH https://api.sellbot.tech/v1/crm/products/{product_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `crm:write`

**Body:** campos parciais do produto (`product_name`, `product_code`, `product_description`, `product_unit`, `product_tax_percentage`, `product_category`, `product_billing_frequency`, `product_image_url`, `product_owner_id`, `product_owner_name`, `product_active`, `product_prices[]`). Não envie `product_id` no body.

**Exemplo:**

```bash
curl -s -X PATCH 'https://api.sellbot.tech/v1/crm/products/{product_id}' \
  -H 'Authorization: Bearer sbt_SEU_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"product_name":"Plano Pro Plus","product_active":true}'
```

**Resposta 200:** `{ "success": true, "product_id": "…" }`

### `DELETE /crm/products/{product_id}` — Excluir produto

**Explicação:** exclui um produto do catálogo. Confirme o ID antes de continuar.

**Rota:** `DELETE https://api.sellbot.tech/v1/crm/products/{product_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `crm:write`

**Body:** `{}`

**Resposta 200:** confirmação.

---

## CRM — Funis

Os funis e as etapas. Criar e editar funil é na tela, em **CRM**.

### `GET /crm/pipelines` — Listar pipelines

**Explicação:** lista os funis do tenant para obter `pipeline_id` (usado em `deal_pipeline_id` ao criar/mover negócios).

**Rota:** `GET https://api.sellbot.tech/v1/crm/pipelines`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** não envie body nesta rota.

**Escopo:** `deals:read` ou `crm:read`

**Query opcional:** `active` (`true` \| `false`).

**Cada pipeline:** `pipeline_id`, `pipeline_name`, `pipeline_slug`, `pipeline_default`, `pipeline_active`, `pipeline_date_added`, `pipeline_date_updated`

**Resposta:** `{ "pipelines": [...], "total" }`

### `GET /crm/pipelines/{pipeline_id}` — Detalhe com etapas

**Explicação:** retorna um funil completo com `pipeline_stages[]` para obter `stage_id` (`deal_stage_id`).

**Rota:** `GET https://api.sellbot.tech/v1/crm/pipelines/{pipeline_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** não envie body nesta rota.

**Escopo:** `deals:read` ou `crm:read`

**Resposta:** `{ "pipeline": { ..., "pipeline_stages": [{ "stage_id", "stage_name", "stage_index", "stage_type", "stage_color", "stage_key", "stage_active" }] } }`

**Erro 404:** `PIPELINE_NOT_FOUND`

---

## CRM — Etiquetas de negócio

### `GET /crm/deal-tags` — Listar tags

**Explicação:** lista o catálogo de tags disponíveis para os negócios.

**Rota:** `GET https://api.sellbot.tech/v1/crm/deal-tags`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** não envie body nesta rota.

**Escopo:** `crm:read`

**Query opcional:** `page`, `limit`, `search`, `active` e `system`.

**Resposta:** `{ "success": true, "tags": [...], "total", "page", "pages" }`

**Cada tag:**

| Campo                                | Descrição       |
| ------------------------------------ | --------------- |
| `tag_id`                             | ID              |
| `tag_name`                           | Nome exibido    |
| `tag_slug`                           | Slug            |
| `tag_color`                          | Cor hex         |
| `tag_description`                    | Descrição       |
| `tag_active`                         | Ativa?          |
| `tag_system`                         | Tag de sistema? |
| `tag_date_added`, `tag_date_updated` | Datas           |

### `GET /crm/deal-tags/{tag_id}` — Uma tag

**Explicação:** retorna uma tag específica do catálogo.

**Rota:** `GET https://api.sellbot.tech/v1/crm/deal-tags/{tag_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** não envie body nesta rota.

**Escopo:** `crm:read`

**Resposta:** `{ "success": true, "tag": { ... } }`

### `GET /crm/deals/{deal_id}/tags` — Tags de um negócio

**Explicação:** lista as tags que já estão vinculadas ao negócio informado.

**Rota:** `GET https://api.sellbot.tech/v1/crm/deals/{deal_id}/tags`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** não envie body nesta rota.

**Escopo:** `crm:read`

**Resposta:** `{ "success": true, "deal_id": "...", "tags": [...] }`

### `POST /crm/deal-tags` — Criar tag

**Explicação:** cria uma tag no catálogo de negócios.

**Rota:** `POST https://api.sellbot.tech/v1/crm/deal-tags`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `crm:write`

**Body:**

| Campo             | Descrição                               |
| ----------------- | --------------------------------------- |
| `tag_name`        | Nome exibido — obrigatório              |
| `tag_slug`        | Slug (opcional)                         |
| `tag_color`       | Cor hexadecimal `#RRGGBB` — obrigatória |
| `tag_description` | Descrição                               |

**Resposta 200:** `{ "success": true, "tag": { … } }`

### `PATCH /crm/deal-tags/{tag_id}` — Editar tag

**Explicação:** altera o nome, a cor, a descrição ou o status de uma tag.

**Rota:** `PATCH https://api.sellbot.tech/v1/crm/deal-tags/{tag_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `crm:write`

**Body:** campos parciais da tag.

**Resposta 200:** `{ "success": true, "tag": { … } }`

### `DELETE /crm/deal-tags/{tag_id}` — Excluir tag

**Explicação:** desativa a tag no catálogo sem apagar seu histórico dos negócios.

**Rota:** `DELETE https://api.sellbot.tech/v1/crm/deal-tags/{tag_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `crm:write`

**Body:** `{}`

**Resposta 200:** `{ "success": true }`

### `POST /crm/deals/{deal_id}/tags` — Vincular tag ao negócio

**Explicação:** associa uma tag existente ao negócio.

**Rota:** `POST https://api.sellbot.tech/v1/crm/deals/{deal_id}/tags`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `deals:write` ou `crm:write`

**Body:**

| Campo    | Descrição |
| -------- | --------- |
| `tag_id` | ID da tag |

**Resposta 200:** `{ "success": true }`

### `POST /crm/deals/{deal_id}/tags/{tag_id}/detach` — Desvincular tag

**Explicação:** remove o vínculo entre a tag e o negócio, sem excluir a tag do catálogo.

**Rota:** `POST https://api.sellbot.tech/v1/crm/deals/{deal_id}/tags/{tag_id}/detach`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `deals:write` ou `crm:write`

**Body:** `{}`

**Resposta 200:** `{ "success": true }`

---

## CRM — Anotações de negócio

### `GET /crm/deals/{deal_id}/notes` — Listar anotações do negócio

**Rota:** `GET https://api.sellbot.tech/v1/crm/deals/{deal_id}/notes`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Escopo:** `deals:read` ou `crm:read`

**Query:** `page`, `limit`

**Resposta:** `notes[]`, `total`, `page`, `pages`

### `POST /crm/deals/{deal_id}/notes` — Criar anotação do negócio

**Rota:** `POST https://api.sellbot.tech/v1/crm/deals/{deal_id}/notes`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `deals:write` ou `crm:write`

**Body:** `{ "note_content": "Cliente pediu proposta revisada" }`

**Resposta 200:** `{ "success": true, "note_id": "..." }`

### `PATCH /crm/deals/{deal_id}/notes/{note_id}` — Editar anotação do negócio

**Rota:** `PATCH https://api.sellbot.tech/v1/crm/deals/{deal_id}/notes/{note_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `deals:write` ou `crm:write`

**Body:** `{ "note_content": "Texto atualizado" }`

**Resposta 200:** `{ "success": true, "note_id": "..." }`

### `DELETE /crm/deals/{deal_id}/notes/{note_id}` — Excluir anotação do negócio

**Rota:** `DELETE https://api.sellbot.tech/v1/crm/deals/{deal_id}/notes/{note_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `deals:write` ou `crm:write`

**Body:** `{}`

**Resposta 200:** `{ "success": true, "note_id": "..." }`

---

## CRM — Motivos de perda

### `GET /crm/lost-reasons` — Listar motivos de perda

**Explicação:** os motivos de perda da conta, na ordem do modal de perda. Ao marcar um negócio como perdido, mande o `label` em `lost_reason` e o `value` em `lost_reason_value`. Conta que nunca configurou recebe os motivos padrão.

**Rota:** `GET https://api.sellbot.tech/v1/crm/lost-reasons`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Escopo:** `crm:read`

**Resposta 200:**

```json
{
  "lost_reasons": [
    { "value": "preco_alto", "label": "Preço alto", "color": "#ef4444", "system": true }
  ]
}
```

### `POST /crm/lost-reasons` — Adicionar motivos de perda

**Explicação:** põe motivos novos no fim da lista. O `value` sai do nome, como na tela. Nome que já existe fica de fora e volta em `skipped`.

**Rota:** `POST https://api.sellbot.tech/v1/crm/lost-reasons`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `crm:write`

**Body:**

| Campo             | Descrição                             |
| ----------------- | ------------------------------------- |
| `reasons`         | Lista de 1 a 30 motivos — obrigatório |
| `reasons[].label` | Nome do motivo, até 60 caracteres     |
| `reasons[].color` | Cor em `#RRGGBB`; padrão `#ef4444`    |

```json
{ "reasons": [{ "label": "Fechou com outro" }] }
```

**Resposta 200:** `{ "success": true, "added": [...], "skipped": [] }`

### `PATCH /crm/lost-reasons/{value}` — Editar motivo de perda

**Explicação:** muda o nome ou a cor. O `value` não muda, porque os negócios já perdidos apontam para ele. Excluir motivo é pela tela.

**Rota:** `PATCH https://api.sellbot.tech/v1/crm/lost-reasons/{value}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `crm:write`

**Body:** `{ "label": "Sem orçamento", "color": "#111111" }` (ao menos um dos dois)

**Resposta 200:** `{ "success": true, "lost_reason": { ... } }` · `404` motivo inexistente

---

# Contatos

## Leads

Cadastro de leads: listar, abrir, criar, editar, excluir, mesclar duplicados e exportar. Na Sellbot: **Leads**.

### `GET /contacts/leads` — Listar leads

**Explicação:** lista os leads da conta. Use a busca e os filtros para encontrar somente os contatos necessários.

**Rota:** `GET https://api.sellbot.tech/v1/contacts/leads`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** não envie body nesta rota.

**Escopo:** `contacts:read`

**Query úteis:**

| Parâmetro               | Exemplo        | Descrição                        |
| ----------------------- | -------------- | -------------------------------- |
| `page`                  | `1`            | Página (padrão 1)                |
| `limit`                 | `25`           | Itens por página (máx. 100)      |
| `s`                     | `ana`          | Busca por nome, telefone, e-mail |
| `tags`                  | `vip`          | Filtrar por tag                  |
| `is_customer`           | `true`         | Só clientes                      |
| `channel`               | `api`          | Canal de origem                  |
| `campaign`              | `black-friday` | Campanha                         |
| `date_from` / `date_to` | `2026-01-01`   | Intervalo de datas               |

**Exemplo:**

```bash
curl -s 'https://api.sellbot.tech/v1/contacts/leads?page=1&limit=25' \
  -H 'Authorization: Bearer sbt_SEU_TOKEN'
```

**Resposta 200 — campos do envelope:**

| Campo   | Tipo   | Descrição        |
| ------- | ------ | ---------------- |
| `leads` | array  | Lista de leads   |
| `total` | número | Total encontrado |
| `page`  | número | Página atual     |
| `pages` | número | Total de páginas |

**Cada item em `leads[]`:**

| Campo             | Tipo     | Descrição                |
| ----------------- | -------- | ------------------------ |
| `id`              | string   | ID do lead               |
| `first_name`      | string   | Nome                     |
| `last_name`       | string   | Sobrenome                |
| `phone`           | string   | Telefone com DDI         |
| `email`           | string   | E-mail                   |
| `tags`            | string[] | Tags do lead             |
| `is_customer`     | boolean  | É cliente?               |
| `lead_owner_name` | string   | Nome do responsável      |
| `org_id`          | string   | ID da empresa vinculada  |
| `date_updated`    | string   | Última atualização (ISO) |
| `channel`         | string   | Canal de aquisição       |
| `campaign`        | string   | Campanha                 |

Campos personalizados **não** entram nesta listagem. Use `GET /contacts/leads/{lead_id}` → `custom_fields`.

**Exemplo de resposta:**

```json
{
  "leads": [
    {
      "id": "6a32177605cc37fab3b3b357",
      "first_name": "Ana",
      "last_name": "Silva",
      "phone": "5511999887766",
      "email": "ana@empresa.com",
      "tags": ["vip", "api"],
      "is_customer": false,
      "lead_owner_name": "João Vendas",
      "org_id": "69c2d2920f5f650790e49c71",
      "date_updated": "2026-07-01T14:22:00.000Z",
      "channel": "api",
      "campaign": "integrador-julho"
    }
  ],
  "total": 1,
  "page": 1,
  "pages": 1
}
```

### `GET /contacts/leads/{lead_id}` — Detalhe do lead

Com token `sbt_…`, vale o alcance de quem criou o token: registro de outra pessoa, para quem só vê o que é seu, responde `404`.

**Explicação:** retorna um lead completo, incluindo campos personalizados, empresa, negócios e ligações vinculadas. Quando o lead tem conversa na Central, `conversation_id` é o número dela no número do lead (o mesmo `id` de `GET /conversations` e de `/c/<conta>/conversas/<id>` no app); a listagem também traz esse campo.

**Rota:** `GET https://api.sellbot.tech/v1/contacts/leads/{lead_id}`

Substitua `{lead_id}` pelo ID retornado na listagem de leads.

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** não envie body nesta rota.

**Escopo:** `contacts:read`

**Exemplo:**

```bash
curl -s 'https://api.sellbot.tech/v1/contacts/leads/6a32177605cc37fab3b3b357' \
  -H 'Authorization: Bearer sbt_SEU_TOKEN'
```

**Resposta 200 — estrutura:**

| Campo           | Descrição                                                     |
| --------------- | ------------------------------------------------------------- |
| `lead`          | Dados do lead (campos da listagem + UTM, endereço)            |
| `custom_fields` | Mapa `field_key` → valor (catálogo `category=lead`)           |
| `organization`  | Empresa ou `null`                                             |
| `deals`         | Negócios vinculados (resumo)                                  |
| `calls`         | Ligações vinculadas (até 100 itens; sem gravação/transcrição) |

**Campos extras em `lead` (além da listagem):**

| Campo                                                                 | Descrição                                                                                    |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `customer_status`                                                     | Status de cliente                                                                            |
| `is_opportunity`                                                      | É oportunidade?                                                                              |
| `lead_owner_id`                                                       | ID do responsável                                                                            |
| `organization_id`                                                     | ID da empresa                                                                                |
| `date_added`                                                          | Data de criação                                                                              |
| `acquisition_channel`                                                 | Canal                                                                                        |
| `origin`                                                              | Origem                                                                                       |
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` | UTMs                                                                                         |
| `meta_campaign`                                                       | Campanha Meta                                                                                |
| `meta_campaign_id`, `meta_campaign_name`                              | Campanha Meta (ID e nome), quando o lead veio de formulário da Meta                          |
| `meta_adset_id`, `meta_adset_name`                                    | Conjunto de anúncios Meta (ID e nome)                                                        |
| `meta_ad_id`, `meta_ad_name`                                          | Anúncio Meta (ID e nome). Use o ID para cruzar com o gasto: o nome se repete entre conjuntos |
| `meta_form_id`, `meta_form_name`                                      | Formulário Meta (ID e nome)                                                                  |
| `company`, `cnpj`, `website`, `city`, `state`, `country`              | Dados comerciais                                                                             |

**Exemplo:**

```json
{
  "lead": {
    "id": "6a32177605cc37fab3b3b357",
    "first_name": "Ana",
    "phone": "5511999887766",
    "email": "ana@empresa.com",
    "lead_owner_id": "d83b2c37acb3c530",
    "lead_owner_name": "João Vendas",
    "utm_source": "google"
  },
  "custom_fields": {
    "segmento": "PME"
  },
  "organization": {
    "id": "69c2d2920f5f650790e49c71",
    "name": "Acme Ltda",
    "cnpj": "12345678000199"
  },
  "deals": [
    {
      "deal_id": "4a04af91ac72d5275135e273f3b01cbd",
      "deal_title": "Proposta Ana",
      "deal_value": 1500,
      "deal_status": "open"
    }
  ],
  "calls": []
}
```

**404:** `{ "text": "Lead não encontrado.", "code": "LEAD_NOT_FOUND" }`

### `POST /contacts/leads` — Criar lead

**Explicação:** cria ou atualiza um lead na conta vinculada ao token. Antes de criar, a Sellbot procura um lead da conta (em qualquer número dela) com o mesmo contato: telefone (com e sem o 9 depois do DDD), WhatsApp (JID) ou e-mail. Se achar, **atualiza esse lead** em vez de criar outro, e a resposta traz `is_new: false` com o `lead_id` dele.

Na atualização, os campos enviados **substituem** os atuais; os que você não enviar ficam como estão. Isso vale também para `tags`: a lista enviada troca as etiquetas do lead. Para **acrescentar** etiquetas sem apagar as que já existem, use `POST /contacts/leads/{lead_id}/tags` (seção "Adicionar etiquetas").

**Rota:** `POST https://api.sellbot.tech/v1/contacts/leads`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `contacts:write`

**Body (campos usuais):**

| Campo                                                                 | Obrigatório | Descrição                                                                                                                               |
| --------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `phone`                                                               | recomendado | Telefone com DDI (ex. `5511999999999`)                                                                                                  |
| `first_name`                                                          | recomendado | Nome                                                                                                                                    |
| `last_name`                                                           | não         | Sobrenome                                                                                                                               |
| `email`                                                               | não         | E-mail                                                                                                                                  |
| `channel`                                                             | não         | Canal de aquisição — padrão `api` se omitido                                                                                            |
| `tags`                                                                | não         | Array de strings (ex. `["vip","api"]`). Na leitura, sempre retorna `string[]`. Se o lead já existir, **substitui** as etiquetas dele    |
| `org_id`                                                              | não         | ID da empresa para vincular                                                                                                             |
| `lead_owner_id`                                                       | não         | ID do responsável pelo lead                                                                                                             |
| `is_customer`                                                         | não         | `true` / `false`                                                                                                                        |
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` | não         | Parâmetros UTM                                                                                                                          |
| `campaign`                                                            | não         | Nome da campanha                                                                                                                        |
| `custom_fields`                                                       | não         | Campos personalizados — ver [Campos personalizados](#configuracoes-campos-personalizados)                                               |
| `resolve_conversation`                                                | não         | `true` para importação: a conversa do lead novo é criada e vinculada como sempre, mas já **resolvida**, fora da caixa aberta da Central |

**Exemplo:**

```bash
curl -s -X POST 'https://api.sellbot.tech/v1/contacts/leads' \
  -H 'Authorization: Bearer sbt_SEU_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"phone":"5511999887766","first_name":"Ana","last_name":"Silva","email":"ana@empresa.com","channel":"api","custom_fields":[{"sb_cf_segmento":"PME"}]}'
```

**Resposta 200:**

| Campo     | Descrição                                                                                                 |
| --------- | --------------------------------------------------------------------------------------------------------- |
| `lead_id` | ID do lead: o criado ou, se o contato já existia, o atualizado                                            |
| `success` | `true`                                                                                                    |
| `is_new`  | `true` quando criou um lead novo; `false` quando achou um lead da conta com o mesmo contato e o atualizou |

```json
{ "lead_id": "6a32177605cc37fab3b3b357", "success": true, "is_new": false }
```

**Erros:** `400` `NO_FIELDS_TO_UPDATE` (body vazio) · `400` `INVALID_PHONE`

**Importação de histórico (`resolve_conversation`):** todo lead com telefone tem a sua conversa na Central, vinculada a ele. Numa migração (por exemplo, negócios perdidos vindos de outro CRM), envie `"resolve_conversation": true`: a conversa é criada e vinculada normalmente, mas nasce resolvida e não fica na caixa aberta dos atendentes. Vale só para lead **novo**; se o telefone já for de um lead da conta, a conversa dele não é alterada.

Lembre que as automações da conta continuam valendo para esses leads e negócios (por exemplo, uma automação de "status do negócio mudou"). E, se o `POST /crm/deals` informar `deal_owner_id`, a conversa é atribuída a esse responsável, mesmo resolvida.

### `PATCH /contacts/leads/{lead_id}` — Editar lead

**Explicação:** atualiza um ou mais campos do lead. O `lead_id` vai na URL e não deve ser repetido no body.

**Rota:** `PATCH https://api.sellbot.tech/v1/contacts/leads/{lead_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `contacts:write`

**Body:** envie **somente** o que deseja alterar.

| Campo                                                    | Descrição                                                                           |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `first_name`, `last_name`                                | Nome                                                                                |
| `phone`                                                  | Telefone com DDI                                                                    |
| `email`                                                  | E-mail                                                                              |
| `tags`                                                   | Array de strings (na leitura, sempre `string[]`)                                    |
| `channel`                                                | Canal de aquisição (não tem default no edit)                                        |
| `org_id`                                                 | Empresa vinculada                                                                   |
| `lead_owner_id`                                          | Responsável                                                                         |
| `is_customer`                                            | Cliente sim/não                                                                     |
| `utm_source`, `utm_medium`, `utm_campaign`, …            | UTMs                                                                                |
| `campaign`                                               | Campanha                                                                            |
| `company`, `cnpj`, `website`, `city`, `state`, `country` | Dados comerciais                                                                    |
| `custom_fields`                                          | Array de campos personalizados; use as chaves de `GET /custom-fields?category=lead` |

**Exemplo — texto + campo personalizado:**

```bash
curl -s -X PATCH 'https://api.sellbot.tech/v1/contacts/leads/6a32177605cc37fab3b3b357' \
  -H 'Authorization: Bearer sbt_SEU_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"first_name":"Ana Silva","tags":"vip,integrador","custom_fields":[{"sb_cf_segmento":"Enterprise"}]}'
```

**Resposta 200:**

| Campo     | Descrição     |
| --------- | ------------- |
| `lead_id` | ID atualizado |
| `success` | `true`        |

**Erros:** `404` `LEAD_NOT_FOUND` · `400` `NO_FIELDS_TO_UPDATE` · `400` `INVALID_PHONE`

### `DELETE /contacts/leads/{lead_id}` — Excluir lead

**Explicação:** exclui o lead da conta — a mesma exclusão da tela: o lead vai para a lixeira (pode ser restaurado no app) e sai de todas as listagens. Negócios, atividades e anotações ficam guardados; anotações do lead só são apagadas se ele for excluído de vez na lixeira. Confirme o ID antes de chamar esta rota.

**Rota:** `DELETE https://api.sellbot.tech/v1/contacts/leads/{lead_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `contacts:write`

**Body:** `{}` (vazio com token de integração)

**Resposta 200:** `{ "success": true }`

**Erros:** `404` `LEAD_NOT_FOUND`

### `POST /contacts/leads/merge` — Mesclar leads duplicados

**Explicação:** junta o lead duplicado no principal. Histórico, notas, atividades, negócios e etiquetas passam para o principal, e o duplicado vai para a lixeira.

**Rota:** `POST https://api.sellbot.tech/v1/contacts/leads/merge`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** `survivor_lead_id` (fica) e `source_lead_id` (some), os dois obrigatórios.

**Escopo:** `contacts:write`

**Exemplo:**

```bash
curl -s -X POST 'https://api.sellbot.tech/v1/contacts/leads/merge' -H 'Authorization: Bearer sbt_SEU_TOKEN' -H 'Content-Type: application/json' -d '{"survivor_lead_id":"ID_A","source_lead_id":"ID_B"}'
```

### `POST /contacts/leads/export` — Exportar leads por e-mail

**Explicação:** gera a planilha dos leads que o dono do token enxerga e manda para o e-mail do cadastro dele. A resposta só confirma que entrou na fila.

**Rota:** `POST https://api.sellbot.tech/v1/contacts/leads/export`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** filtros opcionais: `s`, `tags`, `campaign`, `channel`, `origin`, `owner_id`, `is_customer`, `utm_source`, `utm_medium`, `utm_campaign`, `meta_campaign`, `created_from` e `created_to` (`AAAA-MM-DD`).

**Escopo:** `contacts:write`

**Exemplo:**

```bash
curl -s -X POST 'https://api.sellbot.tech/v1/contacts/leads/export' -H 'Authorization: Bearer sbt_SEU_TOKEN' -H 'Content-Type: application/json' -d '{"campaign":"black"}'
```

---

## Leads — Etiquetas

### `POST /contacts/leads/{lead_id}/tags` — Adicionar etiquetas

**Explicação:** soma etiquetas ao lead e às conversas dele na Central, pelo mesmo caminho do CRM. As que o lead já tem continuam; etiqueta nova entra no catálogo da conta. Etiquetas são gravadas em minúsculas.

**Rota:** `POST https://api.sellbot.tech/v1/contacts/leads/{lead_id}/tags`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `contacts:write`

**Body:** `{ "tags": ["vip", "retorno"] }` (ou texto separado por vírgula: `{ "tags": "vip, retorno" }`)

**Resposta 200:** `{ "success": true, "data": { "lead_id", "tags", "added", "removed", "conversations" } }`

### `POST /contacts/leads/{lead_id}/tags/{tag}/remove` — Remover etiqueta

**Explicação:** tira a etiqueta do lead e das conversas dele.

**Rota:** `POST https://api.sellbot.tech/v1/contacts/leads/{lead_id}/tags/{tag}/remove`

**Escopo:** `contacts:write`

**Body:** não envie body nesta rota.

**Resposta 200:** como a de adicionar.

### `GET /contacts/lead-tags` — Listar etiquetas de lead

**Explicação:** o catálogo de etiquetas de lead da conta do token, com a descrição de cada uma. É o nome em `title` que gatilho, condição e passo de automação usam. Só lê: não sincroniza com o Chatwoot.

**Escopo:** `contacts:read`.

**Rota:** `GET https://api.sellbot.tech/v1/contacts/lead-tags`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
```

**Resposta 200:** `{ "success": true, "data": { "tags": [{ "tag_id", "title", "description", "color" }], "total" } }`.

---

## Leads — Anotações

### `GET /contacts/leads/{lead_id}/notes` — Listar anotações do lead

**Explicação:** lista anotações internas vinculadas ao lead.

**Rota:** `GET https://api.sellbot.tech/v1/contacts/leads/{lead_id}/notes`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Escopo:** `contacts:read`

**Query:** `page`, `limit`

**Resposta:** `notes[]`, `total`, `page`, `pages`

### `POST /contacts/leads/{lead_id}/notes` — Criar anotação do lead

**Rota:** `POST https://api.sellbot.tech/v1/contacts/leads/{lead_id}/notes`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `contacts:write`

**Body:** `{ "note_content": "Cliente pediu retorno amanhã" }`

**Resposta 200:** `{ "success": true, "note_id": "..." }`

### `PATCH /contacts/leads/{lead_id}/notes/{note_id}` — Editar anotação do lead

**Rota:** `PATCH https://api.sellbot.tech/v1/contacts/leads/{lead_id}/notes/{note_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `contacts:write`

**Body:** `{ "note_content": "Texto atualizado" }`

**Resposta 200:** `{ "success": true, "note_id": "..." }`

### `DELETE /contacts/leads/{lead_id}/notes/{note_id}` — Excluir anotação do lead

**Rota:** `DELETE https://api.sellbot.tech/v1/contacts/leads/{lead_id}/notes/{note_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `contacts:write`

**Body:** `{}`

**Resposta 200:** `{ "success": true, "note_id": "..." }`

---

## Empresas

Na Sellbot: **Empresas**.

### `POST /contacts/organizations/export` — Exportar empresas por e-mail

**Explicação:** gera a planilha de até 10 mil empresas que o dono do token enxerga e manda para o e-mail do cadastro dele.

**Rota:** `POST https://api.sellbot.tech/v1/contacts/organizations/export`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** filtros opcionais: `s`, `owner_id`, `is_customer`, `created_from` e `created_to` (`AAAA-MM-DD`).

**Escopo:** `contacts:write`

**Exemplo:**

```bash
curl -s -X POST 'https://api.sellbot.tech/v1/contacts/organizations/export' -H 'Authorization: Bearer sbt_SEU_TOKEN' -H 'Content-Type: application/json' -d '{}'
```

### `GET /contacts/organizations` — Listar empresas

**Explicação:** lista as empresas cadastradas na conta e permite buscar por nome ou CNPJ.

**Rota:** `GET https://api.sellbot.tech/v1/contacts/organizations`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** não envie body nesta rota.

**Escopo:** `contacts:read`

**Query:** `page`, `limit`, `s` (busca), `filter=customer` (só clientes)

**Cada item em `organizations[]`:**

| Campo            | Descrição           |
| ---------------- | ------------------- |
| `id`             | ID da empresa       |
| `name`           | Razão social / nome |
| `cnpj`           | CNPJ                |
| `city`, `state`  | Localização         |
| `is_customer`    | É cliente?          |
| `org_owner_name` | Responsável         |
| `date_updated`   | Última atualização  |

Campos personalizados **não** entram nesta listagem. Use `GET /contacts/organizations/{org_id}` → `custom_fields`.

### `GET /contacts/organizations/{org_id}` — Detalhe da empresa

**Explicação:** retorna os dados completos da empresa, os leads, os negócios e os campos personalizados vinculados.

**Rota:** `GET https://api.sellbot.tech/v1/contacts/organizations/{org_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** não envie body nesta rota.

**Escopo:** `contacts:read`

**Resposta:** `organization`, `leads[]`, `deals[]`, `custom_fields`

**Campos extras em `organization`:** `website`, `country`, `zip`, `address`, `org_owner_id`, `lead_ids`, `date_added`, `tags`

`custom_fields` é o mapa `field_key` → valor do catálogo (`category=organization`), por exemplo `{ "setor": "Tecnologia" }`.

### `POST /contacts/organizations` — Criar empresa

**Explicação:** cadastra uma empresa e, se desejar, vincula um ou mais leads existentes.

**Rota:** `POST https://api.sellbot.tech/v1/contacts/organizations`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `contacts:write`

**Body (campos usuais):**

| Campo                                                   | Descrição                                                                                 |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `name`                                                  | Nome / razão social                                                                       |
| `cnpj`                                                  | CNPJ                                                                                      |
| `city`, `state`, `country`                              | Localização                                                                               |
| `lead_id` / `lead_ids`                                  | Um lead ou IDs separados por vírgula para vincular                                        |
| `website`, `city`, `state`, `country`, `zip`, `address` | Endereço e site                                                                           |
| `custom_fields`                                         | Campos personalizados — ver [Campos personalizados](#configuracoes-campos-personalizados) |

**Exemplo:**

```json
{
  "name": "Acme Ltda",
  "cnpj": "12345678000199",
  "city": "São Paulo",
  "custom_fields": [{ "sb_cf_setor": "Tecnologia" }]
}
```

**Resposta 200:** `{ "success": true, "org_id": "…", "lead_id"?, "is_new"? }`

**Erros:** `400` `NO_FIELDS_TO_UPDATE`

### `PATCH /contacts/organizations/{org_id}` — Editar empresa

**Explicação:** atualiza os dados da empresa. O `org_id` vai na URL e não deve ser repetido no body.

**Rota:** `PATCH https://api.sellbot.tech/v1/contacts/organizations/{org_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `contacts:write`

**Body:** somente campos a alterar — mesma tabela do create (`name`, `cnpj`, `lead_ids`, endereço, `sb_cf_*`, etc.).

**Exemplo:**

```json
{
  "name": "Acme Brasil Ltda",
  "lead_ids": "6a32177605cc37fab3b3b357",
  "custom_fields": [{ "sb_cf_setor": "Varejo" }]
}
```

**Resposta 200:** `{ "success": true, "org_id": "…" }`

**Erros:** `404` `ORG_NOT_FOUND`

### `DELETE /contacts/organizations/{org_id}` — Excluir empresa

**Explicação:** exclui a empresa e desvincula os leads afetados. Confirme o ID antes de continuar.

**Rota:** `DELETE https://api.sellbot.tech/v1/contacts/organizations/{org_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `contacts:write`

**Body:** `{}`

**Resposta 200:** `{ "success": true, "deleted_org_id", "deleted_org_name", "affected_leads" }`

**Erros:** `404` `ORG_NOT_FOUND`

---

# Relatórios

## Relatórios

Os mesmos números dos Relatórios da Sellbot: reuniões, negócios, atividades, leads e conversas.

O alcance segue o perfil de quem criou o token. Quem vê a conta alcança tudo. Quem vê só parte dela recebe os próprios números, e pedir os de outra pessoa dá HTTP **403**. Token de um número se comporta como vendedor daquele número, mesmo que tenha sido criado por um gestor.

Os painéis são os da tela de Relatórios: listar, abrir com os widgets, e os modelos e o catálogo de widgets. Os endereços antigos, sem `/reports` (`/metrics` e `/dashboards`), continuam respondendo.

### `GET /reports/dashboards` — Listar painéis

**Explicação:** lista os painéis de Relatórios que o dono do token enxerga. Os números vêm de `GET /reports/metrics/{metric_id}`.

**Rota:** `GET https://api.sellbot.tech/v1/reports/dashboards`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** não envie body nesta rota.

**Escopo:** `reports:read`

**Exemplo:**

```bash
curl -s 'https://api.sellbot.tech/v1/reports/dashboards' -H 'Authorization: Bearer sbt_SEU_TOKEN'
```

### `GET /reports/dashboards/templates` — Listar modelos de painel

**Explicação:** lista os modelos prontos, com quantos widgets cada um cria.

**Rota:** `GET https://api.sellbot.tech/v1/reports/dashboards/templates`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** não envie body nesta rota.

**Escopo:** `reports:read`

**Exemplo:**

```bash
curl -s 'https://api.sellbot.tech/v1/reports/dashboards/templates' -H 'Authorization: Bearer sbt_SEU_TOKEN'
```

### `GET /reports/dashboards/widget-catalog` — Listar widgets disponíveis

**Explicação:** lista os widgets que podem entrar num painel.

**Rota:** `GET https://api.sellbot.tech/v1/reports/dashboards/widget-catalog`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** não envie body nesta rota.

**Escopo:** `reports:read`

**Exemplo:**

```bash
curl -s 'https://api.sellbot.tech/v1/reports/dashboards/widget-catalog' -H 'Authorization: Bearer sbt_SEU_TOKEN'
```

### `GET /reports/dashboards/{dashboard_id}` — Abrir painel

**Explicação:** mostra os widgets de um painel e as métricas de cada um, sem os números.

**Rota:** `GET https://api.sellbot.tech/v1/reports/dashboards/{dashboard_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** não envie body nesta rota.

**Escopo:** `reports:read`

**Exemplo:**

```bash
curl -s 'https://api.sellbot.tech/v1/reports/dashboards/ID_DO_PAINEL' -H 'Authorization: Bearer sbt_SEU_TOKEN'
```

### `GET /reports/metrics` — Catálogo de métricas

**Explicação:** lista as métricas que **este token** consegue consultar, com os filtros de cada uma. Comece por aqui: o catálogo muda conforme o perfil.

**Rota:** `GET https://api.sellbot.tech/v1/reports/metrics`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Query:** nenhuma.

**Body:** não envie body nesta rota.

**Escopo:** `reports:read`

**Exemplo:**

```bash
curl -s 'https://api.sellbot.tech/v1/reports/metrics' \
  -H 'Authorization: Bearer sbt_SEU_TOKEN'
```

**Resposta (200):**

```json
{
  "metrics": [
    {
      "metric_id": "meetings_summary",
      "name": "Resumo de Reuniões",
      "category": "activities",
      "description": "Reuniões com vencimento no período: total, realizadas, concluídas, canceladas, confirmadas, online, presenciais e taxa de conclusão.",
      "filters": [
        { "name": "start_date", "type": "date", "required": false },
        { "name": "end_date", "type": "date", "required": false },
        { "name": "owner_id", "type": "string", "required": false }
      ]
    }
  ],
  "total": 1
}
```

### `GET /reports/metrics/{metric_id}` — Consultar métrica

**Explicação:** devolve o número da métrica, igual ao do widget nos Relatórios. Por exemplo, "quantas reuniões realizei nesta semana?" é o campo `realized` de `meetings_summary`, com o período da semana. Realizada é a reunião não cancelada cujo horário já passou.

**Rota:** `GET https://api.sellbot.tech/v1/reports/metrics/{metric_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Query:** somente os filtros que a métrica lista em `filters`. Datas em `AAAA-MM-DD`. Filtro fora da lista dá HTTP **400**, para a resposta não parecer filtrada sem estar.

**Body:** não envie body nesta rota.

**Escopo:** `reports:read`

**Exemplo:**

```bash
curl -s 'https://api.sellbot.tech/v1/reports/metrics/meetings_summary?start_date=2026-11-02&end_date=2026-11-08' \
  -H 'Authorization: Bearer sbt_SEU_TOKEN'
```

**Resposta (200):**

```json
{
  "metric_id": "meetings_summary",
  "name": "Resumo de Reuniões",
  "period": { "start": "2026-11-02", "end": "2026-11-08" },
  "owner_id": "id-do-responsavel",
  "data": [{ "total_meetings": 12, "realized": 10, "completed": 9, "cancelled": 1 }]
}
```

`owner_id` indica de quem é o número. O formato de `data` varia por métrica.

**Erros comuns:**

| Status | Quando                                                                              |
| ------ | ----------------------------------------------------------------------------------- |
| `400`  | Filtro fora da lista, data inválida, ou perfil com vários números sem `wpp_session` |
| `403`  | A métrica, o responsável ou o número estão fora do alcance do token                 |
| `404`  | Métrica fora do catálogo                                                            |

---

# Templates

## Templates

Templates de WhatsApp. Cada número é de uma integração, WhatsApp Web ou API oficial, e o formato do template muda com ela: por isso as leituras pedem `integration`.

### `GET /templates` — Listar templates

**Explicação:** lista os templates de WhatsApp de uma integração.

**Rota:** `GET https://api.sellbot.tech/v1/templates`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** não envie body nesta rota.

**Escopo:** `templates:read`

**Query:**

| Campo         | Obrigatório | Descrição                                                                                        |
| ------------- | ----------- | ------------------------------------------------------------------------------------------------ |
| `integration` | sim         | `waweb` (WhatsApp Web) ou `waba` (API oficial). Sem ele, ou com outro valor, a resposta é `400`. |
| `wpp_session` | não         | O número. Na API oficial o catálogo é do número: em conta com vários, informe qual.              |
| `page`        | não         | Página. Padrão: 1                                                                                |
| `limit`       | não         | Itens por página                                                                                 |
| `s`           | não         | Busca pelo nome                                                                                  |

**Exemplo:**

```bash
curl -s 'https://api.sellbot.tech/v1/templates?integration=waweb' \
  -H 'Authorization: Bearer sbt_SEU_TOKEN'
```

**WaWeb — cada item em `data[]`:** `name`, `sb_channel`, `sb_campaign`, `sb_template_active`, `sb_template_id`, `date_updated`

### `GET /templates/{template_id}` — Detalhe

**Explicação:** retorna os dados de um template.

**Rota:** `GET https://api.sellbot.tech/v1/templates/{template_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** não envie body nesta rota.

**Escopo:** `templates:read`

**Query:**

| Campo         | Obrigatório | Descrição                                                                                        |
| ------------- | ----------- | ------------------------------------------------------------------------------------------------ |
| `integration` | sim         | `waweb` (WhatsApp Web) ou `waba` (API oficial). Sem ele, ou com outro valor, a resposta é `400`. |
| `wpp_session` | não         | O número do template, em conta com vários.                                                       |

**Resposta:** objeto do template (`sb_template_id`, `name`, `sb_channel`, `sb_campaign`, …).

### `POST /templates/send` — Enviar template WhatsApp

**Explicação:** envia uma mensagem proativa para um lead usando um template aprovado ou configurado na Sellbot.

**Rota:** `POST https://api.sellbot.tech/v1/templates/send`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `templates:write`

**Body (campos usuais):**

| Campo            | Descrição                                                          |
| ---------------- | ------------------------------------------------------------------ |
| `lead_id`        | Lead destino — obrigatório                                         |
| `template_id`    | ID do template — obrigatório (`sb_template_id` WaWeb ou ID WABA)   |
| `msg_type`       | `sellbot_proactive` (WaWeb) ou `sellbot_waba` (Meta) — obrigatório |
| `sb_campaign`    | Campanha de rastreio                                               |
| `msg_channel`    | Canal opcional (quando o back suporta)                             |
| `template_name`  | Nome do template (opcional)                                        |
| `direct_sending` | Envio direto (opcional)                                            |
| `reset_session`  | Reinicia sessão antes do envio (opcional)                          |

Não envie chaves fora desta lista — a API retorna `400`.

**Exemplo (WaWeb):**

```bash
curl -s -X POST 'https://api.sellbot.tech/v1/templates/send' \
  -H 'Authorization: Bearer sbt_SEU_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"lead_id":"6a32177605cc37fab3b3b357","template_id":"tpl-abc","msg_type":"sellbot_proactive","sb_campaign":"onboarding"}'
```

**Resposta 200:** tipicamente `{ "success": true }` ou `{ "text": "…" }` após o envio ser processado.

Antes do envio, a API valida a disponibilidade de créditos. Sem saldo, retorna HTTP `402` com `code: "INSUFFICIENT_CREDITS"`; se o serviço de billing estiver indisponível, retorna HTTP `503` com `code: "BILLING_UNAVAILABLE"`.

### `POST /templates/{template_id}/delete` — Excluir template

**Explicação:** exclui o template do número. Na API oficial apaga também na Meta, sem volta, e a Meta não deixa criar outro com o mesmo nome por 30 dias. Conta, usuário e número vêm do token (número: o do token, o `wpp_session` do pedido ou o único da conta).

**Escopo:** `templates:manage`.

**Rota:** `POST https://api.sellbot.tech/v1/templates/{template_id}/delete`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
```

**Body:**

```json
{ "integration": "waba" }
```

**Resposta 200:** `{ "success": true, "message": "Template excluído", "data": {...} }`. **404:** o template não está no número.

---

# Agentes

## Agentes de IA

Na Sellbot: **Agentes de IA**.

### `GET /agents` — Listar agentes

**Explicação:** lista os agentes de IA disponíveis na sessão vinculada ao token.

**Rota:** `GET https://api.sellbot.tech/v1/agents`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** não envie body nesta rota.

**Escopo:** `agents:read`

**Query opcional:** `page`, `limit`, `filter` e `s`.

**Resposta:** `{ "data": [...], "total", "page", "limit" }`

**Cada agente:** `agent_id`, `name`, `agent_type`, `agent_active`

### `GET /agents/{agent_id}` — Detalhe

**Explicação:** retorna a configuração completa de um agente. A resposta pode conter prompts; não grave esse conteúdo em logs.

**Rota:** `GET https://api.sellbot.tech/v1/agents/{agent_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** não envie body nesta rota.

**Escopo:** `agents:read`

**Resposta:** `{ "data": [ { ... } ] }` — inclui os campos da listagem **mais** `prompt_who`, `prompt_personality`, `prompt_tone`, `prompt_behavior`, `date_added` e `date_updated`.

### `POST /agents` — Criar agente

**Explicação:** cria um agente de IA na conta e na sessão do token. Os mesmos campos da tela de agentes; conta e sessão vêm do token, nunca do body.

**Rota:** `POST https://api.sellbot.tech/v1/agents`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `agents:write`

**Body:** `name` e ao menos um canal (`channel` ou `channels`) são obrigatórios. Opcionais: `agent_type`, `agent_active`, `campaign`/`campaigns`, `prompt_who`, `prompt_personality`, `prompt_tone`, `prompt_behavior`, `business_hours`.

```json
{ "name": "SDR", "channels": ["whatsapp"], "prompt_who": "Você é a SDR da Loja X..." }
```

**Resposta 200:** `{ "success": true, "data": { ... } }` com o agente criado.

**Recusa:** `409` quando outro agente ativo já atende o mesmo canal e campanha na sessão.

### `PATCH /agents/{agent_id}` — Editar agente

**Explicação:** altera só os campos enviados; o resto continua como está.

**Rota:** `PATCH https://api.sellbot.tech/v1/agents/{agent_id}`

**Escopo:** `agents:write`

**Body:** qualquer campo do `POST /agents`. Ex.: `{ "prompt_tone": "Mais formal", "agent_active": false }`

**Resposta 200:** `{ "success": true, "data": { ... } }`

### `DELETE /agents/{agent_id}` — Excluir agente

**Explicação:** apaga o agente. Não tem volta: as conversas que ele atendia ficam sem agente até outro
assumir o canal e a campanha. Token de um número só exclui agente desse número; quem atende por alguns
números, só os deles.

**Rota:** `DELETE https://api.sellbot.tech/v1/agents/{agent_id}`

**Escopo:** `agents:write`

**Resposta 200:** `{ "success": true, "data": { "success": true, "text": "Agente excluído com sucesso." } }`

**Erros:** `404` agente fora do alcance do token.

### `GET /agents/{agent_id}/multi-agent` — Multiagente do agente

**Explicação:** como está o multiagente do agente (ligado, primário ou secundário, para quem ele passa a
conversa e com que instrução) e os agentes do mesmo número com canal e campanha em comum, que são os
únicos que podem entrar no grupo. O primário recebe a conversa primeiro e passa adiante; o secundário
recebe e pode devolver. Para mudar, use `PATCH /agents/{agent_id}` com `multi_agent_active`,
`multi_agent_is_primary` e `multi_agent_allowed_transfers` (`[{ "agent_id", "agent_name",
"transfer_instructions" }]`).

**Rota:** `GET https://api.sellbot.tech/v1/agents/{agent_id}/multi-agent`

**Escopo:** `agents:read`

**Resposta 200:** `{ "success": true, "data": { "agent_id", "wpp_session", "multi_agent_active", "multi_agent_is_primary", "allowed_transfers": [{ "agent_id", "agent_name", "transfer_instructions" }], "options": [{ "agent_id", "name", "channels", "campaigns", "agent_active", "multi_agent_is_primary" }] } }`

---

### `POST /agents/{agent_id}/avatar` — Trocar a foto do agente

**Explicação:** põe como foto do agente uma imagem que a pessoa mandou no chat do Sel (JPG, PNG ou WebP até 1 MB). Só o Sel usa esta rota; com token de integração, a resposta é `400`. Para trocar a foto por um endereço, use `PATCH /agents/{agent_id}` com `agent_avatar`.

**Rota:** `POST https://api.sellbot.tech/v1/agents/{agent_id}/avatar`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
```

**Escopo:** `agents:write`.

**Body:**

```json
{ "attachment_id": "ID_DO_ARQUIVO_NO_CHAT" }
```

---

## Agentes de IA — Base de conhecimento

O agente consulta as bases do número para responder, escolhendo pelo "quando usar" de cada uma. Ler um site para a base fica na tela. Número: o do token, o `wpp_session` do pedido ou o único da conta.

### `GET /agents/knowledge-bases` — Listar bases de conhecimento

**Explicação:** as bases do número, com o "quando usar" (`usage_hint`) e quantos trechos cada uma tem.

**Escopo:** `knowledge:read`.

**Rota:** `GET https://api.sellbot.tech/v1/agents/knowledge-bases?wpp_session=meu_numero`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
```

**Resposta 200:** `{ "success": true, "data": { "wpp_session", "knowledge_bases": [{ "kbase_id", "name", "type", "usage_hint", "total_chunks", "date_updated" }] } }`.

### `GET /agents/knowledge-bases/{kbase_id}` — Consultar base de conhecimento

**Explicação:** o conteúdo de uma base: os primeiros 60 trechos, com título, texto (cortado em 1.500 caracteres) e fonte.

**Escopo:** `knowledge:read`.

**Rota:** `GET https://api.sellbot.tech/v1/agents/knowledge-bases/{kbase_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
```

### `POST /agents/knowledge-bases/{kbase_id}/preview` — Testar pergunta na base de conhecimento

**Explicação:** o que o agente encontraria na base para uma pergunta: os trechos que entram na resposta (`used: true`) e os que ficaram perto, mas de fora. Só lê, apesar de ser POST.

**Escopo:** `knowledge:read`.

**Rota:** `POST https://api.sellbot.tech/v1/agents/knowledge-bases/{kbase_id}/preview`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
```

**Body:**

```json
{ "question": "Vocês atendem aos sábados?" }
```

### `POST /agents/knowledge-bases` — Criar base de conhecimento

**Explicação:** base nova a partir de texto: nome, "quando usar" (em que tipo de pergunta o agente consulta a base) e trechos, um assunto por trecho. Os agentes do número passam a consultá-la.

**Escopo:** `knowledge:write`.

**Rota:** `POST https://api.sellbot.tech/v1/agents/knowledge-bases`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
```

**Body:**

```json
{
  "name": "Horários e endereço",
  "usage_hint": "Quando perguntarem horário ou onde fica",
  "chunks": [{ "title": "Horário", "content": "Seg a sáb, 8h às 18h." }]
}
```

### `POST /agents/knowledge-bases/{kbase_id}/edit` — Editar base de conhecimento

**Explicação:** só o que muda, aplicado sobre a base atual: `name`, `usage_hint`, `add_chunks` (no fim), `replace_chunks` (`index` do trecho, de `GET /agents/knowledge-bases/{kbase_id}`) e `remove_indexes`. Índice que não existe é recusado, e a base não pode ficar sem trecho.

**Escopo:** `knowledge:write`.

**Rota:** `POST https://api.sellbot.tech/v1/agents/knowledge-bases/{kbase_id}/edit`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
```

**Body:**

```json
{ "replace_chunks": [{ "index": 0, "title": "Horário", "content": "Seg a sáb, 8h às 18h." }] }
```

### `DELETE /agents/knowledge-bases/{kbase_id}` — Excluir base de conhecimento

**Explicação:** exclui a base, sem volta. Os agentes deixam de usar o conteúdo dela.

**Escopo:** `knowledge:write`.

**Rota:** `DELETE https://api.sellbot.tech/v1/agents/knowledge-bases/{kbase_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
```

---

# Transmissões

## Transmissões

Ler transmissões e resultados, contar o público de um filtro, checar antes do disparo, montar rascunho, cancelar e encerrar a pausada. **Disparar não existe na API:** gasta crédito e é sempre da pessoa, na tela. Só para conta com Transmissões liberada; usuário sessão precisa do módulo Transmissões e só alcança os números dele. Token de um número só vê as transmissões que saem dele.

### `GET /broadcasts` — Listar transmissões

**Explicação:** as transmissões da conta, com status, número, template, horário e o funil de cada envio (`list`, `by_status`, `delivered`, `read`).

**Escopo:** `broadcasts:read`.

**Rota:** `GET https://api.sellbot.tech/v1/broadcasts`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
```

**Resposta 200:** `{ "success": true, "data": { "broadcasts": [...], "total" } }`.

### `GET /broadcasts/segments` — Listar segmentos de transmissão

**Explicação:** os públicos salvos, com o filtro de cada um. Público montado dentro de uma transmissão não aparece aqui.

**Escopo:** `broadcasts:read`.

**Rota:** `GET https://api.sellbot.tech/v1/broadcasts/segments`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
```

**Resposta 200:** `{ "success": true, "data": { "segments": [{ "segment_id", "name", "filter", "updated_at" }], "total" } }`.

### `GET /broadcasts/segments/options` — Valores para filtrar o público

**Explicação:** os valores que existem nos leads para montar o filtro: campanhas, origens, campanhas de anúncio e UTMs.

**Escopo:** `broadcasts:read`.

**Rota:** `GET https://api.sellbot.tech/v1/broadcasts/segments/options`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
```

### `POST /broadcasts/segments/preview` — Contar o público de um filtro

**Explicação:** quantas pessoas um filtro alcança hoje pelo WhatsApp: quem tem número válido, sem quem pediu para sair, sem duplicados. Só lê; a amostra de pessoas não sai. Sem número no filtro, vale o `sender` ou o número do token.

**Escopo:** `broadcasts:read`.

**Rota:** `POST https://api.sellbot.tech/v1/broadcasts/segments/preview`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
```

**Body:**

```json
{ "sender": "meu_numero", "filter": { "tags_any": ["cliente"], "is_customer": true } }
```

**Resposta 200:** `{ "success": true, "data": { "people", "matched_leads", "duplicates", "without_contact", "opted_out", "flagged_invalid", "sessions" } }`.

### `GET /broadcasts/{broadcast_id}` — Consultar transmissão e resultados

**Explicação:** uma transmissão e o acompanhamento de cada envio: quem estava na lista e por que alguém ficou de fora, enviadas, entregues, lidas, falhas, quem respondeu em até 7 dias, pedidos de saída, erro e, se pausada, até quando decidir (`decide_until`).

**Escopo:** `broadcasts:read`.

**Rota:** `GET https://api.sellbot.tech/v1/broadcasts/{broadcast_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
```

### `GET /broadcasts/{broadcast_id}/preflight` — Checar transmissão antes do disparo

**Explicação:** monta a lista inteira sem gravar e diz quantos recebem, quem fica de fora e por quê, variáveis sem valor, créditos e o que bloqueia o disparo. Uma checagem por vez por conta (`429` se já houver outra).

**Escopo:** `broadcasts:read`.

**Rota:** `GET https://api.sellbot.tech/v1/broadcasts/{broadcast_id}/preflight`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
```

### `POST /broadcasts/drafts` — Montar rascunho de transmissão

**Explicação:** monta o rascunho com o público (um segmento só desta transmissão), o WhatsApp e o horário. Não dispara e não gasta crédito: a pessoa confere a checagem e dispara na tela. O template precisa ser do canal Transmissão, aprovado e do número que envia (`sender`). `fallbacks` é o texto que entra na variável de quem não tem o dado. `schedule.start_at` vai de 5 minutos a 30 dias à frente; `window` é `account` (dentro do Expediente) ou `always`.

**Escopo:** `broadcasts:write`.

**Rota:** `POST https://api.sellbot.tech/v1/broadcasts/drafts`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
```

**Body:**

```json
{
  "name": "Black Friday clientes",
  "sender": "meu_numero",
  "template_id": "1234567890",
  "filter": { "is_customer": true },
  "fallbacks": { "primeiro_nome": "cliente" },
  "schedule": { "start_at": "2026-11-27T09:00:00-03:00", "window": "account" }
}
```

**Resposta 200:** **201** `{ "success": true, "message": "Rascunho montado", "data": { "broadcast_id", "status": "draft", ... } }`.

### `POST /broadcasts/{broadcast_id}/cancel` — Cancelar transmissão

**Explicação:** agendada ou em envio: quem ainda não recebeu não recebe mais. Quem já recebeu fica como está. Não tem volta.

**Escopo:** `broadcasts:write`.

**Rota:** `POST https://api.sellbot.tech/v1/broadcasts/{broadcast_id}/cancel`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
```

**Body:**

```json
{}
```

**Resposta 200:** `{ "success": true, "data": { "canceled": true } }`. **404:** não encontrada ou já terminou.

### `POST /broadcasts/{broadcast_id}/stop` — Encerrar transmissão pausada

**Explicação:** para a transmissão pausada esperando decisão: o resto da lista fica de fora. Continuar o envio não existe na API, porque volta a gastar crédito: é na tela.

**Escopo:** `broadcasts:write`.

**Rota:** `POST https://api.sellbot.tech/v1/broadcasts/{broadcast_id}/stop`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
```

**Body:**

```json
{}
```

**Resposta 200:** `{ "success": true, "data": { "decision": "stop", "executions" } }`. **409:** não está esperando decisão.

---

# Automações

## Automações

Automações da conta: o que existe, como cada uma funciona, como estão rodando, e ligar, desligar, duplicar ou excluir. Para criar ou editar o fluxo, valide o rascunho aqui e salve na tela de Automações. Token de um número vê as automações desse número e as que valem para a conta inteira. Usuário com acesso restrito precisa do módulo de Automações liberado no cadastro.

### `GET /automations` — Listar automações

**Explicação:** lista as automações com o gatilho, se está ligada, o número em que vale e os números dos últimos 30 dias (execuções, falhas, canceladas e a última vez que rodou).

**Rota:** `GET https://api.sellbot.tech/v1/automations`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** não envie body nesta rota.

**Query:** `active` (`true` ou `false`), `q` (parte do nome), `page` e `limit` (até 50).

**Escopo:** `automations:read`

**Exemplo:**

```bash
curl -s 'https://api.sellbot.tech/v1/automations?active=true' -H 'Authorization: Bearer sbt_SEU_TOKEN'
```

### `GET /automations/{automation_id}` — Consultar automação

**Explicação:** devolve o gatilho com os filtros, as regras de cancelamento e cada passo com a configuração, o próximo passo e quantos leads chegaram, concluíram, falharam ou desviaram nele. No passo de webhook saem só o método, o endereço sem parâmetros e os nomes dos campos, nunca os valores.

**Rota:** `GET https://api.sellbot.tech/v1/automations/{automation_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** não envie body nesta rota.

**Escopo:** `automations:read`

**Exemplo:**

```bash
curl -s 'https://api.sellbot.tech/v1/automations/AUTOMATION_ID' -H 'Authorization: Bearer sbt_SEU_TOKEN'
```

### `GET /automations/{automation_id}/runs` — Listar execuções de uma automação

**Explicação:** lista as execuções da automação, das mais novas para as mais antigas, com o lead, o passo atual, o motivo do cancelamento e o erro de quem falhou.

**Rota:** `GET https://api.sellbot.tech/v1/automations/{automation_id}/runs`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** não envie body nesta rota.

**Query:** `status` (`active`, `completed`, `canceled` ou `failed`) e `limit` (até 100, padrão 30).

**Escopo:** `automations:read`

**Exemplo:**

```bash
curl -s 'https://api.sellbot.tech/v1/automations/AUTOMATION_ID/runs?status=failed' -H 'Authorization: Bearer sbt_SEU_TOKEN'
```

### `GET /automations/runs/{run_id}` — Consultar execução de automação

**Explicação:** mostra uma execução passo a passo: o que rodou, quando, quantas tentativas e o erro de cada passo que falhou.

**Rota:** `GET https://api.sellbot.tech/v1/automations/runs/{run_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** não envie body nesta rota.

**Escopo:** `automations:read`

**Exemplo:**

```bash
curl -s 'https://api.sellbot.tech/v1/automations/runs/RUN_ID' -H 'Authorization: Bearer sbt_SEU_TOKEN'
```

### `GET /automations/leads/{lead_id}/runs` — Listar execuções de automação de um lead

**Explicação:** mostra por quais automações o lead passou ou está passando, com o nome da automação, o passo atual e as falhas.

**Rota:** `GET https://api.sellbot.tech/v1/automations/leads/{lead_id}/runs`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** não envie body nesta rota.

**Query:** `limit` (até 100, padrão 30).

**Escopo:** `automations:read`

**Exemplo:**

```bash
curl -s 'https://api.sellbot.tech/v1/automations/leads/LEAD_ID/runs' -H 'Authorization: Bearer sbt_SEU_TOKEN'
```

### `PATCH /automations/{automation_id}/status` — Ligar ou desligar automação

**Explicação:** liga ou desliga a automação. Vale para os próximos disparos: quem já está no meio do fluxo continua até o fim. O dono da automação não muda.

**Rota:** `PATCH https://api.sellbot.tech/v1/automations/{automation_id}/status`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
```

**Body:** `{ "active": true }` para ligar, `{ "active": false }` para desligar.

**Escopo:** `automations:write`

**Exemplo:**

```bash
curl -s -X PATCH 'https://api.sellbot.tech/v1/automations/AUTOMATION_ID/status' -H 'Authorization: Bearer sbt_SEU_TOKEN' -H 'Content-Type: application/json' -d '{"active": false}'
```

### `POST /automations/{automation_id}/duplicate` — Duplicar automação

**Explicação:** cria uma cópia desligada da automação, com o mesmo gatilho, passos e regras. O dono da cópia é quem criou o token. A cópia ocupa uma automação do plano; sem vaga, a resposta é HTTP **402**.

**Rota:** `POST https://api.sellbot.tech/v1/automations/{automation_id}/duplicate`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
```

**Body:** `{ "name": "Boas-vindas v2" }` (opcional; sem ele, o nome é "<nome> (cópia)").

**Escopo:** `automations:write`

**Exemplo:**

```bash
curl -s -X POST 'https://api.sellbot.tech/v1/automations/AUTOMATION_ID/duplicate' -H 'Authorization: Bearer sbt_SEU_TOKEN' -H 'Content-Type: application/json' -d '{}'
```

### `DELETE /automations/{automation_id}` — Excluir automação

**Explicação:** exclui a automação e libera a vaga dela no plano. Quem já está no meio do fluxo continua até o fim.

**Rota:** `DELETE https://api.sellbot.tech/v1/automations/{automation_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
```

**Body:** não envie body nesta rota.

**Escopo:** `automations:write`

**Exemplo:**

```bash
curl -s -X DELETE 'https://api.sellbot.tech/v1/automations/AUTOMATION_ID' -H 'Authorization: Bearer sbt_SEU_TOKEN'
```

### `POST /automations/validate` — Validar rascunho de automação

**Explicação:** confere um rascunho de automação com as mesmas regras de quando a tela salva (passos, caminhos, gatilho, passo que não combina com o gatilho) e devolve o fluxo montado. Não grava nada e não gasta vaga do plano. Os passos vão em ordem; o gatilho e o fim entram sozinhos, e o passo sem `next` segue para o próximo da lista. Para mudar uma automação, mande `automation_id`: o passo que vier com o mesmo `id` e `type` e sem `config` fica como está gravado.

A resposta separa `problems` (o rascunho não salva) de `pending` (falta um dado que se escolhe na tela, como o template). `valid` é `true` quando os dois estão vazios. O passo de webhook volta sem os valores de cabeçalho, corpo e parâmetros.

**Rota:** `POST https://api.sellbot.tech/v1/automations/validate`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
```

**Body:**

```json
{
  "draft": {
    "name": "Boas-vindas",
    "trigger": { "type": "lead.tagged", "filters": { "tags": ["quente"] } },
    "policies": { "once_per_lead": true },
    "steps": [
      {
        "id": "espera",
        "type": "wait",
        "config": { "mode": "relative", "duration": 10, "unit": "minutes" }
      },
      { "id": "mensagem", "type": "send_template", "config": { "template_id": "TEMPLATE_ID" } }
    ]
  }
}
```

**Escopo:** `automations:write`

**Exemplo:**

```bash
curl -s -X POST 'https://api.sellbot.tech/v1/automations/validate' -H 'Authorization: Bearer sbt_SEU_TOKEN' -H 'Content-Type: application/json' -d '{"draft":{"name":"Teste","trigger":{"type":"lead.created"},"steps":[{"id":"espera","type":"wait","config":{"mode":"relative","duration":1,"unit":"days"}}]}}'
```

---

# Integrações

## Integrações — E-mail

Visão geral do e-mail da conta, os e-mails de um lead e o envio de um e-mail de texto ao lead. Criar modelo e mexer em domínio ficam na tela. Envio chega no cliente e gasta crédito.

### `GET /integrations/email` — Visão geral do e-mail

**Explicação:** se o e-mail está liberado na conta, se o domínio está verificado, o uso de créditos do ciclo (do mês e do dia), os remetentes e os modelos (sem o HTML). Sem liberação, volta só `enabled: false`.

**Escopo:** `email:read`.

**Rota:** `GET https://api.sellbot.tech/v1/integrations/email`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
```

### `GET /integrations/email/messages` — E-mails de um lead

**Explicação:** os e-mails enviados a um lead, mais recentes primeiro: assunto, situação, entregue, aberto, clicado, respondido, devolvido ou marcado como spam, e o motivo da falha. Sem o corpo e sem os destinatários em cópia. O lead tem de estar ao alcance do token.

**Escopo:** `email:read`.

**Rota:** `GET https://api.sellbot.tech/v1/integrations/email/messages?lead_id=LEAD_ID`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
```

### `POST /integrations/email/messages` — Enviar e-mail a um lead

**Explicação:** e-mail de texto para o lead, com o remetente de quem criou o token (confirmado, em domínio verificado). Vai só para um endereço do próprio lead (o principal, ou outro dele em `to`), sem cópia. Chega no cliente e gasta 1 crédito; sem crédito do mês ou do dia, é recusado. O texto vira HTML escapado, com o rastreio de abertura e clique ligado.

**Escopo:** `email:write`.

**Rota:** `POST https://api.sellbot.tech/v1/integrations/email/messages`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
```

**Body:**

```json
{
  "lead_id": "LEAD_ID",
  "sender_id": "SENDER_UUID",
  "subject": "Sua proposta",
  "text": "Oi, Ana!\n\nSegue a proposta que combinamos."
}
```

`attachment_ids` (até 5) é só do Sel: os arquivos que a pessoa enviou no chat dele, decifrados no envio e anexados (até 28 MB somados). Com token de integração, o pedido com `attachment_ids` é recusado (400). A resposta lista os nomes anexados em `attachments`.

---

## Integrações — Api4Com

### `GET /integrations/api4com` — Status da integração de telefonia

**Explicação:** verifica se a telefonia Api4Com está configurada e retorna somente dados não sensíveis. Senha, token e websocket nunca aparecem na resposta.

**Rota:** `GET https://api.sellbot.tech/v1/integrations/api4com`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** não envie body nesta rota.

**Escopo:** `integrations:read`

**Sucesso:**

```json
{
  "success": true,
  "int_api4com_id": "…",
  "int_api4com_active": true,
  "int_api4com_domain": "sua-conta.api4com.com",
  "int_api4com_extension": "1001"
}
```

**Sem integração configurada (HTTP 200):** `{ "success": false, "error": "BUSINESS_ERROR", "code": "BUSINESS_ERROR", "message": "Integração não configurada.", "text": "Integração não configurada." }`

### `GET /integrations/api4com/calls` — Listar ligações VoIP

**Explicação:** lista ligações da conta na integração Api4Com. Opcionalmente filtra por `lead_id`. Não retorna URL de gravação nem transcrição.

**Rota:** `GET https://api.sellbot.tech/v1/integrations/api4com/calls`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Query (opcional):** `page` (default `1`), `limit` (default `25`, máx. `100`), `lead_id` (filtra ligações do lead).

**Body:** não envie body nesta rota.

**Escopo:** `integrations:read`

**Exemplo:**

```bash
curl -s 'https://api.sellbot.tech/v1/integrations/api4com/calls?page=1&limit=25' \
  -H 'Authorization: Bearer sbt_SEU_TOKEN'
```

**Sucesso:**

```json
{
  "calls": [
    {
      "call_id": "…",
      "call_direction": "outbound",
      "call_status": "completed",
      "call_started_at": "…",
      "call_ended_at": "…",
      "call_duration_seconds": 42,
      "call_disposition": "answered",
      "call_summary": "…",
      "lead_id": "…",
      "lead_name": "…"
    }
  ],
  "total": 1,
  "page": 1,
  "pages": 1,
  "limit": 25
}
```

---

## Integrações — Formulários do site

Os formulários do Plugin no site do cliente.

### `GET /integrations/plugins` — Formulários do site e o funil de cada um

**Explicação:** os formulários do Plugin da conta (ou de um número, com `wpp_session`): nome, número, modo, domínio, link público, campanha, campos, Pixel e Google Ads ligados, e o funil — exibições, cliques no botão, aberturas, envios — com as taxas de envio sobre aberturas e sobre exibições. Sem cores, textos de tela nem imagens. Editar fica na tela, porque vai direto para o site.

**Escopo:** `forms:read`.

**Rota:** `GET https://api.sellbot.tech/v1/integrations/plugins`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
```

### `POST /integrations/plugins` — Criar formulário do site

**Explicação:** cria um formulário do Plugin no número informado (`wpp_session`). Campos: `form_name` (obrigatório), `form_fields` (obrigatório, de 1 a 20 campos), `form_domain` (o site; único na Sellbot, ocupado responde `409`), `form_mode` (`button` ou `inline`), `form_title`, `form_subtitle`, `form_phone`, `form_phone_msg`, `form_msg_title`, `form_msg_text`, `form_note` e `form_campaign`. Texto que não vier fica vazio. Webhook, imagem, pixels e o link público ficam na tela: mandar outro campo responde `400`.

Cada item de `form_fields`: `form_field_name` (obrigatório; a chave do campo no lead, como `first_name`, `email`, `phone` ou a de um campo personalizado — no modo `button` o formulário precisa do `phone`), `type` (`text`, `email`, `tel`, `number`, `textarea`, `select`, `checkbox` ou `date`), `placeholder` (o texto dentro do campo; padrão vazio), `required` (padrão `false`), `order` (posição a partir de 0; padrão, a ordem da lista) e `opts` (as opções de um `select`). O botão de enviar entra sozinho no fim, com o texto "Enviar".

Token de um número só cria nesse número: `wpp_session` de outro número responde `403`. Token cujo criador perdeu o acesso à conta (inativo ou fora dela) responde `403`.

**Rota:** `POST https://api.sellbot.tech/v1/integrations/plugins`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
```

**Escopo:** `forms:write`.

**Body:**

```json
{
  "form_name": "Site institucional",
  "wpp_session": "meu_numero",
  "form_domain": "www.suaempresa.com.br",
  "form_mode": "button",
  "form_fields": [
    { "form_field_name": "first_name", "type": "text", "required": true },
    { "form_field_name": "phone", "type": "tel", "placeholder": "Seu WhatsApp", "required": true },
    { "form_field_name": "interesse", "type": "select", "opts": ["Compra", "Aluguel"] }
  ]
}
```

### `PATCH /integrations/plugins/{form_id}` — Editar formulário do site

**Explicação:** muda só os campos que vierem, com a mesma lista da criação. `form_fields`, quando vem, troca a lista inteira (ao menos 1 campo). Sem `form_mode`, o modo e o link público ficam como estão; trocar o modo não liga nem desliga o link público (passar para `button` desliga, porque o modo botão não tem link). Formulário de um número que o token não alcança responde `404`; formulário antigo, sem número, só é editável por quem alcança a conta inteira. Token de um número não move o formulário para outro: `wpp_session` diferente do número do token responde `403`.

**Rota:** `PATCH https://api.sellbot.tech/v1/integrations/plugins/{form_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
```

**Escopo:** `forms:write`.

---

## Campanhas

### `GET /campaigns` — Campanhas e quem atende cada uma

**Explicação:** as campanhas do número e o caminho do lead novo em cada uma: o agente de texto ativo que responde (com os canais dele), o template que é a primeira mensagem por canal, agente desligado ou template parado na campanha, e os templates padrão de cada canal (sem campanha). Segue as regras do motor: responde o agente ativo com o canal e a campanha do lead (o secundário de multiagente só entra por transferência); a primeira mensagem é o template ativo e aprovado do canal com a campanha, e sem ele o padrão do canal. Número: o do token, o `wpp_session` do pedido ou o único da conta.

**Escopo:** `campaigns:read`.

**Rota:** `GET https://api.sellbot.tech/v1/campaigns?wpp_session=meu_numero`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
```

**Resposta 200:** `{ "success": true, "data": { "wpp_session", "campaigns": [{ "name", "description", "agents", "first_message", "inactive_agents", "idle_templates" }], "channel_defaults": [...] } }`.

### `POST /campaigns` — Criar ou editar campanha

**Explicação:** põe a campanha na lista para escolher (agente, template, formulário, lead), ou muda a descrição e a cor de uma que já existe. Ligar a campanha a um agente ou template é no agente ou no template.

**Escopo:** `campaigns:write`.

**Rota:** `POST https://api.sellbot.tech/v1/campaigns`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
```

**Body:**

```json
{ "name": "black_friday", "description": "Oferta de novembro", "color": "#00A868" }
```

### `DELETE /campaigns/{campaign}` — Tirar campanha da lista

**Explicação:** tira a campanha da lista para escolher. Agentes, templates e leads que já usam o nome continuam com ele, e quem responde o lead novo não muda.

**Escopo:** `campaigns:write`.

**Rota:** `DELETE https://api.sellbot.tech/v1/campaigns/black_friday`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
```

---

## Conversões

### `POST /conversions` — Registrar conversão de marketing

**Explicação:** registra a entrada de um lead por campanha ou outra conversão de marketing.

**Rota:** `POST https://api.sellbot.tech/v1/conversions`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `conversions:create`

O tenant vinculado ao token precisa ter uma assinatura ativa.

**Body:**

| Campo                                         | Obrigatório | Descrição                                                          |
| --------------------------------------------- | ----------- | ------------------------------------------------------------------ |
| `phone`                                       | sim         | Telefone com DDI (aliases: `telefone`, `whatsapp`, `phone_number`) |
| `first_name` ou `full_name`                   | sim         | Nome (aliases: `nome`, `name`)                                     |
| `custom_attributes`                           | não         | Objeto — chaves são achatadas na raiz                              |
| `utm_source`, `utm_medium`, `utm_campaign`, … | não         | Atribuição                                                         |
| `sb_campaign`                                 | não         | Campanha Sellbot (herda `utm_campaign` se vazio)                   |

**Exemplo:**

```bash
curl -s -X POST 'https://api.sellbot.tech/v1/conversions' \
  -H 'Authorization: Bearer sbt_SEU_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"phone":"5511999887766","first_name":"Ana","sb_campaign":"landing-julho","utm_source":"google"}'
```

**Resposta 200:** `{ "success": true, "lead_id": "…", "org_id": "…", "is_new_lead": true, "wpp_session": "…" }` — campos retornados pelo processador proativo quando disponíveis.

**Erros 400:**

```json
{ "success": false, "error": "INVALID_DATA", "code": "INVALID_DATA", "message": "…", "text": "…" }
{ "success": false, "error": "DUPLICATED_CALL", "code": "DUPLICATED_CALL", "message": "…", "text": "…" }
```

> Proteção de negócio: a mesma combinação de conta + telefone + campanha é bloqueada por aproximadamente uma hora.

Outros erros: `401 INVALID_TOKEN`; `403 INSUFFICIENT_SCOPE`, `TENANT_MISMATCH` ou `SUBSCRIPTION_NOT_ELIGIBLE`; `502/504 PROCESSOR_ERROR`; `503 PROCESSOR_ERROR` quando a verificação de assinatura estiver temporariamente indisponível.

---

## Integrações — Diagnóstico

O que está errado com o WhatsApp e o e-mail da conta, e o passo para corrigir na tela. Só leitura, só com token de pessoa, com o mesmo alcance de `GET /settings/integrations-status`: a conta do token, o número do token quando ele tem um, e os números de quem é restrito. Quem é restrito não recebe o que é da conta inteira (saúde da conta na Meta, portfólio, pagamento, entrega de e-mail da conta): no lugar vem `account_note`, o recado para pedir ao responsável pela conta.

Cada resposta traz `findings`: `severity` (`blocker`, `warning` ou `info`), `code`, `message` e `fix` (a tela ou ação que já existe; `null` quando é com o suporte).

### `GET /integrations/diagnostics/whatsapp` — Diagnóstico do WhatsApp

**Explicação:** de cada número ativo, pelo que está salvo, sem consultar a Meta: o status que a tela mostra × a última checagem (`connection.status_stuck` quando divergem), o que a Meta disse do número oficial na última checagem, as quedas e conexões dos últimos 7 dias (os Logs de Conexão) e os erros de envio por código, com o significado e de quem é o problema (`scope`: `account`, `template`, `contact` ou `message`). `wpp_session` (opcional) pede um número só; sem ele, até 20.

**Rota:** `GET https://api.sellbot.tech/v1/integrations/diagnostics/whatsapp?wpp_session=minha_sessao`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Escopo:** `integrations:read`.

### `GET /integrations/diagnostics/whatsapp/live` — Checagem ao vivo de um número de WhatsApp

**Explicação:** um número agora: a instância no servidor do WhatsApp (conectada, quebrada ou inexistente) e, na API oficial, o que a Meta diz neste momento do número (status, plataforma, qualidade, `health_status`), da conta (bloqueios, limite de envio do portfólio, verificação da empresa, outro app ligado à conta) e dos templates reprovados, pausados ou com qualidade baixa, com o motivo. `wpp_session` é obrigatório em conta com vários números. Consulta a Meta: o resultado vale 5 minutos (`cached: true`), e muitas checagens ao mesmo tempo respondem `429`. Templates só para quem usa Templates, Transmissões ou envia template na Central (senão vem `templates_note`).

**Rota:** `GET https://api.sellbot.tech/v1/integrations/diagnostics/whatsapp/live?wpp_session=minha_sessao`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Escopo:** `integrations:read`.

### `GET /integrations/diagnostics/email` — Diagnóstico do e-mail

**Explicação:** a entrega de e-mail da conta nos últimos 7 dias: enviados, devolvidos e marcados como spam, os problemas por motivo (sem o endereço de ninguém), se o envio está pausado e por quê, e se o domínio está verificado. Sem e-mail liberado, volta só `enabled: false`. Para um lead só, use `GET /integrations/email/messages`.

**Rota:** `GET https://api.sellbot.tech/v1/integrations/diagnostics/email`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Escopo:** `email:read`.

---

# Configurações

## Configurações — Conta

Expediente, a situação das integrações e a cobrança. Só com token de pessoa: cada rota responde pelo que ela pode na tela.

### `GET /settings/business-hours` — Expediente da conta

**Explicação:** o expediente: fuso e, para cada dia, se abre e o horário. Os agentes e as transmissões usam para saber se é horário comercial.

**Rota:** `GET https://api.sellbot.tech/v1/settings/business-hours`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Escopo:** `account:read`.

### `PATCH /settings/business-hours` — Mudar o expediente

**Explicação:** troca o expediente inteiro. Só quem gerencia a conta (o dono ou a equipe Sellbot). Ao menos um dia aberto, e o início antes do fim. Sem `timezone`, fica o fuso já salvo da conta (ou `America/Sao_Paulo`, se a conta ainda não tem expediente).

**Rota:** `PATCH https://api.sellbot.tech/v1/settings/business-hours`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
```

**Escopo:** `account:write`.

**Body:**

```json
{
  "business_hours": {
    "timezone": "America/Sao_Paulo",
    "days": {
      "mon": { "enabled": true, "start": "09:00", "end": "18:00" },
      "tue": { "enabled": true, "start": "09:00", "end": "18:00" },
      "wed": { "enabled": true, "start": "09:00", "end": "18:00" },
      "thu": { "enabled": true, "start": "09:00", "end": "18:00" },
      "fri": { "enabled": true, "start": "09:00", "end": "18:00" },
      "sat": { "enabled": false, "start": "09:00", "end": "12:00" },
      "sun": { "enabled": false, "start": "09:00", "end": "12:00" }
    }
  }
}
```

### `GET /settings/integrations-status` — Situação das integrações

**Explicação:** como estão as integrações, pelo que está salvo, sem consultar WhatsApp, Meta ou Google na hora: cada número de WhatsApp ativo (conectado ou não, API oficial ou WhatsApp Web e o que a Meta diz do número oficial; número desativado na conta não aparece), as conexões de Meta Lead Ads, o e-mail (liberado, domínio verificado) e as agendas de quem chama. Quem é restrito a números vê só os dele.

**Rota:** `GET https://api.sellbot.tech/v1/settings/integrations-status`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Escopo:** `integrations:read`.

### `GET /settings/billing` — Assinatura, limites e créditos

**Explicação:** a situação da assinatura, os limites (usuários, times e números: quanto pode e quanto usa) e cada crédito (quanto tem, quanto usou e quando renova). Só para o dono da conta. `invoices_visible` diz se quem chama pode ver as faturas.

**Rota:** `GET https://api.sellbot.tech/v1/settings/billing`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Escopo:** `billing:read`.

### `GET /settings/billing/invoices` — Faturas da conta

**Explicação:** as faturas: número, situação, tipo, valor, vencimento, pagamento e o link. Só para o titular da conta e quem ele liberou; os outros recebem `403`. Filtros: `invoice_status` (um ou mais, separados por vírgula: `open`, `processing`, `overdue`, `paid`, `refunded`, `chargeback`, `void`, `canceled` ou `pending_payment`), `invoice_type` (`setup`, `recurring` ou `upgrade`), `page` (a partir de 1) e `limit` (padrão 25, até 100).

**Rota:** `GET https://api.sellbot.tech/v1/settings/billing/invoices`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Escopo:** `billing:read`.

---

## Configurações — Usuários

### `GET /users` — Listar usuários do tenant

**Explicação:** lista os usuários da conta. O token precisa estar vinculado a um usuário administrador.

**Rota:** `GET https://api.sellbot.tech/v1/users`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** não envie body nesta rota.

**Escopo:** `users:read` · Requer usuário admin no token.

**Query opcional:** `page`, `limit`, `s`, `filter` e `user_role`.

**Cada usuário (list):** `user_id`, `user_name`, `user_email`, `user_role`, `user_active`

**Cada usuário (get):** campos da listagem **mais** `user_phone`, `user_avatar_img`, `date_added`, `date_updated` e `client_company` (quando disponível).

### `GET /users/{user_id}` — Detalhe

**Explicação:** retorna os dados públicos de um usuário. Senha e chaves de ativação nunca são expostas.

**Rota:** `GET https://api.sellbot.tech/v1/users/{user_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** não envie body nesta rota.

**Escopo:** `users:read` · Requer usuário admin no token.

**Resposta:** `[ { "user_id", "user_name", "user_email", "user_role", "user_active", "user_phone"?, "user_avatar_img"?, "date_added"?, "date_updated"?, "client_company"? } ]`

### `PATCH /users/{user_id}` — Editar usuário

**Explicação:** atualiza os dados e os acessos de um usuário. Consulte o usuário antes e preserve os valores obrigatórios que não deseja alterar.

**Rota:** `PATCH https://api.sellbot.tech/v1/users/{user_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `users:write` · Requer admin no token.

**Body:** envie os valores atuais de `user_email`, `user_role`, `user_active`, `group_uuid` e `wpp_session`. Inclua os demais campos somente quando precisar alterá-los.

| Campo                     | Descrição                                                                                                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user_name`               | Nome exibido                                                                                                                                                                     |
| `user_email`              | E-mail de login                                                                                                                                                                  |
| `user_role`               | Papel (`admin`, `user`, …)                                                                                                                                                       |
| `user_active`             | `true` / `false` — ativo ou inativo                                                                                                                                              |
| `group_uuid`              | Array de grupos permitidos                                                                                                                                                       |
| `wpp_session`             | Array de sessões permitidas                                                                                                                                                      |
| `session_allowed_modules` | Módulos liberados (`crm`, `base_de_leads`, `organizacoes`, `relatorios`, `automations`, `templates`, `transmissoes`, `agents`, `integrations`, `settings`; a Central vem sempre) |
| `session_module_ops`      | O que pode em cada módulo: `{ "crm": ["create", "edit"] }`. Operações `create`, `edit`, `delete`; módulo sem entrada = todas. Módulo ou operação desconhecidos: **400**          |
| `session_sensitive_ops`   | Ações sensíveis liberadas: `crm:settings`, `broadcasts:send`, `templates:manage`, `central:bulk`. Lista vazia = nenhuma; campo ausente = todas                                   |

Os três últimos valem para usuários com acesso restrito. Exportar não é liberável: é só do responsável pela conta.

**Resposta 200:** confirmação de sucesso.

**Erros:** `400` se solicitante não for administrador.

### `GET /users/assignable` — Listar quem pode ser responsável

**Explicação:** quem a pessoa do token pode pôr como responsável de lead, negócio, atividade ou passo de automação, com a mesma regra do seletor do app: administrador e quem vê a conta ou os números escolhem qualquer um; quem vê o time, a si e ao time; quem vê só o seu, só a si. Só usuários ativos. Não exige admin, ao contrário de `GET /users`.

**Escopo:** `users:read`.

**Rota:** `GET https://api.sellbot.tech/v1/users/assignable`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
```

**Resposta 200:** `{ "success": true, "data": { "users": [{ "user_id", "user_name" }], "total" } }`. **403:** o token não age em nome de uma pessoa da conta.

---

## Configurações — Times

### `GET /teams` — Listar times

**Explicação:** lista os times da conta, incluindo hierarquia, membros e configuração de visibilidade.

**Rota:** `GET https://api.sellbot.tech/v1/teams`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** não envie body nesta rota.

**Escopo:** `teams:read`

**Query:** `include_inactive=true`, `parent_team_id`

**Cada time:** `team_id`, `team_name`, `team_description`, `parent_team_id`, `team_active`, `team_members`, `visibility_config`, `team_date_added`, `team_date_updated`

### `GET /teams/{team_id}` — Detalhe

**Explicação:** retorna os dados completos de um time.

**Rota:** `GET https://api.sellbot.tech/v1/teams/{team_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** não envie body nesta rota.

**Escopo:** `teams:read`

**Resposta:** `{ "team": { ... } }`

### `POST /teams/{team_id}/members` — Adicionar membro

**Explicação:** adiciona um usuário ao time ou atualiza o papel de um membro existente.

**Rota:** `POST https://api.sellbot.tech/v1/teams/{team_id}/members`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `teams:write`

**Body:**

| Campo       | Descrição                                        |
| ----------- | ------------------------------------------------ |
| `member_id` | ID do usuário — obrigatório                      |
| `role`      | Papel no time: `admin` ou `member` — obrigatório |

```json
{
  "member_id": "{user_id}",
  "role": "member"
}
```

**Resposta 200:** confirmação de sucesso.

### `DELETE /teams/{team_id}/members/{member_id}` — Remover membro

**Explicação:** remove o usuário informado do time sem excluir o usuário da conta.

**Rota:** `DELETE https://api.sellbot.tech/v1/teams/{team_id}/members/{member_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `teams:write`

**Body:** `{}`

**Resposta 200:** confirmação.

---

## Configurações — Campos personalizados

As definições dos campos. Como enviar valores em leads, empresas e negócios: ver [Campos personalizados](#configuracoes-campos-personalizados).

### `GET /custom-fields` — Listar definições

**Explicação:** lista as definições de campos personalizados. Consulte esta rota antes de enviar `custom_fields` em leads, empresas ou negócios.

**Rota:** `GET https://api.sellbot.tech/v1/custom-fields`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** não envie body nesta rota.

**Escopo:** `custom_fields:read`

**Query opcional:** `page`, `limit`, `s`, `category` (`lead`, `crm` ou `organization`) e `system`.

**Cada campo em `cfs[]`:** `field_key`, `field_name`, `sb_cf_type`, `sb_cf_title`, `sb_cf_options`, `sb_cf_category` (`lead`/`crm`/`organization`), `sb_cf_system`, `sb_cf_date`

### `GET /custom-fields/{field_key}` — Uma definição

**Explicação:** retorna o tipo, o rótulo, a categoria e as opções de um campo personalizado.

**Rota:** `GET https://api.sellbot.tech/v1/custom-fields/{field_key}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Body:** não envie body nesta rota.

**Escopo:** `custom_fields:read`

Retorna o mesmo conjunto de campos de um item da lista.

### `POST /custom-fields` — Criar definição

**Explicação:** cria uma definição de campo para leads, negócios ou empresas.

**Rota:** `POST https://api.sellbot.tech/v1/custom-fields`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `custom_fields:write`

**Body:**

| Campo            | Descrição                                   |
| ---------------- | ------------------------------------------- |
| `field_key`      | Chave (ex. `sb_cf_segmento`)                |
| `sb_cf_title`    | Título exibido                              |
| `sb_cf_type`     | Tipo do campo                               |
| `sb_cf_category` | `lead`, `crm` ou `organization`             |
| `sb_cf_options`  | Opções (quando lista)                       |
| `sb_cf_date`     | Data de criação em formato ISO              |
| `sb_cf_system`   | `false` para campos criados pelo integrador |

**Resposta 200:** `{ "success": true, "text": "…" }`

### `PATCH /custom-fields/{field_key}` — Editar definição

**Explicação:** atualiza uma definição existente. Envie o estado completo do campo para preservar tipo, categoria e opções.

**Rota:** `PATCH https://api.sellbot.tech/v1/custom-fields/{field_key}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `custom_fields:write`

**Body:** envie `sb_cf_title`, `sb_cf_type`, `sb_cf_date`, `sb_cf_category`, `sb_cf_system` e, quando aplicável, `sb_cf_options`. O `field_key` vem da URL.

**Resposta 200:** `{ "success": true, "text": "…" }`

### `DELETE /custom-fields/{field_key}` — Excluir definição

**Explicação:** exclui a definição do campo personalizado. Confirme que nenhuma integração ainda usa essa chave.

**Rota:** `DELETE https://api.sellbot.tech/v1/custom-fields/{field_key}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
Accept: application/json
```

**Escopo:** `custom_fields:write`

**Body:** `{}`

**Resposta 200:** `{ "text": "…" }`

---

## Configurações — Regras de entrada e de transição

Na Sellbot: **Configurações › Regras de entrada** e a aba **Configurações › CRM**. O caminho das rotas começa com `/crm` porque as regras são do CRM.

### `GET /crm/transition-rules` — Listar regras de transição

**Explicação:** o que o negócio precisa ter para mudar de etapa. Cada regra tem funil, etapa de origem (`*` = qualquer), destino (etapa ou ganho/perdido) e condições, todas obrigatórias juntas. Só leitura: criar e editar é pela tela.

**Rota:** `GET https://api.sellbot.tech/v1/crm/transition-rules?pipeline_id={pipeline_id}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Escopo:** `crm:read`

**Query:** `pipeline_id` (opcional)

**Resposta 200:** `{ "rules": [{ "transition_rule_id", "transition_rule_name", "transition_rule_pipeline_id", "transition_rule_source_stage_id", "transition_rule_target_stage_id", "transition_rule_target_status", "transition_rule_conditions", "transition_rule_active", "transition_rule_order" }], "total": 1 }`

### `GET /crm/entry-rules` — Listar regras de entrada

**Explicação:** o que acontece com lead, empresa e negócio quando um lead chega: condições (origem, número, campanha, etiquetas e campos) e a configuração de cada um. Só leitura.

**Rota:** `GET https://api.sellbot.tech/v1/crm/entry-rules`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Escopo:** `crm:read`

**Resposta 200:** `{ "rules": [{ "rule_id", "rule_name", "conditions", "lead_config", "organization_config", "deal_config", ... }], "total": 1 }`

---

## Configurações — Importações

Ler as importações e por que linhas falharam, e cancelar a que está rodando. Começar uma importação é na tela (arquivo e mapeamento). Os endereços do CSV importado e do CSV de erros não saem: a planilha tem dados de lead. Número: o do token, o `wpp_session` do pedido ou o único da conta.

### `POST /settings/imports` — Importar planilha

**Explicação:** importa uma planilha CSV que a pessoa mandou no chat do Sel, com o mapeamento de colunas que ela confirmou. Só o Sel usa esta rota (com token de integração, `400`): a planilha vira o mesmo CSV que a tela de importação manda e segue o mesmo caminho. Só campos básicos (lead, empresa e negócio); campo personalizado é na tela. Até 5.000 linhas.

**Rota:** `POST https://api.sellbot.tech/v1/settings/imports`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
```

**Escopo:** `imports:write`.

**Body:**

```json
{
  "attachment_id": "ID_DO_ARQUIVO_NO_CHAT",
  "wpp_session": "meu_numero",
  "mappings": [
    { "column": "Nome", "field": "first_name", "entity": "lead" },
    { "column": "Celular", "field": "phone", "entity": "lead" },
    { "column": "Empresa", "field": "company_name", "entity": "organization" }
  ],
  "default_campaign": "Feira 2026"
}
```

Leads precisam de nome (`first_name` ou `full_name`) ou telefone; empresas, de `company_name` ou `cnpj`. Com `create_deal_for_each_lead`, informe `pipeline_id` e `stage_id`.

### `GET /settings/imports` — Listar importações

**Explicação:** as importações do número, mais recentes primeiro: status, linhas totais, processadas, criadas, com erro e puladas (sem telefone, sem nome, sem os dois), empresas e negócios criados e o erro geral.

**Escopo:** `imports:read`.

**Rota:** `GET https://api.sellbot.tech/v1/settings/imports?wpp_session=meu_numero`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
```

### `GET /settings/imports/{import_id}/logs` — Linhas de uma importação

**Explicação:** o que aconteceu com cada linha: `ok`, `skip` ou `error`, com o motivo e o lead ou negócio criado. Sem os dados do lead.

**Escopo:** `imports:read`.

**Rota:** `GET https://api.sellbot.tech/v1/settings/imports/{import_id}/logs`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
```

### `POST /settings/imports/{import_id}/cancel` — Cancelar importação

**Explicação:** para o que falta da importação. As linhas já processadas ficam como estão: leads e negócios criados não somem.

**Escopo:** `imports:write`.

**Rota:** `POST https://api.sellbot.tech/v1/settings/imports/{import_id}/cancel`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
```

---

# Ajuda

## Ajuda e suporte

Os artigos da Central de Ajuda da Sellbot (os mesmos de `/ajuda`, que é pública) e o pedido de atendimento humano. A busca e o artigo não leem dado de conta nenhuma e não pedem permissão: qualquer token válido lê. Só artigos publicados; rascunho responde `404`.

### `GET /help/search` — Buscar na Central de Ajuda

**Explicação:** os artigos publicados que casam com o texto, do mais relevante para o menos: título, começo do texto e `link`, o endereço do artigo no app (`/ajuda/artigo/{slug}`). A busca ignora acento e palavras curtas ou genéricas. Sem nenhum artigo, `articles` vem vazio.

**Query:** `q` (obrigatório, de 2 a 300 caracteres) e `limit` (padrão 5, até 10).

**Rota:** `GET https://api.sellbot.tech/v1/help/search?q=transmissao%20template`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Escopo:** nenhum.

**Resposta 200:**

```json
{
  "success": true,
  "data": {
    "query": "transmissao template",
    "articles": [
      {
        "slug": "como-criar-uma-transmissao",
        "title": "Como criar uma transmissão",
        "excerpt": "Passo a passo para montar a lista, escolher o template…",
        "link": "/ajuda/artigo/como-criar-uma-transmissao"
      }
    ]
  }
}
```

### `GET /help/articles/{slug}` — Ler artigo da Central de Ajuda

**Explicação:** o texto de um artigo publicado, em markdown, sem imagens nem HTML embutido. Acima de 12 mil caracteres o texto vem cortado e `truncated` vem `true`: o artigo inteiro está em `link`.

**Rota:** `GET https://api.sellbot.tech/v1/help/articles/{slug}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Escopo:** nenhum.

**Resposta 200:**

```json
{
  "success": true,
  "data": {
    "slug": "como-criar-uma-transmissao",
    "title": "Como criar uma transmissão",
    "category": "Transmissões",
    "excerpt": "Passo a passo para montar a lista…",
    "content": "## Antes de começar\n…",
    "truncated": false,
    "updated_at": "2026-10-20T13:00:00.000Z",
    "link": "/ajuda/artigo/como-criar-uma-transmissao"
  }
}
```

**Erros:** `404` quando o artigo não existe ou não está publicado.

### `POST /help/support-requests` — Pedir atendimento ao suporte

**Explicação:** só o Sel, o assistente do app, chama esta rota; token de integração recebe `403`. Começa o atendimento no WhatsApp do suporte da Sellbot, pelo mesmo caminho do botão "Iniciar atendimento" do app: confere o WhatsApp, cadastra a pessoa no suporte e manda a mensagem de início. O resumo vai para a equipe como nota na conversa do suporte e no cadastro da pessoa. Quem pede e a conta vêm do token. O mesmo limite do botão vale aqui: 3 pedidos por pessoa em 15 minutos (`429`).

**Rota:** `POST https://api.sellbot.tech/v1/help/support-requests`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
```

**Escopo:** nenhum (só o Sel).

**Body:**

| Campo        | Obrigatório | Descrição                                                                    |
| ------------ | ----------- | ---------------------------------------------------------------------------- |
| `summary`    | sim         | O resumo para a equipe, de 20 a 2.000 caracteres                             |
| `screen`     | não         | A tela em que a pessoa estava, até 300 caracteres                            |
| `user_phone` | não         | O WhatsApp que o suporte chama, com DDD; sem ele, o do cadastro de quem pede |

**Resposta 200:**

```json
{
  "success": true,
  "data": {
    "text": "Mensagem enviada com sucesso",
    "support_hours": "segunda a sexta, das 9h às 18h (horário de Brasília)",
    "within_support_hours": true,
    "summary_saved": true,
    "conversation_note": "posted"
  }
}
```

`conversation_note` é `pending` quando a conversa de quem nunca falou com o suporte ainda está sendo criada: a nota entra logo depois.

**Erros:** `400` sem WhatsApp no cadastro (e sem `user_phone`), com número sem WhatsApp ou corpo inválido; `403` para token que não é do Sel; `429` com pedidos demais; `502` quando o suporte não pôde ser acionado.

### Chamados de suporte (só o Sel)

As quatro rotas abaixo são só do Sel, o assistente do app; token de integração recebe `403`. Chamado é da pessoa: ela é a solicitante, recebe as respostas por e-mail e acompanha em `/tickets` no app. O token de integração é da conta e leva o usuário que o criou, que não é quem está do outro lado.

Quem vê o quê é a regra da área de chamados do app: a pessoa vê os chamados que ela abriu, dentro da conta do token. O responsável pela conta e a equipe Sellbot abrem qualquer chamado da conta pelo número e listam a conta inteira com `scope=account`. Chamado de outra conta, ou de outra pessoa para quem não é responsável, responde `404`. Nota interna da equipe nunca aparece.

### `GET /help/tickets` — Listar meus chamados

**Explicação:** os chamados de quem chama, dos mais novos para os mais antigos, com a situação, de quem é a vez (`awaiting`: `team` é a equipe Sellbot, `client` é a pessoa) e o `link` do chamado no app (`/tickets/{ticket_number}`).

**Query:** `status` (`open`, `closed` ou `all`, padrão `all`), `scope` (`mine`, padrão, ou `account`, que só vale para o responsável pela conta), `page` (padrão 1) e `limit` (padrão 10, até 20).

**Rota:** `GET https://api.sellbot.tech/v1/help/tickets?status=open`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Escopo:** nenhum (só o Sel).

**Resposta 200:**

```json
{
  "success": true,
  "data": {
    "tickets": [
      {
        "ticket_number": 1042,
        "title": "Transmissão parada desde ontem",
        "status": "Pendente",
        "is_closed": false,
        "awaiting": "team",
        "category": "Disparos",
        "requester_name": "Ana",
        "created_at": "2026-11-12T13:00:00.000Z",
        "updated_at": "2026-11-12T13:00:00.000Z",
        "closed_at": null,
        "close_reason": null,
        "rating": null,
        "link": "/tickets/1042"
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 10,
    "total_pages": 1,
    "scope": "mine",
    "can_view_account": false
  }
}
```

### `GET /help/tickets/{ticket_number}` — Ler um chamado

**Explicação:** um chamado pelo número, com a descrição e as respostas trocadas com a equipe (as últimas 20; `comments_total` diz quantas há), em texto. Dos anexos vem só o nome. O prazo de resposta não vem.

**Rota:** `GET https://api.sellbot.tech/v1/help/tickets/{ticket_number}`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Accept: application/json
```

**Escopo:** nenhum (só o Sel).

**Resposta 200:**

```json
{
  "success": true,
  "data": {
    "ticket": {
      "ticket_number": 1042,
      "title": "Transmissão parada desde ontem",
      "status": "Pendente",
      "is_closed": false,
      "awaiting": "client",
      "category": "Disparos",
      "requester_name": "Ana",
      "created_at": "2026-11-12T13:00:00.000Z",
      "updated_at": "2026-11-12T15:00:00.000Z",
      "closed_at": null,
      "close_reason": null,
      "rating": null,
      "link": "/tickets/1042",
      "description": "O que acontece\nA transmissão…",
      "attachments": []
    },
    "comments": [
      {
        "author": "team",
        "author_name": "Monique (Sellbot)",
        "text": "Pode confirmar o número que envia?",
        "attachments": [],
        "created_at": "2026-11-12T15:00:00.000Z"
      }
    ],
    "comments_total": 1,
    "reply_as": "client"
  }
}
```

`reply_as` diz como a resposta de quem chama entra no chamado: `client` (a solicitante ou alguém da conta) ou `team` (alguém da equipe Sellbot no chamado de outra pessoa: o cliente recebe o e-mail de resposta da equipe, a vez passa para ele e conta como resposta no prazo).

**Erros:** `404` quando o chamado não existe ou não é visível para quem chama.

### `POST /help/tickets` — Abrir chamado

**Explicação:** abre um chamado em nome de quem chama, na conta do token, pelo mesmo caminho da área de chamados do app: protocolo, aviso por push e e-mail ao responsável da equipe e e-mail de confirmação para a pessoa. A descrição é montada com uma seção por campo. O tipo e a área são procurados pelo nome no catálogo de chamados; nome que não existe fica no padrão. Severidade e prazo são decididos pela equipe.

**Rota:** `POST https://api.sellbot.tech/v1/help/tickets`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
```

**Escopo:** nenhum (só o Sel).

**Body:**

| Campo            | Obrigatório | Descrição                                                                           |
| ---------------- | ----------- | ----------------------------------------------------------------------------------- |
| `subject`        | sim         | O assunto, de 5 a 120 caracteres                                                    |
| `problem`        | sim         | O que acontece, o esperado, desde quando e quem é afetado; de 30 a 3.000 caracteres |
| `tried`          | sim         | O que já foi tentado e verificado, de 10 a 2.000 caracteres                         |
| `screen`         | não         | A tela, até 300 caracteres                                                          |
| `record_ids`     | não         | Os ids envolvidos, com o que cada um é, até 1.000 caracteres                        |
| `ticket_type`    | não         | `Bug`, `Melhoria`, `Solicitação` ou `Dúvida`                                        |
| `area`           | não         | A área do app, pelo nome da categoria (`CRM`, `Disparos`…), até 60 caracteres       |
| `attachment_ids` | não         | Ids de arquivos, áudios ou capturas de tela da conversa com o Sel, até 5            |
| `chat_id`        | com anexo   | A conversa do Sel; posto pelo Sel na aprovação, nunca pelo modelo                   |

Cada arquivo de `attachment_ids` precisa ser da pessoa do token, na conta do token e da conversa `chat_id`. O original cifrado do chat é decifrado na API e sobe como anexo da página do chamado (`uploads/tasks/`, mesmo tipo e tamanho aceitos lá): uma cópia própria, que não some quando a conversa é excluída. Se um arquivo falha ao subir, nada é aberto e as cópias já feitas são apagadas.

**Resposta 201:**

```json
{
  "success": true,
  "data": { "ticket_number": 1042, "link": "/tickets/1042", "attachments": ["erro.png"] }
}
```

**Erros:** `400` com corpo inválido ou anexo sem `chat_id`; `403` para token que não é do Sel; `404` para arquivo que não é desta conversa, desta pessoa ou desta conta, ou que não existe mais; `415` para tipo que a página do chamado não aceita; `503` quando um anexo não pôde ser lido ou enviado (nada é aberto).

### `POST /help/tickets/{ticket_number}/comments` — Responder um chamado

**Explicação:** manda uma resposta no chamado como quem chama, visível para a equipe e na área de chamados. Responder um chamado concluído o reabre, e o responsável da equipe é avisado.

**Rota:** `POST https://api.sellbot.tech/v1/help/tickets/{ticket_number}/comments`

**Headers:**

```http
Authorization: Bearer sbt_SEU_TOKEN
Content-Type: application/json
```

**Escopo:** nenhum (só o Sel).

**Body:**

| Campo            | Obrigatório | Descrição                                                                   |
| ---------------- | ----------- | --------------------------------------------------------------------------- |
| `message`        | sim         | A resposta, de 2 a 5.000 caracteres                                         |
| `attachment_ids` | não         | Ids de arquivos da conversa com o Sel, até 5, com a mesma regra da abertura |
| `chat_id`        | com anexo   | A conversa do Sel, posta pelo Sel na aprovação                              |

**Resposta 201:**

```json
{
  "success": true,
  "data": { "ticket_number": 1042, "link": "/tickets/1042", "attachments": [] }
}
```

**Erros:** `400` com corpo inválido; `403` para token que não é do Sel; `404` quando o chamado não existe ou não é visível para quem chama, ou para anexo fora da regra; `415` e `503` como na abertura.

---

## Links úteis

- **Gerar e revogar tokens:** Sellbot → Configurações → API Tokens
- **Suporte:** informe o `X-Request-Id` da resposta — é por ele que a chamada é
  localizada nos nossos registros
