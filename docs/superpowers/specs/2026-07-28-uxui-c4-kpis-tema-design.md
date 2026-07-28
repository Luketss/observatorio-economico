# UX/UI transversal — Ciclo 4: KPIs, legibilidade e tema — Design

**Data:** 2026-07-28
**Escopo:** frontend apenas (themes.css + 3 componentes novos + KpiCard + ~14 páginas; zero backend)
**Contexto:** 4º e último ciclo do UX/UI transversal
(C1 ordem ✅ → C2 NidPanel ✅ → C3 DataTable ✅ → **C4 KPIs/legibilidade/tema**).
Levantamento de 2026-07-28: IPS é a única página de dataset inteiramente fora do padrão nid
(~40 classes de cor crua + 3 paletas hex, pior caso `bg-amber-50` fixo no dark); 7 páginas usam
paletas Tailwind-500 literais nos gráficos; a prop `accent` do KpiCard vaza classe de cor crua no
valor de 20 KPIs em 7 páginas (sobrepõe o token nos 2 sentidos do tema); 3 variantes de skeleton
de KPI coexistem; "Selecione um município" tem 5 wordings.

O app tem **5 temas** (`neon`, `aurora`, `sunset`, `minimal`, `light`), cada um com seus
`--accent-1..5`. Convenção semântica já existente no design system: `.nid-delta.up` =
`--accent-5`, `.nid-delta.down` = `--accent-2` — este ciclo a segue.

## Decisões (validadas com o usuário)

1. **IPS: conversão completa ao padrão nid** (não só cores).
2. **KPIs coloridos via tokens** — mantém a identidade (verde=positivo etc.) via `var(--accent-N)`.
3. **Empresas: painel "Indicadores de Composição" removido por inteiro** (conteúdo 100%
   redundante com os KpiCards do topo; `MiniStat` morre junto).
4. **`NidSelect` compartilhado aplicado em 3 páginas** (Comex, Comparativo ×2, Emendas).
5. **Extras aprovados:** paletas hex → accents (7 páginas), skeletons de KPI unificados,
   copy transversal. PlanoGov/dados-internos fica para ciclo próprio.
6. **Empacotamento:** um ciclo, um plano por frentes independentes (modelo C2/C3).

## 1. Tema — tokens, paletas, KpiCard

### Tokens novos (definidos nos 5 temas em `styles/themes.css`)

- `--accent-6` e `--accent-7`: duas cores categóricas extras por tema, harmonizadas com a
  paleta do tema (violeta/ciano aparecem hoje como hex de facto nas paletas de RAIS/CAGED).
  Valores exatos por tema definidos no plano.
- `--chart-muted`: neutro para fatias/séries "Outros".

### Paletas hex → accents

Páginas: pix (×5 arrays), estban (×5, incl. 2 paletas de 7 cores), comex (×3), bolsa-família
(×3), arrecadação (×1), comparativo (×2, incl. `highlightColor`), empresas (×1 StackedBar) +
os 2 hex de fallback das paletas de RAIS/CAGED (`#8b5cf6`, `#06b6d4` → **`accent-6`/`accent-7`**,
pois essas paletas já usam accent-1..5 e as 2 cores extras precisam ser distintas — exceção à
tabela abaixo). Mapeamento por matiz:

| Hex atual | Token |
|---|---|
| azul `#3b82f6`/`#6366f1` | `--accent-1` |
| verde `#10b981` | `--accent-5` |
| âmbar/laranja `#f59e0b`/`#f97316` | `--accent-4` |
| violeta `#8b5cf6` | `--accent-3` |
| ciano `#06b6d4` | `--accent-7` |
| lima `#84cc16` | `--accent-6` |
| rosa/vermelho `#f43f5e`/`#ef4444` | `--accent-2` |
| cinza `#94a3b8` | `--chart-muted` |

Delta visual esperado: nos temas não-light, os gráficos dessas páginas mudam de tom — é o
objetivo do ciclo. `ImpactoPage` (hex só como fallback de `var()`) não muda.

### KpiCard — accent tokenizado

- A prop `accent` deixa de concatenar className (`KpiCard.jsx:128`) e passa a receber **cor
  CSS** aplicada via `style={{ color: accent }}` no valor.
- Migração dos 20 usos (comex ×3, empresas ×4, estban ×3, pix ×3, inss ×2, bolsa ×3,
  pé-de-meia ×2 — linhas no levantamento) + `CUSTOM_COLOR_MAP` do Dashboard Geral, com a
  semântica: positivo/verde→`accent-5`, negativo/vermelho→`accent-2`, MEI/violeta→`accent-3`,
  laranja/âmbar→`accent-4`, azul→`accent-1`.
