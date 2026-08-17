# Plano — Tooltips: padronização ao tema + cobertura CAGED/RAIS/Painel do Prefeito

**Data:** 2026-08-17
**Origem:** reclamação de usuários — tooltips com fundos de cores diferentes (deveriam seguir o tema de cores escolhido na plataforma) e telas sem tooltip ⓘ (CAGED, RAIS, Painel do Prefeito).
**Design aprovado em chat (bounded)** — não há spec formal; este plano é o artefato operacional.

## Contexto (mapa do código)

Front: React 19 + Vite + Tailwind 3.4 (`darkMode: "class"`), root em `frontend-observatorio/`. Temas: 5 opções (`neon`, `aurora`, `sunset`, `minimal`, `light`) aplicadas como classe `theme-<id>` no `<body>` (`src/context/ThemeContext.jsx`); tokens CSS por tema em `src/styles/themes.css:7-190` (`--panel`, `--panel-2`, `--border`, `--border-strong`, `--text`, `--text-dim`, `--text-mute`, `--accent-1..7`, etc.).

Tooltips ⓘ existentes (duplicados, divergentes — causa da reclamação):
- `src/components/ChartInfoIcon.jsx` — ⓘ de título de painel, renderizado por `src/components/nid/Panel.jsx:64` quando `dataset && indicadorKey`. Bolha em `ChartInfoIcon.jsx:134`: **hardcoded** `bg-slate-800 text-white`, seta `border-t-slate-800` (`:137`). Ícone hardcoded `text-teal-500 hover:text-teal-600` / `text-slate-300` (`:113-117`). Botão tem `title=` nativo redundante (`:118`).
- `src/components/KpiCard.jsx` — ⓘ do card KPI. Bolha em `KpiCard.jsx:198`: **correta** `bg-[var(--panel)] border border-[var(--border)] text-[var(--text)]`, seta `bg-[var(--panel)] rotate-45` (`:202`). Ícone via `style` com `var(--accent-1)` / `var(--text-mute)` (`:178-180`). Botão também tem `title=` redundante (`:181`).
- Ambos usam `createPortal(..., document.body)` + `position: fixed` (motivo: `.nid-panel`/`.nid-kpi` têm `backdrop-filter` que cria stacking context; NÃO remover o portal).
- `src/components/InfoTooltip.jsx` — popover de dataset no header; fundo já tokenizado, mas ícone `text-blue-500` hardcoded (`:57`).
- `.nid-tip` (tooltips dos gráficos SVG, `themes.css:741-774`) — já tokenizado, fora do escopo.

Dados dos tooltips: `GET /indicadores?dataset&indicador_key`, `PUT /indicadores/{dataset}/{key}`. O ⓘ só aparece se `isGlobal || info.tooltip || info.descricao` — conteúdo é preenchido depois no admin (`src/pages/admin/IndicadoresAdminPage.jsx`). Catálogo de chaves: `src/utils/indicadorCatalog.js` (`INDICADOR_CATALOG`), com teste de paridade `indicadorCatalog.test.js` garantindo que todo `indicadorKey` no JSX existe no catálogo.

## Global Constraints

1. **Nenhuma cor hardcoded nova em superfície de tooltip** — só tokens do tema (`var(--panel)`, `var(--border)`, `var(--text)`, `var(--text-mute)`, `var(--accent-1)`); as superfícies editadas ficam corretas nos 5 temas (conferir especialmente `theme-light`).
2. A bolha do tooltip ⓘ tem **uma única fonte de estilo** (classe `.nid-info-tip` em `themes.css`) consumida por `ChartInfoIcon` e `KpiCard` — visual final idêntico ao atual do `KpiCard` (rounded-xl, px-3 py-2, shadow, w-56, text-xs).
3. Comportamento existente preservado: portal + `position: fixed`, fechar em scroll/resize, ⓘ só renderiza quando `isGlobal || info.tooltip || info.descricao`, e `NidPanel`/`KpiCard` sem `dataset`/`indicadorKey` continuam sem ⓘ.
4. Teste de paridade do catálogo (`indicadorCatalog.test.js`) passa — toda chave nova usada no JSX entra em `INDICADOR_CATALOG` com `tipo` e `label` PT-BR.
5. Suíte do front inteira verde: `npm test` (vitest run) em `frontend-observatorio/`. Baseline ~193 testes.
6. TDD: teste primeiro, depois implementação. Commits com mensagens no padrão do repo (`fix(...)`/`feat(...)`, PT-BR).
7. Nenhum descarte silencioso: se algo do plano não se aplicar ao código real, reportar em vez de pular.

