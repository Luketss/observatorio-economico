# Fonte IPS com Upload pela Tela de Coletas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levar a carga do IPS para a tela de coletas (`/admin/fontes`) via upload do arquivo anual (XLSX do site ou CSV convertido), executada como job em background pelo worker.

**Architecture:** O arquivo trafega pelo banco (tabela nova `ingestao_arquivo`) porque API e worker não compartilham filesystem. `FonteAutomatica` ganha flag `requer_arquivo`; o runner passa `arquivo_id` só para fontes com a flag. Fonte nova `ips_arquivo.py` reusa o `COLUMN_MAP` do CLI (`ingestao/carregar_ips.py`) e grava com **upsert** por `(municipio_id, ano)`. Spec: `docs/superpowers/specs/2026-08-10-fonte-ips-upload-design.md`.

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy 2.0, Alembic, openpyxl (já é dependência), React 18, vitest.

## Global Constraints

- Testes backend: lógica pura, **sem DB/rede/TestClient** (convenção do repo — contrato de rota via OpenAPI; ver `backend/tests/test_comparativo_pib_endpoint.py`).
- Testes backend rodam de `backend/`: `../venv/Scripts/python.exe -m pytest tests -q`.
- Testes frontend: `cd frontend-observatorio && npm test` (vitest). **`npm run lint` está quebrado no repo — não usar como gate.**
- Key da fonte: `"ips"` (já existe em `DATASET_REGISTRY`/`DATASET_LABELS` de `municipio_management.py` — não mexer lá).
- `"ips"` entra em `FONTES_FORA_DO_TODAS`, **nunca** em `ORDEM_EXECUCAO_TODAS` (sem arquivo não roda).
- Limite de upload: 20 MB. Sweep de blobs órfãos: >24h, no endpoint de upload.
- Mensagens de erro legíveis em pt-BR (padrão das outras fontes).
- CLI `ingestao/carregar_ips.py` permanece intocado (continua insert-only).
- Trabalhar em branch `feat/fonte-ips-upload` (criar a partir de `main`; merge local no fim, push é do usuário).

---

### Task 1: Modelo `IngestaoArquivo` + migração `0036_ingestao_arquivo`

**Files:**
- Create: `backend/app/models/ingestao_arquivo.py`
- Modify: `backend/app/models/__init__.py` (imports + `__all__`)
- Create: `backend/alembic/versions/0036_ingestao_arquivo.py`

**Interfaces:**
- Produces: classe `IngestaoArquivo` (tabela `ingestao_arquivo`) com colunas `id: int` (PK), `nome: str` (255), `conteudo: bytes` (LargeBinary), `criado_em: datetime tz` (server_default now) — usada pelas Tasks 4 e 5 via `from app.models.ingestao_arquivo import IngestaoArquivo`.

- [ ] **Step 1: Criar `backend/app/models/ingestao_arquivo.py`**

```python
from app.db.base import Base
from sqlalchemy import DateTime, Integer, LargeBinary, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func


class IngestaoArquivo(Base):
    """Arquivo enviado pela tela de coletas para fontes com requer_arquivo
    (hoje só o IPS). API e worker não compartilham filesystem — o blob
    trafega pelo banco; a fonte deleta a linha ao concluir com sucesso e o
    endpoint de upload varre órfãs com mais de 24h."""

    __tablename__ = "ingestao_arquivo"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    nome: Mapped[str] = mapped_column(String(255), nullable=False)
    conteudo: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    criado_em: Mapped[object] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
```

- [ ] **Step 2: Registrar no `backend/app/models/__init__.py`**

Adicionar o import junto aos demais (após a linha `from app.models.ingestao_job import IngestaoJob`):

```python
from app.models.ingestao_arquivo import IngestaoArquivo
```

E adicionar `"IngestaoArquivo",` no `__all__` (após `"IngestaoJob",`).

- [ ] **Step 3: Criar `backend/alembic/versions/0036_ingestao_arquivo.py`** (à mão, padrão do `0032_ingestao_job.py`)

```python
"""add ingestao_arquivo table

Blob de upload das fontes com requer_arquivo (IPS): API e worker não
compartilham filesystem, então o arquivo enviado pela tela de coletas
trafega pelo banco até o worker.

Revision ID: 0036_ingestao_arquivo
Revises: 0035_prioridades_permissao
Create Date: 2026-08-10
"""

import sqlalchemy as sa
from alembic import op


revision = "0036_ingestao_arquivo"
down_revision = "0035_prioridades_permissao"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "ingestao_arquivo",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nome", sa.String(length=255), nullable=False),
        sa.Column("conteudo", sa.LargeBinary(), nullable=False),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_ingestao_arquivo_id"), "ingestao_arquivo", ["id"], unique=False)
    op.create_index(op.f("ix_ingestao_arquivo_criado_em"), "ingestao_arquivo", ["criado_em"], unique=False)


def downgrade():
    op.drop_index(op.f("ix_ingestao_arquivo_criado_em"), table_name="ingestao_arquivo")
    op.drop_index(op.f("ix_ingestao_arquivo_id"), table_name="ingestao_arquivo")
    op.drop_table("ingestao_arquivo")
```

- [ ] **Step 4: Aplicar a migração no banco local**

De `backend/` (se o Postgres local não estiver de pé: `docker-compose up -d db` na raiz):

```bash
cd backend
../venv/Scripts/alembic.exe upgrade head
```

Expected: `Running upgrade 0035_prioridades_permissao -> 0036_ingestao_arquivo`.

