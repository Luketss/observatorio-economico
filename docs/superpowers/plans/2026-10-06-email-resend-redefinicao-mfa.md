# E-mail transacional (Resend): redefinição de senha e MFA por e-mail — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao NID um canal de e-mail transacional (Resend) e usá-lo em dois fluxos: "esqueci minha senha" para qualquer usuário e código de verificação por e-mail como segundo fator alternativo ao app autenticador (ADMIN_GLOBAL).

**Architecture:** Um serviço fino `email_service.enviar()` faz `POST https://api.resend.com/emails` com `requests` (timeout 10 s, nunca lança; sem chave = modo seco). Templates HTML/TXT em arquivo renderizados com `string.Template`. A redefinição de senha ganha a tabela `redefinicao_senha` (token SHA-256, 30 min, uso único, 3 pedidos/hora por conta) e três rotas públicas em `/auth`; o MFA por e-mail estende `usuario_mfa` (`metodo`, `codigo_hash` HMAC, validade 10 min, 5 tentativas, 3 reenvios) e o login em duas etapas já existente. No front: páginas `/esqueci-senha` e `/redefinir-senha`, etapa de código da `LoginPage` com "Reenviar", e escolha do método no `MfaModal`.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 (`Mapped`), Alembic (revisões numéricas), `requests==2.32.3`, `string.Template`, `hmac`/`hashlib`, slowapi; React 19 + Vite, React Router v7, Tailwind, Vitest 2 + jsdom + RTL.

**Spec:** `docs/superpowers/specs/2026-10-06-email-resend-redefinicao-mfa-design.md` (autoridade em conflitos). Depende da frente de MFA já em `main` (commit `f1a61be`: `usuario_mfa`, `MfaService`, `/auth/mfa/*`, `MfaModal`, etapa de código na `LoginPage`).

## Global Constraints

- Envs (`backend/app/core/config.py`): `RESEND_API_KEY: str = ""`, `EMAIL_REMETENTE: str = "UAIZI NID <nao-responda@uaizi.com.br>"`, `FRONTEND_URL: str = "http://localhost:5173"`.
- `enviar(para, assunto, html, texto) -> str | None` **nunca lança**; `timeout=10`; URL `https://api.resend.com/emails`; header `Authorization: Bearer {RESEND_API_KEY}`; payload `{from, to: [para], subject, html, text}`; sem chave = modo seco (log, sem POST).
- `mascarar_email("lucas@uaizi.com.br") == "l***@uaizi.com.br"`.
- Templates em `backend/app/templates/email/` (`base`, `redefinir_senha`, `codigo_verificacao`, `.html` e `.txt`); valores escapados com `html.escape` no HTML; `string.Template.safe_substitute`.
- Redefinição: token `secrets.token_urlsafe(32)`, guardado só como SHA-256 hex; validade 30 min; uso único; pedir de novo invalida o anterior; máximo 3 pedidos por conta por hora (silencioso); `POST /auth/esqueci-senha` responde **202** com a mesma mensagem sempre; token inválido/usado/expirado → **410** `TOKEN_INVALIDO`; `nova_senha` `min_length=6`; `acao_audit` `senha_redefinida_por_email`; purga de `redefinicao_senha` com `criado_em < now - 24h` no `purgar_auditoria`.
- Rate limits: `esqueci-senha` `3/minute`; `redefinir-senha` `5/minute`; `mfa/reenviar` `3/minute`; `mfa/enviar-codigo` `3/minute`. Testes que chamam handlers decorados direto desligam `limiter.enabled` (fixture autouse, como em `test_mfa_login.py`).
- MFA e-mail: código `f"{secrets.randbelow(10**6):06d}"`; hash `hmac.new(SECRET_KEY, codigo, sha256).hexdigest()`; validade 10 min; `codigo_tentativas >= 5` invalida; `codigo_reenvios >= 3` → 429 `LIMITE_REENVIO`; menos de 60 s desde o último envio → 429 `AGUARDE`; códigos de recuperação valem nos dois métodos.
- Erros no envelope `{error:{code,message}}` via `AppException(code, message, status_code)`; RBAC via `Depends(require_role(...))`; multi-tenant não se aplica (rotas de conta própria).
- Python: aspas ASCII retas; strings do backend sem acento (padrão do repo: "Codigo invalido"); SQLAlchemy 2.0 `Mapped`; Alembic `0043_redefinicao_senha` (down `0042_usuario_mfa`) e `0044_usuario_mfa_email` (down `0043_redefinicao_senha`).
- Frontend: funcional + hooks; API só via `src/services/api.js`; Tailwind; ESLint ecmaVersion 2020 (sem `??=`/`||=`); testes com `// @vitest-environment jsdom`; textos pt-BR com acento no JSX.
- Commits em ASCII, sem linha `Co-Authored-By`. Nunca stagear `.claude/settings.local.json`, `dados/`, `node_modules/`, `docs/superpowers/plans/2026-05-06-ips-feature.md`.

## Decisões de plano (esclarecimentos à spec, não contradições)

1. **Modo seco devolve `"seco"`** (string truthy) em vez de `None`: a spec diz que sem chave "os fluxos respondem como se tivessem enviado"; se `enviar` devolvesse `None`, `configurar(metodo="email")` daria 502 em desenvolvimento. `None` fica reservado para falha real.
2. **`codigo_enviado_em`** entra em `usuario_mfa` (a spec exige "60 s desde o último envio" mas não listou a coluna).
3. **`AGUARDE` leva os segundos na mensagem** (`"Aguarde 42 s para reenviar"`): o envelope `AppException` não tem campo extra; o front mantém o cooldown local de 60 s e trata o 429 como rede de segurança.
4. **`POST /auth/mfa/enviar-codigo`** (ADMIN_GLOBAL, 3/min): com `metodo="email"` ativo, "Desativar" no modal precisa de um código recém-enviado — a spec não dizia como ele chega. Mesmos limites do reenviar; `codigo_reenvios` zera quando o código anterior já expirou.
5. **`renderizar(nome, **valores) -> (html, texto)`** como na spec, mais `assunto(nome) -> str` para o título do e-mail.
6. **`LoginShell`**: as duas páginas novas e a `LoginPage` compartilham fundo/card/branding via `pages/login/LoginShell.jsx` (a spec pede "mesmo visual da LoginPage").
7. **Reset de `codigo_reenvios`** em `authenticate` (cada login começa com 3 reenvios) e em `configurar`.
8. **Datas em UTC comparadas em Python** passam por `garantir_utc()` (`app/core/datas.py`): SQLite devolve naive, Postgres devolve aware.

## Review Focus

1. E-mail digitado com maiúsculas/espaços em "esqueci minha senha" deve achar a conta — teste `test_solicitar_normaliza_email` (Task 3).
2. Link colado com espaço no fim ou token desconhecido → 410, nunca 500 — `test_validar_token_com_espacos_e_desconhecido` (Task 3).
3. Usuário desativado entre pedir e clicar o link → 410 e senha não muda — `test_redefinir_usuario_inativo_410` (Task 3).
4. `FRONTEND_URL` com barra final não gera `//redefinir-senha` — `test_link_sem_barra_dupla` (Task 3).
5. Login com MFA e-mail e Resend fora: resposta traz `enviado: false` mas o `mfa_token` vale e o reenviar funciona — `test_login_email_envio_falho_enviado_false_e_reenviar_depois_funciona` (Task 6) e aviso na UI (Task 7).

---

## Estrutura de arquivos

**Backend (criar):** `app/services/email_service.py` (envio + máscara), `app/services/email_templates.py` (`renderizar`, `assunto`), `app/templates/email/{base,redefinir_senha,codigo_verificacao}.{html,txt}`, `app/models/redefinicao_senha.py`, `alembic/versions/0043_redefinicao_senha.py`, `alembic/versions/0044_usuario_mfa_email.py`, `app/services/redefinicao_senha_service.py`, `app/schemas/redefinicao_senha.py`, `tests/test_email_service.py`, `tests/test_redefinicao_senha.py`, `tests/test_mfa_email.py`.
**Backend (modificar):** `app/core/config.py`, `app/core/datas.py` (+`garantir_utc`), `app/models/__init__.py`, `alembic/env.py`, `app/services/audit_service.py` (purga), `app/api/v1/routers/auth.py` (3 rotas), `app/models/usuario_mfa.py`, `app/services/mfa_service.py`, `app/services/auth_service.py`, `app/schemas/mfa.py`, `app/api/v1/routers/mfa.py` (2 rotas).
**Frontend (criar):** `src/pages/login/LoginShell.jsx`, `src/pages/login/EsqueciSenhaPage.jsx` (+test), `src/pages/login/RedefinirSenhaPage.jsx` (+test).
**Frontend (modificar):** `src/pages/login/LoginPage.jsx` (+test), `src/app/router/AppRouter.jsx`, `src/context/AuthContext.jsx` (+test), `src/components/MfaModal.jsx` (+test).
**Docs:** `docs/email.md` (novo), `README.md`, `AGENTS.md`, `docs/lgpd.md`, `docs/mfa.md`, `IDEAS.md`.

---

### Task 1: Infraestrutura de envio — envs, `email_service`, templates e `renderizar`

**Files:**
- Modify: `backend/app/core/config.py` (bloco após `MFA_ENCRYPTION_KEY`)
- Create: `backend/app/services/email_service.py`
- Create: `backend/app/services/email_templates.py`
- Create: `backend/app/templates/email/base.html`, `base.txt`, `redefinir_senha.html`, `redefinir_senha.txt`, `codigo_verificacao.html`, `codigo_verificacao.txt`
- Test: `backend/tests/test_email_service.py`

**Interfaces:**
- Produces: `email_service.enviar(para: str, assunto: str, html: str, texto: str) -> str | None` (id do Resend; `"seco"` sem chave; `None` em falha); `email_service.MODO_SECO = "seco"`; `email_service.mascarar_email(email: str) -> str`; `email_templates.renderizar(nome: str, **valores) -> tuple[str, str]`; `email_templates.assunto(nome: str) -> str`; `settings.RESEND_API_KEY`, `settings.EMAIL_REMETENTE`, `settings.FRONTEND_URL`.

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `backend/tests/test_email_service.py`:

```python
"""email_service.enviar (Resend via requests, nunca lanca) e email_templates.renderizar."""
import logging

import pytest
import requests

import app.services.email_service as email_service
from app.services.email_service import enviar, mascarar_email
from app.services.email_templates import assunto, renderizar


class _Resp:
    def __init__(self, status_code, body=None):
        self.status_code = status_code
        self._body = body if body is not None else {}

    def json(self):
        if isinstance(self._body, Exception):
            raise self._body
        return self._body


@pytest.fixture()
def chave(monkeypatch):
    monkeypatch.setattr(email_service.settings, "RESEND_API_KEY", "re_test_123")
    monkeypatch.setattr(email_service.settings, "EMAIL_REMETENTE", "UAIZI NID <nao-responda@uaizi.com.br>")


def test_enviar_monta_payload_headers_e_timeout(chave, monkeypatch):
    chamadas = []

    def fake_post(url, **kw):
        chamadas.append((url, kw))
        return _Resp(200, {"id": "abc-123"})

    monkeypatch.setattr(email_service.requests, "post", fake_post)
    rid = enviar("lucas@uaizi.com.br", "Assunto X", "<p>oi</p>", "oi")
    assert rid == "abc-123"
    url, kw = chamadas[0]
    assert url == "https://api.resend.com/emails"
    assert kw["timeout"] == 10
    assert kw["headers"]["Authorization"] == "Bearer re_test_123"
    assert kw["json"] == {
        "from": "UAIZI NID <nao-responda@uaizi.com.br>",
        "to": ["lucas@uaizi.com.br"],
        "subject": "Assunto X",
        "html": "<p>oi</p>",
        "text": "oi",
    }


def test_sem_chave_modo_seco_nao_posta_e_devolve_seco(monkeypatch, caplog):
    monkeypatch.setattr(email_service.settings, "RESEND_API_KEY", "   ")
    monkeypatch.setattr(email_service.settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(email_service.requests, "post", lambda *a, **k: pytest.fail("nao deveria postar"))
    with caplog.at_level(logging.INFO, logger="app.email"):
        rid = enviar("lucas@uaizi.com.br", "Assunto", "<p>x</p>", "corpo texto")
    assert rid == "seco"
    assert "l***@uaizi.com.br" in caplog.text
    assert "corpo texto" in caplog.text  # fora de producao o texto vai para o log
    assert "lucas@uaizi.com.br" not in caplog.text


def test_modo_seco_em_producao_nao_loga_corpo(monkeypatch, caplog):
    monkeypatch.setattr(email_service.settings, "RESEND_API_KEY", "")
    monkeypatch.setattr(email_service.settings, "ENVIRONMENT", "production")
    with caplog.at_level(logging.INFO, logger="app.email"):
        assert enviar("a@b.com", "S", "<p>x</p>", "corpo secreto") == "seco"
    assert "corpo secreto" not in caplog.text


def test_excecao_de_rede_devolve_none_e_loga(chave, monkeypatch, caplog):
    def boom(*a, **k):
        raise requests.ConnectionError("down")

    monkeypatch.setattr(email_service.requests, "post", boom)
    with caplog.at_level(logging.WARNING, logger="app.email"):
        assert enviar("lucas@uaizi.com.br", "S", "<p>x</p>", "x") is None
    assert "l***@uaizi.com.br" in caplog.text
    assert "ConnectionError" in caplog.text


def test_status_nao_2xx_devolve_none(chave, monkeypatch, caplog):
    monkeypatch.setattr(email_service.requests, "post", lambda *a, **k: _Resp(422, {"message": "invalid"}))
    with caplog.at_level(logging.WARNING, logger="app.email"):
        assert enviar("a@b.com", "S", "<p>x</p>", "x") is None
    assert "422" in caplog.text


def test_2xx_sem_json_devolve_none(chave, monkeypatch):
    monkeypatch.setattr(email_service.requests, "post", lambda *a, **k: _Resp(200, ValueError("no json")))
    assert enviar("a@b.com", "S", "<p>x</p>", "x") is None


def test_mascarar_email():
    assert mascarar_email("lucas@uaizi.com.br") == "l***@uaizi.com.br"
    assert mascarar_email("a@b.c") == "a***@b.c"
    assert mascarar_email("sem-arroba") == "***"
    assert mascarar_email("") == "***"


def test_renderizar_redefinir_senha_escapa_html_e_preenche_link():
    html, texto = renderizar("redefinir_senha", nome="Ana <b>X</b>", link="https://nid.uaizi.com.br/redefinir-senha?token=abc&x=1")
    assert "Ana &lt;b&gt;X&lt;/b&gt;" in html
    assert "<b>X</b>" not in html
    assert 'href="https://nid.uaizi.com.br/redefinir-senha?token=abc&amp;x=1"' in html
    assert "https://nid.uaizi.com.br/redefinir-senha?token=abc&x=1" in texto
    assert "30 minutos" in html and "30 minutos" in texto
    assert "UAIZI NID" in html and "não responda" in html.lower()
    assert "$conteudo" not in html and "$nome" not in html


def test_renderizar_codigo_verificacao():
    html, texto = renderizar("codigo_verificacao", codigo="012345", finalidade="entrar na plataforma")
    assert "012345" in html and "012345" in texto
    assert "entrar na plataforma" in html
    assert "10 minutos" in texto


def test_renderizar_template_desconhecido():
    with pytest.raises(KeyError):
        renderizar("nao_existe", x=1)


def test_assunto():
    assert assunto("redefinir_senha") == "Redefinicao de senha - UAIZI NID"
    assert assunto("codigo_verificacao") == "Seu codigo de verificacao - UAIZI NID"
```

- [ ] **Step 2: Rodar para ver falhar**

Run (raiz do repo): `venv/Scripts/python -m pytest backend/tests/test_email_service.py -o addopts="" -q`
Expected: erro de import (`app.services.email_service` nao existe).

- [ ] **Step 3: Envs em `config.py`**

Em `backend/app/core/config.py`, logo após a linha `MFA_ENCRYPTION_KEY: str = ""`, inserir:

```python

    # E-mail transacional (Resend, docs/email.md). Sem RESEND_API_KEY = modo seco:
    # nada e enviado, o corpo vai para o log (fora de producao) e os fluxos seguem
    # como se tivessem enviado. FRONTEND_URL monta os links dos e-mails
    # (producao: https://nid.uaizi.com.br).
    RESEND_API_KEY: str = ""
    EMAIL_REMETENTE: str = "UAIZI NID <nao-responda@uaizi.com.br>"
    FRONTEND_URL: str = "http://localhost:5173"
```

- [ ] **Step 4: Templates**

Criar a pasta `backend/app/templates/email/` com seis arquivos (UTF-8; acentos permitidos — são conteúdo, não código Python). Nenhum deles tem `__init__.py`; o `Dockerfile` faz `COPY . .`, então sobem com o build.

`base.html`:
```html
<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>UAIZI NID</title></head>
<body style="margin:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#1e293b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;padding:32px;">
        <tr><td style="font-size:18px;font-weight:bold;color:#0f172a;padding-bottom:16px;">UAIZI NID</td></tr>
        <tr><td style="font-size:15px;line-height:1.5;">$conteudo</td></tr>
        <tr><td style="font-size:12px;color:#64748b;padding-top:24px;border-top:1px solid #e2e8f0;">
          Mensagem automática, não responda. Se você não pediu isso, ignore este e-mail.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

`base.txt`:
```text
UAIZI NID

$conteudo

--
Mensagem automática, não responda. Se você não pediu isso, ignore este e-mail.
```

`redefinir_senha.html`:
```html
<p>Olá, $nome.</p>
<p>Recebemos um pedido para redefinir a senha da sua conta no UAIZI NID.</p>
<p style="margin:24px 0;"><a href="$link" style="background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold;display:inline-block;">Redefinir minha senha</a></p>
<p>Ou copie e cole este endereço no navegador:<br><span style="word-break:break-all;color:#2563eb;">$link</span></p>
<p>O link vale por <strong>30 minutos</strong> e pode ser usado uma única vez.</p>
```

`redefinir_senha.txt`:
```text
Olá, $nome.

Recebemos um pedido para redefinir a senha da sua conta no UAIZI NID.
Abra este endereço para definir a nova senha:

$link

O link vale por 30 minutos e pode ser usado uma única vez.
```

`codigo_verificacao.html`:
```html
<p>Use o código abaixo para $finalidade:</p>
<p style="font-size:32px;letter-spacing:8px;font-weight:bold;color:#0f172a;margin:16px 0;">$codigo</p>
<p>Ele vale por <strong>10 minutos</strong>. Não compartilhe este código com ninguém.</p>
```

`codigo_verificacao.txt`:
```text
Use o código abaixo para $finalidade:

    $codigo

Ele vale por 10 minutos. Não compartilhe este código com ninguém.
```

- [ ] **Step 5: `email_templates.py`**

Criar `backend/app/services/email_templates.py`:

```python
"""Templates de e-mail (string.Template; sem Jinja). Valores sao escapados no HTML.

Spec: docs/superpowers/specs/2026-10-06-email-resend-redefinicao-mfa-design.md, secao 1.
"""
import html
from functools import lru_cache
from pathlib import Path
from string import Template

PASTA = Path(__file__).resolve().parents[1] / "templates" / "email"

