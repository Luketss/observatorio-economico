# Central de Inteligência (Fase 5) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página inicial ("Núcleo de Dados") reestruturada como porta de entrada — Cenário, Mudanças relevantes, Riscos & oportunidades, Aprofundar e Panorama — com o dataset `geral` da IA lendo todas as bases econômicas.

**Architecture:** Backend primeiro (reescrita do branch `geral` em `_fetch_dados` + `_PROMPT_GERAL`, sem migração); depois o DRY do normalizador de arrecadação (sobe ao util compartilhado); componentes novos (`MudancasRelevantes` + `montarMudancas` puro; `AtalhoCard` com teaser de plano); por fim a recomposição da página com guard `needsMunicipio` e hero do VAF.

**Tech Stack:** FastAPI/SQLAlchemy (consultas agregadas espelhando os branches por dataset já existentes no MESMO arquivo); React 19 + Vitest/jsdom; pytest com fixture sqlite (estilo da casa).

**Spec:** `docs/superpowers/specs/2026-08-20-central-inteligencia-design.md`

## Global Constraints

- **Sem migração; rota `/app`, chave `geral` e título "Núcleo de Dados" intocados.** Invariantes de navegação e teste estático de títulos NÃO mudam.
- **Nada some** além da troca aprovada do 4º hero ("Crescimento PIB" → "VAF · IPM"): os 6 gráficos, Prioridades, Indicadores Personalizados e Releases ficam byte-idênticos (os gráficos apenas mudam de posição, sob o h3 "Panorama").
- Contrato dos insights inalterado: geração manual (`POST /insights/gerar`), saída JSON array de 5 strings, `max_tokens` como está.
- Gates: backend `venv/Scripts/python -m pytest backend/tests -q` da RAIZ (baseline 433); front `npx vitest run` de `frontend-observatorio/` (baseline 286). **pytest sempre via Bash tool (git-bash), nunca PowerShell.**
- `git add` caminho a caminho — NUNCA `-A`/`.` (proibidos: .claude/, dados/, node_modules/).
- Lint: novos limpos (exceto falso-positivo `motion unused` onde houver motion.div); modificados sem erro NOVO vs base.
- Copy pt-BR; commits convencionais + trailers padrão da sessão.

---

### Task 1: Backend — dataset `geral` consolidado + `_PROMPT_GERAL`

**Files:**
- Modify: `backend/app/services/insights_service.py` (branch `geral` de `_fetch_dados`, linhas ~494-526; prompts ~658-684 e ~1008-1022)
- Test: `backend/tests/test_insights_geral.py`

**Interfaces:**
- Consumes: models/consultas JÁ usados pelos branches por dataset no MESMO arquivo (`PibAnual`, `ArrecadacaoMensal`, `CagedMovimentacao`, `VafAnual`, `Empresa`, e os models de estban/comex/pix/bolsa_familia com os nomes exatos que os branches homônimos usam — espelhar de lá).
- Produces: payload `dados = [{"bases": {...}}]` com as chaves abaixo; `_PROMPT_GERAL` registrado em `_DATASET_PROMPT_MAP["geral"]`.

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `backend/tests/test_insights_geral.py`:

```python
"""Dataset 'geral' consolidado do insights_service: payload compacto por base,
bases sem dado omitidas, prompt executivo registrado."""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.db.base import Base
from app.models.arrecadacao import ArrecadacaoMensal
from app.models.municipio import Municipio
from app.models.pib import PibAnual


@pytest.fixture()
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)  # todas as tabelas — o branch geral toca várias
    session = sessionmaker(bind=engine)()
    m = Municipio(nome="Alfa", estado="MG")
    session.add(m)
    session.flush()
    session.add_all([
        PibAnual(municipio_id=m.id, ano=2021, pib_total=1000000.0),
        PibAnual(municipio_id=m.id, ano=2022, pib_total=1100000.0),
    ])
    for i in range(24):
        ano = 2026 if i < 12 else 2025
        mes = 12 - (i % 12)
        session.add(ArrecadacaoMensal(municipio_id=m.id, ano=ano, mes=mes,
                                      valor_total=100.0 if i < 12 else 80.0))
    session.commit()
    session.mid = m.id
    yield session
    session.close()


def test_payload_geral_tem_bases_semeadas_e_omite_vazias(db):
    from app.services.insights_service import _fetch_dados
    dados, periodo = _fetch_dados(db, db.mid, "geral")
    assert len(dados) == 1
    bases = dados[0]["bases"]
    assert bases["pib"]["ano"] == 2022
    assert bases["pib"]["yoy_crescimento_pct"] == 10.0
    assert bases["arrecadacao"]["total_12m"] == 1200.0
    assert bases["arrecadacao"]["yoy_crescimento_pct"] == 25.0
    # bases sem dado semeado não aparecem
    for ausente in ("comex", "pix", "estban", "empresas", "caged", "vaf", "bolsa_familia"):
        assert ausente not in bases
    assert periodo == "2022"


def test_payload_geral_sem_nada_devolve_bases_vazias(db):
    from app.models.municipio import Municipio
    from app.services.insights_service import _fetch_dados
    m2 = Municipio(nome="Beta", estado="MG")
    db.add(m2)
    db.commit()
    dados, periodo = _fetch_dados(db, m2.id, "geral")
    assert dados[0]["bases"] == {}
    assert periodo == "geral"


def test_prompt_geral_registrado():
    from app.services.insights_service import _DATASET_PROMPT_MAP, _PROMPT_GERAL
    assert _DATASET_PROMPT_MAP["geral"] is _PROMPT_GERAL
    assert "cenário" in _PROMPT_GERAL.lower()
```

