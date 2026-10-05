# Umami Analytics no NID — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ligar o frontend do NID (`frontend-observatorio`) à instância compartilhada de Umami na Railway, registrando pageviews e identificando a sessão por `municipio_id` e papel, sem PII e sem rastrear em dev.

**Architecture:** Um módulo puro `src/services/analytics.js` (sem estado; dedupe e fila usam o DOM; nunca lança) injeta a tag do tracker quando `VITE_UMAMI_SRC` e `VITE_UMAMI_WEBSITE_ID` existem no build. `main.jsx` chama o loader antes do render; `AuthProvider` chama `identificarSessao(montarDadosSessao(user))` num `useEffect` sobre `user`. Dockerfile ganha os dois `ARG`/`ENV`; docs (runbook + LGPD) acompanham.

**Tech Stack:** React 19, Vite, Vitest 2 + jsdom + @testing-library/react, nginx/Docker na Railway, Umami 2.x (tracker `script.js`, `umami.identify(dados)`).

**Spec:** `docs/superpowers/specs/2026-10-05-umami-analytics-compartilhado-design.md` (fonte única para NID e LEGIS; este plano cobre só o repo do NID. O repo do LEGIS, `C:\Users\lucas\Documents\projetos\camara`, tem plano próprio.)

## Global Constraints

- Variáveis de build: exatamente `VITE_UMAMI_SRC` (URL base do Umami, sem barra final; o loader remove barra final se vier) e `VITE_UMAMI_WEBSITE_ID`. Sem as duas, nada é injetado e nada é enviado.
- Arquivo do loader: `frontend-observatorio/src/services/analytics.js`. Funções exportadas: `lerConfigAnalytics(env)`, `iniciarAnalytics(config, doc = document)`, `montarDadosSessao(user)`, `identificarSessao(dados, doc = document, win = window)`, constante `CHAVES_SESSAO`.
- Chaves permitidas no payload de identify: somente `municipio_id`, `municipio`, `papel`. No NID só `municipio_id` e `papel` são preenchidas (o `/auth/me` do NID não traz nome do município). **Nunca** `id`, `nome`, `email`, e nunca `uniqueId` no `identify`.
- O módulo não guarda estado: dedupe = `doc.querySelector("script[data-website-id]")`; fila do identify = listener `load` na própria tag.
- Nenhuma função do loader lança. Analytics é best-effort: bloqueador, Umami fora ou `identify` lançando não podem afetar render, auth ou rotas.
- A tag injetada é `<script defer src="{src}/script.js" data-website-id="{websiteId}">` no `<head>`.
- Sem `??=`/`||=` no código de produção (ESLint do repo está em `ecmaVersion: 2020`). `?.` e `??` são permitidos.
- Commits em ASCII (sem acento), estilo `tipo(escopo): descricao`, terminando com `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Gates: `npx vitest run` verde (suite atual: 460 testes); `npm run lint` sem erro **novo** nos arquivos tocados (a suite global de lint já falha e não é gate).
- Todos os comandos abaixo rodam em `C:\Users\lucas\Documents\projetos\dashboard_prefeituras\frontend-observatorio`, salvo indicação. Branch de trabalho: `feat/umami-analytics` (já existe, criada a partir de `main`).

## Review Focus

1. `VITE_UMAMI_SRC` com barra final (`https://x.app/`) → `src` da tag é `https://x.app/script.js`, nunca `//script.js`. Teste em Task 1.
2. Variável definida mas vazia ou só espaços (Railway com valor em branco) → tratada como ausente: nenhuma tag, nenhum request. Teste em Task 1.
3. `main.jsx` reexecutado com a tag já no DOM (HMR do Vite) → não duplica a tag e devolve `true`. Teste em Task 1.
4. `window.umami` existe mas sem `identify`, ou `identify` lança → nada propaga ao React. Teste em Task 1.
5. Logout seguido de login como outro usuário → `identificarSessao` é chamada de novo com os dados do novo usuário (e nunca com dados do usuário nulo). Teste em Task 2.

---

### Task 1: Loader `analytics.js` com testes (TDD)

**Files:**
- Create: `frontend-observatorio/src/services/analytics.js`
- Test: `frontend-observatorio/src/services/analytics.test.js`

