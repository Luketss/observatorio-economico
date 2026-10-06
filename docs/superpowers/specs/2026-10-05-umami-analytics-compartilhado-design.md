# Umami compartilhado (NID + LEGIS) na Railway — Design

**Data:** 2026-10-05
**Status:** design aprovado em chat pelo usuário (2026-10-05); spec aguardando revisão
**Repositórios afetados:** `dashboard_prefeituras` (NID) e `camara` (LEGIS). Esta spec é a
fonte única para os dois; cada repo terá seu próprio plano de implementação.

## Objetivo

Medir o uso real dos dois produtos UAIZI (NID em `nid.uaizi.com.br`, LEGIS em
`legis.uaizi.com.br`) com **uma única instância** de Umami self-hosted na Railway, sabendo
**qual município e qual papel** está usando cada página, sem introduzir dado pessoal no
analytics e com o menor custo fixo possível.

Sucesso: abrir o Umami e ver, por produto, quais páginas são visitadas, por quais
municípios e papéis, com custo marginal de poucos dólares por mês e zero impacto no
funcionamento dos apps quando o Umami estiver fora ou bloqueado.

## Decisões de escopo (fechadas com o usuário)

1. **O que medir:** pageviews + `identify()` da sessão com `municipio_id` e papel. Sem
   eventos de negócio nesta frente.
2. **Onde morar:** projeto Railway **novo** `uaizi-analytics` com Postgres **dedicado**.
   Descartado reusar o Postgres do NID ou do LEGIS (acoplaria o analytics dos dois produtos
   à infra de um deles; a rede privada da Railway é por projeto).
3. **Domínio:** o gerado pela Railway (`*.up.railway.app`). Sem DNS próprio agora. Trocar
   depois exige rebuild dos dois frontends (a URL entra via `VITE_*`).
4. **Integração:** loader JS pequeno **copiado** nos dois repos (abordagem A). Descartados a
   tag direta no `index.html` via `%VITE_*%` (não condiciona em dev e não cobre identify) e o
   pacote npm compartilhado (registry privado para ~40 linhas).
5. **Acesso ao painel:** só o ADMIN_GLOBAL (usuário admin do Umami). Sem teams, sem acesso
   por município.
6. **Ambiente local nunca rastreia:** as variáveis `VITE_UMAMI_*` só existem no build da
   Railway.

## Contexto encontrado

- Os dois frontends têm a mesma stack e o mesmo deploy: React 19 + Vite, Dockerfile
  multi-stage com `ARG VITE_API_BASE_URL` → nginx na Railway. Nenhum envia header CSP.
- Nenhum dos dois tem analytics hoje. A spec de LGPD do NID
  (`docs/superpowers/specs/2026-08-16-auditoria-lgpd-design.md`) deixou "auditoria de
  navegação em páginas/datasets" explicitamente fora, como analytics.
- `/auth/me` do NID devolve `{ id, nome, email, municipio_id, role }`. O do LEGIS devolve
  `{ municipio_id, municipio_nome, role, ... }` (`AuthenticatedUser` em `schemas/auth.py`).
- Umami: precisa só de `DATABASE_URL` (Postgres) e `APP_SECRET`; uma instância atende N
  websites, cada um com seu `data-website-id`; o tracker captura `pushState` (rotas SPA)
  sozinho; `umami.identify(dados)` aceita dados de sessão sem id único.

## Arquitetura

```
Railway: projeto uaizi-analytics
├── Postgres  (plugin Railway, volume próprio)
└── umami     (ghcr.io/umami-software/umami:postgresql-<tag>)  → https://umami-xxxx.up.railway.app
        ▲ script.js + /api/send                ▲ script.js + /api/send
        │                                      │
  nid.uaizi.com.br (NID, website A)      legis.uaizi.com.br (LEGIS, website B)
  frontend-observatorio/src/services/    frontend/src/lib/analytics.js
  analytics.js
```

Fluxo em cada app: `main.jsx` chama `iniciarAnalytics(...)` → tag `<script defer>` entra no
`<head>` → tracker registra pageviews e trocas de rota → `AuthProvider`, ao resolver
`/auth/me`, chama `identificarSessao(montarDadosSessao(user))` → Umami anexa
`municipio_id`/papel à sessão anônima.

## 1. Infra na Railway (projeto `uaizi-analytics`)

**Serviços**