- [ ] **Step 5: Rodar a suíte backend para checar que nada quebrou**

```bash
cd backend
../venv/Scripts/python.exe -m pytest tests -q
```

Expected: tudo verde (mesmo resultado de antes da task).

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/ingestao_arquivo.py backend/app/models/__init__.py backend/alembic/versions/0036_ingestao_arquivo.py
git commit -m "feat(ingestao): tabela ingestao_arquivo para upload de fontes com arquivo"
```

---

### Task 2: Flag `requer_arquivo` no contrato + guard no `/executar` + `GET /fontes`

**Files:**
- Modify: `backend/app/services/ingestao_automatica/base.py:15-20` (dataclass)
- Modify: `backend/app/services/ingestao_automatica/runner.py:383-388` (kwargs extras)
- Modify: `backend/app/api/v1/routers/ingestao_automatica.py:52-101` (guard + campo novo)
- Test: `backend/tests/test_ingestao_automatica.py` (nova seção no fim)

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `FonteAutomatica.requer_arquivo: bool = False`; runner chama `fonte.executar(..., arquivo_id=filtros.get("arquivo_id"))` **somente** quando `fonte.requer_arquivo` é True; `GET /ingestao-automatica/fontes` devolve `"requer_arquivo": bool` em cada item; `POST /{key}/executar` responde 400 para fontes com a flag.

- [ ] **Step 1: Escrever os testes que falham** (adicionar no fim de `backend/tests/test_ingestao_automatica.py`)

```python
# ── Fontes com arquivo (requer_arquivo) ──────────────────────────────────────
import pytest
from fastapi import HTTPException
from types import SimpleNamespace

from app.services.ingestao_automatica.base import (
    FONTES_AUTOMATICAS,
    FonteAutomatica,
    registrar,
)


def test_requer_arquivo_default_false():
    f = FonteAutomatica(key="x", label="X", fonte="X", executar=lambda **kw: None)
    assert f.requer_arquivo is False


def test_executar_rejeita_fonte_que_requer_arquivo():
    # guard roda antes de tocar db — db=object() prova que não há acesso
    from app.api.v1.routers.ingestao_automatica import ExecutarIn, executar_fonte

    registrar(FonteAutomatica(key="_teste_arq", label="T", fonte="T",
                              executar=lambda **kw: None, requer_arquivo=True))
    try:
        with pytest.raises(HTTPException) as exc:
            executar_fonte("_teste_arq", ExecutarIn(), db=object(),
                           current_user=SimpleNamespace(id=1))
        assert exc.value.status_code == 400
        assert "arquivo" in exc.value.detail
    finally:
        FONTES_AUTOMATICAS.pop("_teste_arq", None)
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd backend
../venv/Scripts/python.exe -m pytest tests/test_ingestao_automatica.py -q
```

Expected: FAIL — `TypeError: __init__() got an unexpected keyword argument 'requer_arquivo'`.

- [ ] **Step 3: Adicionar o campo em `base.py`**

Em `backend/app/services/ingestao_automatica/base.py`, no dataclass `FonteAutomatica`, adicionar como último campo:

```python
@dataclass(frozen=True)
class FonteAutomatica:
    key: str          # dataset key (ex.: "populacao")
    label: str        # nome exibido no admin
    fonte: str        # texto default para DatasetInfo.fonte
    executar: Callable  # (db, municipios, anos=None, usuario_id=None, notificar=True, progresso=None) -> ResumoIngestao
    # fonte que exige arquivo enviado pela tela (upload → ingestao_arquivo);
    # o runner passa arquivo_id= e o /executar normal responde 400
    requer_arquivo: bool = False
```

- [ ] **Step 4: Guard no endpoint `/executar` + campo no `GET /fontes`**

Em `backend/app/api/v1/routers/ingestao_automatica.py`:

(a) Em `executar_fonte` (linha ~87), antes de montar `filtros`:

```python
    fonte = FONTES_AUTOMATICAS.get(dataset_key)
    if fonte is not None and fonte.requer_arquivo:
        raise HTTPException(
            status_code=400,
            detail=f"A fonte '{dataset_key}' exige arquivo — use o envio de arquivo da tela de coletas.",
        )
```

(key inexistente segue caindo no 404 do `iniciar_job`, como hoje.)

(b) Em `listar_fontes` (linha ~72), adicionar ao dict de cada fonte, após `"fonte": fonte.fonte,`:

```python
            "requer_arquivo": fonte.requer_arquivo,
```

- [ ] **Step 5: Runner passa `arquivo_id` para fontes com a flag**

Em `backend/app/services/ingestao_automatica/runner.py`, no `else` da execução (linha ~383), trocar a chamada por:

```python
        else:
            extras = {"arquivo_id": filtros.get("arquivo_id")} if fonte.requer_arquivo else {}
            resumo = fonte.executar(
                db=db, municipios=municipios, anos=filtros.get("anos"),
                usuario_id=job.usuario_id, notificar=filtros.get("notificar", True),
                progresso=progresso, **extras,
            )
```

(assinaturas das 15 fontes existentes não mudam.)

- [ ] **Step 6: Rodar os testes e ver passar**

```bash
cd backend
../venv/Scripts/python.exe -m pytest tests/test_ingestao_automatica.py tests/test_ingestao_runner.py tests/test_ingestao_todas.py -q
```

Expected: PASS (incluindo os antigos).

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/ingestao_automatica/base.py backend/app/services/ingestao_automatica/runner.py backend/app/api/v1/routers/ingestao_automatica.py backend/tests/test_ingestao_automatica.py
git commit -m "feat(ingestao): flag requer_arquivo no contrato de fonte automatica"
```