**Interfaces:**
- Consumes: nada do repo (módulo puro).
- Produces:
  - `CHAVES_SESSAO: string[]` = `["municipio_id", "municipio", "papel"]`
  - `lerConfigAnalytics(env: object | undefined) → { src: string, websiteId: string } | null`
  - `iniciarAnalytics(config: { src, websiteId } | null, doc = document) → boolean`
  - `montarDadosSessao(user: object | null) → { municipio_id?: number, papel?: string } | null`
  - `identificarSessao(dados: object | null, doc = document, win = window) → void`

- [ ] **Step 1: Escrever o teste (falhando)**

Criar `src/services/analytics.test.js`:

```js
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CHAVES_SESSAO,
  identificarSessao,
  iniciarAnalytics,
  lerConfigAnalytics,
  montarDadosSessao,
} from "./analytics";

const CONFIG = { src: "https://umami.test", websiteId: "abc-123" };
const tags = () => document.querySelectorAll("script[data-website-id]");

afterEach(() => {
  tags().forEach((t) => t.remove());
  delete window.umami;
});

describe("lerConfigAnalytics", () => {
  it("sem nenhuma var → null", () => {
    expect(lerConfigAnalytics({})).toBeNull();
  });

  it("env ausente → null", () => {
    expect(lerConfigAnalytics(undefined)).toBeNull();
  });

  it("só uma das vars → null", () => {
    expect(lerConfigAnalytics({ VITE_UMAMI_SRC: "https://u.test" })).toBeNull();
    expect(lerConfigAnalytics({ VITE_UMAMI_WEBSITE_ID: "abc" })).toBeNull();
  });

  it("var vazia ou só espaços conta como ausente", () => {
    expect(
      lerConfigAnalytics({ VITE_UMAMI_SRC: "   ", VITE_UMAMI_WEBSITE_ID: "abc" })
    ).toBeNull();
    expect(
      lerConfigAnalytics({ VITE_UMAMI_SRC: "https://u.test", VITE_UMAMI_WEBSITE_ID: "" })
    ).toBeNull();
  });

  it("com as duas → { src, websiteId }", () => {
    expect(
      lerConfigAnalytics({ VITE_UMAMI_SRC: "https://u.test", VITE_UMAMI_WEBSITE_ID: "abc" })
    ).toEqual({ src: "https://u.test", websiteId: "abc" });
  });

  it("src com barra final sai sem a barra", () => {
    expect(
      lerConfigAnalytics({ VITE_UMAMI_SRC: "https://u.test/", VITE_UMAMI_WEBSITE_ID: "abc" }).src
    ).toBe("https://u.test");
  });
});

describe("iniciarAnalytics", () => {
  it("config null → false e nenhuma tag", () => {
    expect(iniciarAnalytics(null)).toBe(false);
    expect(tags().length).toBe(0);
  });

  it("injeta uma tag defer com src e data-website-id no head", () => {
    expect(iniciarAnalytics(CONFIG)).toBe(true);
    expect(tags().length).toBe(1);
    const tag = tags()[0];
    expect(tag.defer).toBe(true);
    expect(tag.src).toBe("https://umami.test/script.js");
    expect(tag.getAttribute("data-website-id")).toBe("abc-123");
    expect(tag.parentElement).toBe(document.head);
  });

  it("segunda chamada não duplica e devolve true", () => {
    iniciarAnalytics(CONFIG);
    expect(iniciarAnalytics(CONFIG)).toBe(true);
    expect(tags().length).toBe(1);
  });

  it("doc que lança → false, sem propagar", () => {
    const doc = {
      querySelector: () => null,
      createElement: () => {
        throw new Error("boom");
      },
    };
    expect(iniciarAnalytics(CONFIG, doc)).toBe(false);
  });
});

describe("montarDadosSessao", () => {
  it("user null → null", () => {
    expect(montarDadosSessao(null)).toBeNull();
  });

  it("usuário de município → municipio_id e papel", () => {
    expect(
      montarDadosSessao({
        id: 9,
        nome: "Ana",
        email: "ana@x.gov.br",
        municipio_id: 7,
        role: "VISUALIZADOR",
        ativo: true,
      })
    ).toEqual({ municipio_id: 7, papel: "VISUALIZADOR" });
  });

  it("ADMIN_GLOBAL (sem município) → só papel", () => {
    expect(
      montarDadosSessao({
        id: 1,
        nome: "Admin",
        email: "a@x",
        municipio_id: null,
        role: "ADMIN_GLOBAL",
        ativo: true,
      })
    ).toEqual({ papel: "ADMIN_GLOBAL" });
  });

  it("nunca sai chave fora de CHAVES_SESSAO (id, nome, email somem)", () => {
    const dados = montarDadosSessao({
      id: 9,
      nome: "Ana",
      email: "ana@x",
      municipio_id: 7,
      role: "VISUALIZADOR",
      ativo: true,
      extra: "x",
    });
    for (const k of Object.keys(dados)) {
      expect(CHAVES_SESSAO).toContain(k);
    }
  });

  it("usuário sem nada aproveitável → null", () => {
    expect(montarDadosSessao({ id: 2, nome: "X", email: "x@x" })).toBeNull();
  });
});

describe("identificarSessao", () => {
  const DADOS = { municipio_id: 7, papel: "VISUALIZADOR" };

  it("com window.umami presente → identify com os dados", () => {
    window.umami = { identify: vi.fn() };
    identificarSessao(DADOS);
    expect(window.umami.identify).toHaveBeenCalledTimes(1);
    expect(window.umami.identify).toHaveBeenCalledWith(DADOS);
  });

  it("antes do load → pendente; após load com umami → chama uma vez", () => {
    iniciarAnalytics(CONFIG);
    identificarSessao(DADOS);
    window.umami = { identify: vi.fn() };
    expect(window.umami.identify).not.toHaveBeenCalled();
    tags()[0].dispatchEvent(new Event("load"));
    expect(window.umami.identify).toHaveBeenCalledTimes(1);
    expect(window.umami.identify).toHaveBeenCalledWith(DADOS);
  });

  it("script falhou (error) e load sem umami → nada acontece, sem lançar", () => {
    iniciarAnalytics(CONFIG);
    identificarSessao(DADOS);
    expect(() => {
      tags()[0].dispatchEvent(new Event("error"));
      tags()[0].dispatchEvent(new Event("load"));
    }).not.toThrow();
    expect(window.umami).toBeUndefined();
  });

  it("sem tag e sem umami → no-op", () => {
    expect(() => identificarSessao(DADOS)).not.toThrow();
  });

  it("umami sem identify (tracker antigo) → não lança", () => {
    window.umami = {};
    expect(() => identificarSessao(DADOS)).not.toThrow();
  });

  it("identify que lança → não propaga", () => {
    window.umami = {
      identify: () => {
        throw new Error("boom");
      },
    };
    expect(() => identificarSessao(DADOS)).not.toThrow();
  });

  it("dados null → no-op", () => {
    window.umami = { identify: vi.fn() };
    identificarSessao(null);
    expect(window.umami.identify).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/services/analytics.test.js`
