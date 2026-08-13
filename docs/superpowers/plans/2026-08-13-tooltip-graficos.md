# Tooltip por Gráfico + Tela Admin de Indicadores — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ADMIN_GLOBAL explica cada gráfico (tooltip curto + descrição longa, global para todos os municípios) via ícone ℹ️ nos painéis e uma tela admin central; de quebra, Calendário vira link de primeiro nível no side menu.

**Architecture:** Reusa o modelo/endpoints `indicador_info` existentes (zero migração) e o componente órfão `ChartInfoIcon`. Um catálogo estático no frontend (`indicadorCatalog.js`) é a fonte de verdade das chaves (KPIs existentes + ~97 chaves novas `chart_*`); o `NidPanel` ganha props `dataset`/`indicadorKey` e renderiza o ícone; endpoint novo `GET /indicadores/all` alimenta a tela `/admin/indicadores` (merge catálogo × banco). Testes de paridade fonte↔catálogo previnem chave órfã/typo.

**Tech Stack:** FastAPI, SQLAlchemy (leitura), React 18, vitest (node + jsdom), @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-08-13-tooltip-graficos-design.md`

## Global Constraints

- Zero migração/schema: `indicador_info` já existe e é global (sem `municipio_id`).
- Convenção de chave de gráfico: **`chart_<slug>`**; chaves de KPI existentes NÃO mudam.
- `GET /indicadores/all`: `require_role("ADMIN_GLOBAL")`; testes backend sem DB/TestClient (contrato via `app.openapi()`, padrão `backend/tests/test_comparativo_pib_endpoint.py`).
- Testes backend rodam de `backend/`: `../venv/Scripts/python.exe -m pytest tests -q` (warnings Pydantic pré-existentes = ruído de baseline).
- Testes frontend: `cd frontend-observatorio && npm test`. **`npm run lint` está quebrado no repo — não é gate.**
- Arquivos DOM de teste usam `// @vitest-environment jsdom` na 1ª linha (config default é node).
- `KpiCard` e `InfoTooltip` (dataset_info) ficam INTOCADOS.
- Textos de UI em pt-BR; strings acentuadas UTF-8 intactas.
- Branch `feat/tooltip-graficos` a partir de `main`; commit só dos arquivos de cada task (não tocar `.claude/settings.local.json`).
- Páginas fora do escopo de plugagem: `PainelPrefeitoPage` (KPIs via registry dinâmico), `ImpactoPage` (painéis com título dinâmico por conteúdo do usuário), `BenchmarkPage`.

---

### Task 1: Backend — `GET /indicadores/all`

**Files:**
- Modify: `backend/app/api/v1/routers/indicadores.py` (após o `GET ""` unitário, linha ~50)
- Test: `backend/tests/test_indicadores_all.py` (novo)

**Interfaces:**
- Produces: rota `GET /api/v1/indicadores/all` → `list[IndicadorInfoOut]` (todas as linhas, ordenadas por dataset e indicador_key), ADMIN_GLOBAL. Consumida pela tela admin (Task 9) via `api.get("/indicadores/all")`.

- [ ] **Step 1: Escrever o teste que falha** — criar `backend/tests/test_indicadores_all.py`

```python
"""Contrato do GET /indicadores/all — padrão do repo: sem TestClient e sem DB;
o contrato da rota é conferido pelo OpenAPI (montado sem conexão)."""


def _openapi():
    from app.main import app
    return app.openapi()


def test_rota_all_existe_e_devolve_lista_de_indicador_info():
    schema = _openapi()
    op = schema["paths"]["/api/v1/indicadores/all"]["get"]
    resp = op["responses"]["200"]["content"]["application/json"]["schema"]
    assert resp["type"] == "array"
    assert resp["items"]["$ref"].endswith("IndicadorInfoOut")


def test_rota_unitaria_continua_existindo():
    schema = _openapi()
    assert "/api/v1/indicadores" in schema["paths"]
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd backend
../venv/Scripts/python.exe -m pytest tests/test_indicadores_all.py -q
```

Expected: FAIL — `KeyError: '/api/v1/indicadores/all'`.

- [ ] **Step 3: Implementar o endpoint** — em `backend/app/api/v1/routers/indicadores.py`, adicionar após a função `get_indicador` (antes do `PUT`):

```python
# ==============================
# List all indicator infos (ADMIN_GLOBAL — admin screen)
# ==============================
@router.get("/all", response_model=list[IndicadorInfoOut])
def listar_indicadores(
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    rows = (
        db.query(IndicadorInfo)
        .order_by(IndicadorInfo.dataset, IndicadorInfo.indicador_key)
        .all()
    )
    return [
        IndicadorInfoOut(
            dataset=r.dataset,
            indicador_key=r.indicador_key,
            tooltip=r.tooltip,
            descricao=r.descricao,
            fonte=r.fonte,
            atualizado_em=r.atualizado_em,
        )
        for r in rows
    ]
```

(`require_role` já está importado na linha 3 do arquivo.)

**Atenção à ordem das rotas:** FastAPI casa `/indicadores/all` antes do `GET ""` por serem paths distintos — mas declare `/all` ANTES do `PUT /{dataset}/{indicador_key}` no arquivo para legibilidade (métodos diferentes, sem conflito real).

- [ ] **Step 4: Rodar e ver passar**

```bash
cd backend
../venv/Scripts/python.exe -m pytest tests/test_indicadores_all.py -q
```

Expected: PASS (2 testes).

- [ ] **Step 5: Suíte backend completa**

```bash
cd backend
../venv/Scripts/python.exe -m pytest tests -q
```

Expected: tudo verde.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/v1/routers/indicadores.py backend/tests/test_indicadores_all.py
git commit -m "feat(indicadores): GET /indicadores/all para a tela admin"
```

---

### Task 2: Catálogo de indicadores + testes de invariantes e paridade

**Files:**
- Create: `frontend-observatorio/src/utils/indicadorCatalog.js`
- Test: `frontend-observatorio/src/utils/indicadorCatalog.test.js`

**Interfaces:**
- Produces: `INDICADOR_CATALOG` — objeto `{ [dataset]: Array<{ key, label, tipo: "kpi"|"chart" }> }`; helper `todasAsChaves()` → `Set<string>` (união de todas as keys). Consumido pelas tasks de plugagem (chaves exatas) e pela tela admin (Task 9).

- [ ] **Step 1: Escrever os testes que falham** — criar `frontend-observatorio/src/utils/indicadorCatalog.test.js`

```js
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { INDICADOR_CATALOG, todasAsChaves } from "./indicadorCatalog";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("invariantes do catálogo", () => {
  it("chaves únicas por dataset", () => {
    for (const [dataset, entries] of Object.entries(INDICADOR_CATALOG)) {
      const keys = entries.map((e) => e.key);
      expect(new Set(keys).size, `duplicata em ${dataset}`).toBe(keys.length);
    }
  });

  it("tipo chart usa prefixo chart_; kpi não usa", () => {
    for (const [dataset, entries] of Object.entries(INDICADOR_CATALOG)) {
      for (const e of entries) {
        if (e.tipo === "chart") {
          expect(e.key, `${dataset}.${e.key}`).toMatch(/^chart_[a-z0-9_]+$/);
        } else {
          expect(e.tipo).toBe("kpi");
          expect(e.key).not.toMatch(/^chart_/);
        }
      }
    }
  });

  it("labels não vazios", () => {
    for (const entries of Object.values(INDICADOR_CATALOG)) {
      for (const e of entries) expect(e.label.trim().length).toBeGreaterThan(0);
    }
  });
});

// ── Paridade fonte → catálogo ────────────────────────────────────────────────
// Toda chave literal usada no JSX (indicadorKey="x" ou indicadorKey: "x")
// precisa existir no catálogo — pega typo e chave fantasma na plugagem.

