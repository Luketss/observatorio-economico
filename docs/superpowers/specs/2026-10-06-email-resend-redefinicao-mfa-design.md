# E-mail transacional (Resend): redefinição de senha e código MFA por e-mail — Design

**Data:** 2026-10-06
**Status:** design aprovado em chat pelo usuário (06/10/2026); spec aguardando revisão
**Repositório:** `dashboard_prefeituras` (NID). O LEGIS entra como espelho em frente própria.
**Depende de:** `2026-10-06-mfa-totp-admin-global-design.md` para a parte 3 (MFA por e-mail).
As partes 1 e 2 (infraestrutura e redefinição de senha) não dependem de nada.

## Objetivo

Dar à plataforma um canal de e-mail transacional confiável e barato, e usá-lo para dois fluxos:
"esqueci minha senha" para qualquer usuário, e código de verificação por e-mail como segundo
fator alternativo ao app autenticador.

Sucesso: um usuário que esqueceu a senha recebe em segundos um e-mail de
`nao-responda@uaizi.com.br` com link válido por 30 minutos, define a senha nova e entra;
ninguém consegue descobrir pelo formulário quais e-mails existem; o ADMIN_GLOBAL que preferir
e-mail ao app recebe o código no login e entra; sem a chave do provedor, nada quebra em
desenvolvimento.

## Decisões de escopo (fechadas com o usuário)

1. **Usos desta frente:** redefinição de senha e código MFA por e-mail. Convite ao criar
   usuário, alertas por limiar e relatório mensal em PDF ficam no backlog (`IDEAS.md`).
2. **Provedor:** Resend (API HTTP, 3 mil e-mails/mês grátis, verificação de domínio por DNS,
   SDK opcional). Descartados: Amazon SES (sandbox, IAM, mais setup), SMTP do Google Workspace
   (limite diário, senha de app, sem ids de entrega), SendGrid (plano grátis menor).
3. **Abordagem A, serviço fino sobre a API REST do Resend com `requests`:** sem SDK, sem
   Jinja2; templates HTML em arquivo com `string.Template`; modo seco sem chave.
4. **Remetente:** `UAIZI NID <nao-responda@uaizi.com.br>`, sem reply-to. Domínio verificado
   no Resend com SPF e DKIM publicados no DNS de `uaizi.com.br` (tarefa do usuário).
5. **Envio síncrono** dentro da requisição, com timeout de 10 s. Sem fila nem retry: o volume
   é baixo e os dois fluxos têm "reenviar" ou "pedir de novo" do lado do usuário.

## Contexto encontrado

- Backend tem `requests==2.32.3`; não tem `resend`, `jinja2`, `httpx` nem `fastapi-mail`.
- `config.py` tem `CORS_ORIGINS` mas nenhuma URL pública do frontend; os links dos e-mails
  precisam de `FRONTEND_URL`.
- Rotas públicas do SPA: só `/` (landing) e `/login`. `LoginPage` não tem "esqueci minha
  senha". Senha hoje só muda via `POST /auth/alterar-senha` (logado) ou pelo admin em
  `/usuarios/{id}`.
- Rate limit: `core/rate_limit.limiter` (slowapi, memória por processo), usado em `/auth/login`
  (`5/minute`, `20/hour`).
- Auditoria: `services/audit_service.registrar_acao` e o job de purga no `lifespan`
  (`purgar_auditoria`), onde entra a purga dos tokens desta spec.
- Frente de MFA (spec de 06/10): tabela `usuario_mfa`, `mfa_token` de 5 min, rotas
  `/auth/mfa/configurar|ativar|desativar|status|verificar`, `MfaModal`, etapa de código na
  `LoginPage`. Esta spec estende esses pontos.

## Arquitetura

