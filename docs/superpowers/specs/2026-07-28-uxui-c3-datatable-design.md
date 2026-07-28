# UX/UI transversal — Ciclo 3: tabelas cruas → DataTable — Design

**Data:** 2026-07-28
**Escopo:** frontend apenas (1 componente + 1 util novo + 5 páginas; zero backend)
**Contexto:** 3º dos 4 ciclos acordados do UX/UI transversal
(C1 ordem ✅ → C2 NidPanel ✅ → **C3 tabelas → DataTable** → C4 KPIs/legibilidade/tema).
Levantamento de 2026-07-28: 6 tabelas HTML cruas em 5 páginas, com 4 estilos diferentes de
empty state, uma classe CSS morta (`.table-wrap` na RAIS), uma borda slate hardcoded (ESTBAN)
e um painel div+h3 fora do NidPanel (ESTBAN — pendência proposital do C2).

## Decisões (validadas com o usuário)

1. **Conversão + sort clicável** — além da conversão visual, o `DataTable` ganha ordenação
   por clique no cabeçalho.
2. **Sort vale para as 10 tabelas** — é feature do componente; as 4 páginas já convertidas
   (PIB, Arrecadação, INSS, VAF) ganham junto. Colunas de sparkline ficam de fora.
3. **Paginação padrão (`pageSize=12`) nas listas longas** — ESTBAN (instituições) e as 2
   tabelas de Emendas deixam de renderizar tudo de uma vez.
4. **Abordagem A** — estender o `DataTable` único (sem wrapper novo, sem conversão parcial).

## Componente `DataTable` — extensões

### Descritor de coluna (2 campos novos)

- `render?: (row, index) => node` — precedência sobre `kind`/`fmt` no conteúdo da célula.
  Cobre os 5 casos fora do molde: rank `1º`, `BarraExecucao`, botão de ação por linha,
  marcador `*` de ano parcial e tooltip do tipo de emenda.
- `sortable?: false` — opt-out por coluna. Default: toda coluna é ordenável,
  exceto `kind: "spark"` (sempre excluída).

### Sort embutido (estado interno)

- Ciclo por clique no `<th>`: 1º clique **desc para colunas numéricas** e **asc para
  texto**; 2º clique inverte; 3º restaura a ordem original. Coluna é numérica quando o
  primeiro valor não-nulo dos dados é `number` (ou `kind: "delta"`) — isso cobre também
  colunas numéricas com `render` e sem `fmt`, como Execução (`pct_pago`).
- Comparação: números numericamente; texto com `localeCompare` pt-BR; nulos sempre por
  último em qualquer direção; coluna `kind: "delta"` ordena por `__delta`.
- **Enriquecimento (`__delta`/`__trend`/`__heatBg`) continua calculado na ordem original do
  `data`** — o sort só reordena a exibição e os valores enriquecidos viajam com a linha
  (o Δ mantém o sentido cronológico "vs período anterior").
- Ordenar reseta a página para 0. Sort aplica sobre o dataset completo enriquecido,
  depois o slice de paginação.
- Indicador ▲/▼ apenas na coluna ativa; `aria-sort` no `<th>`; cabeçalho acionável por
  teclado (semântica de botão).
- Lógica pura em `frontend-observatorio/src/utils/tableSort.js`
  (padrão `chartHover.js`/`kanbanMove.js`).

### Empty state padrão

- Prop nova `emptyMessage?: string` — com `data` vazio, renderiza o frame vazio padrão nid
  (240px, mesmo padrão dos charts pós-C2) com a mensagem, em vez de retornar `null`.
- Sem a prop, comportamento atual (retorna `null`) — retrocompatível.

## Conversões página a página

| Página / tabela | Conversão |
|---|---|
| **RAIS — Top 10 Ocupações (CBO 2002)** | DataTable no NidPanel atual: CBO (mono), Descrição, Vínculos (right, mono, número pt-BR), Rem. média (right, mono, moeda). Top-10 mantido, sem paginação. Removidos: estilos inline, `thStyle`/`tdStyle`, classe morta `.table-wrap`, `EmptyMsg` local → `emptyMessage="Sem dados disponíveis"`. |
| **ESTBAN — Detalhamento por Instituição** | Painel div+h3 → **NidPanel** (some a borda `border-slate-50` hardcoded). DataTable 6 colunas (Instituição; Agências/4 valores right mono, moeda sem centavos), lista inteira com `pageSize=12`. `PlanGate` e loading pulse inalterados. `emptyMessage="Sem dados disponíveis"`. |
| **FPM — Total anual** | DataTable 3 colunas (Ano; Total `fmtMoneyFull` right mono; Meses com dado right). Sem paginação. `emptyMessage="Sem dados de repasse."` |
| **Dinheiro na Mesa — Detalhe anual** | DataTable 6 colunas; Ano via `render` preservando `*` de parcial; Você/Média pares/Via emenda/Desembolsado `fmtMoneyFull` right mono (média pares nula → "—"); Convênios right. Sem paginação. `emptyMessage="Sem dados de captação."` |
| **Emendas — Ranking por parlamentar** | Página pré-computa `rank` no dado (índice da ordem do backend) para sobreviver ao sort; coluna `#` via `render` com `sortable: false`. Parlamentar; Emendas right; Destinado/Pago `fmtMoneyFull` right mono; Execução via `render` → `BarraExecucao` (key `pct_pago`, ordenável). `pageSize=12`; empty state novo. |
| **Emendas — Emendas destinadas ao município** | DataTable 8 colunas: Ano; Autor; Tipo via `render` (`tipoCurto` + tooltip `title` com o tipo completo); Área; Empenhado/Pago `fmtMoneyFull` right mono; Execução → `BarraExecucao`; Ações via `render` → `CriarOportunidadeCaptacao` (compact), `sortable: false`, label vazio. `pageSize=12`; empty state novo. |

- **Sem heatmap/delta/spark nas 6 tabelas novas** (paridade visual; são ranking/detalhe,
  não série temporal própria).
- Fetches, `PlanGate`, filtro de ano de Emendas e ordenação vinda do backend intocados.
- **Deltas visuais esperados:** ESTBAN perde o hover de linha; ESTBAN/Emendas passam a
  paginar em vez de mostrar tudo; Emendas ganha empty state (hoje não tem nenhum).

## Testes e gates

- `utils/tableSort.js` com testes vitest puros: ciclo de estado (desc-first numérico,
  asc-first texto, 3º clique restaura), comparator (números, `localeCompare` pt-BR,
  nulos por último, `__delta`, detecção de coluna numérica), aplicação sobre dataset
  enriquecido. ~9 testes novos sobre a suite vitest atual.
- Sem testes de componente React (decisão de projeto). Gates: vitest exit 0 +
  `npm run build` exit 0. Eslint baseline sujo conhecido — não é gate.
- **Checklist visual (usuário):** 6 tabelas novas + 4 antigas com visual nid uniforme;
  sort com indicador e restauração no 3º clique; paginação em ESTBAN/Emendas; botão de
  oportunidade funcionando dentro da tabela de emendas; empty states padronizados;
  delta/spark do PIB/Arrecadação/VAF continuam cronológicos mesmo após ordenar.

## Fora de escopo

- Busca/filtro por texto, sticky header, zebra/hover, export CSV (ciclo futuro se fizer falta).
- `AdminTable` e ecossistema admin; tabelas-view dos kanbans (Captação/Funil/Escrita/
  Acompanhamento); `ComparativoPage`; `PlanoGovPage` — não são tabelas cruas de página
  de dataset.
- C4 (IPS hardcoded, select do Comex, MiniStat de Empresas, textos).
- Zero backend.
