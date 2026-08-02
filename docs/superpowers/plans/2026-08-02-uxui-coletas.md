# UX da tela de coletas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reestruturar `DatasetFontesAdminPage` no padrão nid: chips de status, modal de detalhes do job com erro completo, hierarquia de botões com `--admin-accent`, fontes em DataTable, NidModal no lugar de `confirm()`, copy nova.

**Architecture:** Helpers puros extraídos para `src/utils/jobStatus.js` (testáveis com vitest — projeto só testa utils, sem testing-library). Modal de detalhes em componente próprio `DatasetFontesJobModal.jsx`. A página consome ambos. CSS novo mínimo em `themes.css` (variante `.nid-pill--run`).

**Tech Stack:** React 19, vitest 2 (`npm test` em `frontend-observatorio/`), classes utilitárias Tailwind + tokens CSS do tema (`themes.css`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-02-uxui-coletas-design.md`.
- Zero mudança de endpoint/polling (3 s) — só apresentação.
- Zero cor hardcoded nova: usar `var(--admin-accent, #3b82f6)`, tokens `--panel/--border/--text*` e as classes `.nid-pill--ok/warn/err` existentes (themes.css:417-419).
- Botão secundário padrão do admin (referência DatasetsAdminPage): fundo `color-mix(in oklab, var(--admin-accent, #3b82f6) 12%, transparent)`, borda 35%, texto accent.
- Testes: `npm test` (vitest run) em `frontend-observatorio/`; lint `npm run lint`.
- Commits `feat(uxui): ...` com trailer padrão do projeto.

---

### Task 1: `jobStatus.js` — helpers puros + testes (TDD)

**Files:**
- Create: `frontend-observatorio/src/utils/jobStatus.js`
- Test: `frontend-observatorio/src/utils/jobStatus.test.js`

**Interfaces:**
- Produces:
  - `chipDoJob(job) -> { label: string, pill: string }` — pill é classe CSS (`nid-pill--ok|warn|err|run` ou `""`)
  - `labelStatus(status) -> string`
  - `duracaoJob(job) -> string` (movido da página, mesma lógica)
  - `resumoTodas(resumo) -> {fontes, ok, aviso, erro, keysErro, linhas}` (movido)
  - `textoResumoTodas(agg) -> string` (movido)
  - `linhasJob(job) -> number|null` — linhas do resumo, tratando meta-job "todas"
  - `DATASET_TODAS = "todas"`, `labelDataset(key)`

- [ ] **Step 1: Escrever os testes que falham**

```js
// frontend-observatorio/src/utils/jobStatus.test.js
import { describe, expect, it } from "vitest";
import {
  chipDoJob, duracaoJob, labelDataset, labelStatus, linhasJob,
  resumoTodas, textoResumoTodas,
} from "./jobStatus";

describe("labelStatus / labelDataset", () => {
  it("traduz status conhecidos e ecoa desconhecidos", () => {
    expect(labelStatus("pendente")).toBe("Na fila");
    expect(labelStatus("executando")).toBe("Executando");
    expect(labelStatus("concluido")).toBe("Concluído");
    expect(labelStatus("erro")).toBe("Erro");
    expect(labelStatus("abortado")).toBe("Abortado");
    expect(labelStatus("outro")).toBe("outro");
  });
  it("labelDataset trata o meta-job", () => {
    expect(labelDataset("todas")).toBe("Todas as fontes");
    expect(labelDataset("caged")).toBe("caged");
  });
});

describe("chipDoJob", () => {
  it("erro e abortado usam pill err", () => {
    expect(chipDoJob({ status: "erro" })).toEqual({ label: "Erro", pill: "nid-pill--err" });
    expect(chipDoJob({ status: "abortado" })).toEqual({ label: "Abortado", pill: "nid-pill--err" });
  });
  it("executando usa pill run; pendente warn", () => {
    expect(chipDoJob({ status: "executando" }).pill).toBe("nid-pill--run");
    expect(chipDoJob({ status: "pendente" }).pill).toBe("nid-pill--warn");
  });
  it("concluido limpo é ok", () => {
    expect(chipDoJob({ status: "concluido", resumo: { linhas: 10, erros: [] } }))
      .toEqual({ label: "Concluído", pill: "nid-pill--ok" });
  });
  it("concluido com erros/municipios_erro vira aviso", () => {
    expect(chipDoJob({ status: "concluido", resumo: { erros: ["x"] } }).pill).toBe("nid-pill--warn");
    expect(chipDoJob({ status: "concluido", resumo: { municipios_erro: 2 } }).label)
      .toBe("Concluído c/ avisos");
  });
  it("meta-job todas com fonte em erro/aviso vira aviso", () => {
    const resumo = { fontes: [{ key: "pib", status: "ok" }, { key: "comex", status: "erro" }] };
    expect(chipDoJob({ status: "concluido", dataset: "todas", resumo }).pill).toBe("nid-pill--warn");
  });
});

describe("duracaoJob / linhasJob / resumoTodas", () => {
  it("duracao formata s e min", () => {
    expect(duracaoJob({ iniciado_em: "2026-08-02T10:00:00Z", finalizado_em: "2026-08-02T10:00:45Z" })).toBe("45s");
    expect(duracaoJob({ iniciado_em: "2026-08-02T10:00:00Z", finalizado_em: "2026-08-02T10:02:05Z" })).toBe("2min 5s");
    expect(duracaoJob({})).toBe("—");
  });
  it("linhasJob soma fontes no meta-job", () => {
    expect(linhasJob({ dataset: "caged", resumo: { linhas: 7 } })).toBe(7);
    expect(linhasJob({
      dataset: "todas",
      resumo: { fontes: [{ linhas: 2 }, { linhas: 3 }] },
    })).toBe(5);
    expect(linhasJob({ dataset: "todas", resumo: null })).toBeNull();
  });
  it("resumoTodas agrega e textoResumoTodas omite zeros", () => {
    const agg = resumoTodas({ fontes: [
      { key: "pib", status: "ok", linhas: 1 },
      { key: "comex", status: "erro", linhas: 0 },
    ] });
    expect(agg.ok).toBe(1);
    expect(agg.erro).toBe(1);
    expect(textoResumoTodas(agg)).toBe("1 ok, 1 com erro (comex)");
  });
});
```

- [ ] **Step 2: Rodar — FAIL**

Run (de `frontend-observatorio/`): `npm test`
Expected: FAIL — `Cannot find module './jobStatus'`

- [ ] **Step 3: Implementar**

```js
// frontend-observatorio/src/utils/jobStatus.js
// Helpers puros de status/resumo dos jobs de ingestão (tela de coletas).
// Extraídos de DatasetFontesAdminPage para teste unitário.

export const DATASET_TODAS = "todas";

const LABELS = {
  pendente: "Na fila",
  executando: "Executando",
  concluido: "Concluído",
  erro: "Erro",
  abortado: "Abortado",
};

const PILLS = {
  pendente: "nid-pill--warn",
  executando: "nid-pill--run",
  concluido: "nid-pill--ok",
  erro: "nid-pill--err",
  abortado: "nid-pill--err",
};

export function labelStatus(status) {
  return LABELS[status] || status;
}

export const labelDataset = (key) =>
  key === DATASET_TODAS ? "Todas as fontes" : key;

export function resumoTodas(resumo) {
  const fontes = resumo?.fontes || [];
  const comErro = fontes.filter((f) => f.status === "erro");
  const comAviso = fontes.filter((f) => f.status === "aviso");
  return {
    fontes,
    ok: fontes.length - comErro.length - comAviso.length,
    aviso: comAviso.length,
    erro: comErro.length,
    keysErro: comErro.map((f) => f.key),
    linhas: fontes.reduce((s, f) => s + (f.linhas || 0), 0),
  };
}

export function textoResumoTodas({ ok, aviso, erro, keysErro }) {
  const partes = [];
  if (ok) partes.push(`${ok} ok`);
  if (aviso) partes.push(`${aviso} com aviso`);
  if (erro) partes.push(`${erro} com erro (${keysErro.slice(0, 3).join(", ")})`);
  return partes.join(", ") || "0 fontes";
}

function temAvisos(job) {
  const r = job.resumo;
  if (!r) return false;
  if (job.dataset === DATASET_TODAS) {
    const agg = resumoTodas(r);
    return agg.erro > 0 || agg.aviso > 0;
  }
  return (r.erros?.length || 0) > 0 || (r.municipios_erro || 0) > 0;
}

/** Chip de status: "concluído" com erros parciais vira aviso (âmbar). */
export function chipDoJob(job) {
  if (job.status === "concluido" && temAvisos(job)) {
    return { label: "Concluído c/ avisos", pill: "nid-pill--warn" };
  }
  return { label: labelStatus(job.status), pill: PILLS[job.status] || "" };
}

export function duracaoJob(job) {
  if (!job?.iniciado_em || !job?.finalizado_em) return "—";
  const s = Math.round((new Date(job.finalizado_em) - new Date(job.iniciado_em)) / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}min${s % 60 ? ` ${s % 60}s` : ""}`;
}

export function linhasJob(job) {
  if (job.dataset === DATASET_TODAS) {
    return job.resumo?.fontes ? resumoTodas(job.resumo).linhas : null;
  }
  return job.resumo?.linhas ?? null;
}
```

- [ ] **Step 4: Rodar — PASS** (`npm test`; suíte inteira verde)

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/utils/jobStatus.js frontend-observatorio/src/utils/jobStatus.test.js
git commit -m "feat(uxui): jobStatus - helpers puros de status/resumo dos jobs de coleta"
```

---

### Task 2: StatusChip + variante CSS `.nid-pill--run`

**Files:**
- Create: `frontend-observatorio/src/components/nid/StatusChip.jsx`
- Modify: `frontend-observatorio/src/styles/themes.css` (após a linha 419, bloco `.nid-pill--err`)

**Interfaces:**
- Consumes: `chipDoJob` (Task 1).
- Produces: `<StatusChip job={job} />` — span `.nid-pill` com a variante e, quando executando, um dot pulsante.

- [ ] **Step 1: CSS** — adicionar em `themes.css` logo após `.nid-pill--err` (linha ~419):

```css
.nid-pill--run     { color: var(--accent-1); background: color-mix(in oklab, var(--accent-1) 14%, transparent); border-color: color-mix(in oklab, var(--accent-1) 28%, transparent); }
.nid-pill__dot     { width: 6px; height: 6px; border-radius: 999px; background: currentColor; animation: nid-pill-pulse 1.2s ease-in-out infinite; }
@keyframes nid-pill-pulse { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }
```

- [ ] **Step 2: Componente**

```jsx
// frontend-observatorio/src/components/nid/StatusChip.jsx
import { chipDoJob } from "../../utils/jobStatus";

/** Chip de status de job de ingestão (cores via tokens .nid-pill--*). */
export default function StatusChip({ job }) {
  if (!job) return null;
  const { label, pill } = chipDoJob(job);
  return (
    <span className={`nid-pill ${pill}`}>
      {job.status === "executando" && <span className="nid-pill__dot" aria-hidden="true" />}
      {label}
    </span>
  );
}
```

- [ ] **Step 3: Verificar build/lint** — `npm run lint` (sem novos erros) e `npm test`.

- [ ] **Step 4: Commit**

```bash
git add frontend-observatorio/src/components/nid/StatusChip.jsx frontend-observatorio/src/styles/themes.css
git commit -m "feat(uxui): StatusChip nid + variante run com dot pulsante"
```

---

### Task 3: Modal de detalhes do job + histórico clicável

**Files:**
- Create: `frontend-observatorio/src/pages/admin/DatasetFontesJobModal.jsx`
- Modify: `frontend-observatorio/src/pages/admin/DatasetFontesAdminPage.jsx`

**Interfaces:**
- Consumes: `NidModal` (props: `open, onClose, eyebrow, title, size, footer, children`), `StatusChip`, helpers de `jobStatus.js`.
- Produces: `<DatasetFontesJobModal job={jobOuNull} onClose={fn} />`; na página, estado `const [jobDetalhe, setJobDetalhe] = useState(null)` e `onClick={() => setJobDetalhe(j)}` nas `<tr>` do histórico.

- [ ] **Step 1: Componente do modal**

```jsx
// frontend-observatorio/src/pages/admin/DatasetFontesJobModal.jsx
import NidModal from "../../components/nid/NidModal";
import StatusChip from "../../components/nid/StatusChip";
import {
  DATASET_TODAS, duracaoJob, labelDataset, linhasJob,
} from "../../utils/jobStatus";

// item do resumo por fonte ({status: "ok"|"aviso"|"erro"}) → shape de job
// que o chipDoJob entende (ok→concluído limpo, aviso→concluído c/ avisos)
const jobDaFonte = (f) =>
  f.status === "erro"
    ? { status: "erro" }
    : { status: "concluido", resumo: f.status === "aviso" ? { erros: ["aviso"] } : {} };

function Filtros({ filtros }) {
  if (!filtros) return <span style={{ color: "var(--text-mute)" }}>—</span>;
  const partes = [];
  if (filtros.municipio_ids?.length) partes.push(`${filtros.municipio_ids.length} município(s)`);
  else if (filtros.estado) partes.push(`UF ${filtros.estado}`);
  else partes.push("Brasil inteiro");
  if (filtros.anos?.length) partes.push(`anos ${filtros.anos.join(", ")}`);
  partes.push(filtros.notificar ? "com notificações" : "sem notificações");
  return <>{partes.join(" · ")}</>;
}

/** Detalhes completos de um job de ingestão: erro sem truncar, filtros,
 * duração e — no meta-job "todas" — o resultado por fonte. */
export default function DatasetFontesJobModal({ job, onClose }) {
  return (
    <NidModal
      open={Boolean(job)}
      onClose={onClose}
      eyebrow="Histórico de coletas"
      title={job ? `${labelDataset(job.dataset)} — job ${job.id}` : ""}
      size="lg"
    >
      {job && (
        <div className="space-y-4 text-sm">
          <div className="flex items-center gap-3 flex-wrap">
            <StatusChip job={job} />
            <span style={{ color: "var(--text-dim)" }}>
              {new Date(job.criado_em).toLocaleString("pt-BR")} · {duracaoJob(job)}
              {linhasJob(job) != null && ` · ${new Intl.NumberFormat("pt-BR").format(linhasJob(job))} linha(s)`}
            </span>
          </div>

          <p style={{ color: "var(--text-dim)" }}>
            <b style={{ color: "var(--text)" }}>Filtros:</b> <Filtros filtros={job.filtros} />
          </p>

          {job.erro && (
            <div
              className="rounded-lg p-3 text-xs whitespace-pre-wrap break-words"
              style={{
                background: "color-mix(in oklab, var(--accent-2) 8%, transparent)",
                border: "1px solid color-mix(in oklab, var(--accent-2) 30%, transparent)",
                color: "var(--text)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {job.erro}
            </div>
          )}

          {job.dataset === DATASET_TODAS && job.resumo?.fontes && (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left" style={{ color: "var(--text-dim)" }}>
                  <th className="py-1.5 pr-3">Fonte</th>
                  <th className="py-1.5 pr-3">Status</th>
                  <th className="py-1.5 pr-3">Linhas</th>
                  <th className="py-1.5">Erros/avisos</th>
                </tr>
              </thead>
              <tbody>
                {job.resumo.fontes.map((f) => (
                  <tr key={f.key} className="align-top" style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="py-1.5 pr-3 font-medium" style={{ color: "var(--text)" }}>{f.key}</td>
                    <td className="py-1.5 pr-3">
                      <StatusChip job={jobDaFonte(f)} />
                    </td>
                    <td className="py-1.5 pr-3" style={{ color: "var(--text-dim)" }}>{f.linhas ?? 0}</td>
                    <td className="py-1.5 whitespace-pre-wrap break-words" style={{ color: "var(--text-dim)" }}>
                      {(f.erros || []).join("; ") || f.erro || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {job.dataset !== DATASET_TODAS && job.resumo?.erros?.length > 0 && (
            <div>
              <p className="font-semibold mb-1" style={{ color: "var(--text)" }}>
                Avisos ({job.resumo.erros.length})
              </p>
              <ul className="space-y-1 text-xs" style={{ color: "var(--text-dim)" }}>
                {job.resumo.erros.map((e, i) => (
                  <li key={i} className="whitespace-pre-wrap break-words">• {e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </NidModal>
  );
}
```

Nota: se `NidModal` não aceitar `size="lg"`, conferir os tamanhos suportados no componente e usar o maior disponível (`md` é o usado nos outros modais do admin).

- [ ] **Step 2: Ligar na página** — em `DatasetFontesAdminPage.jsx`:
  - `import DatasetFontesJobModal from "./DatasetFontesJobModal";`
  - Estado: `const [jobDetalhe, setJobDetalhe] = useState(null);`
  - Nas `<tr>` do histórico: `onClick={() => setJobDetalhe(j)}`, `className="... cursor-pointer"`, `title="Ver detalhes"` e hover sutil (`hover:bg-[var(--panel-2)]`).
  - Substituir o texto de status por `<StatusChip job={j} />` na célula Status.
  - Renderizar `<DatasetFontesJobModal job={jobDetalhe} onClose={() => setJobDetalhe(null)} />` no fim.
  - Remover da página as funções agora importadas de `jobStatus.js` (`labelStatus`, `duracao`→`duracaoJob`, `resumoTodas`, `textoResumoTodas`, `DATASET_TODAS`, `labelDataset`) e atualizar os call-sites (toasts do polling usam as importadas).

- [ ] **Step 3: Verificar** — `npm test` + `npm run lint`; abrir a tela (`npm run dev`) e clicar num job com erro: o erro SSL do comex (job 16) deve aparecer completo no modal.

- [ ] **Step 4: Commit**

```bash
git add frontend-observatorio/src/pages/admin/DatasetFontesJobModal.jsx frontend-observatorio/src/pages/admin/DatasetFontesAdminPage.jsx
git commit -m "feat(uxui): modal de detalhes do job de coleta (erro completo) + historico clicavel"
```

---

### Task 4: Fontes como DataTable + hierarquia de botões accent

**Files:**
- Modify: `frontend-observatorio/src/pages/admin/DatasetFontesAdminPage.jsx`

**Interfaces:**
- Consumes: `DataTable` (`components/nid/DataTable.jsx`; column descriptor `{ key, label, width?, align?, render?, sortable? }` — `render(row, index)` tem precedência total; `sortable: false` desliga a ordenação).
- Produces: seção "Coletas automáticas" com DataTable; progresso inline dentro da célula.

- [ ] **Step 1: Substituir a lista de cards** (bloco `autoFontes.map` atual) por:

```jsx
<DataTable
  columns={[
    {
      key: "label", label: "Fonte", sortable: false,
      render: (f) => (
        <div className="min-w-0 py-0.5">
          <p className="font-semibold" style={{ color: "var(--text)" }}>{f.label}</p>
          <p className="text-xs truncate max-w-[380px]" style={{ color: "var(--text-mute)" }} title={f.fonte}>
            {f.fonte}
          </p>
          {f.key === "captacao_federal" && (
            <p className="text-xs mt-0.5" style={{ color: "var(--accent-4)" }}>
              Compara a UF inteira — prefira o filtro de estado.
            </p>
          )}
        </div>
      ),
    },
    {
      key: "ultimo_job", label: "Última execução", sortable: false, width: 320,
      render: (f) => {
        const rodando = jobAtivo && job.dataset === f.key;
        if (rodando) {
          return (
            <div className="space-y-1 py-0.5">
              <div className="flex items-center gap-2">
                <StatusChip job={job} />
                <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                  {job.progresso_total
                    ? `${job.progresso_atual}/${job.progresso_total}`
                    : "iniciando…"}
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--panel-2)" }}>
                <div
                  className="h-full transition-all"
                  style={{
                    background: "var(--admin-accent, #3b82f6)",
                    width: job.progresso_total
                      ? `${Math.min(100, (100 * job.progresso_atual) / job.progresso_total)}%`
                      : "5%",
                  }}
                />
              </div>
              <p className="text-xs truncate" style={{ color: "var(--text-dim)" }}>{job.etapa || "…"}</p>
            </div>
          );
        }
        if (!f.ultimo_job) {
          return <span className="text-xs" style={{ color: "var(--text-mute)" }}>Nunca executada</span>;
        }
        return (
          <div className="flex items-center gap-2 flex-wrap py-0.5">
            <StatusChip job={f.ultimo_job} />
            <span className="text-xs" style={{ color: "var(--text-dim)" }}>
              {new Date(f.ultimo_job.criado_em).toLocaleString("pt-BR")}
              {` · ${f.ultimo_job.resumo?.linhas ?? 0} linhas`}
            </span>
          </div>
        );
      },
    },
    {
      key: "acao", label: "", align: "right", sortable: false, width: 150,
      render: (f) => (
        <button
          onClick={() => handleExecutar(f)}
          disabled={jobAtivo}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: "color-mix(in oklab, var(--admin-accent, #3b82f6) 12%, transparent)",
            border: "1px solid color-mix(in oklab, var(--admin-accent, #3b82f6) 35%, transparent)",
            color: "var(--admin-accent, #3b82f6)",
          }}
          aria-label={`Atualizar ${f.label} agora`}
        >
          {jobAtivo && job.dataset === f.key ? "Executando…" : "Atualizar agora"}
        </button>
      ),
    },
  ]}
  data={autoFontes}
/>
```

Imports novos na página: `DataTable` e `StatusChip`.

- [ ] **Step 2: Botão "Rodar todas as fontes"** — trocar `bg-teal-600 hover:bg-teal-700` por sólido accent:

```jsx
style={{
  background: "var(--admin-accent, #3b82f6)",
  color: "#fff",
  border: "1px solid color-mix(in oklab, var(--admin-accent, #3b82f6) 70%, black)",
}}
```

Mesma troca no painel de progresso do meta-job (borda `border-teal-600/40` → `style={{ borderColor: "color-mix(in oklab, var(--admin-accent, #3b82f6) 40%, transparent)" }}`, barra `bg-teal-600` → accent como acima). Os botões Salvar da tabela de metadados (`bg-teal-600`) e os `focus:ring-teal-500` dos inputs também trocam para accent (ring via `style` não funciona — usar `focus:outline-none` + `style={{ "--tw-ring-color": "var(--admin-accent, #3b82f6)" }}` com `focus:ring-2`).

- [ ] **Step 3: Verificar** — `npm test`, `npm run lint`, conferência visual (`npm run dev`): tabela de fontes, progresso inline na linha, botões accent no tema ativo.

- [ ] **Step 4: Commit**

```bash
git add frontend-observatorio/src/pages/admin/DatasetFontesAdminPage.jsx
git commit -m "feat(uxui): fontes automaticas em DataTable + botoes admin-accent"
```

---

### Task 5: `confirm()` → NidModal + copy nova

**Files:**
- Modify: `frontend-observatorio/src/pages/admin/DatasetFontesAdminPage.jsx`

**Interfaces:**
- Consumes: `NidModal` (mesmas props da Task 3).
- Produces: dois modais de confirmação; cabeçalho/seções com a copy nova.

- [ ] **Step 1: Confirmação "rodar todas sem filtro"** — remover o `confirm(...)` de `handleExecutarTodas`; estado `const [confirmTodas, setConfirmTodas] = useState(false);`:

```jsx
const handleExecutarTodas = () => {
  if (!municipiosSel.length && !estadoFiltro) {
    setConfirmTodas(true);
    return;
  }
  executarTodas();
};
const executarTodas = async () => {
  setConfirmTodas(false);
  await handleExecutar({ key: DATASET_TODAS, label: "Todas as fontes" });
};
```

```jsx
<NidModal
  open={confirmTodas}
  onClose={() => setConfirmTodas(false)}
  eyebrow="Atenção · execução longa"
  title="Rodar para o Brasil inteiro?"
  size="md"
  footer={
    <>
      <button
        onClick={() => setConfirmTodas(false)}
        className="px-4 py-2 rounded-lg text-sm cursor-pointer"
        style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text-dim)" }}
      >
        Cancelar
      </button>
      <button
        onClick={executarTodas}
        className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer"
        style={{
          background: "var(--admin-accent, #3b82f6)", color: "#fff",
          border: "1px solid color-mix(in oklab, var(--admin-accent, #3b82f6) 70%, black)",
        }}
      >
        Rodar mesmo assim
      </button>
    </>
  }
>
  <p style={{ color: "var(--text-dim)" }}>
    Sem filtro de estado ou município, <b style={{ color: "var(--text)" }}>todas as fontes
    rodarão para o Brasil inteiro</b> — pode levar horas. Selecione uma UF ou municípios
    para uma execução mais rápida.
  </p>
</NidModal>
```

- [ ] **Step 2: Confirmação "limpar fonte"** — remover o `confirm(...)` de `handleClear`; estado `const [clearTarget, setClearTarget] = useState(null);` — `handleClear(row)` vira `setClearTarget(row)`, e a exclusão real move para `confirmClear`:

```jsx
const confirmClear = async () => {
  const row = clearTarget;
  if (!row) return;
  setClearTarget(null);
  setSavingKey(row.key);
  try {
    await api.delete(`/dataset-info/${row.key}`);
    updateField(row.key, "fonte", "");
    updateField(row.key, "data_atualizacao", "");
    addToast(`Fonte de "${row.label}" removida.`, "success");
  } catch (err) {
    if (err.response?.status === 404) {
      updateField(row.key, "fonte", "");
      updateField(row.key, "data_atualizacao", "");
    } else {
      addToast(err.response?.data?.detail || "Erro ao remover.", "error");
    }
  } finally {
    setSavingKey(null);
  }
};
```

```jsx
<NidModal
  open={Boolean(clearTarget)}
  onClose={() => setClearTarget(null)}
  eyebrow="Confirmação"
  title={clearTarget ? `Limpar fonte de "${clearTarget.label}"` : ""}
  size="md"
  footer={
    <>
      <button
        onClick={() => setClearTarget(null)}
        className="px-4 py-2 rounded-lg text-sm cursor-pointer"
        style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text-dim)" }}
      >
        Cancelar
      </button>
      <button
        onClick={confirmClear}
        className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer"
        style={{ background: "#ef4444", color: "#fff", border: "1px solid #dc2626" }}
      >
        Limpar
      </button>
    </>
  }
>
  <p style={{ color: "var(--text-dim)" }}>
    A fonte e a data de atualização de{" "}
    <b style={{ color: "var(--text)" }}>{clearTarget?.label}</b> deixarão de aparecer
    nos tooltips das páginas de dados.
  </p>
</NidModal>
```

(Vermelho `#ef4444` é o padrão de destrutivo já usado na DatasetsAdminPage — mantido.)

- [ ] **Step 3: Copy nova** — cabeçalho e seções:

```jsx
<h1 ...>Coletas e fontes de dados</h1>
<p ...>
  Execute as coletas automáticas (APIs públicas, em segundo plano) e mantenha os
  metadados de fonte que aparecem como tooltip nas páginas de dados.
</p>
```

Seção de execução: `<h2>Coletas automáticas</h2>` com o subtítulo atual. Tabela de metadados ganha um título antes do painel: `<h2 className="text-lg font-bold text-[var(--text)]">Metadados dos datasets</h2>` + `<p className="text-sm text-[var(--text-mute)]">Fonte e data de atualização exibidas nos tooltips.</p>`.

- [ ] **Step 4: Verificar** — `npm test`, `npm run lint`; visual: os dois fluxos de confirmação, copy, temas (checklist rápido nos 5 temas: chips, botões, modal).

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/pages/admin/DatasetFontesAdminPage.jsx
git commit -m "feat(uxui): confirmacoes em NidModal + copy da tela de coletas"
```