(Se `PibAnual`/`ArrecadacaoMensal` exigirem campos NOT NULL extras (ex.: `tipo_dado`), preencher mínimos reais espelhando os models — ajuste pré-autorizado. Se os imports de models divergirem (`app.models.pib` etc.), usar os caminhos reais.)

- [ ] **Step 2: RED**

Run: `venv/Scripts/python -m pytest backend/tests/test_insights_geral.py -q`
Expected: FAIL — payload antigo não tem `bases`; `_PROMPT_GERAL` não existe.

- [ ] **Step 3: Reescrever o branch `geral`**

Substituir o corpo do `elif dataset == "geral":` (linhas ~494-526) por um construtor de payload compacto. Regras: cada bloco ESPELHA a consulta do branch homônimo do próprio arquivo (mesmos models e nomes de campos), reduzida ao agregado; base sem linhas → chave ausente. Código (os blocos de pib/arrecadação/bolsa_familia/empresas completos; os demais seguem o mesmo molde com as consultas dos branches homônimos):

```python
    elif dataset == "geral":
        bases: dict = {}

        pib_rows = (
            db.query(PibAnual)
            .filter(PibAnual.municipio_id == municipio_id)
            .order_by(PibAnual.ano.desc())
            .limit(2)
            .all()
        )
        if pib_rows:
            item = {"ano": pib_rows[0].ano, "pib_total": pib_rows[0].pib_total}
            if len(pib_rows) == 2 and pib_rows[1].pib_total:
                item["yoy_crescimento_pct"] = round(
                    (pib_rows[0].pib_total - pib_rows[1].pib_total) / pib_rows[1].pib_total * 100, 1
                )
            bases["pib"] = item

        arr_rows = (
            db.query(ArrecadacaoMensal)
            .filter(ArrecadacaoMensal.municipio_id == municipio_id)
            .order_by(ArrecadacaoMensal.ano.desc(), ArrecadacaoMensal.mes.desc())
            .limit(24)
            .all()
        )
        if arr_rows:
            total_12m = round(sum(r.valor_total or 0 for r in arr_rows[:12]), 2)
            item = {"ultimo_mes": f"{arr_rows[0].ano}-{arr_rows[0].mes:02d}", "total_12m": total_12m}
            if len(arr_rows) >= 24:
                prev_12m = sum(r.valor_total or 0 for r in arr_rows[12:24])
                if prev_12m:
                    item["yoy_crescimento_pct"] = round((total_12m - prev_12m) / prev_12m * 100, 1)
            bases["arrecadacao"] = item

        # caged: últimas 12 competências (mesma consulta do branch "caged");
        # item = {"saldo_12m": soma dos saldos, "ultimo_mes": "AAAA-MM"}
        # vaf: linha mais recente (branch "vaf"); item = {"ano_base", "pct_ipm"}
        #   (usar os nomes de campos exatos que o branch "vaf" já lê)
        # empresas: contagens (mesmos filtros do branch "empresas"/router resumo);
        #   item = {"total", "ativas"} — só se total > 0
        # estban: último mês (branch "estban"); item = {"ultimo_mes",
        #   "credito_total", "depositos_total"} com os campos que o branch usa
        # comex: últimas 12 competências (branch "comex"); item =
        #   {"exportado_12m", "importado_12m", "balanca_12m"}
        # pix: últimas 12 competências (branch "pix"); item =
        #   {"volume_pf_12m", "volume_pj_12m"}
        # bolsa_familia: linha mais recente (branch "bolsa_familia"); item =
        #   {"ultimo_mes", "beneficiarios"} — corrige a soma de estoques antiga

        bf = (
            db.query(BolsaFamiliaResumo)
            .filter(BolsaFamiliaResumo.municipio_id == municipio_id)
            .order_by(BolsaFamiliaResumo.ano.desc(), BolsaFamiliaResumo.mes.desc())
            .first()
        )
        if bf:
            bases["bolsa_familia"] = {
                "ultimo_mes": f"{bf.ano}-{bf.mes:02d}",
                "beneficiarios": bf.total_beneficiarios,
            }

        dados = [{"bases": bases}]
        periodo = str(bases["pib"]["ano"]) if "pib" in bases else "geral"
```

