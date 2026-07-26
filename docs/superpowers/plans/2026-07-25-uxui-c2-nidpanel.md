# UX/UI Ciclo 2 — todo gráfico em NidPanel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Converter todos os wrappers crus de gráfico (`div` estilizada + `<h3>`) em `NidPanel` em 7 páginas, deletar o `ChartCard` do Pix (4 usos → `NidPanel` + `emptyMessage`) e trocar as barras feitas à mão de Emendas por `HBarChart`.

**Architecture:** Conversão mecânica por página seguindo um template único (título do `<h3>` → prop `title`; `<p>` de subtítulo → `sub`); gráficos e props intactos. Zero backend, zero componente novo.

**Tech Stack:** React + Vite; `NidPanel({ title, sub, tabs, onTabChange, children, right })` de `components/nid/Panel.jsx`; charts nid com suporte nativo a `emptyMessage` (verificado em `components/nid/charts.jsx:179,502,673`).

**Spec:** `docs/superpowers/specs/2026-07-25-uxui-c2-nidpanel-design.md`

## Global Constraints

- **Conversão mecânica**: gráfico e TODAS as suas props ficam intactos; muda só o wrapper. Grids externos (`nid-grid-2`, `grid lg:grid-cols-2`, etc.) e `PlanGate` ficam onde estão (no Comex o `PlanGate` passa a envolver o `NidPanel`).
- Template de conversão (aplicar byte-exato no título):

  ANTES:
  ```jsx
  <div className="bg-[var(--panel)] p-6 rounded-2xl shadow-sm border border-[var(--border)]">
    <h3 className="text-base font-bold mb-5 text-[var(--text)]">
      TÍTULO
    </h3>
    <AlgumChart {...props} />
  </div>
  ```
  DEPOIS:
  ```jsx
  <NidPanel title="TÍTULO">
    <AlgumChart {...props} />
  </NidPanel>
  ```
  Variante com subtítulo (`h3` com `mb-1` seguido de `<p className="text-xs text-[var(--text-mute)] mb-5">SUB</p>`):
  `<NidPanel title="TÍTULO" sub={SUB}>` — se SUB tem interpolação JSX (ex.: `Ano: {anoSelecionado}`), usar `sub={<>Ano: {anoSelecionado}</>}`.
- **Converter SOMENTE wrappers cujo conteúdo é um componente de gráfico** (`AreaLineChart`/`MultiLineChart`/`StackedBarChart`/`HBarChart`/`DonutChart`/`TwinBarChart`). **NÃO converter**: wrappers contendo `<table>` (C3 — ex.: "Detalhamento por Instituição" do Estban) nem a lista `MiniStat` "Indicadores de Composição" de Empresas (C4). Wrapper com a classe mas sem gráfico/h3: deixar como está e anotar no report.
- Import: todas as páginas dos lotes A/B já importam `NidPanel`, EXCETO Empresas (importa só `NidPageHeader` de `Panel.jsx` — estender a lista).
- Páginas intocadas: caged, rais, pib, vaf, ips, fpm, dinheiro-na-mesa.
- Gates por task: `npm run test` (51) e `npm run build` exit 0, de `frontend-observatorio/`. Eslint baseline sujo — não é gate.
- Commits `feat(uxui):`. NÃO commitar WIP do usuário: `.claude/settings.local.json`, `README.md`, `dados/`, `docs/superpowers/plans/2026-05-06-ips-feature.md`, `IDEAS.md`.

---

### Task 1: Branch + lote A (arrecadacao, bolsa_familia, pe_de_meia, inss) — 7 conversões

**Files:**
- Modify: `frontend-observatorio/src/pages/arrecadacao/ArrecadacaoPage.jsx` (~linha 203)
- Modify: `frontend-observatorio/src/pages/beneficios/BolsaFamiliaPage.jsx` (~201, ~223)
- Modify: `frontend-observatorio/src/pages/beneficios/PeDeMeiaPage.jsx` (~204, ~218)
- Modify: `frontend-observatorio/src/pages/inss/InssPage.jsx` (~166, ~180)