| Serviço | Origem | Observações |
|---|---|---|
| `Postgres` | plugin Railway | Expõe `DATABASE_URL` (host interno). Backup do volume é o da Railway; nada extra. |
| `umami` | imagem `ghcr.io/umami-software/umami:postgresql-latest` | No dia do deploy, anotar no runbook a tag/versão efetiva (`postgresql-v2.x.y`) e fixá-la no serviço para evitar upgrade surpresa. |

**Variáveis do serviço `umami`**

| Variável | Valor |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (host `*.railway.internal`, rede privada) |
| `APP_SECRET` | saída de `openssl rand -base64 32`. Não rotacionar: muda hashes de visitantes e desloga todo mundo. |
| `DISABLE_TELEMETRY` | `1` |
| `PORT` | não definir a princípio; a imagem respeita a `PORT` injetada pela Railway. Se o domínio gerado responder 502, fixar `PORT=3000`. |

**Pós-deploy manual (uma vez)**

1. Settings → Networking → Generate Domain. Essa URL é o `VITE_UMAMI_SRC` dos dois apps.
2. Login `admin` / `umami` → trocar a senha imediatamente.
3. Criar dois websites: `NID` (domínio `nid.uaizi.com.br`) e `LEGIS` (domínio
   `legis.uaizi.com.br`). Copiar os dois website IDs.
4. Guardar senha e IDs no cofre de credenciais do usuário (fora do repo).

**Fora:** Redis (`REDIS_URL`), ClickHouse, domínio próprio, teams, `TRACKER_SCRIPT_NAME` /
`COLLECT_API_ENDPOINT` (anti-bloqueador), retenção customizada.

## 2. Loader nos frontends

Um arquivo por repo, **mesmo conteúdo**, nome seguindo a convenção local:

- NID: `frontend-observatorio/src/services/analytics.js`
- LEGIS: `frontend/src/lib/analytics.js`

Todas as funções recebem `doc`/`win`/`env` injetáveis com default nos globais (padrão de
`tema.js` do LEGIS), para testar sem DOM real. O módulo **não guarda estado**: dedupe e fila
usam o próprio DOM.

```js
// Lê as duas variáveis. Devolve null se qualquer uma faltar ou estiver vazia.
// Remove barra final de src, para aceitar "https://x.app" e "https://x.app/".
export function lerConfigAnalytics(env) → { src, websiteId } | null

// Injeta UMA tag <script defer src="{src}/script.js" data-website-id="{websiteId}"
// data-exclude-search="true"> no <head>.
// Se já existir script[data-website-id], não duplica. Devolve true se há tag (nova ou
// existente), false se config é null.
export function iniciarAnalytics(config, doc = document) → boolean

// Monta os dados de sessão a partir do usuário de /auth/me. null se user é null.
// Omite chaves nulas. Nunca inclui id, nome ou e-mail.
export function montarDadosSessao(user) → object | null

// Se win.umami existe → win.umami.identify(dados).
// Senão, se existe script[data-website-id] no doc → registra listener `load` (once) que
// chama identify quando o tracker carregar.
// Senão (sem script, ou script já falhou) → no-op.
// Chamadas repetidas antes do load (ex.: StrictMode) registram listeners independentes;
// identify com os mesmos dados é idempotente, então não há dedupe.
// Envolvido em try/catch: nunca lança.
export function identificarSessao(dados, doc = document, win = window) → void
```

`main.jsx` passa o env explicitamente, porque `import.meta.env` não existe no `node --test`
do LEGIS:

```js
import { iniciarAnalytics, lerConfigAnalytics } from "./services/analytics";  // NID
iniciarAnalytics(lerConfigAnalytics(import.meta.env));
```

`AuthProvider` dos dois apps ganha um `useEffect` sobre `user`:

```js
useEffect(() => {
  const dados = montarDadosSessao(user);
  if (dados) identificarSessao(dados);
}, [user]);
```

Isso cobre login e sessão restaurada por token. Logout (`user = null`) não envia nada. O
"ver como município" (`ViewAsContext`) do ADMIN_GLOBAL **não** altera a identificação: vale
o usuário real.

**Variáveis de build** (`VITE_UMAMI_SRC` = URL base do Umami sem barra final;
`VITE_UMAMI_WEBSITE_ID` = ID do website do app). Os dois Dockerfiles ganham:

```dockerfile
ARG VITE_UMAMI_SRC
ARG VITE_UMAMI_WEBSITE_ID
ENV VITE_UMAMI_SRC=$VITE_UMAMI_SRC
ENV VITE_UMAMI_WEBSITE_ID=$VITE_UMAMI_WEBSITE_ID
```