function chavesLiteraisNoFonte() {
  const dirs = [path.resolve(__dirname, "../pages"), path.resolve(__dirname, "../components")];
  const chaves = new Set();
  const re = /indicadorKey(?:=|:)\s*"([^"]+)"/g;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith(".jsx")) {
        const src = fs.readFileSync(p, "utf8");
        for (const m of src.matchAll(re)) chaves.add(m[1]);
      }
    }
  };
  dirs.forEach(walk);
  // Docstrings de exemplo (ChartInfoIcon: chart_saldo; KpiCard: ultimo_ano) também
  // são capturadas — ambas existem no catálogo, então não geram falso positivo.
  return chaves;
}

describe("paridade fonte → catálogo", () => {
  it("toda chave literal do JSX existe no catálogo", () => {
    const catalogo = todasAsChaves();
    const faltando = [...chavesLiteraisNoFonte()].filter((k) => !catalogo.has(k));
    expect(faltando, `chaves usadas no JSX sem entrada no catálogo: ${faltando.join(", ")}`).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd frontend-observatorio
npx vitest run src/utils/indicadorCatalog.test.js
```

Expected: FAIL — módulo `./indicadorCatalog` inexistente.

- [ ] **Step 3: Criar `frontend-observatorio/src/utils/indicadorCatalog.js`** com o catálogo COMPLETO:

```js
// Fonte única de verdade das chaves de indicador_info (KPIs e gráficos).
// Consumida pelas páginas (via literais idênticos) e pela tela /admin/indicadores.
// Convenção: gráficos usam prefixo chart_; KPIs mantêm as chaves históricas.
// Teste de paridade em indicadorCatalog.test.js garante JSX ⊆ catálogo.

export const INDICADOR_CATALOG = {
  geral: [
    { key: "chart_evolucao_pib", label: "Evolução do PIB", tipo: "chart" },
    { key: "chart_receita_por_tipo", label: "Receita por Tipo", tipo: "chart" },
    { key: "chart_va_setor", label: "Valor Adicionado por Setor", tipo: "chart" },
    { key: "chart_pib_comparativo", label: "PIB Comparativo", tipo: "chart" },
    { key: "chart_saldo_caged", label: "Saldo CAGED", tipo: "chart" },
    { key: "chart_top_setores_va", label: "Top Setores · VA", tipo: "chart" },
  ],
  arrecadacao: [
    { key: "total_arrecadado", label: "Total Arrecadado", tipo: "kpi" },
    { key: "ultimo_ano", label: "Último Ano", tipo: "kpi" },
    { key: "media_mensal", label: "Média Mensal", tipo: "kpi" },
    { key: "crescimento_anual", label: "Crescimento", tipo: "kpi" },
    { key: "chart_serie_mensal", label: "Série Histórica Mensal", tipo: "chart" },
    { key: "chart_composicao_tipo", label: "Composição por Tipo de Imposto", tipo: "chart" },
    { key: "chart_detalhamento_periodo", label: "Detalhamento por Período", tipo: "chart" },
  ],
  pib: [
    { key: "ultimo_ano", label: "PIB — Último Ano", tipo: "kpi" },
    { key: "crescimento", label: "Crescimento", tipo: "kpi" },
    { key: "anos_serie", label: "Anos na Série", tipo: "kpi" },
    { key: "chart_evolucao_anual", label: "Evolução Anual do PIB", tipo: "chart" },
    { key: "chart_va_setor", label: "Valor Adicionado por Setor", tipo: "chart" },
    { key: "chart_pib_comparativo", label: "PIB Comparativo — Municípios", tipo: "chart" },
    { key: "chart_serie_anual", label: "Série Anual", tipo: "chart" },
    { key: "chart_comparativo_municipios", label: "Comparativo com Municípios", tipo: "chart" },
  ],
  vaf: [
    { key: "ipm_ultimo_ano", label: "IPM — Último Ano-Base", tipo: "kpi" },
    { key: "variacao_ipm", label: "Variação do IPM", tipo: "kpi" },
    { key: "anos_serie", label: "Anos na Série", tipo: "kpi" },
    { key: "chart_evolucao_ipm", label: "Evolução do IPM", tipo: "chart" },
    { key: "chart_icms_projetado", label: "ICMS Projetado a partir do IPM", tipo: "chart" },
    { key: "chart_indice_vs_medio", label: "Índice vs Índice Médio", tipo: "chart" },
    { key: "chart_ipm_comparativo", label: "IPM Comparativo — Municípios", tipo: "chart" },
    { key: "chart_vaf_individual_estado", label: "VAF Individual × Estado", tipo: "chart" },
    { key: "chart_serie_anual", label: "Série Anual", tipo: "chart" },
    { key: "chart_comparativo_municipios", label: "Comparativo com Municípios", tipo: "chart" },
  ],
  fpm: [
    { key: "fpm_12m", label: "FPM Últimos 12 Meses", tipo: "kpi" },
    { key: "coeficiente", label: "Coeficiente Estimado", tipo: "kpi" },
    { key: "valor_por_ponto", label: "Valor por Ponto de Coeficiente", tipo: "kpi" },
    { key: "populacao", label: "População", tipo: "kpi" },
    { key: "chart_repasses_mensais", label: "Repasses Mensais do FPM", tipo: "chart" },
    { key: "chart_populacao_anual", label: "População Estimada por Ano", tipo: "chart" },
    { key: "chart_total_anual", label: "Total Anual", tipo: "chart" },
  ],
  captacao_federal: [
    { key: "voce_firmado", label: "Captação Firmada", tipo: "kpi" },
    { key: "via_emenda", label: "Via Emenda Parlamentar", tipo: "kpi" },
    { key: "desembolsado", label: "Desembolsado", tipo: "kpi" },
    { key: "posicao", label: "Posição no Grupo", tipo: "kpi" },
    { key: "chart_captacao_anual", label: "Captação Anual — Você vs Pares", tipo: "chart" },
    { key: "chart_detalhe_anual", label: "Detalhe Anual", tipo: "chart" },
  ],
  emendas: [
    { key: "total_empenhado", label: "Total Destinado (Empenhado)", tipo: "kpi" },
    { key: "pago_total", label: "Executado (Pago)", tipo: "kpi" },
    { key: "num_parlamentares", label: "Parlamentares", tipo: "kpi" },
    { key: "top_autor", label: "Maior Padrinho", tipo: "kpi" },
    { key: "chart_ranking_parlamentar", label: "Ranking por Parlamentar", tipo: "chart" },
    { key: "chart_destino_area", label: "Destino por Área", tipo: "chart" },
    { key: "chart_funil_execucao", label: "Emendas — Funil de Execução", tipo: "chart" },
  ],
  caged: [
    { key: "chart_saldo", label: "Saldo Mensal/Anual", tipo: "chart" },
    { key: "chart_movimentacao", label: "Movimentação CAGED", tipo: "chart" },
    { key: "chart_setores_saldo", label: "Setores · Saldo do Ano", tipo: "chart" },
    { key: "chart_composicao_setorial", label: "Composição Setorial", tipo: "chart" },
    { key: "chart_tamanho_estabelecimento", label: "Por Tamanho de Estabelecimento", tipo: "chart" },
    { key: "chart_pcd_deficiencia", label: "PCD por Tipo de Deficiência", tipo: "chart" },
    { key: "chart_tipo_empregador", label: "Tipo de Empregador", tipo: "chart" },
    { key: "chart_tipo_estabelecimento", label: "Tipo de Estabelecimento", tipo: "chart" },
    { key: "chart_setores_historico", label: "Movimentações por Setor · Histórico", tipo: "chart" },
    { key: "chart_admissoes_sexo", label: "Admissões por Sexo", tipo: "chart" },
    { key: "chart_admissoes_raca", label: "Admissões por Raça/Cor", tipo: "chart" },
    { key: "chart_admissoes_faixa_etaria", label: "Admissões por Faixa Etária", tipo: "chart" },
    { key: "chart_admissoes_escolaridade", label: "Admissões por Escolaridade", tipo: "chart" },
    { key: "chart_tipo_movimentacao", label: "Tipo de Movimentação", tipo: "chart" },
  ],
  rais: [
    { key: "chart_evolucao_vinculos", label: "Evolução de Vínculos", tipo: "chart" },
    { key: "chart_top_setores", label: "Top Setores (CNAE)", tipo: "chart" },
    { key: "chart_turnover_mensal", label: "Turnover Mensal", tipo: "chart" },
    { key: "chart_natureza_juridica", label: "Natureza Jurídica", tipo: "chart" },
    { key: "chart_tipo_admissao", label: "Tipo de Admissão", tipo: "chart" },
    { key: "chart_tamanho_estabelecimento", label: "Por Tamanho de Estabelecimento", tipo: "chart" },
    { key: "chart_evolucao_setor", label: "Evolução por Setor", tipo: "chart" },
    { key: "chart_vinculos_sexo", label: "Vínculos por Sexo", tipo: "chart" },
    { key: "chart_vinculos_raca", label: "Vínculos por Raça/Cor", tipo: "chart" },
    { key: "chart_faixa_etaria", label: "Faixa Etária", tipo: "chart" },
    { key: "chart_grau_instrucao", label: "Grau de Instrução", tipo: "chart" },
    { key: "chart_faixa_salarial", label: "Faixa Salarial (Salários Mínimos)", tipo: "chart" },
    { key: "chart_tempo_emprego", label: "Tempo de Emprego", tipo: "chart" },
    { key: "chart_motivos_desligamento", label: "Motivos de Desligamento", tipo: "chart" },
    { key: "chart_top_ocupacoes", label: "Top 10 Ocupações (CBO 2002)", tipo: "chart" },
  ],
  bolsa_familia: [
    { key: "total_beneficiarios", label: "Total de Beneficiários", tipo: "kpi" },
    { key: "valor_total", label: "Valor Total", tipo: "kpi" },
    { key: "media_por_beneficiario", label: "Média por Beneficiário", tipo: "kpi" },
    { key: "chart_evolucao_beneficiarios", label: "Evolução de Beneficiários", tipo: "chart" },
    { key: "chart_total_vs_primeira_infancia", label: "Beneficiários: Total vs Primeira Infância", tipo: "chart" },
    { key: "chart_repasses", label: "Repasses: Bolsa Família vs Primeira Infância", tipo: "chart" },
    { key: "chart_comparativo_municipios", label: "Comparativo com Municípios", tipo: "chart" },
  ],
  pe_de_meia: [
    { key: "total_estudantes", label: "Total de Estudantes", tipo: "kpi" },
    { key: "valor_total", label: "Valor Total", tipo: "kpi" },
    { key: "chart_evolucao_estudantes", label: "Evolução de Estudantes Beneficiados", tipo: "chart" },
    { key: "chart_por_etapa", label: "Estudantes por Etapa de Ensino", tipo: "chart" },
    { key: "chart_por_incentivo", label: "Estudantes por Tipo de Incentivo", tipo: "chart" },
  ],
  inss: [
    { key: "total_beneficios", label: "Total de Benefícios", tipo: "kpi" },
    { key: "valor_total", label: "Valor Total", tipo: "kpi" },
    { key: "chart_top_categorias", label: "Top Categorias de Benefícios", tipo: "chart" },
    { key: "chart_evolucao_anual", label: "Evolução Anual de Benefícios", tipo: "chart" },
    { key: "chart_detalhamento_ano_categoria", label: "Detalhamento por Ano e Categoria", tipo: "chart" },
    { key: "chart_comparativo_municipios", label: "Comparativo com Municípios", tipo: "chart" },
  ],
  ips: [
    { key: "ips_geral", label: "IPS Geral", tipo: "kpi" },
    { key: "ranking_nacional", label: "Ranking Nacional", tipo: "kpi" },
    { key: "ranking_estadual", label: "Ranking Estadual", tipo: "kpi" },
    { key: "pib_per_capita", label: "PIB per Capita", tipo: "kpi" },
    { key: "necessidades_humanas_basicas", label: "Necessidades Humanas Básicas", tipo: "kpi" },
    { key: "fundamentos_bem_estar", label: "Fundamentos do Bem-estar", tipo: "kpi" },
    { key: "oportunidades", label: "Oportunidades", tipo: "kpi" },
    { key: "chart_perfil_componente", label: "Perfil por Componente", tipo: "chart" },
    { key: "chart_pontos_fortes", label: "Pontos Fortes", tipo: "chart" },
    { key: "chart_pontos_melhorar", label: "Pontos a Melhorar", tipo: "chart" },
    { key: "chart_evolucao_tempo", label: "Evolução ao Longo do Tempo", tipo: "chart" },
    { key: "chart_comparar_municipios", label: "Comparar com Outros Municípios", tipo: "chart" },
  ],
  estban: [
    { key: "agencias", label: "Agências", tipo: "kpi" },
    { key: "credito_total", label: "Crédito Total", tipo: "kpi" },
    { key: "depositos_total", label: "Depósitos Totais", tipo: "kpi" },
    { key: "chart_evolucao_credito", label: "Evolução das Operações de Crédito", tipo: "chart" },
    { key: "chart_captacao_depositos", label: "Evolução da Captação — Depósitos por Tipo", tipo: "chart" },
    { key: "chart_credito_vs_captacao", label: "Crédito vs Captação Total", tipo: "chart" },
    { key: "chart_composicao_credito", label: "Composição das Operações de Crédito", tipo: "chart" },
    { key: "chart_credito_instituicao", label: "Operações de Crédito por Instituição", tipo: "chart" },
    { key: "chart_composicao_credito_instituicao", label: "Composição do Crédito por Instituição", tipo: "chart" },
    { key: "chart_detalhamento_instituicao", label: "Detalhamento por Instituição", tipo: "chart" },
    { key: "chart_comparativo_municipios", label: "Comparativo com Municípios", tipo: "chart" },
  ],
  comex: [
    { key: "exportacoes", label: "Exportações", tipo: "kpi" },
    { key: "importacoes", label: "Importações", tipo: "kpi" },
    { key: "saldo", label: "Saldo", tipo: "kpi" },
    { key: "chart_exp_vs_imp", label: "Exportações vs Importações", tipo: "chart" },
    { key: "chart_saldo_mensal", label: "Saldo da Balança Comercial (Mensal)", tipo: "chart" },
    { key: "chart_volume_fisico", label: "Volume Físico — Peso Exportado vs Importado", tipo: "chart" },
    { key: "chart_top_produtos", label: "Top 10 Produtos", tipo: "chart" },
    { key: "chart_top_produtos_peso", label: "Top Produtos por Peso", tipo: "chart" },
    { key: "chart_top_paises", label: "Top 10 Países", tipo: "chart" },
    { key: "chart_comparativo_municipios", label: "Comparativo com Municípios", tipo: "chart" },
  ],
  empresas: [
    { key: "abertas_periodo", label: "Abertas no Período", tipo: "kpi" },
    { key: "total_empresas", label: "Total de Empresas", tipo: "kpi" },
    { key: "ativas", label: "Ativas", tipo: "kpi" },
    { key: "mei", label: "MEI", tipo: "kpi" },
    { key: "simples", label: "Simples Nacional", tipo: "kpi" },
    { key: "chart_porte", label: "Distribuição por Porte", tipo: "chart" },
    { key: "chart_situacao_cadastral", label: "Empresas por Situação Cadastral", tipo: "chart" },
    { key: "chart_ativas_fechadas_porte", label: "Ativas vs Fechadas por Porte", tipo: "chart" },
    { key: "chart_setor_cnae", label: "Empresas por Setor de Atividade (CNAE)", tipo: "chart" },
    { key: "chart_capital_social_porte", label: "Capital Social por Porte de Empresa", tipo: "chart" },
  ],
  pix: [
    { key: "volume_pf", label: "Volume PF", tipo: "kpi" },
    { key: "volume_pj", label: "Volume PJ", tipo: "kpi" },
    { key: "volume_total", label: "Volume Total", tipo: "kpi" },
    { key: "chart_vol_pagamentos", label: "Volume de Pagamentos — PF vs PJ", tipo: "chart" },
    { key: "chart_vol_recebimentos", label: "Volume de Recebimentos — PF vs PJ", tipo: "chart" },
    { key: "chart_qtd_transacoes", label: "Quantidade de Transações (Pagadores)", tipo: "chart" },
    { key: "chart_pagadores_unicos", label: "Pessoas Únicas Pagadoras", tipo: "chart" },
    { key: "chart_recebedores_unicos", label: "Pessoas Únicas Recebedoras", tipo: "chart" },
    { key: "chart_comparativo_municipios", label: "Comparativo com Municípios", tipo: "chart" },
  ],
};

export function todasAsChaves() {
  const s = new Set();
  for (const entries of Object.values(INDICADOR_CATALOG)) {
    for (const e of entries) s.add(e.key);
  }
  return s;
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd frontend-observatorio
npx vitest run src/utils/indicadorCatalog.test.js
```

Expected: PASS. (A paridade já passa porque todas as chaves literais atuais do JSX — KPIs — estão no catálogo.)

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/utils/indicadorCatalog.js frontend-observatorio/src/utils/indicadorCatalog.test.js
git commit -m "feat(indicadores): catalogo central de chaves de KPI e grafico"
```

---

### Task 3: `NidPanel` renderiza `ChartInfoIcon` + passthrough no `ComparativoPanel`

**Files:**
- Modify: `frontend-observatorio/src/components/nid/Panel.jsx:51-77`
- Modify: `frontend-observatorio/src/components/nid/ComparativoPanel.jsx` (assinatura + repasse)
- Test: `frontend-observatorio/src/components/nid/Panel.test.jsx` (novo)

**Interfaces:**
- Consumes: `ChartInfoIcon` default export de `src/components/ChartInfoIcon.jsx` (props `dataset`, `indicadorKey`).
- Produces: `NidPanel` aceita props opcionais `dataset` e `indicadorKey`; quando AMBAS presentes, renderiza `<ChartInfoIcon dataset indicadorKey />` ao lado do título. `NidComparativoPanel` aceita e repassa as mesmas props ao seu `NidPanel` interno. Tasks 4-8 dependem disso.

- [ ] **Step 1: Escrever o teste que falha** — criar `frontend-observatorio/src/components/nid/Panel.test.jsx`

```jsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../ChartInfoIcon", () => ({
  default: ({ dataset, indicadorKey }) => (
    <span data-testid="chart-info" data-dataset={dataset} data-key={indicadorKey} />
  ),
}));

import { NidPanel } from "./Panel";

describe("NidPanel + ChartInfoIcon", () => {
  it("sem dataset/indicadorKey não renderiza o ícone", () => {
    render(<NidPanel title="Meu Painel">conteúdo</NidPanel>);
    expect(screen.getByText("Meu Painel")).toBeTruthy();
    expect(screen.queryByTestId("chart-info")).toBeNull();
  });

  it("com dataset e indicadorKey renderiza o ícone com as props", () => {
    render(
      <NidPanel title="Saldo" dataset="caged" indicadorKey="chart_saldo">x</NidPanel>
    );
    const icon = screen.getByTestId("chart-info");
    expect(icon.getAttribute("data-dataset")).toBe("caged");
    expect(icon.getAttribute("data-key")).toBe("chart_saldo");
  });

  it("só uma das props não renderiza o ícone", () => {
    render(<NidPanel title="X" dataset="caged">x</NidPanel>);
    expect(screen.queryByTestId("chart-info")).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd frontend-observatorio
npx vitest run src/components/nid/Panel.test.jsx
```

Expected: FAIL — ícone não renderizado (2º teste).

- [ ] **Step 3: Implementar no `Panel.jsx`** — adicionar o import no topo e alterar `NidPanel`:

```jsx
import ChartInfoIcon from "../ChartInfoIcon";
```

```jsx
export function NidPanel({ title, sub, tabs, onTabChange, children, right, dataset, indicadorKey }) {
  const [active, setActive] = useState(0);
  const comInfo = Boolean(dataset && indicadorKey);
  return (
    <div className="nid-panel">
      <div className="nid-panel-head">
        <div>
          <h3
            className="nid-panel-title"
            style={comInfo ? { display: "flex", alignItems: "center", gap: 6 } : undefined}
          >
            {title}
            {comInfo && <ChartInfoIcon dataset={dataset} indicadorKey={indicadorKey} />}
          </h3>
          {sub && <div className="nid-panel-sub">{sub}</div>}
        </div>
        {tabs ? (
          <div className="nid-panel-actions">
            {tabs.map((t, i) => (
              <button
                key={i}
                className={`nid-tab ${i === active ? "active" : ""}`}
                onClick={() => { setActive(i); onTabChange?.(i); }}
              >
                {t}
              </button>
            ))}
          </div>
        ) : right}
      </div>
      <div>{children}</div>
    </div>
  );
}
```

(Restante do arquivo intocado.)

- [ ] **Step 4: Passthrough no `ComparativoPanel.jsx`** — Ler o arquivo; na assinatura de `NidComparativoPanel` (linha ~24) adicionar `dataset` e `indicadorKey` às props desestruturadas, e no `<NidPanel title={title} ...>` interno (linha ~69) acrescentar `dataset={dataset} indicadorKey={indicadorKey}`. Nada mais muda.

- [ ] **Step 5: Rodar e ver passar + suíte**

```bash
cd frontend-observatorio
npx vitest run src/components/nid/Panel.test.jsx && npm test
```

Expected: PASS (3 testes novos), suíte completa verde.

- [ ] **Step 6: Commit**

```bash
git add frontend-observatorio/src/components/nid/Panel.jsx frontend-observatorio/src/components/nid/Panel.test.jsx frontend-observatorio/src/components/nid/ComparativoPanel.jsx
git commit -m "feat(indicadores): NidPanel renderiza ChartInfoIcon via dataset/indicadorKey"
```

---

### Task 4: Plugagem — CAGED + RAIS (29 painéis)

**Files:**
- Modify: `frontend-observatorio/src/pages/caged/CagedPage.jsx`
- Modify: `frontend-observatorio/src/pages/rais/RaisPage.jsx`

**Interfaces:**
- Consumes: props `dataset`/`indicadorKey` do `NidPanel` (Task 3); chaves do catálogo (Task 2).

- [ ] **Step 1: Plugar os painéis** — em cada `<NidPanel` listado, adicionar as duas props com os literais EXATOS da tabela (o teste de paridade da Task 2 acusa typo). Exemplo do padrão (CagedPage:510):

```jsx
<NidPanel title="Setores · Saldo do Ano" sub={`${anoAtivo || ""} · admissões − desligamentos`} dataset="caged" indicadorKey="chart_setores_saldo">
```

`CagedPage.jsx` — `dataset="caged"` em todos:

| Linha (~) | title | indicadorKey |
|---|---|---|
| 435 | Saldo Mensal/Anual (dinâmico) | `chart_saldo` |
| 477 | Movimentação CAGED | `chart_movimentacao` |
| 510 | Setores · Saldo do Ano | `chart_setores_saldo` |
| 537 | Composição Setorial | `chart_composicao_setorial` |
| 555 | Por Tamanho de Estabelecimento | `chart_tamanho_estabelecimento` |
| 567 | PCD por Tipo de Deficiência | `chart_pcd_deficiencia` |
| 582 | Tipo de Empregador | `chart_tipo_empregador` |
| 596 | Tipo de Estabelecimento | `chart_tipo_estabelecimento` |
| 615 | Movimentações por Setor · Histórico | `chart_setores_historico` |
| 634 | Admissões por Sexo | `chart_admissoes_sexo` |
| 645 | Admissões por Raça/Cor | `chart_admissoes_raca` |
| 657 | Admissões por Faixa Etária | `chart_admissoes_faixa_etaria` |
| 663 | Admissões por Escolaridade | `chart_admissoes_escolaridade` |
| 671 | Tipo de Movimentação | `chart_tipo_movimentacao` |

`RaisPage.jsx` — `dataset="rais"` em todos:

| Linha (~) | title | indicadorKey |
|---|---|---|
| 409 | Evolução de Vínculos | `chart_evolucao_vinculos` |
| 423 | Top Setores (CNAE) | `chart_top_setores` |
| 459 | Turnover Mensal | `chart_turnover_mensal` |
| 467 | Natureza Jurídica | `chart_natureza_juridica` |
| 486 | Tipo de Admissão | `chart_tipo_admissao` |
| 492 | Por Tamanho de Estabelecimento | `chart_tamanho_estabelecimento` |
| 513 | Evolução por Setor | `chart_evolucao_setor` |
| 534 | Vínculos por Sexo | `chart_vinculos_sexo` |
| 545 | Vínculos por Raça/Cor | `chart_vinculos_raca` |
| 559 | Faixa Etária | `chart_faixa_etaria` |
| 567 | Grau de Instrução | `chart_grau_instrucao` |
| 578 | Faixa Salarial (Salários Mínimos) | `chart_faixa_salarial` |
| 585 | Tempo de Emprego | `chart_tempo_emprego` |
| 632 | Motivos de Desligamento | `chart_motivos_desligamento` |
| 638 | Top 10 Ocupações (CBO 2002) | `chart_top_ocupacoes` |

(As linhas são aproximadas — localizar pelo `title`. TODO painel `<NidPanel` dessas duas páginas deve sair da task com as props; nenhum fica de fora.)

- [ ] **Step 2: Rodar paridade + suíte**

```bash
cd frontend-observatorio
npx vitest run src/utils/indicadorCatalog.test.js && npm test
```

Expected: tudo verde (typo numa chave quebra a paridade).

- [ ] **Step 3: Commit**

```bash
git add frontend-observatorio/src/pages/caged/CagedPage.jsx frontend-observatorio/src/pages/rais/RaisPage.jsx
git commit -m "feat(indicadores): tooltip de grafico em CAGED e RAIS"
```

---

### Task 5: Plugagem — ESTBAN + VAF + Dashboard Geral (21 painéis)

**Files:**
- Modify: `frontend-observatorio/src/pages/estban/EstbanPage.jsx`
- Modify: `frontend-observatorio/src/pages/vaf/VafPage.jsx`
- Modify: `frontend-observatorio/src/pages/DashboardGeralPage.jsx`

Mesmo padrão da Task 4 (exemplo lá). Tabelas:

`EstbanPage.jsx` — `dataset="estban"`:

| Linha (~) | title | indicadorKey |
|---|---|---|
| 182 | Evolução das Operações de Crédito | `chart_evolucao_credito` |
| 227 | Evolução da Captação — Depósitos por Tipo | `chart_captacao_depositos` |
| 247 | Crédito vs. Captação Total | `chart_credito_vs_captacao` |
| 266 | Composição das Operações de Crédito | `chart_composicao_credito` |
| 291 | Operações de Crédito por Instituição | `chart_credito_instituicao` |
| 303 | Composição do Crédito por Instituição | `chart_composicao_credito_instituicao` |
| 326 | Detalhamento por Instituição | `chart_detalhamento_instituicao` |
| 346 | `<NidComparativoPanel` | `chart_comparativo_municipios` |

`VafPage.jsx` — `dataset="vaf"`:

| Linha (~) | title | indicadorKey |
|---|---|---|
| 233 | Evolução do IPM | `chart_evolucao_ipm` |
| 248 | ICMS Projetado a partir do IPM | `chart_icms_projetado` |
| 270 | Índice vs Índice Médio | `chart_indice_vs_medio` |
| 292 | IPM Comparativo — Municípios | `chart_ipm_comparativo` |
| 313 | VAF Individual × Estado | `chart_vaf_individual_estado` |
| 333 | Série Anual | `chart_serie_anual` |
| 351 | `<NidComparativoPanel` | `chart_comparativo_municipios` |

`DashboardGeralPage.jsx` — `dataset="geral"`:

| Linha (~) | title | indicadorKey |
|---|---|---|
| 337 | Evolução do PIB | `chart_evolucao_pib` |
| 342 | Receita por Tipo | `chart_receita_por_tipo` |
| 371 | Valor Adicionado por Setor | `chart_va_setor` |
| 387 | PIB Comparativo | `chart_pib_comparativo` |
| 407 | Saldo CAGED | `chart_saldo_caged` |
| 415 | Top Setores · VA | `chart_top_setores_va` |

- [ ] **Step 2: Rodar paridade + suíte** (mesmos comandos da Task 4). Expected: verde.
- [ ] **Step 3: Commit**

```bash
git add frontend-observatorio/src/pages/estban/EstbanPage.jsx frontend-observatorio/src/pages/vaf/VafPage.jsx frontend-observatorio/src/pages/DashboardGeralPage.jsx
git commit -m "feat(indicadores): tooltip de grafico em ESTBAN, VAF e Dashboard Geral"
```

---

### Task 6: Plugagem — Comex + PIX + IPS + Empresas (23 painéis)

**Files:**
- Modify: `frontend-observatorio/src/pages/comex/ComexPage.jsx`
- Modify: `frontend-observatorio/src/pages/pix/PixPage.jsx`
- Modify: `frontend-observatorio/src/pages/ips/IpsPage.jsx`
- Modify: `frontend-observatorio/src/pages/empresas/EmpresasPage.jsx`

Mesmo padrão da Task 4. Tabelas:

`ComexPage.jsx` — `dataset="comex"`: 236→`chart_exp_vs_imp`, 257→`chart_saldo_mensal`, 296→`chart_volume_fisico`, 316→`chart_top_produtos`, 328→`chart_top_produtos_peso`, 340→`chart_top_paises`, 351 (`NidComparativoPanel`)→`chart_comparativo_municipios`.

`PixPage.jsx` — `dataset="pix"`: 163→`chart_vol_pagamentos`, 201→`chart_vol_recebimentos`, 215→`chart_qtd_transacoes`, 229→`chart_pagadores_unicos`, 243→`chart_recebedores_unicos`, 256 (`NidComparativoPanel`)→`chart_comparativo_municipios`.

`IpsPage.jsx` — `dataset="ips"`: 307→`chart_perfil_componente`, 318→`chart_pontos_fortes`, 331→`chart_pontos_melhorar`, 404→`chart_evolucao_tempo`, 434→`chart_comparar_municipios`.

`EmpresasPage.jsx` — `dataset="empresas"`: 177→`chart_porte`, 192→`chart_situacao_cadastral`, 204→`chart_ativas_fechadas_porte`, 224→`chart_setor_cnae`, 239→`chart_capital_social_porte`.

- [ ] **Step 2: Rodar paridade + suíte**. Expected: verde.
- [ ] **Step 3: Commit**

```bash
git add frontend-observatorio/src/pages/comex/ComexPage.jsx frontend-observatorio/src/pages/pix/PixPage.jsx frontend-observatorio/src/pages/ips/IpsPage.jsx frontend-observatorio/src/pages/empresas/EmpresasPage.jsx
git commit -m "feat(indicadores): tooltip de grafico em Comex, PIX, IPS e Empresas"
```

---

### Task 7: Plugagem — PIB + INSS + FPM + Emendas (15 painéis)

**Files:**
- Modify: `frontend-observatorio/src/pages/pib/PibPage.jsx`
- Modify: `frontend-observatorio/src/pages/inss/InssPage.jsx`
- Modify: `frontend-observatorio/src/pages/fpm/FpmPage.jsx`
- Modify: `frontend-observatorio/src/pages/emendas/EmendasPage.jsx`

Mesmo padrão da Task 4. Tabelas:

`PibPage.jsx` — `dataset="pib"`: 221→`chart_evolucao_anual`, 242→`chart_va_setor`, 267→`chart_pib_comparativo`, 288→`chart_serie_anual`, 303 (`NidComparativoPanel`)→`chart_comparativo_municipios`.

`InssPage.jsx` — `dataset="inss"`: 168→`chart_top_categorias`, 179→`chart_evolucao_anual`, 195→`chart_detalhamento_ano_categoria`, 208 (`NidComparativoPanel`)→`chart_comparativo_municipios`.

`FpmPage.jsx` — `dataset="fpm"`: 197→`chart_repasses_mensais`, 209→`chart_populacao_anual`, 222→`chart_total_anual`.

`EmendasPage.jsx` — `dataset="emendas"`: 93→`chart_ranking_parlamentar`, 109→`chart_destino_area`, 118→`chart_funil_execucao`.

- [ ] **Step 2: Rodar paridade + suíte**. Expected: verde.
- [ ] **Step 3: Commit**

```bash
git add frontend-observatorio/src/pages/pib/PibPage.jsx frontend-observatorio/src/pages/inss/InssPage.jsx frontend-observatorio/src/pages/fpm/FpmPage.jsx frontend-observatorio/src/pages/emendas/EmendasPage.jsx
git commit -m "feat(indicadores): tooltip de grafico em PIB, INSS, FPM e Emendas"
```

---

### Task 8: Plugagem final — Arrecadação + Bolsa + Pé-de-Meia + Dinheiro na Mesa + teste inverso

**Files:**
- Modify: `frontend-observatorio/src/pages/arrecadacao/ArrecadacaoPage.jsx`
- Modify: `frontend-observatorio/src/pages/beneficios/BolsaFamiliaPage.jsx`
- Modify: `frontend-observatorio/src/pages/beneficios/PeDeMeiaPage.jsx`
- Modify: `frontend-observatorio/src/pages/dinheiro-na-mesa/DinheiroNaMesaPage.jsx`
- Modify: `frontend-observatorio/src/utils/indicadorCatalog.test.js` (teste inverso)

Plugagem (mesmo padrão da Task 4):

`ArrecadacaoPage.jsx` — `dataset="arrecadacao"`: 160→`chart_serie_mensal`, 199→`chart_composicao_tipo`, 218→`chart_detalhamento_periodo`.

`BolsaFamiliaPage.jsx` — `dataset="bolsa_familia"`: 162→`chart_evolucao_beneficiarios`, 201→`chart_total_vs_primeira_infancia`, 220→`chart_repasses`, 237 (`NidComparativoPanel`)→`chart_comparativo_municipios`.

`PeDeMeiaPage.jsx` — `dataset="pe_de_meia"`: 165→`chart_evolucao_estudantes`, 205→`chart_por_etapa`, 216→`chart_por_incentivo`.

`DinheiroNaMesaPage.jsx` — `dataset="captacao_federal"`: 125→`chart_captacao_anual`, 138→`chart_detalhe_anual`.

- [ ] **Step 2: Escrever o teste inverso (catálogo → fonte)** — adicionar ao fim de `indicadorCatalog.test.js`:

```js
// ── Paridade inversa: catálogo → fonte ───────────────────────────────────────
// Toda entrada do catálogo deve estar plugada em alguma página — pega painel
// esquecido. Exceções: chaves usadas dinamicamente (indicadorKey={d.key}).
const USADAS_DINAMICAMENTE = new Set([
  // IpsPage.jsx:302 — dimensões mapeadas de DIMENSIONS com indicadorKey={d.key}
  "necessidades_humanas_basicas",
  "fundamentos_bem_estar",
  "oportunidades",
]);

describe("paridade catálogo → fonte", () => {
  it("toda entrada do catálogo é usada literalmente no JSX (ou é dinâmica declarada)", () => {
    const usadas = chavesLiteraisNoFonte();
    const naoUsadas = [];
    for (const [dataset, entries] of Object.entries(INDICADOR_CATALOG)) {
      for (const e of entries) {
        if (!usadas.has(e.key) && !USADAS_DINAMICAMENTE.has(e.key)) {
          naoUsadas.push(`${dataset}.${e.key}`);
        }
      }
    }
    expect(naoUsadas, `entradas do catálogo sem uso no JSX: ${naoUsadas.join(", ")}`).toEqual([]);
  });
});
```

- [ ] **Step 3: Rodar e ver passar** (o inverso só passa agora, com TODAS as plugagens feitas — se falhar, a mensagem lista o painel esquecido):

```bash
cd frontend-observatorio
npx vitest run src/utils/indicadorCatalog.test.js && npm test
```

Expected: verde.

- [ ] **Step 4: Commit**

```bash
git add frontend-observatorio/src/pages/arrecadacao/ArrecadacaoPage.jsx frontend-observatorio/src/pages/beneficios/BolsaFamiliaPage.jsx frontend-observatorio/src/pages/beneficios/PeDeMeiaPage.jsx frontend-observatorio/src/pages/dinheiro-na-mesa/DinheiroNaMesaPage.jsx frontend-observatorio/src/utils/indicadorCatalog.test.js
git commit -m "feat(indicadores): plugagem final de tooltips + paridade inversa catalogo-fonte"
```

---

### Task 9: Tela admin `/admin/indicadores`

**Files:**
- Create: `frontend-observatorio/src/utils/indicadorAdmin.js`
- Test: `frontend-observatorio/src/utils/indicadorAdmin.test.js`
- Create: `frontend-observatorio/src/pages/admin/IndicadoresAdminPage.jsx`
- Modify: `frontend-observatorio/src/app/router/AppRouter.jsx` (rota, após o bloco `fontes` linha ~204-207)
- Modify: `frontend-observatorio/src/app/layouts/AdminLayout.jsx` (`ROUTE_LABELS` ~linha 42 e `DADOS_ITEMS` ~linha 134-139)

**Interfaces:**
- Consumes: `INDICADOR_CATALOG`/`todasAsChaves` (Task 2); `GET /indicadores/all` (Task 1); `PUT /indicadores/{dataset}/{key}` (existente).
- Produces: `mesclarCatalogoComBanco(catalog, rows)` → `{ grupos: [{dataset, entries: [{key,label,tipo,preenchido,tooltip,descricao,fonte}]}], orfaos: rows }`; `filtrarGrupos(grupos, {busca, soVazios})` → mesma forma filtrada.

- [ ] **Step 1: Escrever os testes que falham** — criar `frontend-observatorio/src/utils/indicadorAdmin.test.js`

```js
import { describe, expect, it } from "vitest";
import { filtrarGrupos, mesclarCatalogoComBanco } from "./indicadorAdmin";

const CATALOGO = {
  pib: [
    { key: "ultimo_ano", label: "PIB — Último Ano", tipo: "kpi" },
    { key: "chart_evolucao_anual", label: "Evolução Anual do PIB", tipo: "chart" },
  ],
  caged: [{ key: "chart_saldo", label: "Saldo Mensal/Anual", tipo: "chart" }],
};

const BANCO = [
  { dataset: "pib", indicador_key: "ultimo_ano", tooltip: "Valor do PIB no último ano.", descricao: "", fonte: "IBGE" },
  { dataset: "velho", indicador_key: "sumido", tooltip: "linha órfã de refactor", descricao: "", fonte: null },
];

describe("mesclarCatalogoComBanco", () => {
  it("marca preenchido e carrega conteúdo do banco", () => {
    const { grupos, orfaos } = mesclarCatalogoComBanco(CATALOGO, BANCO);
    const pib = grupos.find((g) => g.dataset === "pib");
    const ultimoAno = pib.entries.find((e) => e.key === "ultimo_ano");
    expect(ultimoAno.preenchido).toBe(true);
    expect(ultimoAno.tooltip).toBe("Valor do PIB no último ano.");
    expect(ultimoAno.fonte).toBe("IBGE");
    const chart = pib.entries.find((e) => e.key === "chart_evolucao_anual");
    expect(chart.preenchido).toBe(false);
    expect(chart.tooltip).toBe("");
    expect(orfaos).toHaveLength(1);
    expect(orfaos[0].dataset).toBe("velho");
  });

  it("vazio no banco → tudo não preenchido, zero órfãos", () => {
    const { grupos, orfaos } = mesclarCatalogoComBanco(CATALOGO, []);
    expect(orfaos).toEqual([]);
    expect(grupos.flatMap((g) => g.entries).every((e) => !e.preenchido)).toBe(true);
  });

  it("linha só com espaços não conta como preenchida", () => {
    const { grupos } = mesclarCatalogoComBanco(CATALOGO, [
      { dataset: "caged", indicador_key: "chart_saldo", tooltip: "  ", descricao: "", fonte: null },
    ]);
    const caged = grupos.find((g) => g.dataset === "caged");
    expect(caged.entries[0].preenchido).toBe(false);
  });
});

describe("filtrarGrupos", () => {
  const { grupos } = mesclarCatalogoComBanco(CATALOGO, BANCO);

  it("busca por label (case-insensitive) mantém só matches", () => {
    const r = filtrarGrupos(grupos, { busca: "evolução", soVazios: false });
    expect(r.flatMap((g) => g.entries).map((e) => e.key)).toEqual(["chart_evolucao_anual"]);
  });

  it("busca por key também casa", () => {
    const r = filtrarGrupos(grupos, { busca: "chart_saldo", soVazios: false });
    expect(r.flatMap((g) => g.entries).map((e) => e.key)).toEqual(["chart_saldo"]);
  });

  it("soVazios esconde preenchidos e some com grupo vazio", () => {
    const r = filtrarGrupos(grupos, { busca: "", soVazios: true });
    const keys = r.flatMap((g) => g.entries).map((e) => e.key);
    expect(keys).not.toContain("ultimo_ano");
    expect(keys).toContain("chart_evolucao_anual");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd frontend-observatorio
npx vitest run src/utils/indicadorAdmin.test.js
```

Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Criar `frontend-observatorio/src/utils/indicadorAdmin.js`**

```js
// Lógica pura da tela /admin/indicadores — merge catálogo × banco e filtro.
// Extraída da página para teste unitário (padrão jobStatus.js).

const temConteudo = (r) =>
  Boolean((r.tooltip || "").trim() || (r.descricao || "").trim());

export function mesclarCatalogoComBanco(catalog, rows) {
  const porChave = new Map(
    (rows || []).map((r) => [`${r.dataset} ${r.indicador_key}`, r])
  );
  const usadas = new Set();
  const grupos = Object.entries(catalog).map(([dataset, entries]) => ({
    dataset,
    entries: entries.map((e) => {
      const id = `${dataset} ${e.key}`;
      const row = porChave.get(id);
      if (row) usadas.add(id);
      return {
        key: e.key,
        label: e.label,
        tipo: e.tipo,
        preenchido: row ? temConteudo(row) : false,
        tooltip: row?.tooltip || "",
        descricao: row?.descricao || "",
        fonte: row?.fonte || "",
      };
    }),
  }));
  const orfaos = (rows || []).filter(
    (r) => !usadas.has(`${r.dataset} ${r.indicador_key}`)
  );
  return { grupos, orfaos };
}

export function filtrarGrupos(grupos, { busca, soVazios }) {
  const q = (busca || "").trim().toLowerCase();
  return grupos
    .map((g) => ({
      ...g,
      entries: g.entries.filter((e) => {
        if (soVazios && e.preenchido) return false;
        if (!q) return true;
        return (
          e.label.toLowerCase().includes(q) ||
          e.key.toLowerCase().includes(q) ||
          e.tooltip.toLowerCase().includes(q) ||
          e.descricao.toLowerCase().includes(q) ||
          g.dataset.toLowerCase().includes(q)
        );
      }),
    }))
    .filter((g) => g.entries.length > 0);
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd frontend-observatorio
npx vitest run src/utils/indicadorAdmin.test.js
```

Expected: PASS.

- [ ] **Step 5: Criar `frontend-observatorio/src/pages/admin/IndicadoresAdminPage.jsx`**

```jsx
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CheckIcon } from "@heroicons/react/24/outline";
import api from "../../services/api";
import { useToast } from "../../context/ToastContext";
import NidModal from "../../components/nid/NidModal";
import { INDICADOR_CATALOG } from "../../utils/indicadorCatalog";
import { filtrarGrupos, mesclarCatalogoComBanco } from "../../utils/indicadorAdmin";

/**
 * ADMIN_GLOBAL: preenchimento em lote dos tooltips/descrições de KPIs e
 * gráficos (indicador_info — global, vale para todos os municípios).
 */
export default function IndicadoresAdminPage() {
  const { addToast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [soVazios, setSoVazios] = useState(false);
  const [editando, setEditando] = useState(null); // { dataset, key, label, tooltip, descricao, fonte }
  const [salvando, setSalvando] = useState(false);

  const carregar = () =>
    api
      .get("/indicadores/all")
      .then((r) => setRows(r.data || []))
      .catch(() => addToast("Erro ao carregar indicadores.", "error"))
      .finally(() => setLoading(false));

  useEffect(() => { carregar(); }, []);

  const { grupos, orfaos } = useMemo(
    () => mesclarCatalogoComBanco(INDICADOR_CATALOG, rows),
    [rows]
  );
  const visiveis = useMemo(
    () => filtrarGrupos(grupos, { busca, soVazios }),
    [grupos, busca, soVazios]
  );
  const totais = useMemo(() => {
    const todas = grupos.flatMap((g) => g.entries);
    return { total: todas.length, preenchidos: todas.filter((e) => e.preenchido).length };
  }, [grupos]);

  const salvar = async () => {
    if (!editando || salvando) return;
    setSalvando(true);
    try {
      await api.put(`/indicadores/${editando.dataset}/${editando.key}`, {
        tooltip: editando.tooltip,
        descricao: editando.descricao,
        fonte: editando.fonte,
      });
      addToast(`"${editando.label}" salvo.`, "success");
      setEditando(null);
      carregar();
    } catch (err) {
      addToast(err.response?.data?.detail || "Erro ao salvar.", "error");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">
          Indicadores & Tooltips
        </h1>
        <p className="text-sm text-[var(--text-mute)] mt-1">
          Explicações de KPIs e gráficos exibidas a todos os municípios — tooltip curto
          (hover), descrição completa (modal) e fonte. {totais.preenchidos}/{totais.total} preenchidos.
        </p>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, chave, conteúdo…"
          className="w-72 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] text-[var(--text)] px-3 py-2 text-sm"
          aria-label="Buscar indicador"
        />
        <label className="flex items-center gap-2 text-sm text-[var(--text-dim)]">
          <input
            type="checkbox"
            checked={soVazios}
            onChange={(e) => setSoVazios(e.target.checked)}
            className="rounded"
          />
          Só sem descrição
        </label>
      </div>

      {loading ? (
        <div className="px-6 py-12 text-center text-[var(--text-dim)]">Carregando...</div>
      ) : (
        visiveis.map((g) => (
          <div key={g.dataset} className="bg-[var(--panel)] rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden">
            <h2 className="px-4 py-3 text-sm font-bold uppercase tracking-wider text-[var(--text-dim)] border-b border-[var(--border)]">
              {g.dataset}
            </h2>
            <table className="w-full text-sm">
              <tbody>
                {g.entries.map((e) => (
                  <tr key={e.key} className="border-b border-[var(--border)] last:border-0 align-top">
                    <td className="px-4 py-3 w-64">
                      <p className="font-medium text-[var(--text)]">{e.label}</p>
                      <p className="text-xs text-[var(--text-mute)]">
                        {e.key} · {e.tipo === "chart" ? "gráfico" : "KPI"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {e.preenchido ? (
                        <p className="text-[var(--text-dim)] line-clamp-2">{e.tooltip || e.descricao}</p>
                      ) : (
                        <span className="text-xs italic text-[var(--text-mute)]">Sem descrição</span>
                      )}
                    </td>
                    <td className="px-4 py-3 w-28 text-right">
                      <button
                        onClick={() => setEditando({ dataset: g.dataset, ...e })}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium"
                        style={{
                          background: "color-mix(in oklab, var(--admin-accent, #3b82f6) 12%, transparent)",
                          border: "1px solid color-mix(in oklab, var(--admin-accent, #3b82f6) 35%, transparent)",
                          color: "var(--admin-accent, #3b82f6)",
                        }}
                        aria-label={`Editar ${e.label}`}
                      >
                        {e.preenchido ? "Editar" : "Preencher"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}

      {orfaos.length > 0 && (
        <div className="bg-[var(--panel)] rounded-2xl border border-[var(--border)] shadow-sm p-4">
          <h2 className="text-sm font-bold text-[var(--text)]">Chaves fora do catálogo</h2>
          <p className="text-xs text-[var(--text-mute)] mb-2">
            Existem no banco mas nenhuma tela usa (sobras de renomeações). Nada é apagado automaticamente.
          </p>
          <ul className="text-xs text-[var(--text-dim)] space-y-1">
            {orfaos.map((o) => (
              <li key={`${o.dataset}-${o.indicador_key}`}>
                <code>{o.dataset}.{o.indicador_key}</code>
                {o.tooltip ? ` — ${o.tooltip}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <NidModal
        open={Boolean(editando)}
        onClose={() => setEditando(null)}
        eyebrow={editando ? `${editando.dataset} · ${editando.key}` : ""}
        title={editando?.label || ""}
        size="md"
        footer={
          <>
            <button
              onClick={() => setEditando(null)}
              className="px-4 py-2 rounded-lg text-sm cursor-pointer"
              style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text-dim)" }}
            >
              Cancelar
            </button>
            <button
              onClick={salvar}
              disabled={salvando}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-50"
              style={{
                background: "var(--admin-accent, #3b82f6)", color: "#fff",
                border: "1px solid color-mix(in oklab, var(--admin-accent, #3b82f6) 70%, black)",
              }}
            >
              <CheckIcon className="w-4 h-4" />
              {salvando ? "Salvando…" : "Salvar"}
            </button>
          </>
        }
      >
        {editando && (
          <div className="space-y-3">
            <label className="block text-sm text-[var(--text-dim)]">
              Tooltip (curto, máx. 250)
              <input
                value={editando.tooltip}
                onChange={(e) => setEditando((p) => ({ ...p, tooltip: e.target.value }))}
                maxLength={250}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] text-[var(--text)] px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm text-[var(--text-dim)]">
              Descrição completa
              <textarea
                value={editando.descricao}
                onChange={(e) => setEditando((p) => ({ ...p, descricao: e.target.value }))}
                rows={5}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] text-[var(--text)] px-3 py-2 text-sm resize-none"
              />
            </label>
            <label className="block text-sm text-[var(--text-dim)]">
              Fonte
              <input
                value={editando.fonte}
                onChange={(e) => setEditando((p) => ({ ...p, fonte: e.target.value }))}
                placeholder="Ex.: IBGE — SIDRA"
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] text-[var(--text)] px-3 py-2 text-sm"
              />
            </label>
          </div>
        )}
      </NidModal>
    </motion.div>
  );
}
```

- [ ] **Step 6: Rota e menu**

(a) `AppRouter.jsx`: adicionar import junto aos demais admin pages e a rota após o bloco `fontes` (linha ~204-207):

```jsx
import IndicadoresAdminPage from "../../pages/admin/IndicadoresAdminPage";
```

```jsx
          <Route
            path="indicadores"
            element={<AdminRoute><IndicadoresAdminPage /></AdminRoute>}
          />
