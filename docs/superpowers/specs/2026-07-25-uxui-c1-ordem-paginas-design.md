# UX/UI transversal — Ciclo 1: ordem padrão nas páginas de dataset — Design

**Data:** 2026-07-25
**Escopo:** frontend apenas (12 arquivos de página; zero backend, zero componente novo)
**Contexto:** o padrão-ouro (CagedPage/RaisPage) é header → filtros/toolbar → KPI cards →
strip local → `InsightsPanel` (IA) → gráficos. Levantamento de 2026-07-25: 10 páginas exibem o
`InsightsPanel` ACIMA dos cards; Pé-de-Meia e Empresas usam header cru em vez de `NidPageHeader`.

Este é o 1º de 4 ciclos acordados do UX/UI transversal:
C1 ordem/estrutura (este) → C2 gráficos em `NidPanel` → C3 tabelas cruas → `DataTable` →
C4 KPIs/legibilidade/tema (IPS hardcoded, select do Comex, textos).

## Decisões (validadas com o usuário)

1. **Ordem-alvo nas 10 páginas:** header → filtros/toolbar (como estão) → grid de KPIs →
   `InsightsPanel` → restante (gráficos/tabelas/comparativo) na ordem atual.
2. **Só reordenação**: o bloco `<InsightsPanel dataset="..."/>` (com wrapper de margem, se houver)
   move para logo após o grid de KPIs. Nenhum outro elemento muda de lugar ou de conteúdo.
3. **`NidPageHeader` em Pé-de-Meia e Empresas**, preservando título/subtítulo/ícone atuais.
4. **Fora do escopo (ciclos futuros ou features próprias):** as 4 páginas sem `InsightsPanel`
   (ips, fpm, dinheiro-na-mesa, emendas — adicionar IA nelas é feature de backend); banners hero
   do FPM/Dinheiro-na-Mesa; criação de strips locais de insight (conteúdo curado, só Caged/RAIS
   têm); wrappers de gráfico, tabelas e KPIs hero (C2–C4).

## Páginas e mudanças

| Página | Mudança |
|---|---|
| `pib/PibPage.jsx` | mover InsightsPanel p/ depois dos KPIs |
| `arrecadacao/ArrecadacaoPage.jsx` | idem |
| `beneficios/BolsaFamiliaPage.jsx` | idem |
| `beneficios/PeDeMeiaPage.jsx` | idem + header cru → `NidPageHeader` |
| `inss/InssPage.jsx` | idem |
| `estban/EstbanPage.jsx` | idem |
| `comex/ComexPage.jsx` | idem |
| `empresas/EmpresasPage.jsx` | idem + header cru → `NidPageHeader` |
| `pix/PixPage.jsx` | idem |
| `vaf/VafPage.jsx` | idem |

Caged e RAIS já seguem o padrão — intocadas. Loading/empty states, fetches, `PlanGate`,
`CompareToggle`, tabs de ano e `NidComparativoPanel` permanecem exatamente como estão (o
comparativo continua na posição atual relativa aos gráficos).

## Testes e gates

- Mudança de ordem de JSX: **sem testes novos** (padrão do projeto — pure-logic + build).
- Gates: vitest 51 exit 0; `npm run build` exit 0. Eslint baseline sujo conhecido — não é gate.
- **Checklist visual (usuário):** abrir as 12 páginas; conferir ordem
  header → filtros → KPIs → InsightsPanel → gráficos; headers novos em Pé-de-Meia/Empresas
  idênticos em conteúdo aos antigos; nada mais mudou de lugar.

## Fora de escopo

Tudo dos ciclos C2–C4; InsightsPanel nas 4 páginas sem IA; qualquer mudança de copy/dados.