---

### Task 3: Parsing puro do arquivo IPS (`ips_arquivo.py`, sem DB)

**Files:**
- Create: `backend/app/services/ingestao_automatica/ips_arquivo.py` (só as funções puras nesta task)
- Test: `backend/tests/test_ips_arquivo.py`

**Interfaces:**
- Consumes: `COLUMN_MAP` de `ingestao.carregar_ips` (pacote `backend/ingestao`, importável no app e no worker — o reingest de `municipios.py` já importa loaders de lá).
- Produces (usadas pela Task 4):
  - `ler_linhas(conteudo: bytes) -> list[dict]` (detecta XLSX pela assinatura zip `PK`, senão CSV `;` utf-8-sig)
  - `validar_headers(linhas: list[dict]) -> str | None` (None = ok; senão mensagem legível)
  - `identificacao(row: dict) -> tuple[str | None, str, str]` (codigo_ibge, nome sem sufixo " (UF)", UF)
  - `linha_para_kwargs(row: dict, municipio_id: int, ano: int) -> dict` (kwargs prontos para `IpsMunicipio(**kwargs)`)

- [ ] **Step 1: Escrever os testes que falham** — criar `backend/tests/test_ips_arquivo.py`

```python
"""Parsing puro da fonte IPS (arquivo enviado pela tela) — sem DB/rede.
XLSX gerado em memória; CSV com BOM e vírgula decimal, como os reais."""
import io

from app.services.ingestao_automatica.ips_arquivo import (
    identificacao,
    ler_linhas,
    linha_para_kwargs,
    validar_headers,
)

HEADER = ["Código IBGE", "Município", "UF", "Área (km²)", "População 2022",
          "PIB per capita 2021", "Índice de Progresso Social", "Água e Saneamento"]


def _xlsx_bytes(header=HEADER, rows=None):
    import openpyxl

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Dados IPS"
    ws.append(header)
    for r in (rows or []):
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _csv_bytes():
    texto = (
        "Código IBGE;Município;UF;Área (km²);População 2022;PIB per capita 2021;"
        "Índice de Progresso Social;Água e Saneamento\n"
        "3122306;Divinópolis;MG;708,1;242328;35000,50;62,3;70,15\n"
    )
    return texto.encode("utf-8-sig")


def test_ler_linhas_xlsx_por_assinatura_zip():
    conteudo = _xlsx_bytes(rows=[["3122306", "Divinópolis (MG)", "MG",
                                  708.1, 242328, 35000.5, 62.3, 70.15]])
    linhas = ler_linhas(conteudo)
    assert len(linhas) == 1
    assert linhas[0]["Código IBGE"] == "3122306"
    assert linhas[0]["Água e Saneamento"] == 70.15


def test_ler_linhas_csv_com_bom_e_ponto_e_virgula():
    linhas = ler_linhas(_csv_bytes())
    assert len(linhas) == 1
    assert linhas[0]["Código IBGE"] == "3122306"
    assert linhas[0]["Água e Saneamento"] == "70,15"


def test_validar_headers_ok_e_arquivo_estranho():
    assert validar_headers(ler_linhas(_csv_bytes())) is None
    estranho = [{"foo": "1", "bar": "2"}]
    msg = validar_headers(estranho)
    assert msg is not None and "IPS" in msg
    assert validar_headers([]) is not None


def test_identificacao_strip_sufixo_uf():
    codigo, nome, uf = identificacao(
        {"Código IBGE": "3122306", "Município": "Divinópolis (MG)", "UF": "mg"})
    assert (codigo, nome, uf) == ("3122306", "Divinópolis", "MG")
    codigo, nome, uf = identificacao({"Município": "X", "UF": "SP"})
    assert codigo is None


def test_linha_para_kwargs_xlsx_float_e_csv_string():
    # XLSX: valores já numéricos
    row_x = dict(zip(HEADER, ["3122306", "Divinópolis (MG)", "MG",
                              708.1, 242328, 35000.5, 62.3, 70.15]))
    k = linha_para_kwargs(row_x, municipio_id=42, ano=2025)
    assert k["municipio_id"] == 42 and k["ano"] == 2025
    assert k["area_km2"] == 708.1
    assert k["populacao"] == 242328
    assert k["ips_geral"] == 62.3
    assert k["agua_saneamento"] == 70.15

    # CSV: strings com vírgula decimal
    row_c = ler_linhas(_csv_bytes())[0]
    k = linha_para_kwargs(row_c, municipio_id=42, ano=2025)
    assert k["area_km2"] == 708.1
    assert k["populacao"] == 242328
    assert k["pib_per_capita"] == 35000.5
    assert k["agua_saneamento"] == 70.15


def test_linha_para_kwargs_valor_vazio_vira_none():
    row = dict(zip(HEADER, ["3122306", "X", "MG", "", None, "", "", ""]))
    k = linha_para_kwargs(row, municipio_id=1, ano=2024)
    assert k["area_km2"] is None
    assert k["populacao"] is None
    assert k["ips_geral"] is None
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd backend
../venv/Scripts/python.exe -m pytest tests/test_ips_arquivo.py -q
```

Expected: FAIL com `ModuleNotFoundError: No module named 'app.services.ingestao_automatica.ips_arquivo'`.

- [ ] **Step 3: Criar `backend/app/services/ingestao_automatica/ips_arquivo.py`** (funções puras)

