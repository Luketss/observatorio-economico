# UX/UI Ciclo 1 — ordem padrão nas páginas de dataset — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Padronizar a ordem header → filtros → KPI cards → InsightsPanel → gráficos em 10 páginas de dataset e adotar `NidPageHeader` em Pé-de-Meia e Empresas.

**Architecture:** Reordenação pura de JSX por página (mover a linha `<InsightsPanel dataset="..."/>` para depois do bloco de KPI cards) + substituição de 2 headers crus pelo componente `NidPageHeader` existente. Zero componente novo, zero backend.

**Tech Stack:** React + Vite; componentes existentes (`InsightsPanel`, `KpiCard`, `NidPageHeader` de `components/nid/Panel.jsx`).

**Spec:** `docs/superpowers/specs/2026-07-25-uxui-c1-ordem-paginas-design.md`

## Global Constraints

- **Só reordenação**: em cada página, a ÚNICA mudança estrutural é a linha `<InsightsPanel dataset="..." />` mudando de posição (e, nas 2 páginas de header, o bloco do header). `git diff` por arquivo deve mostrar essencialmente 1 linha removida + 1 adicionada (± linhas em branco) — qualquer outra mudança é bug.
- Posição-alvo do `<InsightsPanel/>`: **imediatamente após o fechamento do bloco de KPI cards** (o `)}` que encerra o ternário `{loading ? (grid skeleton) : (grid de <KpiCard/>)}`), separado por linha em branco antes e depois. Filtros/toolbar (FilterBar, CompareToggle, selects) ficam ONDE ESTÃO (antes dos KPIs).
- Se o bloco de KPIs está dentro de um branch condicional (fragmento `<>` do estado carregado) e o `InsightsPanel` original estava fora, o painel entra NO MESMO branch dos KPIs — intencional: padroniza com as demais páginas (painel só aparece com dados carregados).
- Caged e RAIS **intocadas** (já seguem o padrão). As 4 páginas sem InsightsPanel (ips, fpm, dinheiro-na-mesa, emendas) **intocadas**.
- `NidPageHeader({ title, sub, badge, chips })` — usar só `title` e `sub`; título/subtítulo/`InfoTooltip` idênticos em conteúdo aos atuais.
- Gates por task: `npm run test` (51) e `npm run build` exit 0, de `frontend-observatorio/`. Eslint baseline sujo — não é gate.
- Commits `feat(uxui):`. NÃO commitar WIP do usuário: `.claude/settings.local.json`, `README.md`, `dados/`, `docs/superpowers/plans/2026-05-06-ips-feature.md`, `IDEAS.md`.

---

### Task 1: Branch + reordenar lote 1 (pib, arrecadacao, bolsa_familia, pe_de_meia, inss)

**Files:**
- Modify: `frontend-observatorio/src/pages/pib/PibPage.jsx`
- Modify: `frontend-observatorio/src/pages/arrecadacao/ArrecadacaoPage.jsx`
- Modify: `frontend-observatorio/src/pages/beneficios/BolsaFamiliaPage.jsx`
- Modify: `frontend-observatorio/src/pages/beneficios/PeDeMeiaPage.jsx`
- Modify: `frontend-observatorio/src/pages/inss/InssPage.jsx`

**Interfaces:** Consumes/Produces: nada — reordenação isolada por arquivo.

- [ ] **Step 1: Criar a branch a partir do main**

```bash
git checkout main
git checkout -b feat/uxui-c1-ordem
```

- [ ] **Step 2: Aplicar a reordenação nas 5 páginas**

O padrão é o MESMO nas 5 (localizar por conteúdo; linhas de referência são do arquivo atual). Em cada página:

(a) **Remover** a linha do painel (e a linha em branco que a segue). Snippets atuais exatos:

`PibPage.jsx` (linha ~192, logo após `) : (` e `<>`):
```jsx
      <InsightsPanel dataset="pib" />

      <FilterBar id="filter-bar-pib" years={years} value={filters} onChange={setFilters} />
```
→ fica só a linha do `<FilterBar .../>`.