(Os 5 blocos comentados — caged, vaf, empresas, estban, comex, pix — são obrigatórios: implementar cada um copiando a consulta do branch homônimo do MESMO arquivo e reduzindo ao item com as chaves exatas listadas. Se `BolsaFamiliaResumo` usar outros nomes de colunas de competência, espelhar o branch `bolsa_familia`.)

- [ ] **Step 4: `_PROMPT_GERAL` + registro**

Adicionar após `_PROMPT_BASE`:

```python
_PROMPT_GERAL = """Você é o assessor econômico sênior do prefeito de {nome} ({estado}), responsável por transformar os dados consolidados do município em leitura executiva.

Você receberá um payload com a chave "bases": um resumo compacto de cada base de dados disponível (PIB, arrecadação, emprego formal, VAF, empresas, bancos, comércio exterior, PIX, Bolsa Família). Bases ausentes do payload NÃO têm dados — ignore-as por completo, sem mencioná-las.

Gere exatamente 5 insights, nesta composição:
1. Um retrato de CENÁRIO do município em uma frase (os números mais estruturais).
2-3. Duas MUDANÇAS ou tendências relevantes (priorize variações percentuais presentes no payload).
4. Um ponto de ATENÇÃO ou risco concreto.
5. Uma OPORTUNIDADE acionável para a gestão.

Regras: cite números do payload (formato brasileiro); nunca invente dados nem compare unidades de natureza diferente; cada base tem periodicidade própria (anual, mensal, acumulado 12 meses — o payload indica). Linguagem executiva, direta, português do Brasil, sem jargão técnico desnecessário e sem menção a IA ou automação.
"""
```

Em `_DATASET_PROMPT_MAP`: `"geral": _PROMPT_GERAL`. Depois, grep por `_PROMPT_BASE` no arquivo: se ficou órfão, removê-lo (se algo mais o referencia, deixá-lo).

- [ ] **Step 5: GREEN + suite completa**

Run: `venv/Scripts/python -m pytest backend/tests/test_insights_geral.py -q` → PASS (3).
Run: `venv/Scripts/python -m pytest backend/tests -q` → 433 + 3 = 436, zero falhas.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/insights_service.py backend/tests/test_insights_geral.py
git commit -m "feat(central): dataset geral consolidado com todas as bases e prompt executivo"
```

---

### Task 2: Normalizador de arrecadação sobe ao util compartilhado

**Files:**
- Modify: `frontend-observatorio/src/utils/metricasEconomicas.js`
- Modify: `frontend-observatorio/src/pages/painel-prefeito/PainelPrefeitoPage.jsx:50-53` (remove a entrada local)
- Test: `frontend-observatorio/src/utils/metricasEconomicas.test.js` (modificar)

**Interfaces:**
- Produces (Tasks 3-4 dependem): `METRICAS_ECONOMICAS.arrecadacao = { label: "Arrecadação", route: "/app/arrecadacao", resumoPath: "/arrecadacao/resumo", planKey: "arrecadacao", pick }` com o pick byte-idêntico ao do Painel (`{ ...moneyDisplay(r?.total_geral), delta: kpiDelta(r?.crescimento_percentual), foot: "vs ano anterior" }`). `ORDEM_ECONOMICA` NÃO muda.

- [ ] **Step 1: Testes (falhando)**

Em `metricasEconomicas.test.js`, adicionar:

```js
  it("arrecadacao — entrada compartilhada com delta", () => {
    const m = METRICAS_ECONOMICAS.arrecadacao;
    expect(m.route).toBe("/app/arrecadacao");
    expect(m.resumoPath).toBe("/arrecadacao/resumo");
    expect(m.planKey).toBe("arrecadacao");
    const p = m.pick({ total_geral: 2500000, crescimento_percentual: 5.2 });
    expect(p).toEqual({ value: "R$ 2,5", unit: "Mi", delta: { value: 5.2, direction: "up" }, foot: "vs ano anterior" });
    expect(m.pick(null).value).toBe("—");
  });

  it("ORDEM_ECONOMICA continua sem arrecadacao", () => {
    expect(ORDEM_ECONOMICA).toEqual(["pib", "vaf", "empresas", "estban", "comex", "pix"]);
  });