Na Railway, as duas variáveis entram no serviço **frontend** de cada app (a Railway repassa
vars que casam com `ARG` como build args) e exigem redeploy. Dev local não as tem, logo
`lerConfigAnalytics` devolve null e nada é injetado.

**Rotas:** o tracker do Umami intercepta `pushState`/`replaceState`; React Router v7 não
precisa de integração.

## 3. Dados de sessão e LGPD

| App | Payload de `identificarSessao` | Fonte |
|---|---|---|
| NID | `{ municipio_id, papel }` | `user.municipio_id`, `user.role` |
| LEGIS | `{ municipio_id, municipio, papel }` | `user.municipio_id`, `user.municipio_nome`, `user.role` |
| ADMIN_GLOBAL (ambos) | `{ papel: "ADMIN_GLOBAL" }` | `municipio_id` é null e a chave é omitida |

Regras:

- Nunca enviar `id`, `nome`, `email` ou qualquer outro campo do usuário. O conjunto de chaves
  permitidas é `{ municipio_id, municipio, papel }` e é verificado por teste.
- Não passar `uniqueId` ao `identify`: a sessão continua anônima, identificada só pelo hash
  diário do Umami (IP + user-agent + salt), que o Umami não armazena em claro.
- Nome de município é dado de ente público, não dado pessoal.

**Documentação LGPD**

- NID: `docs/lgpd.md` ganha a seção **"Analytics de uso (Umami)"**: self-hosted em
  infraestrutura própria na Railway; sem cookies; IP não armazenado; dados de sessão
  limitados a município e papel; sem identificação de pessoa; por não conter dado pessoal,
  fica fora das políticas de retenção da auditoria (12 meses / 5 anos).
- LEGIS: não tem doc LGPD. Entra um parágrafo equivalente no `README.md`, em seção
  "Analytics de uso".

## 4. Tratamento de erros

| Situação | Comportamento |
|---|---|
| Vars ausentes (dev, preview) | Nenhuma tag injetada. `identificarSessao` é no-op. |
| Script bloqueado por ad-blocker ou Umami fora (404/502) | Tag falha em silêncio (`defer`, sem `await`). `win.umami` nunca existe; identify pendente nunca dispara. App não percebe. |
| `/auth/me` resolve antes do script carregar | Identify fica pendente no listener `load` da tag e dispara depois. |
| `umami.identify` lança | Capturado pelo try/catch; nada propaga ao React. |
| Umami com banco indisponível | `/api/send` devolve erro; o tracker não retenta; sem efeito no app. |

Princípio: analytics é **best-effort**. Nenhum caminho pode quebrar render, auth ou rotas.

## 5. Testes

Mesmo conjunto nos dois repos, adaptado ao runner:

- NID: vitest + jsdom (`frontend-observatorio/src/services/analytics.test.js`).
- LEGIS: `node --test` com fakes mínimos de `doc`/`win` (`frontend/src/lib/analytics.test.js`),
  no estilo de `tema.test.js`.

Casos:

1. `lerConfigAnalytics`: sem uma das vars (ou vazia) → null; com as duas → `{ src, websiteId }`;
   `src` com barra final sai sem a barra.
2. `iniciarAnalytics(null)` → false, nenhuma tag.
3. `iniciarAnalytics(config)` → uma tag com `defer`, `src = "{src}/script.js"` e
   `data-website-id`; segunda chamada não duplica e devolve true.
4. `montarDadosSessao`: null → null; usuário de município → chaves esperadas; ADMIN_GLOBAL
   → só `papel`; **nenhuma chave fora de `{ municipio_id, municipio, papel }`** para
   qualquer usuário (teste alimenta um user com `id`, `nome`, `email` e confere que sumiram).
5. `identificarSessao` com `win.umami` presente → chama `identify` com os dados.
6. `identificarSessao` antes do `load` → não chama; após disparar `load` com `win.umami`
   definido → chama uma vez.
7. `identificarSessao` sem tag e sem `umami` → não lança.
8. `identificarSessao` com `identify` que lança → não propaga.

Gates: `npx vitest run` (NID) e `npm run test:unit` (LEGIS) verdes; lint sem erro **novo**
nos arquivos tocados. Sem e2e nesta frente.

## 6. Documentação

- **Runbook canônico:** `docs/analytics-umami.md` no repo do NID. Conteúdo: criação do
  projeto Railway, variáveis, pós-deploy (senha, websites), onde colocar `VITE_UMAMI_*` em
  cada app, como verificar, como fixar a versão da imagem, o que fazer se a URL do Umami
  mudar (rebuild dos dois frontends).