`ArrecadacaoPage.jsx` (linha ~138):
```jsx
      <InsightsPanel dataset="arrecadacao" />

      <div className="flex items-center justify-end">
```
→ fica só a linha do `<div className="flex items-center justify-end">`.

`BolsaFamiliaPage.jsx` (linha ~134):
```jsx
      <InsightsPanel dataset="bolsa_familia" />

      <div className="flex items-center justify-end">
```

`PeDeMeiaPage.jsx` (linha ~143):
```jsx
      <InsightsPanel dataset="pe_de_meia" />

      <div className="flex items-center justify-end">
```

`InssPage.jsx` (linha ~143):
```jsx
      <InsightsPanel dataset="inss" />

      <FilterBar id="filter-bar-inss" years={years} value={filters} onChange={setFilters} />
```

(b) **Inserir** a mesma linha após o bloco de KPIs. Em todas as 5, os KPIs são um ternário
`{loading ? ( <div className="grid ...">skeletons</div> ) : ( <div className="grid ...">{cards.map(... <KpiCard .../>)}</div> )}` — localizar o `<KpiCard key={c.label} {...c} />`, o `</div>` do grid e o `)}` que fecha o ternário, e inserir logo APÓS esse `)}`:

```jsx

      <InsightsPanel dataset="pib" />
```

(com o dataset correto de cada página: `"pib"`, `"arrecadacao"`, `"bolsa_familia"`, `"pe_de_meia"`, `"inss"`; linha em branco antes e depois; mesma indentação do bloco de KPIs).

- [ ] **Step 3: Conferir os diffs**

```bash
cd frontend-observatorio && git diff --stat && git diff
```

Expected: 5 arquivos; em cada um, exatamente a linha `<InsightsPanel .../>` removida de cima e adicionada abaixo do `)}` dos KPIs (± linhas em branco). Nada mais.

- [ ] **Step 4: Gates**

```bash
cd frontend-observatorio && npm run test && npm run build
```

Expected: 51 testes PASS; build exit 0.

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/pages/pib/PibPage.jsx frontend-observatorio/src/pages/arrecadacao/ArrecadacaoPage.jsx frontend-observatorio/src/pages/beneficios/BolsaFamiliaPage.jsx frontend-observatorio/src/pages/beneficios/PeDeMeiaPage.jsx frontend-observatorio/src/pages/inss/InssPage.jsx
git commit -m "feat(uxui): KPIs acima do InsightsPanel em pib, arrecadacao, bolsa familia, pe-de-meia e inss"
```

---

### Task 2: Reordenar lote 2 (estban, comex, empresas, pix, vaf)

**Files:**
- Modify: `frontend-observatorio/src/pages/estban/EstbanPage.jsx`
- Modify: `frontend-observatorio/src/pages/comex/ComexPage.jsx`
- Modify: `frontend-observatorio/src/pages/empresas/EmpresasPage.jsx`
- Modify: `frontend-observatorio/src/pages/pix/PixPage.jsx`
- Modify: `frontend-observatorio/src/pages/vaf/VafPage.jsx`

**Interfaces:** Consumes/Produces: nada — reordenação isolada por arquivo.

- [ ] **Step 1: Aplicar a reordenação nas 5 páginas**

Mesmo procedimento da Task 1 (remover a linha de cima; inserir após o `)}` do ternário de KPIs, linha em branco antes/depois, indentação do bloco). Snippets atuais exatos a remover:

`EstbanPage.jsx` (linha ~163):
```jsx
      <InsightsPanel dataset="estban" />

      <div className="flex items-center justify-end">
```

`ComexPage.jsx` (linha ~221 — **nota**: aqui o painel está FORA do fragmento condicional, após um `)}`; ao mover para depois do bloco de KPIs ele entra no fluxo onde os KPIs vivem, o que é intencional — ver Global Constraints):
```jsx
      <InsightsPanel dataset="comex" />

      <div className="flex items-center justify-end">
