# Exportação de gráficos (CSV, XLSX, PNG) para ADMIN_GLOBAL — Design

**Data:** 2026-10-06
**Status:** design aprovado em chat pelo usuário (06/10/2026); spec aguardando revisão
**Repositório:** `dashboard_prefeituras` (NID). O LEGIS entra como espelho em frente própria.

## Objetivo

Permitir que o ADMIN_GLOBAL baixe, de qualquer painel de gráfico das páginas de dataset, a
tabela que o gráfico desenha (CSV e XLSX) e a imagem do gráfico (PNG), para compartilhar com a
prefeitura e a imprensa sem recorte de tela nem planilha manual.

Sucesso: em qualquer página de dataset, o ADMIN_GLOBAL vê um menu "Exportar" no cabeçalho de
cada painel com gráfico; em um clique recebe um arquivo com nome legível, com os mesmos dados e
rótulos que vê na tela; nenhum outro papel vê o menu; nenhuma das 19 páginas precisa mudar.

## Decisões de escopo (fechadas com o usuário)

1. **O que exporta:** séries dos datasets e seus gráficos (não tabelas administrativas, não
   KPIs).
2. **Granularidade:** por gráfico, no cabeçalho do painel. Sem "exportar tudo" da página.
3. **Quem vê:** só ADMIN_GLOBAL, pelo papel real do usuário. "Ver como município" não muda
   isso.
4. **Abordagem A (híbrida, registro pelo gráfico):** CSV e PNG gerados no navegador sem
   biblioteca nova; XLSX gerado no backend por um endpoint genérico com `openpyxl` (já é
   dependência) e `require_role("ADMIN_GLOBAL")`. Descartados: SheetJS no cliente (+300 KB,
   edição comunitária parada com CVEs, gating só na UI) e renderização de PNG no servidor
   (duplica os gráficos fora do React).
5. **Formatos:** CSV `;` + vírgula decimal + BOM (Excel pt-BR abre direto); XLSX com cabeçalho
   de metadados; PNG 2x com título e rodapé de fonte.

## Contexto encontrado

- Gráficos são SVG próprios em `frontend-observatorio/src/components/nid/charts.jsx`:
  `Sparkline`, `AreaLineChart`, `StackedBarChart`, `MultiLineChart`, `TwinBarChart`,
  `DonutChart`, `HBarChart`. Todos recebem `data` e conhecem seus rótulos (`label`, `keys`,
  `series`, `mode`). Nenhum usa Recharts.
- `NidPanel` (`components/nid/Panel.jsx`) é o cabeçalho padrão dos painéis: `title`, `sub`,
  `tabs`/`onTabChange` ou slot `right`, `dataset`/`indicadorKey` para o ⓘ. 19 páginas o usam.
- Backend: `openpyxl==3.1.5` em `requirements.txt` (usado na ingestão); padrão
  `Depends(require_role(...))` nos routers; sem nenhum endpoint de exportação.
- Frontend: sem `xlsx`, `html2canvas` ou similares. Releases já têm "copiar" e "imprimir"
  (`utils/releaseDoc.js`), nada tabular.
- `IDEAS.md` lista "Exportação PDF / Excel" e "PNG por gráfico" como backlog; esta spec
  entrega a parte CSV/XLSX/PNG.

## Arquitetura

```
NidPanel ───────────────── ExportContext.Provider ──────────────────────────────┐
  cabeçalho: title/sub · tabs | right · [ExportMenu]  ← lê os registros do contexto
  children:                                                                   │
    AreaLineChart ──▶ useRegistrarExportacao({ id, rotulo, colunas, linhas, svgRef, carregando })
    DonutChart    ──▶ useRegistrarExportacao({ ... })                           │
                                                                                │
ExportMenu ─ CSV ──▶ utils/exportar.js: gerarCsv(colunas, linhas) → Blob → download
           ─ PNG ──▶ utils/exportar.js: svgParaPng(svgEl, { titulo, sub, rodape }) → Blob → download
           ─ XLSX ─▶ api.post("/export/xlsx", payload, { responseType: "blob" }) → download
```