- Nenhum uso restante de classe Tailwind na prop `accent` ao final do ciclo.

## 2. IPS — conversão completa ao padrão nid

Conteúdo, dados e lógica de comparação **idênticos**; troca a casca (587 linhas):

- **Header:** `<h1>` cru → `NidPageHeader` (sub "Índice de Progresso Social") +
  `InfoTooltip dataset="ips"`; wrapper `max-w-6xl` próprio morre → `motion.div` + `space-y-6`.
- **Controles:** `MunicipioPicker` mantido; botões de ano `bg-blue-500` → chips `nid-tab`
  (padrão RAIS/CAGED); labels Estado/Município/Ano tokenizados.
- **KPIs:** 3 cards manuais → grid de `KpiCard` (score geral, dimensões, posição — conteúdo
  atual). Cor de estado do score (≥70 / 50–69 / <50) → `accent-5`/`accent-4`/`accent-2`
  aplicada **no valor/chip, nunca como fundo do card** (mata o `bg-amber-50`).
- **Painéis:** 7 `div+h2` crus → `NidPanel` com os títulos atuais; barras de progresso
  manuais → `BarraExecucao`; `HBarChart`/`MultiLineChart` com accents (mata os 3 hex) e
  `emptyMessage`.
- **Loading:** "Carregando dados..." → `KpiSkeleton`/`ChartState` padrão.
- **Textos:** 20× `text-xs` migram para a escala nid (labels mono 10.5px uppercase, corpo
  13px); "Populacao"/"Area" acentuados; unidade unificada em "de 100" nas 3 formulações.
- **Não entra** (consistente com C1): `InsightsPanel`/`ReleasesPanel` (exigem backend),
  `PlanGate` (IPS é livre), mudança em fetch/dados.

## 3. Componentes novos, Empresas e copy

- **`NidSelect`** (`components/nid/NidSelect.jsx`): `<select>` fino —
  `border-[var(--border)] bg-[var(--panel)] text-[var(--text)] rounded-xl text-sm px-3 py-1.5`,
  focus ring `var(--accent-1)`, seta nativa (precedente FilterBar), `aria-label` obrigatório.
  Aplicado: Comex (ano, mata `ring-blue-500`), Comparativo (×2), Emendas (ano). Kanbans e
  PlanoGov ficam de fora.
- **`KpiSkeleton`** (`components/nid/KpiSkeleton.jsx`): um card de loading padrão =
  `.nid-kpi` envolvendo `ChartState kind="loading" shape="kpi"` (padrão que hoje só o CAGED
  compõe). Páginas mantêm seus grids e mapeiam N. Substitui as 3 variantes (~17 ocorrências
  em páginas de dataset), matando os 2 `bg-slate-50` (ESTBAN/Empresas).
- **`SelecioneMunicipio`** (`components/nid/SelecioneMunicipio.jsx`): bloco único
  "Selecione um município / Use 'Ver como' na administração de Municípios." substituindo as
  duplicações (comex, empresas, rais, caged, emendas, fpm, dinheiro-na-mesa).
- **Empresas:** painel "Indicadores de Composição" removido por inteiro (com `MiniStat` e o
  skeleton `bg-slate-50`); o `StackedBarChart` da página entra no sweep de paleta.
- **Comex:** subs "No período" dos KPIs passam a descrever o período aplicado, reaproveitando
  o `describeFilter` do FilterBar já usado na página.

## 4. Testes e gates

- **Sem testes novos** — C4 é casca visual, sem lógica pura nova; decisão de projeto exclui
  testes de componente React. Gates: suite vitest atual (74) exit 0 + `npm run build` exit 0.
  Eslint baseline sujo não é gate.
- **Checklist visual (usuário):** IPS nos 5 temas (dark sem blocos claros); 20 KPIs coloridos
  acompanhando o tema; gráficos das 7 páginas com accents; selects de Comex/Comparativo/
  Emendas uniformes; skeletons de KPI idênticos; "Selecione um município" único; painel de
  Empresas ausente sem buraco de layout; sub dos KPIs do Comex com o período real.

## Fora de escopo

- Landing/login (sistemas visuais próprios por design); admin/*; tabs de
  desenvolvimento-econômico; PlanoGov/dados-internos (57 hits — ciclo próprio);
  releases (CSS de impressão proposital); CalendarioPage (9px inline — dados internos).
- `InsightsPanel` para IPS/FPM/DnM/Emendas (feature de backend).
- Unificação KpiCard×NidKpiHero — os 2 padrões seguem coexistindo (RAIS/CAGED/Dashboard
  mantêm o Hero).
- Minors aceitos do C3.
- Zero backend.
