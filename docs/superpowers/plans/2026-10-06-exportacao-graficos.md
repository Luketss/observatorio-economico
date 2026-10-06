# Exportação de gráficos (CSV, XLSX, PNG) para ADMIN_GLOBAL — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao ADMIN_GLOBAL um menu "Exportar" em cada painel de gráfico das páginas de dataset do NID, que baixa a tabela do gráfico em CSV e XLSX e a imagem em PNG, sem mudar nenhuma das 19 páginas.

**Architecture:** Cada componente de gráfico em `charts.jsx` registra num `ExportContext` (provido pelo `NidPanel`) as linhas/colunas que já normaliza e a ref do seu `<svg>`; o `NidPanel` renderiza um `ExportMenu` só para ADMIN_GLOBAL. CSV e PNG saem no navegador (helpers puros em `utils/exportar.js`); XLSX vai por `POST /export/xlsx` (backend, `openpyxl`, `require_role("ADMIN_GLOBAL")`). Páginas não participam.

**Tech Stack:** React 19 + Vite, Vitest 2 + jsdom + @testing-library/react; FastAPI + Pydantic v2 + openpyxl 3.1.5 (já instalado); pytest.

**Spec:** `docs/superpowers/specs/2026-10-06-exportacao-graficos-design.md`

## Global Constraints

- Branch de trabalho: `feat/exportacao-graficos` (criada de `main` 6f9a069; spec em 09e8e78). Repo: `C:\Users\lucas\Documents\projetos\dashboard_prefeituras`. Backend em `backend/` (venv em `venv/`, rodar `venv/Scripts/python -m pytest backend/tests -q` a partir da raiz); frontend em `frontend-observatorio/` (`npx vitest run`, `npx eslint <arquivos>`).
- Só ADMIN_GLOBAL vê o menu (`useAuth().user?.role === "ADMIN_GLOBAL"`); `ViewAsContext` não altera o gating. XLSX exige `Depends(require_role("ADMIN_GLOBAL"))`.
- Payload do XLSX: `{ titulo, subtitulo, fonte, municipio, dataset, colunas: [{chave, rotulo, tipo}], linhas }`; `tipo ∈ {"texto","numero","ano"}`; limites `1..50` colunas, `0..5000` linhas, `colunas*linhas ≤ 50_000` (422 acima).
- CSV: UTF-8 com BOM `\uFEFF`, separador `;`, quebra `\r\n`, decimal com vírgula, sem separador de milhar, `null`/`undefined`/não-finito → célula vazia, campo com `;` `"` `\r` `\n` entre aspas com `"` duplicada.
- PNG: escala 2x, fundo = cor computada de `--panel`, título 16px negrito, sub 12px, rodapé 11px `Fonte: {fonte} · UAIZI NID · dd/mm/aaaa` (sem fonte: `UAIZI NID · dd/mm/aaaa`); nenhum `var(--…)` sobra no SVG clonado. Sem canvas/`toBlob` → rejeita com mensagem legível, nunca lança síncrono.
- Nome de arquivo: `nid_{dataset}_{painel}_{municipio}_{AAAA-MM-DD}.{ext}`, partes em slug ASCII minúsculo, partes vazias omitidas. `dataset` = prop `dataset` do `NidPanel` ou primeiro segmento após `/app/` do pathname; `municipio` = `viewAsNome` do `ViewAsContext` (vazio fora do view-as).
- Exportar é best-effort: nenhum caminho pode quebrar painel, página, render ou auth. Erros viram `addToast(mensagem, "error")`.
- Fora de `ExportProvider`, `useRegistrarExportacao` é no-op (gráficos usados fora de `NidPanel` continuam funcionando). `Sparkline` não registra. Gráficos HTML (`HBarChart`, variante de barras do `DonutChart`) registram sem `svgRef` → sem item PNG.
- Hooks sempre antes de qualquer `return` antecipado nos componentes de gráfico (regra dos hooks); `colunas`/`linhas` memoizados com `useMemo` para não re-registrar a cada render.
- Sem dependências novas em nenhum dos lados. Sem `??=`/`||=` no front (ESLint em `ecmaVersion: 2020`). Python: aspas ASCII retas, SQLAlchemy ORM, Pydantic v2 (`model_config`, `model_validator`).
- Commits em ASCII (sem acento), `tipo(escopo): descricao`, terminando com `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Nunca stage `.claude/settings.local.json`.
- Gates: suite backend verde (hoje 619+), `npx vitest run` verde (hoje 492), eslint sem erro **novo** nos arquivos tocados (`charts.jsx` e `Panel.jsx` podem ter avisos pré-existentes; não são gate).
- Ruling do controller (desvios conscientes da spec, registrados aqui): (a) o endpoint devolve `fastapi.Response` com os bytes em vez de `StreamingResponse` — arquivos ≤ 50k células cabem em memória e `Response.body` é testável sem ASGI; (b) com dois ou mais gráficos no painel o menu mostra uma lista plana `"{Formato} · {rotulo}"` em vez de submenus aninhados — mesma informação, menos superfície de teclado/ARIA.

## Review Focus

1. Rótulo ou valor de texto contendo `;`, aspas ou quebra de linha (ex.: nome de município "São João d'El Rei; MG") → CSV abre no Excel na célula certa. Teste em Task 3.
2. Número `NaN`/`Infinity`/`null` numa série com buraco (MultiLineChart com ano sem dado) → célula vazia no CSV e `None` no XLSX, nunca a string "NaN". Testes em Task 1 (`_celula`) e Task 3 (`formatarCelulaCsv`).
3. Painel cujo gráfico está em `loading` → menu continua visível para o admin, mas desabilitado com tooltip; não some nem lança. Teste em Task 7.
4. Painel com `sub` que é um nó React (não string) → o PNG e o XLSX recebem `""`, sem `[object Object]`. Teste em Task 7.
5. Gráfico HTML (`HBarChart`) → itens CSV/XLSX aparecem e o PNG não; clicar em PNG nunca é possível. Teste em Task 7.
6. Payload acima de 50 mil células → backend 422 e front mostra o toast de limite. Testes em Task 2 e Task 7.
7. `svgParaPng` em navegador sem canvas (`getContext` null) → rejeita com "Não foi possível gerar a imagem neste navegador" e o painel segue intacto. Teste em Task 4.

---

### Task 1: Backend puro — slug, hora local, schema e serviço XLSX

**Files:**
- Create: `backend/app/core/slug.py`
- Modify: `backend/app/core/datas.py` (adicionar `agora_local`)
- Create: `backend/app/schemas/export.py`
- Create: `backend/app/services/export_service.py`
- Test: `backend/tests/test_export_service.py`

**Interfaces:**
- Consumes: `app.core.datas.FUSO_BRASIL` (existente).
- Produces:
  - `app.core.slug.slugify(texto: str | None, max_len: int = 60) -> str`
  - `app.core.datas.agora_local() -> datetime` (tz-aware, fuso −3)
  - `app.schemas.export.ColunaExport(chave, rotulo, tipo)`, `app.schemas.export.ExportXlsxIn(titulo, subtitulo, fonte, municipio, dataset, colunas, linhas)` com validação de limites
  - `app.services.export_service.gerar_xlsx(dados: ExportXlsxIn) -> bytes`
  - `app.services.export_service.nome_arquivo_xlsx(dados: ExportXlsxIn) -> str`
  - `app.services.export_service.MEDIA_XLSX` (string do media type)

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `backend/tests/test_export_service.py`:

```python
"""Exportacao XLSX generica (spec 2026-10-06-exportacao-graficos): slug, schema e planilha."""
from io import BytesIO

import pytest
from openpyxl import load_workbook
from pydantic import ValidationError

from app.core.datas import agora_local
from app.core.slug import slugify
from app.schemas.export import ColunaExport, ExportXlsxIn
from app.services.export_service import MEDIA_XLSX, _celula, gerar_xlsx, nome_arquivo_xlsx


def _dados(**extra):
    base = dict(
        titulo="Evolução Anual do PIB",
        subtitulo="PIB total por ano",
        fonte="IBGE",
        municipio="Divinópolis",
        dataset="pib",
        colunas=[
            ColunaExport(chave="periodo", rotulo="Período", tipo="ano"),
            ColunaExport(chave="valor", rotulo="PIB Total", tipo="numero"),
            ColunaExport(chave="obs", rotulo="Obs", tipo="texto"),
        ],
        linhas=[
            {"periodo": 2021, "valor": 1234.5, "obs": "a; b"},
            {"periodo": "2022", "valor": "1500,25", "obs": None},
            {"periodo": 2023, "valor": None, "obs": "", "ignorada": 1},
        ],
    )
    base.update(extra)
    return ExportXlsxIn(**base)


# ---------- slugify ----------

def test_slugify_remove_acentos_e_pontuacao():
    assert slugify("Evolução Anual do PIB") == "evolucao-anual-do-pib"
    assert slugify("São João d'El Rei; MG") == "sao-joao-d-el-rei-mg"


def test_slugify_vazio_e_none():
    assert slugify("") == ""
    assert slugify(None) == ""
    assert slugify("---") == ""


def test_slugify_corta_no_max_len_sem_hifen_final():
    assert slugify("a" * 70, max_len=10) == "a" * 10
    assert slugify("abc def", max_len=4) == "abc"


# ---------- agora_local ----------

def test_agora_local_e_tz_aware_no_fuso_brasil():
    agora = agora_local()
    assert agora.tzinfo is not None
    assert agora.utcoffset().total_seconds() == -3 * 3600


# ---------- schema ----------

def test_schema_rejeita_mais_de_50_colunas():
    cols = [ColunaExport(chave=f"c{i}", rotulo=f"C{i}") for i in range(51)]
    with pytest.raises(ValidationError):
        ExportXlsxIn(titulo="t", colunas=cols, linhas=[])


def test_schema_rejeita_acima_de_50_mil_celulas():
    cols = [ColunaExport(chave=f"c{i}", rotulo=f"C{i}") for i in range(11)]
    linhas = [{"c0": 1}] * 4600  # 11 * 4600 = 50_600 > 50_000
    with pytest.raises(ValidationError):
        ExportXlsxIn(titulo="t", colunas=cols, linhas=linhas)


def test_schema_aceita_exatamente_o_limite():
    cols = [ColunaExport(chave=f"c{i}", rotulo=f"C{i}") for i in range(10)]
    dados = ExportXlsxIn(titulo="t", colunas=cols, linhas=[{"c0": 1}] * 5000)
    assert len(dados.linhas) == 5000


def test_schema_rejeita_tipo_desconhecido_e_sem_colunas():
    with pytest.raises(ValidationError):
        ColunaExport(chave="x", rotulo="X", tipo="data")
    with pytest.raises(ValidationError):
        ExportXlsxIn(titulo="t", colunas=[], linhas=[])


# ---------- _celula ----------

def test_celula_numero_aceita_string_com_virgula_e_devolve_none_para_vazio():
    assert _celula("1500,25", "numero") == 1500.25
    assert _celula(1234.5, "numero") == 1234.5
    assert _celula(None, "numero") is None
    assert _celula("", "numero") is None
    assert _celula("abc", "numero") == "abc"
    assert _celula(float("nan"), "numero") is None
    assert _celula(float("inf"), "numero") is None


def test_celula_ano_vira_int_e_texto_vira_str():
    assert _celula("2022", "ano") == 2022
    assert _celula(2023, "ano") == 2023
    assert _celula("n/d", "ano") == "n/d"
    assert _celula(42, "texto") == "42"


# ---------- gerar_xlsx ----------

def test_gerar_xlsx_estrutura_e_tipos():
    conteudo = gerar_xlsx(_dados())
    wb = load_workbook(BytesIO(conteudo))
    ws = wb["Dados"]
    assert ws["A1"].value == "Evolução Anual do PIB"
    assert ws["A1"].font.bold is True
    assert ws["A2"].value == "PIB total por ano"
    assert ws["A3"].value == "Município: Divinópolis"
    assert ws["A4"].value == "Fonte: IBGE"
    assert ws["A5"].value.startswith("Gerado em ") and ws["A5"].value.endswith("(UTC-3)")
    assert ws["A6"].value is None
    assert [c.value for c in ws[7]] == ["Período", "PIB Total", "Obs"]
    assert ws["A7"].font.bold is True
    # dados
    assert ws["A8"].value == 2021 and isinstance(ws["A8"].value, int)
    assert ws["B8"].value == 1234.5 and ws["B8"].number_format == "#,##0.00"
    assert ws["C8"].value == "a; b"
    assert ws["A9"].value == 2022  # "2022" virou int
    assert ws["B9"].value == 1500.25
    assert ws["C9"].value is None
    assert ws["B10"].value is None and ws["C10"].value is None
    # chave desconhecida ignorada: so 3 colunas
    assert ws.max_column == 3
    assert ws.auto_filter.ref == "A7:C10"


def test_gerar_xlsx_sem_metadados_opcionais_e_sem_linhas():
    dados = _dados(subtitulo=None, fonte=None, municipio=None, linhas=[])
    ws = load_workbook(BytesIO(gerar_xlsx(dados)))["Dados"]
    assert ws["A2"].value is None
    assert ws["A3"].value is None
    assert ws["A4"].value is None
    assert [c.value for c in ws[7]] == ["Período", "PIB Total", "Obs"]
    assert ws.auto_filter.ref == "A7:C7"