```python
"""Fonte com arquivo: IPS — Índice de Progresso Social (ipsbrasil.org.br).

O site é uma SPA sem URL estável de download (verificado 2026-07-27 e
2026-08-10) — o admin baixa o ips_brasil_municipios_{ano}.xlsx na UI do site
e envia pela tela de coletas; o blob trafega pelo banco (ingestao_arquivo)
porque API e worker não compartilham filesystem. Aceita também o CSV já
convertido (';', utf-8-sig). UPSERT por (municipio_id, ano): reenviar o
arquivo corrige dados. Reusa o COLUMN_MAP do CLI ingestao/carregar_ips."""
import csv
import io

from ingestao.carregar_ips import COLUMN_MAP

COLUNAS_ESSENCIAIS = ("Código IBGE", "UF")


def _para_float(v) -> float | None:
    """Aceita número (XLSX) e string com vírgula decimal (CSV)."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace(",", ".")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def ler_linhas(conteudo: bytes) -> list[dict]:
    """Bytes do upload → dicts header→valor. XLSX (zip 'PK') ou CSV ';'."""
    if conteudo[:2] == b"PK":
        return _ler_xlsx(conteudo)
    return _ler_csv(conteudo)


def _ler_xlsx(conteudo: bytes) -> list[dict]:
    import openpyxl

    wb = openpyxl.load_workbook(io.BytesIO(conteudo), read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    # o XLSX do site declara dimensão errada (A1) — sem isto só a 1ª célula sai
    ws.reset_dimensions()
    linhas = ws.iter_rows(values_only=True)
    header = [str(h).strip() if h is not None else "" for h in next(linhas, [])]
    return [dict(zip(header, row)) for row in linhas]


def _ler_csv(conteudo: bytes) -> list[dict]:
    return list(csv.DictReader(io.StringIO(conteudo.decode("utf-8-sig")), delimiter=";"))


def validar_headers(linhas: list[dict]) -> str | None:
    """None se ok; mensagem legível se o arquivo não parece o IPS nacional."""
    if not linhas:
        return "arquivo vazio ou sem linhas de dados — o IPS nacional tem ~5.570 municípios"
    headers = set(linhas[0].keys())
    faltando = [c for c in COLUNAS_ESSENCIAIS if c not in headers]
    if faltando or not headers & set(COLUMN_MAP):
        cols = ", ".join(f"'{c}'" for c in faltando) or "as colunas de métricas"
        return f"arquivo não parece ser o IPS nacional — colunas ausentes: {cols}"
    return None


def identificacao(row: dict) -> tuple[str | None, str, str]:
    """(codigo_ibge, nome sem o sufixo ' (UF)', UF em caixa alta)."""
    codigo = str(row.get("Código IBGE") or "").strip()
    nome = str(row.get("Município") or row.get("Municipio") or "").strip()
    if "(" in nome:
        nome = nome[: nome.index("(")].strip()
    uf = str(row.get("UF") or "").strip().upper()
    return (codigo or None, nome, uf)


def linha_para_kwargs(row: dict, municipio_id: int, ano: int) -> dict:
    """Kwargs prontos para IpsMunicipio(**kwargs) — mesma semântica do CLI."""
    kwargs = {"municipio_id": municipio_id, "ano": ano}
    kwargs["area_km2"] = _para_float(row.get("Área (km²)", row.get("Area (km2)")))
    populacao = _para_float(row.get("População 2022", row.get("Populacao 2022")))
    kwargs["populacao"] = int(populacao) if populacao is not None else None
    kwargs["pib_per_capita"] = _para_float(row.get("PIB per capita 2021"))
    for coluna, campo in COLUMN_MAP.items():
        if coluna in row and campo not in kwargs:
            kwargs[campo] = _para_float(row[coluna])
    return kwargs
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd backend
../venv/Scripts/python.exe -m pytest tests/test_ips_arquivo.py -q
```

Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ingestao_automatica/ips_arquivo.py backend/tests/test_ips_arquivo.py
git commit -m "feat(ips): parsing puro do arquivo IPS (xlsx do site e csv convertido)"
```

---

### Task 4: `executar()` da fonte IPS + registro no registry

**Files:**
- Modify: `backend/app/services/ingestao_automatica/ips_arquivo.py` (adicionar `executar` + `registrar` no fim)
- Modify: `backend/app/services/ingestao_automatica/__init__.py` (import novo)
- Modify: `backend/app/services/ingestao_automatica/base.py:54-57` (`FONTES_FORA_DO_TODAS`)
- Test: `backend/tests/test_ips_arquivo.py` (teste de registro)

**Interfaces:**
- Consumes: `IngestaoArquivo` (Task 1); funções puras da Task 3; `requer_arquivo` (Task 2); `ResumoIngestao`, `FonteAutomatica`, `registrar` de `base.py`; `obter_ou_criar_municipio(db, nome, estado, codigo_ibge)` de `ingestao.utils`; `IpsMunicipio` de `app.models.ips`.
- Produces: fonte `key="ips"` registrada em `FONTES_AUTOMATICAS` com `requer_arquivo=True`; assinatura `executar(db, municipios, anos=None, usuario_id=None, notificar=True, progresso=None, arquivo_id=None) -> ResumoIngestao`. **Falha dura** (arquivo inválido/ausente, ano ausente) = `raise RuntimeError(msg)` — o runner marca o job como `erro` com a mensagem.

- [ ] **Step 1: Escrever o teste de registro que falha** (adicionar no fim de `backend/tests/test_ips_arquivo.py`)

```python
def test_fonte_ips_registrada_com_arquivo_e_fora_do_todas():
    import app.services.ingestao_automatica  # noqa: F401 — popula o registry
    from app.services.ingestao_automatica.base import (
        FONTES_AUTOMATICAS,
        FONTES_FORA_DO_TODAS,
    )

    assert "ips" in FONTES_AUTOMATICAS
    assert FONTES_AUTOMATICAS["ips"].requer_arquivo is True
    assert "ips" in FONTES_FORA_DO_TODAS
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd backend
../venv/Scripts/python.exe -m pytest tests/test_ips_arquivo.py::test_fonte_ips_registrada_com_arquivo_e_fora_do_todas -q
```

Expected: FAIL — `assert "ips" in FONTES_AUTOMATICAS` (fonte ainda não registrada).

- [ ] **Step 3: Adicionar `executar` + registro no fim de `ips_arquivo.py`**

```python
def executar(db, municipios, anos=None, usuario_id=None, notificar=True,
             progresso=None, arquivo_id=None):
    """Carrega o arquivo IPS do blob para ips_municipio (upsert por
    município/ano). `municipios` e `notificar` são ignorados: o arquivo é
    nacional e a fonte não gera notificações. Falha dura = RuntimeError —
    o runner marca o job como 'erro' com a mensagem."""
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    from app.models.ingestao_arquivo import IngestaoArquivo
    from app.models.ips import IpsMunicipio
    from app.services.ingestao_automatica.base import ResumoIngestao
    from ingestao.utils import obter_ou_criar_municipio

    ano = (anos or [None])[0]
    if not ano:
        raise RuntimeError("ano não informado — reenvie o arquivo pela tela de coletas")
    arq = db.get(IngestaoArquivo, arquivo_id) if arquivo_id else None
    if arq is None:
        raise RuntimeError("arquivo do upload não encontrado no banco — reenvie pela tela de coletas")

    if progresso:
        progresso(0, None, f"lendo {arq.nome}")
    linhas = ler_linhas(arq.conteudo)
    problema = validar_headers(linhas)
    if problema:
        raise RuntimeError(problema)

    resumo = ResumoIngestao(dataset="ips")
    total = len(linhas)
    colunas_upsert = None
    for i, row in enumerate(linhas, start=1):
        codigo, nome, uf = identificacao(row)
        if not nome or not uf:
            resumo.erros.append(f"linha {i}: sem município/UF — ignorada")
            continue
        municipio = obter_ou_criar_municipio(db, nome, uf, codigo)
        kwargs = linha_para_kwargs(row, municipio.id, ano)
        if colunas_upsert is None:
            colunas_upsert = [c for c in kwargs if c not in ("municipio_id", "ano")]
        stmt = pg_insert(IpsMunicipio).values(**kwargs).on_conflict_do_update(
            index_elements=["municipio_id", "ano"],
            set_={c: kwargs.get(c) for c in colunas_upsert},
        )
        db.execute(stmt)
        resumo.linhas += 1
        resumo.municipios_ok += 1
        if progresso and (i % 200 == 0 or i == total):
            progresso(i, total, f"IPS {ano}: {i}/{total} municípios")
    db.commit()

    db.delete(arq)  # blob cumpriu o papel — só sai depois do commit dos dados
    db.commit()
    return resumo