Expected: FAIL com `Failed to resolve import "./analytics"` (arquivo não existe).

- [ ] **Step 3: Implementar o loader**

Criar `src/services/analytics.js`:

```js
// Loader do Umami (analytics de uso). Gêmeo de frontend/src/lib/analytics.js
// no repo do LEGIS (github.com/Uaiizi/camara) — mudou aqui, mude lá. A única
// diferença legítima entre os dois é montarDadosSessao, que lê os campos do
// /auth/me de cada app.
// Spec: docs/superpowers/specs/2026-10-05-umami-analytics-compartilhado-design.md
//
// Regras: sem as duas variáveis VITE_UMAMI_* nada é injetado (dev local nunca
// rastreia); o módulo não guarda estado (dedupe e fila usam o DOM); nenhuma
// função lança — analytics é best-effort e nunca pode quebrar o app.

export const CHAVES_SESSAO = ["municipio_id", "municipio", "papel"];

const SELETOR_SCRIPT = "script[data-website-id]";

export function lerConfigAnalytics(env) {
  const src = String(env?.VITE_UMAMI_SRC ?? "")
    .trim()
    .replace(/\/+$/, "");
  const websiteId = String(env?.VITE_UMAMI_WEBSITE_ID ?? "").trim();
  if (!src || !websiteId) return null;
  return { src, websiteId };
}

export function iniciarAnalytics(config, doc = document) {
  if (!config) return false;
  try {
    if (doc.querySelector(SELETOR_SCRIPT)) return true;
    const tag = doc.createElement("script");
    tag.defer = true;
    tag.src = `${config.src}/script.js`;
    tag.setAttribute("data-website-id", config.websiteId);
    doc.head.appendChild(tag);
    return true;
  } catch {
    return false; // analytics nunca quebra o app
  }
}

// /auth/me do NID: { id, nome, email, municipio_id, role, ativo }.
// Só município e papel saem; id/nome/email nunca.
export function montarDadosSessao(user) {
  if (!user) return null;
  const dados = {};
  if (user.municipio_id != null) dados.municipio_id = user.municipio_id;
  if (user.role) dados.papel = user.role;
  return Object.keys(dados).length ? dados : null;
}

function chamarIdentify(win, dados) {
  if (win.umami && typeof win.umami.identify === "function") {
    win.umami.identify(dados);
    return true;
  }
  return false;
}

export function identificarSessao(dados, doc = document, win = window) {
  if (!dados) return;
  try {
    if (chamarIdentify(win, dados)) return;
    const tag = doc.querySelector(SELETOR_SCRIPT);
    if (!tag) return;
    tag.addEventListener(
      "load",
      () => {
        try {
          chamarIdentify(win, dados);
        } catch {
          // best-effort
        }
      },
      { once: true }
    );
  } catch {
    // best-effort: analytics nunca quebra o app
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/services/analytics.test.js`
Expected: PASS, 22 testes. Se o jsdom logar `Error: Could not load script: "https://umami.test/script.js"` no console, é ruído do carregador de recursos do jsdom e não falha o teste; os testes continuam verdes.