def test_gerar_xlsx_largura_de_coluna_limitada_a_60():
    longo = "x" * 200
    dados = _dados(linhas=[{"periodo": 2021, "valor": 1, "obs": longo}])
    ws = load_workbook(BytesIO(gerar_xlsx(dados)))["Dados"]
    assert ws.column_dimensions["C"].width == 60
    assert ws.column_dimensions["A"].width >= 8


def test_media_type_xlsx():
    assert MEDIA_XLSX == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


# ---------- nome_arquivo_xlsx ----------

def test_nome_arquivo_completo_e_sem_partes_vazias():
    nome = nome_arquivo_xlsx(_dados())
    assert nome.startswith("nid_pib_evolucao-anual-do-pib_divinopolis_")
    assert nome.endswith(".xlsx")
    assert len(nome.split("_")) == 5  # nid, dataset, painel, municipio, data
    nome2 = nome_arquivo_xlsx(_dados(dataset=None, municipio=None))
    assert nome2.startswith("nid_evolucao-anual-do-pib_")
    assert len(nome2.split("_")) == 3
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run (da raiz do repo): `venv/Scripts/python -m pytest backend/tests/test_export_service.py -q`
Expected: FAIL na coleta com `ModuleNotFoundError: No module named 'app.core.slug'`.

- [ ] **Step 3: Implementar `slugify` e `agora_local`**

Criar `backend/app/core/slug.py`:

```python
"""Slug ASCII minusculo para nomes de arquivo (espelho de utils/exportar.js slugify no front)."""
import re
import unicodedata


def slugify(texto: str | None, max_len: int = 60) -> str:
    if not texto:
        return ""
    s = unicodedata.normalize("NFKD", str(texto))
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[^A-Za-z0-9]+", "-", s).strip("-").lower()
    return s[:max_len].strip("-")
```

Em `backend/app/core/datas.py`, acrescentar ao final:

```python


def agora_local() -> datetime:
    """Instante atual no fuso do Brasil (tz-aware). Para carimbos "gerado em"."""
    return datetime.now(FUSO_BRASIL)
```

- [ ] **Step 4: Implementar o schema**

Criar `backend/app/schemas/export.py`:

```python
from typing import Literal

from pydantic import BaseModel, Field, model_validator

LIMITE_CELULAS = 50_000


class ColunaExport(BaseModel):
    chave: str = Field(min_length=1, max_length=80)
    rotulo: str = Field(min_length=1, max_length=120)
    tipo: Literal["texto", "numero", "ano"] = "texto"


class ExportXlsxIn(BaseModel):
    titulo: str = Field(min_length=1, max_length=200)
    subtitulo: str | None = Field(default=None, max_length=300)
    fonte: str | None = Field(default=None, max_length=200)
    municipio: str | None = Field(default=None, max_length=150)
    dataset: str | None = Field(default=None, max_length=60)
    colunas: list[ColunaExport] = Field(min_length=1, max_length=50)
    linhas: list[dict[str, str | int | float | None]] = Field(default_factory=list, max_length=5000)

    @model_validator(mode="after")
    def _limite_de_celulas(self):
        if len(self.colunas) * len(self.linhas) > LIMITE_CELULAS:
            raise ValueError(
                f"Tabela grande demais para exportar (limite de {LIMITE_CELULAS} celulas)"
            )
        return self
```

- [ ] **Step 5: Implementar o serviço**

Criar `backend/app/services/export_service.py`:

```python
"""Gera a planilha XLSX generica do menu Exportar (so ADMIN_GLOBAL, ver router export).

Nao sabe o que e PIB ou CAGED: tabula o que recebe. Aba "Dados": titulo (A1),
subtitulo (A2), municipio (A3), fonte (A4), gerado em (A5), linha em branco,
cabecalho na linha 7 com filtro automatico, dados a partir da linha 8.
"""
import math
from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

from app.core.datas import agora_local
from app.core.slug import slugify
from app.schemas.export import ExportXlsxIn

MEDIA_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
LINHA_CABECALHO = 7
LARGURA_MIN = 8
LARGURA_MAX = 60


def _celula(valor, tipo: str):
    """Converte o valor cru do front para o tipo da coluna. Vazio/nao-finito -> None."""
    if valor is None or valor == "":
        return None
    if tipo == "numero":
        if isinstance(valor, bool):
            return int(valor)
        if isinstance(valor, (int, float)):
            if isinstance(valor, float) and not math.isfinite(valor):
                return None
            return valor
        try:
            return float(str(valor).replace(".", "").replace(",", ".")) if "," in str(valor) else float(str(valor))
        except ValueError:
            return str(valor)
    if tipo == "ano":
        try:
            return int(valor)
        except (TypeError, ValueError):
            return str(valor)
    return str(valor)


def nome_arquivo_xlsx(dados: ExportXlsxIn) -> str:
    partes = [
        "nid",
        slugify(dados.dataset),
        slugify(dados.titulo),
        slugify(dados.municipio),
        agora_local().strftime("%Y-%m-%d"),
    ]
    return "_".join(p for p in partes if p) + ".xlsx"


def gerar_xlsx(dados: ExportXlsxIn) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Dados"

    ws["A1"] = dados.titulo
    ws["A1"].font = Font(bold=True, size=14)
    if dados.subtitulo:
        ws["A2"] = dados.subtitulo
    if dados.municipio:
        ws["A3"] = f"Município: {dados.municipio}"
    if dados.fonte:
        ws["A4"] = f"Fonte: {dados.fonte}"
    ws["A5"] = "Gerado em " + agora_local().strftime("%d/%m/%Y %H:%M") + " (UTC-3)"

    negrito = Font(bold=True)
    cinza = PatternFill("solid", fgColor="EEEEEE")
    larguras = []
    for ci, col in enumerate(dados.colunas, start=1):
        celula = ws.cell(row=LINHA_CABECALHO, column=ci, value=col.rotulo)
        celula.font = negrito
        celula.fill = cinza
        larguras.append(len(col.rotulo))

    for ri, linha in enumerate(dados.linhas, start=LINHA_CABECALHO + 1):
        for ci, col in enumerate(dados.colunas, start=1):
            valor = _celula(linha.get(col.chave), col.tipo)
            celula = ws.cell(row=ri, column=ci, value=valor)
            if col.tipo == "numero" and isinstance(valor, (int, float)):
                celula.number_format = "#,##0.00"
            elif col.tipo == "ano" and isinstance(valor, int):
                celula.number_format = "0"
            if valor is not None:
                larguras[ci - 1] = max(larguras[ci - 1], len(str(valor)))

    for ci, largura in enumerate(larguras, start=1):
        ws.column_dimensions[get_column_letter(ci)].width = min(LARGURA_MAX, max(LARGURA_MIN, largura + 2))

    ultima_linha = LINHA_CABECALHO + len(dados.linhas)
    ws.auto_filter.ref = f"A{LINHA_CABECALHO}:{get_column_letter(len(dados.colunas))}{ultima_linha}"

    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
```

Atenção ao `_celula` para `"numero"` com string: `"1500,25"` → `1500.25`; `"1.500,25"` → remove o ponto de milhar e troca a vírgula → `1500.25`; `"1500.25"` (sem vírgula) → `float("1500.25")`. Strings não numéricas voltam como texto.

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `venv/Scripts/python -m pytest backend/tests/test_export_service.py -q`
Expected: 15 passed.

- [ ] **Step 7: Suite completa do backend**

Run: `venv/Scripts/python -m pytest backend/tests -q`
Expected: tudo verde (contagem anterior + 15).

- [ ] **Step 8: Commit**

```bash
git add backend/app/core/slug.py backend/app/core/datas.py backend/app/schemas/export.py backend/app/services/export_service.py backend/tests/test_export_service.py
git commit -m "feat(export): slug, agora_local, schema e servico XLSX generico com openpyxl

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Backend — endpoint `POST /export/xlsx` com RBAC

**Files:**
- Create: `backend/app/api/v1/routers/export.py`
- Modify: `backend/app/main.py` (import + `include_router`)
- Test: `backend/tests/test_export_endpoint.py`

**Interfaces:**
- Consumes (Task 1): `ExportXlsxIn`, `gerar_xlsx`, `nome_arquivo_xlsx`, `MEDIA_XLSX`; `app.api.deps.require_role` (existente).
- Produces: rota `POST {API_PREFIX}/export/xlsx` → `fastapi.Response` (bytes XLSX, `Content-Disposition: attachment; filename="…"`), 403 para papel ≠ ADMIN_GLOBAL, 422 em payload inválido.

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `backend/tests/test_export_endpoint.py`:

```python
"""POST /export/xlsx: handler, RBAC e Content-Disposition."""
from io import BytesIO
from types import SimpleNamespace

import pytest
from openpyxl import load_workbook

from app.api.deps import require_role
from app.api.v1.routers.export import exportar_xlsx
from app.core.exceptions import ForbiddenException
from app.schemas.export import ColunaExport, ExportXlsxIn
from app.services.export_service import MEDIA_XLSX


def _user(role):
    return SimpleNamespace(id=1, role=SimpleNamespace(nome=role), municipio_id=None)


def _dados():
    return ExportXlsxIn(
        titulo="Saldo CAGED",
        dataset="caged",
        municipio="Divinópolis",
        colunas=[
            ColunaExport(chave="periodo", rotulo="Período"),
            ColunaExport(chave="saldo", rotulo="Saldo", tipo="numero"),
        ],
        linhas=[{"periodo": "jan/26", "saldo": 120}, {"periodo": "fev/26", "saldo": -30}],
    )


def test_handler_devolve_xlsx_com_content_disposition():
    resp = exportar_xlsx(_dados(), current_user=_user("ADMIN_GLOBAL"))
    assert resp.status_code == 200
    assert resp.media_type == MEDIA_XLSX
    cd = resp.headers["content-disposition"]
    assert cd.startswith('attachment; filename="nid_caged_saldo-caged_divinopolis_')
    assert cd.endswith('.xlsx"')
    ws = load_workbook(BytesIO(resp.body))["Dados"]
    assert ws["A1"].value == "Saldo CAGED"
    assert ws["B9"].value == -30


def test_rbac_admin_municipio_e_visualizador_sao_barrados():
    dep = require_role("ADMIN_GLOBAL")
    for papel in ("ADMIN_MUNICIPIO", "VISUALIZADOR", "ANALISTA"):
        with pytest.raises(ForbiddenException):
            dep(current_user=_user(papel))


def test_rbac_admin_global_passa():
    dep = require_role("ADMIN_GLOBAL")
    user = _user("ADMIN_GLOBAL")
    assert dep(current_user=user) is user


def test_rota_registrada_no_app_com_prefixo_e_dependencia_de_papel():
    from app.main import app

    rotas = {r.path: r for r in app.routes if hasattr(r, "path")}
    assert "/api/v1/export/xlsx" in rotas
    rota = rotas["/api/v1/export/xlsx"]
    assert rota.methods == {"POST"}
    nomes = [getattr(d.call, "__qualname__", "") for d in rota.dependant.dependencies]
    assert any("role_checker" in n for n in nomes), nomes
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `venv/Scripts/python -m pytest backend/tests/test_export_endpoint.py -q`
Expected: FAIL na coleta com `ModuleNotFoundError: No module named 'app.api.v1.routers.export'`.

- [ ] **Step 3: Implementar o router**

Criar `backend/app/api/v1/routers/export.py`:

```python
"""Exportacao generica (menu Exportar dos paineis). Apenas ADMIN_GLOBAL.

Devolve os bytes direto (Response, nao StreamingResponse): o payload e limitado
a 50 mil celulas, cabe em memoria e fica testavel sem ASGI.
"""
from app.api.deps import require_role
from app.schemas.export import ExportXlsxIn
from app.services.export_service import MEDIA_XLSX, gerar_xlsx, nome_arquivo_xlsx
from fastapi import APIRouter, Depends, Response

router = APIRouter(prefix="/export", tags=["Export"])


@router.post("/xlsx")
def exportar_xlsx(
    dados: ExportXlsxIn,
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    conteudo = gerar_xlsx(dados)
    nome = nome_arquivo_xlsx(dados)
    return Response(
        content=conteudo,
        media_type=MEDIA_XLSX,
        headers={"Content-Disposition": f'attachment; filename="{nome}"'},
    )
```

- [ ] **Step 4: Registrar em `main.py`**

Em `backend/app/main.py`, localizar o bloco de imports dos routers (`from app.api.v1.routers import (` … `)`) e acrescentar `export` à lista em ordem alfabética. Depois da linha `app.include_router(auth.router, prefix=API_PREFIX)` (linha ~115), acrescentar:

```python
app.include_router(export.router, prefix=API_PREFIX)
```

(Se o import dos routers for feito em linhas separadas `from app.api.v1.routers import auth, usuarios, …`, acrescentar `export` nessa lista.)

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `venv/Scripts/python -m pytest backend/tests/test_export_endpoint.py -q`
Expected: 4 passed.

- [ ] **Step 6: Suite completa + importação do app**

Run: `venv/Scripts/python -m pytest backend/tests -q`
Expected: tudo verde (+4).