registrar(FonteAutomatica(
    key="ips",
    label="IPS — Índice de Progresso Social",
    fonte="IPS Brasil (ipsbrasil.org.br) — arquivo anual enviado pela tela de coletas",
    executar=executar,
    requer_arquivo=True,
))
```

E adicionar aos imports do topo do módulo (junto de `from ingestao.carregar_ips import COLUMN_MAP`):

```python
from app.services.ingestao_automatica.base import FonteAutomatica, registrar
```

- [ ] **Step 4: Import que auto-registra + `FONTES_FORA_DO_TODAS`**

(a) Em `backend/app/services/ingestao_automatica/__init__.py`, adicionar no fim da lista de imports:

```python
from app.services.ingestao_automatica import ips_arquivo  # noqa: F401 — fonte com upload de arquivo
```

(b) Em `backend/app/services/ingestao_automatica/base.py`, atualizar:

```python
# Fontes registradas que NÃO entram no meta-job "todas" (pesadas/anuais —
# rodam sob demanda). O teste de paridade referencia este set; o Ciclo C
# adicionou cnpj; ips exige arquivo enviado pela tela (não roda sem upload).
FONTES_FORA_DO_TODAS = frozenset({"rais", "cnpj", "ips"})
```

- [ ] **Step 5: Rodar os testes (registro + paridade do todas + regressões)**

```bash
cd backend
../venv/Scripts/python.exe -m pytest tests/test_ips_arquivo.py tests/test_ingestao_todas.py tests/test_ingestao_automatica.py -q
```

Expected: PASS — em particular `test_ordem_cobre_o_registry_sem_sobras_nem_faltas` continua verde (ips está em `FONTES_FORA_DO_TODAS`).

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/ingestao_automatica/ips_arquivo.py backend/app/services/ingestao_automatica/__init__.py backend/app/services/ingestao_automatica/base.py backend/tests/test_ips_arquivo.py
git commit -m "feat(ips): fonte automatica ips com upsert e registro fora do todas"
```

---

### Task 5: Endpoint `POST /ingestao-automatica/{key}/executar-arquivo`

**Files:**
- Modify: `backend/app/api/v1/routers/ingestao_automatica.py`
- Test: `backend/tests/test_ingestao_automatica.py` (mesma seção da Task 2)