```

`EmpresasPage.jsx` (linha ~150):
```jsx
      <InsightsPanel dataset="empresas" />

      {/* KPI Cards */}
```
→ fica só a linha do comentário `{/* KPI Cards */}`.

`PixPage.jsx` (linha ~156):
```jsx
      <InsightsPanel dataset="pix" />

      <div className="flex items-center justify-end">
```

`VafPage.jsx` (linha ~210):
```jsx
      <InsightsPanel dataset="vaf" />

      <FilterBar id="filter-bar-vaf" years={years} value={filters} onChange={setFilters} />
```

Inserção com os datasets: `"estban"`, `"comex"`, `"empresas"`, `"pix"`, `"vaf"`.
No `PixPage.jsx` o map de cards é inline (`{cards.map((c) => <KpiCard key={c.label} {...c} />)}`) — o alvo continua sendo o `)}` que fecha o ternário loading/cards.

- [ ] **Step 2: Conferir os diffs**

```bash
cd frontend-observatorio && git diff --stat && git diff
```

Expected: 5 arquivos; só a linha do painel movida em cada (± linhas em branco).

- [ ] **Step 3: Gates**

```bash
cd frontend-observatorio && npm run test && npm run build
```

Expected: 51 PASS; build exit 0.

- [ ] **Step 4: Commit**

```bash
git add frontend-observatorio/src/pages/estban/EstbanPage.jsx frontend-observatorio/src/pages/comex/ComexPage.jsx frontend-observatorio/src/pages/empresas/EmpresasPage.jsx frontend-observatorio/src/pages/pix/PixPage.jsx frontend-observatorio/src/pages/vaf/VafPage.jsx
git commit -m "feat(uxui): KPIs acima do InsightsPanel em estban, comex, empresas, pix e vaf"
```

---

### Task 3: NidPageHeader em Pé-de-Meia e Empresas

**Files:**
- Modify: `frontend-observatorio/src/pages/beneficios/PeDeMeiaPage.jsx` (imports + header ~linhas 112-123)
- Modify: `frontend-observatorio/src/pages/empresas/EmpresasPage.jsx` (imports + header ~linhas 112-129)

**Interfaces:**
- Consumes: `NidPageHeader({ title, sub, badge, chips })` de `components/nid/Panel.jsx` (usar só `title`/`sub`).
- Produces: nada.

- [ ] **Step 1: PeDeMeiaPage — import e header**

1. No import existente `import { NidPanel, NidLegend } from "../../components/nid/Panel";` (linha 9), adicionar `NidPageHeader`:

```js
import { NidPageHeader, NidPanel, NidLegend } from "../../components/nid/Panel";
```

2. Substituir o bloco do header cru (dentro do `motion.div`, linhas ~112-123):

```jsx
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">
            Pé-de-Meia
          </h1>
          <InfoTooltip dataset="pe_de_meia" />
        </div>
        <p className="text-sm text-[var(--text-mute)] mt-1">
          Incentivos financeiros a estudantes do ensino médio público.
        </p>
      </div>
```

por:

```jsx
      <NidPageHeader
        title={<>Pé-de-Meia <InfoTooltip dataset="pe_de_meia" /></>}
        sub="Incentivos financeiros a estudantes do ensino médio público."
      />
```

- [ ] **Step 2: EmpresasPage — import e header**

1. Verificar o import de `Panel` no arquivo: se já importa algo de `../../components/nid/Panel`, adicionar `NidPageHeader` à lista; se não importa nada, adicionar:

```js
import { NidPageHeader } from "../../components/nid/Panel";
```

2. Substituir o bloco do header cru (linhas ~112-129):

```jsx
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">
            Empresas — CNPJ
          </h1>
          <InfoTooltip dataset="empresas" />
        </div>
        <p className="text-sm text-[var(--text-mute)] mt-1">
          Perfil e composição do tecido empresarial local.
        </p>
      </div>