ASSUNTOS = {
    "redefinir_senha": "Redefinicao de senha - UAIZI NID",
    "codigo_verificacao": "Seu codigo de verificacao - UAIZI NID",
}


@lru_cache(maxsize=None)
def _ler(nome: str, extensao: str) -> Template:
    caminho = PASTA / f"{nome}.{extensao}"
    if not caminho.is_file():
        raise KeyError(f"template de e-mail desconhecido: {nome}.{extensao}")
    return Template(caminho.read_text(encoding="utf-8"))


def assunto(nome: str) -> str:
    return ASSUNTOS[nome]


def renderizar(nome: str, **valores) -> tuple[str, str]:
    """(html, texto). O corpo do template entra em `$conteudo` do base."""
    if nome not in ASSUNTOS:
        raise KeyError(f"template de e-mail desconhecido: {nome}")
    valores_html = {k: html.escape(str(v), quote=True) for k, v in valores.items()}
    valores_txt = {k: str(v) for k, v in valores.items()}
    corpo_html = _ler(nome, "html").safe_substitute(valores_html)
    corpo_txt = _ler(nome, "txt").safe_substitute(valores_txt)
    pagina_html = _ler("base", "html").safe_substitute(conteudo=corpo_html)
    pagina_txt = _ler("base", "txt").safe_substitute(conteudo=corpo_txt)
    return pagina_html, pagina_txt
```

- [ ] **Step 6: `email_service.py`**

Criar `backend/app/services/email_service.py`:

```python
"""Envio de e-mail transacional via API REST do Resend. NUNCA lanca.

Spec: docs/superpowers/specs/2026-10-06-email-resend-redefinicao-mfa-design.md, secao 1.
Sem RESEND_API_KEY: modo seco (devolve MODO_SECO; nada e enviado). Falha real: None.
"""
import logging

import requests

from app.core.config import settings

logger = logging.getLogger("app.email")

RESEND_URL = "https://api.resend.com/emails"
TIMEOUT_SEGUNDOS = 10
MODO_SECO = "seco"


def mascarar_email(email: str) -> str:
    local, arroba, dominio = (email or "").partition("@")
    if not arroba or not dominio:
        return "***"
    return f"{local[:1]}***@{dominio}"


def enviar(para: str, assunto: str, html: str, texto: str) -> str | None:
    """Devolve o id do Resend, MODO_SECO sem chave, ou None em qualquer falha."""
    destino = mascarar_email(para)
    if not (settings.RESEND_API_KEY or "").strip():
        logger.info("[email seco] para=%s assunto=%s", destino, assunto)
        if settings.ENVIRONMENT != "production":
            logger.info("[email seco] corpo:\n%s", texto)
        return MODO_SECO
    try:
        resposta = requests.post(
            RESEND_URL,
            json={
                "from": settings.EMAIL_REMETENTE,
                "to": [para],
                "subject": assunto,
                "html": html,
                "text": texto,
            },
            headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
            timeout=TIMEOUT_SEGUNDOS,
        )
    except requests.RequestException as exc:
        logger.warning("E-mail nao enviado para %s: %s", destino, exc.__class__.__name__)
        return None
    if not 200 <= resposta.status_code < 300:
        logger.warning("E-mail nao enviado para %s: HTTP %s", destino, resposta.status_code)
        return None
    try:
        return resposta.json().get("id")
    except (ValueError, AttributeError):
        logger.warning("E-mail para %s aceito mas resposta sem id", destino)
        return None
```

- [ ] **Step 7: Rodar os testes**

Run: `venv/Scripts/python -m pytest backend/tests/test_email_service.py -o addopts="" -q`
Expected: `11 passed`.

- [ ] **Step 8: Suite completa e commit**

Run: `venv/Scripts/python -m pytest backend/tests -o addopts="" -q` → 0 falhas.

```bash
git add backend/app/core/config.py backend/app/services/email_service.py backend/app/services/email_templates.py backend/app/templates/email backend/tests/test_email_service.py
git commit -m "feat(email): servico de envio via Resend (modo seco sem chave), templates e envs"
```

### Task 2: Modelo `RedefinicaoSenha`, migração 0043, `garantir_utc` e purga de 24 h

**Files:**
- Create: `backend/app/models/redefinicao_senha.py`
- Create: `backend/alembic/versions/0043_redefinicao_senha.py`
- Modify: `backend/app/models/__init__.py` (import + `__all__`), `backend/alembic/env.py` (lista `from app.models import (...)`)
- Modify: `backend/app/core/datas.py` (append `garantir_utc`)
- Modify: `backend/app/services/audit_service.py` (`purgar_auditoria`)
- Test: `backend/tests/test_redefinicao_senha.py` (criado aqui; a Task 3 acrescenta testes)

**Interfaces:**
- Produces: `RedefinicaoSenha(id, usuario_id, token_hash, expira_em, usado_em, ip, criado_em)`; `datas.garantir_utc(dt: datetime | None) -> datetime | None`; `audit_service.RETENCAO_REDEFINICAO_HORAS = 24`; `purgar_auditoria()` devolve também `"redefinicoes": n`.

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `backend/tests/test_redefinicao_senha.py`:

```python
"""Redefinicao de senha por e-mail: modelo e purga (Task 2); servico e rotas (Task 3)."""
import re
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.core.datas import garantir_utc
from app.core.security import hash_password, verify_password
from app.db.base import Base
from app.models.acao_audit import AcaoAudit
from app.models.login_audit import LoginAudit
from app.models.municipio import Municipio
from app.models.redefinicao_senha import RedefinicaoSenha
from app.models.role import Role
from app.models.usuario import Usuario
from app.models.usuario_mfa import UsuarioMfa
from app.services.audit_service import purgar_auditoria


class _FakeClient:
    host = "10.0.0.1"


class _FakeRequest:
    headers = {"user-agent": "pytest"}
    client = _FakeClient()


@pytest.fixture(autouse=True)
def limiter_desligado(monkeypatch):
    # Handlers decorados com @limiter.limit sao chamados direto com _FakeRequest.
    from app.core.rate_limit import limiter
    monkeypatch.setattr(limiter, "enabled", False)


@pytest.fixture()
def db():
    engine = create_engine("sqlite://")

    @event.listens_for(engine, "connect")
    def _fk_on(dbapi_conn, _record):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine, tables=[
        Municipio.__table__, Role.__table__, Usuario.__table__, UsuarioMfa.__table__,
        RedefinicaoSenha.__table__, LoginAudit.__table__, AcaoAudit.__table__,
    ])
    s = sessionmaker(bind=engine)()
    s.add(Role(nome="VISUALIZADOR", builtin=True, permissoes={}))
    s.commit()
    yield s
    s.close()


def _usuario(db, email="ana@x.gov.br", ativo=True):
    role = db.query(Role).filter(Role.nome == "VISUALIZADOR").one()
    u = Usuario(nome="Ana", email=email, senha_hash=hash_password("senha123"), role_id=role.id, ativo=ativo)
    db.add(u)
    db.commit()
    return u


def _agora():
    return datetime.now(timezone.utc)


# ---------- Task 2: modelo, garantir_utc, purga ----------

def test_modelo_colunas_fk_cascade_e_unicidade():
    cols = {c.name: c for c in RedefinicaoSenha.__table__.columns}
    assert set(cols) == {"id", "usuario_id", "token_hash", "expira_em", "usado_em", "ip", "criado_em"}
    fk = next(iter(cols["usuario_id"].foreign_keys))
    assert fk.ondelete == "CASCADE"
    assert cols["token_hash"].unique is True
    assert cols["token_hash"].type.length == 64
    assert cols["usado_em"].nullable is True and cols["ip"].nullable is True


def test_excluir_usuario_apaga_tokens(db):
    u = _usuario(db)
    db.add(RedefinicaoSenha(usuario_id=u.id, token_hash="a" * 64, expira_em=_agora() + timedelta(minutes=30)))
    db.commit()
    db.delete(u)
    db.commit()
    assert db.query(RedefinicaoSenha).count() == 0


def test_garantir_utc():
    assert garantir_utc(None) is None
    naive = datetime(2026, 10, 6, 12, 0, 0)
    assert garantir_utc(naive).tzinfo == timezone.utc
    aware = datetime(2026, 10, 6, 12, 0, 0, tzinfo=timezone(timedelta(hours=-3)))
    assert garantir_utc(aware) is aware


def test_purga_apaga_tokens_com_mais_de_24h(db):
    u = _usuario(db)
    agora = _agora()
    db.add(RedefinicaoSenha(usuario_id=u.id, token_hash="b" * 64, expira_em=agora, criado_em=agora - timedelta(hours=25)))
    db.add(RedefinicaoSenha(usuario_id=u.id, token_hash="c" * 64, expira_em=agora, criado_em=agora - timedelta(hours=23)))
    db.commit()
    resultado = purgar_auditoria(db, agora=agora)
    assert resultado["redefinicoes"] == 1
    assert [r.token_hash for r in db.query(RedefinicaoSenha).all()] == ["c" * 64]
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `venv/Scripts/python -m pytest backend/tests/test_redefinicao_senha.py -o addopts="" -q`
Expected: erro de import (`app.models.redefinicao_senha` / `garantir_utc` nao existem).

- [ ] **Step 3: Modelo**

Criar `backend/app/models/redefinicao_senha.py`:

```python
from datetime import datetime, timezone

from app.db.base import Base
from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column


def _agora_utc() -> datetime:
    return datetime.now(timezone.utc)


class RedefinicaoSenha(Base):
    """Token de "esqueci minha senha": guardado so como SHA-256; 30 min; uso unico.
    Purgado 24 h depois de criado (audit_service.purgar_auditoria)."""

    __tablename__ = "redefinicao_senha"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    usuario_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    expira_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    usado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # default em Python (alem do server_default): as consultas por janela de tempo
    # comparam com datetime.now(timezone.utc) e o SQLite dos testes nao converte CURRENT_TIMESTAMP.
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_agora_utc, server_default=func.now()
    )
```

Registrar em `backend/app/models/__init__.py`: adicionar `from app.models.redefinicao_senha import RedefinicaoSenha` junto dos outros imports e `"RedefinicaoSenha",` em `__all__` (logo após `"UsuarioMfa",`). Em `backend/alembic/env.py`, acrescentar `RedefinicaoSenha,` dentro da lista `from app.models import ( ... )` (ordem alfabética não importa; manter uma por linha como as demais).

- [ ] **Step 4: Migração**

Criar `backend/alembic/versions/0043_redefinicao_senha.py`:

```python
"""redefinicao_senha: tokens de "esqueci minha senha" (hash SHA-256, 30 min, uso unico)

Spec 2026-10-06-email-resend-redefinicao-mfa, secao 2.

Revision ID: 0043_redefinicao_senha
Revises: 0042_usuario_mfa
Create Date: 2026-10-06
"""

import sqlalchemy as sa
from alembic import op


revision = "0043_redefinicao_senha"
down_revision = "0042_usuario_mfa"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "redefinicao_senha",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "usuario_id", sa.Integer(),
            sa.ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expira_em", sa.DateTime(timezone=True), nullable=False),
        sa.Column("usado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column(
            "criado_em", sa.DateTime(timezone=True),
            server_default=sa.func.now(), nullable=False,
        ),
    )
    op.create_index("ix_redefinicao_senha_id", "redefinicao_senha", ["id"])
    op.create_index("ix_redefinicao_senha_usuario_id", "redefinicao_senha", ["usuario_id"])
    op.create_index("ix_redefinicao_senha_token_hash", "redefinicao_senha", ["token_hash"], unique=True)


def downgrade():
    op.drop_index("ix_redefinicao_senha_token_hash", table_name="redefinicao_senha")
    op.drop_index("ix_redefinicao_senha_usuario_id", table_name="redefinicao_senha")
    op.drop_index("ix_redefinicao_senha_id", table_name="redefinicao_senha")
    op.drop_table("redefinicao_senha")
```

Verificar que importa: `venv/Scripts/python -c "import importlib.util,sys; sys.path.insert(0,'backend'); import conftest" ` não é necessário — basta `venv/Scripts/python -c "import ast; ast.parse(open('backend/alembic/versions/0043_redefinicao_senha.py').read())"`.

- [ ] **Step 5: `garantir_utc` em `datas.py`**

Acrescentar ao final de `backend/app/core/datas.py`:

```python


def garantir_utc(dt: datetime | None) -> datetime | None:
    """Normaliza para tz-aware UTC. SQLite devolve o UTC gravado como naive;
    Postgres devolve aware. Comparar naive com aware em Python lanca TypeError."""
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)
```

- [ ] **Step 6: Purga em `audit_service.py`**

Em `backend/app/services/audit_service.py`:

1. Importar o modelo junto dos outros: `from app.models.redefinicao_senha import RedefinicaoSenha`.
2. Após `RETENCAO_ACOES_ANOS = 5`, acrescentar:
```python
RETENCAO_REDEFINICAO_HORAS = 24  # tokens de "esqueci minha senha" (docs/lgpd.md secao 4)
```
3. Em `purgar_auditoria`, dentro do `try`, antes de `corte_acessos, corte_acoes = cortes_retencao(agora)`, inserir `agora = agora or datetime.now(timezone.utc)`; depois do bloco `n_acoes = (...)`, inserir:
```python
        n_redef = (
            db.query(RedefinicaoSenha)
            .filter(RedefinicaoSenha.criado_em < agora - timedelta(hours=RETENCAO_REDEFINICAO_HORAS))
            .delete(synchronize_session=False)
        )
```
4. Trocar o `if n_login or n_leituras or n_acoes:` + `logger.info(...)` por:
```python
        if n_login or n_leituras or n_acoes or n_redef:
            logger.info(
                "Purga de auditoria: login=%s leituras=%s acoes=%s redefinicoes=%s",
                n_login, n_leituras, n_acoes, n_redef,
            )
        return {"login_audit": n_login, "leituras": n_leituras, "acoes": n_acoes, "redefinicoes": n_redef}
```
5. O teste existente `backend/tests/test_audit_purga.py` quebra de duas formas e precisa de dois ajustes: (a) o fixture `db` cria só as tabelas de auditoria — sem `redefinicao_senha`, o `DELETE` novo falha e a purga devolve `{}`; acrescentar `from app.models.redefinicao_senha import RedefinicaoSenha` aos imports e `RedefinicaoSenha.__table__,` à lista `tables=[...]` do fixture; (b) a asserção `assert contagens == {"login_audit": 1, "leituras": 1, "acoes": 1}` passa a ser `assert contagens == {"login_audit": 1, "leituras": 1, "acoes": 1, "redefinicoes": 0}`. O teste `purgar_auditoria(_DBQuebrado()) == {}` continua igual.

- [ ] **Step 7: Rodar os testes**

Run: `venv/Scripts/python -m pytest backend/tests/test_redefinicao_senha.py -o addopts="" -q` → `4 passed`.
Run: `venv/Scripts/python -m pytest backend/tests -o addopts="" -q` → 0 falhas.

- [ ] **Step 8: Commit**

```bash
git add backend/app/models/redefinicao_senha.py backend/app/models/__init__.py backend/alembic/env.py backend/alembic/versions/0043_redefinicao_senha.py backend/app/core/datas.py backend/app/services/audit_service.py backend/tests/test_redefinicao_senha.py
git commit -m "feat(email): modelo redefinicao_senha, migracao 0043, garantir_utc e purga de 24h"
```

---

### Task 3: Serviço e rotas de redefinição de senha

**Files:**
- Create: `backend/app/services/redefinicao_senha_service.py`
- Create: `backend/app/schemas/redefinicao_senha.py`
- Modify: `backend/app/api/v1/routers/auth.py` (3 rotas novas ao final)
- Test: `backend/tests/test_redefinicao_senha.py` (acrescentar)

**Interfaces:**
- Consumes: `RedefinicaoSenha` (Task 2); `email_service.enviar`, `mascarar_email`, `email_templates.renderizar/assunto` (Task 1); `settings.FRONTEND_URL`.
- Produces: `RedefinicaoSenhaService(db).solicitar(email, ip=None) -> None`, `.validar(token) -> Usuario`, `.redefinir(token, nova_senha, request=None) -> None`; `TokenInvalido` (410 `TOKEN_INVALIDO`); `hash_token(token) -> str`; `montar_link(token) -> str`; `MENSAGEM_GENERICA`; rotas `POST /auth/esqueci-senha` (202), `GET /auth/redefinir-senha/validar?token=`, `POST /auth/redefinir-senha`; schemas `EsqueciSenhaIn(email)`, `RedefinirSenhaIn(token, nova_senha)`.

- [ ] **Step 1: Acrescentar os testes (falhando)**

No topo de `backend/tests/test_redefinicao_senha.py`, acrescentar aos imports:

```python
import app.services.redefinicao_senha_service as redef_mod
from app.api.v1.routers.auth import esqueci_senha, redefinir_senha, validar_redefinicao
from app.core.exceptions import AppException
from app.schemas.redefinicao_senha import EsqueciSenhaIn, RedefinirSenhaIn
from app.services.redefinicao_senha_service import (
    MENSAGEM_GENERICA,
    RedefinicaoSenhaService,
    hash_token,
)
from pydantic import ValidationError
```

E ao final do arquivo:

```python
# ---------- Task 3: servico e rotas ----------

@pytest.fixture()
def enviados(monkeypatch):
    """Espiona email_service.enviar como importado pelo servico; devolve a lista de envios."""
    lista = []

    def fake_enviar(para, assunto, html, texto):
        lista.append({"para": para, "assunto": assunto, "html": html, "texto": texto})
        return "id-fake"

    monkeypatch.setattr(redef_mod, "enviar", fake_enviar)
    monkeypatch.setattr(redef_mod.settings, "FRONTEND_URL", "https://nid.uaizi.com.br")
    return lista


def _token_do_envio(envio):
    return re.search(r"token=([A-Za-z0-9_\-]+)", envio["texto"]).group(1)


def test_solicitar_email_inexistente_nao_envia_nem_grava(db, enviados):
    RedefinicaoSenhaService(db).solicitar("ninguem@x.gov.br", ip="1.2.3.4")
    assert enviados == []
    assert db.query(RedefinicaoSenha).count() == 0


def test_solicitar_usuario_inativo_nao_envia(db, enviados):
    _usuario(db, ativo=False)
    RedefinicaoSenhaService(db).solicitar("ana@x.gov.br")
    assert enviados == [] and db.query(RedefinicaoSenha).count() == 0


def test_solicitar_normaliza_email(db, enviados):
    _usuario(db)
    RedefinicaoSenhaService(db).solicitar("  ANA@X.GOV.BR ")
    assert len(enviados) == 1 and enviados[0]["para"] == "ana@x.gov.br"
    assert db.query(RedefinicaoSenha).count() == 1


def test_solicitar_grava_hash_e_envia_link_com_frontend_url(db, enviados):
    u = _usuario(db)
    RedefinicaoSenhaService(db).solicitar("ana@x.gov.br", ip="9.9.9.9")
    reg = db.query(RedefinicaoSenha).one()
    token = _token_do_envio(enviados[0])
    assert len(token) >= 40
    assert reg.token_hash == hash_token(token)
    assert token not in reg.token_hash and reg.usuario_id == u.id and reg.ip == "9.9.9.9"
    assert reg.usado_em is None
    assert "https://nid.uaizi.com.br/redefinir-senha?token=" + token in enviados[0]["texto"]
    assert "Ana" in enviados[0]["html"]
    assert enviados[0]["assunto"] == "Redefinicao de senha - UAIZI NID"


def test_link_sem_barra_dupla(db, enviados, monkeypatch):
    monkeypatch.setattr(redef_mod.settings, "FRONTEND_URL", "https://nid.uaizi.com.br/")
    _usuario(db)
    RedefinicaoSenhaService(db).solicitar("ana@x.gov.br")
    assert "https://nid.uaizi.com.br/redefinir-senha?token=" in enviados[0]["texto"]
    assert "//redefinir-senha" not in enviados[0]["texto"]


def test_segundo_pedido_invalida_o_primeiro(db, enviados):
    _usuario(db)
    svc = RedefinicaoSenhaService(db)
    svc.solicitar("ana@x.gov.br")
    svc.solicitar("ana@x.gov.br")
    t1, t2 = (_token_do_envio(e) for e in enviados)
    with pytest.raises(AppException) as exc:
        svc.validar(t1)
    assert exc.value.status_code == 410 and exc.value.code == "TOKEN_INVALIDO"
    assert svc.validar(t2).email == "ana@x.gov.br"


def test_quarto_pedido_na_hora_nao_envia(db, enviados):
    _usuario(db)
    svc = RedefinicaoSenhaService(db)
    for _ in range(4):
        svc.solicitar("ana@x.gov.br")
    assert len(enviados) == 3
    assert db.query(RedefinicaoSenha).count() == 3


def test_validar_token_com_espacos_e_desconhecido(db, enviados):
    _usuario(db)
    svc = RedefinicaoSenhaService(db)
    svc.solicitar("ana@x.gov.br")
    token = _token_do_envio(enviados[0])
    assert svc.validar(f"  {token}\n").email == "ana@x.gov.br"
    for ruim in ("x" * 43, "", "   "):
        with pytest.raises(AppException) as exc:
            svc.validar(ruim)
        assert exc.value.status_code == 410


def test_validar_expirado_410(db, enviados):
    _usuario(db)
    svc = RedefinicaoSenhaService(db)
    svc.solicitar("ana@x.gov.br")
    reg = db.query(RedefinicaoSenha).one()
    reg.expira_em = _agora() - timedelta(minutes=1)
    db.commit()
    with pytest.raises(AppException) as exc:
        svc.validar(_token_do_envio(enviados[0]))
    assert exc.value.code == "TOKEN_INVALIDO"


def test_redefinir_troca_senha_marca_usado_audita_e_reuso_410(db, enviados):
    u = _usuario(db)
    svc = RedefinicaoSenhaService(db)
    svc.solicitar("ana@x.gov.br")
    token = _token_do_envio(enviados[0])
    svc.redefinir(token, "novaSenha9", request=_FakeRequest())
    db.refresh(u)
    assert verify_password("novaSenha9", u.senha_hash) and not verify_password("senha123", u.senha_hash)
    reg = db.query(RedefinicaoSenha).one()
    assert reg.usado_em is not None
    audit = db.query(AcaoAudit).filter(AcaoAudit.acao == "senha_redefinida_por_email").one()
    assert audit.ator_email == "ana@x.gov.br" and audit.alvo_email == "ana@x.gov.br" and audit.ip == "10.0.0.1"
    with pytest.raises(AppException) as exc:
        svc.redefinir(token, "outraSenha9")
    assert exc.value.status_code == 410


def test_redefinir_usuario_inativo_410(db, enviados):
    u = _usuario(db)
    svc = RedefinicaoSenhaService(db)
    svc.solicitar("ana@x.gov.br")
    token = _token_do_envio(enviados[0])
    u.ativo = False
    db.commit()
    with pytest.raises(AppException) as exc:
        svc.redefinir(token, "novaSenha9")
    assert exc.value.status_code == 410
    db.refresh(u)
    assert verify_password("senha123", u.senha_hash)


def test_handlers_esqueci_validar_redefinir(db, enviados):
    _usuario(db)
    req = _FakeRequest()
    r = esqueci_senha(req, EsqueciSenhaIn(email="ana@x.gov.br"), db=db)
    assert r == {"message": MENSAGEM_GENERICA}
    r2 = esqueci_senha(req, EsqueciSenhaIn(email="nao@existe.gov.br"), db=db)
    assert r2 == r  # mesma resposta, sem enumeracao
    token = _token_do_envio(enviados[0])
    v = validar_redefinicao(token=token, db=db)
    assert v == {"valido": True, "email_mascarado": "a***@x.gov.br"}
    out = redefinir_senha(req, RedefinirSenhaIn(token=token, nova_senha="novaSenha9"), db=db)
    assert out["message"].startswith("Senha redefinida")
    with pytest.raises(AppException) as exc:
        validar_redefinicao(token=token, db=db)
    assert exc.value.status_code == 410


def test_schema_nova_senha_curta_422():
    with pytest.raises(ValidationError):
        RedefinirSenhaIn(token="t" * 43, nova_senha="12345")
    with pytest.raises(ValidationError):
        EsqueciSenhaIn(email="ab")
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `venv/Scripts/python -m pytest backend/tests/test_redefinicao_senha.py -o addopts="" -q`
Expected: erro de import (`redefinicao_senha_service` nao existe).

- [ ] **Step 3: Schemas**

Criar `backend/app/schemas/redefinicao_senha.py`:

```python
from pydantic import BaseModel, Field


class EsqueciSenhaIn(BaseModel):
    email: str = Field(min_length=3, max_length=150)


class RedefinirSenhaIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    nova_senha: str = Field(min_length=6)  # mesma regra de /auth/alterar-senha
```

- [ ] **Step 4: Serviço**

Criar `backend/app/services/redefinicao_senha_service.py`:

```python
"""Esqueci minha senha: token de uso unico enviado por e-mail (30 min), sem enumeracao de contas.

Spec: docs/superpowers/specs/2026-10-06-email-resend-redefinicao-mfa-design.md, secao 2.
"""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import AppException
from app.core.security import DUMMY_PASSWORD_HASH, hash_password, verify_password
from app.models.redefinicao_senha import RedefinicaoSenha
from app.models.usuario import Usuario
from app.services.audit_service import registrar_acao
from app.services.email_service import enviar
from app.services.email_templates import assunto, renderizar

TOKEN_VALIDADE_MINUTOS = 30
MAX_PEDIDOS_POR_HORA = 3
MENSAGEM_GENERICA = "Se o e-mail estiver cadastrado, enviamos as instrucoes."


class TokenInvalido(AppException):
    def __init__(self):
        super().__init__(code="TOKEN_INVALIDO", message="Link invalido, expirado ou ja usado", status_code=410)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def montar_link(token: str) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/redefinir-senha?token={token}"


class RedefinicaoSenhaService:
    def __init__(self, db: Session):
        self.db = db

    def solicitar(self, email: str, ip: str | None = None) -> None:
        """Sempre silencioso: quem chama responde 202 com MENSAGEM_GENERICA."""
        email = (email or "").strip().lower()
        user = self.db.query(Usuario).filter(Usuario.email == email).first()
        if user is None or not user.ativo:
            verify_password("x", DUMMY_PASSWORD_HASH)  # equaliza o tempo (anti-enumeracao)
            return
        agora = datetime.now(timezone.utc)
        pedidos_na_hora = (
            self.db.query(RedefinicaoSenha)
            .filter(
                RedefinicaoSenha.usuario_id == user.id,
                RedefinicaoSenha.criado_em >= agora - timedelta(hours=1),
            )
            .count()
        )
        if pedidos_na_hora >= MAX_PEDIDOS_POR_HORA:
            return
        # Pedir de novo invalida o anterior: so o ultimo link vale.
        (
            self.db.query(RedefinicaoSenha)
            .filter(RedefinicaoSenha.usuario_id == user.id, RedefinicaoSenha.usado_em.is_(None))
            .update({"usado_em": agora}, synchronize_session=False)
        )
        token = secrets.token_urlsafe(32)
        self.db.add(RedefinicaoSenha(
            usuario_id=user.id,
            token_hash=hash_token(token),
            expira_em=agora + timedelta(minutes=TOKEN_VALIDADE_MINUTOS),
            ip=ip,
            criado_em=agora,
        ))
        self.db.commit()
        html, texto = renderizar("redefinir_senha", nome=user.nome, link=montar_link(token))
        enviar(user.email, assunto("redefinir_senha"), html, texto)  # falha fica no log; a resposta nao muda

    def _pendente(self, token: str) -> tuple[RedefinicaoSenha, Usuario]:
        token = (token or "").strip()
        if not token:
            raise TokenInvalido()
        agora = datetime.now(timezone.utc)
        reg = (
            self.db.query(RedefinicaoSenha)
            .filter(
                RedefinicaoSenha.token_hash == hash_token(token),
                RedefinicaoSenha.usado_em.is_(None),
                RedefinicaoSenha.expira_em > agora,
            )
            .first()
        )
        if reg is None:
            raise TokenInvalido()
        user = self.db.get(Usuario, reg.usuario_id)
        if user is None or not user.ativo:
            raise TokenInvalido()
        return reg, user

    def validar(self, token: str) -> Usuario:
        return self._pendente(token)[1]

    def redefinir(self, token: str, nova_senha: str, request=None) -> None:
        reg, user = self._pendente(token)
        user.senha_hash = hash_password(nova_senha)
        reg.usado_em = datetime.now(timezone.utc)
        self.db.add(user)
        self.db.add(reg)
        self.db.commit()
        registrar_acao(
            self.db, categoria="acao", acao="senha_redefinida_por_email",
            ator=user, alvo=user, request=request,
        )
```

- [ ] **Step 5: Rotas em `routers/auth.py`**

Acrescentar aos imports de `backend/app/api/v1/routers/auth.py`:

```python
from app.schemas.redefinicao_senha import EsqueciSenhaIn, RedefinirSenhaIn
from app.services.email_service import mascarar_email
from app.services.redefinicao_senha_service import MENSAGEM_GENERICA, RedefinicaoSenhaService
```
e trocar `from fastapi import APIRouter, Body, Depends, Request` por `from fastapi import APIRouter, Body, Depends, Query, Request`.

Ao final do arquivo:

```python


# ---------- Esqueci minha senha (publico) ----------
# Spec: docs/superpowers/specs/2026-10-06-email-resend-redefinicao-mfa-design.md, secao 2.


@router.post("/esqueci-senha", status_code=202)
@limiter.limit("3/minute")
def esqueci_senha(request: Request, payload: EsqueciSenhaIn, db: Session = Depends(get_db)):
    """Sempre 202 com a mesma mensagem: nao revela se o e-mail existe."""
    ip, _ = origem_do_request(request)
    RedefinicaoSenhaService(db).solicitar(payload.email, ip=ip)
    return {"message": MENSAGEM_GENERICA}


@router.get("/redefinir-senha/validar")
def validar_redefinicao(token: str = Query(..., max_length=200), db: Session = Depends(get_db)):
    user = RedefinicaoSenhaService(db).validar(token)
    return {"valido": True, "email_mascarado": mascarar_email(user.email)}


@router.post("/redefinir-senha")
@limiter.limit("5/minute")
def redefinir_senha(request: Request, payload: RedefinirSenhaIn, db: Session = Depends(get_db)):
    RedefinicaoSenhaService(db).redefinir(payload.token, payload.nova_senha, request=request)
    return {"message": "Senha redefinida. Faca login."}
```

- [ ] **Step 6: Rodar os testes**

Run: `venv/Scripts/python -m pytest backend/tests/test_redefinicao_senha.py -o addopts="" -q` → `17 passed`.
Run: `venv/Scripts/python -m pytest backend/tests -o addopts="" -q` → 0 falhas (os testes de auth existentes continuam verdes).

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/redefinicao_senha_service.py backend/app/schemas/redefinicao_senha.py backend/app/api/v1/routers/auth.py backend/tests/test_redefinicao_senha.py
git commit -m "feat(email): esqueci minha senha - token de uso unico por e-mail, validar e redefinir (202/410, anti-enumeracao)"
```

### Task 4: Frontend — `LoginShell`, páginas `/esqueci-senha` e `/redefinir-senha`, link na `LoginPage`

**Files:**
- Create: `frontend-observatorio/src/pages/login/loginEstilos.js`
- Create: `frontend-observatorio/src/pages/login/LoginShell.jsx`
- Create: `frontend-observatorio/src/pages/login/EsqueciSenhaPage.jsx`, `EsqueciSenhaPage.test.jsx`
- Create: `frontend-observatorio/src/pages/login/RedefinirSenhaPage.jsx`, `RedefinirSenhaPage.test.jsx`
- Modify: `frontend-observatorio/src/pages/login/LoginPage.jsx` (usa `LoginShell`; link "Esqueci minha senha"), `LoginPage.test.jsx` (+1 teste)
- Modify: `frontend-observatorio/src/app/router/AppRouter.jsx` (2 rotas públicas)

**Interfaces:**
- Consumes: `POST /auth/esqueci-senha {email}` → 202 `{message}`; `GET /auth/redefinir-senha/validar?token=` → 200 `{valido, email_mascarado}` | 410; `POST /auth/redefinir-senha {token, nova_senha}` → 200 `{message}` | 410 | 422 (Task 3). Todas devolvem dict cru (sem `SuccessResponse`): ler `r.data.X`.
- Produces: `LoginShell({ titulo, subtitulo, children })` (default) e `ErroInline({ mensagem })` (named); `loginEstilos.{inputCls, labelCls, btnPrimarioCls, linkCls}`.

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `frontend-observatorio/src/pages/login/EsqueciSenhaPage.test.jsx`:

```jsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import EsqueciSenhaPage from "./EsqueciSenhaPage";
import api from "../../services/api";

vi.mock("../../services/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("framer-motion", () => ({ motion: new Proxy({}, { get: () => ({ children, ...p }) => <div {...Object.fromEntries(Object.entries(p).filter(([k]) => !["initial","animate","transition","exit","whileHover","whileTap"].includes(k)))}>{children}</div> }) }));
vi.mock("../../assets/bg.jpeg", () => ({ default: "" }));
vi.mock("../../assets/nid_fundo_transparente.png", () => ({ default: "" }));
vi.mock("../../assets/logo_uaizi.png", () => ({ default: "" }));

function montar() {
  return render(<MemoryRouter><EsqueciSenhaPage /></MemoryRouter>);
}

beforeEach(() => vi.clearAllMocks());

describe("EsqueciSenhaPage", () => {
  it("envia o e-mail e mostra a mensagem generica", async () => {
    api.post.mockResolvedValueOnce({ data: { message: "ok" } });
    montar();
    expect(screen.getByRole("button", { name: "Enviar instruções" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ana@x.gov.br" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar instruções" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/Se o e-mail estiver cadastrado/);
    expect(api.post).toHaveBeenCalledWith("/auth/esqueci-senha", { email: "ana@x.gov.br" });
    expect(screen.getByRole("link", { name: "Voltar ao login" })).toHaveAttribute("href", "/login");
    expect(screen.queryByLabelText("Email")).toBeNull();
  });

  it("erro de rede mostra alerta e mantem o formulario", async () => {
    api.post.mockRejectedValueOnce(new Error("Network Error"));
    montar();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ana@x.gov.br" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar instruções" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Não foi possível enviar agora/);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("429 mostra aviso de muitas tentativas", async () => {
    api.post.mockRejectedValueOnce({ response: { status: 429, data: {} } });
    montar();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ana@x.gov.br" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar instruções" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Muitas tentativas/);
    await waitFor(() => expect(screen.getByRole("button", { name: "Enviar instruções" })).not.toBeDisabled());
  });
});
```

Criar `frontend-observatorio/src/pages/login/RedefinirSenhaPage.test.jsx`:

```jsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RedefinirSenhaPage from "./RedefinirSenhaPage";
import api from "../../services/api";

vi.mock("../../services/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("framer-motion", () => ({ motion: new Proxy({}, { get: () => ({ children, ...p }) => <div {...Object.fromEntries(Object.entries(p).filter(([k]) => !["initial","animate","transition","exit","whileHover","whileTap"].includes(k)))}>{children}</div> }) }));
vi.mock("../../assets/bg.jpeg", () => ({ default: "" }));
vi.mock("../../assets/nid_fundo_transparente.png", () => ({ default: "" }));
vi.mock("../../assets/logo_uaizi.png", () => ({ default: "" }));

const RESP_410 = { response: { status: 410, data: { error: { code: "TOKEN_INVALIDO", message: "Link invalido" } } } };

function montar(url = "/redefinir-senha?token=tok-abc") {
  return render(<MemoryRouter initialEntries={[url]}><RedefinirSenhaPage /></MemoryRouter>);
}

beforeEach(() => vi.clearAllMocks());

describe("RedefinirSenhaPage", () => {
  it("410 na validacao mostra link expirado e oferece pedir outro", async () => {
    api.get.mockRejectedValueOnce(RESP_410);
    montar();
    expect(await screen.findByText(/Este link expirou ou já foi usado/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pedir outro link" })).toHaveAttribute("href", "/esqueci-senha");
    expect(api.get).toHaveBeenCalledWith("/auth/redefinir-senha/validar", { params: { token: "tok-abc" } });
  });

  it("sem token na URL mostra invalido sem chamar a API", async () => {
    montar("/redefinir-senha");
    expect(await screen.findByText(/Este link expirou ou já foi usado/)).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("200 mostra o formulario com o e-mail mascarado; senhas diferentes bloqueiam sem chamar a API", async () => {
    api.get.mockResolvedValueOnce({ data: { valido: true, email_mascarado: "a***@x.gov.br" } });
    montar();
    expect(await screen.findByText(/a\*\*\*@x\.gov\.br/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "novaSenha9" } });
    fireEvent.change(screen.getByLabelText("Confirmar nova senha"), { target: { value: "outra" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar nova senha" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/As senhas não coincidem/);
    expect(api.post).not.toHaveBeenCalled();
  });

  it("senha curta bloqueia", async () => {
    api.get.mockResolvedValueOnce({ data: { valido: true, email_mascarado: "a***@x.gov.br" } });
    montar();
    await screen.findByLabelText("Nova senha");
    fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "12345" } });
    fireEvent.change(screen.getByLabelText("Confirmar nova senha"), { target: { value: "12345" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar nova senha" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/pelo menos 6 caracteres/);
    expect(api.post).not.toHaveBeenCalled();
  });

  it("sucesso mostra 'Ir para o login'", async () => {
    api.get.mockResolvedValueOnce({ data: { valido: true, email_mascarado: "a***@x.gov.br" } });
    api.post.mockResolvedValueOnce({ data: { message: "Senha redefinida. Faca login." } });
    montar();
    await screen.findByLabelText("Nova senha");
    fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "novaSenha9" } });
    fireEvent.change(screen.getByLabelText("Confirmar nova senha"), { target: { value: "novaSenha9" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar nova senha" }));
    expect(await screen.findByRole("link", { name: "Ir para o login" })).toHaveAttribute("href", "/login");
    expect(api.post).toHaveBeenCalledWith("/auth/redefinir-senha", { token: "tok-abc", nova_senha: "novaSenha9" });
  });

  it("410 ao salvar vira estado expirado", async () => {
    api.get.mockResolvedValueOnce({ data: { valido: true, email_mascarado: "a***@x.gov.br" } });
    api.post.mockRejectedValueOnce(RESP_410);
    montar();
    await screen.findByLabelText("Nova senha");
    fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "novaSenha9" } });
    fireEvent.change(screen.getByLabelText("Confirmar nova senha"), { target: { value: "novaSenha9" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar nova senha" }));
    expect(await screen.findByText(/Este link expirou ou já foi usado/)).toBeInTheDocument();
  });

  it("erro de rede na validacao oferece tentar de novo", async () => {
    api.get.mockRejectedValueOnce(new Error("Network Error"));
    api.get.mockResolvedValueOnce({ data: { valido: true, email_mascarado: "a***@x.gov.br" } });
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Tentar de novo" }));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(await screen.findByLabelText("Nova senha")).toBeInTheDocument();
  });
});
```

