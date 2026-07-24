# Notificações: Página "Todas" + Datas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página `/app/notificacoes` com data/hora completa, filtro Todas/Não lidas e marcar lida; botão do sino passa a navegar para ela.

**Architecture:** Zero backend — `GET /notificacoes` já devolve tudo. Helpers de API compartilhados (`notificacoesApi.js`) consumidos pelo sino e pela página nova; sino ganha a navegação e perde o bloco morto da tag `dataset`.

**Tech Stack:** React + Vite + react-router-dom; vitest + `npm run build` como gates.

**Spec:** `docs/superpowers/specs/2026-07-23-notificacoes-pagina-todas-design.md`

## Global Constraints

- Branch de trabalho: `feat/notificacoes-pagina` a partir de `main`.
- ZERO mudança de backend.
- Sino: tempo relativo (`timeAgo`) fica COMO ESTÁ (decisão do usuário); apenas o botão do rodapé ganha ação, os handlers passam a usar os helpers e o bloco `n.dataset` morto sai.
- Página: data/hora absoluta via `toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })` → "23/07/2026, 14:32".
- Payload de notificação (campos reais do `NotificacaoOut`): `{id, titulo, mensagem, tipo, municipio_ids, criado_em, expira_em, lida}` — NÃO existe `dataset`.
- Rota `/app/notificacoes` filha do `DashboardLayout` (ProtectedRoute), sem gating de plano nem de permissão.
- Gates: de `frontend-observatorio/`: `npx vitest run` e `npm run build` → exit 0. eslint baseline sujo (falsos-positivos conhecidos "motion unused"/set-state-in-effect — ignorar só esses).
- Commits em pt-BR `feat(escopo): descrição`. Não tocar/commitar: `.claude/settings.local.json`, `dados/`, `docs/superpowers/plans/2026-05-06-ips-feature.md` (WIP do usuário).

---

### Task 1: Helpers compartilhados + sino navega e perde código morto

**Files:**
- Create: `frontend-observatorio/src/services/notificacoesApi.js`
- Modify: `frontend-observatorio/src/components/NotificationBell.jsx` (imports linhas 1-3; handlers linhas 51-58 e 90-107; rodapé linha 189; bloco morto linhas 176-180)

**Interfaces:**
- Consumes: `api` (axios instance existente).
- Produces (Task 2 consome):
  - `fetchNotificacoes() -> Promise<Notificacao[]>` (lança em erro — quem chama decide silent/toast)
  - `marcarLida(id) -> Promise<void>`
  - `marcarTodasLidas(notifs) -> Promise<void>` (POST por item não lido, erros individuais engolidos)

- [ ] **Step 1: Criar a branch**

```powershell
git checkout -b feat/notificacoes-pagina
```

- [ ] **Step 2: Criar `frontend-observatorio/src/services/notificacoesApi.js`**

```js
import api from "./api";

export async function fetchNotificacoes() {
  const res = await api.get("/notificacoes");
  return res.data || [];
}

export async function marcarLida(id) {
  await api.post(`/notificacoes/${id}/marcar_lida`);
}

export async function marcarTodasLidas(notifs) {
  const naoLidas = notifs.filter((n) => !n.lida);
  await Promise.all(
    naoLidas.map((n) => api.post(`/notificacoes/${n.id}/marcar_lida`).catch(() => {}))
  );
}
```

- [ ] **Step 3: Rewire `NotificationBell.jsx`**

1. Imports (linhas 1-3):

```jsx
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { fetchNotificacoes, marcarLida, marcarTodasLidas } from "../services/notificacoesApi";
```

(remover o import de `api` — não é mais usado direto.)

2. No componente, adicionar `const navigate = useNavigate();` junto aos hooks.

3. `fetchNotifs` (linhas 51-58) vira:

```jsx
  const fetchNotifs = async () => {
    try {
      setNotifs(await fetchNotificacoes());
    } catch {
      // silent fail
    }
  };
```

4. `markLida` (linhas 90-97) vira:

```jsx
  const markLida = async (id) => {
    try {
      await marcarLida(id);
      setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, lida: true } : n)));
    } catch {
      // silent fail
    }
  };
```