```
qualquer fluxo ──▶ services/email_service.enviar(para, assunto, html, texto) ──▶ POST https://api.resend.com/emails
                                     │ (RESEND_API_KEY ausente → log + None)         (Authorization: Bearer, timeout 10 s)
                                     └ templates: app/templates/email/{base,redefinir_senha,codigo_verificacao}.html|.txt

Redefinição:  LoginPage ─"Esqueci minha senha"─▶ /esqueci-senha ─▶ POST /auth/esqueci-senha {email} ─▶ 202 sempre
              e-mail com {FRONTEND_URL}/redefinir-senha?token=… ─▶ GET /auth/redefinir-senha/validar?token ─▶ 200|410
              ─▶ POST /auth/redefinir-senha {token, nova_senha} ─▶ 200 (senha trocada, token usado, acao_audit)

MFA e-mail:   POST /auth/login ─▶ (metodo=email) gera código, envia, devolve {mfa_obrigatorio, mfa_token, metodo:"email", enviado_para}
              POST /auth/mfa/reenviar {mfa_token} ─▶ novo código (1/min, 3 por token)
              POST /auth/mfa/verificar {mfa_token, codigo} ─▶ aceita TOTP ou código de e-mail conforme metodo
```

## 1. Infraestrutura de envio

- **Envs** (`config.py`): `RESEND_API_KEY: str = ""`, `EMAIL_REMETENTE: str = "UAIZI NID
  <nao-responda@uaizi.com.br>"`, `FRONTEND_URL: str = "http://localhost:5173"`.
- **`services/email_service.py`**:
  - `enviar(para: str, assunto: str, html: str, texto: str) -> str | None`: POST em
    `https://api.resend.com/emails` com `{from, to: [para], subject, html, text}`, header
    `Authorization: Bearer {RESEND_API_KEY}`, `timeout=10`. Devolve o `id` do Resend; em
    qualquer falha (sem chave, exceção de rede, status ≠ 2xx) registra `logger.warning` com
    destinatário mascarado e motivo, e devolve `None`. **Nunca lança.**
  - Sem `RESEND_API_KEY`: modo seco — `logger.info("[email seco] para=… assunto=…")` e `None`.
    Em `ENVIRONMENT != "production"` o corpo texto também vai para o log, para testar o fluxo
    localmente.
  - `mascarar_email("lucas@uaizi.com.br") -> "l***@uaizi.com.br"` (primeira letra do local +
    `***` + domínio) — usado em respostas e logs.
- **Templates** em `backend/app/templates/email/`, carregados uma vez e renderizados com
  `string.Template.safe_substitute` (escape HTML dos valores com `html.escape`):
  - `base.html` / `base.txt`: cabeçalho "UAIZI NID", corpo `$conteudo`, rodapé "Mensagem
    automática, não responda. Se você não pediu isso, ignore este e-mail."
  - `redefinir_senha`: saudação com `$nome`, botão/link `$link`, validade "30 minutos",
    aviso de que o link é de uso único.
  - `codigo_verificacao`: `$codigo` em destaque, validade "10 minutos", contexto
    (`$finalidade`: "entrar na plataforma" ou "ativar a verificação por e-mail").
  - Função `renderizar(nome_template, **valores) -> tuple[html, texto]` em
    `services/email_templates.py`.
- Sem rastreamento de abertura/clique (desligado por padrão no Resend; não ativar).

## 2. Redefinição de senha

- **Tabela nova `redefinicao_senha`** (modelo `RedefinicaoSenha`, migração Alembic):
  `id`, `usuario_id` FK `usuarios.id` ON DELETE CASCADE (index), `token_hash String(64)`
  (SHA-256 hex do token), `expira_em DateTime(tz)`, `usado_em DateTime(tz) | null`,
  `ip String(64) | null`, `criado_em DateTime(tz)`.
- **`POST /auth/esqueci-senha { email }`** (`routers/auth.py`, `@limiter.limit("3/minute")`):
  1. Normaliza o e-mail (`strip().lower()`).
  2. Busca `Usuario` ativo. Se não existe ou inativo → **202** `{ "message": "Se o e-mail
     estiver cadastrado, enviamos as instruções." }` sem mais nada (tempo de resposta
     equalizado com um `hash_password` descartável, como o login já faz contra enumeração).
  3. Se existe: conta pedidos da conta na última hora; **≥ 3 → 202 igual, sem enviar**
     (limite por conta, silencioso). Senão: marca `usado_em=now` nos tokens pendentes do
     usuário (invalida), gera `token = secrets.token_urlsafe(32)`, grava
     `RedefinicaoSenha(token_hash=sha256(token), expira_em=now+30min, ip)`, envia
     `redefinir_senha` com `link = f"{FRONTEND_URL}/redefinir-senha?token={token}"`.
     Falha no envio não muda a resposta (202) — fica no log.
