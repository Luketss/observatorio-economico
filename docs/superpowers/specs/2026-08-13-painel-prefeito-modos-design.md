# Painel do Prefeito — Modos Gerencial/Detalhado — Design

**Data:** 2026-08-13
**Status:** aprovado pelo usuário (2026-08-13, blocos e persistência escolhidos por seleção)

## Objetivo

O Painel do Prefeito hoje é completo mas difuso. Ganha um toggle entre duas
visões: **Gerencial** (default — bater o olho: prioridades do mês, números
macro, alertas, funil e projetos em andamento) e **Detalhado** (o conteúdo
completo atual, intocado).

## Decisões aprovadas

- **Blocos do modo gerencial:** Prioridades do mês + KPIs macro & alertas +
  Funil-resumo & Projetos. **Sem gráficos** (opção não selecionada).
- **Persistência:** por dispositivo (`localStorage`, padrão do tema). Default
  na primeira visita: **gerencial**.
- **Modo detalhado = página atual intocada** (13 KPIs do Panorama + cards por
  secretaria).

## Arquitetura

Tudo em `frontend-observatorio/`; **zero backend** (endpoints já existem:
`GET /desenvolvimento-economico/funil/resumo` — só `get_current_user`, sem
gating de módulo — e `GET /projetos`).

### 1. Toggle + persistência (`PainelPrefeitoPage.jsx`)

- Estado `modo` (`"gerencial" | "detalhado"`) com lazy-init lendo
  `localStorage.getItem("nid-painel-modo")` (fallback `"gerencial"`) e
  `useEffect` de escrita — mesmo padrão do `ThemeContext` (`nid-theme`).
- UI do toggle: **`chips` do `NidPageHeader`** (prop existente — zero mudança
  de componente): dois chips `Gerencial`/`Detalhado`, o ativo com
  `active: true`, `onClick` troca o modo.
- Helper puro `src/utils/painelModo.js`: `lerModo()` /
  `persistirModo(modo)` / `MODO_DEFAULT` — testável e à prova de
  `localStorage` indisponível (try/catch devolvendo default).

### 2. Blocos comuns aos dois modos (posição atual, intocados)

`PrioridadesPanel`, `AlertaFpmCard`, `DinheiroNaMesaCard`,
`EmendasResumoCard` — já são autossuficientes (fetch próprio) e continuam no
topo nos DOIS modos.

### 3. Modo gerencial (novo conteúdo abaixo dos blocos comuns)

- **KPIs macro:** subconjunto curado do registry `METRICS` existente —
  `PANORAMA_GERENCIAL = ["pib", "arrecadacao", "caged", "vaf"]` — renderizado
  com o MESMO map de KpiCard+Link do Panorama (nenhum fetch novo; `resumo`
  já carrega tudo no mount).
- **`FunilResumoCard`** (novo, `src/components/FunilResumoCard.jsx`): fetch
  próprio de `/desenvolvimento-economico/funil/resumo`; mostra os 4 números
  (leads por estágio somados, valor potencial, taxa de conversão, em
  implantação — mesma semântica dos KPIs da FunilTab) + link "Ver funil" →
  `/app/desenvolvimento-economico/funil`. Se a API falhar ou vier vazia
  (total 0), o card mostra estado vazio discreto (não some — o prefeito deve
  saber que o funil existe e está vazio).
- **`ProjetosResumoCard`** (novo, `src/components/ProjetosResumoCard.jsx`):
  fetch próprio de `/projetos`; contadores (total, em andamento, atrasados —
  via `diasAtraso`/`progresso` de `utils/projetoStatus.js` existentes) + até
  3 projetos `em_andamento` (título, % de tarefas, dias de atraso quando
  houver) + link "Ver projetos" → `/app/projetos`. Estado vazio discreto.
- Lógica de resumo pura extraída: `resumoProjetos(projetos, hoje?)` em
  `src/utils/projetosResumo.js` → `{ total, em_andamento, concluidos,
  atrasados, top: [{id, titulo, pct, diasAtraso}] }` (top = em_andamento
  ordenados por atraso desc, depois maior % — os que precisam de atenção),
  com teste vitest.
- Os fetches dos dois cards só disparam quando o card monta (modo gerencial)
  — quem vive no detalhado não paga as 2 chamadas.

### 4. Modo detalhado

Renderiza exatamente o que a página renderiza hoje (Panorama 13 KPIs +
Por secretaria/área). Nenhuma mudança nos blocos.

## Fora de escopo

- Gráficos no modo gerencial; mudanças no conteúdo do modo detalhado;
  qualquer backend; preferência por usuário na conta; mudanças no
  `NidPageHeader`/`NidTabBar`.

## Testes e verificação

- Vitest puro: `painelModo` (default, persistência, localStorage quebrado) e
  `projetosResumo` (contadores, top 3 por atenção, listas vazias).
- Teste jsdom leve dos dois cards novos (mock de `api`): renderiza números e
  estado vazio.
- Suíte completa frontend; backend intocado.
- Manual: alternar os modos e recarregar (persistência); modo gerencial com
  funil/projetos vazios mostra estados vazios; detalhado idêntico ao atual.