```

- [ ] **Step 2: RED** — `npx vitest run src/utils/metricasEconomicas.test.js` → FAIL.

- [ ] **Step 3: Implementar**

Em `metricasEconomicas.js`, adicionar a entrada `arrecadacao` ao objeto (após `pix`), com o pick copiado byte a byte do Painel. Em `PainelPrefeitoPage.jsx`, DELETAR a entrada local `arrecadacao` (linhas 50-53) — o spread `...METRICAS_ECONOMICAS` (linha 49) passa a fornecê-la; atualizar o comentário anti-shadow (linhas 46-48) incluindo `arrecadacao` na lista de chaves que não devem ser redeclaradas.

- [ ] **Step 4: GREEN + Painel + suite**

Run: `npx vitest run src/utils/metricasEconomicas.test.js src/pages/painel-prefeito/PainelPrefeitoPage.test.jsx` → PASS.
Run: `npx vitest run` → 286 + 2 = 288, zero falhas.

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/utils/metricasEconomicas.js frontend-observatorio/src/utils/metricasEconomicas.test.js frontend-observatorio/src/pages/painel-prefeito/PainelPrefeitoPage.jsx
git commit -m "refactor(central): normalizador de arrecadacao sobe ao util compartilhado (DRY)"
```

---

### Task 3: `MudancasRelevantes` + `AtalhoCard`

**Files:**
- Create: `frontend-observatorio/src/utils/mudancasRelevantes.js`
- Create: `frontend-observatorio/src/components/MudancasRelevantes.jsx`
- Create: `frontend-observatorio/src/components/AtalhoCard.jsx`
- Test: `frontend-observatorio/src/utils/mudancasRelevantes.test.js`, `frontend-observatorio/src/components/AtalhoCard.test.jsx`

**Interfaces:**
- Produces (Task 4 depende):
  - `montarMudancas({ pib, vaf, arrecadacao, caged })` → array ordenado de `{ key, label, rota, pct (number|null), up (bool), texto (string) }` — itens com pct ordenados por |pct| desc; CAGED (sem pct, `up` pelo sinal do saldo) sempre por último; entradas sem dado ficam fora.
  - `<MudancasRelevantes resumos={{ pib, vaf, arrecadacao, caged }} />` — renderiza h3 "Mudanças relevantes" + linhas; array vazio → retorna `null`.
  - `<AtalhoCard titulo descricao icone={Icon} to planKey />` — Link-card; bloqueado (`planKey` fora do plano via `canAccess` do `PlanContext`) → opacity-70 + `LockClosedIcon` + `title="Recurso bloqueado — disponível em um plano superior"`; continua navegável (teaser — o gate real é o PlanLockedView da rota destino).

- [ ] **Step 1: Testes (falhando)**

`mudancasRelevantes.test.js`:

```js
import { describe, it, expect } from "vitest";
import { montarMudancas } from "./mudancasRelevantes";

const RES = {
  pib: { ultimo_ano: 2022, crescimento_percentual: 3.2 },
  vaf: { ultimo_ano: 2023, variacao_ipm_percentual: -7.1 },
  arrecadacao: { total_geral: 500000, crescimento_percentual: 5.0 },
  caged: { saldo_total: 120, total_admissoes: 900 },
};

describe("montarMudancas", () => {
  it("ordena por |variação| desc e deixa o CAGED por último", () => {
    const m = montarMudancas(RES);
    expect(m.map((i) => i.key)).toEqual(["vaf", "arrecadacao", "pib", "caged"]);
    expect(m[0].up).toBe(false);
    expect(m[3].pct).toBeNull();
    expect(m[3].up).toBe(true);
  });

  it("entradas sem dado ficam fora; tudo vazio → []", () => {
    expect(montarMudancas({ pib: null, vaf: {}, arrecadacao: null, caged: null })).toEqual([]);
    const m = montarMudancas({ ...RES, vaf: null });
    expect(m.map((i) => i.key)).toEqual(["arrecadacao", "pib", "caged"]);
  });

  it("textos citam os números", () => {
    const m = montarMudancas(RES);
    expect(m.find((i) => i.key === "pib").texto).toContain("3,2%");
    expect(m.find((i) => i.key === "caged").texto).toContain("+120");
  });
});
```