**Interfaces:** Consumes: `NidPanel` (já importado nas 4). Produces: nada.

- [ ] **Step 1: Criar a branch a partir do main**

```bash
git checkout main
git checkout -b feat/uxui-c2-nidpanel
```

- [ ] **Step 2: Aplicar o template nas 7 conversões**

Aplicar o template das Global Constraints a cada wrapper cru, com estes títulos exatos:

- `ArrecadacaoPage.jsx`: "Composição por Tipo de Imposto (ICMS / IPVA / IPI)"
- `BolsaFamiliaPage.jsx`: "Beneficiários: Total vs Primeira Infância"; "Repasses: Bolsa Família vs Primeira Infância"
- `PeDeMeiaPage.jsx`: "Estudantes por Etapa de Ensino"; "Estudantes por Tipo de Incentivo"
- `InssPage.jsx`: "Top Categorias de Benefícios"; "Evolução Anual de Benefícios"

Nota Arrecadação: o arquivo tem 2 ocorrências da classe do wrapper mas só 1 com `<h3>`+gráfico — converter só essa; a outra fica como está (anotar no report o que ela contém).

- [ ] **Step 3: Conferir os diffs**

```bash
cd frontend-observatorio && git diff
```

Expected: em cada conversão, o `div` de abertura vira `<NidPanel title="...">`, o `<h3>` some, o `</div>` de fechamento vira `</NidPanel>`; o gráfico interno permanece byte-idêntico.

- [ ] **Step 4: Gates**

```bash
cd frontend-observatorio && npm run test && npm run build
```

Expected: 51 PASS; build exit 0.

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/pages/arrecadacao/ArrecadacaoPage.jsx frontend-observatorio/src/pages/beneficios/BolsaFamiliaPage.jsx frontend-observatorio/src/pages/beneficios/PeDeMeiaPage.jsx frontend-observatorio/src/pages/inss/InssPage.jsx
git commit -m "feat(uxui): graficos em NidPanel em arrecadacao, bolsa familia, pe-de-meia e inss"
```

---

### Task 2: Lote B (estban, comex, empresas) — 15 conversões

**Files:**
- Modify: `frontend-observatorio/src/pages/estban/EstbanPage.jsx` (~235, ~258, ~280, ~308, ~323; NÃO ~349)
- Modify: `frontend-observatorio/src/pages/comex/ComexPage.jsx` (~247, ~310, ~333, ~349, ~363)
- Modify: `frontend-observatorio/src/pages/empresas/EmpresasPage.jsx` (~169, ~187, ~202, ~225, ~264; NÃO ~241; import)

**Interfaces:** Consumes: `NidPanel` (estban/comex já importam; **Empresas: estender** `import { NidPageHeader } from "../../components/nid/Panel";` → `import { NidPageHeader, NidPanel } from "../../components/nid/Panel";`). Produces: nada.

- [ ] **Step 1: Estban — 5 conversões (a 6ª NÃO)**

Títulos a converter: "Evolução da Captação — Depósitos por Tipo"; "Crédito vs. Captação Total"; "Composição das Operações de Crédito"; "Operações de Crédito por Instituição"; "Composição do Crédito por Instituição".
**NÃO converter** "Detalhamento por Instituição" (~349) — contém `<table>` crua (alvo do C3).

- [ ] **Step 2: Comex — 5 conversões (PlanGate e subs preservados)**

Títulos: "Exportações vs Importações"; "Volume Físico — Peso Exportado vs Importado (kg)"; "Top 10 Produtos"; "Top Produtos por Peso"; "Top 10 Países".
Os wrappers com `h3` `mb-1` seguidos de `<p className="text-xs text-[var(--text-mute)] mb-5">Ano: {anoSelecionado}</p>` usam a variante com sub: `<NidPanel title="..." sub={<>Ano: {anoSelecionado}</>}>` (o `<p>` some). Onde o wrapper está dentro de `<PlanGate ...>`, o gate fica e passa a envolver o `NidPanel`.

- [ ] **Step 3: Empresas — 5 conversões (MiniStat NÃO) + import**

1. Estender o import de `Panel.jsx` (ver Interfaces).
2. Títulos a converter: "Distribuição por Porte"; "Empresas por Situação Cadastral"; "Ativas vs. Fechadas por Porte"; "Empresas por Setor de Atividade (CNAE — Seção)"; "Capital Social por Porte de Empresa" (se tiver `<p>` de subtítulo, variante com `sub`).
**NÃO converter** "Indicadores de Composição" (~241) — lista `MiniStat` (C4).

- [ ] **Step 4: Conferir diffs + gates**

```bash
cd frontend-observatorio && git diff && npm run test && npm run build
```

Expected: gráficos byte-idênticos dentro dos novos painéis; 51 PASS; build 0.

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/pages/estban/EstbanPage.jsx frontend-observatorio/src/pages/comex/ComexPage.jsx frontend-observatorio/src/pages/empresas/EmpresasPage.jsx
git commit -m "feat(uxui): graficos em NidPanel em estban, comex e empresas"
```