Run: `cd backend && ../venv/Scripts/python -c "from app.main import app; print([r.path for r in app.routes if 'export' in getattr(r,'path','')])"`
Expected: `['/api/v1/export/xlsx']`.

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/v1/routers/export.py backend/app/main.py backend/tests/test_export_endpoint.py
git commit -m "feat(export): POST /export/xlsx restrito a ADMIN_GLOBAL

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Frontend puro — `utils/exportar.js` (slug, nome, CSV, download, fontes)

**Files:**
- Create: `frontend-observatorio/src/utils/exportar.js`
- Test: `frontend-observatorio/src/utils/exportar.test.js`

**Interfaces:**
- Consumes: nada.
- Produces (todos exportados de `utils/exportar.js`):
  - `FONTES_DATASET: Record<string, string>`
  - `slugify(texto, maxLen = 60) → string`
  - `datasetDe(datasetProp, pathname) → string`
  - `nomeArquivo({ dataset, painel, municipio, ext, data = new Date() }) → string`
  - `formatarCelulaCsv(valor) → string`
  - `gerarCsv(colunas, linhas) → string` (com BOM)
  - `baixarBlob(blob, nome, doc = document, win = window) → void`
  - `rodapePng(dataset, data = new Date()) → string`
  (A parte de PNG, `inlinarEstilosSvg` e `svgParaPng`, entra em Task 4 no mesmo arquivo.)

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `frontend-observatorio/src/utils/exportar.test.js`:

```js
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  FONTES_DATASET,
  baixarBlob,
  datasetDe,
  formatarCelulaCsv,
  gerarCsv,
  nomeArquivo,
  rodapePng,
  slugify,
} from "./exportar";

describe("slugify", () => {
  it("remove acentos, pontuação e espaços", () => {
    expect(slugify("Evolução Anual do PIB")).toBe("evolucao-anual-do-pib");
    expect(slugify("São João d'El Rei; MG")).toBe("sao-joao-d-el-rei-mg");
  });
  it("vazio/null/só símbolos → vazio", () => {
    expect(slugify("")).toBe("");
    expect(slugify(null)).toBe("");
    expect(slugify("---")).toBe("");
  });
  it("corta no maxLen sem hífen final", () => {
    expect(slugify("a".repeat(70), 10)).toBe("a".repeat(10));
    expect(slugify("abc def", 4)).toBe("abc");
  });
});

describe("datasetDe", () => {
  it("prop vence o pathname", () => {
    expect(datasetDe("pib", "/app/caged")).toBe("pib");
  });
  it("sem prop usa o primeiro segmento após /app/", () => {
    expect(datasetDe(undefined, "/app/analise-economica")).toBe("analise-economica");
    expect(datasetDe(null, "/app/pib/")).toBe("pib");
  });
  it("rota fora de /app → vazio", () => {
    expect(datasetDe(undefined, "/admin/usuarios")).toBe("");
    expect(datasetDe(undefined, "")).toBe("");
  });
});

describe("nomeArquivo", () => {
  const data = new Date(2026, 9, 6, 15, 0, 0); // 06/10/2026 local
  it("monta nid_dataset_painel_municipio_data.ext em slug", () => {
    expect(
      nomeArquivo({ dataset: "pib", painel: "Evolução Anual do PIB", municipio: "Divinópolis", ext: "csv", data })
    ).toBe("nid_pib_evolucao-anual-do-pib_divinopolis_2026-10-06.csv");
  });
  it("omite partes vazias", () => {
    expect(nomeArquivo({ painel: "Saldo", ext: "png", data })).toBe("nid_saldo_2026-10-06.png");
  });
  it("usa a data local, não UTC", () => {
    const tarde = new Date(2026, 9, 6, 23, 30, 0);
    expect(nomeArquivo({ painel: "x", ext: "csv", data: tarde })).toContain("_2026-10-06.csv");
  });
});

describe("formatarCelulaCsv", () => {
  it("número com vírgula decimal e sem milhar", () => {
    expect(formatarCelulaCsv(1234.5)).toBe("1234,5");
    expect(formatarCelulaCsv(-30)).toBe("-30");
    expect(formatarCelulaCsv(0)).toBe("0");
  });
  it("nulos e não finitos viram vazio", () => {
    expect(formatarCelulaCsv(null)).toBe("");
    expect(formatarCelulaCsv(undefined)).toBe("");
    expect(formatarCelulaCsv(NaN)).toBe("");
    expect(formatarCelulaCsv(Infinity)).toBe("");
  });
  it("texto com ; aspas ou quebra vai entre aspas com aspas duplicadas", () => {
    expect(formatarCelulaCsv("a; b")).toBe('"a; b"');
    expect(formatarCelulaCsv('Rio "Grande"')).toBe('"Rio ""Grande"""');
    expect(formatarCelulaCsv("linha1\nlinha2")).toBe('"linha1\nlinha2"');
    expect(formatarCelulaCsv("simples")).toBe("simples");
  });
});

describe("gerarCsv", () => {
  const colunas = [
    { chave: "periodo", rotulo: "Período", tipo: "texto" },
    { chave: "valor", rotulo: "PIB; Total", tipo: "numero" },
  ];
  const linhas = [
    { periodo: "2021", valor: 1234.5 },
    { periodo: "2022", valor: null },
    { periodo: "2023", valor: NaN },
  ];
  it("BOM, cabeçalho, ; e CRLF, com quebra final", () => {
    const csv = gerarCsv(colunas, linhas);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe('Período;"PIB; Total"\r\n2021;1234,5\r\n2022;\r\n2023;\r\n');
  });
  it("sem linhas → só cabeçalho", () => {
    expect(gerarCsv(colunas, []).slice(1)).toBe('Período;"PIB; Total"\r\n');
  });
  it("chave ausente na linha → célula vazia", () => {
    expect(gerarCsv(colunas, [{ periodo: "2021" }]).slice(1)).toBe('Período;"PIB; Total"\r\n2021;\r\n');
  });
});

describe("baixarBlob", () => {
  it("cria <a download>, clica, remove e revoga a URL", () => {
    const blob = new Blob(["x"], { type: "text/plain" });
    const click = vi.fn();
    const remove = vi.fn();
    const a = { click, remove, set href(v) { this._href = v; }, get href() { return this._href; } };
    const doc = { createElement: vi.fn(() => a), body: { appendChild: vi.fn() } };
    const win = { URL: { createObjectURL: vi.fn(() => "blob:abc"), revokeObjectURL: vi.fn() } };
    baixarBlob(blob, "arquivo.csv", doc, win);
    expect(doc.createElement).toHaveBeenCalledWith("a");
    expect(a.href).toBe("blob:abc");
    expect(a.download).toBe("arquivo.csv");
    expect(doc.body.appendChild).toHaveBeenCalledWith(a);
    expect(click).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(win.URL.revokeObjectURL).toHaveBeenCalledWith("blob:abc");
  });
});

describe("FONTES_DATASET e rodapePng", () => {
  const data = new Date(2026, 9, 6);
  it("tem fonte para os datasets principais", () => {
    for (const k of ["pib", "caged", "rais", "arrecadacao", "estban", "comex", "empresas", "pix", "ips", "vaf", "fpm", "bolsa_familia", "pe_de_meia", "inss"]) {
      expect(typeof FONTES_DATASET[k]).toBe("string");
    }
  });
  it("rodapé com fonte conhecida e sem fonte", () => {
    expect(rodapePng("pib", data)).toBe("Fonte: IBGE · UAIZI NID · 06/10/2026");
    expect(rodapePng("desconhecido", data)).toBe("UAIZI NID · 06/10/2026");
    expect(rodapePng("", data)).toBe("UAIZI NID · 06/10/2026");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run (em `frontend-observatorio/`): `npx vitest run src/utils/exportar.test.js`
Expected: FAIL com `Failed to resolve import "./exportar"`.

- [ ] **Step 3: Implementar**

Criar `frontend-observatorio/src/utils/exportar.js`:

```js
// Exportação de gráficos (CSV / PNG no navegador; XLSX via POST /export/xlsx).
// Helpers puros, testáveis sem DOM real: funções que tocam o DOM recebem
// `doc`/`win` injetáveis com default nos globais.
// Spec: docs/superpowers/specs/2026-10-06-exportacao-graficos-design.md

// Fonte institucional por dataset (rodapé do PNG e linha "Fonte" do XLSX).
export const FONTES_DATASET = {
  pib: "IBGE",
  arrecadacao: "SEF / Receita",
  caged: "MTE / Novo CAGED",
  rais: "MTE / RAIS",
  bolsa_familia: "MDS",
  pe_de_meia: "MEC",
  inss: "INSS",
  estban: "BCB / ESTBAN",
  comex: "MDIC / Comex Stat",
  empresas: "RFB / CNPJ",
  pix: "BCB",
  ips: "IPS Brasil",
  vaf: "SEF-MG / VAF",
  fpm: "STN / FPM",
};

export function slugify(texto, maxLen = 60) {
  if (texto == null || texto === "") return "";
  const semAcento = String(texto).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const slug = semAcento.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return slug.slice(0, maxLen).replace(/-+$/g, "");
}

export function datasetDe(datasetProp, pathname) {
  if (datasetProp) return String(datasetProp);
  const m = /^\/app\/([a-z0-9-]+)/.exec(pathname || "");
  return m ? m[1] : "";
}

function dataLocalIso(data) {
  const p = (n) => String(n).padStart(2, "0");
  return `${data.getFullYear()}-${p(data.getMonth() + 1)}-${p(data.getDate())}`;
}

function dataLocalBr(data) {
  const p = (n) => String(n).padStart(2, "0");
  return `${p(data.getDate())}/${p(data.getMonth() + 1)}/${data.getFullYear()}`;
}

export function nomeArquivo({ dataset, painel, municipio, ext, data = new Date() }) {
  const partes = ["nid", slugify(dataset), slugify(painel), slugify(municipio), dataLocalIso(data)];
  return `${partes.filter(Boolean).join("_")}.${ext}`;
}

export function rodapePng(dataset, data = new Date()) {
  const fonte = FONTES_DATASET[dataset];
  const base = `UAIZI NID · ${dataLocalBr(data)}`;
  return fonte ? `Fonte: ${fonte} · ${base}` : base;
}

