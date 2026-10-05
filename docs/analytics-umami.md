# Analytics de uso — Umami compartilhado (NID + LEGIS)

Runbook da instância única de [Umami](https://umami.is) que mede o uso do NID
(`app.uaizi.com.br`) e do LEGIS (`legis.uaizi.com.br`). Documento canônico: o repo do LEGIS
(`Uaiizi/camara`) aponta para cá.
Spec: `docs/superpowers/specs/2026-10-05-umami-analytics-compartilhado-design.md`.

## 1. Subir a infraestrutura (uma vez)

Railway → **New Project** → nome `uaizi-analytics`. Projeto separado dos dois produtos de
propósito: backup, restore e upgrade do Umami não se misturam com os bancos do NID/LEGIS.

1. **Postgres**: + New → Database → PostgreSQL. O serviço nasce como `Postgres` e expõe
   `DATABASE_URL` (host interno `*.railway.internal`).
2. **umami**: + New → Docker Image → `ghcr.io/umami-software/umami:postgresql-latest`.
   (Alternativa: o template oficial "Umami" da Railway; conferir depois as variáveis abaixo.)

   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
   | `APP_SECRET` | saída de `openssl rand -base64 32`. **Nunca rotacionar**: muda os hashes de visitantes e desloga o admin. |
   | `DISABLE_TELEMETRY` | `1` |

   Não definir `PORT` a princípio: a imagem respeita a porta injetada pela Railway. Se o
   domínio responder 502, definir `PORT=3000` e redeployar.
3. Settings → Networking → **Generate Domain**. Anotar a URL
   (ex.: `https://umami-production-xxxx.up.railway.app`). Ela é o `VITE_UMAMI_SRC` dos dois
   apps, **sem barra final**.
4. Aguardar o deploy. O log mostra as migrações do Prisma e depois o servidor pronto.
5. **Fixar a versão**: Settings → Source → trocar `postgresql-latest` pela tag efetiva da
   versão que subiu (ex.: `postgresql-v2.x.y`, visível no rodapé do painel do Umami) e
   redeployar. Upgrade passa a ser decisão, não acidente.

## 2. Configurar o Umami (uma vez)

1. Abrir a URL → login `admin` / `umami` → Settings → Profile → **trocar a senha**.
2. Settings → Websites → **Add website**:
   - Name `NID`, Domain `app.uaizi.com.br`
   - Name `LEGIS`, Domain `legis.uaizi.com.br`
3. Em cada website, Edit → copiar o **Website ID**.
4. Guardar senha e IDs no cofre de credenciais do admin, fora dos repositórios.

## 3. Ligar cada app

No serviço **frontend** de cada projeto Railway (não no backend), Variables:

| Variável | NID | LEGIS |
|---|---|---|
| `VITE_UMAMI_SRC` | URL do passo 1.3 | a mesma URL |
| `VITE_UMAMI_WEBSITE_ID` | Website ID de `NID` | Website ID de `LEGIS` |

**Redeploy do frontend**: as variáveis entram no build (`ARG` do Dockerfile); sem rebuild nada
muda. Sem as duas variáveis o app simplesmente não rastreia (nenhuma tag, nenhum request).

Ambientes de PR/preview da Railway herdam as variáveis do ambiente base. Se um dia criar um,
remova as duas variáveis `VITE_UMAMI_*` nele; caso contrário o preview conta como produção no
Umami.

## 4. Verificar

1. Abrir o app logado → Umami → website → **Realtime** mostra 1 visitante e a página atual.
2. Trocar de rota dentro do app → novo pageview no Realtime (o tracker captura `pushState`).
3. Umami → **Sessions** → abrir a sessão → aba **Properties** mostra `municipio_id` e `papel`
   (no LEGIS, também `municipio`).
4. Em dev local (`npm run dev`), no console do navegador:
   `document.querySelector('script[data-website-id]')` devolve `null` e a aba Network não tem
   request para o domínio do Umami.

## 5. Operação

- **URL do Umami mudou** (domínio regenerado ou domínio próprio no futuro). **Ordem
  obrigatória**: primeiro redeployar os dois frontends com a URL nova (ou sem as duas
  variáveis), e só depois remover ou regenerar o domínio antigo. Um domínio `*.up.railway.app`
  liberado pode ser registrado por terceiros, e o `script.js` servido por ele teria acesso
  total às páginas do app. Nunca liberar um domínio que ainda esteja referenciado por um build
  em produção.
- **CSP**: o nginx dos frontends não envia `Content-Security-Policy` hoje. Se um dia enviar,
  incluir a origem do Umami em `script-src` e `connect-src`. Como analytics é best-effort,
  ninguém é avisado quando o rastreio morre em silêncio: conferir o Realtime após qualquer
  mudança de headers.
- **Upgrade do Umami**: trocar a tag da imagem no serviço `umami` → redeploy (as migrações
  rodam no boot). Ler o changelog antes de pular major.
- **Backup**: o volume do Postgres é coberto pelo backup da Railway. Nada extra.
- **Custo**: dois serviços pequenos em idle. O Umami aceita `REDIS_URL` para cache, mas não é
  necessário no volume atual.
- **Bloqueadores de anúncio**: parte dos usuários corporativos bloqueia `script.js`. Os
  números são um piso, não o total. Renomear o script (`TRACKER_SCRIPT_NAME`) está fora de
  escopo.

## 6. O que NÃO é enviado

Nunca: id, nome ou e-mail do usuário, nem `uniqueId` de sessão. Só `municipio_id`, papel e
(no LEGIS) nome do município. O papel é restrito aos papéis do sistema (`ADMIN_GLOBAL`,
`ADMIN_MUNICIPIO`, `ANALISTA`, `VISUALIZADOR`); papéis personalizados viajam como
`PERSONALIZADO`. O conjunto de chaves permitidas está em `CHAVES_SESSAO` e a whitelist em
`PAPEIS_SISTEMA`, ambos em `frontend-observatorio/src/services/analytics.js`, verificados por
teste. Base LGPD em `docs/lgpd.md`, seção 8.