## Task 1 — Padronizar a bolha do tooltip ⓘ ao tema (`.nid-info-tip`)

**Arquivos:** `frontend-observatorio/src/styles/themes.css`, `src/components/ChartInfoIcon.jsx`, `src/components/KpiCard.jsx`, `src/components/InfoTooltip.jsx`, testes `src/components/ChartInfoIcon.test.jsx` (+ teste de KpiCard se existir; criar assertions onde couber).

1. Em `themes.css`, criar (perto de `.nid-tip`, ~linha 741) as classes:
   - `.nid-info-tip { background: var(--panel); border: 1px solid var(--border); color: var(--text); border-radius: 0.75rem; padding: 0.5rem 0.75rem; box-shadow: var(--shadow-card, 0 20px 40px -12px rgba(0,0,0,0.35)); }`
   - `.nid-info-tip__arrow { background: var(--panel); border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); }` (quadradinho rotacionado 45° — replicar o approach atual da seta do KpiCard).
   - Ajustar valores se necessário para reproduzir exatamente o visual atual do tooltip do KpiCard.
2. `ChartInfoIcon.jsx`: a bolha (linha ~134) passa a usar `nid-info-tip` (mantendo `fixed z-50 w-56 text-xs pointer-events-none` e o cálculo de posição); a seta (~137) vira `nid-info-tip__arrow` com `rotate-45` (trocar o triângulo de border pelo quadradinho, como no KpiCard). Ícone ⓘ: substituir `text-teal-500 hover:text-teal-600`/`text-slate-300` por `style` com `var(--accent-1)` (com conteúdo) / `var(--text-mute)` (sem), espelhando `KpiCard.jsx:178-180`. Remover o `title=` nativo do botão (linha ~118) — o tooltip custom já cobre o hover; manter/garantir `aria-label`.
3. `KpiCard.jsx`: bolha (~198) e seta (~202) passam a usar as mesmas classes `.nid-info-tip`/`.nid-info-tip__arrow` (removendo os arbitrary values equivalentes). Remover `title=` redundante do botão (~181), manter `aria-label`.
4. `InfoTooltip.jsx:57`: ícone `text-blue-500` → `style={{ color: "var(--accent-1)" }}`.
5. Testes: em `ChartInfoIcon.test.jsx`, assertar que a bolha aberta tem a classe `nid-info-tip` e NÃO tem `bg-slate-800`; assertion equivalente para o tooltip do `KpiCard` (no teste existente do componente ou criando `KpiCard.test.jsx` mínimo se não houver). Rodar a suíte inteira.

**Fora do escopo:** o modal de edição dentro do `ChartInfoIcon` (usa tokens no fundo; inputs teal ficam como estão), `.nid-tip`, `title=` de outros componentes.

## Task 2 — ⓘ nos KPIs hero de CAGED e RAIS

**Arquivos:** componente `NidKpiHero` (localizar em `frontend-observatorio/src/components/nid/` — grep por `NidKpiHero`), `src/pages/caged/CagedPage.jsx`, `src/pages/rais/RaisPage.jsx`, `src/utils/indicadorCatalog.js`, testes correspondentes.

1. `NidKpiHero` passa a aceitar props opcionais `dataset` e `indicadorKey`; quando ambos presentes, renderiza `<ChartInfoIcon dataset={dataset} indicadorKey={indicadorKey} />` junto ao label (mesmo padrão condicional de `Panel.jsx:54,64`). Sem as props, nada muda (todas as outras telas que usam `NidKpiHero` ficam intactas). Atenção: se o container do hero tiver `overflow:hidden`/`backdrop-filter`, o ChartInfoIcon já resolve via portal — não reposicionar nada.
2. `CagedPage.jsx`: os 8 `NidKpiHero` recebem `dataset="caged"` e `indicadorKey`:
   - strip hero (~:364-404): `kpi_saldo_acumulado`, `kpi_admissoes`, `kpi_desligamentos`, `kpi_salario_medio_admissao`;
   - strip qualidade de contrato (~:684-716): `kpi_trabalho_parcial`, `kpi_intermitente`, `kpi_aprendizes`, `kpi_pcd`.