```

(b) `AdminLayout.jsx`: em `ROUTE_LABELS` (após a linha `"/admin/fontes"`, ~42):

```js
  "/admin/indicadores":   "Indicadores & Tooltips",
```

Em `DADOS_ITEMS` (após a linha do `fontes`, ~137) — `DocumentTextIcon` já está importado:

```js
  { to: "/admin/indicadores",    label: "Indicadores & Tooltips", icon: DocumentTextIcon },
```

- [ ] **Step 7: Suíte completa**

```bash
cd frontend-observatorio
npm test
```

Expected: verde.

- [ ] **Step 8: Commit**

```bash
git add frontend-observatorio/src/utils/indicadorAdmin.js frontend-observatorio/src/utils/indicadorAdmin.test.js frontend-observatorio/src/pages/admin/IndicadoresAdminPage.jsx frontend-observatorio/src/app/router/AppRouter.jsx frontend-observatorio/src/app/layouts/AdminLayout.jsx
git commit -m "feat(admin): tela /admin/indicadores para preencher tooltips em lote"
```

---

### Task 10: Calendário no side menu + verificação final

**Files:**
- Modify: `frontend-observatorio/src/app/layouts/DashboardLayout.jsx:101-110`

- [ ] **Step 1: Mover a entrada** — em `NAV_STRUCTURE`, remover do grupo "Dados Internos" (linha ~108) o objeto:

```js
      { to: "/app/dados-internos/calendario", label: "Calendário", icon: CalendarIcon, modulo: "dados_internos.calendario" },