export function formatarCelulaCsv(valor) {
  if (valor == null) return "";
  if (typeof valor === "number") {
    return Number.isFinite(valor) ? String(valor).replace(".", ",") : "";
  }
  const s = String(valor);
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function gerarCsv(colunas, linhas) {
  const cabecalho = colunas.map((c) => formatarCelulaCsv(c.rotulo)).join(";");
  const corpo = (linhas || []).map((l) => colunas.map((c) => formatarCelulaCsv(l[c.chave])).join(";"));
  return "\uFEFF" + [cabecalho, ...corpo].join("\r\n") + "\r\n";
}

export function baixarBlob(blob, nome, doc = document, win = window) {
  const url = win.URL.createObjectURL(blob);
  const a = doc.createElement("a");
  a.href = url;
  a.download = nome;
  a.rel = "noopener";
  doc.body.appendChild(a);
  a.click();
  a.remove();
  win.URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/utils/exportar.test.js`
Expected: PASS, 18 testes.

- [ ] **Step 5: Lint**

Run: `npx eslint src/utils/exportar.js src/utils/exportar.test.js`
Expected: nenhum erro.

- [ ] **Step 6: Commit**

```bash
git add src/utils/exportar.js src/utils/exportar.test.js
git commit -m "feat(export): utils de exportacao - slug, nome de arquivo, CSV pt-BR, download e fontes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

(`git` roda em `frontend-observatorio/`; os caminhos acima são relativos a ela.)

---

### Task 4: Frontend puro — PNG (`inlinarEstilosSvg`, `svgParaPng`) em `utils/exportar.js`

**Files:**
- Modify: `frontend-observatorio/src/utils/exportar.js` (acrescentar ao final)
- Modify: `frontend-observatorio/src/utils/exportar.test.js` (acrescentar `describe`s)

**Interfaces:**
- Consumes: nada novo.
- Produces:
  - `PROPRIEDADES_SVG: string[]`
  - `resolverVars(valor, estiloRaiz) → string` (troca `var(--x[, fb])` pelo valor em `:root` ou fallback; `""` se não resolver)
  - `inlinarEstilosSvg(svgEl, win = window) → { clone: SVGElement, largura: number, altura: number }` — garante que nenhum `var(` sobra no clone (resolve ou remove)
  - `svgParaPng(svgEl, { titulo = "", sub = "", rodape = "", escala = 2, doc = document, win = window } = {}) → Promise<Blob>` — rejeita com `Error("Não foi possível gerar a imagem neste navegador")` sem canvas/`toBlob`, e com `Error("Gráfico indisponível para exportar")` se `svgEl` for nulo.

- [ ] **Step 1: Escrever os testes (falhando)**

Acrescentar ao final de `src/utils/exportar.test.js` (e incluir `inlinarEstilosSvg, resolverVars, svgParaPng` no import do topo):

```js
describe("resolverVars", () => {
  const raiz = { getPropertyValue: (n) => ({ "--accent-1": "#ff0000" }[n] || "") };
  it("resolve pela raiz, usa fallback, ou devolve vazio", () => {
    expect(resolverVars("var(--accent-1)", raiz)).toBe("#ff0000");
    expect(resolverVars("var(--nada, #00ff00)", raiz)).toBe("#00ff00");
    expect(resolverVars("var(--nada)", raiz)).toBe("");
    expect(resolverVars("rgb(1, 2, 3)", raiz)).toBe("rgb(1, 2, 3)");
    expect(resolverVars("", raiz)).toBe("");
    expect(resolverVars(null, raiz)).toBe("");
    expect(resolverVars("var(--accent-1)", null)).toBe("");
  });
});
```

e, em seguida:

```js
describe("inlinarEstilosSvg", () => {
  // O jsdom não resolve var() em getComputedStyle de forma confiável, então o
  // `win` é falso: `computados` é o que getComputedStyle devolve para qualquer
  // elemento do svg, `raiz` é o que devolve para document.documentElement.
  function winFake(computados = {}, raiz = {}) {
    return {
      getComputedStyle: (el) => ({
        getPropertyValue: (p) => (el === document.documentElement ? raiz[p] ?? "" : computados[p] ?? ""),
      }),
    };
  }
  function svgComVar() {
    document.body.innerHTML = `
      <svg viewBox="0 0 100 50" width="100" height="50">
        <path d="M0 0 L10 10" fill="var(--accent-1)" stroke="var(--accent-1, #00ff00)" class="nid-line"></path>
        <text x="1" y="1" style="fill: var(--text); font-family: var(--font-mono), monospace">a</text>
      </svg>`;
    return document.querySelector("svg");
  }
  it("usa o estilo computado quando ele já vem resolvido", () => {
    const { clone, largura, altura } = inlinarEstilosSvg(svgComVar(), winFake({ fill: "rgb(255, 0, 0)", stroke: "rgb(255, 0, 0)", "font-family": "Inter" }));
    expect(largura).toBe(100);
    expect(altura).toBe(50);
    expect(clone.getAttribute("xmlns")).toBe("http://www.w3.org/2000/svg");
    const path = clone.querySelector("path");
    expect(path.getAttribute("fill")).toBe("rgb(255, 0, 0)");
    expect(path.getAttribute("stroke")).toBe("rgb(255, 0, 0)");
    expect(path.getAttribute("class")).toBeNull();
    expect(clone.outerHTML).not.toMatch(/var\(/);
  });
  it("resolve var() pela raiz quando o computado vem cru", () => {
    const { clone } = inlinarEstilosSvg(svgComVar(), winFake({ fill: "var(--accent-1)", stroke: "var(--accent-1, #00ff00)" }, { "--accent-1": "#ff0000", "--text": "#111111" }));
    const path = clone.querySelector("path");
    expect(path.getAttribute("fill")).toBe("#ff0000");
    expect(path.getAttribute("stroke")).toBe("#ff0000");
    expect(clone.outerHTML).not.toMatch(/var\(/);
  });
  it("sem computado e sem variável na raiz usa o fallback do var() ou remove o atributo", () => {
    const { clone } = inlinarEstilosSvg(svgComVar(), winFake({}, {}));
    const path = clone.querySelector("path");
    expect(path.getAttribute("fill")).toBeNull();          // var(--accent-1) sem fallback → removido
    expect(path.getAttribute("stroke")).toBe("#00ff00");    // var(--accent-1, #00ff00) → fallback
    expect(clone.querySelector("text").getAttribute("style")).toBeNull(); // style com var() → removido
    expect(clone.outerHTML).not.toMatch(/var\(/);
  });
  it("sem width/height usa o viewBox", () => {
    document.body.innerHTML = `<svg viewBox="0 0 640 280"><rect width="1" height="1"/></svg>`;
    const { largura, altura, clone } = inlinarEstilosSvg(document.querySelector("svg"), winFake());
    expect(largura).toBe(640);
    expect(altura).toBe(280);
    expect(clone.getAttribute("width")).toBe("640");
  });
});

describe("svgParaPng", () => {
  function fakes({ comCanvas = true, falhaImagem = false } = {}) {
    const ctx = { scale: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(), drawImage: vi.fn(), fillStyle: "", font: "", globalAlpha: 1 };
    const canvas = {
      width: 0, height: 0,
      getContext: vi.fn(() => (comCanvas ? ctx : null)),
      toBlob: comCanvas ? vi.fn((cb) => cb(new Blob(["png"], { type: "image/png" }))) : undefined,
    };
    class Image {
      set src(v) { this._src = v; setTimeout(() => (falhaImagem ? this.onerror?.(new Error("x")) : this.onload?.()), 0); }
    }
    const doc = { createElement: vi.fn(() => canvas), documentElement: document.documentElement };
    const win = {
      Image,
      URL: window.URL,
      getComputedStyle: (el) => window.getComputedStyle(el),
      XMLSerializer: window.XMLSerializer,
    };
    return { ctx, canvas, doc, win };
  }
  function svg() {
    document.body.innerHTML = `<style>:root{--panel:#fafafa;--text:#111111}</style><svg viewBox="0 0 100 50"><rect width="1" height="1" fill="red"/></svg>`;
    return document.querySelector("svg");
  }
  it("desenha fundo, título, sub, gráfico e rodapé em escala 2x e devolve um Blob PNG", async () => {
    const { ctx, canvas, doc, win } = fakes();
    const blob = await svgParaPng(svg(), { titulo: "Evolução", sub: "PIB total", rodape: "Fonte: IBGE · UAIZI NID · 06/10/2026", doc, win });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/png");
    expect(ctx.scale).toHaveBeenCalledWith(2, 2);
    expect(canvas.width).toBeGreaterThan(100 * 2);
    expect(ctx.fillRect).toHaveBeenCalledTimes(1);
    const textos = ctx.fillText.mock.calls.map((c) => c[0]);
    expect(textos).toEqual(["Evolução", "PIB total", "Fonte: IBGE · UAIZI NID · 06/10/2026"]);
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(canvas.toBlob.mock.calls[0][1]).toBe("image/png");
  });
  it("sem título/sub/rodapé não escreve texto", async () => {
    const { ctx, doc, win } = fakes();
    await svgParaPng(svg(), { doc, win });
    expect(ctx.fillText).not.toHaveBeenCalled();
  });
  it("sem canvas → rejeita com mensagem legível, sem lançar síncrono", async () => {
    const { doc, win } = fakes({ comCanvas: false });
    const p = svgParaPng(svg(), { doc, win });
    expect(p).toBeInstanceOf(Promise);
    await expect(p).rejects.toThrow("Não foi possível gerar a imagem neste navegador");
  });
  it("svg nulo → rejeita", async () => {
    const { doc, win } = fakes();
    await expect(svgParaPng(null, { doc, win })).rejects.toThrow("Gráfico indisponível para exportar");
  });
  it("imagem que falha ao carregar → rejeita", async () => {
    const { doc, win } = fakes({ falhaImagem: true });
    await expect(svgParaPng(svg(), { doc, win })).rejects.toThrow("Falha ao renderizar o gráfico");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/utils/exportar.test.js`
Expected: os 18 anteriores passam; os novos falham com `inlinarEstilosSvg is not a function` / `svgParaPng is not a function`.

- [ ] **Step 3: Implementar**

Acrescentar ao final de `src/utils/exportar.js`:

```js
// ────────── PNG ──────────
// O SVG dos gráficos usa variáveis CSS (var(--accent-1)) e classes do tema. Um
// SVG serializado para <img> não enxerga o CSS da página, então inlinamos o
// estilo computado de cada elemento como atributo antes de desenhar no canvas.

export const PROPRIEDADES_SVG = [
  "fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray",
  "stroke-linecap", "stroke-linejoin", "opacity", "font-family", "font-size", "font-weight",
  "text-anchor", "dominant-baseline", "letter-spacing",
];

function dimensoesDo(svgEl) {
  const rect = typeof svgEl.getBoundingClientRect === "function" ? svgEl.getBoundingClientRect() : { width: 0, height: 0 };
  let largura = Math.round(rect.width) || Number(svgEl.getAttribute("width")) || 0;
  let altura = Math.round(rect.height) || Number(svgEl.getAttribute("height")) || 0;
  if (!largura || !altura) {
    const vb = (svgEl.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
    if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
      largura = largura || vb[2];
      altura = altura || vb[3];
    }
  }
  return { largura: largura || 800, altura: altura || 300 };
}

// Troca cada var(--nome[, fallback]) pelo valor da variável na raiz (:root) ou
// pelo fallback. Se ainda sobrar var(), devolve "" (quem chama remove o atributo).
export function resolverVars(valor, estiloRaiz) {
  if (!valor || !valor.includes("var(")) return valor || "";
  let falhou = false;
  const resolvido = valor.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, (_m, nome, fallback) => {
    const v = estiloRaiz ? String(estiloRaiz.getPropertyValue(nome) || "").trim() : "";
    const fb = fallback ? fallback.trim() : "";
    if (!v && !fb) falhou = true;
    return v || fb;
  });
  // Qualquer var() sem valor nem fallback invalida o valor inteiro ("fill: ;" não é CSS útil).
  return falhou || resolvido.includes("var(") ? "" : resolvido.trim();
}

export function inlinarEstilosSvg(svgEl, win = window) {
  const clone = svgEl.cloneNode(true);
  const { largura, altura } = dimensoesDo(svgEl);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(largura));
  clone.setAttribute("height", String(altura));
  if (!clone.getAttribute("viewBox")) clone.setAttribute("viewBox", `0 0 ${largura} ${altura}`);
  const raiz = svgEl.ownerDocument ? svgEl.ownerDocument.documentElement : null;
  const estiloRaiz = raiz ? win.getComputedStyle(raiz) : null;
  const originais = [svgEl, ...svgEl.querySelectorAll("*")];
  const clonados = [clone, ...clone.querySelectorAll("*")];
  originais.forEach((el, i) => {
    const alvo = clonados[i];
    if (!alvo) return;
    const estilo = win.getComputedStyle(el);
    PROPRIEDADES_SVG.forEach((prop) => {
      // 1) estilo computado (já resolvido pelo navegador); 2) atributo original com var() resolvido pela raiz
      let valor = resolverVars(estilo.getPropertyValue(prop), estiloRaiz);
      if (!valor) valor = resolverVars(alvo.getAttribute(prop), estiloRaiz);
      if (valor) alvo.setAttribute(prop, valor);
      else if ((alvo.getAttribute(prop) || "").includes("var(")) alvo.removeAttribute(prop);
    });
    alvo.removeAttribute("class");
    const estiloInline = alvo.getAttribute("style");
    if (estiloInline && estiloInline.includes("var(")) {
      const resolvido = resolverVars(estiloInline, estiloRaiz);
      if (resolvido) alvo.setAttribute("style", resolvido);
      else alvo.removeAttribute("style");
    }
  });
  return { clone, largura, altura };
}

function svgParaDataUrl(clone, win) {
  const Serializer = win.XMLSerializer || XMLSerializer;
  const xml = new Serializer().serializeToString(clone);
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
}

function carregarImagem(url, win) {
  return new Promise((resolve, reject) => {
    const img = new win.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Falha ao renderizar o gráfico"));
    img.src = url;
  });
}

function corDoTema(doc, win, variavel, padrao) {
  try {
    const v = win.getComputedStyle(doc.documentElement).getPropertyValue(variavel).trim();
    return v || padrao;
  } catch {
    return padrao;
  }
}

export function svgParaPng(svgEl, { titulo = "", sub = "", rodape = "", escala = 2, doc = document, win = window } = {}) {
  return new Promise((resolve, reject) => {
    if (!svgEl) return reject(new Error("Gráfico indisponível para exportar"));
    const canvas = doc.createElement("canvas");
    const ctx = typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
    if (!ctx || typeof canvas.toBlob !== "function") {
      return reject(new Error("Não foi possível gerar a imagem neste navegador"));
    }
    const { clone, largura, altura } = inlinarEstilosSvg(svgEl, win);
    const padX = 24;
    const alturaTitulo = titulo ? 30 : 0;
    const alturaSub = sub ? 20 : 0;
    const topo = 16 + alturaTitulo + alturaSub + (titulo || sub ? 8 : 0);
    const base = rodape ? 36 : 16;
    const totalW = largura + padX * 2;
    const totalH = topo + altura + base;
    canvas.width = totalW * escala;
    canvas.height = totalH * escala;
    ctx.scale(escala, escala);
    const fundo = corDoTema(doc, win, "--panel", "#ffffff");
    const texto = corDoTema(doc, win, "--text", "#111111");
    const fonte = "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.fillStyle = fundo;
    ctx.fillRect(0, 0, totalW, totalH);
    ctx.fillStyle = texto;
    let y = 16;
    if (titulo) { ctx.font = `700 16px ${fonte}`; ctx.fillText(titulo, padX, y + 16); y += alturaTitulo; }
    if (sub) { ctx.font = `400 12px ${fonte}`; ctx.fillText(sub, padX, y + 12); y += alturaSub; }
    carregarImagem(svgParaDataUrl(clone, win), win)
      .then((img) => {
        ctx.drawImage(img, padX, topo, largura, altura);
        if (rodape) {
          ctx.font = `400 11px ${fonte}`;
          ctx.globalAlpha = 0.7;
          ctx.fillText(rodape, padX, topo + altura + 22);
          ctx.globalAlpha = 1;
        }
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Falha ao gerar PNG"))), "image/png");
      })
      .catch(reject);
  });
}
```

Nota sobre o teste "sem canvas": o jsdom não implementa `getContext` (devolve `null` e loga "Not implemented: HTMLCanvasElement.prototype.getContext"); por isso os testes passam `doc`/`win` falsos. O aviso do jsdom pode aparecer no console se algum teste usar o `document` real num canvas; o `fakes()` evita isso.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/utils/exportar.test.js`
Expected: PASS, 28 testes (18 + 1 resolverVars + 4 inlinar + 5 svgParaPng), sem avisos "Not implemented" no console.

- [ ] **Step 5: Lint**

Run: `npx eslint src/utils/exportar.js src/utils/exportar.test.js`
Expected: nenhum erro.

- [ ] **Step 6: Commit**

```bash
git add src/utils/exportar.js src/utils/exportar.test.js
git commit -m "feat(export): PNG do grafico - inlina estilos do SVG e desenha no canvas com titulo e rodape

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Frontend puro — `utils/exportarColunas.js` (linhas/colunas por tipo de gráfico)

**Files:**
- Create: `frontend-observatorio/src/utils/exportarColunas.js`
- Test: `frontend-observatorio/src/utils/exportarColunas.test.js`

**Interfaces:**
- Consumes: nada.
- Produces (cada função devolve `{ colunas: [{chave, rotulo, tipo}], linhas: object[] }`, com `data` nulo/vazio → `linhas: []`):
  - `exportacaoArea(data, label = "Valor")` — `data: [{label, value}]`
  - `exportacaoEmpilhado(data, keys = [], comTotal = false)` — `data: [{label, [k]: number}]`
  - `exportacaoMultiLinha(data, series = [])` — `data: [{label, [s]: number|null}]`
  - `exportacaoTwin(data, { acumulado = false } = {})` — `data: [{label, admissoes, desligamentos}]`
  - `exportacaoDonut(data)` — `data: [{label|name, value}]`
  - `exportacaoRanking(data, { comPosicao = false, offset = 0 } = {})` — `data: [{label, value}]`
  - `COLUNA_PERIODO` (constante `{ chave: "periodo", rotulo: "Período", tipo: "texto" }`)

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `frontend-observatorio/src/utils/exportarColunas.test.js`:

```js
import { describe, expect, it } from "vitest";
import {
  COLUNA_PERIODO,
  exportacaoArea,
  exportacaoDonut,
  exportacaoEmpilhado,
  exportacaoMultiLinha,
  exportacaoRanking,
  exportacaoTwin,
} from "./exportarColunas";

const chaves = (r) => r.colunas.map((c) => c.chave);

describe("exportacaoArea", () => {
  it("período + valor com o rótulo do gráfico", () => {
    const r = exportacaoArea([{ label: "2021", value: 10 }, { label: "2022", value: 12.5 }], "PIB Total");
    expect(r.colunas).toEqual([COLUNA_PERIODO, { chave: "valor", rotulo: "PIB Total", tipo: "numero" }]);
    expect(r.linhas).toEqual([{ periodo: "2021", valor: 10 }, { periodo: "2022", valor: 12.5 }]);
  });
  it("data vazio ou nulo → sem linhas, colunas presentes", () => {
    expect(exportacaoArea([], "x").linhas).toEqual([]);
    expect(exportacaoArea(null, "x").linhas).toEqual([]);
    expect(chaves(exportacaoArea(undefined))).toEqual(["periodo", "valor"]);
  });
});

describe("exportacaoEmpilhado", () => {
  const data = [{ label: "2021", agro: 1, ind: 2 }, { label: "2022", agro: 3 }];
  it("uma coluna por key, valores ausentes viram null", () => {
    const r = exportacaoEmpilhado(data, ["agro", "ind"]);
    expect(chaves(r)).toEqual(["periodo", "agro", "ind"]);
    expect(r.linhas[1]).toEqual({ periodo: "2022", agro: 3, ind: null });
  });
  it("comTotal soma as keys ignorando null", () => {
    const r = exportacaoEmpilhado(data, ["agro", "ind"], true);
    expect(chaves(r)).toEqual(["periodo", "agro", "ind", "total"]);
    expect(r.linhas.map((l) => l.total)).toEqual([3, 3]);
  });
});

describe("exportacaoMultiLinha", () => {
  it("uma coluna por série e preserva buracos (null)", () => {
    const r = exportacaoMultiLinha([{ label: "2021", A: 1, B: null }, { label: "2022", A: 2 }], ["A", "B"]);
    expect(chaves(r)).toEqual(["periodo", "A", "B"]);
    expect(r.linhas).toEqual([{ periodo: "2021", A: 1, B: null }, { periodo: "2022", A: 2, B: null }]);
  });
});

describe("exportacaoTwin", () => {
  const data = [
    { label: "jan/26", admissoes: 100, desligamentos: 80 },
    { label: "fev/26", admissoes: 50, desligamentos: 90 },
  ];
  it("admissões, desligamentos e saldo calculado", () => {
    const r = exportacaoTwin(data);
    expect(chaves(r)).toEqual(["periodo", "admissoes", "desligamentos", "saldo"]);
    expect(r.linhas.map((l) => l.saldo)).toEqual([20, -40]);
  });
  it("acumulado soma os saldos", () => {
    const r = exportacaoTwin(data, { acumulado: true });
    expect(chaves(r)).toEqual(["periodo", "admissoes", "desligamentos", "saldo", "acumulado"]);
    expect(r.linhas.map((l) => l.acumulado)).toEqual([20, -20]);
  });
});

describe("exportacaoDonut", () => {
  it("categoria, valor e participação em % somando 100", () => {
    const r = exportacaoDonut([{ label: "Serviços", value: 60 }, { name: "Indústria", value: 40 }]);
    expect(chaves(r)).toEqual(["categoria", "valor", "participacao"]);
    expect(r.linhas).toEqual([
      { categoria: "Serviços", valor: 60, participacao: 60 },
      { categoria: "Indústria", valor: 40, participacao: 40 },
    ]);
  });
  it("total zero → participação null", () => {
    expect(exportacaoDonut([{ label: "a", value: 0 }]).linhas[0].participacao).toBeNull();
  });
  it("participação com 2 casas", () => {
    const r = exportacaoDonut([{ label: "a", value: 1 }, { label: "b", value: 2 }]);
    expect(r.linhas.map((l) => l.participacao)).toEqual([33.33, 66.67]);
  });
});

describe("exportacaoRanking", () => {
  const data = [{ label: "Divinópolis", value: 300 }, { label: "Formiga", value: 120 }];
  it("nome + valor", () => {
    const r = exportacaoRanking(data);
    expect(chaves(r)).toEqual(["nome", "valor"]);
    expect(r.linhas[0]).toEqual({ nome: "Divinópolis", valor: 300 });
  });
  it("comPosicao e offset", () => {
    const r = exportacaoRanking(data, { comPosicao: true, offset: 10 });
    expect(chaves(r)).toEqual(["posicao", "nome", "valor"]);
    expect(r.linhas.map((l) => l.posicao)).toEqual([11, 12]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/utils/exportarColunas.test.js`
Expected: FAIL com `Failed to resolve import "./exportarColunas"`.

- [ ] **Step 3: Implementar**

Criar `frontend-observatorio/src/utils/exportarColunas.js`:

```js
// Monta { colunas, linhas } a partir do `data` que cada gráfico de charts.jsx
// já recebe, com os mesmos valores dos tooltips e sem formatação de moeda.
// Puro: sem React, sem DOM. Spec: docs/superpowers/specs/2026-10-06-exportacao-graficos-design.md

export const COLUNA_PERIODO = { chave: "periodo", rotulo: "Período", tipo: "texto" };

const numero = (chave, rotulo) => ({ chave, rotulo, tipo: "numero" });
const lista = (data) => (Array.isArray(data) ? data : []);
const ouNull = (v) => (v == null ? null : v);

export function exportacaoArea(data, label = "Valor") {
  return {
    colunas: [COLUNA_PERIODO, numero("valor", label)],
    linhas: lista(data).map((d) => ({ periodo: d.label, valor: ouNull(d.value) })),
  };
}

export function exportacaoEmpilhado(data, keys = [], comTotal = false) {
  const colunas = [COLUNA_PERIODO, ...keys.map((k) => numero(k, k))];
  if (comTotal) colunas.push(numero("total", "Total"));
  const linhas = lista(data).map((d) => {
    const linha = { periodo: d.label };
    let total = 0;
    keys.forEach((k) => {
      linha[k] = ouNull(d[k]);
      if (typeof d[k] === "number") total += d[k];
    });
    if (comTotal) linha.total = total;
    return linha;
  });
  return { colunas, linhas };
}

export function exportacaoMultiLinha(data, series = []) {
  return {
    colunas: [COLUNA_PERIODO, ...series.map((s) => numero(s, s))],
    linhas: lista(data).map((d) => {
      const linha = { periodo: d.label };
      series.forEach((s) => { linha[s] = ouNull(d[s]); });
      return linha;
    }),
  };
}

export function exportacaoTwin(data, { acumulado = false } = {}) {
  const colunas = [
    COLUNA_PERIODO,
    numero("admissoes", "Admissões"),
    numero("desligamentos", "Desligamentos"),
    numero("saldo", "Saldo"),
  ];
  if (acumulado) colunas.push(numero("acumulado", "Saldo acumulado"));
  let soma = 0;
  const linhas = lista(data).map((d) => {
    const adm = Number(d.admissoes) || 0;
    const des = Number(d.desligamentos) || 0;
    const saldo = adm - des;
    soma += saldo;
    const linha = { periodo: d.label, admissoes: adm, desligamentos: des, saldo };
    if (acumulado) linha.acumulado = soma;
    return linha;
  });
  return { colunas, linhas };
}

export function exportacaoDonut(data) {
  const itens = lista(data);
  const total = itens.reduce((s, d) => s + (Number(d.value) || 0), 0);
  return {
    colunas: [
      { chave: "categoria", rotulo: "Categoria", tipo: "texto" },
      numero("valor", "Valor"),
      numero("participacao", "Participação (%)"),
    ],
    linhas: itens.map((d) => ({
      categoria: d.label != null ? d.label : d.name,
      valor: ouNull(d.value),
      participacao: total ? Math.round(((Number(d.value) || 0) / total) * 10000) / 100 : null,
    })),
  };
}

export function exportacaoRanking(data, { comPosicao = false, offset = 0 } = {}) {
  const colunas = [
    ...(comPosicao ? [numero("posicao", "Posição")] : []),
    { chave: "nome", rotulo: "Nome", tipo: "texto" },
    numero("valor", "Valor"),
  ];
  const linhas = lista(data).map((d, i) => {
    const linha = { nome: d.label, valor: ouNull(d.value) };
    if (comPosicao) linha.posicao = i + 1 + offset;
    return linha;
  });
  return { colunas, linhas };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/utils/exportarColunas.test.js`
Expected: PASS, 12 testes.

- [ ] **Step 5: Lint + commit**

Run: `npx eslint src/utils/exportarColunas.js src/utils/exportarColunas.test.js` → sem erro.

```bash
git add src/utils/exportarColunas.js src/utils/exportarColunas.test.js
git commit -m "feat(export): helpers puros de colunas/linhas por tipo de grafico

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `ExportContext` — registro pelos gráficos sem tempestade de renders

**Files:**
- Create: `frontend-observatorio/src/components/nid/ExportContext.jsx`
- Test: `frontend-observatorio/src/components/nid/ExportContext.test.jsx`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `ExportProvider({ children })`
  - `useRegistrarExportacao({ id, rotulo, colunas, linhas, svgRef, carregando })` — registra no mount/mudança, remove no unmount, no-op fora do provider. **Quem chama deve memoizar `colunas`/`linhas` (`useMemo`)**: o efeito depende das referências.
  - `useExportacoes() → Registro[]` com `Registro = { id, rotulo, colunas, linhas, svgRef, carregando }`, ordem de registro; `[]` fora do provider.

Dois contextos separados: um só com as funções `registrar`/`remover` (estáveis, consumido pelos gráficos: eles **não** re-renderizam quando a lista muda) e outro com a lista (consumido só pelo menu).

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `frontend-observatorio/src/components/nid/ExportContext.test.jsx`:

```jsx
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useMemo, useRef, useState } from "react";
import { ExportProvider, useExportacoes, useRegistrarExportacao } from "./ExportContext";

function Lista() {
  const regs = useExportacoes();
  return <div data-testid="lista">{regs.map((r) => `${r.rotulo}:${r.linhas.length}:${r.carregando ? "L" : "ok"}`).join("|")}</div>;
}

let rendersGrafico = 0;
function Grafico({ id, rotulo, dados, carregando = false }) {
  rendersGrafico += 1;
  const svgRef = useRef(null);
  const exportacao = useMemo(
    () => ({ colunas: [{ chave: "v", rotulo: "V", tipo: "numero" }], linhas: dados.map((v) => ({ v })) }),
    [dados]
  );
  useRegistrarExportacao({ id, rotulo, colunas: exportacao.colunas, linhas: exportacao.linhas, svgRef, carregando });
  return <svg ref={svgRef} data-testid={`svg-${id}`} />;
}

describe("ExportContext", () => {
  it("fora do provider: hook é no-op e lista é vazia", () => {
    render(<><Grafico id="a" rotulo="A" dados={[1]} /><Lista /></>);
    expect(screen.getByTestId("lista").textContent).toBe("");
  });

  it("registra, atualiza e remove no unmount", () => {
    function Harness() {
      const [mostrar, setMostrar] = useState(true);
      const [dados, setDados] = useState([1, 2]);
      return (
        <ExportProvider>
          {mostrar && <Grafico id="a" rotulo="Área" dados={dados} />}
          <Grafico id="b" rotulo="Donut" dados={[1]} carregando />
          <Lista />
          <button onClick={() => setDados([1, 2, 3])}>mais</button>
          <button onClick={() => setMostrar(false)}>remover</button>
        </ExportProvider>
      );
    }
    render(<Harness />);
    expect(screen.getByTestId("lista").textContent).toBe("Área:2:ok|Donut:1:L");
    act(() => screen.getByText("mais").click());
    expect(screen.getByTestId("lista").textContent).toBe("Área:3:ok|Donut:1:L");
    act(() => screen.getByText("remover").click());
    expect(screen.getByTestId("lista").textContent).toBe("Donut:1:L");
  });

  it("registro guarda a ref do svg", () => {
    function Probe() {
      const regs = useExportacoes();
      return <span data-testid="tem-svg">{String(Boolean(regs[0]?.svgRef?.current))}</span>;
    }
    render(<ExportProvider><Grafico id="a" rotulo="A" dados={[1]} /><Probe /></ExportProvider>);
    expect(screen.getByTestId("tem-svg").textContent).toBe("true");
  });

  it("mudança na lista não re-renderiza o gráfico (contextos separados)", () => {
    rendersGrafico = 0;
    function Harness() {
      const [mostrarB, setMostrarB] = useState(false);
      return (
        <ExportProvider>
          <Grafico id="a" rotulo="A" dados={[1]} />
          {mostrarB && <Grafico id="b" rotulo="B" dados={[2]} />}
          <Lista />
          <button onClick={() => setMostrarB(true)}>b</button>
        </ExportProvider>
      );
    }
    render(<Harness />);
    const antes = rendersGrafico;
    act(() => screen.getByText("b").click());
    // só o gráfico B novo renderizou (1 vez, +1 do StrictMode não se aplica aqui); A não re-renderizou por causa da lista
    expect(rendersGrafico - antes).toBeLessThanOrEqual(2);
    expect(screen.getByTestId("lista").textContent).toBe("A:1:ok|B:1:ok");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/components/nid/ExportContext.test.jsx`
Expected: FAIL com `Failed to resolve import "./ExportContext"`.

- [ ] **Step 3: Implementar**

Criar `frontend-observatorio/src/components/nid/ExportContext.jsx`:

```jsx
// Registro de exportação dos gráficos para o menu "Exportar" do NidPanel.
// Dois contextos: as funções (estáveis) para os gráficos registrarem sem
// re-renderizar quando a lista muda, e a lista para o menu ler.
// Spec: docs/superpowers/specs/2026-10-06-exportacao-graficos-design.md
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const FuncoesCtx = createContext(null);
const ListaCtx = createContext(null);

export function ExportProvider({ children }) {
  const [registros, setRegistros] = useState([]);

  const registrar = useCallback((reg) => {
    setRegistros((atual) => {
      const i = atual.findIndex((r) => r.id === reg.id);
      if (i === -1) return [...atual, reg];
      const copia = atual.slice();
      copia[i] = reg;
      return copia;
    });
  }, []);

  const remover = useCallback((id) => {
    setRegistros((atual) => (atual.some((r) => r.id === id) ? atual.filter((r) => r.id !== id) : atual));
  }, []);

  const funcoes = useMemo(() => ({ registrar, remover }), [registrar, remover]);

  return (
    <FuncoesCtx.Provider value={funcoes}>
      <ListaCtx.Provider value={registros}>{children}</ListaCtx.Provider>
    </FuncoesCtx.Provider>
  );
}

// Fora de um ExportProvider é no-op: gráficos usados sem NidPanel seguem iguais.
// `colunas`/`linhas` devem vir memoizados pelo chamador (useMemo), senão o
// efeito re-registra a cada render.
export function useRegistrarExportacao({ id, rotulo, colunas, linhas, svgRef, carregando }) {
  const funcoes = useContext(FuncoesCtx);
  const registrar = funcoes ? funcoes.registrar : null;
  const remover = funcoes ? funcoes.remover : null;
  const carregandoBool = Boolean(carregando);

  useEffect(() => {
    if (!registrar) return undefined;
    registrar({ id, rotulo, colunas, linhas, svgRef, carregando: carregandoBool });
    return undefined;
  }, [registrar, id, rotulo, colunas, linhas, svgRef, carregandoBool]);

  useEffect(() => {
    if (!remover) return undefined;
    return () => remover(id);
  }, [remover, id]);
}

export function useExportacoes() {
  const lista = useContext(ListaCtx);
  return lista || [];
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/components/nid/ExportContext.test.jsx`
Expected: PASS, 4 testes.

- [ ] **Step 5: Lint + commit**

Run: `npx eslint src/components/nid/ExportContext.jsx src/components/nid/ExportContext.test.jsx` → sem erro (a regra `react-refresh/only-export-components` pode avisar que o arquivo exporta componente + hooks; é o mesmo padrão de `AuthContext.jsx` e não é gate).

```bash
git add src/components/nid/ExportContext.jsx src/components/nid/ExportContext.test.jsx
git commit -m "feat(export): ExportContext - registro dos graficos para o menu do painel

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: `ExportMenu` + integração no `NidPanel`

**Files:**
- Create: `frontend-observatorio/src/components/nid/ExportMenu.jsx`
- Modify: `frontend-observatorio/src/components/nid/Panel.jsx` (função `NidPanel`, linhas 52-83)
- Test: `frontend-observatorio/src/components/nid/ExportMenu.test.jsx`

**Interfaces:**
- Consumes: Task 3/4 (`gerarCsv`, `baixarBlob`, `nomeArquivo`, `datasetDe`, `rodapePng`, `svgParaPng`, `FONTES_DATASET`), Task 6 (`ExportProvider`, `useExportacoes`), existentes `useAuth` (`../../context/AuthContext`), `useViewAs` (`../../context/ViewAsContext`, devolve `{ viewAsId, viewAsNome, … }`), `useToast` (`../../context/ToastContext`, devolve `{ addToast(message, type) }`), `api` (`../../services/api`), `ArrowDownTrayIcon` (`@heroicons/react/24/outline`).
- Produces: `ExportMenu({ titulo, sub, dataset })` (default export); `NidPanel` passa a envolver tudo em `ExportProvider` e renderizar o menu no cabeçalho.

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `frontend-observatorio/src/components/nid/ExportMenu.test.jsx`:

```jsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useMemo, useRef } from "react";
import ExportMenu from "./ExportMenu";
import { ExportProvider, useRegistrarExportacao } from "./ExportContext";
import api from "../../services/api";
import * as exportar from "../../utils/exportar";

const auth = { user: { id: 1, role: "ADMIN_GLOBAL" } };
vi.mock("../../context/AuthContext", () => ({ useAuth: () => auth }));
const viewAs = { viewAsId: null, viewAsNome: null };
vi.mock("../../context/ViewAsContext", () => ({ useViewAs: () => viewAs }));
const addToast = vi.fn();
vi.mock("../../context/ToastContext", () => ({ useToast: () => ({ addToast }) }));
vi.mock("../../services/api", () => ({ default: { post: vi.fn() } }));
vi.mock("../../utils/exportar", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, baixarBlob: vi.fn(), svgParaPng: vi.fn(() => Promise.resolve(new Blob(["png"], { type: "image/png" }))) };
});

function Grafico({ id = "g1", rotulo = "Área", linhas = [{ periodo: "2021", valor: 1 }], carregando = false, comSvg = true }) {
  const svgRef = useRef(null);
  const exp = useMemo(() => ({ colunas: [{ chave: "periodo", rotulo: "Período", tipo: "texto" }, { chave: "valor", rotulo: "Valor", tipo: "numero" }], linhas }), [linhas]);
  useRegistrarExportacao({ id, rotulo, colunas: exp.colunas, linhas: exp.linhas, svgRef: comSvg ? svgRef : null, carregando });
  return comSvg ? <svg ref={svgRef} viewBox="0 0 10 10" /> : <div />;
}

function montar(props = {}, graficos = <Grafico />) {
  return render(
    <ExportProvider>
      {graficos}
      <ExportMenu titulo="Evolução Anual do PIB" sub="PIB total por ano" dataset="pib" {...props} />
    </ExportProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = { id: 1, role: "ADMIN_GLOBAL" };
  viewAs.viewAsNome = null;
  window.history.replaceState({}, "", "/app/pib");
});

describe("ExportMenu — gating", () => {
  it("ADMIN_GLOBAL com gráfico registrado vê o botão", () => {
    montar();
    expect(screen.getByRole("button", { name: /exportar/i })).toBeInTheDocument();
  });
  it("VISUALIZADOR e ADMIN_MUNICIPIO não veem nada", () => {
    for (const papel of ["VISUALIZADOR", "ADMIN_MUNICIPIO"]) {
      auth.user = { id: 2, role: papel };
      const { unmount } = montar();
      expect(screen.queryByRole("button", { name: /exportar/i })).toBeNull();
      unmount();
    }
  });
  it("sem gráfico registrado não renderiza", () => {
    montar({}, null);
    expect(screen.queryByRole("button", { name: /exportar/i })).toBeNull();
  });
  it("gráfico carregando → botão desabilitado com tooltip", () => {
    montar({}, <Grafico carregando />);
    const b = screen.getByRole("button", { name: /exportar/i });
    expect(b).toHaveAttribute("aria-disabled", "true");
    expect(b).toHaveAttribute("title", "Sem dados para exportar");
    fireEvent.click(b);
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("gráfico sem linhas → desabilitado", () => {
    montar({}, <Grafico linhas={[]} />);
    expect(screen.getByRole("button", { name: /exportar/i })).toHaveAttribute("aria-disabled", "true");
  });
});

describe("ExportMenu — itens e ações", () => {
  it("abre com CSV, XLSX e PNG; gráfico sem svg não tem PNG", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: /exportar/i }));
    const itens = screen.getAllByRole("menuitem").map((e) => e.textContent);
    expect(itens).toEqual(["CSV", "XLSX", "PNG"]);
  });
  it("sem svg (gráfico HTML) → sem item PNG", () => {
    montar({}, <Grafico comSvg={false} />);
    fireEvent.click(screen.getByRole("button", { name: /exportar/i }));
    expect(screen.getAllByRole("menuitem").map((e) => e.textContent)).toEqual(["CSV", "XLSX"]);
  });
  it("dois gráficos → itens prefixados pelo rótulo", () => {
    montar({}, <><Grafico id="a" rotulo="Saldo" /><Grafico id="b" rotulo="Ranking" comSvg={false} /></>);
    fireEvent.click(screen.getByRole("button", { name: /exportar/i }));
    expect(screen.getAllByRole("menuitem").map((e) => e.textContent)).toEqual([
      "CSV · Saldo", "XLSX · Saldo", "PNG · Saldo", "CSV · Ranking", "XLSX · Ranking",
    ]);
  });
  it("CSV baixa blob text/csv com nome em slug e município do view-as", () => {
    viewAs.viewAsNome = "Divinópolis";
    montar();
    fireEvent.click(screen.getByRole("button", { name: /exportar/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "CSV" }));
    expect(exportar.baixarBlob).toHaveBeenCalledTimes(1);
    const [blob, nome] = exportar.baixarBlob.mock.calls[0];
    expect(blob.type).toBe("text/csv;charset=utf-8");
    expect(nome).toMatch(/^nid_pib_evolucao-anual-do-pib_divinopolis_\d{4}-\d{2}-\d{2}\.csv$/);
    expect(screen.queryByRole("menu")).toBeNull(); // fecha após agir
  });
  it("XLSX chama POST /export/xlsx com colunas, linhas, fonte e dataset, e baixa o blob", async () => {
    api.post.mockResolvedValueOnce({ data: new Blob(["x"], { type: "application/octet-stream" }) });
    montar();
    fireEvent.click(screen.getByRole("button", { name: /exportar/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "XLSX" }));
    await waitFor(() => expect(exportar.baixarBlob).toHaveBeenCalledTimes(1));
    const [url, payload, cfg] = api.post.mock.calls[0];
    expect(url).toBe("/export/xlsx");
    expect(cfg).toEqual({ responseType: "blob" });
    expect(payload).toMatchObject({
      titulo: "Evolução Anual do PIB",
      subtitulo: "PIB total por ano",
      fonte: "IBGE",
      dataset: "pib",
      municipio: null,
      colunas: [{ chave: "periodo", rotulo: "Período", tipo: "texto" }, { chave: "valor", rotulo: "Valor", tipo: "numero" }],
      linhas: [{ periodo: "2021", valor: 1 }],
    });
    expect(exportar.baixarBlob.mock.calls[0][1]).toMatch(/\.xlsx$/);
  });
  it("XLSX 422 → toast de limite; outro erro → toast genérico", async () => {
    api.post.mockRejectedValueOnce({ response: { status: 422 } });
    montar();
    fireEvent.click(screen.getByRole("button", { name: /exportar/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "XLSX" }));
    await waitFor(() => expect(addToast).toHaveBeenCalledWith("Tabela grande demais para exportar (limite de 50 mil células)", "error"));
    api.post.mockRejectedValueOnce(new Error("Network Error"));
    fireEvent.click(screen.getByRole("button", { name: /exportar/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "XLSX" }));
    await waitFor(() => expect(addToast).toHaveBeenCalledWith("Falha ao gerar a planilha. Tente novamente.", "error"));
    expect(exportar.baixarBlob).not.toHaveBeenCalled();
  });
  it("PNG chama svgParaPng com título, sub string e rodapé com fonte, e baixa", async () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: /exportar/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "PNG" }));
    await waitFor(() => expect(exportar.baixarBlob).toHaveBeenCalledTimes(1));
    const [svgEl, opts] = exportar.svgParaPng.mock.calls[0];
    expect(svgEl.tagName.toLowerCase()).toBe("svg");
    expect(opts.titulo).toBe("Evolução Anual do PIB");
    expect(opts.sub).toBe("PIB total por ano");
    expect(opts.rodape).toMatch(/^Fonte: IBGE · UAIZI NID · \d{2}\/\d{2}\/\d{4}$/);
    expect(exportar.baixarBlob.mock.calls[0][1]).toMatch(/\.png$/);
  });
  it("sub que não é string vira vazio", async () => {
    montar({ sub: <em>nó</em> });
    fireEvent.click(screen.getByRole("button", { name: /exportar/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "PNG" }));
    await waitFor(() => expect(exportar.svgParaPng).toHaveBeenCalled());
    expect(exportar.svgParaPng.mock.calls[0][1].sub).toBe("");
  });
  it("PNG que falha → toast com a mensagem do erro", async () => {
    exportar.svgParaPng.mockRejectedValueOnce(new Error("Não foi possível gerar a imagem neste navegador"));
    montar();
    fireEvent.click(screen.getByRole("button", { name: /exportar/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "PNG" }));
    await waitFor(() => expect(addToast).toHaveBeenCalledWith("Não foi possível gerar a imagem neste navegador", "error"));
  });
  it("sem prop dataset usa o pathname para fonte e nome", () => {
    window.history.replaceState({}, "", "/app/caged");
    montar({ dataset: undefined });
    fireEvent.click(screen.getByRole("button", { name: /exportar/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "CSV" }));
    expect(exportar.baixarBlob.mock.calls[0][1]).toMatch(/^nid_caged_/);
  });
});