`AtalhoCard.test.jsx`:

```jsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HomeIcon } from "@heroicons/react/24/outline";
import { PlanContext } from "../context/PlanContext";
import AtalhoCard from "./AtalhoCard";

const montar = (planKey, canAccess = () => true) =>
  render(
    <MemoryRouter>
      <PlanContext.Provider value={{ modulos: [], canAccess }}>
        <AtalhoCard titulo="Benchmark" descricao="Compare seu município." icone={HomeIcon} to="/app/benchmark" planKey={planKey} />
      </PlanContext.Provider>
    </MemoryRouter>
  );

describe("AtalhoCard", () => {
  it("renderiza link com título e descrição", () => {
    montar("benchmark");
    const link = screen.getByRole("link", { name: /Benchmark/ });
    expect(link).toHaveAttribute("href", "/app/benchmark");
    expect(screen.getByText("Compare seu município.")).toBeInTheDocument();
    expect(link).not.toHaveAttribute("title");
  });

  it("bloqueado por plano mostra teaser mas continua navegável", () => {
    montar("benchmark", (k) => k !== "benchmark");
    const link = screen.getByRole("link", { name: /Benchmark/ });
    expect(link).toHaveAttribute("title", "Recurso bloqueado — disponível em um plano superior");
    expect(link).toHaveAttribute("href", "/app/benchmark");
  });

  it("sem planKey nunca bloqueia", () => {
    montar(undefined, () => false);
    expect(screen.getByRole("link", { name: /Benchmark/ })).not.toHaveAttribute("title");
  });
});
```

- [ ] **Step 2: RED** — `npx vitest run src/utils/mudancasRelevantes.test.js src/components/AtalhoCard.test.jsx` → FAIL.

- [ ] **Step 3: Implementar**

`src/utils/mudancasRelevantes.js`:

```js
import { fmtBR } from "./metricasEconomicas";

const pctTxt = (p) => `${Math.abs(Number(p)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/** Monta a lista "Mudanças relevantes" da página inicial a partir dos resumos
 *  já buscados. Só entram bases com variação real disponível; o saldo CAGED
 *  entra como sinal (sem percentual) e sempre por último. */
export function montarMudancas({ pib, vaf, arrecadacao, caged } = {}) {
  const comPct = [];
  if (pib?.crescimento_percentual != null) {
    const p = Number(pib.crescimento_percentual);
    comPct.push({
      key: "pib", label: "PIB", rota: "/app/pib", pct: p, up: p >= 0,
      texto: `PIB ${p >= 0 ? "cresceu" : "recuou"} ${pctTxt(p)}${pib.ultimo_ano ? ` em ${pib.ultimo_ano}` : ""} vs ano anterior.`,
    });
  }
  if (vaf?.variacao_ipm_percentual != null) {
    const p = Number(vaf.variacao_ipm_percentual);
    comPct.push({
      key: "vaf", label: "VAF", rota: "/app/vaf", pct: p, up: p >= 0,
      texto: `Índice de participação (IPM) ${p >= 0 ? "subiu" : "caiu"} ${pctTxt(p)}${vaf.ultimo_ano ? ` no ano-base ${vaf.ultimo_ano}` : ""}.`,
    });
  }
  if (arrecadacao?.crescimento_percentual != null) {
    const p = Number(arrecadacao.crescimento_percentual);
    comPct.push({
      key: "arrecadacao", label: "Arrecadação", rota: "/app/arrecadacao", pct: p, up: p >= 0,
      texto: `Arrecadação ${p >= 0 ? "avançou" : "retraiu"} ${pctTxt(p)} no período.`,
    });
  }
  comPct.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));

  const itens = [...comPct];
  if (caged?.saldo_total != null) {
    const s = Number(caged.saldo_total);
    itens.push({
      key: "caged", label: "CAGED", rota: "/app/caged", pct: null, up: s >= 0,
      texto: `Saldo de ${s >= 0 ? "+" : ""}${fmtBR(s)} vagas formais no período acumulado.`,
    });
  }
  return itens;
}
```

`src/components/MudancasRelevantes.jsx`:

```jsx
import { Link } from "react-router-dom";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { montarMudancas } from "../utils/mudancasRelevantes";