---

### Task 3: Pix (ChartCard deletado) + Emendas (HBarChart)

**Files:**
- Modify: `frontend-observatorio/src/pages/pix/PixPage.jsx` (def do ChartCard ~19-32; usos ~219, ~232, ~245, ~258)
- Modify: `frontend-observatorio/src/pages/emendas/EmendasPage.jsx` (bloco de barras dentro do NidPanel "Destino por área", ~129-142)

**Interfaces:** Consumes: `NidPanel` (Pix já importa); `HBarChart` + `fmtMoneyShort` de `components/nid/charts` (Emendas já importa `fmtMoneyShort` e `BarraExecucao`; adicionar `HBarChart` ao import se ausente). Charts nid aceitam `emptyMessage` (self-render de vazio). Produces: nada.

- [ ] **Step 1: Pix — deletar ChartCard e converter os 4 usos**

1. Deletar a função local `ChartCard` (linhas ~19-32).
2. Cada uso vira `NidPanel` e o chart interno ganha `emptyMessage`; o prop `empty={serie.length === 0}` some (os charts nid renderizam o vazio sozinhos quando `data` é vazia). Exemplo com o primeiro uso — ANTES:

```jsx
      <ChartCard title="Volume de Recebimentos — PF vs PJ" empty={serie.length === 0}>
        <MultiLineChart
```

DEPOIS:

```jsx
      <NidPanel title="Volume de Recebimentos — PF vs PJ">
        <MultiLineChart
          emptyMessage="Sem dados disponíveis"
```

(idem para "Quantidade de Transações (Pagadores)" com `StackedBarChart`, "Pessoas Únicas Pagadoras" e "Pessoas Únicas Recebedoras" com `MultiLineChart`; fechamentos `</ChartCard>` → `</NidPanel>`.)

- [ ] **Step 2: Emendas — barras à mão → HBarChart**

Dentro do `<NidPanel title="Destino por área" sub="Total empenhado por função orçamentária">` (que fica), substituir o bloco inteiro:

ANTES:
```jsx
            <div className="space-y-2">
              {radar.por_funcao.map((f) => (
                <div key={f.funcao} className="flex items-center gap-3">
                  <span className="text-sm text-[var(--text)] w-40 truncate" title={f.funcao}>{f.funcao}</span>
                  <div className="flex-1 h-3 rounded-full bg-[var(--panel-2)] overflow-hidden" aria-hidden>
                    <div className="h-full rounded-full" style={{ width: `${(f.empenhado / maxFuncao) * 100}%`, background: "var(--accent-3)" }} />
                  </div>
                  <span className="text-xs text-[var(--text-dim)] w-24 text-right">{fmtMoneyShort(f.empenhado)}</span>
                </div>
              ))}
              {radar.por_funcao.length === 0 && (
                <p className="text-sm text-[var(--text-dim)] text-center py-4">Sem detalhamento por função.</p>
              )}
            </div>
```