```

e inserir como link de primeiro nível logo APÓS a linha do Timeline (~101):

```js
  { type: "link", to: "/app/dados-internos/calendario", label: "Calendário", icon: CalendarIcon, modulo: "dados_internos.calendario" },
```

Rota (`AppRouter.jsx:146`) e chave de módulo NÃO mudam. O grupo Dados Internos fica com 2 filhos (Indicadores, Plano de Governo).

- [ ] **Step 2: Suítes completas (frontend + backend)**

```bash
cd frontend-observatorio && npm test
```

```bash
cd backend && ../venv/Scripts/python.exe -m pytest tests -q
```

Expected: verde nas duas.

- [ ] **Step 3: Commit**

```bash
git add frontend-observatorio/src/app/layouts/DashboardLayout.jsx
git commit -m "feat(nav): Calendario como link de primeiro nivel ao lado do Timeline"
```

---

## Verificação manual (pós-implementação)

1. Como ADMIN_GLOBAL: abrir `/admin/indicadores`, preencher o tooltip de um gráfico (ex.: CAGED · Saldo) e de um KPI; abrir a página correspondente e ver o ℹ️ com hover + modal; editar também pelo lápis inline do próprio gráfico.
2. Como usuário comum ("ver como"): o ℹ️ só aparece nos itens com conteúdo; sem lápis.
3. Side menu: "Calendário" aparece entre "Timeline" e "Impacto de Ações"; o gating por plano continua (cadeado quando o módulo está bloqueado).