5. `markAllLida` (linhas 99-107) vira:

```jsx
  const markAllLida = async () => {
    await marcarTodasLidas(notifs);
    setNotifs((prev) => prev.map((n) => ({ ...n, lida: true })));
  };
```

6. Remover o bloco morto (linhas 176-180):

```jsx
                      {n.dataset && (
                        <span className="nid-bell-tag">
                          {String(n.dataset).toUpperCase()}
                        </span>
                      )}
```

7. Botão do rodapé (linha 189) vira:

```jsx
            <button
              className="nid-bell-link"
              onClick={() => { setOpen(false); navigate("/app/notificacoes"); }}
            >
              Ver todas as notificações →
            </button>
```

- [ ] **Step 4: Gates**

De `frontend-observatorio/`:

```powershell
npx vitest run
npm run build
```

Expected: exit 0 nos dois.

- [ ] **Step 5: Commit**

```powershell
git add frontend-observatorio/src/services/notificacoesApi.js frontend-observatorio/src/components/NotificationBell.jsx
git commit -m "feat(notificacoes): helpers compartilhados e botao do sino navega p/ pagina"
```

---

### Task 2: Página "Todas as notificações" + rota

**Files:**
- Create: `frontend-observatorio/src/pages/notificacoes/NotificacoesPage.jsx`
- Modify: `frontend-observatorio/src/app/router/AppRouter.jsx` (import + rota filha de `/app`, junto às linhas 92-124)

**Interfaces:**
- Consumes: `fetchNotificacoes`/`marcarLida`/`marcarTodasLidas` (Task 1), `NidTabBar` (componente existente `src/components/nid/NidTabBar.jsx`, props `{tabs: [{key,label,count}], value, onChange, ariaLabel}`), `useToast`.
- Produces: rota `/app/notificacoes`.

- [ ] **Step 1: Criar `frontend-observatorio/src/pages/notificacoes/NotificacoesPage.jsx`**