Em `frontend-observatorio/src/pages/login/LoginPage.test.jsx`, dentro do `describe` existente, acrescentar:

```jsx
  it("etapa da senha mostra o link Esqueci minha senha", () => {
    montar();
    expect(screen.getByRole("link", { name: "Esqueci minha senha" })).toHaveAttribute("href", "/esqueci-senha");
  });
```

- [ ] **Step 2: Rodar para ver falhar**

Run (em `frontend-observatorio/`): `npx vitest run src/pages/login`
Expected: os dois arquivos novos falham ao importar as páginas; o teste novo da LoginPage falha (link ausente).

- [ ] **Step 3: `loginEstilos.js`**

Criar `frontend-observatorio/src/pages/login/loginEstilos.js` (módulo sem componentes, para não ferir `react-refresh/only-export-components`):

```js
// Classes compartilhadas pelas telas de autenticação (login, esqueci/redefinir senha).
export const labelCls = "text-xs font-semibold text-slate-500 uppercase tracking-wider";
export const inputCls =
  "w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow";
export const btnPrimarioCls =
  "w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl text-sm transition-all duration-200 shadow-lg shadow-blue-500/20 focus:outline-none focus:ring-2 focus:ring-blue-400/50 cursor-pointer mt-2";
export const linkCls = "text-blue-600 hover:text-blue-700 cursor-pointer";
```

- [ ] **Step 4: `LoginShell.jsx`**

Criar `frontend-observatorio/src/pages/login/LoginShell.jsx` — é o chrome atual da `LoginPage` (fundo, "Voltar", logo NID, card com cabeçalho, marca UAIZI) com o conteúdo do card vindo por `children`:

```jsx
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeftIcon, ExclamationCircleIcon } from "@heroicons/react/24/outline";
import bg from "../../assets/bg.jpeg";
import nidLogo from "../../assets/nid_fundo_transparente.png";
import logo from "../../assets/logo_uaizi.png";

// Caixa de erro padrão das telas de autenticação. Não renderiza nada sem mensagem.
export function ErroInline({ mensagem }) {
  if (!mensagem) return null;
  return (
    <div role="alert" aria-live="polite" className="flex items-start gap-2.5 bg-red-50 border border-red-100 text-red-700 text-xs px-4 py-3 rounded-xl">
      <ExclamationCircleIcon className="w-4 h-4 shrink-0 mt-0.5 text-red-500" aria-hidden="true" />
      {mensagem}
    </div>
  );
}

// Fundo, logo, card e rodapé compartilhados por /login, /esqueci-senha e /redefinir-senha.
export default function LoginShell({ titulo, subtitulo, children }) {
  return (
    <div className="min-h-screen relative flex flex-col items-center justify-center px-4 py-8">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${bg})` }} aria-hidden="true" />
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950/90 via-slate-900/85 to-slate-950/95" aria-hidden="true" />
      <div className="absolute inset-0 bg-gradient-to-t from-blue-950/30 via-transparent to-transparent" aria-hidden="true" />

      <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, ease: "easeOut" }} className="absolute top-6 left-6">
        <Link to="/" className="inline-flex items-center gap-2 text-white/50 hover:text-white/80 text-xs font-medium transition-colors group focus:outline-none focus:text-white/80" aria-label="Voltar para página inicial">
          <ArrowLeftIcon className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" aria-hidden="true" />
          Voltar
        </Link>
      </motion.div>

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-5">
        <motion.div initial={{ opacity: 0, scale: 0.85, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}>
          <img src={nidLogo} alt="NID — Núcleo de Inteligência de Dados" className="h-28 object-contain mx-auto"
            style={{ filter: "drop-shadow(0 0 24px rgba(59,130,246,0.5)) drop-shadow(0 0 48px rgba(99,102,241,0.25))" }} />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.55, ease: "easeOut" }} className="w-full">
          <div className="w-full bg-white/[0.97] backdrop-blur-md rounded-2xl shadow-2xl shadow-black/40 border border-white/20 p-8">
            <div className="mb-7 text-center">
              <h1 className="text-lg font-bold text-slate-800 tracking-tight">{titulo}</h1>
              {subtitulo && <p className="text-slate-400 text-xs mt-1">{subtitulo}</p>}
            </div>
            {children}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35, duration: 0.5, ease: "easeOut" }} className="flex flex-col items-center gap-2">
          <img src={logo} alt="UAIZI" className="h-10 object-contain opacity-70" />
          <p className="text-white/25 text-[10px] tracking-widest uppercase">Observatório Econômico Municipal</p>
        </motion.div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: `LoginPage.jsx` usa o shell e ganha o link**

Em `frontend-observatorio/src/pages/login/LoginPage.jsx`:
1. Trocar os imports: remover `motion`, `ArrowLeftIcon`, `ExclamationCircleIcon`, `bg`, `nidLogo`, `logo` (ficam no shell); manter `Link`; acrescentar `import LoginShell, { ErroInline } from "./LoginShell";` e `import { btnPrimarioCls, inputCls, labelCls, linkCls } from "./loginEstilos";`.
2. Substituir todo o `return (...)` por:

```jsx
  return (
    <LoginShell
      titulo={etapa === "codigo" ? "Verificação em duas etapas" : "Acesse sua conta"}
      subtitulo={etapa === "codigo" ? "Código do app autenticador" : "Insira suas credenciais para continuar"}
    >
      {etapa === "codigo" ? (
        <form onSubmit={handleVerificar} className="space-y-4" noValidate>
          <p className="text-xs text-slate-500">
            Sua conta tem verificação em duas etapas. Digite o código do app autenticador.
          </p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="login-codigo" className={labelCls}>
              {usarRecuperacao ? "Código de recuperação" : "Código de verificação"}
            </label>
            <input
              id="login-codigo"
              type="text"
              value={codigo}
              onChange={(e) => { setCodigo(e.target.value); if (error) setError(""); }}
              required
              autoFocus
              inputMode={usarRecuperacao ? "text" : "numeric"}
              autoComplete="one-time-code"
              placeholder={usarRecuperacao ? "XXXX-XXXX" : "000000"}
              maxLength={usarRecuperacao ? 9 : 7}
              className={`${inputCls} tracking-[0.3em] text-center`}
              aria-required="true"
            />
          </div>
          <ErroInline mensagem={error} />
          <button type="submit" disabled={loading || codigo.trim().length < 6} aria-busy={loading} className={btnPrimarioCls}>
            {loading ? "Verificando..." : "Verificar"}
          </button>
          <div className="flex items-center justify-between text-xs">
            <button type="button" onClick={() => voltarParaSenha("")} className="text-slate-500 hover:text-slate-700 cursor-pointer">
              Voltar
            </button>
            <button type="button" onClick={() => { setUsarRecuperacao((v) => !v); setCodigo(""); setError(""); }} className={linkCls}>
              {usarRecuperacao ? "Usar código do app" : "Usar código de recuperação"}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="login-email" className={labelCls}>Email</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (error) setError(""); }}
              required
              autoComplete="email"
              autoFocus
              placeholder="seu@email.com"
              className={inputCls}
              aria-required="true"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="login-senha" className={labelCls}>Senha</label>
            <div className="relative">
              <input
                id="login-senha"
                type={showPassword ? "text" : "password"}
                value={senha}
                onChange={(e) => { setSenha(e.target.value); if (error) setError(""); }}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className={`${inputCls} pr-11 [&::-ms-reveal]:hidden [&::-ms-clear]:hidden`}
                aria-required="true"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer focus:outline-none focus:text-slate-600 p-1"
              >
                {showPassword
                  ? <EyeSlashIcon className="w-4 h-4" aria-hidden="true" />
                  : <EyeIcon className="w-4 h-4" aria-hidden="true" />}
              </button>
            </div>
          </div>

          <ErroInline mensagem={error} />

          <button type="submit" disabled={loading} className={btnPrimarioCls} aria-busy={loading}>
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Entrando...</span>
              </>
            ) : (
              "Entrar"
            )}
          </button>

          <div className="text-center text-xs">
            <Link to="/esqueci-senha" className={linkCls}>Esqueci minha senha</Link>
          </div>
        </form>
      )}
    </LoginShell>
  );
```

Os imports de `EyeIcon`/`EyeSlashIcon` continuam; `useEffect`, `useState`, `useNavigate`, `useAuth`, `mensagemDoErro` e toda a lógica acima do `return` ficam como estão.

- [ ] **Step 6: `EsqueciSenhaPage.jsx`**

```jsx
import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../../services/api";
import LoginShell, { ErroInline } from "./LoginShell";
import { btnPrimarioCls, inputCls, labelCls, linkCls } from "./loginEstilos";

// "Esqueci minha senha": sempre mostra a mesma mensagem de sucesso (o backend responde 202
// exista ou não a conta), para não revelar quais e-mails estão cadastrados.
export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [enviado, setEnviado] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");
    setLoading(true);
    try {
      await api.post("/auth/esqueci-senha", { email: email.trim() });
      setEnviado(true);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 429) setErro("Muitas tentativas. Aguarde um minuto e tente de novo.");
      else if (status === 422) setErro("Informe um e-mail válido.");
      else setErro("Não foi possível enviar agora. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <LoginShell titulo="Esqueci minha senha" subtitulo={enviado ? "Confira sua caixa de entrada" : "Informe o e-mail da sua conta"}>
      {enviado ? (
        <div className="space-y-4 text-sm text-slate-600" role="status">
          <p>Se o e-mail estiver cadastrado, enviamos as instruções para redefinir a senha. Confira também a caixa de spam.</p>
          <p className="text-xs text-slate-400">O link vale por 30 minutos.</p>
          <Link to="/login" className={`${linkCls} text-xs`}>Voltar ao login</Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="esqueci-email" className={labelCls}>Email</label>
            <input
              id="esqueci-email"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (erro) setErro(""); }}
              required
              autoComplete="email"
              autoFocus
              placeholder="seu@email.com"
              className={inputCls}
              aria-required="true"
            />
          </div>
          <ErroInline mensagem={erro} />
          <button type="submit" disabled={loading || !email.trim()} aria-busy={loading} className={btnPrimarioCls}>
            {loading ? "Enviando..." : "Enviar instruções"}
          </button>
          <div className="text-center text-xs">
            <Link to="/login" className={linkCls}>Voltar ao login</Link>
          </div>
        </form>
      )}
    </LoginShell>
  );
}
```

- [ ] **Step 7: `RedefinirSenhaPage.jsx`**

```jsx
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../../services/api";
import LoginShell, { ErroInline } from "./LoginShell";
import { btnPrimarioCls, inputCls, labelCls, linkCls } from "./loginEstilos";

function mensagemDoErro(err, padrao) {
  return err?.response?.data?.error?.message || err?.response?.data?.detail || padrao;
}

// Lê ?token=, valida no backend e troca a senha. Estados: validando | invalido | erro | form | sucesso.
export default function RedefinirSenhaPage() {
  const [params] = useSearchParams();
  const token = (params.get("token") || "").trim();
  const [estado, setEstado] = useState(token ? "validando" : "invalido");
  const [tentativa, setTentativa] = useState(0);
  const [emailMascarado, setEmailMascarado] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return undefined;
    let vivo = true;
    api.get("/auth/redefinir-senha/validar", { params: { token } })
      .then((r) => {
        if (!vivo) return;
        setEmailMascarado(r.data?.email_mascarado || "");
        setEstado("form");
      })
      .catch((err) => {
        if (!vivo) return;
        const status = err?.response?.status;
        setEstado(status === 410 || status === 422 ? "invalido" : "erro");
      });
    return () => { vivo = false; };
  }, [token, tentativa]);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");
    if (senha.length < 6) { setErro("A senha precisa ter pelo menos 6 caracteres."); return; }
    if (senha !== confirmar) { setErro("As senhas não coincidem."); return; }
    setLoading(true);
    try {
      await api.post("/auth/redefinir-senha", { token, nova_senha: senha });
      setEstado("sucesso");
    } catch (err) {
      const status = err?.response?.status;
      if (status === 410) setEstado("invalido");
      else if (status === 429) setErro("Muitas tentativas. Aguarde um minuto e tente de novo.");
      else setErro(mensagemDoErro(err, "Não foi possível redefinir a senha agora. Tente novamente."));
    } finally {
      setLoading(false);
    }
  }

  const subtitulos = {
    validando: "Validando o link…",
    invalido: "Link inválido",
    erro: "Não foi possível validar o link",
    form: emailMascarado ? `Conta: ${emailMascarado}` : "Escolha a nova senha",
    sucesso: "Tudo certo",
  };

  return (
    <LoginShell titulo="Redefinir senha" subtitulo={subtitulos[estado]}>
      {estado === "validando" && <p className="text-sm text-slate-500" role="status">Validando o link…</p>}

      {estado === "invalido" && (
        <div className="space-y-4 text-sm text-slate-600">
          <p>Este link expirou ou já foi usado. Peça um novo link para redefinir a senha.</p>
          <div className="flex items-center justify-between text-xs">
            <Link to="/login" className="text-slate-500 hover:text-slate-700">Voltar ao login</Link>
            <Link to="/esqueci-senha" className={linkCls}>Pedir outro link</Link>
          </div>
        </div>
      )}

      {estado === "erro" && (
        <div className="space-y-4 text-sm text-slate-600">
          <p>Não foi possível validar o link agora. Verifique sua conexão e tente de novo.</p>
          <button type="button" onClick={() => { setEstado("validando"); setTentativa((n) => n + 1); }} className={btnPrimarioCls}>Tentar de novo</button>
        </div>
      )}

      {estado === "form" && (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="redefinir-senha" className={labelCls}>Nova senha</label>
            <input id="redefinir-senha" type="password" value={senha} onChange={(e) => { setSenha(e.target.value); if (erro) setErro(""); }}
              required minLength={6} autoComplete="new-password" autoFocus placeholder="mínimo 6 caracteres" className={inputCls} aria-required="true" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="redefinir-confirmar" className={labelCls}>Confirmar nova senha</label>
            <input id="redefinir-confirmar" type="password" value={confirmar} onChange={(e) => { setConfirmar(e.target.value); if (erro) setErro(""); }}
              required minLength={6} autoComplete="new-password" placeholder="repita a senha" className={inputCls} aria-required="true" />
          </div>
          <ErroInline mensagem={erro} />
          <button type="submit" disabled={loading || !senha || !confirmar} aria-busy={loading} className={btnPrimarioCls}>
            {loading ? "Salvando..." : "Salvar nova senha"}
          </button>
        </form>
      )}

      {estado === "sucesso" && (
        <div className="space-y-4 text-sm text-slate-600" role="status">
          <p>Senha redefinida. Use a nova senha para entrar.</p>
          <Link to="/login" className={`${btnPrimarioCls} no-underline`}>Ir para o login</Link>
        </div>
      )}
    </LoginShell>
  );
}
```

- [ ] **Step 8: Rotas**

Em `frontend-observatorio/src/app/router/AppRouter.jsx`, após `import LoginPage from "../../pages/login/LoginPage";`:

```jsx
import EsqueciSenhaPage from "../../pages/login/EsqueciSenhaPage";
import RedefinirSenhaPage from "../../pages/login/RedefinirSenhaPage";
```

e após `<Route path="/login" element={<LoginPage />} />`:

```jsx
        <Route path="/esqueci-senha" element={<EsqueciSenhaPage />} />
        <Route path="/redefinir-senha" element={<RedefinirSenhaPage />} />
```

- [ ] **Step 9: Rodar testes, lint e build**

Run (em `frontend-observatorio/`): `npx vitest run src/pages/login` → `EsqueciSenhaPage` 3 passed, `RedefinirSenhaPage` 7 passed, `LoginPage` 8 passed.
Run: `npx vitest run` → 0 falhas.
Run: `npx eslint src/pages/login src/app/router/AppRouter.jsx` → nenhum erro novo (comparar com `git show HEAD:frontend-observatorio/src/pages/login/LoginPage.jsx | npx eslint --stdin --stdin-filename src/pages/login/LoginPage.jsx`; o erro `'motion' is defined but never used` da LoginPage deve DESAPARECER, porque o import saiu; `LoginShell.jsx` herda esse falso positivo do config — aceito, é o mesmo de `MfaModal`/`AlterarSenhaModal`).
Run: `npx vite build` → sucesso.

- [ ] **Step 10: Commit**

```bash
git add frontend-observatorio/src/pages/login frontend-observatorio/src/app/router/AppRouter.jsx
git commit -m "feat(email): paginas esqueci minha senha e redefinir senha, LoginShell compartilhado e link no login"
```

### Task 5: MFA por e-mail no `MfaService` — migração 0044, modelo, código HMAC, configurar/ativar/reenviar

**Files:**
- Create: `backend/alembic/versions/0044_usuario_mfa_email.py`
- Modify: `backend/app/models/usuario_mfa.py`
- Modify: `backend/app/services/mfa_service.py`
- Test: `backend/tests/test_mfa_email.py` (criado aqui; a Task 6 acrescenta)

**Interfaces:**
- Consumes: `email_service.enviar/mascarar_email`, `email_templates.renderizar/assunto` (Task 1); `datas.garantir_utc` (Task 2); `UsuarioMfa`, `MfaService`, `cifrar/decifrar/exigir_chave` (frente MFA).
- Produces: colunas `UsuarioMfa.metodo` ("totp"|"email"), `codigo_hash`, `codigo_expira_em`, `codigo_enviado_em`, `codigo_tentativas`, `codigo_reenvios`; `segredo_cifrado` nullable. `MfaService.configurar(user, metodo="totp") -> dict` (totp: `{metodo, otpauth_url, segredo, qr_svg}`; email: `{metodo, enviado_para}`); `MfaService.status(user)` inclui `metodo`; `MfaService.enviar_codigo(mfa, user, finalidade) -> bool`; `MfaService.reenviar_codigo(mfa, user, finalidade) -> dict{enviado_para}` (429 `AGUARDE`/`LIMITE_REENVIO`, 502 `EMAIL_NAO_ENVIADO`); `MfaService.codigo_valido` despacha por `metodo`; constantes `FINALIDADE_LOGIN`, `FINALIDADE_ATIVAR`, `FINALIDADE_DESATIVAR`, `METODOS`; helpers `gerar_codigo_email()`, `hash_codigo_email(codigo)`.

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `backend/tests/test_mfa_email.py`:

```python
"""MFA por e-mail: codigo HMAC de 6 digitos, 10 min, 5 tentativas, 3 reenvios (Task 5);
login em duas etapas com metodo email, reenviar e enviar-codigo (Task 6)."""
import re
from datetime import datetime, timedelta, timezone

import pytest
from cryptography.fernet import Fernet
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

import app.core.mfa_crypto as mfa_crypto
import app.models  # noqa: F401
import app.services.auth_service as auth_mod
import app.services.mfa_service as mfa_mod
from app.core.exceptions import AppException, UnauthorizedException
from app.core.security import hash_password
from app.db.base import Base
from app.models.acao_audit import AcaoAudit
from app.models.login_audit import LoginAudit
from app.models.municipio import Municipio
from app.models.role import Role
from app.models.usuario import Usuario
from app.models.usuario_mfa import UsuarioMfa
from app.services.mfa_service import (
    FINALIDADE_ATIVAR,
    FINALIDADE_DESATIVAR,
    MfaService,
    hash_codigo_email,
)


class _FakeClient:
    host = "10.0.0.1"


class _FakeRequest:
    headers = {"user-agent": "pytest"}
    client = _FakeClient()


@pytest.fixture(autouse=True)
def ambiente(monkeypatch):
    monkeypatch.setattr(mfa_crypto.settings, "MFA_ENCRYPTION_KEY", Fernet.generate_key().decode())
    from app.core.rate_limit import limiter
    monkeypatch.setattr(limiter, "enabled", False)
    auth_mod._FALHAS_MFA.clear()


class _Espiao:
    """Substitui mfa_service.enviar. `falhar = True` simula Resend fora (devolve None)."""

    def __init__(self):
        self.lista = []
        self.falhar = False

    def __call__(self, para, assunto, html, texto):
        self.lista.append({"para": para, "assunto": assunto, "html": html, "texto": texto})
        return None if self.falhar else "id-fake"

    def __getitem__(self, i):
        return self.lista[i]

    @property
    def total(self):
        return len(self.lista)

    @property
    def ultimo_codigo(self):
        return re.search(r"\b(\d{6})\b", self.lista[-1]["texto"]).group(1)


@pytest.fixture()
def enviados(monkeypatch):
    espiao = _Espiao()
    monkeypatch.setattr(mfa_mod, "enviar", espiao)
    return espiao


@pytest.fixture()
def db():
    engine = create_engine("sqlite://")

    @event.listens_for(engine, "connect")
    def _fk_on(dbapi_conn, _record):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine, tables=[
        Municipio.__table__, Role.__table__, Usuario.__table__, UsuarioMfa.__table__,
        LoginAudit.__table__, AcaoAudit.__table__,
    ])
    s = sessionmaker(bind=engine)()
    s.add(Role(nome="ADMIN_GLOBAL", builtin=True, permissoes={}))
    s.commit()
    yield s
    s.close()


def _admin(db, email="admin@x.com"):
    role = db.query(Role).filter(Role.nome == "ADMIN_GLOBAL").one()
    u = Usuario(nome="Admin", email=email, senha_hash=hash_password("senha123"), role_id=role.id)
    db.add(u)
    db.commit()
    return u


def _ativar_email(db, u, enviados):
    svc = MfaService(db)
    svc.configurar(u, metodo="email")
    codigos = svc.ativar(u, enviados.ultimo_codigo, request=_FakeRequest())
    db.refresh(u)
    return svc, codigos


def _agora():
    return datetime.now(timezone.utc)


def _voltar_envio(db, mfa, segundos=61):
    mfa.codigo_enviado_em = _agora() - timedelta(seconds=segundos)
    db.add(mfa)
    db.commit()


# ---------- Task 5: modelo e servico ----------

def test_modelo_tem_colunas_email_e_segredo_nulo():
    cols = {c.name: c for c in UsuarioMfa.__table__.columns}
    for nome in ("metodo", "codigo_hash", "codigo_expira_em", "codigo_enviado_em", "codigo_tentativas", "codigo_reenvios"):
        assert nome in cols, nome
    assert cols["segredo_cifrado"].nullable is True
    assert cols["metodo"].type.length == 10 and cols["metodo"].default.arg == "totp"
    assert cols["codigo_hash"].type.length == 64


def test_hash_codigo_email_e_hmac_deterministico():
    assert hash_codigo_email("012345") == hash_codigo_email("012345")
    assert hash_codigo_email("012345") != hash_codigo_email("012346")
    assert len(hash_codigo_email("012345")) == 64


def test_configurar_email_cria_pendente_envia_codigo_e_devolve_mascarado(db, enviados):
    u = _admin(db)
    out = MfaService(db).configurar(u, metodo="email")
    assert out == {"metodo": "email", "enviado_para": "a***@x.com"}
    db.refresh(u)
    mfa = u.mfa
    assert mfa.ativo is False and mfa.metodo == "email" and mfa.segredo_cifrado is None
    assert mfa.codigo_hash == hash_codigo_email(enviados.ultimo_codigo)
    assert mfa.codigo_tentativas == 0 and mfa.codigo_reenvios == 0
    assert mfa.codigo_enviado_em is not None and mfa.codigo_expira_em is not None
    assert enviados.total == 1 and enviados[0]["para"] == "admin@x.com"
    assert enviados[0]["assunto"] == "Seu codigo de verificacao - UAIZI NID"
    assert FINALIDADE_ATIVAR in enviados[0]["texto"]
    assert enviados.ultimo_codigo not in (mfa.codigo_hash or "")


def test_configurar_email_envio_falho_502_e_fica_pendente(db, enviados):
    u = _admin(db)
    enviados.falhar = True
    with pytest.raises(AppException) as exc:
        MfaService(db).configurar(u, metodo="email")
    assert exc.value.status_code == 502 and exc.value.code == "EMAIL_NAO_ENVIADO"
    db.refresh(u)
    assert u.mfa is not None and u.mfa.ativo is False and u.mfa.metodo == "email"


def test_configurar_metodo_invalido_422(db, enviados):
    u = _admin(db)
    with pytest.raises(AppException) as exc:
        MfaService(db).configurar(u, metodo="sms")
    assert exc.value.status_code == 422 and exc.value.code == "METODO_INVALIDO"


def test_configurar_totp_continua_igual_e_inclui_metodo(db, enviados):
    u = _admin(db)
    out = MfaService(db).configurar(u)
    assert out["metodo"] == "totp"
    assert out["otpauth_url"].startswith("otpauth://totp/") and out["segredo"] and "<svg" in out["qr_svg"]
    assert enviados.total == 0
    db.refresh(u)
    assert u.mfa.metodo == "totp" and u.mfa.segredo_cifrado


def test_configurar_email_depois_de_totp_pendente_troca_metodo(db, enviados):
    u = _admin(db)
    svc = MfaService(db)
    svc.configurar(u)
    svc.configurar(u, metodo="email")
    db.refresh(u)
    assert u.mfa.metodo == "email" and u.mfa.segredo_cifrado is None and u.mfa.ultimo_passo_usado is None


def test_ativar_email_com_codigo_certo_ativa_gera_codigos_e_audita(db, enviados):
    u = _admin(db)
    svc, codigos = _ativar_email(db, u, enviados)
    assert len(codigos) == 10 and all(re.fullmatch(r"[A-Z2-9]{4}-[A-Z2-9]{4}", c) for c in codigos)
    assert u.mfa.ativo is True and u.mfa.metodo == "email"
    assert u.mfa.codigo_hash is None and u.mfa.codigo_expira_em is None
    assert db.query(AcaoAudit).filter(AcaoAudit.acao == "mfa_ativado").count() == 1
    assert svc.status(u) == {"ativo": True, "ativado_em": u.mfa.ativado_em, "codigos_restantes": 10, "metodo": "email"}


def test_status_sem_mfa_ou_pendente_tem_metodo_none(db, enviados):
    u = _admin(db)
    svc = MfaService(db)
    assert svc.status(u) == {"ativo": False, "ativado_em": None, "codigos_restantes": 0, "metodo": None}
    svc.configurar(u, metodo="email")
    db.refresh(u)
    assert svc.status(u)["metodo"] is None


def test_ativar_email_codigo_errado_incrementa_e_5_invalida(db, enviados):
    u = _admin(db)
    svc = MfaService(db)
    svc.configurar(u, metodo="email")
    db.refresh(u)
    certo = enviados.ultimo_codigo
    errado = "000000" if certo != "000000" else "111111"
    for i in range(5):
        with pytest.raises(UnauthorizedException):
            svc.ativar(u, errado)
        db.refresh(u)
        assert u.mfa.codigo_tentativas == i + 1
    with pytest.raises(UnauthorizedException):
        svc.ativar(u, certo)  # codigo invalidado pelas 5 falhas
    assert u.mfa.ativo is False


def test_codigo_email_expirado_401(db, enviados):
    u = _admin(db)
    svc = MfaService(db)
    svc.configurar(u, metodo="email")
    db.refresh(u)
    u.mfa.codigo_expira_em = _agora() - timedelta(minutes=1)
    db.commit()
    with pytest.raises(UnauthorizedException):
        svc.ativar(u, enviados.ultimo_codigo)


def test_codigo_email_aceita_com_espacos(db, enviados):
    u = _admin(db)
    svc = MfaService(db)
    svc.configurar(u, metodo="email")
    db.refresh(u)
    c = enviados.ultimo_codigo
    assert len(svc.ativar(u, f"{c[:3]} {c[3:]}", request=_FakeRequest())) == 10


def test_reenviar_respeita_60s_invalida_anterior_e_limite_3(db, enviados):
    u = _admin(db)
    svc = MfaService(db)
    svc.configurar(u, metodo="email")
    db.refresh(u)
    mfa = u.mfa
    with pytest.raises(AppException) as exc:
        svc.reenviar_codigo(mfa, u, FINALIDADE_ATIVAR)
    assert exc.value.status_code == 429 and exc.value.code == "AGUARDE" and "Aguarde" in exc.value.message
    antigo = enviados.ultimo_codigo
    for n in range(1, 4):
        _voltar_envio(db, mfa)
        assert svc.reenviar_codigo(mfa, u, FINALIDADE_ATIVAR) == {"enviado_para": "a***@x.com"}
        db.refresh(u)
        assert mfa.codigo_reenvios == n
    assert enviados.total == 4
    assert not svc.codigo_valido(mfa, antigo)  # anterior morreu
    _voltar_envio(db, mfa)
    with pytest.raises(AppException) as exc:
        svc.reenviar_codigo(mfa, u, FINALIDADE_ATIVAR)
    assert exc.value.status_code == 429 and exc.value.code == "LIMITE_REENVIO"
    assert svc.codigo_valido(mfa, enviados.ultimo_codigo)  # o ultimo enviado ainda vale


def test_reenvios_zeram_quando_codigo_expirou(db, enviados):
    u = _admin(db)
    svc = MfaService(db)
    svc.configurar(u, metodo="email")
    db.refresh(u)
    u.mfa.codigo_reenvios = 3
    u.mfa.codigo_expira_em = _agora() - timedelta(minutes=1)
    _voltar_envio(db, u.mfa, segundos=700)
    assert svc.reenviar_codigo(u.mfa, u, FINALIDADE_ATIVAR)["enviado_para"] == "a***@x.com"
    assert u.mfa.codigo_reenvios == 1


def test_reenviar_envio_falho_502(db, enviados):
    u = _admin(db)
    svc = MfaService(db)
    svc.configurar(u, metodo="email")
    db.refresh(u)
    _voltar_envio(db, u.mfa)
    enviados.falhar = True
    with pytest.raises(AppException) as exc:
        svc.reenviar_codigo(u.mfa, u, FINALIDADE_ATIVAR)
    assert exc.value.status_code == 502


def test_codigo_recuperacao_vale_no_metodo_email(db, enviados):
    u = _admin(db)
    svc, codigos = _ativar_email(db, u, enviados)
    assert svc.codigo_valido(u.mfa, codigos[0]) is True
    assert svc.codigo_valido(u.mfa, codigos[0]) is False  # consumido


def test_desativar_email_com_codigo_enviado(db, enviados):
    u = _admin(db)
    svc, _ = _ativar_email(db, u, enviados)
    assert svc.enviar_codigo(u.mfa, u, FINALIDADE_DESATIVAR) is True
    assert FINALIDADE_DESATIVAR in enviados[-1]["texto"]
    svc.desativar(u, "senha123", enviados.ultimo_codigo, request=_FakeRequest())
    db.refresh(u)
    assert u.mfa is None
    assert db.query(AcaoAudit).filter(AcaoAudit.acao == "mfa_desativado").count() == 1
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `venv/Scripts/python -m pytest backend/tests/test_mfa_email.py -o addopts="" -q`
Expected: erro de import (`FINALIDADE_ATIVAR`, `hash_codigo_email` nao existem).

- [ ] **Step 3: Modelo**

Em `backend/app/models/usuario_mfa.py`:
1. Import: `from sqlalchemy import JSON, BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text, false, func`.
2. Trocar a linha de `segredo_cifrado` e acrescentar as colunas novas logo abaixo dela:

```python
    # Nulo quando metodo="email" (nao ha segredo TOTP).
    segredo_cifrado: Mapped[str | None] = mapped_column(Text, nullable=True)
    # "totp" (app autenticador) | "email" (codigo de 6 digitos por e-mail). Spec e-mail, secao 3.
    metodo: Mapped[str] = mapped_column(String(10), nullable=False, default="totp", server_default="totp")
    codigo_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)  # HMAC-SHA256(SECRET_KEY, codigo)
    codigo_expira_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    codigo_enviado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    codigo_tentativas: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    codigo_reenvios: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
```
3. Atualizar a docstring da classe: `"""Segundo fator do usuario (1:1): TOTP (segredo cifrado com Fernet) ou codigo por e-mail (hash HMAC, 10 min). Codigos de recuperacao como hashes bcrypt (consumidos ao usar)."""`.

- [ ] **Step 4: Migração 0044**

Criar `backend/alembic/versions/0044_usuario_mfa_email.py`:

```python
"""usuario_mfa: metodo email (codigo HMAC por e-mail) alem do TOTP

segredo_cifrado passa a aceitar NULL (metodo="email"); colunas do codigo por e-mail.
Spec 2026-10-06-email-resend-redefinicao-mfa, secao 3.

Revision ID: 0044_usuario_mfa_email
Revises: 0043_redefinicao_senha
Create Date: 2026-10-06
"""

import sqlalchemy as sa
from alembic import op