describe("ExportMenu — teclado e foco", () => {
  it("Esc fecha e devolve o foco ao botão; clique fora fecha", () => {
    montar();
    const botao = screen.getByRole("button", { name: /exportar/i });
    fireEvent.click(botao);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(botao);
    fireEvent.click(botao);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("botão tem aria-haspopup e aria-expanded", () => {
    montar();
    const botao = screen.getByRole("button", { name: /exportar/i });
    expect(botao).toHaveAttribute("aria-haspopup", "menu");
    expect(botao).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(botao);
    expect(botao).toHaveAttribute("aria-expanded", "true");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/components/nid/ExportMenu.test.jsx`
Expected: FAIL com `Failed to resolve import "./ExportMenu"`.

- [ ] **Step 3: Implementar `ExportMenu.jsx`**

Criar `frontend-observatorio/src/components/nid/ExportMenu.jsx`:

```jsx
// Menu "Exportar" do cabeçalho do NidPanel. Só ADMIN_GLOBAL, só com gráfico
// registrado no ExportContext. CSV e PNG no navegador; XLSX via backend.
// Best-effort: erro vira toast, nunca quebra o painel.
// Spec: docs/superpowers/specs/2026-10-06-exportacao-graficos-design.md
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useViewAs } from "../../context/ViewAsContext";
import { useToast } from "../../context/ToastContext";
import { useExportacoes } from "./ExportContext";
import { FONTES_DATASET, baixarBlob, datasetDe, gerarCsv, nomeArquivo, rodapePng, svgParaPng } from "../../utils/exportar";

const MSG_LIMITE = "Tabela grande demais para exportar (limite de 50 mil células)";
const MSG_XLSX = "Falha ao gerar a planilha. Tente novamente.";

export default function ExportMenu({ titulo, sub, dataset }) {
  const { user } = useAuth() || {};
  const viewAs = useViewAs() || {};
  const { addToast } = useToast();
  const registros = useExportacoes();
  const [aberto, setAberto] = useState(false);
  const botaoRef = useRef(null);
  const raizRef = useRef(null);

  const fechar = useCallback((devolverFoco) => {
    setAberto(false);
    if (devolverFoco && botaoRef.current) botaoRef.current.focus();
  }, []);

  useEffect(() => {
    if (!aberto) return undefined;
    const onKey = (e) => { if (e.key === "Escape") fechar(true); };
    const onDown = (e) => { if (raizRef.current && !raizRef.current.contains(e.target)) fechar(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [aberto, fechar]);

  if (!user || user.role !== "ADMIN_GLOBAL" || registros.length === 0) return null;

  const prontos = registros.filter((r) => !r.carregando && Array.isArray(r.linhas) && r.linhas.length > 0);
  const desabilitado = prontos.length === 0;
  const ds = datasetDe(dataset, window.location.pathname);
  const municipio = viewAs.viewAsNome || "";
  const subTexto = typeof sub === "string" ? sub : "";
  const varios = prontos.length > 1;

  const nome = (ext) => nomeArquivo({ dataset: ds, painel: titulo, municipio, ext });

  const exportarCsv = (reg) => {
    const csv = gerarCsv(reg.colunas, reg.linhas);
    baixarBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), nome("csv"));
  };

  const exportarXlsx = async (reg) => {
    try {
      const res = await api.post(
        "/export/xlsx",
        {
          titulo,
          subtitulo: subTexto || null,
          fonte: FONTES_DATASET[ds] || null,
          municipio: municipio || null,
          dataset: ds || null,
          colunas: reg.colunas,
          linhas: reg.linhas,
        },
        { responseType: "blob" }
      );
      baixarBlob(res.data, nome("xlsx"));
    } catch (err) {
      addToast(err?.response?.status === 422 ? MSG_LIMITE : MSG_XLSX, "error");
    }
  };

  const exportarPng = async (reg) => {
    try {
      const blob = await svgParaPng(reg.svgRef ? reg.svgRef.current : null, {
        titulo,
        sub: subTexto,
        rodape: rodapePng(ds),
      });
      baixarBlob(blob, nome("png"));
    } catch (err) {
      addToast(err?.message || "Não foi possível gerar a imagem", "error");
    }
  };

  const agir = (fn, reg) => {
    fechar(false);
    fn(reg);
  };

  const itens = [];
  prontos.forEach((reg) => {
    const sufixo = varios ? ` · ${reg.rotulo}` : "";
    itens.push({ chave: `csv-${reg.id}`, texto: `CSV${sufixo}`, onClick: () => agir(exportarCsv, reg) });
    itens.push({ chave: `xlsx-${reg.id}`, texto: `XLSX${sufixo}`, onClick: () => agir(exportarXlsx, reg) });
    if (reg.svgRef) itens.push({ chave: `png-${reg.id}`, texto: `PNG${sufixo}`, onClick: () => agir(exportarPng, reg) });
  });

  return (
    <div ref={raizRef} style={{ position: "relative", display: "inline-flex" }}>
      <button
        ref={botaoRef}
        type="button"
        className="nid-tab"
        aria-label="Exportar"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-disabled={desabilitado}
        title={desabilitado ? "Sem dados para exportar" : "Exportar dados do gráfico"}
        onClick={() => { if (!desabilitado) setAberto((v) => !v); }}
        style={{ display: "inline-flex", alignItems: "center", gap: 5, opacity: desabilitado ? 0.5 : 1, cursor: desabilitado ? "not-allowed" : "pointer" }}
      >
        <ArrowDownTrayIcon style={{ width: 13, height: 13 }} aria-hidden="true" />
        Exportar
      </button>
      {aberto && (
        <div
          role="menu"
          aria-label="Formatos de exportação"
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 40, minWidth: 160,
            background: "var(--panel)", border: "1px solid var(--border-strong)", borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)", padding: 4,
          }}
        >
          {itens.map((it) => (
            <button
              key={it.chave}
              type="button"
              role="menuitem"
              onClick={it.onClick}
              className="nid-tab"
              style={{ display: "block", width: "100%", textAlign: "left", textTransform: "none", letterSpacing: 0, fontFamily: "inherit", fontSize: 12 }}
            >
              {it.texto}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Integrar no `NidPanel`**

Em `frontend-observatorio/src/components/nid/Panel.jsx`:

Imports (linhas 1-3) hoje:

```jsx
import { useState } from "react";
import ChartInfoIcon from "../ChartInfoIcon";
import { Sparkline } from "./charts";
```

Passam a:

```jsx
import { useState } from "react";
import ChartInfoIcon from "../ChartInfoIcon";
import { Sparkline } from "./charts";
import { ExportProvider } from "./ExportContext";
import ExportMenu from "./ExportMenu";
```

A função `NidPanel` inteira passa a:

```jsx
export function NidPanel({ title, sub, tabs, onTabChange, children, right, dataset, indicadorKey }) {
  const [active, setActive] = useState(0);
  const comInfo = Boolean(dataset && indicadorKey);
  return (
    <ExportProvider>
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
          <div className="nid-panel-actions">
            {tabs
              ? tabs.map((t, i) => (
                  <button
                    key={i}
                    className={`nid-tab ${i === active ? "active" : ""}`}
                    onClick={() => { setActive(i); onTabChange?.(i); }}
                  >
                    {t}
                  </button>
                ))
              : right}
            {/* Exportar (só ADMIN_GLOBAL e só com gráfico registrado; senão renderiza null) */}
            <ExportMenu titulo={title} sub={typeof sub === "string" ? sub : ""} dataset={dataset} />
          </div>
        </div>
        <div>{children}</div>
      </div>
    </ExportProvider>
  );
}
```

Observação: `right` antes era renderizado solto; agora fica dentro de `.nid-panel-actions` (flex com gap). Conferir visualmente na Task 9 que os painéis com `right` (ex.: `ComparadorMunicipios`, `CompareToggle`) não mudaram de alinhamento; se mudarem, o ajuste é CSS em `.nid-panel-actions`, não no JSX.

- [ ] **Step 5: Rodar os testes do menu e da suite**

Run: `npx vitest run src/components/nid/ExportMenu.test.jsx`
Expected: PASS, 17 testes.

Run: `npx vitest run`
Expected: tudo verde (o `Panel.jsx` agora importa `ExportMenu`, que usa `useAuth`/`useViewAs`/`useToast`; esses hooks têm fallback `|| {}` e `useToast` devolve o default do contexto, então testes existentes que renderizam `NidPanel` sem providers continuam passando. Se algum teste existente falhar com "useAuth is not a function" ou similar, o problema é o mock do módulo nesse teste; mocke `../../components/nid/ExportMenu` para `() => null` nesse teste e anote no relatório).

- [ ] **Step 6: Lint + commit**

Run: `npx eslint src/components/nid/ExportMenu.jsx src/components/nid/ExportMenu.test.jsx src/components/nid/Panel.jsx` → sem erro novo.

```bash
git add src/components/nid/ExportMenu.jsx src/components/nid/ExportMenu.test.jsx src/components/nid/Panel.jsx
git commit -m "feat(export): menu Exportar (CSV/XLSX/PNG) no NidPanel, so ADMIN_GLOBAL

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Registro nos seis gráficos de `charts.jsx`

**Files:**
- Modify: `frontend-observatorio/src/components/nid/charts.jsx` (imports; `AreaLineChart` ~187; `StackedBarChart` ~527; `MultiLineChart` ~690; `TwinBarBrutoChart` ~1288; `TwinBarSaldoChart` ~1411; `TwinBarChart` ~1599; `DonutChartCore` ~1629; `DonutChart` ~1830; `HBarChart` ~1883 — números de linha antes desta task, podem deslocar)
- Modify: `frontend-observatorio/src/components/nid/charts.test.jsx` (acrescentar `describe`)

**Interfaces:**
- Consumes: Task 5 (`exportacao*`), Task 6 (`useRegistrarExportacao`, `ExportProvider`, `useExportacoes`).
- Produces: cada gráfico, quando dentro de um `ExportProvider`, registra `{ id, rotulo, colunas, linhas, svgRef, carregando }` conforme a tabela da spec. `Sparkline` não registra.

Regras para todas as edições: (1) o hook e os `useMemo`/`useRef` novos entram **antes** do primeiro `if (loading) return` / `if (!data …) return` do componente; (2) `linhas`/`colunas` vêm de um `useMemo` com deps nos props que os determinam; (3) o `<svg viewBox=…>` principal recebe `ref={svgRef}`.

- [ ] **Step 1: Escrever os testes (falhando)**

Acrescentar ao final de `src/components/nid/charts.test.jsx` (e ampliar o import do topo para incluir `AreaLineChart, StackedBarChart, TwinBarChart, DonutChart, HBarChart` além de `trechos, MultiLineChart`; acrescentar `import { ExportProvider, useExportacoes } from "./ExportContext.jsx";`):

```jsx
function Registros() {
  const regs = useExportacoes();
  return <pre data-testid="regs">{JSON.stringify(regs.map((r) => ({ rotulo: r.rotulo, chaves: r.colunas.map((c) => c.chave), linhas: r.linhas, temSvg: Boolean(r.svgRef && r.svgRef.current), carregando: r.carregando })))}</pre>;
}
const lerRegs = () => JSON.parse(document.querySelector("[data-testid=regs]").textContent);

describe("registro de exportação pelos gráficos", () => {
  it("AreaLineChart registra período + valor com o label e a ref do svg", () => {
    render(<ExportProvider><AreaLineChart data={[{ label: "2021", value: 10 }, { label: "2022", value: 12 }]} label="PIB Total" /><Registros /></ExportProvider>);
    expect(lerRegs()).toEqual([{ rotulo: "PIB Total", chaves: ["periodo", "valor"], linhas: [{ periodo: "2021", valor: 10 }, { periodo: "2022", valor: 12 }], temSvg: true, carregando: false }]);
  });
  it("AreaLineChart em loading registra carregando=true sem linhas", () => {
    render(<ExportProvider><AreaLineChart data={[]} label="x" loading /><Registros /></ExportProvider>);
    expect(lerRegs()[0]).toMatchObject({ carregando: true, linhas: [] });
  });
  it("StackedBarChart registra uma coluna por key (+ total quando showTotalLabel)", () => {
    render(<ExportProvider><StackedBarChart data={[{ label: "2021", agro: 1, ind: 2 }]} keys={["agro", "ind"]} showTotalLabel /><Registros /></ExportProvider>);
    expect(lerRegs()[0]).toMatchObject({ rotulo: "Composição", chaves: ["periodo", "agro", "ind", "total"], linhas: [{ periodo: "2021", agro: 1, ind: 2, total: 3 }], temSvg: true });
  });
  it("MultiLineChart registra uma coluna por série preservando null", () => {
    render(<ExportProvider><MultiLineChart data={[{ label: "2021", A: 1, B: null }]} series={["A", "B"]} /><Registros /></ExportProvider>);
    expect(lerRegs()[0]).toMatchObject({ rotulo: "Séries", chaves: ["periodo", "A", "B"], linhas: [{ periodo: "2021", A: 1, B: null }], temSvg: true });
  });
  it("TwinBarChart saldo registra acumulado; bruto não", () => {
    const data = [{ label: "jan", admissoes: 10, desligamentos: 4 }, { label: "fev", admissoes: 2, desligamentos: 5 }];
    const { unmount } = render(<ExportProvider><TwinBarChart data={data} mode="saldo" /><Registros /></ExportProvider>);
    expect(lerRegs()[0]).toMatchObject({ rotulo: "Saldo", chaves: ["periodo", "admissoes", "desligamentos", "saldo", "acumulado"], temSvg: true });
    expect(lerRegs()[0].linhas.map((l) => l.acumulado)).toEqual([6, 3]);
    unmount();
    render(<ExportProvider><TwinBarChart data={data} mode="bruto" /><Registros /></ExportProvider>);
    expect(lerRegs()[0]).toMatchObject({ rotulo: "Admissões e desligamentos", chaves: ["periodo", "admissoes", "desligamentos", "saldo"], temSvg: true });
  });
  it("DonutChart registra categoria/valor/participação; variante donut tem svg, variante barras não", () => {
    const data = [{ label: "Serviços", value: 60 }, { label: "Indústria", value: 40 }];
    const { unmount } = render(<ExportProvider><DonutChart data={data} /><Registros /></ExportProvider>);
    expect(lerRegs()[0]).toMatchObject({ rotulo: "Distribuição", chaves: ["categoria", "valor", "participacao"], linhas: [{ categoria: "Serviços", valor: 60, participacao: 60 }, { categoria: "Indústria", valor: 40, participacao: 40 }], temSvg: true });
    unmount();
    render(<ExportProvider><DonutChart data={data} prefer="bar" /><Registros /></ExportProvider>);
    expect(lerRegs()[0]).toMatchObject({ rotulo: "Distribuição", temSvg: false });
  });
  it("HBarChart registra nome/valor (+ posição) sem svg", () => {
    render(<ExportProvider><HBarChart data={[{ label: "Divinópolis", value: 300 }]} showPosition positionOffset={10} /><Registros /></ExportProvider>);
    expect(lerRegs()[0]).toMatchObject({ rotulo: "Ranking", chaves: ["posicao", "nome", "valor"], linhas: [{ posicao: 11, nome: "Divinópolis", valor: 300 }], temSvg: false });
  });
  it("fora do ExportProvider os gráficos renderizam normalmente", () => {
    const { container } = render(<AreaLineChart data={[{ label: "2021", value: 1 }]} label="x" />);
    expect(container.querySelector("svg")).not.toBeNull();
  });
  it("Sparkline não registra", () => {
    render(<ExportProvider><Sparkline data={[1, 2, 3]} /><Registros /></ExportProvider>);
    expect(lerRegs()).toEqual([]);
  });
});
```

(Incluir `Sparkline` no import também.)

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/components/nid/charts.test.jsx`
Expected: os testes antigos passam; os novos falham com `lerRegs()` devolvendo `[]`.

- [ ] **Step 3: Imports em `charts.jsx`**

Linha 1 hoje: `import { useEffect, useId, useRef, useState } from "react";` → passa a `import { useEffect, useId, useMemo, useRef, useState } from "react";`

Após a linha 6 (`import { niceTicks, yBounds } from "../../utils/chartScale.js";`) acrescentar:

```js
import { useRegistrarExportacao } from "./ExportContext.jsx";
import {
  exportacaoArea,
  exportacaoDonut,
  exportacaoEmpilhado,
  exportacaoMultiLinha,
  exportacaoRanking,
  exportacaoTwin,
} from "../../utils/exportarColunas.js";
```

- [ ] **Step 4: `AreaLineChart`**

Dentro de `AreaLineChart`, logo após a linha `const [wrapRef, w] = useContainerWidth(800);` (antes de `if (loading) return …`), inserir:

```jsx
  // Exportação (menu do NidPanel): registra a tabela desenhada e a ref do svg.
  const exportId = useId();
  const svgRef = useRef(null);
  const exportacao = useMemo(() => exportacaoArea(data, label), [data, label]);
  useRegistrarExportacao({ id: exportId, rotulo: label, colunas: exportacao.colunas, linhas: exportacao.linhas, svgRef, carregando: Boolean(loading) });
```

E no `<svg viewBox={`0 0 ${w} ${height}`}>` principal do componente, acrescentar `ref={svgRef}`: `<svg ref={svgRef} viewBox={`0 0 ${w} ${height}`}>`.

- [ ] **Step 5: `StackedBarChart`**

Após o `useContainerWidth`/primeiros hooks do componente e antes do primeiro `return` antecipado, inserir:

```jsx
  const exportId = useId();
  const svgRef = useRef(null);
  const exportacao = useMemo(() => exportacaoEmpilhado(data, keys, Boolean(showTotalLabel)), [data, keys, showTotalLabel]);
  useRegistrarExportacao({ id: exportId, rotulo: "Composição", colunas: exportacao.colunas, linhas: exportacao.linhas, svgRef, carregando: Boolean(loading) });
```

`<svg viewBox={`0 0 ${w} ${height}`}>` → `<svg ref={svgRef} viewBox={`0 0 ${w} ${height}`}>`.

- [ ] **Step 6: `MultiLineChart`**

Idem, antes do primeiro `return` antecipado:

```jsx
  const exportId = useId();
  const svgRef = useRef(null);
  const exportacao = useMemo(() => exportacaoMultiLinha(data, series), [data, series]);
  useRegistrarExportacao({ id: exportId, rotulo: "Séries", colunas: exportacao.colunas, linhas: exportacao.linhas, svgRef, carregando: Boolean(loading) });
```

`<svg viewBox=…>` principal → `ref={svgRef}`.

- [ ] **Step 7: `TwinBarChart` e sub-gráficos**

Em `TwinBarChart` (wrapper), antes de `if (!data || data.length === 0) return …`, inserir:

```jsx
  const exportId = useId();
  const svgRef = useRef(null);
  const cumulativoExport = showCumulative != null ? showCumulative : mode === "saldo";
  const exportacao = useMemo(() => exportacaoTwin(data, { acumulado: Boolean(cumulativoExport) }), [data, cumulativoExport]);
  useRegistrarExportacao({
    id: exportId,
    rotulo: mode === "bruto" ? "Admissões e desligamentos" : "Saldo",
    colunas: exportacao.colunas,
    linhas: exportacao.linhas,
    svgRef,
    carregando: Boolean(loading),
  });
```

E incluir `svgRef` no objeto `shared` que o wrapper repassa aos sub-componentes (ex.: `const shared = { data, height, …, svgRef };`). Em `TwinBarBrutoChart` e `TwinBarSaldoChart`, acrescentar `svgRef` à lista de props desestruturadas e `ref={svgRef}` no `<svg viewBox={`0 0 ${w} ${height}`}>` de cada um.

- [ ] **Step 8: `DonutChart` e `DonutChartCore`**

Em `DonutChart` (wrapper), antes de `if (loading) return …`, inserir:

```jsx
  const exportId = useId();
  const svgRef = useRef(null);
  const usaBarras = prefer === "bar" || (prefer === "auto" && Array.isArray(data) && data.length > threshold);
  const exportacao = useMemo(() => exportacaoDonut(data), [data]);
  useRegistrarExportacao({
    id: exportId,
    rotulo: "Distribuição",
    colunas: exportacao.colunas,
    linhas: exportacao.linhas,
    svgRef: usaBarras ? null : svgRef,
    carregando: Boolean(loading),
  });
```

(O `useBar` já calculado mais abaixo pode ser substituído por `usaBarras` para não duplicar.) Passar `svgRef={svgRef}` para `<DonutChartCore …/>`; em `DonutChartCore`, acrescentar `svgRef` às props e `ref={svgRef}` no `<svg viewBox={`0 0 ${size} ${size}`} …>`. `PercentBarChart` não muda.

- [ ] **Step 9: `HBarChart`**

Antes de `if (loading) …`/`if (!data …) return …`, inserir:

```jsx
  const exportId = useId();
  const exportacao = useMemo(() => exportacaoRanking(data, { comPosicao: Boolean(showPosition), offset: positionOffset || 0 }), [data, showPosition, positionOffset]);
  useRegistrarExportacao({ id: exportId, rotulo: "Ranking", colunas: exportacao.colunas, linhas: exportacao.linhas, svgRef: null, carregando: Boolean(loading) });
```

(HBar é HTML: sem svg, sem PNG.)

- [ ] **Step 10: Rodar e confirmar que passa**

Run: `npx vitest run src/components/nid/charts.test.jsx`
Expected: PASS (antigos + 9 novos).

Run: `npx vitest run`
Expected: tudo verde.

- [ ] **Step 11: Lint + commit**

Run: `npx eslint src/components/nid/charts.jsx src/components/nid/charts.test.jsx` → nenhum erro **novo** (comparar com `git stash`-free: rodar o mesmo comando em `git show HEAD:…` não é prático; basta garantir que as linhas adicionadas não geram erros e que a contagem de erros não subiu em relação ao `main` — anotar as contagens no relatório).

```bash
git add src/components/nid/charts.jsx src/components/nid/charts.test.jsx
git commit -m "feat(export): graficos registram tabela e svg no ExportContext (Area, Stacked, MultiLine, Twin, Donut, HBar)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Verificação manual e checklist de entrega

**Files:** nenhum (sem commit). Esta task é executada pelo controller/usuário com o app rodando; o resultado vai para o ledger.

- [ ] **Step 1: Subir backend e frontend locais**

Run: `cd backend && ../venv/Scripts/python -m uvicorn app.main:app --reload` e, em outro terminal, `cd frontend-observatorio && npm run dev`.

- [ ] **Step 2: Como ADMIN_GLOBAL**

1. `/app/pib`: painel "Evolução Anual do PIB" mostra "Exportar". CSV abre no Excel pt-BR com colunas Período e PIB Total, números com vírgula. XLSX abre com título em A1, filtro na linha 7, números como números. PNG tem título, sub e rodapé "Fonte: IBGE · UAIZI NID · dd/mm/aaaa", legível em tema claro e escuro.
2. `/app/caged`: painel com abas Saldo/Bruto exporta "Saldo" com coluna "Saldo acumulado" e "Admissões e desligamentos" sem ela. Menu convive com as abas.
3. `/app/empresas` (ou outro com Donut/HBar): Donut exporta PNG; ranking HBar não oferece PNG.
4. Painel com `right` (ex.: `ComparadorMunicipios` no PIB Comparativo): o seletor continua alinhado à direita, com o botão Exportar ao lado.
5. Em view-as de um município, o nome do arquivo inclui o município em slug.
6. Durante o carregamento (throttle de rede), o botão fica desabilitado com tooltip e volta ao normal.

- [ ] **Step 3: Como ADMIN_MUNICIPIO ou VISUALIZADOR**

Nenhum painel mostra "Exportar". `POST /api/v1/export/xlsx` com o token desse usuário devolve 403.

- [ ] **Step 4: Registrar no ledger** o resultado de cada item e qualquer ajuste de CSS necessário em `.nid-panel-actions`.

---

## Depois do plano

- Deploy: só backend + frontend do NID (sem migração). Nenhuma env nova.
- Espelho no LEGIS: frente própria (os gráficos de lá são outros componentes).