```jsx
import { useEffect, useMemo, useState } from "react";
import { BellIcon } from "@heroicons/react/24/outline";
import { fetchNotificacoes, marcarLida, marcarTodasLidas } from "../../services/notificacoesApi";
import { useToast } from "../../context/ToastContext";
import NidTabBar from "../../components/nid/NidTabBar";

// Mesmo mapeamento visual do sino (NotificationBell.jsx)
const KIND_CLASS = {
  info: "info",
  warning: "down",
  alert: "down",
  up: "up",
  down: "down",
};

const KIND_GLYPH = {
  up: "↗",
  down: "↘",
  info: "i",
  warning: "!",
  alert: "!",
};

function fmtDataHora(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function NotificacoesPage() {
  const { addToast } = useToast();
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("todas");

  useEffect(() => {
    fetchNotificacoes()
      .then(setNotifs)
      .catch(() => addToast("Erro ao carregar notificações", "error"))
      .finally(() => setLoading(false));
  }, []);

  const naoLidas = useMemo(() => notifs.filter((n) => !n.lida), [notifs]);
  const visiveis = filtro === "nao_lidas" ? naoLidas : notifs;

  async function handleMarcarLida(n) {
    if (n.lida) return;
    try {
      await marcarLida(n.id);
      setNotifs((prev) => prev.map((x) => (x.id === n.id ? { ...x, lida: true } : x)));
    } catch {
      addToast("Erro ao marcar como lida", "error");
    }
  }

  async function handleMarcarTodas() {
    try {
      await marcarTodasLidas(notifs);
      setNotifs((prev) => prev.map((n) => ({ ...n, lida: true })));
      addToast("Todas marcadas como lidas", "success");
    } catch {
      addToast("Erro ao marcar notificações", "error");
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5" style={{ maxWidth: 760 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", margin: 0 }}>
            Todas as notificações
          </h1>
          <p style={{ fontSize: 12, color: "var(--text-dim)", margin: "4px 0 0" }}>
            {naoLidas.length > 0 ? `${naoLidas.length} não lida(s)` : "Tudo em dia"}
          </p>
        </div>
        {naoLidas.length > 0 && (
          <button onClick={handleMarcarTodas} className="nid-bell-mark">
            Marcar tudo como lido
          </button>
        )}
      </div>

      <NidTabBar
        tabs={[
          { key: "todas", label: "Todas", count: notifs.length },
          { key: "nao_lidas", label: "Não lidas", count: naoLidas.length },
        ]}
        value={filtro}
        onChange={setFiltro}
        ariaLabel="Filtrar notificações"
      />

      {visiveis.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 0", color: "var(--text-dim)" }}>
          <BellIcon style={{ width: 40, height: 40, margin: "0 auto 12px", opacity: 0.3 }} />
          <p style={{ fontSize: 13, margin: 0 }}>
            {filtro === "nao_lidas" ? "Nenhuma notificação não lida." : "Nenhuma notificação."}
          </p>
        </div>
      ) : (
        <div className="nid-panel" style={{ padding: 0, overflow: "hidden" }}>
          {visiveis.map((n, i) => {
            const kindClass = KIND_CLASS[n.tipo] || "info";
            const glyph = KIND_GLYPH[n.tipo] || "i";
            return (
              <div
                key={n.id}
                className={`nid-bell-item ${!n.lida ? "unread" : ""}`}
                onClick={() => handleMarcarLida(n)}
                style={{
                  cursor: n.lida ? "default" : "pointer",
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                }}
              >
                <div className={`nid-bell-mk ${kindClass}`}>{glyph}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="nid-bell-row">
                    <div className="nid-bell-item-title">{n.titulo}</div>
                    <div className="nid-bell-time">{fmtDataHora(n.criado_em)}</div>
                  </div>
                  <div className="nid-bell-text" style={{ whiteSpace: "pre-line" }}>
                    {n.mensagem}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

Nota: as classes `nid-bell-item`/`nid-bell-mk`/`nid-bell-row`/`nid-bell-item-title`/`nid-bell-time`/`nid-bell-text`/`nid-bell-mark` são as mesmas do painel do sino — conferir no CSS (`themes.css` ou onde estiverem) que funcionam fora do `.nid-bell-panel`; se algum estilo depender do container do painel, replicar o mínimo necessário inline e anotar no report.

- [ ] **Step 2: Rota no `AppRouter.jsx`**

Import junto aos demais:

```jsx
import NotificacoesPage from "../../pages/notificacoes/NotificacoesPage";
```

Rota filha de `/app` (junto às linhas 92-124, ex.: após `releases`):

```jsx
          <Route path="notificacoes" element={<NotificacoesPage />} />
```

- [ ] **Step 3: Gates**

De `frontend-observatorio/`:

```powershell
npx vitest run
npm run build
```

Expected: exit 0 nos dois.

- [ ] **Step 4: Commit**

```powershell
git add frontend-observatorio/src/pages/notificacoes/NotificacoesPage.jsx frontend-observatorio/src/app/router/AppRouter.jsx
git commit -m "feat(notificacoes): pagina todas as notificacoes com filtro e datas"
```

---

### Task 3: Verificação final

**Files:** nenhum novo.

- [ ] **Step 1: Gates completos**

De `frontend-observatorio/`: `npx vitest run` e `npm run build` → exit 0.
De `backend/`: `..\venv\Scripts\python.exe -m pytest tests -q` → exit 0 (sanidade — nada de backend mudou).

- [ ] **Step 2: Verificação de fiação (grep)**

```powershell
# botão do sino navega:
Select-String -Path frontend-observatorio/src/components/NotificationBell.jsx -Pattern "navigate|dataset"
# rota existe:
Select-String -Path frontend-observatorio/src/app/router/AppRouter.jsx -Pattern "notificacoes"
```

Expected: `navigate("/app/notificacoes")` presente; NENHUMA ocorrência de `dataset` no sino; rota + import presentes.

- [ ] **Step 3: Checklist visual (fica para o usuário)**

Sino → "Ver todas" → página abre; filtro alterna; clique marca lida (badge do sino atualiza no próximo poll); "Marcar tudo" zera; datas completas visíveis.

- [ ] **Step 4: Ledger**

Registrar conclusão no `.superpowers/sdd/progress.md`.