```

por:

```jsx
      <NidPageHeader
        title={<>Empresas — CNPJ <InfoTooltip dataset="empresas" /></>}
        sub="Perfil e composição do tecido empresarial local."
      />
```

(Se o bloco real do header diferir minimamente dos snippets acima — ex.: classes ou espaçamento —, preservar o TEXTO exato do título/subtítulo e o `InfoTooltip` com o dataset correto; o objetivo é trocar o markup cru pelo componente sem mudar conteúdo.)

- [ ] **Step 3: Gates**

```bash
cd frontend-observatorio && npm run test && npm run build
```

Expected: 51 PASS; build exit 0.

- [ ] **Step 4: Commit**

```bash
git add frontend-observatorio/src/pages/beneficios/PeDeMeiaPage.jsx frontend-observatorio/src/pages/empresas/EmpresasPage.jsx
git commit -m "feat(uxui): NidPageHeader em Pe-de-Meia e Empresas"
```

---

### Task 4: Verificação final (sem commit de código)

**Files:** nenhum.

**Interfaces:** n/a.

- [ ] **Step 1: Gates completos**

```bash
cd frontend-observatorio && npm run test && npm run build
```

Expected: 51 PASS; build exit 0.

- [ ] **Step 2: Verificação mecânica da ordem (KPI antes do painel)**

De `frontend-observatorio/`, para cada uma das 10 páginas, a linha do primeiro `<KpiCard` deve vir ANTES da linha do `<InsightsPanel`:

```bash
for f in src/pages/pib/PibPage.jsx src/pages/arrecadacao/ArrecadacaoPage.jsx src/pages/beneficios/BolsaFamiliaPage.jsx src/pages/beneficios/PeDeMeiaPage.jsx src/pages/inss/InssPage.jsx src/pages/estban/EstbanPage.jsx src/pages/comex/ComexPage.jsx src/pages/empresas/EmpresasPage.jsx src/pages/pix/PixPage.jsx src/pages/vaf/VafPage.jsx; do
  k=$(grep -n "<KpiCard" "$f" | head -1 | cut -d: -f1)
  i=$(grep -n "<InsightsPanel" "$f" | head -1 | cut -d: -f1)
  if [ "$k" -lt "$i" ]; then echo "OK  $f ($k < $i)"; else echo "FAIL $f ($k >= $i)"; fi
done
```

Expected: 10× `OK`.

- [ ] **Step 3: Conferir intocadas**

```bash
git diff main --stat -- frontend-observatorio/src/pages/caged frontend-observatorio/src/pages/rais frontend-observatorio/src/pages/ips frontend-observatorio/src/pages/fpm frontend-observatorio/src/pages/dinheiro-na-mesa frontend-observatorio/src/pages/emendas
```

Expected: vazio (zero mudanças).

- [ ] **Step 4: Reportar pendências**

Checklist visual (usuário): abrir as 12 páginas alteradas; ordem header → filtros → KPIs →
InsightsPanel → gráficos; headers de Pé-de-Meia/Empresas idênticos em conteúdo; nada mais mudou.

---

## Self-review do plano (executado na escrita)

- **Spec coverage:** decisões 1–4 da spec → Global Constraints; tabela de 10 páginas → Tasks 1–2 (5+5); headers → Task 3; intocadas + gates + checklist → Task 4.
- **Placeholders:** nenhum — remoções com snippets verbatim colhidos do código real; inserção definida por âncora inequívoca (`)}` do ternário de KPIs) + regra de fallback explícita na Task 3 para drift mínimo de markup.
- **Consistência:** datasets por página conferidos com os snippets reais; `NidPageHeader({title, sub})` confere com a assinatura real (`Panel.jsx:4`); nota do Comex (painel fora do fragmento) documentada como mudança intencional nas Global Constraints.