Fluxo: o gráfico monta e registra suas linhas e colunas; o painel vê que há registro e que o
usuário é ADMIN_GLOBAL e mostra o menu; o clique gera o arquivo. Páginas não participam.

## 1. Registro pelo gráfico

- `components/nid/ExportContext.jsx` exporta `ExportProvider`, `useRegistrarExportacao(reg)` e
  `useExportacoes()`.
- `useRegistrarExportacao({ id, rotulo, colunas, linhas, svgRef, carregando })` registra no
  mount e a cada mudança de `linhas`/`carregando`, e remove no unmount. Fora de um
  `ExportProvider` é no-op (gráficos usados fora de `NidPanel` continuam funcionando).
  - `id`: estável por instância (`useId`).
  - `rotulo`: nome curto do gráfico para o submenu quando o painel tem mais de um (ex.: o
    `label` do AreaLineChart; "Saldo" / "Admissões e desligamentos" no TwinBarChart conforme
    `mode`; "Distribuição" no Donut; "Ranking" no HBar).
  - `colunas`: `[{ chave, rotulo, tipo: "texto" | "numero" | "ano" }]`.
  - `linhas`: array de objetos com as chaves de `colunas`, já normalizadas como o gráfico
    desenha (mesma ordem do eixo X, mesmos valores dos tooltips, sem formatação de moeda).
- Cada gráfico define suas colunas a partir do que já conhece:

| Gráfico | Colunas |
|---|---|
| `AreaLineChart` | eixo X (ano/período) + `label` |
| `StackedBarChart` | eixo X + uma por `keys` (rótulo = key) + total quando `showTotalLabel` |
| `MultiLineChart` | eixo X + uma por `series` |
| `TwinBarChart` | eixo X + admissões + desligamentos + saldo (+ acumulado quando `showCumulative`) |
| `DonutChart` | categoria + valor + participação (%) |
| `HBarChart` | nome + valor (+ posição quando `showPosition`) |
| `Sparkline` | não registra |

  O nome exato das chaves de `data` de cada gráfico é definido no plano, lendo o código de
  cada componente; a spec fixa só o contrato.

## 2. Menu e gating

- `components/nid/ExportMenu.jsx`: botão "Exportar" (ícone de download) no `nid-panel-actions`,
  depois das abas quando há `tabs`, ou ao lado de `right`. Abre popover com CSV, XLSX e PNG. Com
  dois ou mais registros, cada formato abre um submenu com o `rotulo` de cada gráfico.
- Visível só se `useAuth().user?.role === "ADMIN_GLOBAL"` **e** há ao menos um registro.
  `ViewAsContext` não é consultado.
- Desabilitado (com `aria-disabled` e tooltip "Sem dados para exportar") enquanto todo registro
  está `carregando` ou sem linhas.
- Acessível: botão com `aria-haspopup="menu"`, itens `role="menuitem"`, fecha com Esc e clique
  fora, foco volta ao botão.

## 3. Formatos

**CSV** (`utils/exportar.js` → `gerarCsv(colunas, linhas)`):
- UTF-8 com BOM (`﻿`), separador `;`, quebra `\r\n`, primeira linha = rótulos.
- Números com vírgula decimal e sem separador de milhar; `null`/`undefined` viram célula vazia.
- Campo com `;`, `"`, `\r` ou `\n` vai entre aspas, com `"` duplicada.

**PNG** (`utils/exportar.js` → `svgParaPng(svgEl, { titulo, sub, rodape, escala = 2 })`):
- Clona o `<svg>`, resolve `getComputedStyle` de cada elemento para `fill`, `stroke`,
  `stroke-width`, `opacity`, `font-family`, `font-size`, `font-weight` e inlina como atributos,
  para nenhum `var(--…)` sobrar; define `width`/`height` explícitos pelo `getBoundingClientRect`.
