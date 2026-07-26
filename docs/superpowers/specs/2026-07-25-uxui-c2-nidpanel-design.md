# UX/UI transversal — Ciclo 2: todo gráfico em NidPanel — Design

**Data:** 2026-07-25
**Escopo:** frontend apenas (9 páginas de dataset + pix + emendas; zero backend, zero componente novo)
**Contexto:** 2º dos 4 ciclos acordados (C1 ordem ✓ → **C2 NidPanel** → C3 DataTable → C4
KPIs/legibilidade/tema). O levantamento de 25/07 mostrou gráficos embrulhados em três idiomas:
`NidPanel` (alvo), `div` cru estilizado + `<h3>` (maioria), e o `ChartCard` local do Pix que
duplica o `NidPanel`. Emendas reimplementa um bar chart à mão dentro de um `NidPanel`.

## Decisões (validadas com o usuário)

1. **Conversão mecânica**: cada wrapper cru
   `<div className="bg-[var(--panel)] p-6 rounded-2xl shadow-sm border border-[var(--border)]"><h3 ...>Título</h3>{gráfico}</div>`
   vira `<NidPanel title="Título">{gráfico}</NidPanel>`. Gráfico e todas as suas props intactos.
2. **`ChartCard` do Pix deletado**; seus usos viram `NidPanel` com empty-state preservado no
   idioma nid (condicional existente mantida dentro do painel, ou `emptyMessage` do próprio chart
   quando é o mecanismo já disponível).
3. **Emendas**: o miolo de barras feitas à mão (seção "por função") vira
   `<HBarChart data={...} color="var(--accent-3)" fmt={fmtMoneyShort} emptyMessage="Sem detalhamento por função." />`
   — o `NidPanel` externo já existe e fica.
4. **IPS inteira fica para o C4** (página divergente; tema hardcoded será refeito lá).
5. **Fora de escopo**: `MiniStat` de Empresas (apresentação de KPI → C4); tabelas cruas (C3);
   select nativo do Comex (C4); qualquer mudança de dados/props de gráfico.

## Regras de conversão

- `title` = texto do `<h3>` byte-idêntico; se houver subtítulo em `<p>` logo abaixo do título,
  vira `sub`. `NidPanel({ title, sub, tabs, onTabChange, children, right })` — usar só
  `title`/`sub` (e `right` apenas se o wrapper cru tinha controle no cabeçalho).
- Grids externos (`nid-grid-2`, `grid lg:grid-cols-2`, etc.) e `PlanGate` ficam onde estão;
  no Comex, o `PlanGate` passa a envolver o `NidPanel` como envolvia a `div` crua.
- Delta visual esperado e desejado: painéis convertidos assumem o estilo `nid-panel` do tema.

## Páginas e alvos (contagens conferidas no plano, arquivo a arquivo)

| Página | Alvo |
|---|---|
| `arrecadacao/ArrecadacaoPage.jsx` | 1 wrapper cru → NidPanel |
| `beneficios/BolsaFamiliaPage.jsx` | 2 wrappers crus |
| `beneficios/PeDeMeiaPage.jsx` | 2 wrappers crus |
| `inss/InssPage.jsx` | 2 wrappers crus |
| `estban/EstbanPage.jsx` | 5 wrappers crus |
| `comex/ComexPage.jsx` | ~5 wrappers crus (incl. dentro de PlanGate) |
| `empresas/EmpresasPage.jsx` | ~5 wrappers crus (MiniStat fica) |
| `pix/PixPage.jsx` | deletar `ChartCard`; 4 usos → NidPanel |
| `emendas/EmendasPage.jsx` | barras à mão → HBarChart (NidPanel externo fica) |

Intocadas: caged, rais (padrão-ouro), pib, vaf (já consistentes em NidPanel), ips (C4),
fpm e dinheiro-na-mesa (gráficos já em NidPanel; tabelas cruas são C3).

## Testes e gates

- Sem testes novos (conversão de markup; padrão do projeto).
- Gates: vitest 51 exit 0; `npm run build` exit 0.
- Greps finais: zero ocorrências de `bg-[var(--panel)] p-6 rounded-2xl` como wrapper de gráfico
  nas páginas do escopo; zero `ChartCard` no repo.
- **Checklist visual (usuário):** as 9 páginas + pix + emendas — títulos preservados, gráficos
  idênticos em conteúdo, painéis com o visual nid padronizado; barras de Emendas agora com o
  HBarChart padrão.