- [ ] **Step 5: Lint do arquivo novo**

Run: `npx eslint src/services/analytics.js src/services/analytics.test.js`
Expected: nenhum erro.

- [ ] **Step 6: Commit**

```bash
git add src/services/analytics.js src/services/analytics.test.js
git commit -m "feat(analytics): loader do Umami com identify por municipio e papel (sem PII)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Ligar o loader em `main.jsx` e a identificação no `AuthProvider`

**Files:**
- Modify: `frontend-observatorio/src/main.jsx`
- Modify: `frontend-observatorio/src/context/AuthContext.jsx`
- Test: `frontend-observatorio/src/context/AuthContext.test.jsx` (arquivo existente; adicionar um `describe`)

**Interfaces:**
- Consumes (Task 1): `lerConfigAnalytics(env)`, `iniciarAnalytics(config)`, `montarDadosSessao(user)`, `identificarSessao(dados)`.
- Produces: nada novo exportado. Comportamento: toda vez que `user` muda para um objeto, `identificarSessao(montarDadosSessao(user))` é chamada; com `user = null` nada é chamado.

- [ ] **Step 1: Escrever os testes (falhando)**

Em `src/context/AuthContext.test.jsx`, o arquivo hoje começa assim:

```js
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthProvider, useAuth } from "./AuthContext";
import api from "../services/api";

vi.mock("../services/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));
```

Trocar esse cabeçalho por (adiciona `fireEvent`, o mock parcial do analytics e o import de `identificarSessao`):

```js
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AuthProvider, useAuth } from "./AuthContext";
import api from "../services/api";
import { identificarSessao } from "../services/analytics";

vi.mock("../services/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

// Mock parcial: montarDadosSessao segue real (é o que queremos testar junto),
// só identificarSessao vira spy para não depender do DOM do tracker.
vi.mock("../services/analytics", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, identificarSessao: vi.fn() };
});
```

E acrescentar ao FINAL do arquivo:

```js
function ProbeLogin() {
  const { user, loading, login, logout } = useAuth();
  if (loading) return <div>carregando</div>;
  return (
    <div>
      <div>{user ? user.nome : "sem-user"}</div>
      <button onClick={() => login("b@x.gov.br", "senha")}>entrar</button>
      <button onClick={logout}>sair</button>
    </div>
  );
}