- **`GET /auth/redefinir-senha/validar?token=…`**: 200 `{ "valido": true, "email_mascarado" }`
  ou **410** `{ code: "TOKEN_INVALIDO" }` (inexistente, usado ou expirado). Sem rate limit
  próprio além do global.
- **`POST /auth/redefinir-senha { token, nova_senha }`** (`@limiter.limit("5/minute")`):
  `nova_senha` com `min_length=6` (mesma regra de `alterar-senha`); token válido → grava
  `senha_hash`, `usado_em=now`, `acao_audit` com `acao="senha_redefinida_por_email"`, ator e
  alvo = o próprio usuário, ip/user-agent do request; responde 200 `{ "message": "Senha
  redefinida. Faça login." }`. Token inválido → 410.
- **Purga**: `purgar_auditoria` (job existente no `lifespan`) passa a apagar
  `redefinicao_senha` com `criado_em < now - 24h`.
- **Frontend**:
  - `LoginPage`: link "Esqueci minha senha" abaixo do botão, para `/esqueci-senha`.
  - `pages/login/EsqueciSenhaPage.jsx` (`/esqueci-senha`, pública): campo e-mail, botão
    "Enviar instruções", sempre mostra o estado de sucesso com a mensagem genérica; link
    "Voltar ao login".
  - `pages/login/RedefinirSenhaPage.jsx` (`/redefinir-senha`, pública): lê `token` da query;
    chama `validar`; 410 → "Este link expirou ou já foi usado" + link para pedir outro; 200 →
    campos senha e confirmação (iguais, mínimo 6), botão "Salvar nova senha"; sucesso →
    mensagem e botão "Ir para o login". Erros de rede inline.
  - Rotas em `AppRouter.jsx` ao lado de `/login`. Mesmo visual da `LoginPage`.

## 3. MFA por e-mail (estende a spec de MFA)

- **Modelo**: `usuario_mfa` ganha `metodo: String(10) NOT NULL default "totp"` (`"totp"` |
  `"email"`), `codigo_hash String(64) | null`, `codigo_expira_em DateTime(tz) | null`,
  `codigo_tentativas Integer NOT NULL default 0`, `codigo_reenvios Integer NOT NULL default
  0`. Para `metodo="email"`, `segredo_cifrado` é nulo. (Se a frente de MFA já tiver criado a
  tabela, esta é a migração seguinte; se as duas saírem juntas, uma migração só.)
- **Código**: 6 dígitos de `secrets.randbelow(10**6)` com zero à esquerda; guardado como
  `hmac_sha256(SECRET_KEY, codigo)`; validade 10 minutos; uso único; `codigo_tentativas` ≥ 5
  invalida o código (precisa reenviar).
- **Cadastro** (`require_role("ADMIN_GLOBAL")`, mesmas rotas da spec de MFA):
  - `POST /auth/mfa/configurar { metodo: "email" }` → upsert com `ativo=false`,
    `metodo="email"`, gera e envia código (`finalidade="ativar a verificação por e-mail"`)
    para `usuario.email`; devolve `{ metodo: "email", enviado_para: mascarado }`. Falha no
    envio → 502 `{ code: "EMAIL_NAO_ENVIADO" }` (aqui o usuário precisa saber).
  - `POST /auth/mfa/ativar { codigo }` → com `metodo="email"` valida o código enviado (em vez
    de TOTP); resto igual (ativo, códigos de recuperação, `acao_audit`).
  - `GET /auth/mfa/status` passa a incluir `metodo`.