/** Bloco "Mudanças relevantes" da página inicial: variações reais disponíveis
 *  nos resumos, ordenadas por magnitude, cada uma com atalho para a origem. */
export default function MudancasRelevantes({ resumos }) {
  const itens = montarMudancas(resumos);
  if (itens.length === 0) return null;

  return (
    <div className="space-y-2" style={{ marginBottom: 22 }}>
      <h3 className="text-sm font-semibold text-[var(--text-dim)] uppercase tracking-wider">Mudanças relevantes</h3>
      <div className="space-y-1.5">
        {itens.map((i) => (
          <div key={i.key}
            className="flex items-center gap-3 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--panel)]">
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold shrink-0 bg-[var(--panel-2)] ${i.up ? "text-green-400" : "text-red-400"}`}>
              {i.pct != null
                ? `${i.pct >= 0 ? "+" : "−"}${Math.abs(i.pct).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
                : i.up ? "▲" : "▼"}
            </span>
            <p className="text-xs text-[var(--text)] flex-1 min-w-0">{i.texto}</p>
            <Link to={i.rota} className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 font-medium shrink-0">
              Ver em {i.label} <ArrowRightIcon className="w-3 h-3" />
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
```

`src/components/AtalhoCard.jsx`:

```jsx
import { useContext } from "react";
import { Link } from "react-router-dom";
import { LockClosedIcon } from "@heroicons/react/24/outline";
import { PlanContext } from "../context/PlanContext";

const LOCK_TITLE = "Recurso bloqueado — disponível em um plano superior";

/** Card de atalho da seção "Aprofundar" da página inicial. Teaser de plano:
 *  bloqueado fica visível com cadeado e continua navegável — o gate real é o
 *  PlanLockedView da rota destino. */
export default function AtalhoCard({ titulo, descricao, icone: Icone, to, planKey }) {
  const { canAccess } = useContext(PlanContext);
  const bloqueado = planKey != null && !canAccess(planKey);

  return (
    <Link
      to={to}
      title={bloqueado ? LOCK_TITLE : undefined}
      style={bloqueado ? { opacity: 0.7 } : undefined}
      className="flex items-start gap-3 p-4 rounded-xl border border-[var(--border)] bg-[var(--panel)] hover:bg-[var(--panel-2)] transition-colors"
    >
      <Icone className="w-6 h-6 shrink-0 text-blue-500" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--text)] flex items-center gap-1.5">
          {titulo}
          {bloqueado && <LockClosedIcon className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-mute)" }} />}
        </p>
        <p className="text-xs text-[var(--text-dim)] mt-0.5">{descricao}</p>
      </div>
    </Link>
  );
}
```

- [ ] **Step 4: GREEN + suite** — focados PASS (3+3); `npx vitest run` → 288 + 6 = 294, zero falhas.

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/utils/mudancasRelevantes.js frontend-observatorio/src/utils/mudancasRelevantes.test.js frontend-observatorio/src/components/MudancasRelevantes.jsx frontend-observatorio/src/components/AtalhoCard.jsx frontend-observatorio/src/components/AtalhoCard.test.jsx
git commit -m "feat(central): componentes MudancasRelevantes e AtalhoCard"
```

---

### Task 4: Recomposição da página inicial

**Files:**
- Modify: `frontend-observatorio/src/pages/DashboardGeralPage.jsx` (referências de linha = versão base da fase)
- Test: `frontend-observatorio/src/pages/DashboardGeralPage.test.jsx` (novo)

**Interfaces:**
- Consumes: Tasks 2-3 (util com arrecadacao; `MudancasRelevantes`, `AtalhoCard`); padrão de guard F3/F4; `SelecioneMunicipio`.
- Produces: página final na ordem da spec.

- [ ] **Step 1: Teste de página (falhando)**

Criar `DashboardGeralPage.test.jsx` (mocks à la F3/F4 — api com mapa url→resposta; AuthContext/ViewAsContext mutáveis; ToastContext se necessário):

```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const authState = { user: { role: "SECRETARIO", permissoes: {} } };
const viewAsState = { viewAsId: null };
vi.mock("../context/AuthContext", () => ({ useAuth: () => authState }));
vi.mock("../context/ViewAsContext", () => ({ useViewAs: () => viewAsState }));

const respostas = {};
vi.mock("../services/api", () => ({
  default: { get: vi.fn((url) => Promise.resolve({ data: respostas[url] ?? null })) },
}));

import api from "../services/api";
import DashboardGeralPage from "./DashboardGeralPage";

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(respostas).forEach((k) => delete respostas[k]);
  Object.assign(respostas, {
    "/pib/resumo": { ultimo_ano: 2022, pib_ultimo_ano: 1200000, crescimento_percentual: 3.2 },
    "/vaf/resumo": { ultimo_ano: 2023, ipm_ultimo_ano: 0.0123, variacao_ipm_percentual: -7.1 },
    "/arrecadacao/resumo": { total_geral: 500000, crescimento_percentual: 5.0 },
    "/caged/resumo": { saldo_total: 120, total_admissoes: 900 },
    "/pib/serie": [], "/pib/comparativo": null, "/arrecadacao/por_tipo": [],
    "/caged/serie": [], "/dashboard-cards": [],
  });
  authState.user = { role: "SECRETARIO", permissoes: {} };
  viewAsState.viewAsId = null;
});

const montar = () => render(<MemoryRouter><DashboardGeralPage /></MemoryRouter>);

describe("DashboardGeralPage — porta de entrada", () => {
  it("renderiza as seções na ordem nova, com o hero do VAF", async () => {
    montar();
    await waitFor(() => expect(screen.getByText("VAF · IPM")).toBeInTheDocument());
    const h3s = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(h3s.indexOf("Cenário do município")).toBeGreaterThan(-1);
    expect(h3s.indexOf("Mudanças relevantes")).toBeGreaterThan(h3s.indexOf("Cenário do município"));
    expect(h3s.indexOf("Aprofundar")).toBeGreaterThan(h3s.indexOf("Mudanças relevantes"));
    expect(h3s.indexOf("Panorama")).toBeGreaterThan(h3s.indexOf("Aprofundar"));
    expect(screen.queryByText("Crescimento PIB")).toBeNull();
  });

  it("atalhos apontam para os 6 destinos curados", async () => {
    montar();
    await waitFor(() => expect(screen.getByRole("link", { name: /Análise Econômica/ })).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /Visão do Prefeito/ })).toHaveAttribute("href", "/app/painel-prefeito");
    expect(screen.getByRole("link", { name: /Gestão Empresarial/ })).toHaveAttribute("href", "/app/desenvolvimento-economico/retencao");
  });

  it("ADMIN_GLOBAL sem view-as vê o guard e não busca nada", () => {
    authState.user = { role: "ADMIN_GLOBAL" };
    montar();
    expect(screen.queryByText("VAF · IPM")).toBeNull();
    expect(api.get).not.toHaveBeenCalled();
  });
});
```

(PrioridadesPanel/InsightsPanel/ReleasesPanel montam com api mockado devolvendo null — seus estados vazios não podem quebrar o teste; se algum lançar, mockar o componente com `vi.mock` devolvendo null e anotar no report.)

- [ ] **Step 2: RED** — `npx vitest run src/pages/DashboardGeralPage.test.jsx` → FAIL.

- [ ] **Step 3: Editar a página**

1. **Imports**: remover `fmtBR`/`moneyDisplay` locais (linhas 56-65) e importar de `../utils/metricasEconomicas` (o `pctDelta` local FICA); adicionar `useViewAs`, `SelecioneMunicipio`, `MudancasRelevantes`, `AtalhoCard` e os ícones dos atalhos (`PresentationChartBarIcon`, `BuildingLibraryIcon`, `ChartBarSquareIcon`, `BuildingOffice2Icon`, `TrophyIcon` — conferir colisões com os já importados).
2. **Guard**: `const { viewAsId } = useViewAs(); const needsMunicipio = isGlobal && viewAsId == null;` + early-return (antes do return principal) com `NidPageHeader` + `SelecioneMunicipio`; no effect, `if (needsMunicipio) return;` como primeira linha de `fetchAll` (dep array vira `[isGlobal, needsMunicipio]` ou só `[needsMunicipio]` se `isGlobal` ficar sem outro uso no effect — conferir o skip do `/dashboard-cards`, que continua usando `isGlobal`).
3. **Fetch**: adicionar `safeGet("/vaf/resumo")` ao `Promise.all` + estado `vafResumo`.
4. **Seção Cenário**: antes do bloco dos heroes, h3 `Cenário do município` (mesmas classes do h3 "Indicadores Personalizados" da própria página — espelhar); substituir o 4º `NidKpiHero` (linhas 286-297) por:

```jsx
          <NidKpiHero
            label="VAF · IPM"
            badge={vafResumo?.ultimo_ano ? String(vafResumo.ultimo_ano) : null}
            value={vafResumo?.ipm_ultimo_ano != null ? fmtBR(vafResumo.ipm_ultimo_ano, { maximumFractionDigits: 4 }) : "—"}
            unit=""
            delta={pctDelta(vafResumo?.variacao_ipm_percentual)}
            foot="índice de participação"
            color={A4}
          />
```

5. **Mudanças relevantes**: logo após o strip de `NidInsight`... **correção de ordem**: a spec manda Cenário → Mudanças → Riscos & oportunidades. Inserir `<MudancasRelevantes resumos={{ pib: pibResumo, vaf: vafResumo, arrecadacao: arrecResumo, caged: cagedResumo }} />` DEPOIS dos heroes e ANTES do strip de NidInsight; o strip + `InsightsPanel` ganham o h3 `Riscos & oportunidades` imediatamente antes do strip (linha 302).
6. **Aprofundar**: após o `InsightsPanel` (linha 331) e antes dos gráficos, h3 `Aprofundar` + grid `grid gap-4 md:grid-cols-3` com os 6 `AtalhoCard`:

```jsx
        <AtalhoCard titulo="Análise Econômica" descricao="As 6 bases econômicas lidas em conjunto." icone={PresentationChartBarIcon} to="/app/analise-economica" />
        <AtalhoCard titulo="Visão do Prefeito" descricao="Panorama executivo de todas as áreas." icone={BuildingLibraryIcon} to="/app/painel-prefeito" planKey="painel_prefeito" />
        <AtalhoCard titulo="Benchmark" descricao="Seu município comparado aos pares." icone={ChartBarSquareIcon} to="/app/benchmark" planKey="benchmark" />
        <AtalhoCard titulo="Gestão Empresarial" descricao="Relacionamento com as empresas locais." icone={BuildingOffice2Icon} to="/app/desenvolvimento-economico/retencao" planKey="desenvolvimento_economico.retencao" />
        <AtalhoCard titulo="Certificações e Premiações" descricao="Oportunidades, captação e reconhecimentos." icone={TrophyIcon} to="/app/desenvolvimento-economico/premiacoes" planKey="desenvolvimento_economico.premiacoes" />
        <AtalhoCard titulo="Panorama Socioeconômico" descricao="IPS, benefícios e contexto social." icone={PresentationChartBarIcon} to="/app/ips" planKey="ips" />
```

7. **Panorama**: h3 `Panorama` imediatamente antes do primeiro grid de gráficos (linha 335); os 6 gráficos, Indicadores Personalizados e Releases seguem byte-idênticos.

- [ ] **Step 4: GREEN + suite completa**

Run: `npx vitest run src/pages/DashboardGeralPage.test.jsx` → PASS (3).
Run: `npx vitest run` → 294 + 3 = 297 (reportar exato), zero falhas.

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/pages/DashboardGeralPage.jsx frontend-observatorio/src/pages/DashboardGeralPage.test.jsx
git commit -m "feat(central): pagina inicial reestruturada como porta de entrada (cenario, mudancas, aprofundar, panorama)"
```

---

### Task 5: Verificação final

**Files:** nenhum novo; commit só se houver correção.

- [ ] **Step 1:** Suites completas: back (`venv/Scripts/python -m pytest backend/tests -q` → 436) e front (`npx vitest run` → ~297), zero falhas.
- [ ] **Step 2:** Lint comparativo: novos limpos; modificados (insights_service via py_compile; página, util, Painel) sem erro novo vs base da fase.
- [ ] **Step 3:** Invariantes + títulos: `npx vitest run src/app/layouts/navStructure.test.js src/pages/titulosPaginas.test.js` → PASS (nada mudou neles).
- [ ] **Step 4 (sem commit):** Relato com pendências do usuário: push + deploy da api (a fase muda `insights_service` — o insight consolidado só melhora após o admin regerar os insights do dataset `geral` em `/admin/insights`; migração 0038 da F3 segue pendente) + checklist visual (seções na ordem nos 5 temas; hero VAF; atalhos com cadeado free/pro; guard do admin; gráficos intactos no Panorama).