revision = "0044_usuario_mfa_email"
down_revision = "0043_redefinicao_senha"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column("usuario_mfa", "segredo_cifrado", existing_type=sa.Text(), nullable=True)
    op.add_column("usuario_mfa", sa.Column("metodo", sa.String(length=10), nullable=False, server_default="totp"))
    op.add_column("usuario_mfa", sa.Column("codigo_hash", sa.String(length=64), nullable=True))
    op.add_column("usuario_mfa", sa.Column("codigo_expira_em", sa.DateTime(timezone=True), nullable=True))
    op.add_column("usuario_mfa", sa.Column("codigo_enviado_em", sa.DateTime(timezone=True), nullable=True))
    op.add_column("usuario_mfa", sa.Column("codigo_tentativas", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("usuario_mfa", sa.Column("codigo_reenvios", sa.Integer(), nullable=False, server_default="0"))


def downgrade():
    # Cadastros por e-mail nao tem segredo TOTP: nao sobrevivem ao NOT NULL de volta.
    usuario_mfa = sa.table("usuario_mfa", sa.column("segredo_cifrado", sa.Text()))
    op.execute(usuario_mfa.delete().where(usuario_mfa.c.segredo_cifrado.is_(None)))
    op.drop_column("usuario_mfa", "codigo_reenvios")
    op.drop_column("usuario_mfa", "codigo_tentativas")
    op.drop_column("usuario_mfa", "codigo_enviado_em")
    op.drop_column("usuario_mfa", "codigo_expira_em")
    op.drop_column("usuario_mfa", "codigo_hash")
    op.drop_column("usuario_mfa", "metodo")
    op.alter_column("usuario_mfa", "segredo_cifrado", existing_type=sa.Text(), nullable=False)
```

Checar sintaxe: `venv/Scripts/python -c "import ast; ast.parse(open('backend/alembic/versions/0044_usuario_mfa_email.py').read())"`.

- [ ] **Step 5: `mfa_service.py`**

Em `backend/app/services/mfa_service.py`:

1. Imports — acrescentar `import hashlib`, `import hmac`, `from datetime import datetime, timedelta, timezone` (trocar a linha existente), `from app.core.config import settings`, `from app.core.datas import garantir_utc`, `from app.core.exceptions import AppException, ConflictException, UnauthorizedException` (trocar a existente), `from app.services.email_service import enviar, mascarar_email`, `from app.services.email_templates import assunto, renderizar`.

2. Constantes — após `_RE_RECUPERACAO`:

```python
METODOS = ("totp", "email")
CODIGO_EMAIL_VALIDADE_MINUTOS = 10
CODIGO_EMAIL_MAX_TENTATIVAS = 5
CODIGO_EMAIL_MAX_REENVIOS = 3
CODIGO_EMAIL_INTERVALO_SEGUNDOS = 60
FINALIDADE_LOGIN = "entrar na plataforma"
FINALIDADE_ATIVAR = "ativar a verificacao por e-mail"
FINALIDADE_DESATIVAR = "confirmar a desativacao da verificacao em duas etapas"


def gerar_codigo_email() -> str:
    return f"{secrets.randbelow(10**6):06d}"


def hash_codigo_email(codigo: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode("utf-8"), codigo.encode("utf-8"), hashlib.sha256).hexdigest()


def _erro_envio() -> AppException:
    return AppException(
        code="EMAIL_NAO_ENVIADO",
        message="Nao foi possivel enviar o codigo por e-mail; tente de novo",
        status_code=502,
    )
```

3. `status()` — devolver `metodo` (None sem MFA ativo):

```python
    def status(self, user: Usuario) -> dict:
        mfa = user.mfa
        if mfa is None or not mfa.ativo:
            return {"ativo": False, "ativado_em": None, "codigos_restantes": 0, "metodo": None}
        return {
            "ativo": True,
            "ativado_em": mfa.ativado_em,
            "codigos_restantes": len(mfa.codigos_recuperacao or []),
            "metodo": mfa.metodo,
        }
```

4. `configurar()` — substituir inteiro:

```python
    def configurar(self, user: Usuario, metodo: str = "totp") -> dict:
        if metodo not in METODOS:
            raise AppException(code="METODO_INVALIDO", message="Metodo de MFA invalido", status_code=422)
        if user.mfa is not None and user.mfa.ativo:
            raise ConflictException("MFA ja esta ativo; desative antes de reconfigurar.")
        if metodo == "totp":
            exigir_chave()
        segredo = pyotp.random_base32() if metodo == "totp" else None
        cifrado = cifrar(segredo) if segredo else None
        if user.mfa is None:
            user.mfa = UsuarioMfa(segredo_cifrado=cifrado, ativo=False, codigos_recuperacao=[], metodo=metodo)
        else:
            mfa = user.mfa
            mfa.segredo_cifrado = cifrado
            mfa.ativo = False
            mfa.ultimo_passo_usado = None
            mfa.codigos_recuperacao = []
            mfa.metodo = metodo
            mfa.codigo_hash = None
            mfa.codigo_expira_em = None
            mfa.codigo_enviado_em = None
            mfa.codigo_tentativas = 0
            mfa.codigo_reenvios = 0
        self.db.add(user)
        self.db.commit()
        if metodo == "email":
            if not self.enviar_codigo(user.mfa, user, FINALIDADE_ATIVAR):
                raise _erro_envio()
            return {"metodo": "email", "enviado_para": mascarar_email(user.email)}
        url = pyotp.TOTP(segredo).provisioning_uri(name=user.email, issuer_name=EMISSOR)
        qr_svg = qrcode.make(url, image_factory=SvgPathImage).to_string(encoding="unicode")
        return {"metodo": "totp", "otpauth_url": url, "segredo": segredo, "qr_svg": qr_svg}
```

5. `ativar()` — trocar `if not self._totp_valido(mfa, codigo):` por:

```python
        valido = self._codigo_email_valido(mfa, codigo) if mfa.metodo == "email" else self._totp_valido(mfa, codigo)
        if not valido:
```

6. Envio/reenvio — acrescentar após `desativar()` (seção `# ---------- codigo por e-mail ----------`):

```python
    # ---------- codigo por e-mail ----------

    def enviar_codigo(self, mfa: UsuarioMfa, user: Usuario, finalidade: str) -> bool:
        """Gera um codigo novo (o anterior morre), persiste so o hash e envia. False se o envio falhou
        (o hash fica gravado: um "Reenviar" depois resolve)."""
        codigo = gerar_codigo_email()
        agora = datetime.now(timezone.utc)
        mfa.codigo_hash = hash_codigo_email(codigo)
        mfa.codigo_expira_em = agora + timedelta(minutes=CODIGO_EMAIL_VALIDADE_MINUTOS)
        mfa.codigo_enviado_em = agora
        mfa.codigo_tentativas = 0
        self.db.add(mfa)
        self.db.commit()
        html, texto = renderizar("codigo_verificacao", codigo=codigo, finalidade=finalidade)
        return enviar(user.email, assunto("codigo_verificacao"), html, texto) is not None

    def reenviar_codigo(self, mfa: UsuarioMfa, user: Usuario, finalidade: str) -> dict:
        """Limites: 60 s entre envios (429 AGUARDE) e 3 reenvios por ciclo (429 LIMITE_REENVIO);
        o ciclo recomeca quando o codigo anterior ja expirou."""
        agora = datetime.now(timezone.utc)
        expira = garantir_utc(mfa.codigo_expira_em)
        if expira is None or expira < agora:
            mfa.codigo_reenvios = 0
        if mfa.codigo_reenvios >= CODIGO_EMAIL_MAX_REENVIOS:
            raise AppException(
                code="LIMITE_REENVIO",
                message="Limite de reenvios atingido; aguarde 10 minutos e tente de novo",
                status_code=429,
            )
        enviado_em = garantir_utc(mfa.codigo_enviado_em)
        if enviado_em is not None:
            faltam = CODIGO_EMAIL_INTERVALO_SEGUNDOS - int((agora - enviado_em).total_seconds())
            if faltam > 0:
                raise AppException(code="AGUARDE", message=f"Aguarde {faltam} s para reenviar", status_code=429)
        mfa.codigo_reenvios += 1
        if not self.enviar_codigo(mfa, user, finalidade):
            raise _erro_envio()
        return {"enviado_para": mascarar_email(user.email)}
```

7. `codigo_valido()` — substituir:

```python
    def codigo_valido(self, mfa: UsuarioMfa, codigo: str) -> bool:
        """Codigo de recuperacao (consome) OU, conforme o metodo, TOTP (janela +-1, anti-replay)
        ou codigo por e-mail (hash HMAC, 10 min, 5 tentativas)."""
        if eh_codigo_recuperacao(codigo):
            return self._recuperacao_valida(mfa, codigo)
        if mfa.metodo == "email":
            return self._codigo_email_valido(mfa, codigo)
        return self._totp_valido(mfa, codigo)
```

8. Validador do e-mail — acrescentar antes de `_recuperacao_valida` (mesma regra: persiste o consumo):

```python
    def _codigo_email_valido(self, mfa: UsuarioMfa, codigo: str) -> bool:
        digitos = normalizar_codigo(codigo)
        if not digitos.isdigit() or len(digitos) != 6:
            return False
        expira = garantir_utc(mfa.codigo_expira_em)
        if not mfa.codigo_hash or expira is None or expira < datetime.now(timezone.utc):
            return False
        if mfa.codigo_tentativas >= CODIGO_EMAIL_MAX_TENTATIVAS:
            return False
        if hmac.compare_digest(hash_codigo_email(digitos), mfa.codigo_hash):
            mfa.codigo_hash = None
            mfa.codigo_expira_em = None
            mfa.codigo_tentativas = 0
            self.db.add(mfa)
            self.db.commit()
            return True
        mfa.codigo_tentativas += 1
        self.db.add(mfa)
        self.db.commit()
        return False
```

- [ ] **Step 6: Rodar os testes**

Run: `venv/Scripts/python -m pytest backend/tests/test_mfa_email.py -o addopts="" -q` → `18 passed`.
Run: `venv/Scripts/python -m pytest backend/tests -o addopts="" -q` → 0 falhas. Atenção: `test_mfa_service.py::test_status_sem_mfa` e `test_mfa_login.py` comparam o dict de `status()` — se algum assert for de igualdade exata, acrescentar `"metodo": None`/`"metodo": "totp"` à expectativa (mudança esperada desta task, não regressão).

- [ ] **Step 7: Commit**

```bash
git add backend/alembic/versions/0044_usuario_mfa_email.py backend/app/models/usuario_mfa.py backend/app/services/mfa_service.py backend/tests/test_mfa_email.py backend/tests/test_mfa_service.py backend/tests/test_mfa_login.py
git commit -m "feat(mfa): metodo email no MfaService - codigo HMAC de 6 digitos (10 min, 5 tentativas, 3 reenvios), migracao 0044"
```
(Incluir `test_mfa_service.py`/`test_mfa_login.py` no `git add` só se foram ajustados.)

---

### Task 6: Login em duas etapas por e-mail — `authenticate`, `verificar_mfa`, `/auth/mfa/reenviar`, `/auth/mfa/enviar-codigo`, `configurar {metodo}`

**Files:**
- Modify: `backend/app/services/auth_service.py`
- Modify: `backend/app/services/mfa_service.py` (`enviar_codigo_para_desativar`)
- Modify: `backend/app/schemas/mfa.py`
- Modify: `backend/app/api/v1/routers/mfa.py`
- Test: `backend/tests/test_mfa_email.py` (acrescentar)

**Interfaces:**
- Consumes: Task 5 (`MfaService.enviar_codigo/reenviar_codigo/configurar(metodo)`, `FINALIDADE_LOGIN/DESATIVAR`), `mascarar_email`.
- Produces: `POST /auth/login` com MFA e-mail → `{mfa_obrigatorio: true, mfa_token, metodo: "email", enviado_para, enviado: bool}` (TOTP → `{mfa_obrigatorio, mfa_token, metodo: "totp"}`); `POST /auth/mfa/reenviar {mfa_token}` → `{enviado_para}` | 429 `AGUARDE`/`LIMITE_REENVIO` | 409 `METODO_NAO_EMAIL` | 401 `MFA_SESSAO_INVALIDA`/`MFA_TOKEN_INVALIDADO`; `POST /auth/mfa/enviar-codigo` (ADMIN_GLOBAL) → `{enviado_para}` | 409 `MFA_NAO_EMAIL`; `POST /auth/mfa/configurar {metodo?}`; `GET /auth/mfa/status` inclui `metodo`; schemas `MfaConfigurarIn(metodo)`, `MfaReenviarIn(mfa_token)`; `AuthService.reenviar_codigo_mfa(mfa_token) -> dict`; `AuthService._usuario_do_mfa_token(mfa_token) -> (Usuario, payload)`.

- [ ] **Step 1: Acrescentar os testes (falhando)**

Em `backend/tests/test_mfa_email.py`, acrescentar aos imports:

```python
from app.api.v1.routers.mfa import mfa_configurar, mfa_enviar_codigo, mfa_reenviar, mfa_status, mfa_verificar
from app.schemas.mfa import MfaConfigurarIn, MfaReenviarIn, MfaVerificarIn
from app.services.auth_service import AuthService
```

E ao final:

```python
# ---------- Task 6: login em duas etapas por e-mail, reenviar, enviar-codigo ----------

def _login(db, email="admin@x.com"):
    return AuthService(db).authenticate(email, "senha123", ip="1.1.1.1", user_agent="t")


def test_login_email_envia_codigo_e_devolve_metodo_e_mascarado(db, enviados):
    u = _admin(db)
    _ativar_email(db, u, enviados)
    antes = enviados.total
    r = _login(db)
    assert r["mfa_obrigatorio"] is True and r["mfa_token"]
    assert r["metodo"] == "email" and r["enviado_para"] == "a***@x.com" and r["enviado"] is True
    assert "access_token" not in r
    assert enviados.total == antes + 1 and "entrar na plataforma" in enviados[-1]["texto"]
    db.refresh(u)
    assert u.mfa.codigo_reenvios == 0 and u.mfa.codigo_tentativas == 0
    assert db.query(LoginAudit).count() == 0


def test_login_totp_inclui_metodo_totp(db, enviados):
    u = _admin(db)
    MfaService(db).configurar(u)
    # ativa direto no banco para nao depender do relogio TOTP neste arquivo
    u.mfa.ativo = True
    u.mfa.codigos_recuperacao = []
    db.commit()
    r = _login(db)
    assert r["metodo"] == "totp" and "enviado_para" not in r
    assert enviados.total == 0


def test_login_email_envio_falho_enviado_false_e_reenviar_depois_funciona(db, enviados):
    u = _admin(db)
    _ativar_email(db, u, enviados)
    enviados.falhar = True
    r = _login(db)
    assert r["enviado"] is False and r["mfa_token"]
    enviados.falhar = False
    db.refresh(u)
    _voltar_envio(db, u.mfa)
    assert AuthService(db).reenviar_codigo_mfa(r["mfa_token"]) == {"enviado_para": "a***@x.com"}
    tokens = AuthService(db).verificar_mfa(r["mfa_token"], enviados.ultimo_codigo, "1.1.1.1", "t")
    assert tokens["access_token"]


def test_verificar_email_certo_emite_tokens_audita_e_limpa_codigo(db, enviados):
    u = _admin(db)
    _ativar_email(db, u, enviados)
    r = _login(db)
    tokens = AuthService(db).verificar_mfa(r["mfa_token"], enviados.ultimo_codigo, "1.1.1.1", "t")
    assert tokens["access_token"] and tokens["refresh_token"] and tokens["token_type"] == "bearer"
    db.refresh(u)
    assert u.mfa.codigo_hash is None and u.last_login is not None
    assert db.query(LoginAudit).filter(LoginAudit.motivo == "mfa_ok").count() == 1


def test_verificar_email_errado_5x_invalida_token(db, enviados):
    u = _admin(db)
    _ativar_email(db, u, enviados)
    r = _login(db)
    svc = AuthService(db)
    certo = enviados.ultimo_codigo
    errado = "000000" if certo != "000000" else "111111"
    for _ in range(4):
        with pytest.raises(UnauthorizedException):
            svc.verificar_mfa(r["mfa_token"], errado, "1.1.1.1", "t")
    with pytest.raises(AppException) as exc:
        svc.verificar_mfa(r["mfa_token"], errado, "1.1.1.1", "t")
    assert exc.value.code == "MFA_TOKEN_INVALIDADO"
    with pytest.raises(AppException) as exc:
        svc.verificar_mfa(r["mfa_token"], certo, "1.1.1.1", "t")
    assert exc.value.code == "MFA_TOKEN_INVALIDADO"
    assert db.query(LoginAudit).filter(LoginAudit.motivo == "mfa_invalido").count() == 5


def test_verificar_email_expirado_401(db, enviados):
    u = _admin(db)
    _ativar_email(db, u, enviados)
    r = _login(db)
    db.refresh(u)
    u.mfa.codigo_expira_em = _agora() - timedelta(minutes=1)
    db.commit()
    with pytest.raises(UnauthorizedException):
        AuthService(db).verificar_mfa(r["mfa_token"], enviados.ultimo_codigo, "1.1.1.1", "t")


def test_codigo_recuperacao_no_login_email(db, enviados):
    u = _admin(db)
    _, codigos = _ativar_email(db, u, enviados)
    r = _login(db)
    assert AuthService(db).verificar_mfa(r["mfa_token"], codigos[0], "1.1.1.1", "t")["access_token"]


def test_verificar_email_nao_exige_chave_fernet(db, enviados, monkeypatch):
    u = _admin(db)
    _ativar_email(db, u, enviados)
    monkeypatch.setattr(mfa_crypto.settings, "MFA_ENCRYPTION_KEY", "")
    r = _login(db)
    assert AuthService(db).verificar_mfa(r["mfa_token"], enviados.ultimo_codigo, "1.1.1.1", "t")["access_token"]


def test_reenviar_rota_limites_e_codigo_antigo_morre(db, enviados):
    u = _admin(db)
    _ativar_email(db, u, enviados)
    r = _login(db)
    req = _FakeRequest()
    with pytest.raises(AppException) as exc:
        mfa_reenviar(req, MfaReenviarIn(mfa_token=r["mfa_token"]), db=db)
    assert exc.value.code == "AGUARDE"
    antigo = enviados.ultimo_codigo
    db.refresh(u)
    _voltar_envio(db, u.mfa)
    assert mfa_reenviar(req, MfaReenviarIn(mfa_token=r["mfa_token"]), db=db) == {"enviado_para": "a***@x.com"}
    with pytest.raises(UnauthorizedException):
        mfa_verificar(req, MfaVerificarIn(mfa_token=r["mfa_token"], codigo=antigo), db=db)
    assert mfa_verificar(req, MfaVerificarIn(mfa_token=r["mfa_token"], codigo=enviados.ultimo_codigo), db=db)["access_token"]


def test_reenviar_token_invalido_401_e_metodo_totp_409(db, enviados):
    with pytest.raises(AppException) as exc:
        AuthService(db).reenviar_codigo_mfa("nao-e-token")
    assert exc.value.status_code == 401 and exc.value.code == "MFA_SESSAO_INVALIDA"
    u = _admin(db)
    MfaService(db).configurar(u)
    u.mfa.ativo = True
    db.commit()
    r = _login(db)
    with pytest.raises(AppException) as exc:
        AuthService(db).reenviar_codigo_mfa(r["mfa_token"])
    assert exc.value.status_code == 409 and exc.value.code == "METODO_NAO_EMAIL"


def test_enviar_codigo_rota_para_desativar(db, enviados):
    u = _admin(db)
    svc, _ = _ativar_email(db, u, enviados)
    req = _FakeRequest()
    _voltar_envio(db, u.mfa)
    assert mfa_enviar_codigo(req, db=db, current_user=u) == {"enviado_para": "a***@x.com"}
    assert FINALIDADE_DESATIVAR in enviados[-1]["texto"]
    svc.desativar(u, "senha123", enviados.ultimo_codigo, request=req)
    db.refresh(u)
    assert u.mfa is None
    # usuario TOTP (ou sem MFA) nao tem o que enviar
    v = _admin(db, email="totp@x.com")
    MfaService(db).configurar(v)
    v.mfa.ativo = True
    db.commit()
    with pytest.raises(AppException) as exc:
        mfa_enviar_codigo(req, db=db, current_user=v)
    assert exc.value.status_code == 409 and exc.value.code == "MFA_NAO_EMAIL"


def test_handler_configurar_com_payload_email_e_status_com_metodo(db, enviados):
    u = _admin(db)
    req = _FakeRequest()
    cfg = mfa_configurar(req, payload=MfaConfigurarIn(metodo="email"), db=db, current_user=u)
    assert cfg.data.metodo == "email" and cfg.data.enviado_para == "a***@x.com" and cfg.data.qr_svg is None
    db.refresh(u)
    assert mfa_status(req, db=db, current_user=u).data.metodo is None
    MfaService(db).ativar(u, enviados.ultimo_codigo, request=req)
    db.refresh(u)
    st = mfa_status(req, db=db, current_user=u).data
    assert st.ativo is True and st.metodo == "email"
    # sem payload continua TOTP (compatibilidade com o front atual)
    w = _admin(db, email="w@x.com")
    cfg2 = mfa_configurar(req, db=db, current_user=w)
    assert cfg2.data.metodo == "totp" and cfg2.data.qr_svg
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `venv/Scripts/python -m pytest backend/tests/test_mfa_email.py -o addopts="" -q`
Expected: erro de import (`mfa_reenviar`, `MfaReenviarIn` nao existem).

- [ ] **Step 3: Schemas**

Em `backend/app/schemas/mfa.py`, trocar `from pydantic import BaseModel, Field` por `from typing import Literal` + `from pydantic import BaseModel, Field`; substituir `MfaStatusOut` e `MfaConfigurarOut` e acrescentar dois schemas:

```python
class MfaStatusOut(BaseModel):
    ativo: bool
    ativado_em: datetime | None = None
    codigos_restantes: int = 0
    metodo: str | None = None  # "totp" | "email" | None (sem MFA ativo)


class MfaConfigurarIn(BaseModel):
    metodo: Literal["totp", "email"] = "totp"


class MfaConfigurarOut(BaseModel):
    metodo: str
    # TOTP
    otpauth_url: str | None = None
    segredo: str | None = None
    qr_svg: str | None = None
    # e-mail
    enviado_para: str | None = None


class MfaReenviarIn(BaseModel):
    mfa_token: str
```

- [ ] **Step 4: `MfaService.enviar_codigo_para_desativar`**

Em `backend/app/services/mfa_service.py`, na seção `# ---------- codigo por e-mail ----------`, após `reenviar_codigo`:

```python
    def enviar_codigo_para_desativar(self, user: Usuario) -> dict:
        """Modal "Desativar" com metodo e-mail: manda o codigo que o desativar vai exigir."""
        mfa = user.mfa
        if mfa is None or not mfa.ativo or mfa.metodo != "email":
            raise AppException(code="MFA_NAO_EMAIL", message="A verificacao por e-mail nao esta ativa", status_code=409)
        return self.reenviar_codigo(mfa, user, FINALIDADE_DESATIVAR)
```

- [ ] **Step 5: `auth_service.py`**

1. Imports: acrescentar `from app.services.email_service import mascarar_email` e trocar `from app.services.mfa_service import MfaService` por `from app.services.mfa_service import FINALIDADE_LOGIN, MfaService`.

2. Em `authenticate`, substituir o bloco do segundo fator:

```python
        # Segundo fator: nao emite tokens, nao audita, nao atualiza last_login
        # ate o codigo ser verificado em /auth/mfa/verificar.
        if user.mfa is not None and user.mfa.ativo:
            resposta = {
                "mfa_obrigatorio": True,
                "mfa_token": create_mfa_token(str(user.id)),
                "metodo": user.mfa.metodo,
            }
            if user.mfa.metodo == "email":
                user.mfa.codigo_reenvios = 0  # cada login comeca com 3 reenvios
                enviado = MfaService(self.session).enviar_codigo(user.mfa, user, FINALIDADE_LOGIN)
                resposta.update({"enviado_para": mascarar_email(user.email), "enviado": enviado})
            return resposta
```

3. Extrair a resolução do token para um helper e usá-lo em `verificar_mfa`; acrescentar `reenviar_codigo_mfa`. Substituir `verificar_mfa` inteiro por:

```python
    def _usuario_do_mfa_token(self, mfa_token: str) -> tuple[Usuario, dict]:
        """Valida o mfa_token (type, jti nao invalidado, sub) e devolve (usuario com MFA ativo, payload)."""
        payload = decode_token(mfa_token)
        if not payload or payload.get("type") != "mfa" or not payload.get("jti"):
            raise AppException(
                code="MFA_SESSAO_INVALIDA",
                message="Sessao de verificacao invalida ou expirada; faca login de novo",
                status_code=401,
            )
        if _token_mfa_invalidado(payload["jti"]):
            raise AppException(
                code="MFA_TOKEN_INVALIDADO", message="Muitas tentativas; faca login de novo", status_code=401
            )
        try:
            uid = int(payload.get("sub"))
        except (TypeError, ValueError):
            raise AppException(code="MFA_SESSAO_INVALIDA", message="Sessao de verificacao invalida", status_code=401)
        user = self.session.get(Usuario, uid)
        if not user or not user.ativo or user.mfa is None or not user.mfa.ativo:
            raise AppException(code="MFA_SESSAO_INVALIDA", message="Sessao de verificacao invalida", status_code=401)
        return user, payload

    def verificar_mfa(self, mfa_token: str, codigo: str, ip: str | None, user_agent: str | None) -> dict:
        user, payload = self._usuario_do_mfa_token(mfa_token)
        jti = payload["jti"]
        if user.mfa.metodo == "totp":
            exigir_chave()  # so o TOTP precisa da chave Fernet
        if not MfaService(self.session).codigo_valido(user.mfa, codigo):
            self._record_attempt(user.id, user.email, False, "mfa_invalido", ip, user_agent)
            n = _registrar_falha_mfa(jti)
            if n >= MFA_MAX_FALHAS:
                raise AppException(
                    code="MFA_TOKEN_INVALIDADO", message="Muitas tentativas; faca login de novo", status_code=401
                )
            raise UnauthorizedException("Codigo invalido")
        # Uso unico: marca o jti como consumido ate expirar (reuso cai no pre-check).
        _FALHAS_MFA[jti] = (MFA_MAX_FALHAS, payload["exp"])
        tokens = self._emitir_tokens(user)
        user.last_login = datetime.now(timezone.utc)
        self.session.add(user)
        self._record_attempt(user.id, user.email, True, "mfa_ok", ip, user_agent)
        return tokens

    def reenviar_codigo_mfa(self, mfa_token: str) -> dict:
        """POST /auth/mfa/reenviar: novo codigo por e-mail para o login em andamento."""
        user, _ = self._usuario_do_mfa_token(mfa_token)
        if user.mfa.metodo != "email":
            raise AppException(
                code="METODO_NAO_EMAIL", message="Reenvio so vale para verificacao por e-mail", status_code=409
            )
        return MfaService(self.session).reenviar_codigo(user.mfa, user, FINALIDADE_LOGIN)
```

- [ ] **Step 6: Router**

Em `backend/app/api/v1/routers/mfa.py`:
1. Import dos schemas: acrescentar `MfaConfigurarIn` e `MfaReenviarIn` à lista.
2. Substituir `mfa_configurar`:

```python
@router.post("/configurar", response_model=SuccessResponse[MfaConfigurarOut])
@limiter.limit("5/minute")
def mfa_configurar(
    request: Request,
    payload: MfaConfigurarIn | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    metodo = payload.metodo if payload is not None else "totp"
    return SuccessResponse(data=MfaConfigurarOut(**MfaService(db).configurar(current_user, metodo=metodo)))
```
3. Acrescentar ao final:

```python


@router.post("/reenviar")
@limiter.limit("3/minute")
def mfa_reenviar(request: Request, payload: MfaReenviarIn, db: Session = Depends(get_db)):
    """Novo codigo por e-mail para o login em andamento (publico: so o mfa_token identifica)."""
    return AuthService(db).reenviar_codigo_mfa(payload.mfa_token)


@router.post("/enviar-codigo")
@limiter.limit("3/minute")
def mfa_enviar_codigo(request: Request, db: Session = Depends(get_db), current_user=Depends(require_role("ADMIN_GLOBAL"))):
    """Codigo por e-mail para confirmar a desativacao (metodo email ativo)."""
    return MfaService(db).enviar_codigo_para_desativar(current_user)
```

- [ ] **Step 7: Rodar os testes**

Run: `venv/Scripts/python -m pytest backend/tests/test_mfa_email.py -o addopts="" -q` → `30 passed`.
Run: `venv/Scripts/python -m pytest backend/tests -o addopts="" -q` → 0 falhas (`test_mfa_login.py` continua verde: mesmos codes/mensagens; o `authenticate` TOTP agora devolve também `metodo`, e `test_rotas_registradas_no_app`, se existir, não lista rotas que deixaram de existir).

- [ ] **Step 8: Commit**

```bash
git add backend/app/services/auth_service.py backend/app/services/mfa_service.py backend/app/schemas/mfa.py backend/app/api/v1/routers/mfa.py backend/tests/test_mfa_email.py
git commit -m "feat(mfa): login em duas etapas por e-mail - envio no login, POST /auth/mfa/reenviar e /enviar-codigo, configurar com metodo"
```

---

### Task 7: Frontend — `AuthContext` e `LoginPage` com código por e-mail e "Reenviar"

**Files:**
- Modify: `frontend-observatorio/src/context/AuthContext.jsx`, `AuthContext.test.jsx` (+2)
- Modify: `frontend-observatorio/src/pages/login/LoginPage.jsx`, `LoginPage.test.jsx` (+3)

**Interfaces:**
- Consumes: `POST /auth/login` → `{mfa_obrigatorio, mfa_token, metodo, enviado_para?, enviado?}`; `POST /auth/mfa/reenviar {mfa_token}` → `{enviado_para}` (dict cru) | 429 `AGUARDE` ("Aguarde N s para reenviar") / `LIMITE_REENVIO` | 502 `EMAIL_NAO_ENVIADO` | 401 `MFA_SESSAO_INVALIDA`/`MFA_TOKEN_INVALIDADO` (Task 6).
- Produces: `useAuth().login(email, senha)` → `{ mfa: true, mfaToken, metodo, enviadoPara, enviado }` (chaves ausentes na resposta ficam `undefined`) ou `{ mfa: false }`; `useAuth().reenviarCodigoMfa(mfaToken) → Promise<{ enviado_para }>`.

- [ ] **Step 1: Escrever os testes (falhando)**

Em `frontend-observatorio/src/context/AuthContext.test.jsx`, dentro do `describe("AuthContext — login em duas etapas (MFA)", ...)` existente, acrescentar ao final (o componente `ProbeMfa` existente já renderiza o retorno do `login` em `data-testid="res"`):

```jsx
  it("login com metodo email devolve metodo, enviadoPara e enviado", async () => {
    api.post.mockResolvedValueOnce({ data: { mfa_obrigatorio: true, mfa_token: "tok-mfa", metodo: "email", enviado_para: "a***@x.com", enviado: false } });
    render(<AuthProvider><ProbeMfa /></AuthProvider>);
    await screen.findByText("sem-user");
    fireEvent.click(screen.getByText("login"));
    await waitFor(() => expect(screen.getByTestId("res").textContent).toBe(
      JSON.stringify({ mfa: true, mfaToken: "tok-mfa", metodo: "email", enviadoPara: "a***@x.com", enviado: false })
    ));
    expect(localStorage.getItem("access_token")).toBeNull();
  });

  it("reenviarCodigoMfa chama /auth/mfa/reenviar e devolve o corpo", async () => {
    function ProbeReenviar() {
      const { reenviarCodigoMfa } = useAuth();
      const [r, setR] = useState(null);
      return (
        <>
          <button onClick={async () => setR(await reenviarCodigoMfa("tok-mfa"))}>reenviar</button>
          <div data-testid="r">{r ? JSON.stringify(r) : ""}</div>
        </>
      );
    }
    api.post.mockResolvedValueOnce({ data: { enviado_para: "a***@x.com" } });
    render(<AuthProvider><ProbeReenviar /></AuthProvider>);
    fireEvent.click(await screen.findByText("reenviar"));
    await waitFor(() => expect(screen.getByTestId("r").textContent).toBe(JSON.stringify({ enviado_para: "a***@x.com" })));
    expect(api.post).toHaveBeenCalledWith("/auth/mfa/reenviar", { mfa_token: "tok-mfa" });
  });
```

Em `frontend-observatorio/src/pages/login/LoginPage.test.jsx`:
1. Trocar a primeira linha de import de RTL por `import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";` e a de vitest por `import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";`.
2. Trocar `const auth = { login: vi.fn(), verificarMfa: vi.fn(), user: null, loading: false };` por `const auth = { login: vi.fn(), verificarMfa: vi.fn(), reenviarCodigoMfa: vi.fn(), user: null, loading: false };`.
3. Após o `beforeEach` existente, acrescentar `afterEach(() => vi.useRealTimers());`.
4. Acrescentar um `describe` novo ao final do arquivo:

```jsx
describe("LoginPage — codigo por e-mail", () => {
  const RESP_EMAIL = { mfa: true, mfaToken: "tok", metodo: "email", enviadoPara: "a***@x.gov.br", enviado: true };

  it("mostra o endereco mascarado; Reenviar fica bloqueado 60 s e depois reenvia", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    auth.login.mockResolvedValueOnce(RESP_EMAIL);
    auth.reenviarCodigoMfa.mockResolvedValueOnce({ enviado_para: "a***@x.gov.br" });
    montar();
    await preencherELogar();
    expect(await screen.findByText(/Enviamos um código para a\*\*\*@x\.gov\.br/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reenviar código/ })).toBeDisabled();
    act(() => { vi.advanceTimersByTime(60000); });
    await waitFor(() => expect(screen.getByRole("button", { name: /Reenviar código/ })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: /Reenviar código/ }));
    await waitFor(() => expect(auth.reenviarCodigoMfa).toHaveBeenCalledWith("tok"));
    expect(await screen.findByRole("status")).toHaveTextContent(/novo código/i);
    expect(screen.getByRole("button", { name: /Reenviar código/ })).toBeDisabled();
  });

  it("enviado false mostra aviso e libera Reenviar na hora", async () => {
    auth.login.mockResolvedValueOnce({ ...RESP_EMAIL, enviado: false });
    montar();
    await preencherELogar();
    expect(await screen.findByText(/Não conseguimos enviar o e-mail/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reenviar código/ })).not.toBeDisabled();
  });

  it("LIMITE_REENVIO esconde o botao e mostra a mensagem", async () => {
    auth.login.mockResolvedValueOnce({ ...RESP_EMAIL, enviado: false });
    auth.reenviarCodigoMfa.mockRejectedValueOnce({ response: { status: 429, data: { error: { code: "LIMITE_REENVIO", message: "Limite de reenvios atingido; aguarde 10 minutos e tente de novo" } } } });
    montar();
    await preencherELogar();
    fireEvent.click(await screen.findByRole("button", { name: /Reenviar código/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Limite de reenvios/);
    expect(screen.queryByRole("button", { name: /Reenviar código/ })).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run (em `frontend-observatorio/`): `npx vitest run src/context/AuthContext.test.jsx src/pages/login/LoginPage.test.jsx`
Expected: os 5 testes novos falham (campos ausentes, `reenviarCodigoMfa` não existe, texto/botão ausentes); os antigos passam.

- [ ] **Step 3: `AuthContext.jsx`**

No `login`, trocar as duas linhas
```jsx
    const { access_token, mfa_obrigatorio, mfa_token } = response.data;
    if (mfa_obrigatorio) return { mfa: true, mfaToken: mfa_token };
```
por
```jsx
    const { access_token, mfa_obrigatorio, mfa_token, metodo, enviado_para, enviado } = response.data;
    if (mfa_obrigatorio) {
      return { mfa: true, mfaToken: mfa_token, metodo, enviadoPara: enviado_para, enviado };
    }
```
Após `verificarMfa`, acrescentar:
```jsx
  // Novo código por e-mail para o login em andamento (só o mfa_token identifica).
  const reenviarCodigoMfa = async (mfaToken) => {
    const response = await api.post("/auth/mfa/reenviar", { mfa_token: mfaToken });
    return response.data;
  };
```
e incluir `reenviarCodigoMfa` no `value` do provider: `value={{ user, login, verificarMfa, reenviarCodigoMfa, logout, loading }}`.

- [ ] **Step 4: `LoginPage.jsx`**

1. Desestruturar também `reenviarCodigoMfa` de `useAuth()`.
2. Novos estados, logo após `usarRecuperacao`:
```jsx
  const [metodo, setMetodo] = useState("totp");        // "totp" | "email"
  const [enviadoPara, setEnviadoPara] = useState("");
  const [envioFalhou, setEnvioFalhou] = useState(false);
  const [cooldown, setCooldown] = useState(0);         // segundos até liberar "Reenviar"
  const [reenvios, setReenvios] = useState(0);
  const [reenviando, setReenviando] = useState(false);
  const [aviso, setAviso] = useState("");
```
3. Constantes no topo do arquivo (fora do componente): `const COOLDOWN_REENVIO = 60;` e `const MAX_REENVIOS = 3;`.
4. Contador (o `setInterval` segue rodando entre renders; só é recriado quando entra ou sai do cooldown):
```jsx
  const emCooldown = cooldown > 0;
  useEffect(() => {
    if (!emCooldown) return undefined;
    const id = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(id);
  }, [emCooldown]);
```
5. Em `handleSubmit`, dentro do `if (r && r.mfa) {`, depois de `setUsarRecuperacao(false);`:
```jsx
        const porEmail = r.metodo === "email";
        setMetodo(porEmail ? "email" : "totp");
        setEnviadoPara(r.enviadoPara || "");
        setEnvioFalhou(porEmail && r.enviado === false);
        setCooldown(porEmail && r.enviado !== false ? COOLDOWN_REENVIO : 0);
        setReenvios(0);
        setAviso("");
```
6. Em `voltarParaSenha`, acrescentar `setMetodo("totp"); setEnviadoPara(""); setEnvioFalhou(false); setCooldown(0); setReenvios(0); setAviso("");`.
7. Em `handleVerificar`, no ramo `code === "UNAUTHORIZED"`, trocar a mensagem fixa por:
```jsx
        setError(metodo === "email"
          ? "Código inválido ou expirado. Confira o e-mail ou peça um novo código."
          : "Código inválido. Confira o app autenticador e tente de novo.");
```
8. Handler novo (após `handleVerificar`):
```jsx
  const handleReenviar = async () => {
    setReenviando(true);
    setError("");
    setAviso("");
    try {
      const r = await reenviarCodigoMfa(mfaToken);
      if (r && r.enviado_para) setEnviadoPara(r.enviado_para);
      setEnvioFalhou(false);
      setReenvios((n) => n + 1);
      setCooldown(COOLDOWN_REENVIO);
      setAviso("Enviamos um novo código. O anterior deixou de valer.");
    } catch (err) {
      const code = err?.response?.data?.error?.code;
      const msg = mensagemDoErro(err, "Não foi possível reenviar o código.");
      if (code === "MFA_TOKEN_INVALIDADO" || code === "MFA_SESSAO_INVALIDA") {
        voltarParaSenha("Sessão de verificação encerrada. Faça login de novo.");
      } else if (code === "LIMITE_REENVIO") {
        setReenvios(MAX_REENVIOS);
        setError(msg);
      } else if (code === "AGUARDE") {
        const m = /(\d+)/.exec(msg);
        setCooldown(m ? Number(m[1]) : COOLDOWN_REENVIO);
        setError(msg);
      } else if (err?.response?.status === 502) {
        setError("Não foi possível enviar o e-mail agora. Tente de novo em instantes.");
      } else {
        setError(msg);
      }
    } finally {
      setReenviando(false);
    }
  };
```
9. JSX da etapa de código:
   - No `LoginShell`, trocar o `subtitulo` por `etapa === "codigo" ? (metodo === "email" ? "Código enviado por e-mail" : "Código do app autenticador") : "Insira suas credenciais para continuar"`.
   - Trocar o `<p className="text-xs text-slate-500">Sua conta tem verificação…</p>` por:
```jsx
          {metodo === "email" ? (
            <p className="text-xs text-slate-500">
              Enviamos um código para <strong>{enviadoPara}</strong>. Ele vale por 10 minutos.
            </p>
          ) : (
            <p className="text-xs text-slate-500">
              Sua conta tem verificação em duas etapas. Digite o código do app autenticador.
            </p>
          )}
          {envioFalhou && (
            <p className="text-xs bg-amber-50 border border-amber-100 text-amber-800 px-4 py-3 rounded-xl">
              Não conseguimos enviar o e-mail agora. Use "Reenviar código" para tentar de novo.
            </p>
          )}
          {aviso && (
            <p role="status" className="text-xs bg-emerald-50 border border-emerald-100 text-emerald-800 px-4 py-3 rounded-xl">{aviso}</p>
          )}
```
   - Logo depois do botão "Verificar", antes da linha com "Voltar"/"Usar código de recuperação", inserir:
```jsx
          {metodo === "email" && reenvios < MAX_REENVIOS && (
            <button type="button" onClick={handleReenviar} disabled={reenviando || cooldown > 0}
              className="w-full text-xs text-blue-600 hover:text-blue-700 disabled:text-slate-400 disabled:cursor-not-allowed cursor-pointer">
              {cooldown > 0 ? `Reenviar código (${cooldown}s)` : reenviando ? "Reenviando..." : "Reenviar código"}
            </button>
          )}
```
   - No botão que alterna recuperação, trocar o texto por `{usarRecuperacao ? (metodo === "email" ? "Usar código do e-mail" : "Usar código do app") : "Usar código de recuperação"}`.

- [ ] **Step 5: Rodar testes, lint e build**

Run: `npx vitest run src/context/AuthContext.test.jsx src/pages/login/LoginPage.test.jsx` → todos verdes (AuthContext 10, LoginPage 11).
Run: `npx vitest run` → 0 falhas (o flake conhecido de `AuthContext.test.jsx` só na suíte completa: se aparecer, rodar o arquivo isolado e registrar).
Run: `npx eslint src/context/AuthContext.jsx src/pages/login/LoginPage.jsx` → só os erros pré-existentes (`set-state-in-effect` e `only-export-components` no AuthContext).
Run: `npx vite build` → sucesso.

- [ ] **Step 6: Commit**

```bash
git add frontend-observatorio/src/context/AuthContext.jsx frontend-observatorio/src/context/AuthContext.test.jsx frontend-observatorio/src/pages/login/LoginPage.jsx frontend-observatorio/src/pages/login/LoginPage.test.jsx
git commit -m "feat(mfa): etapa de codigo por e-mail no login - endereco mascarado, Reenviar com cooldown de 60s e aviso de envio falho"
```

---

### Task 8: Frontend — `MfaModal` com escolha do método (app ou e-mail)

**Files:**
- Modify: `frontend-observatorio/src/components/MfaModal.jsx`, `MfaModal.test.jsx` (ajusta 4, +3)
- Modify: `frontend-observatorio/src/app/layouts/DashboardLayout.jsx` (passa `emailUsuario`)

**Interfaces:**
- Consumes: `GET /auth/mfa/status` → `data.data.metodo` ("totp"|"email"|null); `POST /auth/mfa/configurar {metodo}` → `data.data` = `{metodo:"totp", otpauth_url, segredo, qr_svg}` | `{metodo:"email", enviado_para}` | 502 `EMAIL_NAO_ENVIADO`; `POST /auth/mfa/ativar {codigo}`; `POST /auth/mfa/enviar-codigo` → `{enviado_para}` (dict cru) | 429; `POST /auth/mfa/desativar` (Task 6).
- Produces: `MfaModal({ open, onClose, emailUsuario })`.

- [ ] **Step 1: Ajustar e escrever os testes (falhando)**

Em `frontend-observatorio/src/components/MfaModal.test.jsx`:
1. Nos testes "inativo: mostra Ativar; fluxo QR…", "marcar 'ja guardei'…", "codigo errado no confirmar…" e "409 ao configurar…", logo depois de `fireEvent.click(await screen.findByRole("button", { name: /Ativar verificação/i }));` inserir `fireEvent.click(screen.getByRole("button", { name: /App autenticador/i }));`.
2. No primeiro teste, trocar `expect(api.post).toHaveBeenCalledWith("/auth/mfa/configurar");` por `expect(api.post).toHaveBeenCalledWith("/auth/mfa/configurar", { metodo: "totp" });`.
3. Acrescentar ao final do `describe`:

```jsx
  it("Ativar mostra as duas opcoes com o e-mail do usuario", async () => {
    api.get.mockResolvedValueOnce(statusInativo);
    render(<MfaModal open onClose={() => {}} emailUsuario="ana@x.gov.br" />);
    fireEvent.click(await screen.findByRole("button", { name: /Ativar verificação/i }));
    expect(screen.getByRole("button", { name: /App autenticador/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Código por e-mail \(ana@x\.gov\.br\)/i })).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("metodo e-mail pula o QR: envia o codigo, confirma e mostra os codigos de recuperacao", async () => {
    api.get.mockResolvedValueOnce(statusInativo);
    api.post.mockResolvedValueOnce({ data: { data: { metodo: "email", enviado_para: "a***@x.gov.br" } } });
    api.post.mockResolvedValueOnce({ data: { data: { codigos_recuperacao: ["AAAA-1111"] } } });
    render(<MfaModal open onClose={() => {}} emailUsuario="ana@x.gov.br" />);
    fireEvent.click(await screen.findByRole("button", { name: /Ativar verificação/i }));
    fireEvent.click(screen.getByRole("button", { name: /Código por e-mail/i }));
    expect(await screen.findByText(/Enviamos um código para a\*\*\*@x\.gov\.br/)).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith("/auth/mfa/configurar", { metodo: "email" });
    expect(screen.queryByText(/Leia o QR/)).toBeNull();
    fireEvent.change(screen.getByLabelText(/Código do e-mail/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await screen.findByText("AAAA-1111");
    expect(api.post).toHaveBeenLastCalledWith("/auth/mfa/ativar", { codigo: "123456" });
  });

  it("ativo por e-mail mostra o metodo e Desativar pede o codigo por e-mail antes", async () => {
    api.get.mockResolvedValueOnce({ data: { data: { ativo: true, ativado_em: "2026-10-06T10:00:00Z", codigos_restantes: 9, metodo: "email" } } });
    api.post.mockResolvedValueOnce({ data: { enviado_para: "a***@x.gov.br" } });
    api.post.mockResolvedValueOnce({ data: { ok: true } });
    render(<MfaModal open onClose={() => {}} emailUsuario="ana@x.gov.br" />);
    expect(await screen.findByText(/código por e-mail/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Desativar/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/auth/mfa/enviar-codigo"));
    expect(await screen.findByText(/Enviamos um código para a\*\*\*@x\.gov\.br/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Senha atual"), { target: { value: "senha" } });
    fireEvent.change(screen.getByLabelText(/^Código$/), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: /Confirmar desativação/i }));
    await waitFor(() => expect(api.post).toHaveBeenLastCalledWith("/auth/mfa/desativar", { senha_atual: "senha", codigo: "654321" }));
  });
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx vitest run src/components/MfaModal.test.jsx` → os testes ajustados e os 3 novos falham (não há passo de escolha).

- [ ] **Step 3: `MfaModal.jsx`**

1. Assinatura: `export default function MfaModal({ open, onClose, emailUsuario })`. Atualizar o comentário do topo: `// Passos: status → metodo (app ou e-mail) → qr (QR + confirmar) | codigo_email → codigos.`
2. Estado novo: `const [enviadoPara, setEnviadoPara] = useState("");` e, em `fechar`, acrescentar `setEnviadoPara("");`.
3. Substituir `iniciar()` por:
```jsx
  async function iniciar(metodo) {
    setErro(""); setCarregando(true);
    try {
      const r = await api.post("/auth/mfa/configurar", { metodo });
      const dados = r.data.data;
      setCodigo("");
      if (dados.metodo === "email") {
        setEnviadoPara(dados.enviado_para || "");
        setPasso("codigo_email");
      } else {
        setConfig(dados);
        setPasso("qr");
      }
    } catch (err) {
      if (err?.response?.status === 503) setIndisponivel(true);
      setErro(mensagemDoErro(err, "Não foi possível iniciar a configuração."));
    } finally { setCarregando(false); }
  }

  async function abrirDesativar() {
    setErro(""); setCodigo(""); setSenhaAtual(""); setEnviadoPara("");
    setPasso("desativar");
    if (status && status.metodo === "email") {
      try {
        const r = await api.post("/auth/mfa/enviar-codigo");
        setEnviadoPara((r.data && r.data.enviado_para) || "");
      } catch (err) {
        setErro(mensagemDoErro(err, "Não foi possível enviar o código por e-mail."));
      }
    }
  }
```
4. No passo `status`, inativo: o botão "Ativar verificação em duas etapas" passa a fazer `onClick={() => { setErro(""); setPasso("metodo"); }}` (sem `disabled={carregando}` e com o texto fixo "Ativar verificação em duas etapas"); trocar o parágrafo explicativo por `<p>Proteja sua conta exigindo um código depois da senha: pelo app autenticador ou por e-mail.</p>`.
5. No passo `status`, ativo: depois do parágrafo "Ativa desde…", acrescentar `<p>Método: {status.metodo === "email" ? "código por e-mail" : "app autenticador"}.</p>`; o botão "Desativar" passa a `onClick={abrirDesativar}`.
6. Novo passo, antes do bloco `passo === "qr"`:
```jsx
            {passo === "metodo" && (
              <div className="space-y-3 text-sm text-[var(--text-dim)]">
                <p>Como você quer receber o código de verificação?</p>
                <button type="button" onClick={() => iniciar("totp")} disabled={carregando} className={`${btnSecundario} w-full text-left`}>
                  <strong className="block text-[var(--text)]">App autenticador</strong>
                  <span className="text-xs">Google Authenticator, Authy, 1Password… Funciona sem internet.</span>
                </button>
                <button type="button" onClick={() => iniciar("email")} disabled={carregando} className={`${btnSecundario} w-full text-left`}>
                  <strong className="block text-[var(--text)]">{emailUsuario ? `Código por e-mail (${emailUsuario})` : "Código por e-mail"}</strong>
                  <span className="text-xs">Enviamos um código de 6 dígitos a cada login.</span>
                </button>
                {alerta}
                <button type="button" className={btnSecundario} onClick={() => { setErro(""); setPasso("status"); }}>Voltar</button>
              </div>
            )}
```
7. Novo passo, depois do bloco `passo === "qr"`:
```jsx
            {passo === "codigo_email" && (
              <form onSubmit={confirmar} className="space-y-3 text-sm text-[var(--text-dim)]">
                <p>Enviamos um código para <strong className="text-[var(--text)]">{enviadoPara}</strong>. Ele vale por 10 minutos.</p>
                <input type="text" inputMode="numeric" autoComplete="one-time-code" aria-label="Código do e-mail" placeholder="000000"
                  value={codigo} onChange={(e) => setCodigo(e.target.value)} required maxLength={7} className={inputCls} />
                {alerta}
                <button type="button" onClick={() => iniciar("email")} disabled={carregando} className="text-xs text-blue-600 hover:text-blue-700 cursor-pointer disabled:text-[var(--text-mute)]">
                  Enviar outro código
                </button>
                <div className="flex gap-2">
                  <button type="button" className={btnSecundario} onClick={() => { setErro(""); setPasso("metodo"); }}>Voltar</button>
                  <button type="submit" disabled={carregando || codigo.trim().length < 6} className={btnPrimario} style={{ background: "var(--accent-1)", color: "var(--bg)" }}>
                    {carregando ? "Verificando..." : "Confirmar"}
                  </button>
                </div>
              </form>
            )}
```
8. No bloco `passo === "qr"`, o "Voltar" passa a voltar para `"metodo"`: `onClick={() => { setErro(""); setConfig(null); setPasso("metodo"); }}`.
9. No passo `desativar`, trocar o parágrafo e o placeholder do código:
```jsx
                <p>
                  {status && status.metodo === "email"
                    ? (enviadoPara ? `Enviamos um código para ${enviadoPara}. ` : "") + "Confirme sua senha e o código do e-mail (ou um código de recuperação)."
                    : "Para desativar, confirme sua senha e um código do app (ou um código de recuperação)."}
                </p>
```
e `placeholder={status && status.metodo === "email" ? "Código do e-mail ou XXXX-XXXX" : "Código do app ou XXXX-XXXX"}` no input de `aria-label="Código"`.
10. O texto do passo `codigos` ("…se você perder o app.") passa a "…se você perder o acesso ao app ou ao e-mail."

Em `frontend-observatorio/src/app/layouts/DashboardLayout.jsx`, trocar `{isGlobal && <MfaModal open={mfaOpen} onClose={() => setMfaOpen(false)} />}` por `{isGlobal && <MfaModal open={mfaOpen} onClose={() => setMfaOpen(false)} emailUsuario={user?.email} />}`.

- [ ] **Step 4: Rodar testes, lint e build**

Run: `npx vitest run src/components/MfaModal.test.jsx` → `9 passed`.
Run: `npx vitest run` → 0 falhas.
Run: `npx eslint src/components/MfaModal.jsx src/components/MfaModal.test.jsx src/app/layouts/DashboardLayout.jsx` → só os erros pré-existentes (comparar com `git show HEAD:<arquivo> | npx eslint --stdin --stdin-filename <arquivo>`).
Run: `npx vite build` → sucesso.

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/components/MfaModal.jsx frontend-observatorio/src/components/MfaModal.test.jsx frontend-observatorio/src/app/layouts/DashboardLayout.jsx
git commit -m "feat(mfa): MfaModal com escolha entre app autenticador e codigo por e-mail; desativar por e-mail pede o codigo antes"
```

---

### Task 9: Documentação — runbook do e-mail, envs, LGPD, MFA e backlog

**Files:**
- Create: `docs/email.md`
- Modify: `README.md`, `AGENTS.md` (§14), `docs/lgpd.md` (§1, §2(a), §4), `docs/mfa.md`, `IDEAS.md`

**Interfaces:** nenhuma de código. Fatos a citar exatamente: envs `RESEND_API_KEY`, `EMAIL_REMETENTE` (default `UAIZI NID <nao-responda@uaizi.com.br>`), `FRONTEND_URL` (produção `https://nid.uaizi.com.br`); constante `RETENCAO_REDEFINICAO_HORAS = 24`; rotas `POST /auth/esqueci-senha` (3/min), `GET /auth/redefinir-senha/validar`, `POST /auth/redefinir-senha` (5/min), `POST /auth/mfa/reenviar` (3/min), `POST /auth/mfa/enviar-codigo` (3/min); migrações `0043_redefinicao_senha`, `0044_usuario_mfa_email`.

- [ ] **Step 1: `docs/email.md`**

```markdown
# E-mail transacional (Resend) — runbook

Usos: "Esqueci minha senha" (qualquer usuário) e código de verificação por e-mail como segundo
fator (ADMIN_GLOBAL que escolher e-mail no lugar do app). Spec:
`docs/superpowers/specs/2026-10-06-email-resend-redefinicao-mfa-design.md`.

## 1. Configurar o Resend (uma vez)

1. Criar a conta em resend.com (plano grátis: 3 mil e-mails/mês).
2. Domains → Add Domain → `uaizi.com.br`.
3. Publicar no DNS de `uaizi.com.br` os registros que o Resend mostrar: SPF (`TXT`), DKIM
   (`TXT`/`CNAME`) e, para começar, DMARC `TXT _dmarc` com `v=DMARC1; p=none`.
4. Esperar o status "Verified". Sem domínio verificado o Resend responde 403 e nada sai.
5. API Keys → Create → permissão **Sending access** (só envio).

## 2. Variáveis no Railway (serviço `api`)

| Variável | Valor |
|---|---|
| `RESEND_API_KEY` | a chave `re_...` do passo 1.5 |
| `EMAIL_REMETENTE` | `UAIZI NID <nao-responda@uaizi.com.br>` (default; só mudar se trocar o domínio) |
| `FRONTEND_URL` | `https://nid.uaizi.com.br` — **obrigatória**: monta o link do e-mail de redefinição |

O serviço `worker` não envia e-mail. Sem `RESEND_API_KEY` a API roda em **modo seco**: nada é
enviado, o corpo do e-mail vai para o log (fora de produção) e os fluxos seguem como se tivessem
enviado — útil em desenvolvimento.

## 3. Testar em produção

1. Em `/login` → "Esqueci minha senha" → informar a própria conta.
2. Conferir a caixa de entrada (e o spam) e o log de envios no painel do Resend.
3. Abrir o link, definir uma senha nova e entrar com ela.

## 4. Regras que valem saber

- Link de redefinição: 30 minutos, uso único; pedir de novo invalida o anterior; até 3 pedidos
  por conta por hora (os seguintes respondem igual, sem enviar). A resposta é sempre a mesma,
  exista ou não a conta.
- Código MFA por e-mail: 6 dígitos, 10 minutos, 5 tentativas; "Reenviar" a cada 60 s, até 3 vezes
  por login. Códigos de recuperação continuam valendo.
- Tokens e códigos ficam no banco só como hash e os tokens de redefinição são apagados 24 h
  depois (`RETENCAO_REDEFINICAO_HORAS`).
- Rotas: `POST /auth/esqueci-senha` (3/min), `GET /auth/redefinir-senha/validar`,
  `POST /auth/redefinir-senha` (5/min), `POST /auth/mfa/reenviar` (3/min),
  `POST /auth/mfa/enviar-codigo` (3/min, ADMIN_GLOBAL). Migrações `0043_redefinicao_senha` e
  `0044_usuario_mfa_email`.

## 5. Problemas comuns

- **Caiu no spam**: confirme SPF e DKIM "Verified"; publique DMARC; evite mudar o remetente.
- **Link aponta para localhost**: `FRONTEND_URL` não foi definida no serviço `api`.
- **Nada chega e o log diz "HTTP 403"**: domínio não verificado ou chave sem permissão de envio.
- **Login por e-mail mostra "Não conseguimos enviar o e-mail"**: o Resend falhou ou demorou mais
  de 10 s; o usuário pode usar "Reenviar código" ou um código de recuperação.
```

- [ ] **Step 2: README e AGENTS**

`README.md`, no bloco de envs do backend, logo após a linha `MFA_ENCRYPTION_KEY=...`, acrescentar:
```
RESEND_API_KEY=re_...            # vazio = modo seco (nada e enviado)
EMAIL_REMETENTE=UAIZI NID <nao-responda@uaizi.com.br>
FRONTEND_URL=https://nid.uaizi.com.br
```
e, depois do parágrafo do MFA abaixo do bloco, a frase: `Transactional e-mail (password reset and MFA codes by e-mail) goes through Resend; without RESEND_API_KEY it runs in dry mode. See [docs/email.md](docs/email.md).`

`AGENTS.md` §14, na linha **Env vars**, depois de `MFA_ENCRYPTION_KEY (...)`, acrescentar: `, \`RESEND_API_KEY\`, \`EMAIL_REMETENTE\`, \`FRONTEND_URL\` (e-mail transacional via Resend; \`FRONTEND_URL\` obrigatória em produção, ver \`docs/email.md\`)`.

- [ ] **Step 3: LGPD**

Em `docs/lgpd.md`:
- §1, ao final da seção, novo parágrafo:
  > Para o envio de e-mails transacionais (redefinição de senha e códigos de verificação), a operadora utiliza o Resend como **suboperador**. São compartilhados com ele apenas o endereço de e-mail, o nome do usuário e o conteúdo da mensagem. Os servidores do Resend ficam nos Estados Unidos; a transferência internacional se apoia nas cláusulas contratuais padrão oferecidas pelo provedor (art. 33, II, "b"). Não há rastreamento de abertura ou de clique.
- §2 (a), ao final do parágrafo de contas de usuário:
  > Pedidos de redefinição de senha e códigos de verificação enviados por e-mail são guardados somente como hash (SHA-256 e HMAC-SHA256, respectivamente), nunca em texto claro.
- §4, depois do primeiro parágrafo:
  > Os tokens de redefinição de senha (`redefinicao_senha`) são apagados 24 horas depois de criados, pela mesma rotina de purga (constante `RETENCAO_REDEFINICAO_HORAS` em `backend/app/services/audit_service.py`). O código de verificação por e-mail é descartado ao ser usado ou ao expirar (10 minutos).

- [ ] **Step 4: `docs/mfa.md` e `IDEAS.md`**

`docs/mfa.md`, nova seção ao final:
```markdown
## Método por e-mail

Ao ativar, o ADMIN_GLOBAL escolhe "App autenticador" ou "Código por e-mail". No método e-mail
não há segredo TOTP nem `MFA_ENCRYPTION_KEY` envolvida: a cada login a API envia um código de
6 dígitos (10 min, 5 tentativas, "Reenviar" a cada 60 s até 3 vezes). Para desativar, o modal
envia um código novo (`POST /auth/mfa/enviar-codigo`). Exige o Resend configurado (`docs/email.md`);
se o envio falhar, o login mostra o aviso e o usuário pode reenviar ou usar um código de recuperação.
```

`IDEAS.md`: acrescentar (na seção de backlog, mesmo formato das demais entradas) três itens que reaproveitam a infra de e-mail — "Convite/boas-vindas por e-mail ao criar usuário", "Alertas por limiar por e-mail" e "Relatório executivo mensal em PDF por e-mail" — se ainda não existirem; se existirem, anotar ao lado "infra de e-mail pronta (docs/email.md)".

- [ ] **Step 5: Revisar e commitar**

Conferir que os blocos de código fecham e que nenhum arquivo de código mudou (`git status`).

```bash
git add docs/email.md README.md AGENTS.md docs/lgpd.md docs/mfa.md IDEAS.md
git commit -m "docs(email): runbook do Resend, envs, LGPD (suboperador, hash, purga 24h), MFA por e-mail e backlog"
```

---

## Checklist manual (usuário, depois do deploy)

1. Resend: domínio `uaizi.com.br` "Verified"; `RESEND_API_KEY`, `FRONTEND_URL` no serviço `api`.
2. `/login` → "Esqueci minha senha" com e-mail inexistente → mesma mensagem, nada chega.
3. Com a própria conta → e-mail chega em segundos; link abre `/redefinir-senha`; senha nova funciona; o link usado de novo mostra "expirou ou já foi usado".
4. Pedir duas vezes → só o segundo link vale.
5. ADMIN_GLOBAL → Segurança → "Código por e-mail" → código chega → ativar → guardar códigos de recuperação.
6. Sair e entrar → código por e-mail na etapa 2; "Reenviar" bloqueado 60 s; código antigo não vale depois do reenvio.
7. Segurança → Desativar → código chega → senha + código → desativado.