**Interfaces:**
- Consumes: `IngestaoArquivo` (Task 1), `requer_arquivo` (Task 2), fonte `ips` (Task 4), `iniciar_job` (existente).
- Produces: rota multipart `POST /api/v1/ingestao-automatica/{dataset_key}/executar-arquivo` (202, `{"job_id": int}`) — usada pelo frontend na Task 6. Campos do form: `arquivo` (file), `ano` (int), `notificar` (bool, default true).

- [ ] **Step 1: Escrever os testes que falham** (adicionar após os testes da Task 2 em `backend/tests/test_ingestao_automatica.py`)

```python
def _upload_fake(conteudo: bytes = b"PK...", nome: str = "ips_brasil_municipios_2025.xlsx"):
    import io
    return SimpleNamespace(file=io.BytesIO(conteudo), filename=nome)


def test_executar_arquivo_404_para_fonte_inexistente():
    from app.api.v1.routers.ingestao_automatica import executar_fonte_com_arquivo

    with pytest.raises(HTTPException) as exc:
        executar_fonte_com_arquivo("nao_existe", arquivo=_upload_fake(), ano=2025,
                                   notificar=True, db=object(),
                                   current_user=SimpleNamespace(id=1))
    assert exc.value.status_code == 404


def test_executar_arquivo_400_para_fonte_sem_flag():
    import app.services.ingestao_automatica  # noqa: F401 — registra 'populacao'
    from app.api.v1.routers.ingestao_automatica import executar_fonte_com_arquivo

    with pytest.raises(HTTPException) as exc:
        executar_fonte_com_arquivo("populacao", arquivo=_upload_fake(), ano=2025,
                                   notificar=True, db=object(),
                                   current_user=SimpleNamespace(id=1))
    assert exc.value.status_code == 400


def test_executar_arquivo_400_para_ano_invalido_e_arquivo_grande():
    from app.api.v1.routers.ingestao_automatica import (
        _LIMITE_UPLOAD_BYTES,
        executar_fonte_com_arquivo,
    )

    registrar(FonteAutomatica(key="_teste_arq2", label="T", fonte="T",
                              executar=lambda **kw: None, requer_arquivo=True))
    try:
        with pytest.raises(HTTPException) as exc:
            executar_fonte_com_arquivo("_teste_arq2", arquivo=_upload_fake(), ano=1889,
                                       notificar=True, db=object(),
                                       current_user=SimpleNamespace(id=1))
        assert exc.value.status_code == 400

        grande = _upload_fake(conteudo=b"x" * (_LIMITE_UPLOAD_BYTES + 1))
        with pytest.raises(HTTPException) as exc:
            executar_fonte_com_arquivo("_teste_arq2", arquivo=grande, ano=2025,
                                       notificar=True, db=object(),
                                       current_user=SimpleNamespace(id=1))
        assert exc.value.status_code == 400
        assert "20 MB" in exc.value.detail
    finally:
        FONTES_AUTOMATICAS.pop("_teste_arq2", None)


def test_rota_executar_arquivo_e_multipart_no_openapi():
    from app.main import app

    schema = app.openapi()
    op = schema["paths"]["/api/v1/ingestao-automatica/{dataset_key}/executar-arquivo"]["post"]
    assert "multipart/form-data" in op["requestBody"]["content"]
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd backend
../venv/Scripts/python.exe -m pytest tests/test_ingestao_automatica.py -q
```

Expected: FAIL — `ImportError: cannot import name 'executar_fonte_com_arquivo'`.

- [ ] **Step 3: Implementar o endpoint**

Em `backend/app/api/v1/routers/ingestao_automatica.py`:

(a) Ajustar imports do topo:

```python
from datetime import datetime, timedelta, timezone

from app.api.deps import get_db, require_role
from app.models.ingestao_arquivo import IngestaoArquivo
from app.models.ingestao_audit import IngestaoAudit
from app.models.ingestao_job import IngestaoJob
from app.services.ingestao_automatica import FONTES_AUTOMATICAS
from app.services.ingestao_automatica.runner import (
    STATUS_ATIVOS,
    _transicao_abortado_condicional,
    iniciar_job,
    job_orfao,
    job_para_dict,
)
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session
```

(b) Constantes após `router = APIRouter(...)`:

```python
_LIMITE_UPLOAD_BYTES = 20 * 1024 * 1024  # XLSX do IPS tem ~5 MB; margem p/ anos futuros
_SWEEP_ORFAOS_HORAS = 24
```

(c) Endpoint novo, após `executar_fonte`:

```python
@router.post("/{dataset_key}/executar-arquivo", status_code=202)
def executar_fonte_com_arquivo(
    dataset_key: str,
    arquivo: UploadFile = File(...),
    ano: int = Form(...),
    notificar: bool = Form(True),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    """Variante multipart do /executar para fontes com requer_arquivo (IPS):
    o blob vai para ingestao_arquivo e o job nasce no MESMO commit (dentro de
    iniciar_job) — um 409 de job ativo descarta blob e job juntos."""
    fonte = FONTES_AUTOMATICAS.get(dataset_key)
    if fonte is None:
        raise HTTPException(status_code=404, detail=f"Fonte automática '{dataset_key}' não existe.")
    if not fonte.requer_arquivo:
        raise HTTPException(
            status_code=400,
            detail=f"A fonte '{dataset_key}' não recebe arquivo — use o botão de execução normal.",
        )
    if not 2000 <= ano <= 2100:
        raise HTTPException(status_code=400, detail="Ano inválido.")
    conteudo = arquivo.file.read(_LIMITE_UPLOAD_BYTES + 1)
    if len(conteudo) > _LIMITE_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="Arquivo maior que 20 MB.")
    if not conteudo:
        raise HTTPException(status_code=400, detail="Arquivo vazio.")

    # blobs órfãos (job que falhou/abortou nunca deleta o arquivo) saem aqui
    corte = datetime.now(timezone.utc) - timedelta(hours=_SWEEP_ORFAOS_HORAS)
    db.query(IngestaoArquivo).filter(IngestaoArquivo.criado_em < corte).delete(
        synchronize_session=False
    )

    arq = IngestaoArquivo(nome=(arquivo.filename or "arquivo")[:255], conteudo=conteudo)
    db.add(arq)
    db.flush()  # id do blob; o commit único acontece dentro de iniciar_job
    filtros = {"arquivo_id": arq.id, "anos": [ano], "notificar": notificar}
    job = iniciar_job(db, dataset_key, filtros, current_user.id)
    return {"job_id": job.id}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd backend
../venv/Scripts/python.exe -m pytest tests/test_ingestao_automatica.py -q
```

Expected: PASS.

- [ ] **Step 5: Suíte backend completa**

```bash
cd backend
../venv/Scripts/python.exe -m pytest tests -q
```