3. `RaisPage.jsx`: os 8 `NidKpiHero` recebem `dataset="rais"` e `indicadorKey`:
   - strip hero (~:326-376): `kpi_total_vinculos`, `kpi_ativos_31_12`, `kpi_remuneracao_media`, `kpi_pcd`;
   - strip indicadores de contrato (~:593-628): `kpi_trabalho_parcial`, `kpi_intermitente`, `kpi_empresa_simples`, `kpi_aprendizes`.
4. `indicadorCatalog.js`: adicionar as 16 chaves acima nos datasets `caged` e `rais` com `tipo: "kpi"` e `label` igual ao título visível do card (ex.: "Saldo · Acumulado", "Total de Vínculos").
5. Testes: teste de `NidKpiHero` (ⓘ presente só com `dataset`+`indicadorKey`); paridade do catálogo cobre as chaves; ajustar testes de página se existirem para CAGED/RAIS.

## Task 3 — Tooltips no Painel do Prefeito (13 KPIs + 4 cards-resumo)

**Arquivos:** `frontend-observatorio/src/pages/painel-prefeito/PainelPrefeitoPage.jsx`, `src/components/FunilResumoCard.jsx`, `src/components/ProjetosResumoCard.jsx`, `src/components/DinheiroNaMesaCard.jsx`, `src/components/EmendasResumoCard.jsx`, `src/utils/indicadorCatalog.js`, testes correspondentes. Verificação no backend: `backend/app/api/v1/routers/indicadores.py`.

1. `indicadorCatalog.js`: novo dataset `painel_prefeito` com:
   - 13 chaves `tipo: "kpi"`, uma por métrica do registry `METRICS` da página (`PANORAMA`, `PainelPrefeitoPage.jsx:116-119`): `kpi_arrecadacao`, `kpi_pib`, `kpi_vaf`, `kpi_caged`, `kpi_rais`, `kpi_empresas`, `kpi_estban`, `kpi_comex`, `kpi_pix`, `kpi_bolsa_familia`, `kpi_pe_de_meia`, `kpi_inss`, `kpi_ips` — labels do próprio `METRICS` (`:61-114`);
   - 4 chaves `tipo: "card"` (ou `"chart"` se o admin/catálogo não suportar tipo novo — seguir o padrão existente do catálogo): `card_funil_investimentos`, `card_projetos`, `card_dinheiro_na_mesa`, `card_emendas`.
2. `PainelPrefeitoPage.jsx`: os `KpiCard` do modo gerencial (~:400-407) e do panorama detalhado (~:432-439) recebem `dataset="painel_prefeito"` e `indicadorKey={"kpi_" + key}` (a chave da métrica vem dos arrays `PANORAMA_GERENCIAL`/`PANORAMA` — gerar por template, sem hardcode duplicado). Os 4 do gerencial são subconjunto das 13 chaves (pib, arrecadacao, caged, vaf) — mesmas chaves, sem duplicar entrada no catálogo.
3. Cards-resumo: `FunilResumoCard` (título ~:30), `ProjetosResumoCard` (~:25), `DinheiroNaMesaCard` e `EmendasResumoCard` recebem `<ChartInfoIcon dataset="painel_prefeito" indicadorKey="card_..." />` ao lado do título, seguindo o padrão visual do `Panel.jsx`. Se algum desses cards for reutilizado em outra tela (ex.: `DinheiroNaMesaCard` na página Dinheiro na Mesa), o ⓘ deve ser controlado por props opcionais com default aplicado apenas no Painel do Prefeito — não vazar o ⓘ para outras telas sem decisão explícita.
4. Backend: conferir se `indicadores.py` restringe `dataset` a uma lista (enum/whitelist). Se houver whitelist, adicionar `painel_prefeito` (+ teste backend correspondente; suíte back roda com o comando padrão do repo em `backend/`). Se for livre, nada a fazer — registrar no report.
5. Admin: conferir se `IndicadoresAdminPage.jsx` deriva a lista de datasets do catálogo; se houver lista hardcoded, incluir `painel_prefeito`.
6. Testes: paridade do catálogo; teste de página/cards garantindo ⓘ presente no Painel do Prefeito e ausente onde o card é reutilizado sem props.

## Fora do escopo geral

- Preencher os textos dos tooltips (conteúdo entra depois pelo admin de Indicadores).
- `.nid-tip` (box-shadow fixo), ToastContext com `dark:`, modal mask hardcoded, `title=` nativos fora dos botões ⓘ.
- Backend de conteúdo além da eventual whitelist de dataset.