describe("AuthContext — identificação da sessão no analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem("access_token");
  });

  it("identifica a sessão com municipio_id e papel após o /auth/me (sem PII)", async () => {
    localStorage.setItem("access_token", "token-valido");
    api.get.mockResolvedValueOnce({
      data: {
        data: {
          id: 9,
          nome: "Ana",
          email: "ana@x.gov.br",
          municipio_id: 7,
          role: "VISUALIZADOR",
          ativo: true,
        },
      },
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await screen.findByText("Ana");
    expect(identificarSessao).toHaveBeenCalledTimes(1);
    expect(identificarSessao).toHaveBeenCalledWith({ municipio_id: 7, papel: "VISUALIZADOR" });
  });

  it("sem token não identifica nada", async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await screen.findByText("sem-user");
    expect(identificarSessao).not.toHaveBeenCalled();
  });

  it("logout e login como outro usuário identificam de novo com os dados novos", async () => {
    localStorage.setItem("access_token", "token-valido");
    api.get.mockResolvedValueOnce({
      data: { data: { id: 9, nome: "Ana", email: "ana@x", municipio_id: 7, role: "VISUALIZADOR", ativo: true } },
    });

    render(
      <AuthProvider>
        <ProbeLogin />
      </AuthProvider>
    );
    await screen.findByText("Ana");
    expect(identificarSessao).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("sair"));
    await screen.findByText("sem-user");
    expect(identificarSessao).toHaveBeenCalledTimes(1); // user null não identifica

    api.post.mockResolvedValueOnce({ data: { access_token: "token-2" } });
    api.get.mockResolvedValueOnce({
      data: { data: { id: 3, nome: "Bia", email: "b@x", municipio_id: 12, role: "ADMIN_MUNICIPIO", ativo: true } },
    });
    fireEvent.click(screen.getByText("entrar"));
    await screen.findByText("Bia");

    expect(identificarSessao).toHaveBeenCalledTimes(2);
    expect(identificarSessao).toHaveBeenLastCalledWith({ municipio_id: 12, papel: "ADMIN_MUNICIPIO" });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/context/AuthContext.test.jsx`
Expected: os 2 testes antigos passam; os 3 novos falham com `expected "spy" to be called 1 times, but got 0 times` (o `AuthProvider` ainda não chama `identificarSessao`).

- [ ] **Step 3: Ligar o loader em `main.jsx`**

`src/main.jsx` hoje:

```js
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import { ViewAsProvider } from "./context/ViewAsContext.jsx";

createRoot(document.getElementById("root")).render(
```

Passa a:

```js
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import { ViewAsProvider } from "./context/ViewAsContext.jsx";
import { iniciarAnalytics, lerConfigAnalytics } from "./services/analytics.js";

// Umami: só injeta o tracker quando VITE_UMAMI_SRC e VITE_UMAMI_WEBSITE_ID
// existem no build (Railway). Em dev as vars não existem → nada é enviado.
iniciarAnalytics(lerConfigAnalytics(import.meta.env));

createRoot(document.getElementById("root")).render(
```

O restante do arquivo (a árvore de providers) fica igual.

- [ ] **Step 4: Identificar a sessão no `AuthProvider`**

Em `src/context/AuthContext.jsx`:

Linha 1-2 hoje:

```js
import { createContext, useContext, useState, useEffect } from "react";
import api from "../services/api";
```

Passam a:

```js
import { createContext, useContext, useState, useEffect } from "react";
import api from "../services/api";
import { identificarSessao, montarDadosSessao } from "../services/analytics";
```

Logo após o `useEffect` existente que faz o bootstrap do `/auth/me` (termina em `}, []);`) e ANTES de `const login = async (email, senha) => {`, inserir:

```js
  // Analytics (Umami): anexa municipio_id e papel à sessão anônima quando o
  // usuário fica conhecido (login ou sessão restaurada). Sem PII — ver
  // montarDadosSessao. Com user null não envia nada.
  useEffect(() => {
    const dados = montarDadosSessao(user);
    if (dados) identificarSessao(dados);
  }, [user]);
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/context/AuthContext.test.jsx`
Expected: PASS, 5 testes.

- [ ] **Step 6: Suite completa + lint dos arquivos tocados**

Run: `npx vitest run`
Expected: PASS (460 + 22 + 3 = 485 testes; o número exato pode variar se outra frente mexeu na suite, mas zero falhas).

Run: `npx eslint src/main.jsx src/context/AuthContext.jsx src/context/AuthContext.test.jsx`
Expected: nenhum erro novo (a regra `react-refresh/only-export-components` já reclamava de `AuthContext.jsx` exportar componente + hook antes desta frente; isso não é novo).

- [ ] **Step 7: Commit**

```bash
git add src/main.jsx src/context/AuthContext.jsx src/context/AuthContext.test.jsx
git commit -m "feat(analytics): inicia o Umami no main e identifica a sessao no AuthProvider

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Dockerfile com `ARG`/`ENV` das variáveis e README

**Files:**
- Modify: `frontend-observatorio/Dockerfile` (bloco "Vite bakes env vars at build time")
- Modify: `README.md` (raiz do repo; seções "Frontend environment variables" ~linha 431 e "Local Frontend Development" ~linha 507)

**Interfaces:**
- Consumes: nomes `VITE_UMAMI_SRC` e `VITE_UMAMI_WEBSITE_ID` (Task 1).
- Produces: build da Railway passa a repassar as duas vars ao `npm run build`.

- [ ] **Step 1: Dockerfile**

Em `frontend-observatorio/Dockerfile`, o bloco hoje é:

```dockerfile
# Vite bakes env vars at build time — declare as ARG so Railway passes them through
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
```

Passa a:

```dockerfile
# Vite bakes env vars at build time — declare as ARG so Railway passes them through
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# Umami (analytics de uso). Opcionais: sem as duas, o app nao rastreia.
# Ver docs/analytics-umami.md.
ARG VITE_UMAMI_SRC
ARG VITE_UMAMI_WEBSITE_ID
ENV VITE_UMAMI_SRC=$VITE_UMAMI_SRC
ENV VITE_UMAMI_WEBSITE_ID=$VITE_UMAMI_WEBSITE_ID
```

- [ ] **Step 2: Confirmar que o build local continua passando sem as vars**

Run: `npm run build`
Expected: build conclui (`✓ built in …`), sem referência a Umami no output. Depois: `grep -c "data-website-id" dist/assets/*.js` deve retornar pelo menos 1 (o loader está no bundle, mas só injeta com as vars).

- [ ] **Step 3: README — Railway**

Em `README.md` (raiz), a seção hoje é:

````markdown
### Frontend environment variables

```
VITE_API_BASE_URL=https://your-backend.up.railway.app/api/v1
```
````

Passa a:

````markdown
### Frontend environment variables

```
VITE_API_BASE_URL=https://your-backend.up.railway.app/api/v1
# Optional — usage analytics (shared Umami instance). Omit both to disable tracking.
VITE_UMAMI_SRC=https://umami-production-xxxx.up.railway.app
VITE_UMAMI_WEBSITE_ID=<website id "NID" in Umami>
```

Umami setup, website IDs and verification: see [`docs/analytics-umami.md`](docs/analytics-umami.md).
````

- [ ] **Step 4: README — dev local**

Na seção "Local Frontend Development", após o bloco:

````markdown
```env
VITE_API_BASE_URL=http://localhost:8000/api/v1
```
````

acrescentar a linha:

```markdown
Do **not** set `VITE_UMAMI_*` locally — without them the app never sends analytics.
```

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/Dockerfile README.md
git commit -m "build(analytics): ARG/ENV VITE_UMAMI_* no Dockerfile do frontend e README

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

(Rodar `git add`/`git commit` a partir da raiz do repo, `C:\Users\lucas\Documents\projetos\dashboard_prefeituras`.)

---

### Task 4: Runbook `docs/analytics-umami.md` e seção LGPD

**Files:**
- Create: `docs/analytics-umami.md`
- Modify: `docs/lgpd.md` (parágrafo "Delimitação" da seção 2; nova seção 8 ao final)

**Interfaces:**
- Consumes: nomes das vars e regras de payload (Task 1), passos do Dockerfile (Task 3).
- Produces: documento operacional canônico referenciado pelo repo do LEGIS.

- [ ] **Step 1: Criar o runbook**

Criar `docs/analytics-umami.md` com este conteúdo:

````markdown
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

## 4. Verificar

1. Abrir o app logado → Umami → website → **Realtime** mostra 1 visitante e a página atual.
2. Trocar de rota dentro do app → novo pageview no Realtime (o tracker captura `pushState`).
3. Umami → **Sessions** → abrir a sessão → aba **Properties** mostra `municipio_id` e `papel`
   (no LEGIS, também `municipio`).
4. Em dev local (`npm run dev`), no console do navegador:
   `document.querySelector('script[data-website-id]')` devolve `null` e a aba Network não tem
   request para o domínio do Umami.

## 5. Operação

- **URL do Umami mudou** (domínio regenerado ou domínio próprio no futuro): atualizar
  `VITE_UMAMI_SRC` nos dois frontends e redeployar os dois.
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
(no LEGIS) nome do município. O conjunto de chaves permitidas está em `CHAVES_SESSAO` em
`frontend-observatorio/src/services/analytics.js` e é verificado por teste. Base LGPD em
`docs/lgpd.md`, seção 8.
````

- [ ] **Step 2: LGPD — delimitação na seção 2**

Em `docs/lgpd.md`, o parágrafo "Delimitação" da seção 2 termina hoje com:

```markdown
do Brasil, sem quadro societário e sem CPF de sócios ou representantes.
```

Acrescentar, no mesmo parágrafo, logo após essa frase:

```markdown
A medição de uso das telas (analytics, seção 8) também não trata dados
pessoais.
```

- [ ] **Step 3: LGPD — nova seção 8**

Ao final de `docs/lgpd.md` (após o último parágrafo da seção 7), acrescentar:

```markdown

## 8. Analytics de uso (Umami)

A plataforma mede o uso das telas por meio de uma instância própria do
Umami, software de analytics de código aberto, hospedada pela operadora na
Railway e compartilhada com a plataforma Inteligência Legislativa (LEGIS). O
objetivo é saber quais páginas e módulos são utilizados, por quais municípios
e papéis de acesso, para orientar a evolução do produto.

Esse tratamento não envolve dados pessoais:

- Não são utilizados cookies nem identificadores persistentes no navegador.
- O endereço IP do visitante não é armazenado: o Umami o utiliza apenas para
  compor um hash de sessão com salt rotacionado diariamente e o descarta.
- A sessão recebe apenas o identificador numérico do município de vínculo e o
  papel de acesso do usuário (por exemplo, `VISUALIZADOR`). Identificador do
  usuário, nome e e-mail nunca são enviados, e a sessão não é associada a um
  identificador único de pessoa.
- Município é ente público e papel de acesso é atributo funcional; nenhum dos
  dois permite identificar uma pessoa natural.

Por não conter dado pessoal, os registros de analytics ficam fora dos prazos
de retenção da seção 4, que se aplicam exclusivamente à trilha de auditoria.
O rastreio existe apenas no build de produção; em ambiente de desenvolvimento
nada é enviado. Detalhes operacionais em `docs/analytics-umami.md`.
```

- [ ] **Step 4: Conferir que nada no código contradiz o doc**

Run (na raiz do repo): `grep -n "email\|nome" frontend-observatorio/src/services/analytics.js`
Expected: só aparecem em comentários (a linha `// /auth/me do NID: { id, nome, email, ... }` e `// Só município e papel saem; id/nome/email nunca.`); nenhuma atribuição `dados.email`/`dados.nome`.

- [ ] **Step 5: Commit**

```bash
git add docs/analytics-umami.md docs/lgpd.md
git commit -m "docs(analytics): runbook do Umami compartilhado e secao LGPD de analytics de uso

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Depois do plano (fora das tasks, feito pelo usuário)

1. Subir `uaizi-analytics` na Railway seguindo `docs/analytics-umami.md` §1-2.
2. Setar `VITE_UMAMI_SRC` e `VITE_UMAMI_WEBSITE_ID` no serviço frontend do NID → redeploy.
3. Verificar conforme §4 do runbook.
4. Executar o plano gêmeo do LEGIS em `C:\Users\lucas\Documents\projetos\camara\docs\superpowers\plans\2026-10-05-umami-analytics-legis.md`.