- **Login**: em `AuthService.authenticate`, com MFA ativo e `metodo="email"`: gera o código,
  zera `codigo_tentativas`/`codigo_reenvios`, envia (`finalidade="entrar na plataforma"`) e
  devolve `{ mfa_obrigatorio: true, mfa_token, metodo: "email", enviado_para }`. Se o envio
  falhar, devolve a mesma resposta com `enviado: false` para o front oferecer "Reenviar".
- **`POST /auth/mfa/reenviar { mfa_token }`** (`@limiter.limit("3/minute")`): valida o
  `mfa_token`; `codigo_reenvios` ≥ 3 → 429 `{ code: "LIMITE_REENVIO" }`; menos de 60 s desde o
  último envio → 429 `{ code: "AGUARDE" , segundos }`; senão gera novo código (invalida o
  anterior), incrementa `codigo_reenvios`, envia, devolve `{ enviado_para }`.
- **`POST /auth/mfa/verificar`**: com `metodo="email"`, compara HMAC do código com
  `codigo_hash` dentro da validade; sucesso → limpa `codigo_hash`/`codigo_expira_em` e segue
  como no TOTP (tokens, `LoginAudit mfa_ok`); falha → incrementa `codigo_tentativas`,
  `LoginAudit mfa_invalido`, 401. Códigos de recuperação continuam valendo nos dois métodos.
- **Frontend**:
  - `LoginPage`, etapa de código: quando a resposta traz `metodo: "email"`, texto "Enviamos um
    código para `{enviado_para}`", botão "Reenviar código" (desabilitado 60 s após cada envio,
    some após 3), aviso quando `enviado: false`.
  - `MfaModal`, passo 1: escolha "App autenticador" ou "Código por e-mail (`{email}`)"; no
    método e-mail, o passo 1 mostra "Enviamos um código para…" e vai direto ao campo de
    código; passos 2 e 3 iguais. Estado ativo mostra o método.

## 4. Tratamento de erros

| Situação | Comportamento |
|---|---|
| Sem `RESEND_API_KEY` (dev) | Modo seco: log com o corpo texto; fluxos respondem como se tivessem enviado. |
| Resend fora / 5xx / timeout | `enviar` devolve `None` e loga. Redefinição: 202 igual. MFA configurar: 502. MFA login: resposta com `enviado: false`; front oferece reenviar. |
| E-mail não cadastrado ou usuário inativo | 202 com a mesma mensagem (sem enumeração). |
| 4º pedido de redefinição na mesma hora | 202 silencioso, sem envio. |
| Token de redefinição usado, expirado ou inexistente | 410; página orienta a pedir outro. |
| Dois tokens pedidos em sequência | Só o último vale (anteriores marcados como usados). |
| Código MFA errado 5 vezes | Código invalidado; precisa reenviar. |
| 4º reenvio ou reenvio antes de 60 s | 429 com código de erro; front mostra contagem. |
| `FRONTEND_URL` apontando para localhost em produção | Link quebrado no e-mail; runbook lista a env como obrigatória no deploy. |

## 5. Testes

**Backend** (pytest; `requests.post` mockado via `monkeypatch`):
- `test_email_service.py`: payload e headers corretos; `timeout=10`; sem chave → `None` e
  nenhum POST; exceção de rede → `None`; status 422 do Resend → `None`; `mascarar_email`;
  `renderizar` escapa HTML e preenche `$link`/`$codigo`.
- `test_redefinicao_senha.py`: e-mail inexistente → 202 e nenhum envio; existente → 202,
  linha criada com hash (token em claro não está no banco), envio com link contendo
  `FRONTEND_URL`; 2º pedido invalida o 1º; 4º pedido na hora → 202 sem envio; `validar` 200 e
  410 (expirado via `freezegun`/ajuste de `expira_em`, usado, inexistente); redefinir troca a
  senha (login com a nova funciona, com a antiga falha), marca usado, grava `acao_audit`;
  reuso → 410; `nova_senha` curta → 422; purga apaga linhas com mais de 24 h.