- **LEGIS:** `docs/deploy-railway.md` ganha seção curta "Analytics (Umami)" com as duas
  variáveis novas na tabela do frontend e link para o runbook do NID
  (`github.com/Luketss/observatorio-economico/blob/main/docs/analytics-umami.md`).
- **LGPD:** item 3 acima.

## 7. Ordem de entrega e verificação

1. **Infra (manual, usuário):** subir `uaizi-analytics` seguindo o runbook; obter URL e os
   dois website IDs. Pode acontecer em paralelo com os PRs.
2. **PR NID** (branch `feat/umami-analytics`): loader + teste, `AuthContext`, `main.jsx`,
   Dockerfile, `docs/lgpd.md`, `docs/analytics-umami.md`.
3. **PR LEGIS** (branch `feat/umami-analytics`): loader + teste, `AuthContext`, `main.jsx`,
   Dockerfile, `README.md`, `docs/deploy-railway.md`.
4. **Railway:** setar `VITE_UMAMI_SRC` e `VITE_UMAMI_WEBSITE_ID` nos dois serviços frontend;
   redeploy.
5. **Verificação em produção:** abrir cada app logado → Umami → Realtime mostra o pageview;
   Sessions → Properties mostra `municipio_id`/`papel`. Trocar de rota no app gera novo
   pageview. Em dev local: `document.querySelector('script[data-website-id]')` é null e
   não há request para o Umami na aba Network.

## Fora de escopo (anotado, não silencioso)

- Eventos de negócio (`umami.track`: gerar insight, exportar release, abrir drawer)
- Domínio próprio (`analytics.uaizi.com.br`) e renomear `script.js` contra bloqueadores
- Acesso ao painel por município / teams / dashboards compartilhados
- Embed de métricas de uso dentro dos apps
- `data-tag` por ambiente (não há staging hoje)
- `data-domains` para restringir hosts rastreados
- Excluir tráfego do ADMIN_GLOBAL (fica identificável por `papel` e filtrável no Umami)
- Retenção/purga de dados do Umami

## Riscos e notas

- **URL do Umami embutida no build:** mudar domínio = redeploy dos dois frontends. Aceito
  pela decisão 3; o runbook documenta.
- **Duplicação do loader:** dois arquivos iguais em repos diferentes. Aceito pela decisão 4;
  cabeçalho de cada arquivo aponta para esta spec e para o gêmeo.
- **Tag `latest` da imagem:** fixar a tag efetiva no serviço após o primeiro deploy para que
  um upgrade de major do Umami seja uma decisão, não um acidente.
- **Bloqueadores:** parte dos usuários de prefeitura usa navegador corporativo com
  bloqueador. Os números serão um piso, não o total. Aceito; anti-bloqueador está fora.

## Emendas pós-revisão final (05/10/2026)

1. **`papel` restrito aos papéis do sistema.** `Role.nome` é texto livre no NID (roles
   personalizadas via `POST /roles`), então `montarDadosSessao` envia o nome só se estiver em
   `PAPEIS_SISTEMA` (`ADMIN_GLOBAL`, `ADMIN_MUNICIPIO`, `ANALISTA`, `VISUALIZADOR`); qualquer
   outro vira `PERSONALIZADO`. O LEGIS aplica a mesma regra com os seus quatro papéis.
2. **LGPD §8 com a postura real.** O texto deixa de afirmar "não envolve dados pessoais" e
   passa a descrever o payload mínimo, os atributos técnicos derivados pelo Umami, a ressalva
   de município com titular único por papel, a base legal (art. 7º, IX) e a retenção.
3. **Runbook**: ordem obrigatória ao trocar/remover o domínio do Umami (frontends primeiro;
   domínio liberado pode virar XSS), nota de CSP, nota de ambientes de PR.
4. **Loader**: parâmetros default `doc`/`win` resolvidos com guarda (`typeof document`), para
   que "nenhuma função lança" valha também fora do navegador.
5. **LEGIS lê `user.role`.** A spec afirmava `role_nome` para o `/auth/me` do LEGIS; o payload
   real (`AuthenticatedUser`) tem `role`. Corrigido no loader e nos testes do LEGIS. Lição de
   processo: shape de API se confirma no schema do backend, não na spec.
6. **`data-exclude-search="true"` na tag, nos dois gêmeos.** A busca global do LEGIS coloca o
   texto na URL (`?q=`), e a query string ia para o Umami como "página". Só o pathname é enviado.