DEPOIS:
```jsx
            <HBarChart
              data={radar.por_funcao.map((f) => ({ label: f.funcao, value: f.empenhado }))}
              color="var(--accent-3)"
              fmt={fmtMoneyShort}
              emptyMessage="Sem detalhamento por função."
            />
```

Se a variável local `maxFuncao` ficar sem uso após a troca, removê-la. Adicionar `HBarChart` ao import de `components/nid/charts` se ainda não estiver lá.

- [ ] **Step 3: Grep de sobras + gates**

```bash
cd frontend-observatorio && grep -rn "ChartCard" src && echo "FALHOU: sobrou ChartCard" || echo "OK sem ChartCard"
npm run test && npm run build
```

Expected: "OK sem ChartCard"; 51 PASS; build 0.

- [ ] **Step 4: Commit**

```bash
git add frontend-observatorio/src/pages/pix/PixPage.jsx frontend-observatorio/src/pages/emendas/EmendasPage.jsx
git commit -m "feat(uxui): NidPanel no Pix (ChartCard removido) e HBarChart nas emendas por funcao"
```

---

### Task 4: Verificação final (sem commit de código)

**Files:** nenhum.

**Interfaces:** n/a.

- [ ] **Step 1: Gates completos**

```bash
cd frontend-observatorio && npm run test && npm run build
```

Expected: 51 PASS; build 0.

- [ ] **Step 2: Greps de consistência**

```bash
cd frontend-observatorio
grep -rn "ChartCard" src
grep -c 'bg-\[var(--panel)\] p-6 rounded-2xl' src/pages/arrecadacao/ArrecadacaoPage.jsx src/pages/beneficios/BolsaFamiliaPage.jsx src/pages/beneficios/PeDeMeiaPage.jsx src/pages/inss/InssPage.jsx src/pages/estban/EstbanPage.jsx src/pages/comex/ComexPage.jsx src/pages/empresas/EmpresasPage.jsx src/pages/pix/PixPage.jsx
```

Expected: zero `ChartCard`; contagens restantes da classe de wrapper explicáveis SOMENTE pelas exclusões documentadas (tabela do Estban "Detalhamento por Instituição", MiniStat "Indicadores de Composição" de Empresas, e o 2º wrapper sem gráfico da Arrecadação) — listar no report o que cada ocorrência restante é.

- [ ] **Step 3: Intocadas**

```bash
git diff main --stat -- frontend-observatorio/src/pages/caged frontend-observatorio/src/pages/rais frontend-observatorio/src/pages/pib frontend-observatorio/src/pages/vaf frontend-observatorio/src/pages/ips frontend-observatorio/src/pages/fpm frontend-observatorio/src/pages/dinheiro-na-mesa
```

Expected: vazio.

- [ ] **Step 4: Reportar pendências**

Checklist visual (usuário): 9 páginas — títulos preservados, gráficos idênticos em conteúdo,
painéis com visual nid padronizado; Pix com vazios renderizados pelos charts; Emendas com
HBarChart no lugar das barras à mão.

---

## Self-review do plano (executado na escrita)

- **Spec coverage:** decisões 1–5 → Global Constraints + Tasks 1–3; tabela de alvos → Tasks 1–3 (contagens conferidas: 7 + 15 + Pix/Emendas); exclusões (tabela Estban, MiniStat, IPS, C3/C4) explícitas; greps/gates/checklist → Task 4.
- **Placeholders:** nenhum — template completo + títulos byte-exatos por página + before/after integral nos casos não triviais (Pix, Emendas, variante com sub).
- **Consistência:** `NidPanel({title, sub})` confere com `Panel.jsx:51`; `emptyMessage` confirmado em `charts.jsx` (MultiLine/Stacked/HBar); imports por página verificados (só Empresas precisa estender; Emendas talvez precise de `HBarChart`).