- `test_mfa_email.py`: configurar com `metodo="email"` envia código e devolve mascarado;
  envio falho → 502; ativar com o código certo → ativo + 10 códigos de recuperação; login com
  MFA e-mail envia código e devolve `metodo/enviado_para`; verificar certo → tokens e
  `mfa_ok`; errado 5× → invalidado; expirado → 401; reenviar: 60 s e limite de 3 → 429;
  código antigo após reenvio → 401; código de recuperação continua aceito.

**Frontend** (vitest + jsdom):
- `EsqueciSenhaPage.test.jsx`: envia e mostra mensagem genérica nos dois casos; erro de rede.
- `RedefinirSenhaPage.test.jsx`: 410 mostra estado expirado; 200 mostra formulário; senhas
  diferentes bloqueiam; sucesso mostra "Ir para o login".
- `LoginPage.test.jsx`: link "Esqueci minha senha"; etapa de código com `metodo: "email"`
  mostra endereço mascarado e "Reenviar" com cooldown; `enviado: false` mostra aviso.
- `MfaModal.test.jsx`: escolha do método; método e-mail pula o QR.

Gates: `venv/Scripts/python -m pytest backend/tests -q` e `npx vitest run` verdes; lint sem
erro novo.

## 6. Documentação e operação

- **Runbook `docs/email.md`**: criar conta no Resend; adicionar domínio `uaizi.com.br`;
  publicar os registros DNS que o Resend mostrar (SPF `TXT`, DKIM `TXT`/`CNAME`, opcional
  DMARC `v=DMARC1; p=none`); aguardar "Verified"; criar API key com permissão de envio; setar
  `RESEND_API_KEY`, `EMAIL_REMETENTE`, `FRONTEND_URL` no serviço `api` da Railway (o `worker`
  não envia e-mail nesta frente); teste: pedir redefinição para a própria conta e conferir
  recebimento e o log do Resend; o que fazer se cair em spam (DMARC, conteúdo).
- `README.md` e `AGENTS.md` §14: as três envs.
- `docs/lgpd.md`: §1 (papéis) — Resend como suboperador de envio de e-mail transacional
  (dados: endereço de e-mail, nome, conteúdo do e-mail; servidores nos EUA, transferência
  internacional com base em cláusulas contratuais do provedor); §2 — tokens de redefinição e
  códigos de verificação guardados só como hash e purgados em 24 h; §4 — retenção de 24 h
  para esses registros.

## 7. Ordem de entrega

1. Infra: envs + `email_service` + templates + testes (sem UI). Pode ser mergeada sozinha.
2. Redefinição de senha: modelo/migração + rotas + purga + páginas + testes.
3. MFA por e-mail: **depois** da frente de MFA estar em `main`; migração incremental +
   `authenticate`/`reenviar`/`verificar` + `LoginPage`/`MfaModal` + testes.
4. Operação (usuário): domínio no Resend, DNS, envs na Railway, teste real de envio.

## Fora de escopo (anotado, não silencioso)

- Convite/boas-vindas ao criar usuário (reaproveita 100% desta infra; frente própria)
- Alertas por limiar e relatório executivo mensal em PDF (`IDEAS.md`)
- Webhooks de entrega/bounce do Resend e tabela de e-mails enviados
- Fila assíncrona e retry (envio é síncrono, 10 s)
- Invalidar sessões/tokens JWT ativos ao redefinir a senha (exigiria versão de senha no
  token; anotar para a frente de refresh token)
- Rastreamento de abertura/clique
- Espelho no LEGIS

## Riscos e notas

- **Entregabilidade**: sem DMARC alinhado, Gmail/Outlook podem jogar em spam. O runbook
  inclui DMARC `p=none` para começar.
- **Rate limit em memória** (slowapi) é por processo; com N workers o limite efetivo é N×.
  Para redefinição há o limite por conta no banco (3/hora), que é exato.
- **`FRONTEND_URL` por ambiente**: produção `https://nid.uaizi.com.br`; preview/PR da Railway
  herdaria o valor de produção, então um link de preview levaria à produção. Aceito; não há
  previews hoje.
- **Mesma senha mínima de 6 caracteres** do `alterar-senha`: coerente com o sistema; elevar
  o mínimo é decisão de produto separada.