- Canvas na escala 2x: fundo com a cor computada de `--panel` do tema atual; título (16px,
  negrito) e sub (12px) no topo; o SVG abaixo; rodapé (11px) `Fonte: {fonte} · UAIZI NID ·
  {dd/mm/aaaa}`. Fonte do rodapé vem de `DATASET_LABELS`/mapa de fontes do dataset (plano
  decide o mapa; sem fonte conhecida, rodapé só com "UAIZI NID · data").
- Serializa com `XMLSerializer`, carrega em `Image` via data URL `image/svg+xml;charset=utf-8`,
  desenha, `canvas.toBlob("image/png")`.
- Se `toBlob` ou o canvas não existirem (ambiente sem canvas), rejeita com erro legível.

**XLSX** (backend, item 4): o front monta `{ titulo, subtitulo, fonte, municipio, colunas,
linhas }` e faz `api.post("/export/xlsx", payload, { responseType: "blob" })`.

**Nome do arquivo** (`utils/exportar.js` → `nomeArquivo({ dataset, painel, municipio, ext })`):
`nid_{dataset}_{painel}_{municipio}_{AAAA-MM-DD}.{ext}`, cada parte em slug ASCII minúsculo
(`slugify`: remove acentos, troca não alfanumérico por `-`, colapsa `-`), partes vazias
omitidas. `dataset` vem da prop `dataset` do `NidPanel` quando existe, senão do pathname
(`/app/pib` → `pib`); `municipio` do `ViewAsContext` ativo ou do município do usuário (nome),
só para nomear o arquivo.

**Download** (`baixarBlob(blob, nome)`): `URL.createObjectURL` + `<a download>` + `revoke`.

## 4. Endpoint de XLSX

- `backend/app/api/v1/routers/export.py`, prefixo `/export`, registrado em `main.py`.
- `POST /export/xlsx`, `Depends(require_role("ADMIN_GLOBAL"))`.
- Schema `ExportXlsxIn` (`schemas/export.py`): `titulo: str (1..200)`, `subtitulo: str | None`,
  `fonte: str | None`, `municipio: str | None`, `colunas: list[ColunaExport] (1..50)` com
  `chave: str`, `rotulo: str (1..120)`, `tipo: Literal["texto","numero","ano"] = "texto"`,
  `linhas: list[dict[str, str | int | float | None]] (0..5000)`. Validação extra: `len(colunas) *
  len(linhas) <= 50_000` senão 422; chaves de `linhas` fora de `colunas` são ignoradas.
- Serviço `services/export_service.py` → `gerar_xlsx(dados) -> bytes`: planilha "Dados":
  A1 título (negrito 14), A2 subtítulo, A3 `Município: …`, A4 `Fonte: …`, A5 `Gerado em
  dd/mm/aaaa HH:MM (UTC-3)` com hora local do fuso fixo −3 (`app/core/datas.py`; criar
  `agora_local()` ao lado de `hoje_local()` se ainda não existir), A6 em branco, A7 cabeçalho
  (negrito, fundo cinza claro, filtro automático), dados a partir de A8; `tipo: "numero"` grava
  float/int com `number_format "#,##0.00"`; `"ano"` grava int sem formato de milhar; larguras de
  coluna pelo maior texto (máx. 60).