Expected: tudo verde.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/v1/routers/ingestao_automatica.py backend/tests/test_ingestao_automatica.py
git commit -m "feat(ingestao): endpoint multipart executar-arquivo para fontes com upload"
```

---

### Task 6: Frontend — modal de upload na tela de coletas

**Files:**
- Modify: `frontend-observatorio/src/utils/jobStatus.js` (helper `anoDoNomeArquivo`)
- Test: `frontend-observatorio/src/utils/jobStatus.test.js`
- Modify: `frontend-observatorio/src/pages/admin/DatasetFontesAdminPage.jsx`

**Interfaces:**
- Consumes: `GET /ingestao-automatica/fontes` agora traz `requer_arquivo` por fonte (Task 2); `POST /ingestao-automatica/{key}/executar-arquivo` multipart (Task 5).
- Produces: `anoDoNomeArquivo(nome: string) -> string` (4 dígitos ou `""`), exportada de `src/utils/jobStatus.js`.

- [ ] **Step 1: Escrever o teste vitest que falha** (adicionar no fim de `frontend-observatorio/src/utils/jobStatus.test.js`; o arquivo já importa de `"./jobStatus"` — acrescentar `anoDoNomeArquivo` ao import existente)

```js
describe("anoDoNomeArquivo", () => {
  it("extrai o ano do nome padrão do site do IPS", () => {
    expect(anoDoNomeArquivo("ips_brasil_municipios_2025.xlsx")).toBe("2025");
    expect(anoDoNomeArquivo("IPS_Brasil_Municipios-2024.csv")).toBe("2024");
  });
  it("vazio quando não há match", () => {
    expect(anoDoNomeArquivo("dados.xlsx")).toBe("");
    expect(anoDoNomeArquivo()).toBe("");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd frontend-observatorio
npx vitest run src/utils/jobStatus.test.js
```

Expected: FAIL — `anoDoNomeArquivo` não exportado.

- [ ] **Step 3: Implementar o helper** (fim de `frontend-observatorio/src/utils/jobStatus.js`)

```js
/** Ano no padrão de nome do arquivo do IPS Brasil ("ips_brasil_municipios_2025.xlsx"). */
export function anoDoNomeArquivo(nome) {
  const m = /ips_brasil_municipios[_-](\d{4})/i.exec(nome || "");
  return m ? m[1] : "";
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd frontend-observatorio
npx vitest run src/utils/jobStatus.test.js
```

Expected: PASS.

- [ ] **Step 5: Modal de upload em `DatasetFontesAdminPage.jsx`**

(a) Acrescentar `anoDoNomeArquivo` ao import de `../../utils/jobStatus` (linha ~11-13).

(b) Estado novo, junto aos `useState` existentes (linha ~30-44):

```jsx
  const [uploadFonte, setUploadFonte] = useState(null);   // fonte com requer_arquivo aguardando arquivo
  const [uploadArquivo, setUploadArquivo] = useState(null);
  const [uploadAno, setUploadAno] = useState("");
  const [uploadEnviando, setUploadEnviando] = useState(false);
```

(c) No início de `handleExecutar` (linha ~123), antes do `try`:

```jsx
    if (fonte.requer_arquivo) {
      setUploadFonte(fonte);
      setUploadArquivo(null);
      setUploadAno("");
      return;
    }
```

(d) Função de envio, logo após `handleExecutar` (FormData com axios — mesmo padrão do modal "Reingerir" de `DatasetsAdminPage.jsx`, que já envia arquivos multipart pela mesma instância `api`):

```jsx
  const enviarArquivo = async () => {
    if (!uploadArquivo || !uploadAno || uploadEnviando) return;
    setUploadEnviando(true);
    try {
      const fd = new FormData();
      fd.append("arquivo", uploadArquivo);
      fd.append("ano", uploadAno);
      fd.append("notificar", notificar);
      const { data } = await api.post(
        `/ingestao-automatica/${uploadFonte.key}/executar-arquivo`, fd
      );
      addToast(`${uploadFonte.label}: execução iniciada em segundo plano.`, "success");
      startPolling({ id: data.job_id, dataset: uploadFonte.key, status: "pendente" });
      setUploadFonte(null);
    } catch (err) {
      addToast(err.response?.data?.detail || "Erro ao enviar o arquivo.", "error");
    } finally {
      setUploadEnviando(false);
    }
  };
```

(e) Nota na célula da fonte — na coluna `label` do `DataTable` (linha ~346-359), após o bloco do `captacao_federal`:

```jsx
                    {f.requer_arquivo && (
                      <p className="text-xs mt-0.5" style={{ color: "var(--accent-4)" }}>
                        Requer o arquivo anual do site — filtros de estado/município não se aplicam.
                      </p>
                    )}
```

(f) Modal — junto aos outros `NidModal` no fim do JSX (antes do fechamento do `motion.div`):

```jsx
      <NidModal
        open={Boolean(uploadFonte)}
        onClose={() => setUploadFonte(null)}
        eyebrow="Coleta com arquivo"
        title={uploadFonte ? `Atualizar ${uploadFonte.label}` : ""}
        size="md"
        footer={
          <>
            <button
              onClick={() => setUploadFonte(null)}
              className="px-4 py-2 rounded-lg text-sm cursor-pointer"
              style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text-dim)" }}
            >
              Cancelar
            </button>
            <button
              onClick={enviarArquivo}
              disabled={!uploadArquivo || !uploadAno || uploadEnviando}
              className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: "var(--admin-accent, #3b82f6)", color: "#fff",
                border: "1px solid color-mix(in oklab, var(--admin-accent, #3b82f6) 70%, black)",
              }}
            >
              {uploadEnviando ? "Enviando…" : "Enviar e executar"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p style={{ color: "var(--text-dim)" }}>
            Baixe o arquivo anual em <b style={{ color: "var(--text)" }}>ipsbrasil.org.br</b> e
            envie aqui (<code>.xlsx</code> do site ou <code>.csv</code> convertido). O arquivo é
            nacional — filtros de estado/município não se aplicam.
          </p>
          <input
            type="file"
            accept=".xlsx,.csv"
            aria-label="Arquivo do IPS"
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              setUploadArquivo(f);
              if (f) {
                const ano = anoDoNomeArquivo(f.name);
                if (ano) setUploadAno(ano);
              }
            }}
            className="block w-full text-sm text-[var(--text)] rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2"
          />
          <label className="flex items-center gap-2 text-sm text-[var(--text-dim)]">
            Ano
            <input
              value={uploadAno}
              onChange={(e) => setUploadAno(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="ex.: 2025"
              className="w-24 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] text-[var(--text)] px-3 py-2 text-sm"
            />
          </label>
        </div>
      </NidModal>
```

- [ ] **Step 6: Rodar a suíte vitest completa**

```bash
cd frontend-observatorio
npm test
```

Expected: tudo verde (não usar `npm run lint` — está quebrado no repo).

- [ ] **Step 7: Commit**

```bash
git add frontend-observatorio/src/utils/jobStatus.js frontend-observatorio/src/utils/jobStatus.test.js frontend-observatorio/src/pages/admin/DatasetFontesAdminPage.jsx
git commit -m "feat(ips): modal de upload do arquivo IPS na tela de coletas"
```

---

### Task 7: Documentação + verificação final

**Files:**
- Modify: `README.md` (seções que citam o IPS como carga manual)
- Test: suítes completas (backend + frontend)

**Interfaces:**
- Consumes: tudo das tasks anteriores.
- Produces: branch pronta para merge local.

- [ ] **Step 1: Atualizar o README**

Localizar as menções ao IPS (`grep -n "IPS" README.md`) e:

(a) Na seção de ingestão/CLI que diz que o IPS carrega separadamente via `python -m ingestao.carregar_ips` (~linha 264): manter o comando (CLI continua existindo) e acrescentar a frase:

> O IPS também pode ser carregado pela tela **/admin/fontes** (fonte "IPS — Índice de Progresso Social"): envie o `ips_brasil_municipios_{ano}.xlsx` baixado de ipsbrasil.org.br (ou o CSV convertido) — o job roda no worker e faz upsert por município/ano.

(b) Na tabela/lista de fontes automáticas (~linhas 294-306): adicionar a linha do IPS marcando que é **fonte com upload de arquivo** (sem download automático — site sem URL estável).

(c) Na menção "só restam as estaduais (arrecadação/VAF por SEF) e IPS" como fontes não automatizadas (~linha 693): remover o IPS da lista (agora está na tela, via upload).

- [ ] **Step 2: Suítes completas**

```bash
cd backend
../venv/Scripts/python.exe -m pytest tests -q
```

```bash
cd frontend-observatorio
npm test
```

Expected: tudo verde nas duas.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(readme): IPS agora tem coleta pela tela via upload de arquivo"
```

---

## Verificação manual (pós-implementação, antes/depois do deploy)

1. Local: `docker-compose up -d` (API com `INGESTAO_EXECUTOR: worker` + serviço `worker`), abrir `/app/admin/fontes`, conferir a linha do IPS com a nota de arquivo, enviar o `dados/ips_brasil_municipios_2025.xlsx` real, acompanhar a barra de progresso até `concluido` (~5.570 linhas) e conferir `/app/ips`.
2. Reenviar o mesmo arquivo: deve concluir de novo (upsert) sem duplicar linhas.
3. Enviar um arquivo qualquer (ex.: um CSV de outra fonte): job deve terminar em `erro` com a mensagem "arquivo não parece ser o IPS nacional…".
4. Deploy: `railway up` na API **e no worker** (registry resolvido em processo; sem o redeploy do worker o job falha com "fonte 'ips' não registrada neste executor"). A migração roda no CMD da imagem da API (`alembic upgrade head`).