- Resposta: `StreamingResponse` de `BytesIO`, media type
  `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, header
  `Content-Disposition: attachment; filename="{nome}.xlsx"` com o nome calculado pela mesma regra
  de slug (`core/slug.py` novo, espelho do `slugify` do front).
- Sem gravação em banco, sem auditoria (dado agregado público; coerente com `docs/lgpd.md` §2
  "Delimitação").
- Sem rate limit próprio: o endpoint é ADMIN_GLOBAL-only e limitado a 50k células.

## 5. Tratamento de erros

| Situação | Comportamento |
|---|---|
| Papel ≠ ADMIN_GLOBAL | Menu não renderiza. Chamada direta ao endpoint → 403 pelo `require_role`. |
| Gráfico `loading` ou sem linhas | Menu desabilitado com tooltip. |
| Canvas/`toBlob` indisponível | Toast "Não foi possível gerar a imagem neste navegador"; painel intacto. |
| Falha de rede/5xx no XLSX | Toast "Falha ao gerar a planilha. Tente novamente."; painel intacto. |
| 422 (payload grande) | Toast "Tabela grande demais para exportar (limite de 50 mil células)". |
| Painel sem `dataset` e rota desconhecida | Nome do arquivo sem a parte `dataset`. |

Princípio: exportar é best-effort; nenhum caminho pode quebrar o painel ou a página.

## 6. Testes

**Frontend** (vitest + jsdom):
- `utils/exportar.test.js`: `gerarCsv` (BOM, `;`, `\r\n`, vírgula decimal, nulos vazios,
  escape de `;`/`"`/quebras), `slugify`/`nomeArquivo` (acentos, partes vazias, data),
  `inlinarEstilosSvg` (clone sem `var(` em `fill`/`stroke`, dimensões explícitas),
  `svgParaPng` rejeita com mensagem legível quando `toBlob` não existe.
- `components/nid/ExportMenu.test.jsx`: com `AuthContext` mockado — ADMIN_GLOBAL vê o menu,
  VISUALIZADOR e ADMIN_MUNICIPIO não; dois registros → dois itens por formato; `carregando` →
  desabilitado; clique em CSV chama `baixarBlob` com nome esperado (mock); clique em XLSX chama
  `api.post("/export/xlsx", …)` com colunas/linhas do registro; Esc fecha e devolve o foco.
- `components/nid/charts.test.jsx` (existente): um teste por gráfico confirmando que, dentro
  de um `ExportProvider`, o registro tem as colunas da tabela acima e linhas iguais aos dados
  desenhados (ex.: Donut registra participação somando 100).
- `ExportContext.test.jsx`: hook fora do provider é no-op; unmount remove o registro.

**Backend** (pytest):
- `tests/test_export_endpoint.py`: ADMIN_GLOBAL recebe 200 com media type certo e
  `Content-Disposition` com slug; `openpyxl.load_workbook` lê de volta título, cabeçalho,
  tipos (número é float, ano é int) e `auto_filter`; ADMIN_MUNICIPIO/VISUALIZADOR → 403;
  51 colunas ou > 50k células → 422; chave desconhecida em `linhas` é ignorada.

Gates: `npx vitest run` e `venv/Scripts/python -m pytest backend/tests -q` verdes; lint sem
erro novo nos arquivos tocados.

## 7. Ordem de entrega

1. Backend: schema + serviço + router + testes (independente do front).
2. `utils/exportar.js` + testes (puro).
3. `ExportContext` + `ExportMenu` + `NidPanel` + testes.
4. Registro nos seis gráficos em `charts.jsx` + testes.
5. Verificação manual: PIB, CAGED (TwinBarChart com abas), Empresas (Donut/HBar) nos cinco
   temas; abrir CSV no Excel pt-BR; abrir XLSX; PNG legível em tema claro e escuro.

## Fora de escopo (anotado, não silencioso)

- PDF e "exportar tudo" da página
- Exportação de KPIs/`Sparkline` e de tabelas administrativas (usuários, auditoria, jobs)
- Evento no Umami ao exportar (decisão da frente Umami: sem eventos de negócio)
- Liberar exportação para outros papéis ou por plano (`PlanGate`)
- Espelho no LEGIS (frente própria; gráficos de lá são outros componentes)
- Auditoria LGPD da exportação (dado agregado público)

## Riscos e notas

- **Fontes no PNG**: o canvas usa as fontes já carregadas no documento (Inter); se não
  carregadas, cai em sans-serif do sistema. Aceito.
- **Painéis com conteúdo não-gráfico** (tabelas, textos) não registram nada e não ganham menu.
  Se no futuro tabelas (`DataTable`) quiserem exportar, basta registrar no mesmo contexto.
- **`charts.jsx` é grande** (~2 mil linhas). O registro adiciona ~5 linhas por gráfico; a lógica
  de montar colunas/linhas fica em helpers puros em `utils/exportar.js` para não inchar o
  arquivo.
