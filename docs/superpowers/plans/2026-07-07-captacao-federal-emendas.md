# Dinheiro na Mesa + Radar de Emendas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Duas features na esteira de ingestão automática do FPM: captação federal (SICONV) comparada com municípios pares por faixa FPM + UF, e radar de emendas parlamentares por município (Portal da Transparência), com páginas gateadas por plano, teasers livres no Painel do Prefeito e CTA para o kanban de Captação.

**Architecture:** Bulk CSV nacionais (sem auth) → duas fontes novas no registry `FONTES_AUTOMATICAS` → tabelas `captacao_federal_anual` (agregado por município/ano, base dos pares) e `emenda_parlamentar` (linha por emenda×município) → services com núcleo puro + camada DB batched (padrão `fpm_service.py`) → routers com endpoints `/resumo` livres (`municipio_scope`) e completos gateados (`scoped_modulo`) → 2 páginas React (grupo Economia) + 2 cards no Painel do Prefeito.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 + Alembic + PostgreSQL; React 19 + Tailwind + componentes `nid`; pytest pure-logic.

**Spec:** `docs/superpowers/specs/2026-07-07-captacao-federal-emendas-design.md` (aprovado; fontes verificadas empiricamente em 2026-07-07).

## Global Constraints

- Branch: `feat/captacao-emendas` (já criada a partir de `origin/main`).
- Testes backend NUNCA abrem DB/rede (decisão de projeto) — só lógica pura; rodar de `backend/`: `python -m pytest`.
- Alembic roda da raiz: `$env:PYTHONPATH = "$PWD\backend"; alembic -c backend\alembic.ini upgrade head` (precisa de `backend/.env`; Postgres via `docker-compose up -d db`).
- Frontend gate: `cd frontend-observatorio; npm run build` (eslint baseline tem falsos-positivos conhecidos: "motion unused" e set-state-in-effect — NÃO tentar corrigi-los).
- Janela histórica: `ANO_INICIO = 2019` até ano corrente; headline usa `ano corrente − 1` (último ano civil completo); ano corrente marcado `parcial`.
- Pares = mesma faixa FPM (18 faixas DL 1.881/81, `fpm_service.FAIXAS_FPM`) + mesma UF, excluindo o próprio município, capitais (`CAPITAIS_IBGE`) e municípios demo. Média nacional = mesma faixa, Brasil.
- Métrica principal: `valor_firmado` = soma de `VL_REPASSE_CONV` dos convênios com `IND_ASSINADO == "SIM"` e coluna `ANO` (ano de assinatura) na janela.
- CSVs SICONV: UTF-8 **com BOM** (`utf-8-sig`), delimitador `;`. CSV de emendas do Portal: **latin-1**, delimitador `;`, campos entre aspas.
- Módulo/dataset keys: `captacao_federal` e `emendas` — usados em plan gating, DATASET_REGISTRY e DatasetInfo.
- Textos de UI em pt-BR, valores formatados `toLocaleString("pt-BR")`.
- Commits: conventional commits em português, estilo do repo (`feat(captacao): ...`, `feat(emendas): ...`).
- Notificações: dedup por `(titulo, municipio_id)`, targeted `municipio_ids=[mid]`, padrão `gerar_notificacoes_fpm` (`fpm_service.py:360`).

## File Structure

**Backend — criar:**
| Arquivo | Responsabilidade |
|---|---|
| `backend/app/models/captacao_federal.py` | Model `CaptacaoFederalAnual` |
| `backend/app/models/emenda.py` | Model `EmendaParlamentar` |
| `backend/alembic/versions/0031_captacao_emendas.py` | Migration das 2 tabelas |
| `backend/app/services/ingestao_automatica/util.py` | `parse_valor_br`, `_indices`, `_baixar_zip`, `_linhas_zip` (compartilhados) |
| `backend/app/services/ingestao_automatica/captacao_siconv.py` | Parsers SICONV (puros) + fonte `captacao_federal` |
| `backend/app/services/ingestao_automatica/emendas_portal.py` | Parser CSV emendas (puro) + fonte `emendas` |
| `backend/app/services/captacao_federal_service.py` | Núcleo puro do diagnóstico + camada DB + notificações |
| `backend/app/services/emendas_service.py` | Núcleo puro do radar + camada DB + notificações |
| `backend/app/schemas/captacao_federal.py` | Pydantic out-schemas |
| `backend/app/schemas/emendas.py` | Pydantic out-schemas |
| `backend/app/api/v1/routers/captacao_federal.py` | `/captacao-federal/{resumo,diagnostico,serie}` |
| `backend/app/api/v1/routers/emendas.py` | `/emendas/{resumo,radar}` |
| `backend/tests/test_captacao_siconv.py` | Parsers SICONV |
| `backend/tests/test_captacao_service.py` | Matemática do diagnóstico |
| `backend/tests/test_emendas_portal.py` | Parser emendas |
| `backend/tests/test_emendas_service.py` | Matemática do radar |

**Backend — modificar:** `app/models/__init__.py`, `app/services/municipio_management.py` (3 registros), `app/services/ingestao_automatica/__init__.py`, `app/services/ingestao_automatica/fpm_stn.py` (usa `util.parse_valor_br`), `app/main.py` (2 routers).

**Frontend — criar:** `src/pages/dinheiro-na-mesa/DinheiroNaMesaPage.jsx`, `src/pages/emendas/EmendasPage.jsx`, `src/components/CriarOportunidadeCaptacao.jsx`, `src/components/DinheiroNaMesaCard.jsx`, `src/components/EmendasResumoCard.jsx`.

**Frontend — modificar:** `src/app/router/AppRouter.jsx`, `src/app/layouts/DashboardLayout.jsx`, `src/pages/admin/PlanoConfigAdminPage.jsx`, `src/pages/painel-prefeito/PainelPrefeitoPage.jsx`.

---

### Task 1: Models + registro no lifecycle + migration 0031

**Files:**
- Create: `backend/app/models/captacao_federal.py`
- Create: `backend/app/models/emenda.py`
- Create: `backend/alembic/versions/0031_captacao_emendas.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/app/services/municipio_management.py` (DATASET_MODELS ~linha 84, DATASET_REGISTRY ~linha 130, DATASET_LABELS ~linha 161)

**Interfaces:**
- Produces: `CaptacaoFederalAnual(municipio_id, ano, valor_firmado, valor_desembolsado, valor_via_emenda, qtd_convenios)` e `EmendaParlamentar(municipio_id, ano, codigo_emenda, numero_emenda, autor, tipo_emenda, funcao, valor_empenhado, valor_liquidado, valor_pago, valor_resto_pago)` — usados por todas as tasks seguintes.

- [ ] **Step 1: Criar `backend/app/models/captacao_federal.py`**

```python
from app.db.base import Base
from sqlalchemy import Float, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship


class CaptacaoFederalAnual(Base):
    """Captação federal (SICONV/Transferegov) agregada por município/ano.

    `valor_firmado` = soma de VL_REPASSE_CONV dos convênios ASSINADOS no ano
    (parcela federal, sem contrapartida local). `valor_via_emenda` é a parte do
    firmado originada de emenda parlamentar (siconv_emenda). `valor_desembolsado`
    vem de siconv_desembolso por ANO_DESEMBOLSO (dinheiro que entrou no ano,
    inclusive de convênios antigos). Carregada para todos os municípios ativos —
    é a base do comparativo com pares. Ausência de linha = captação zero."""

    __tablename__ = "captacao_federal_anual"
    __table_args__ = (
        UniqueConstraint("municipio_id", "ano", name="uq_captacao_federal_municipio_ano"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("municipios.id"), nullable=False, index=True
    )
    ano: Mapped[int] = mapped_column(Integer, index=True)
    valor_firmado: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    valor_desembolsado: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    valor_via_emenda: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    qtd_convenios: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    municipio = relationship("Municipio")
```

- [ ] **Step 2: Criar `backend/app/models/emenda.py`**

```python
from app.db.base import Base
from sqlalchemy import Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship


class EmendaParlamentar(Base):
    """Emenda parlamentar destinada ao município (Portal da Transparência,
    download-de-dados/emendas-parlamentares — inclui emendas Pix desde mai/2026).

    Uma linha por (município, código da emenda); os valores agregam as linhas do
    CSV por ação orçamentária. `valor_pago` é o pago no exercício; o pago total
    de fato é `valor_pago + valor_resto_pago` (restos a pagar pagos) — calculado
    no service, não armazenado. `funcao` é a função dominante (maior empenho)."""

    __tablename__ = "emenda_parlamentar"
    __table_args__ = (
        UniqueConstraint("municipio_id", "codigo_emenda", name="uq_emenda_municipio_codigo"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("municipios.id"), nullable=False, index=True
    )
    ano: Mapped[int] = mapped_column(Integer, index=True)
    codigo_emenda: Mapped[str] = mapped_column(String(60), nullable=False)
    numero_emenda: Mapped[str | None] = mapped_column(String(20), nullable=True)
    autor: Mapped[str] = mapped_column(String(120), nullable=False)
    tipo_emenda: Mapped[str] = mapped_column(String(120), nullable=False)
    funcao: Mapped[str | None] = mapped_column(String(80), nullable=True)
    valor_empenhado: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    valor_liquidado: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    valor_pago: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    valor_resto_pago: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    municipio = relationship("Municipio")
```

- [ ] **Step 3: Registrar em `backend/app/models/__init__.py`**

Após a linha `from app.models.fpm import FpmMensal` adicionar:

```python
from app.models.captacao_federal import CaptacaoFederalAnual
from app.models.emenda import EmendaParlamentar
```

E no fim da lista `__all__` (após `"FpmMensal",`):

```python
    "CaptacaoFederalAnual",
    "EmendaParlamentar",
]
```

- [ ] **Step 4: Registrar no lifecycle em `backend/app/services/municipio_management.py`**

Obrigatório — sem isso clone/delete/counts quebram (lição do FPM). Três edições:

No bloco de imports de models (junto de `from app.models... PopulacaoMunicipio, FpmMensal` etc.), adicionar:

```python
from app.models.captacao_federal import CaptacaoFederalAnual
from app.models.emenda import EmendaParlamentar
```

Em `DATASET_MODELS`, na linha que contém `Empresa, PixMensal, IpsMunicipio, PopulacaoMunicipio, FpmMensal,` trocar por:

```python
    Empresa, PixMensal, IpsMunicipio, PopulacaoMunicipio, FpmMensal,
    CaptacaoFederalAnual, EmendaParlamentar,
```

Em `DATASET_REGISTRY`, após `"fpm":           [FpmMensal],` adicionar:

```python
    "captacao_federal": [CaptacaoFederalAnual],
    "emendas":          [EmendaParlamentar],
```

Em `DATASET_LABELS`, após `"fpm":           "FPM",` adicionar:

```python
    "captacao_federal": "Captação Federal (SICONV)",
    "emendas":          "Emendas Parlamentares",
```

- [ ] **Step 5: Criar `backend/alembic/versions/0031_captacao_emendas.py`**

```python
"""add captacao_federal_anual and emenda_parlamentar tables

Captação federal agregada por município/ano (SICONV) e emendas parlamentares
por município (Portal da Transparência). Bases do Dinheiro na Mesa e do Radar
de Emendas.

Revision ID: 0031_captacao_emendas
Revises: 0030_fpm_populacao
Create Date: 2026-07-07
"""

import sqlalchemy as sa
from alembic import op


revision = "0031_captacao_emendas"
down_revision = "0030_fpm_populacao"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "captacao_federal_anual",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("municipio_id", sa.Integer(), nullable=False),
        sa.Column("ano", sa.Integer(), nullable=False),
        sa.Column("valor_firmado", sa.Float(), nullable=False, server_default="0"),
        sa.Column("valor_desembolsado", sa.Float(), nullable=False, server_default="0"),
        sa.Column("valor_via_emenda", sa.Float(), nullable=False, server_default="0"),
        sa.Column("qtd_convenios", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["municipio_id"], ["municipios.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("municipio_id", "ano", name="uq_captacao_federal_municipio_ano"),
    )
    op.create_index(op.f("ix_captacao_federal_anual_id"), "captacao_federal_anual", ["id"], unique=False)
    op.create_index(op.f("ix_captacao_federal_anual_municipio_id"), "captacao_federal_anual", ["municipio_id"], unique=False)
    op.create_index(op.f("ix_captacao_federal_anual_ano"), "captacao_federal_anual", ["ano"], unique=False)

    op.create_table(
        "emenda_parlamentar",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("municipio_id", sa.Integer(), nullable=False),
        sa.Column("ano", sa.Integer(), nullable=False),
        sa.Column("codigo_emenda", sa.String(length=60), nullable=False),
        sa.Column("numero_emenda", sa.String(length=20), nullable=True),
        sa.Column("autor", sa.String(length=120), nullable=False),
        sa.Column("tipo_emenda", sa.String(length=120), nullable=False),
        sa.Column("funcao", sa.String(length=80), nullable=True),
        sa.Column("valor_empenhado", sa.Float(), nullable=False, server_default="0"),
        sa.Column("valor_liquidado", sa.Float(), nullable=False, server_default="0"),
        sa.Column("valor_pago", sa.Float(), nullable=False, server_default="0"),
        sa.Column("valor_resto_pago", sa.Float(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["municipio_id"], ["municipios.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("municipio_id", "codigo_emenda", name="uq_emenda_municipio_codigo"),
    )
    op.create_index(op.f("ix_emenda_parlamentar_id"), "emenda_parlamentar", ["id"], unique=False)
    op.create_index(op.f("ix_emenda_parlamentar_municipio_id"), "emenda_parlamentar", ["municipio_id"], unique=False)
    op.create_index(op.f("ix_emenda_parlamentar_ano"), "emenda_parlamentar", ["ano"], unique=False)


def downgrade():
    op.drop_index(op.f("ix_emenda_parlamentar_ano"), table_name="emenda_parlamentar")
    op.drop_index(op.f("ix_emenda_parlamentar_municipio_id"), table_name="emenda_parlamentar")
    op.drop_index(op.f("ix_emenda_parlamentar_id"), table_name="emenda_parlamentar")
    op.drop_table("emenda_parlamentar")
    op.drop_index(op.f("ix_captacao_federal_anual_ano"), table_name="captacao_federal_anual")
    op.drop_index(op.f("ix_captacao_federal_anual_municipio_id"), table_name="captacao_federal_anual")
    op.drop_index(op.f("ix_captacao_federal_anual_id"), table_name="captacao_federal_anual")
    op.drop_table("captacao_federal_anual")
```

- [ ] **Step 6: Aplicar migration e rodar testes**

Da raiz do projeto (PowerShell; Postgres de dev rodando — `docker-compose up -d db`):

```powershell
$env:PYTHONPATH = "$PWD\backend"; alembic -c backend\alembic.ini upgrade head
```

Expected: `Running upgrade 0030_fpm_populacao -> 0031_captacao_emendas`.

```powershell
cd backend; python -m pytest
```

Expected: todos os testes existentes PASS (nenhum quebrado).

- [ ] **Step 7: Commit**

```bash
git add backend/app/models/captacao_federal.py backend/app/models/emenda.py backend/app/models/__init__.py backend/app/services/municipio_management.py backend/alembic/versions/0031_captacao_emendas.py
git commit -m "feat(captacao): models e migration de captacao_federal_anual e emenda_parlamentar + registro no lifecycle"
```

---

### Task 2: Helper compartilhado + parsers SICONV (TDD)

**Files:**
- Create: `backend/app/services/ingestao_automatica/util.py`
- Create: `backend/app/services/ingestao_automatica/captacao_siconv.py` (só parsers nesta task; a fonte vem na Task 5)
- Modify: `backend/app/services/ingestao_automatica/fpm_stn.py` (linhas 33-40: `_parse_valor` vira alias do helper)
- Test: `backend/tests/test_captacao_siconv.py`

**Interfaces:**
- Consumes: nada (puro).
- Produces:
  - `util.parse_valor_br(s) -> float | None`
  - `util.indices_colunas(header: list[str], obrigatorias: list[str], arquivo: str) -> dict[str, int]` (ValueError "layout mudou?" se faltar coluna)
  - `captacao_siconv.parse_proposta_csv(linhas, ibge_para_mid: dict[str, int]) -> dict[str, int]` (ID_PROPOSTA → municipio_id)
  - `captacao_siconv.parse_convenio_csv(linhas, proposta_para_mid, anos: set[int]) -> ConveniosParse` com campos `por_municipio_ano: dict[(mid,ano), {"firmado","qtd"}]`, `ano_por_proposta: dict[str,(mid,ano)]`, `mid_por_convenio: dict[str,int]`
  - `captacao_siconv.parse_emenda_csv(linhas, ano_por_proposta) -> dict[(mid,ano), float]`
  - `captacao_siconv.parse_desembolso_csv(linhas, mid_por_convenio, anos) -> dict[(mid,ano), float]`
  - `captacao_siconv.montar_registros(convenios, via_emenda, desembolsos) -> list[dict]` (dicts com as colunas do model)
  - Constantes: `captacao_siconv.ANO_INICIO_PADRAO = 2019`, `captacao_siconv.NATUREZA_MUNICIPAL = "Administração Pública Municipal"`

- [ ] **Step 1: Escrever os testes que falham — `backend/tests/test_captacao_siconv.py`**

```python
"""Parsers puros do SICONV (captação federal) — sem rede, sem DB.
Headers copiados dos CSVs reais de repositorio.dados.gov.br/seges/detru/ (2026-07-07)."""
import io

import pytest

from app.services.ingestao_automatica.captacao_siconv import (
    ConveniosParse,
    montar_registros,
    parse_convenio_csv,
    parse_desembolso_csv,
    parse_emenda_csv,
    parse_proposta_csv,
)
from app.services.ingestao_automatica.util import indices_colunas, parse_valor_br

IBGE_PARA_MID = {"3126109": 42, "3505401": 7}

CSV_PROPOSTA = (
    "ID_PROPOSTA;UF_PROPONENTE;MUNIC_PROPONENTE;COD_MUNIC_IBGE;NATUREZA_JURIDICA\n"
    "100;MG;FORMIGA;3126109;Administração Pública Municipal\n"
    "101;MG;FORMIGA;3126109;Organização da Sociedade Civil\n"
    "102;SP;BARRA DO TURVO;3505401;Administração Pública Municipal\n"
    "103;RJ;RIO CLARO;3304409;Administração Pública Municipal\n"
)

CSV_CONVENIO = (
    "NR_CONVENIO;ID_PROPOSTA;DIA;MES;ANO;DIA_ASSIN_CONV;IND_ASSINADO;VL_GLOBAL_CONV;VL_REPASSE_CONV\n"
    "900001;100;22;3;2024;22/03/2024;SIM;1031000;1000000\n"
    "900002;100;10;7;2024;10/07/2024;SIM;515000;500000,50\n"
    "900003;102;05;1;2018;05/01/2018;SIM;200000;200000\n"      # fora da janela, mas entra em mid_por_convenio
    "900004;102;05;1;2024;;NÃO;99999;99999\n"                   # não assinado
    "900005;999;05;1;2024;05/01/2024;SIM;77777;77777\n"          # proposta desconhecida
)

CSV_EMENDA = (
    "ID_PROPOSTA;QUALIF_PROPONENTE;COD_PROGRAMA_EMENDA;NR_EMENDA;NOME_PARLAMENTAR;BENEFICIARIO_EMENDA;IND_IMPOSITIVO;TIPO_PARLAMENTAR;VALOR_REPASSE_PROPOSTA_EMENDA;VALOR_REPASSE_EMENDA\n"
    "100;BENEFICIARIO;5500020240001;81000306;DEPUTADO X;05193057000178;SIM;INDIVIDUAL;955000;300000\n"
    "100;BENEFICIARIO;5500020240002;81000307;DEPUTADA Y;05193057000178;SIM;INDIVIDUAL;100000;100000,25\n"
    "102;BENEFICIARIO;5500020180001;81000308;DEPUTADO Z;05193057000178;NÃO;INDIVIDUAL;50000;50000\n"  # proposta 102 assinada em 2018 → fora
    "999;BENEFICIARIO;5500020240003;81000309;DEPUTADO W;05193057000178;SIM;INDIVIDUAL;1;1\n"
)

CSV_DESEMBOLSO = (
    "ID_DESEMBOLSO;NR_CONVENIO;DT_ULT_DESEMBOLSO;QTD_DIAS_SEM_DESEMBOLSO;DATA_DESEMBOLSO;ANO_DESEMBOLSO;MES_DESEMBOLSO;NR_SIAFI;UG_EMITENTE_DH;OBSERVACAO_DH;VL_DESEMBOLSADO\n"
    "1;900001;21/05/2024;10;21/05/2024;2024;5;2024OB1;200005;obs;400000\n"
    "2;900001;21/08/2024;10;21/08/2024;2024;8;2024OB2;200005;obs;100000,75\n"
    "3;900003;21/05/2024;10;21/05/2024;2024;5;2024OB3;200005;obs;25000\n"   # convênio de 2018, desembolso 2024 → conta
    "4;900003;21/05/2017;10;21/05/2017;2017;5;2017OB1;200005;obs;99999\n"   # ano fora da janela
    "5;888888;21/05/2024;10;21/05/2024;2024;5;2024OB4;200005;obs;99999\n"   # convênio desconhecido
)


def _linhas(texto):
    return io.StringIO(texto)


def test_parse_valor_br():
    assert parse_valor_br("1.234,56") == 1234.56
    assert parse_valor_br("1000000") == 1000000.0
    assert parse_valor_br("500000,50") == 500000.5
    assert parse_valor_br(" -   ") is None
    assert parse_valor_br("") is None
    assert parse_valor_br(None) is None


def test_indices_colunas_valida_header():
    idx = indices_colunas(["A", "B", "C"], ["A", "C"], "arquivo.csv")
    assert idx == {"A": 0, "B": 1, "C": 2}
    with pytest.raises(ValueError, match="layout mudou"):
        indices_colunas(["A", "B"], ["A", "Z"], "arquivo.csv")


def test_parse_proposta_filtra_natureza_e_alvo():
    out = parse_proposta_csv(_linhas(CSV_PROPOSTA), IBGE_PARA_MID)
    # 101 = OSC (fora); 103 = IBGE fora do alvo
    assert out == {"100": 42, "102": 7}


def test_parse_convenio_agrega_assinados_na_janela():
    proposta = {"100": 42, "102": 7}
    out = parse_convenio_csv(_linhas(CSV_CONVENIO), proposta, anos={2024, 2025})
    assert out.por_municipio_ano == {(42, 2024): {"firmado": 1500000.5, "qtd": 2}}
    assert out.ano_por_proposta == {"100": (42, 2024)}
    # convênio de 2018 entra no mapa p/ desembolso; não-assinado e proposta 999 não
    assert out.mid_por_convenio == {"900001": 42, "900002": 42, "900003": 7}


def test_parse_emenda_atribui_ao_ano_de_assinatura():
    ano_por_proposta = {"100": (42, 2024)}
    out = parse_emenda_csv(_linhas(CSV_EMENDA), ano_por_proposta)
    assert out == {(42, 2024): 400000.25}


def test_parse_desembolso_por_ano_do_desembolso():
    mid_por_convenio = {"900001": 42, "900002": 42, "900003": 7}
    out = parse_desembolso_csv(_linhas(CSV_DESEMBOLSO), mid_por_convenio, anos={2024, 2025})
    assert out == {(42, 2024): 500000.75, (7, 2024): 25000.0}


def test_montar_registros_une_as_tres_fontes():
    convenios = ConveniosParse(
        por_municipio_ano={(42, 2024): {"firmado": 1500000.5, "qtd": 2}},
        ano_por_proposta={"100": (42, 2024)},
        mid_por_convenio={},
    )
    registros = montar_registros(
        convenios,
        via_emenda={(42, 2024): 400000.25},
        desembolsos={(42, 2024): 500000.75, (7, 2024): 25000.0},
    )
    assert registros == [
        {"municipio_id": 7, "ano": 2024, "valor_firmado": 0.0, "qtd_convenios": 0,
         "valor_via_emenda": 0.0, "valor_desembolsado": 25000.0},
        {"municipio_id": 42, "ano": 2024, "valor_firmado": 1500000.5, "qtd_convenios": 2,
         "valor_via_emenda": 400000.25, "valor_desembolsado": 500000.75},
    ]


def test_parse_proposta_header_invalido():
    with pytest.raises(ValueError, match="layout mudou"):
        parse_proposta_csv(_linhas("FOO;BAR\n1;2\n"), IBGE_PARA_MID)


def test_fpm_stn_continua_usando_o_helper():
    from app.services.ingestao_automatica.fpm_stn import _parse_valor
    assert _parse_valor(" 12.281.019,33 ") == 12281019.33
```

- [ ] **Step 2: Rodar para ver falhar**

Run (de `backend/`): `python -m pytest tests/test_captacao_siconv.py -v`
Expected: FAIL com `ModuleNotFoundError: No module named 'app.services.ingestao_automatica.captacao_siconv'` (ou `util`).

- [ ] **Step 3: Criar `backend/app/services/ingestao_automatica/util.py`**

```python
"""Helpers compartilhados das fontes automáticas (CSV bulk)."""
import contextlib
import io
import zipfile

import requests


def parse_valor_br(s) -> float | None:
    """'1.234,56' / '1234,56' / '1234' → float; vazio ou '-' → None."""
    s = (s or "").strip()
    if not s or set(s) <= {"-"}:
        return None
    try:
        return float(s.replace(".", "").replace(",", "."))
    except ValueError:
        return None


def indices_colunas(header: list[str], obrigatorias: list[str], arquivo: str) -> dict[str, int]:
    """Header → {nome: índice}; ValueError audível se o layout do CSV mudou."""
    idx = {(c or "").strip(): i for i, c in enumerate(header)}
    faltando = [c for c in obrigatorias if c not in idx]
    if faltando:
        raise ValueError(f"{arquivo}: colunas ausentes {faltando} — layout mudou?")
    return idx


def baixar_zip(url: str, destino: str, timeout: tuple[int, int] = (30, 600)) -> str:
    """Download em streaming para disco (arquivos de até ~200 MB)."""
    with requests.get(url, stream=True, timeout=timeout,
                      headers={"User-Agent": "Mozilla/5.0"}) as resp:
        resp.raise_for_status()
        with open(destino, "wb") as f:
            for chunk in resp.iter_content(chunk_size=1024 * 1024):
                f.write(chunk)
    return destino


@contextlib.contextmanager
def linhas_zip(caminho: str, encoding: str = "utf-8-sig"):
    """Abre o primeiro CSV do zip como iterador de linhas de texto (streaming —
    nunca carrega o arquivo inteiro em memória). Context manager para fechar
    também o handle do ZIP — senão a limpeza do TemporaryDirectory falha no
    Windows com o arquivo ainda aberto."""
    with zipfile.ZipFile(caminho) as zf:
        nome = zf.namelist()[0]
        with zf.open(nome) as bruto:
            yield io.TextIOWrapper(bruto, encoding=encoding, newline="")
```

- [ ] **Step 4: Criar `backend/app/services/ingestao_automatica/captacao_siconv.py` (parsers)**

```python
"""Fonte automática: captação federal por município (SICONV/Transferegov).

Fonte: repositorio.dados.gov.br/seges/detru/ — CSVs nacionais diários, sem
auth, UTF-8 com BOM, ';'. O join é ID_PROPOSTA (proposta→convênio/emenda) e
NR_CONVENIO (desembolso); o município vem de COD_MUNIC_IBGE na proposta,
filtrando NATUREZA_JURIDICA "Administração Pública Municipal" (captação da
prefeitura, não de ONGs/estado no território). Métrica: VL_REPASSE_CONV dos
convênios assinados (IND_ASSINADO=SIM) no ano da coluna ANO."""
import csv
import logging
from dataclasses import dataclass, field

from app.services.ingestao_automatica.util import indices_colunas, parse_valor_br

logger = logging.getLogger(__name__)

BASE_URL = "http://repositorio.dados.gov.br/seges/detru/"
ANO_INICIO_PADRAO = 2019
NATUREZA_MUNICIPAL = "Administração Pública Municipal"


def parse_proposta_csv(linhas, ibge_para_mid: dict[str, int]) -> dict[str, int]:
    """siconv_proposta.csv → {ID_PROPOSTA: municipio_id}. Mantém só propostas de
    Adm. Pública Municipal dos municípios-alvo — o CSV nacional tem ~750 MB
    descomprimidos, então o dicionário fica pequeno e o resto é descartado."""
    reader = csv.reader(linhas, delimiter=";")
    header = next(reader, None)
    if header is None:
        raise ValueError("siconv_proposta.csv vazio")
    idx = indices_colunas(header, ["ID_PROPOSTA", "COD_MUNIC_IBGE", "NATUREZA_JURIDICA"],
                          "siconv_proposta.csv")
    out: dict[str, int] = {}
    for row in reader:
        try:
            if row[idx["NATUREZA_JURIDICA"]].strip() != NATUREZA_MUNICIPAL:
                continue
            mid = ibge_para_mid.get(row[idx["COD_MUNIC_IBGE"]].strip())
            if mid is not None:
                out[row[idx["ID_PROPOSTA"]].strip()] = mid
        except IndexError:
            continue
    return out


@dataclass
class ConveniosParse:
    # (municipio_id, ano) → {"firmado": soma VL_REPASSE_CONV, "qtd": nº convênios}
    por_municipio_ano: dict = field(default_factory=dict)
    # ID_PROPOSTA → (mid, ano de assinatura) — só assinados na janela (p/ emendas)
    ano_por_proposta: dict = field(default_factory=dict)
    # NR_CONVENIO → mid — todos os assinados, qualquer ano (p/ desembolso)
    mid_por_convenio: dict = field(default_factory=dict)


def parse_convenio_csv(linhas, proposta_para_mid: dict[str, int], anos: set[int]) -> ConveniosParse:
    reader = csv.reader(linhas, delimiter=";")
    header = next(reader, None)
    if header is None:
        raise ValueError("siconv_convenio.csv vazio")
    idx = indices_colunas(header, ["NR_CONVENIO", "ID_PROPOSTA", "ANO", "IND_ASSINADO",
                                   "VL_REPASSE_CONV"], "siconv_convenio.csv")
    out = ConveniosParse()
    for row in reader:
        try:
            id_proposta = row[idx["ID_PROPOSTA"]].strip()
            mid = proposta_para_mid.get(id_proposta)
            if mid is None or row[idx["IND_ASSINADO"]].strip().upper() != "SIM":
                continue
            ano = int(row[idx["ANO"]])
        except (IndexError, ValueError):
            continue
        out.mid_por_convenio[row[idx["NR_CONVENIO"]].strip()] = mid
        if ano not in anos:
            continue
        valor = parse_valor_br(row[idx["VL_REPASSE_CONV"]]) or 0.0
        item = out.por_municipio_ano.setdefault((mid, ano), {"firmado": 0.0, "qtd": 0})
        item["firmado"] += valor
        item["qtd"] += 1
        out.ano_por_proposta[id_proposta] = (mid, ano)
    return out


def parse_emenda_csv(linhas, ano_por_proposta: dict[str, tuple[int, int]]) -> dict[tuple[int, int], float]:
    """siconv_emenda.csv → {(mid, ano de assinatura do convênio): valor via emenda}."""
    reader = csv.reader(linhas, delimiter=";")
    header = next(reader, None)
    if header is None:
        raise ValueError("siconv_emenda.csv vazio")
    idx = indices_colunas(header, ["ID_PROPOSTA", "VALOR_REPASSE_EMENDA"], "siconv_emenda.csv")
    out: dict[tuple[int, int], float] = {}
    for row in reader:
        try:
            destino = ano_por_proposta.get(row[idx["ID_PROPOSTA"]].strip())
        except IndexError:
            continue
        if destino is None:
            continue
        out[destino] = out.get(destino, 0.0) + (parse_valor_br(row[idx["VALOR_REPASSE_EMENDA"]]) or 0.0)
    return out


def parse_desembolso_csv(linhas, mid_por_convenio: dict[str, int], anos: set[int]) -> dict[tuple[int, int], float]:
    """siconv_desembolso.csv → {(mid, ANO_DESEMBOLSO): total desembolsado} —
    dinheiro que ENTROU no ano, inclusive de convênios assinados antes da janela."""
    reader = csv.reader(linhas, delimiter=";")
    header = next(reader, None)
    if header is None:
        raise ValueError("siconv_desembolso.csv vazio")
    idx = indices_colunas(header, ["NR_CONVENIO", "ANO_DESEMBOLSO", "VL_DESEMBOLSADO"],
                          "siconv_desembolso.csv")
    out: dict[tuple[int, int], float] = {}
    for row in reader:
        try:
            mid = mid_por_convenio.get(row[idx["NR_CONVENIO"]].strip())
            if mid is None:
                continue
            ano = int(row[idx["ANO_DESEMBOLSO"]])
        except (IndexError, ValueError):
            continue
        if ano not in anos:
            continue
        out[(mid, ano)] = out.get((mid, ano), 0.0) + (parse_valor_br(row[idx["VL_DESEMBOLSADO"]]) or 0.0)
    return out


def montar_registros(convenios: ConveniosParse,
                     via_emenda: dict[tuple[int, int], float],
                     desembolsos: dict[tuple[int, int], float]) -> list[dict]:
    """Une os agregados em linhas prontas para upsert em CaptacaoFederalAnual."""
    chaves = set(convenios.por_municipio_ano) | set(via_emenda) | set(desembolsos)
    registros = []
    for mid, ano in sorted(chaves):
        conv = convenios.por_municipio_ano.get((mid, ano), {"firmado": 0.0, "qtd": 0})
        registros.append({
            "municipio_id": mid,
            "ano": ano,
            "valor_firmado": round(conv["firmado"], 2),
            "qtd_convenios": conv["qtd"],
            "valor_via_emenda": round(via_emenda.get((mid, ano), 0.0), 2),
            "valor_desembolsado": round(desembolsos.get((mid, ano), 0.0), 2),
        })
    return registros
```

- [ ] **Step 5: Trocar `_parse_valor` do `fpm_stn.py` pelo helper**

Em `backend/app/services/ingestao_automatica/fpm_stn.py`, remover a função `_parse_valor` (linhas 33-40) e adicionar junto aos imports (após `from app.services.ingestao_automatica.base import ...`):

```python
from app.services.ingestao_automatica.util import parse_valor_br as _parse_valor
```

(O teste existente `test_parse_valor_pt_br` importa `_parse_valor` de `fpm_stn` — o alias mantém tudo passando.)

- [ ] **Step 6: Rodar testes**

Run: `python -m pytest tests/test_captacao_siconv.py tests/test_ingestao_automatica.py -v`
Expected: todos PASS (novos + FPM intactos).

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/ingestao_automatica/util.py backend/app/services/ingestao_automatica/captacao_siconv.py backend/app/services/ingestao_automatica/fpm_stn.py backend/tests/test_captacao_siconv.py
git commit -m "feat(captacao): parsers puros do SICONV + helper parse_valor_br compartilhado"
```

---

### Task 3: Núcleo puro do diagnóstico de captação (TDD)

**Files:**
- Create: `backend/app/services/captacao_federal_service.py` (só o núcleo puro nesta task)
- Test: `backend/tests/test_captacao_service.py`

**Interfaces:**
- Consumes: nada (puro).
- Produces:
  - `ANO_INICIO = 2019`
  - `media(valores: list[float]) -> float | None`
  - `posicao_no_grupo(valor: float, valores_pares: list[float]) -> int` (1 = maior captação do grupo; self incluído no total)
  - `montar_diagnostico(municipio_id: int, pares: set[int], nacional: set[int], capt: dict[int, dict[int, dict]], ano_corrente: int) -> dict` — `capt` é `mid → ano → {"firmado","via_emenda","desembolsado","qtd"}`; município do grupo sem entrada em `capt` conta como captação ZERO (o grupo vem da população, não da tabela). Retorna `disponivel=False, motivo="sem_dados"` só quando NENHUM município de `pares | {municipio_id}` tem linha.
  - Payload de sucesso: `{disponivel, motivo, ano_referencia, voce_firmado, via_emenda, desembolsado, qtd_convenios, media_pares, media_nacional, dinheiro_na_mesa, acima_da_media, posicao, total_grupo, serie}`; `serie` = lista por ano `{ano, voce, media_pares, via_emenda, desembolsado, qtd_convenios, parcial}` de `ANO_INICIO` a `ano_corrente` (`parcial=True` só no corrente); `ano_referencia = ano_corrente - 1`.

- [ ] **Step 1: Escrever os testes que falham — `backend/tests/test_captacao_service.py`**

```python
"""Matemática do Dinheiro na Mesa (captação vs. pares) — sem DB."""
from app.services.captacao_federal_service import (
    ANO_INICIO,
    media,
    montar_diagnostico,
    posicao_no_grupo,
)

# capt: mid → ano → valores. Município 1 = "você"; 2 e 3 = pares; 4 = só nacional.
CAPT = {
    1: {2024: {"firmado": 1_100_000.0, "via_emenda": 400_000.0, "desembolsado": 250_000.0, "qtd": 3}},
    2: {2024: {"firmado": 5_000_000.0, "via_emenda": 0.0, "desembolsado": 0.0, "qtd": 5}},
    3: {2024: {"firmado": 3_400_000.0, "via_emenda": 100_000.0, "desembolsado": 0.0, "qtd": 2}},
    4: {2024: {"firmado": 9_000_000.0, "via_emenda": 0.0, "desembolsado": 0.0, "qtd": 9}},
}


def test_media_e_posicao():
    assert media([4.0, 2.0]) == 3.0
    assert media([]) is None
    assert posicao_no_grupo(1_100_000.0, [5_000_000.0, 3_400_000.0]) == 3
    assert posicao_no_grupo(6_000_000.0, [5_000_000.0, 3_400_000.0]) == 1


def test_diagnostico_basico_abaixo_dos_pares():
    d = montar_diagnostico(1, pares={2, 3}, nacional={2, 3, 4}, capt=CAPT, ano_corrente=2025)
    assert d["disponivel"] is True
    assert d["ano_referencia"] == 2024
    assert d["voce_firmado"] == 1_100_000.0
    assert d["media_pares"] == 4_200_000.0          # (5M + 3.4M) / 2
    assert d["media_nacional"] == 5_800_000.0       # (5M + 3.4M + 9M) / 3
    assert d["dinheiro_na_mesa"] == 3_100_000.0
    assert d["acima_da_media"] is False
    assert d["posicao"] == 3
    assert d["total_grupo"] == 3                    # 2 pares + você


def test_diagnostico_acima_dos_pares_zera_dinheiro_na_mesa():
    capt = {1: {2024: {"firmado": 9e6, "via_emenda": 0.0, "desembolsado": 0.0, "qtd": 1}},
            2: {2024: {"firmado": 1e6, "via_emenda": 0.0, "desembolsado": 0.0, "qtd": 1}}}
    d = montar_diagnostico(1, pares={2}, nacional={2}, capt=capt, ano_corrente=2025)
    assert d["acima_da_media"] is True
    assert d["dinheiro_na_mesa"] == 0.0
    assert d["posicao"] == 1


def test_par_sem_linha_conta_como_zero():
    # município 3 sem NENHUMA linha: média dos pares = (5M + 0) / 2
    capt = {1: CAPT[1], 2: CAPT[2]}
    d = montar_diagnostico(1, pares={2, 3}, nacional={2, 3}, capt=capt, ano_corrente=2025)
    assert d["media_pares"] == 2_500_000.0


def test_serie_cobre_janela_e_marca_parcial():
    d = montar_diagnostico(1, pares={2, 3}, nacional=set(), capt=CAPT, ano_corrente=2025)
    anos = [item["ano"] for item in d["serie"]]
    assert anos == list(range(ANO_INICIO, 2026))
    assert all(item["parcial"] is (item["ano"] == 2025) for item in d["serie"])
    item_2024 = next(i for i in d["serie"] if i["ano"] == 2024)
    assert item_2024["voce"] == 1_100_000.0
    assert item_2024["media_pares"] == 4_200_000.0
    assert item_2024["via_emenda"] == 400_000.0
    # ano sem dados: tudo zero, média zero (pares existem mas sem linhas)
    item_2019 = next(i for i in d["serie"] if i["ano"] == 2019)
    assert item_2019["voce"] == 0.0
    assert item_2019["media_pares"] == 0.0


def test_sem_pares_media_none():
    d = montar_diagnostico(1, pares=set(), nacional=set(), capt={1: CAPT[1]}, ano_corrente=2025)
    assert d["disponivel"] is True
    assert d["media_pares"] is None
    assert d["dinheiro_na_mesa"] == 0.0
    assert d["acima_da_media"] is False
    assert d["total_grupo"] == 1


def test_grupo_inteiro_sem_dados():
    d = montar_diagnostico(1, pares={2, 3}, nacional=set(), capt={}, ano_corrente=2025)
    assert d["disponivel"] is False
    assert d["motivo"] == "sem_dados"
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `python -m pytest tests/test_captacao_service.py -v`
Expected: FAIL com `ModuleNotFoundError: No module named 'app.services.captacao_federal_service'`.

- [ ] **Step 3: Criar `backend/app/services/captacao_federal_service.py` (núcleo puro)**

```python
"""Dinheiro na Mesa — captação federal vs. municípios pares.

Pares = mesma faixa populacional do FPM (DL 1.881/81) + mesma UF; média
nacional da mesma faixa como referência secundária. Métrica principal:
valor firmado (VL_REPASSE_CONV) no último ano civil completo. Município do
grupo sem linha de captação = captação zero (o grupo vem da população)."""

ANO_INICIO = 2019

_CAMPOS_VAZIOS = {
    "disponivel": False, "motivo": None, "nao_aplicavel": False,
    "ano_referencia": None, "voce_firmado": None, "via_emenda": None,
    "desembolsado": None, "qtd_convenios": None, "media_pares": None,
    "media_nacional": None, "dinheiro_na_mesa": None, "acima_da_media": None,
    "posicao": None, "total_grupo": None, "serie": [],
    "uf": None, "faixa_pop_min": None, "faixa_pop_max": None, "coeficiente": None,
}


def media(valores: list) -> float | None:
    return (sum(valores) / len(valores)) if valores else None


def posicao_no_grupo(valor: float, valores_pares: list) -> int:
    """Posição no ranking de captação do grupo (1 = maior; o próprio incluído)."""
    return 1 + sum(1 for v in valores_pares if v > valor)


def montar_diagnostico(municipio_id: int, pares: set, nacional: set,
                       capt: dict, ano_corrente: int) -> dict:
    """Núcleo puro do diagnóstico. `capt`: mid → ano → {"firmado","via_emenda",
    "desembolsado","qtd"}. Ver docstring do módulo para a semântica de zero."""
    if not any(capt.get(m) for m in (pares | {municipio_id})):
        return {**_CAMPOS_VAZIOS, "motivo": "sem_dados"}

    def _valor(mid, ano, campo="firmado"):
        return (capt.get(mid) or {}).get(ano, {}).get(campo, 0.0) or 0.0

    anos = list(range(ANO_INICIO, ano_corrente + 1))
    ano_ref = ano_corrente - 1

    serie = []
    for ano in anos:
        vals_pares = [_valor(m, ano) for m in pares]
        m_pares = media(vals_pares)
        serie.append({
            "ano": ano,
            "voce": _valor(municipio_id, ano),
            "media_pares": round(m_pares, 2) if m_pares is not None else None,
            "via_emenda": _valor(municipio_id, ano, "via_emenda"),
            "desembolsado": _valor(municipio_id, ano, "desembolsado"),
            "qtd_convenios": int(_valor(municipio_id, ano, "qtd")),
            "parcial": ano == ano_corrente,
        })

    voce_ref = _valor(municipio_id, ano_ref)
    pares_ref = [_valor(m, ano_ref) for m in pares]
    nacional_ref = [_valor(m, ano_ref) for m in nacional]
    media_pares = media(pares_ref)
    media_nacional = media(nacional_ref)
    delta = (media_pares - voce_ref) if media_pares is not None else None
    return {
        **_CAMPOS_VAZIOS,
        "disponivel": True,
        "ano_referencia": ano_ref,
        "voce_firmado": voce_ref,
        "via_emenda": _valor(municipio_id, ano_ref, "via_emenda"),
        "desembolsado": _valor(municipio_id, ano_ref, "desembolsado"),
        "qtd_convenios": int(_valor(municipio_id, ano_ref, "qtd")),
        "media_pares": round(media_pares, 2) if media_pares is not None else None,
        "media_nacional": round(media_nacional, 2) if media_nacional is not None else None,
        "dinheiro_na_mesa": round(delta, 2) if delta is not None and delta > 0 else 0.0,
        "acima_da_media": bool(delta is not None and delta <= 0),
        "posicao": posicao_no_grupo(voce_ref, pares_ref),
        "total_grupo": len(pares) + 1,
        "serie": serie,
    }
```

- [ ] **Step 4: Rodar testes**

Run: `python -m pytest tests/test_captacao_service.py -v`
Expected: todos PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/captacao_federal_service.py backend/tests/test_captacao_service.py
git commit -m "feat(captacao): nucleo puro do diagnostico dinheiro-na-mesa (pares por faixa FPM + UF)"
```

---

### Task 4: Camada DB do diagnóstico + notificações de captação

**Files:**
- Modify: `backend/app/services/captacao_federal_service.py` (append no fim do arquivo)

**Interfaces:**
- Consumes: `montar_diagnostico`, `media` (Task 3); `fpm_service.faixa_para_populacao`, `fpm_service.CAPITAIS_IBGE`; models `CaptacaoFederalAnual`, `PopulacaoMunicipio`, `Municipio`, `Notificacao`.
- Produces:
  - `calcular_diagnostico(db, municipio_id) -> dict` (payload completo, incl. `uf`, `faixa_pop_min`, `faixa_pop_max`, `coeficiente`; motivos: `municipio_nao_encontrado | sem_codigo_ibge | capital | sem_populacao | sem_dados`)
  - `calcular_resumo(db, municipio_id) -> dict` (subset: `disponivel, motivo, ano_referencia, voce_firmado, media_pares, dinheiro_na_mesa, acima_da_media, total_grupo`)
  - `gerar_notificacoes_captacao(db, municipio_ids: list[int], usuario_id: int) -> int` (primeira carga por município; batched)

- [ ] **Step 1: Append da camada DB em `captacao_federal_service.py`**

Colar no fim do arquivo (padrão do `fpm_service.py` — camada fina, verificada via endpoints; sem teste unitário por decisão de projeto):

```python
# ── camada DB (fina; verificada via endpoints) ───────────────────────────────
from sqlalchemy.orm import Session

from app.services.fpm_service import CAPITAIS_IBGE, faixa_para_populacao


def _base_grupos(db: "Session"):
    """2 queries batched: última população por município ativo (com UF, código
    IBGE e flag demo) e todas as linhas de captação da janela."""
    from app.models.captacao_federal import CaptacaoFederalAnual
    from app.models.municipio import Municipio
    from app.models.populacao import PopulacaoMunicipio

    pop_rows = (
        db.query(PopulacaoMunicipio.municipio_id, PopulacaoMunicipio.ano,
                 PopulacaoMunicipio.populacao, Municipio.estado,
                 Municipio.codigo_ibge, Municipio.is_demo)
        .join(Municipio, Municipio.id == PopulacaoMunicipio.municipio_id)
        .filter(Municipio.ativo.is_(True))
        .all()
    )
    ultimo: dict[int, tuple] = {}   # mid → (ano, pop, uf, ibge, is_demo)
    for mid, ano, pop, uf, ibge, is_demo in pop_rows:
        if mid not in ultimo or ano > ultimo[mid][0]:
            ultimo[mid] = (ano, pop, uf, ibge, is_demo)

    capt_rows = (
        db.query(CaptacaoFederalAnual)
        .filter(CaptacaoFederalAnual.ano >= ANO_INICIO)
        .all()
    )
    capt: dict[int, dict[int, dict]] = {}
    for r in capt_rows:
        capt.setdefault(r.municipio_id, {})[r.ano] = {
            "firmado": float(r.valor_firmado), "via_emenda": float(r.valor_via_emenda),
            "desembolsado": float(r.valor_desembolsado), "qtd": r.qtd_convenios,
        }
    return ultimo, capt


def _pares_de(municipio_id: int, ultimo: dict):
    """(meta faixa/uf, pares mesma faixa+UF, nacional mesma faixa) — exclui o
    próprio município, capitais e municípios demo dos grupos."""
    _, pop, uf, _, _ = ultimo[municipio_id]
    faixa = faixa_para_populacao(pop)
    pares, nacional = set(), set()
    for mid, (_, p, u, ibge, is_demo) in ultimo.items():
        if mid == municipio_id or is_demo or (ibge or "") in CAPITAIS_IBGE:
            continue
        if faixa_para_populacao(p).indice != faixa.indice:
            continue
        nacional.add(mid)
        if u == uf:
            pares.add(mid)
    return {"faixa": faixa, "uf": uf}, pares, nacional


def calcular_diagnostico(db: "Session", municipio_id: int) -> dict:
    from datetime import date

    from app.models.municipio import Municipio

    municipio = db.get(Municipio, municipio_id)
    if municipio is None:
        return {**_CAMPOS_VAZIOS, "motivo": "municipio_nao_encontrado"}
    if not municipio.codigo_ibge:
        return {**_CAMPOS_VAZIOS, "motivo": "sem_codigo_ibge"}
    if municipio.codigo_ibge in CAPITAIS_IBGE:
        return {**_CAMPOS_VAZIOS, "motivo": "capital", "nao_aplicavel": True}

    ultimo, capt = _base_grupos(db)
    if municipio_id not in ultimo:
        return {**_CAMPOS_VAZIOS, "motivo": "sem_populacao"}

    meta, pares, nacional = _pares_de(municipio_id, ultimo)
    diag = montar_diagnostico(municipio_id, pares, nacional, capt, date.today().year)
    faixa = meta["faixa"]
    return {**diag, "uf": meta["uf"], "faixa_pop_min": faixa.pop_min,
            "faixa_pop_max": faixa.pop_max, "coeficiente": faixa.coeficiente}


_CHAVES_RESUMO = ("disponivel", "motivo", "ano_referencia", "voce_firmado",
                  "media_pares", "dinheiro_na_mesa", "acima_da_media", "total_grupo")


def calcular_resumo(db: "Session", municipio_id: int) -> dict:
    diag = calcular_diagnostico(db, municipio_id)
    return {k: diag[k] for k in _CHAVES_RESUMO}


def _fmt_moeda(v: float) -> str:
    if abs(v) >= 1e6:
        milhoes = f"{v / 1e6:.1f}".replace(".", ",")
        return f"R$ {milhoes} milhões"
    return "R$ " + f"{v:,.0f}".replace(",", ".")


def gerar_notificacoes_captacao(db: "Session", municipio_ids: list, usuario_id: int) -> int:
    """Notificação única na primeira carga do diagnóstico por município (padrão
    gerar_notificacoes_fpm): warning se abaixo da média dos pares, success se
    acima. Batched: grupos e captação carregados uma vez para todos os mids."""
    from datetime import date

    from app.models.notificacao import Notificacao

    existentes = db.query(Notificacao).filter(Notificacao.titulo.like("Captação%")).all()
    ja_notificados = {
        n.municipio_ids[0] for n in existentes
        if n.municipio_ids and len(n.municipio_ids) == 1
    }

    ultimo, capt = _base_grupos(db)
    ano_corrente = date.today().year
    criadas = 0
    for mid in municipio_ids:
        if mid in ja_notificados or mid not in ultimo:
            continue
        if (ultimo[mid][3] or "") in CAPITAIS_IBGE:
            continue
        _, pares, nacional = _pares_de(mid, ultimo)
        diag = montar_diagnostico(mid, pares, nacional, capt, ano_corrente)
        if not diag["disponivel"] or diag["media_pares"] is None:
            continue
        if diag["acima_da_media"]:
            tipo = "success"
            titulo = "Captação federal: acima da média dos pares"
            mensagem = (
                f"Em {diag['ano_referencia']}, municípios do seu porte captaram em média "
                f"{_fmt_moeda(diag['media_pares'])} em convênios federais; o seu captou "
                f"{_fmt_moeda(diag['voce_firmado'])}. Veja a página Dinheiro na Mesa."
            )
        else:
            tipo = "warning"
            titulo = f"Captação federal: {_fmt_moeda(diag['dinheiro_na_mesa'])} na mesa"
            mensagem = (
                f"Em {diag['ano_referencia']}, municípios do seu porte captaram em média "
                f"{_fmt_moeda(diag['media_pares'])} em convênios federais; o seu captou "
                f"{_fmt_moeda(diag['voce_firmado'])}. Veja a página Dinheiro na Mesa."
            )
        db.add(Notificacao(titulo=titulo, mensagem=mensagem, tipo=tipo,
                           municipio_ids=[mid], criado_por=usuario_id))
        criadas += 1
    if criadas:
        db.commit()
    return criadas
```

- [ ] **Step 2: Rodar a suíte inteira (import sanity)**

Run: `python -m pytest`
Expected: todos PASS (a camada DB não tem teste próprio — regra do projeto).

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/captacao_federal_service.py
git commit -m "feat(captacao): camada DB batched do diagnostico + notificacao de primeira carga"
```

---

### Task 5: Fonte automática `captacao_federal` (download + upsert)

**Files:**
- Modify: `backend/app/services/ingestao_automatica/captacao_siconv.py` (append `executar` + `registrar`)
- Modify: `backend/app/services/ingestao_automatica/__init__.py`

**Interfaces:**
- Consumes: parsers da Task 2; `util.baixar_zip`, `util.linhas_zip`; `populacao_ibge.codigo_ibge_valido`; `captacao_federal_service.gerar_notificacoes_captacao`; model `CaptacaoFederalAnual`.
- Produces: fonte `captacao_federal` registrada em `FONTES_AUTOMATICAS` (aparece sozinha no `/admin/fontes`), `executar(db, municipios, anos=None, usuario_id=None, notificar=True) -> ResumoIngestao`.

- [ ] **Step 1: Append em `captacao_siconv.py`**

Adicionar aos imports do topo:

```python
import os
import tempfile
from datetime import date

from app.services.ingestao_automatica.base import FonteAutomatica, ResumoIngestao, registrar
from app.services.ingestao_automatica.util import baixar_zip, linhas_zip
```

E no fim do arquivo:

```python
def executar(db, municipios, anos=None, usuario_id=None, notificar=True) -> ResumoIngestao:
    """Baixa os 4 CSVs nacionais do SICONV, agrega por município/ano e faz
    upsert em CaptacaoFederalAnual com commit em lote por UF. Município sem
    convênio na janela simplesmente não ganha linha (captação zero é dado,
    não erro). IMPORTANTE (operação): o diagnóstico de pares compara a UF
    inteira — executar sempre por UF completa ou nacional."""
    from app.models.captacao_federal import CaptacaoFederalAnual
    from app.services.ingestao_automatica.populacao_ibge import codigo_ibge_valido

    resumo = ResumoIngestao(dataset="captacao_federal")
    alvo: dict[str, int] = {}
    uf_por_mid: dict[int, str] = {}
    for m in municipios:
        if codigo_ibge_valido(m.codigo_ibge):
            alvo[m.codigo_ibge.strip()] = m.id
            uf_por_mid[m.id] = m.estado
        else:
            resumo.municipios_erro += 1
            resumo.erros.append(f"{m.nome}/{m.estado}: codigo_ibge ausente/inválido")
    if not alvo:
        return resumo

    if not anos:
        anos = range(ANO_INICIO_PADRAO, date.today().year + 1)
    anos = set(anos)

    with tempfile.TemporaryDirectory(prefix="siconv_") as pasta:
        def _abrir(arquivo):
            caminho = baixar_zip(BASE_URL + arquivo, os.path.join(pasta, arquivo))
            return linhas_zip(caminho)

        with _abrir("siconv_proposta.csv.zip") as linhas:
            proposta_para_mid = parse_proposta_csv(linhas, alvo)
        with _abrir("siconv_convenio.csv.zip") as linhas:
            convenios = parse_convenio_csv(linhas, proposta_para_mid, anos)
        with _abrir("siconv_emenda.csv.zip") as linhas:
            via_emenda = parse_emenda_csv(linhas, convenios.ano_por_proposta)
        with _abrir("siconv_desembolso.csv.zip") as linhas:
            desembolsos = parse_desembolso_csv(linhas, convenios.mid_por_convenio, anos)

    registros = montar_registros(convenios, via_emenda, desembolsos)
    por_mid: dict[int, list[dict]] = {}
    for reg in registros:
        por_mid.setdefault(reg["municipio_id"], []).append(reg)

    mids_por_uf: dict[str, list[int]] = {}
    for mid in por_mid:
        mids_por_uf.setdefault(uf_por_mid[mid], []).append(mid)

    for uf in sorted(mids_por_uf):
        mids = mids_por_uf[uf]
        existentes = {
            (r.municipio_id, r.ano): r
            for r in db.query(CaptacaoFederalAnual)
            .filter(CaptacaoFederalAnual.municipio_id.in_(mids))
            .all()
        }
        for mid in mids:
            for reg in por_mid[mid]:
                atual = existentes.get((mid, reg["ano"]))
                if atual:
                    atual.valor_firmado = reg["valor_firmado"]
                    atual.valor_desembolsado = reg["valor_desembolsado"]
                    atual.valor_via_emenda = reg["valor_via_emenda"]
                    atual.qtd_convenios = reg["qtd_convenios"]
                else:
                    db.add(CaptacaoFederalAnual(**reg))
                resumo.linhas += 1
        db.commit()

    # todos os alvos válidos foram processados; sem linha = captação zero
    resumo.municipios_ok = len(uf_por_mid)

    if notificar and usuario_id:
        from app.services.captacao_federal_service import gerar_notificacoes_captacao

        resumo.notificacoes = gerar_notificacoes_captacao(db, list(uf_por_mid), usuario_id)
    return resumo


registrar(FonteAutomatica(
    key="captacao_federal",
    label="Captação Federal — convênios (SICONV)",
    fonte="Transferegov/SICONV — Transferências discricionárias e legais (repasse federal firmado)",
    executar=executar,
))
```

- [ ] **Step 2: Registrar no `__init__.py` do pacote**

Em `backend/app/services/ingestao_automatica/__init__.py`, após `from app.services.ingestao_automatica import fpm_stn  # noqa: F401`:

```python
from app.services.ingestao_automatica import captacao_siconv  # noqa: F401
```

- [ ] **Step 3: Rodar suíte + smoke de import**

Run: `python -m pytest`
Expected: todos PASS.

Run: `python -c "from app.services.ingestao_automatica import FONTES_AUTOMATICAS; print(sorted(FONTES_AUTOMATICAS))"`
Expected: `['captacao_federal', 'fpm', 'populacao']`.

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/ingestao_automatica/captacao_siconv.py backend/app/services/ingestao_automatica/__init__.py
git commit -m "feat(captacao): fonte automatica captacao_federal (SICONV) na esteira FONTES_AUTOMATICAS"
```

---

### Task 6: Schemas + router `/captacao-federal`

**Files:**
- Create: `backend/app/schemas/captacao_federal.py`
- Create: `backend/app/api/v1/routers/captacao_federal.py`
- Modify: `backend/app/main.py` (import + include, junto do bloco existente linhas 83-113)

**Interfaces:**
- Consumes: `calcular_diagnostico`, `calcular_resumo` (Task 4); `deps.municipio_scope`, `deps.scoped_modulo`.
- Produces: `GET /api/v1/captacao-federal/resumo` (livre), `GET /api/v1/captacao-federal/diagnostico` e `GET /api/v1/captacao-federal/serie` (gateados pelo módulo `captacao_federal`). O frontend (Tasks 11/13) consome esses três.

- [ ] **Step 1: Criar `backend/app/schemas/captacao_federal.py`**

```python
from pydantic import BaseModel


class CaptacaoAnoItem(BaseModel):
    ano: int
    voce: float = 0.0
    media_pares: float | None = None
    via_emenda: float = 0.0
    desembolsado: float = 0.0
    qtd_convenios: int = 0
    parcial: bool = False


class CaptacaoResumo(BaseModel):
    """Headline livre (card do Painel do Prefeito) — decisão de produto: o
    teaser é livre; o detalhe é gateado pelo módulo `captacao_federal`."""
    disponivel: bool
    motivo: str | None = None   # selecione_municipio | municipio_nao_encontrado | sem_codigo_ibge | capital | sem_populacao | sem_dados
    ano_referencia: int | None = None
    voce_firmado: float | None = None
    media_pares: float | None = None
    dinheiro_na_mesa: float | None = None
    acima_da_media: bool | None = None
    total_grupo: int | None = None


class CaptacaoDiagnostico(CaptacaoResumo):
    nao_aplicavel: bool = False
    via_emenda: float | None = None
    desembolsado: float | None = None
    qtd_convenios: int | None = None
    media_nacional: float | None = None
    posicao: int | None = None
    uf: str | None = None
    faixa_pop_min: int | None = None
    faixa_pop_max: int | None = None
    coeficiente: float | None = None
    serie: list[CaptacaoAnoItem] = []


class CaptacaoSerie(BaseModel):
    serie: list[CaptacaoAnoItem] = []
```

- [ ] **Step 2: Criar `backend/app/api/v1/routers/captacao_federal.py`**

```python
from app.api.deps import get_db, municipio_scope, scoped_modulo
from app.schemas.captacao_federal import CaptacaoDiagnostico, CaptacaoResumo, CaptacaoSerie
from app.services.captacao_federal_service import calcular_diagnostico, calcular_resumo
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

# Híbrido (decisão de produto): /resumo é livre (teaser no Painel do Prefeito);
# /diagnostico e /serie exigem o módulo "captacao_federal" no plano.
router = APIRouter(prefix="/captacao-federal", tags=["Captação Federal"])


@router.get("/resumo", response_model=CaptacaoResumo)
def resumo_captacao(
    mid: int | None = Depends(municipio_scope),
    db: Session = Depends(get_db),
):
    if mid is None:
        return CaptacaoResumo(disponivel=False, motivo="selecione_municipio")
    return CaptacaoResumo(**calcular_resumo(db, mid))


@router.get("/diagnostico", response_model=CaptacaoDiagnostico)
def diagnostico_captacao(
    mid: int | None = Depends(scoped_modulo("captacao_federal")),
    db: Session = Depends(get_db),
):
    if mid is None:
        return CaptacaoDiagnostico(disponivel=False, motivo="selecione_municipio")
    return CaptacaoDiagnostico(**calcular_diagnostico(db, mid))


@router.get("/serie", response_model=CaptacaoSerie)
def serie_captacao(
    mid: int | None = Depends(scoped_modulo("captacao_federal")),
    db: Session = Depends(get_db),
):
    if mid is None:
        return CaptacaoSerie()
    return CaptacaoSerie(serie=calcular_diagnostico(db, mid)["serie"])
```

- [ ] **Step 3: Registrar no `backend/app/main.py`**

No bloco de imports dos routers (`from app.api.v1.routers import (...)`), adicionar `captacao_federal` à lista. Depois, após a linha `app.include_router(ingestao_automatica.router, prefix=API_PREFIX)` (linha 90):

```python
app.include_router(captacao_federal.router, prefix=API_PREFIX)
```

- [ ] **Step 4: Smoke de import + suíte**

Run: `python -c "from app.main import app; print([r.path for r in app.routes if 'captacao' in r.path])"`
Expected: `['/api/v1/captacao-federal/resumo', '/api/v1/captacao-federal/diagnostico', '/api/v1/captacao-federal/serie']`.

Run: `python -m pytest`
Expected: todos PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/captacao_federal.py backend/app/api/v1/routers/captacao_federal.py backend/app/main.py
git commit -m "feat(captacao): endpoints /captacao-federal (resumo livre + diagnostico/serie gateados)"
```

---

### Task 7: Parser do CSV de emendas do Portal (TDD)

**Files:**
- Create: `backend/app/services/ingestao_automatica/emendas_portal.py` (só parser nesta task)
- Test: `backend/tests/test_emendas_portal.py`

**Interfaces:**
- Consumes: `util.indices_colunas`, `util.parse_valor_br`.
- Produces:
  - `URL_EMENDAS = "https://portaldatransparencia.gov.br/download-de-dados/emendas-parlamentares/UNICO"`
  - `parse_emendas_csv(linhas, ibge_para_mid: dict[str, int], anos: set[int] | None = None) -> dict[int, dict[str, dict]]` — `{mid: {codigo_emenda: registro}}`; registro tem exatamente as colunas do model `EmendaParlamentar` (menos `municipio_id`): `{ano, codigo_emenda, numero_emenda, autor, tipo_emenda, funcao, valor_empenhado, valor_liquidado, valor_pago, valor_resto_pago}`.
  - Agrega múltiplas linhas (ações orçamentárias) da mesma emenda; `funcao` = a de maior empenho; linhas sem código IBGE municipal no alvo são ignoradas; código "Sem informação" vira chave sintética `SI-{ano}-{autor}-{numero}`.

- [ ] **Step 1: Escrever os testes que falham — `backend/tests/test_emendas_portal.py`**

```python
"""Parser puro do CSV de emendas do Portal da Transparência — sem rede, sem DB.
Header copiado do EmendasParlamentares.csv real (download-de-dados, 2026-07-07)."""
import io

import pytest

from app.services.ingestao_automatica.emendas_portal import parse_emendas_csv

HEADER = (
    '"Código da Emenda";"Ano da Emenda";"Tipo de Emenda";"Código do Autor da Emenda";'
    '"Nome do Autor da Emenda";"Número da emenda";"Localidade de aplicação do recurso";'
    '"Código Município IBGE";"Município";"Código UF IBGE";"UF";"Região";"Código Função";'
    '"Nome Função";"Código Subfunção";"Nome Subfunção";"Código Programa";"Nome Programa";'
    '"Código Ação";"Nome Ação";"Código Plano Orçamentário";"Nome Plano Orçamentário";'
    '"Valor Empenhado";"Valor Liquidado";"Valor Pago";"Valor Restos A Pagar Inscritos";'
    '"Valor Restos A Pagar Cancelados";"Valor Restos A Pagar Pagos"'
)


def _linha(codigo, ano, tipo, autor, numero, ibge, municipio, funcao,
           empenhado, liquidado, pago, resto_pago):
    return (
        f'"{codigo}";"{ano}";"{tipo}";"S/I";"{autor}";"{numero}";"{municipio} - MG";'
        f'"{ibge}";"{municipio}";"3100000";"MINAS GERAIS";"Sudeste";"10";"{funcao}";'
        f'"301";"sub";"2015";"prog";"8581";"acao";"0000";"po";'
        f'"{empenhado}";"{liquidado}";"{pago}";"0,00";"0,00";"{resto_pago}"'
    )


IBGE_PARA_MID = {"3126109": 42}


def _csv(*linhas):
    return io.StringIO("\n".join([HEADER, *linhas]) + "\n")


def test_agrega_linhas_da_mesma_emenda_e_escolhe_funcao_dominante():
    texto = _csv(
        _linha("202638110001", 2026, "Emenda Individual - Transferências com Finalidade Definida",
               "DEPUTADO X", "38110001", "3126109", "FORMIGA", "Saúde",
               "100000,00", "50000,00", "40000,00", "10000,00"),
        _linha("202638110001", 2026, "Emenda Individual - Transferências com Finalidade Definida",
               "DEPUTADO X", "38110001", "3126109", "FORMIGA", "Urbanismo",
               "300000,00", "0,00", "0,00", "0,00"),
    )
    out = parse_emendas_csv(texto, IBGE_PARA_MID)
    assert set(out) == {42}
    reg = out[42]["202638110001"]
    assert reg["ano"] == 2026
    assert reg["autor"] == "DEPUTADO X"
    assert reg["valor_empenhado"] == 400000.0
    assert reg["valor_liquidado"] == 50000.0
    assert reg["valor_pago"] == 40000.0
    assert reg["valor_resto_pago"] == 10000.0
    assert reg["funcao"] == "Urbanismo"          # maior empenho
    assert reg["numero_emenda"] == "38110001"


def test_ignora_municipio_fora_do_alvo_e_filtra_anos():
    texto = _csv(
        _linha("202511110001", 2025, "Emenda de Bancada", "BANCADA MG", "11110001",
               "3126109", "FORMIGA", "Saúde", "10,00", "0,00", "0,00", "0,00"),
        _linha("202411110002", 2024, "Emenda de Bancada", "BANCADA MG", "11110002",
               "3126109", "FORMIGA", "Saúde", "20,00", "0,00", "0,00", "0,00"),
        _linha("202511110003", 2025, "Emenda de Bancada", "BANCADA SP", "11110003",
               "3550308", "SAO PAULO", "Saúde", "30,00", "0,00", "0,00", "0,00"),
    )
    out = parse_emendas_csv(texto, IBGE_PARA_MID, anos={2025})
    assert set(out[42]) == {"202511110001"}


def test_codigo_sem_informacao_gera_chave_sintetica():
    texto = _csv(
        _linha("Sem informação", 2025, "Emenda Individual", "DEPUTADA Y", "222",
               "3126109", "FORMIGA", "Saúde", "5,00", "0,00", "0,00", "0,00"),
    )
    out = parse_emendas_csv(texto, IBGE_PARA_MID)
    assert set(out[42]) == {"SI-2025-DEPUTADA Y-222"}


def test_header_invalido_falha_audivel():
    with pytest.raises(ValueError, match="layout mudou"):
        parse_emendas_csv(io.StringIO('"FOO";"BAR"\n"1";"2"\n'), IBGE_PARA_MID)
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `python -m pytest tests/test_emendas_portal.py -v`
Expected: FAIL com `ModuleNotFoundError: No module named 'app.services.ingestao_automatica.emendas_portal'`.

- [ ] **Step 3: Criar `backend/app/services/ingestao_automatica/emendas_portal.py`**

```python
"""Fonte automática: emendas parlamentares por município (Portal da Transparência).

Fonte: download-de-dados/emendas-parlamentares/UNICO — zip único (~32 MB) com
EmendasParlamentares.csv (latin-1, ';', campos entre aspas), uma linha por
emenda×ação orçamentária×localidade. Traz "Código Município IBGE" nativo (zero
fuzzy matching) e, desde mai/2026, a execução das emendas Pix (transferências
especiais). Linhas sem código municipal (localidade Nacional/UF) ficam fora —
o total municipal é um piso. Agregamos por (município, código da emenda)."""
import csv
import logging

from app.services.ingestao_automatica.util import indices_colunas, parse_valor_br

logger = logging.getLogger(__name__)

URL_EMENDAS = "https://portaldatransparencia.gov.br/download-de-dados/emendas-parlamentares/UNICO"
ANO_INICIO_PADRAO = 2019

_COLS = ["Código da Emenda", "Ano da Emenda", "Tipo de Emenda", "Nome do Autor da Emenda",
         "Número da emenda", "Código Município IBGE", "Nome Função",
         "Valor Empenhado", "Valor Liquidado", "Valor Pago", "Valor Restos A Pagar Pagos"]


def parse_emendas_csv(linhas, ibge_para_mid: dict[str, int],
                      anos: set[int] | None = None) -> dict[int, dict[str, dict]]:
    """CSV do Portal → {mid: {codigo_emenda: registro}} (registro = colunas do
    model EmendaParlamentar, sem municipio_id). Ver docstring do módulo."""
    reader = csv.reader(linhas, delimiter=";")
    header = next(reader, None)
    if header is None:
        raise ValueError("EmendasParlamentares.csv vazio")
    idx = indices_colunas(header, _COLS, "EmendasParlamentares.csv")

    out: dict[int, dict[str, dict]] = {}
    funcoes: dict[tuple[int, str], dict[str, float]] = {}
    for row in reader:
        try:
            mid = ibge_para_mid.get(row[idx["Código Município IBGE"]].strip())
            if mid is None:
                continue
            ano = int(row[idx["Ano da Emenda"]])
        except (IndexError, ValueError):
            continue
        if anos and ano not in anos:
            continue

        autor = row[idx["Nome do Autor da Emenda"]].strip()
        numero = row[idx["Número da emenda"]].strip()
        codigo = row[idx["Código da Emenda"]].strip()
        if not codigo or codigo.lower() == "sem informação":
            codigo = f"SI-{ano}-{autor}-{numero}"

        reg = out.setdefault(mid, {}).get(codigo)
        if reg is None:
            reg = {
                "ano": ano, "codigo_emenda": codigo,
                "numero_emenda": (numero if numero and numero.upper() != "S/I" else None),
                "autor": autor,
                "tipo_emenda": row[idx["Tipo de Emenda"]].strip(),
                "funcao": None,
                "valor_empenhado": 0.0, "valor_liquidado": 0.0,
                "valor_pago": 0.0, "valor_resto_pago": 0.0,
            }
            out[mid][codigo] = reg
        for campo, col in (("valor_empenhado", "Valor Empenhado"),
                           ("valor_liquidado", "Valor Liquidado"),
                           ("valor_pago", "Valor Pago"),
                           ("valor_resto_pago", "Valor Restos A Pagar Pagos")):
            reg[campo] += parse_valor_br(row[idx[col]]) or 0.0

        funcao = row[idx["Nome Função"]].strip()
        if funcao:
            chave = (mid, codigo)
            empenho_linha = parse_valor_br(row[idx["Valor Empenhado"]]) or 0.0
            funcoes.setdefault(chave, {})
            funcoes[chave][funcao] = funcoes[chave].get(funcao, 0.0) + empenho_linha

    for (mid, codigo), por_funcao in funcoes.items():
        out[mid][codigo]["funcao"] = max(por_funcao, key=por_funcao.get)
    for regs in out.values():
        for reg in regs.values():
            for campo in ("valor_empenhado", "valor_liquidado", "valor_pago", "valor_resto_pago"):
                reg[campo] = round(reg[campo], 2)
    return out
```

- [ ] **Step 4: Rodar testes**

Run: `python -m pytest tests/test_emendas_portal.py -v`
Expected: todos PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ingestao_automatica/emendas_portal.py backend/tests/test_emendas_portal.py
git commit -m "feat(emendas): parser puro do CSV de emendas do Portal (codigo IBGE nativo)"
```

---

### Task 8: Service do radar de emendas (TDD no núcleo puro)

**Files:**
- Create: `backend/app/services/emendas_service.py`
- Test: `backend/tests/test_emendas_service.py`

**Interfaces:**
- Consumes: models `EmendaParlamentar`, `Notificacao`.
- Produces:
  - Puros: `pct_pago(empenhado, pago_total) -> float | None` (clamp 0–100; `None` se empenhado ≤ 0); `montar_radar_puro(emendas: list[dict]) -> dict` — entrada: dicts `{ano, codigo, numero, autor, tipo, funcao, empenhado, liquidado, pago, resto_pago}`; saída `{disponivel, kpis, por_autor, por_funcao, emendas}` onde cada emenda ganha `pago_total` e `pct_pago`.
  - DB: `montar_radar(db, municipio_id, ano=None) -> dict` (adiciona `anos`: lista de anos com dados, desc); `calcular_resumo_emendas(db, municipio_id) -> dict` `{disponivel, ano, total_empenhado, num_parlamentares, top_autor}` (ano = mais recente com dados); `gerar_notificacoes_emendas(db, novidades: dict[int, list[dict]], usuario_id) -> int`.

- [ ] **Step 1: Escrever os testes que falham — `backend/tests/test_emendas_service.py`**

```python
"""Matemática do Radar de Emendas — sem DB."""
from app.services.emendas_service import montar_radar_puro, pct_pago

EMENDAS = [
    {"ano": 2026, "codigo": "A", "numero": "1", "autor": "DEPUTADO X",
     "tipo": "Emenda Individual", "funcao": "Saúde",
     "empenhado": 1_000_000.0, "liquidado": 500_000.0, "pago": 300_000.0, "resto_pago": 200_000.0},
    {"ano": 2026, "codigo": "B", "numero": "2", "autor": "DEPUTADO X",
     "tipo": "Emenda Individual", "funcao": "Educação",
     "empenhado": 500_000.0, "liquidado": 0.0, "pago": 0.0, "resto_pago": 0.0},
    {"ano": 2025, "codigo": "C", "numero": "3", "autor": "DEPUTADA Y",
     "tipo": "Emenda de Bancada", "funcao": "Saúde",
     "empenhado": 2_000_000.0, "liquidado": 2_000_000.0, "pago": 2_000_000.0, "resto_pago": 0.0},
]


def test_pct_pago_clamp_e_divisor_zero():
    assert pct_pago(100.0, 50.0) == 50.0
    assert pct_pago(100.0, 150.0) == 100.0    # clamp (restos > empenho do ano)
    assert pct_pago(100.0, -10.0) == 0.0
    assert pct_pago(0.0, 10.0) is None
    assert pct_pago(None, 10.0) is None


def test_radar_kpis_e_agrupamentos():
    r = montar_radar_puro(EMENDAS)
    assert r["disponivel"] is True
    k = r["kpis"]
    assert k["total_empenhado"] == 3_500_000.0
    assert k["pago_total"] == 2_500_000.0          # (300k+200k) + 0 + 2M
    assert k["pct_pago"] == round(2_500_000.0 / 3_500_000.0 * 100, 1)
    assert k["num_emendas"] == 3
    assert k["num_parlamentares"] == 2
    assert k["top_autor"] == "DEPUTADA Y"          # 2M > 1.5M
    assert k["top_autor_valor"] == 2_000_000.0

    autores = {a["autor"]: a for a in r["por_autor"]}
    assert list(autores) == ["DEPUTADA Y", "DEPUTADO X"]   # ordenado por empenhado desc
    assert autores["DEPUTADO X"]["num_emendas"] == 2
    assert autores["DEPUTADO X"]["empenhado"] == 1_500_000.0
    assert autores["DEPUTADO X"]["pago_total"] == 500_000.0

    funcoes = {f["funcao"]: f["empenhado"] for f in r["por_funcao"]}
    assert funcoes == {"Saúde": 3_000_000.0, "Educação": 500_000.0}

    # emendas ordenadas por ano desc, empenhado desc; com pago_total/pct_pago
    assert [e["codigo"] for e in r["emendas"]] == ["A", "B", "C"]
    assert r["emendas"][0]["pago_total"] == 500_000.0
    assert r["emendas"][0]["pct_pago"] == 50.0


def test_radar_vazio():
    r = montar_radar_puro([])
    assert r["disponivel"] is False
    assert r["kpis"] is None
    assert r["por_autor"] == [] and r["por_funcao"] == [] and r["emendas"] == []
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `python -m pytest tests/test_emendas_service.py -v`
Expected: FAIL com `ModuleNotFoundError: No module named 'app.services.emendas_service'`.

- [ ] **Step 3: Criar `backend/app/services/emendas_service.py`**

```python
"""Radar de Emendas Parlamentares — núcleo de cálculo.

Pago total de uma emenda = pago no exercício + restos a pagar pagos. O total
municipal é um PISO: emendas com localidade Nacional/UF não são
municipalizáveis e ficam fora (ver emendas_portal.py)."""


def pct_pago(empenhado, pago_total) -> float | None:
    """% executado (pago_total / empenhado), clamp 0–100; None sem empenho."""
    if not empenhado or empenhado <= 0:
        return None
    return round(min(100.0, max(0.0, pago_total / empenhado * 100)), 1)


def _pago_total(e: dict) -> float:
    return (e.get("pago") or 0.0) + (e.get("resto_pago") or 0.0)


def montar_radar_puro(emendas: list) -> dict:
    """[{ano, codigo, numero, autor, tipo, funcao, empenhado, liquidado, pago,
    resto_pago}] → payload do radar (kpis, por_autor, por_funcao, emendas)."""
    if not emendas:
        return {"disponivel": False, "kpis": None, "por_autor": [], "por_funcao": [], "emendas": []}

    itens = []
    for e in emendas:
        pago_total = round(_pago_total(e), 2)
        itens.append({**e, "pago_total": pago_total,
                      "pct_pago": pct_pago(e.get("empenhado"), pago_total)})
    itens.sort(key=lambda e: (-e["ano"], -(e.get("empenhado") or 0.0)))

    total_empenhado = round(sum(e.get("empenhado") or 0.0 for e in itens), 2)
    pago_geral = round(sum(e["pago_total"] for e in itens), 2)

    por_autor: dict[str, dict] = {}
    for e in itens:
        a = por_autor.setdefault(e["autor"], {"autor": e["autor"], "num_emendas": 0,
                                              "empenhado": 0.0, "pago_total": 0.0})
        a["num_emendas"] += 1
        a["empenhado"] = round(a["empenhado"] + (e.get("empenhado") or 0.0), 2)
        a["pago_total"] = round(a["pago_total"] + e["pago_total"], 2)
    autores = sorted(por_autor.values(), key=lambda a: -a["empenhado"])
    for a in autores:
        a["pct_pago"] = pct_pago(a["empenhado"], a["pago_total"])

    por_funcao: dict[str, float] = {}
    for e in itens:
        if e.get("funcao"):
            por_funcao[e["funcao"]] = round(por_funcao.get(e["funcao"], 0.0) + (e.get("empenhado") or 0.0), 2)
    funcoes = [{"funcao": f, "empenhado": v}
               for f, v in sorted(por_funcao.items(), key=lambda kv: -kv[1])]

    top = autores[0] if autores else None
    return {
        "disponivel": True,
        "kpis": {
            "total_empenhado": total_empenhado,
            "pago_total": pago_geral,
            "pct_pago": pct_pago(total_empenhado, pago_geral),
            "num_emendas": len(itens),
            "num_parlamentares": len(autores),
            "top_autor": top["autor"] if top else None,
            "top_autor_valor": top["empenhado"] if top else None,
        },
        "por_autor": autores,
        "por_funcao": funcoes,
        "emendas": itens,
    }


# ── camada DB (fina; verificada via endpoints) ───────────────────────────────
from sqlalchemy.orm import Session


def _rows_para_dicts(rows) -> list:
    return [{
        "ano": r.ano, "codigo": r.codigo_emenda, "numero": r.numero_emenda,
        "autor": r.autor, "tipo": r.tipo_emenda, "funcao": r.funcao,
        "empenhado": float(r.valor_empenhado), "liquidado": float(r.valor_liquidado),
        "pago": float(r.valor_pago), "resto_pago": float(r.valor_resto_pago),
    } for r in rows]


def montar_radar(db: "Session", municipio_id: int, ano: int | None = None) -> dict:
    from app.models.emenda import EmendaParlamentar

    query = db.query(EmendaParlamentar).filter(EmendaParlamentar.municipio_id == municipio_id)
    anos = sorted({a for (a,) in
                   query.with_entities(EmendaParlamentar.ano).distinct().all()}, reverse=True)
    if ano is not None:
        query = query.filter(EmendaParlamentar.ano == ano)
    radar = montar_radar_puro(_rows_para_dicts(query.all()))
    return {**radar, "anos": anos}


def calcular_resumo_emendas(db: "Session", municipio_id: int) -> dict:
    from app.models.emenda import EmendaParlamentar

    rows = db.query(EmendaParlamentar).filter(
        EmendaParlamentar.municipio_id == municipio_id).all()
    if not rows:
        return {"disponivel": False, "ano": None, "total_empenhado": None,
                "num_parlamentares": None, "top_autor": None}
    ano = max(r.ano for r in rows)
    radar = montar_radar_puro(_rows_para_dicts([r for r in rows if r.ano == ano]))
    k = radar["kpis"]
    return {"disponivel": True, "ano": ano, "total_empenhado": k["total_empenhado"],
            "num_parlamentares": k["num_parlamentares"], "top_autor": k["top_autor"]}


def _fmt_moeda(v: float) -> str:
    if abs(v) >= 1e6:
        return "R$ " + f"{v / 1e6:.1f}".replace(".", ",") + " milhões"
    return "R$ " + f"{v:,.0f}".replace(",", ".")


def gerar_notificacoes_emendas(db: "Session", novidades: dict, usuario_id: int) -> int:
    """`novidades`: mid → lista de registros de emendas NOVAS do ano corrente
    (inseridas agora pela fonte). Dedup por (titulo, municipio_id)."""
    from app.models.notificacao import Notificacao

    existentes = db.query(Notificacao).filter(Notificacao.titulo.like("Emendas%")).all()
    titulos: set = {(n.titulo, n.municipio_ids[0]) for n in existentes
                    if n.municipio_ids and len(n.municipio_ids) == 1}

    criadas = 0
    for mid, regs in novidades.items():
        if not regs:
            continue
        total = sum(r["valor_empenhado"] for r in regs)
        ano = regs[0]["ano"]
        autores = sorted({r["autor"] for r in regs})
        sufixo = f" + {len(autores) - 1} outro(s)" if len(autores) > 1 else ""
        titulo = f"Emendas: {_fmt_moeda(total)} em novas emendas ({ano})"
        if (titulo, mid) in titulos:
            continue
        mensagem = (
            f"Foram identificadas {len(regs)} nova(s) emenda(s) parlamentar(es) "
            f"destinada(s) ao município em {ano} ({autores[0]}{sufixo}). "
            f"Veja a página Emendas."
        )
        db.add(Notificacao(titulo=titulo, mensagem=mensagem, tipo="success",
                           municipio_ids=[mid], criado_por=usuario_id))
        titulos.add((titulo, mid))
        criadas += 1
    if criadas:
        db.commit()
    return criadas
```

- [ ] **Step 4: Rodar testes**

Run: `python -m pytest tests/test_emendas_service.py -v`
Expected: todos PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/emendas_service.py backend/tests/test_emendas_service.py
git commit -m "feat(emendas): service do radar (agrupamento por autor/funcao, execucao, notificacoes)"
```

---

### Task 9: Fonte automática `emendas`

**Files:**
- Modify: `backend/app/services/ingestao_automatica/emendas_portal.py` (append `executar` + `registrar`)
- Modify: `backend/app/services/ingestao_automatica/__init__.py`

**Interfaces:**
- Consumes: `parse_emendas_csv` (Task 7); `util.baixar_zip`, `util.linhas_zip`; `codigo_ibge_valido`; `emendas_service.gerar_notificacoes_emendas`; model `EmendaParlamentar`.
- Produces: fonte `emendas` em `FONTES_AUTOMATICAS`.

- [ ] **Step 1: Append em `emendas_portal.py`**

Adicionar aos imports do topo:

```python
import os
import tempfile
from datetime import date

from app.services.ingestao_automatica.base import FonteAutomatica, ResumoIngestao, registrar
from app.services.ingestao_automatica.util import baixar_zip, linhas_zip
```

E no fim do arquivo:

```python
def executar(db, municipios, anos=None, usuario_id=None, notificar=True) -> ResumoIngestao:
    """Baixa o zip nacional de emendas, agrega por (município, emenda) e faz
    upsert em EmendaParlamentar com commit por município. Município sem emenda
    municipalizada não ganha linha (zero é dado, não erro)."""
    from app.models.emenda import EmendaParlamentar
    from app.services.ingestao_automatica.populacao_ibge import codigo_ibge_valido

    resumo = ResumoIngestao(dataset="emendas")
    alvo: dict[str, int] = {}
    for m in municipios:
        if codigo_ibge_valido(m.codigo_ibge):
            alvo[m.codigo_ibge.strip()] = m.id
        else:
            resumo.municipios_erro += 1
            resumo.erros.append(f"{m.nome}/{m.estado}: codigo_ibge ausente/inválido")
    if not alvo:
        return resumo

    if not anos:
        anos = range(ANO_INICIO_PADRAO, date.today().year + 1)
    anos = set(anos)

    with tempfile.TemporaryDirectory(prefix="emendas_") as pasta:
        caminho = baixar_zip(URL_EMENDAS, os.path.join(pasta, "emendas.zip"))
        with linhas_zip(caminho, encoding="latin-1") as linhas:
            por_municipio = parse_emendas_csv(linhas, alvo, anos)

    ano_corrente = date.today().year
    novidades: dict[int, list] = {}
    for mid in sorted(set(alvo.values())):
        regs = por_municipio.get(mid)
        if not regs:
            continue
        existentes = {
            r.codigo_emenda: r
            for r in db.query(EmendaParlamentar)
            .filter(EmendaParlamentar.municipio_id == mid)
            .all()
        }
        for codigo, reg in regs.items():
            atual = existentes.get(codigo)
            if atual:
                atual.ano = reg["ano"]
                atual.numero_emenda = reg["numero_emenda"]
                atual.autor = reg["autor"]
                atual.tipo_emenda = reg["tipo_emenda"]
                atual.funcao = reg["funcao"]
                atual.valor_empenhado = reg["valor_empenhado"]
                atual.valor_liquidado = reg["valor_liquidado"]
                atual.valor_pago = reg["valor_pago"]
                atual.valor_resto_pago = reg["valor_resto_pago"]
            else:
                db.add(EmendaParlamentar(municipio_id=mid, **reg))
                if reg["ano"] == ano_corrente:
                    novidades.setdefault(mid, []).append(reg)
            resumo.linhas += 1
        resumo.municipios_ok += 1
        db.commit()

    if notificar and usuario_id and novidades:
        from app.services.emendas_service import gerar_notificacoes_emendas

        resumo.notificacoes = gerar_notificacoes_emendas(db, novidades, usuario_id)
    return resumo


registrar(FonteAutomatica(
    key="emendas",
    label="Emendas Parlamentares (Portal da Transparência)",
    fonte="Portal da Transparência/CGU — Emendas parlamentares por localidade (inclui emendas Pix desde mai/2026)",
    executar=executar,
))
```

- [ ] **Step 2: Registrar no `__init__.py` do pacote**

Após a linha do `captacao_siconv`:

```python
from app.services.ingestao_automatica import emendas_portal  # noqa: F401
```

- [ ] **Step 3: Rodar suíte + smoke**

Run: `python -m pytest`
Expected: todos PASS.

Run: `python -c "from app.services.ingestao_automatica import FONTES_AUTOMATICAS; print(sorted(FONTES_AUTOMATICAS))"`
Expected: `['captacao_federal', 'emendas', 'fpm', 'populacao']`.

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/ingestao_automatica/emendas_portal.py backend/app/services/ingestao_automatica/__init__.py
git commit -m "feat(emendas): fonte automatica emendas (Portal da Transparencia) na esteira"
```

---

### Task 10: Schemas + router `/emendas`

**Files:**
- Create: `backend/app/schemas/emendas.py`
- Create: `backend/app/api/v1/routers/emendas.py`
- Modify: `backend/app/main.py`

**Interfaces:**
- Consumes: `montar_radar`, `calcular_resumo_emendas` (Task 8); `deps.municipio_scope`, `deps.scoped_modulo`.
- Produces: `GET /api/v1/emendas/resumo` (livre) e `GET /api/v1/emendas/radar?ano=` (gateado pelo módulo `emendas`).

- [ ] **Step 1: Criar `backend/app/schemas/emendas.py`**

```python
from pydantic import BaseModel


class EmendaItem(BaseModel):
    ano: int
    codigo: str
    numero: str | None = None
    autor: str
    tipo: str
    funcao: str | None = None
    empenhado: float = 0.0
    liquidado: float = 0.0
    pago: float = 0.0
    resto_pago: float = 0.0
    pago_total: float = 0.0
    pct_pago: float | None = None


class AutorItem(BaseModel):
    autor: str
    num_emendas: int
    empenhado: float
    pago_total: float
    pct_pago: float | None = None


class FuncaoItem(BaseModel):
    funcao: str
    empenhado: float


class RadarKpis(BaseModel):
    total_empenhado: float
    pago_total: float
    pct_pago: float | None = None
    num_emendas: int
    num_parlamentares: int
    top_autor: str | None = None
    top_autor_valor: float | None = None


class EmendasRadar(BaseModel):
    disponivel: bool
    motivo: str | None = None      # selecione_municipio
    anos: list[int] = []
    kpis: RadarKpis | None = None
    por_autor: list[AutorItem] = []
    por_funcao: list[FuncaoItem] = []
    emendas: list[EmendaItem] = []


class EmendasResumo(BaseModel):
    """Headline livre (card do Painel do Prefeito)."""
    disponivel: bool
    motivo: str | None = None
    ano: int | None = None
    total_empenhado: float | None = None
    num_parlamentares: int | None = None
    top_autor: str | None = None
```

- [ ] **Step 2: Criar `backend/app/api/v1/routers/emendas.py`**

```python
from app.api.deps import get_db, municipio_scope, scoped_modulo
from app.schemas.emendas import EmendasRadar, EmendasResumo
from app.services.emendas_service import calcular_resumo_emendas, montar_radar
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

# Híbrido (decisão de produto): /resumo é livre (teaser no Painel do Prefeito);
# /radar exige o módulo "emendas" no plano.
router = APIRouter(prefix="/emendas", tags=["Emendas Parlamentares"])


@router.get("/resumo", response_model=EmendasResumo)
def resumo_emendas(
    mid: int | None = Depends(municipio_scope),
    db: Session = Depends(get_db),
):
    if mid is None:
        return EmendasResumo(disponivel=False, motivo="selecione_municipio")
    return EmendasResumo(**calcular_resumo_emendas(db, mid))


@router.get("/radar", response_model=EmendasRadar)
def radar_emendas(
    ano: int | None = Query(default=None),
    mid: int | None = Depends(scoped_modulo("emendas")),
    db: Session = Depends(get_db),
):
    if mid is None:
        return EmendasRadar(disponivel=False, motivo="selecione_municipio")
    return EmendasRadar(**montar_radar(db, mid, ano))
```

- [ ] **Step 3: Registrar no `backend/app/main.py`**

Adicionar `emendas` ao import dos routers e, após a linha do `captacao_federal`:

```python
app.include_router(emendas.router, prefix=API_PREFIX)
```

- [ ] **Step 4: Smoke + suíte**

Run: `python -c "from app.main import app; print([r.path for r in app.routes if 'emendas' in r.path])"`
Expected: `['/api/v1/emendas/resumo', '/api/v1/emendas/radar']`.

Run: `python -m pytest`
Expected: todos PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/emendas.py backend/app/api/v1/routers/emendas.py backend/app/main.py
git commit -m "feat(emendas): endpoints /emendas (resumo livre + radar gateado)"
```

---

### Task 11: Frontend — CTA compartilhado + página Dinheiro na Mesa

**Files:**
- Create: `frontend-observatorio/src/components/CriarOportunidadeCaptacao.jsx`
- Create: `frontend-observatorio/src/pages/dinheiro-na-mesa/DinheiroNaMesaPage.jsx`
- Modify: `frontend-observatorio/src/app/router/AppRouter.jsx` (import ~linha 11, rota ~linha 95)
- Modify: `frontend-observatorio/src/app/layouts/DashboardLayout.jsx` (grupo Economia, ~linha 57)
- Modify: `frontend-observatorio/src/pages/admin/PlanoConfigAdminPage.jsx` (`MODULOS`, ~linha 11)

**Interfaces:**
- Consumes: `GET /captacao-federal/diagnostico` (Task 6); `POST /desenvolvimento-economico/captacao` (já existe — body `{tipo, titulo, entidade_origem?, valor_estimado?, estagio, descricao?}`); hooks `useAuth`/`usePlan`/`useToast`/`useViewAs`; componentes `nid` (`NidPanel`, `NidPageHeader`, `MultiLineChart`, `KpiCard`, `InfoTooltip`).
- Produces: componente `CriarOportunidadeCaptacao({ payload, label?, compact? })` (reusado na Task 12); rota `/app/dinheiro-na-mesa`; chave de plano `captacao_federal` configurável em `/admin/planos`.

- [ ] **Step 1: Criar `frontend-observatorio/src/components/CriarOportunidadeCaptacao.jsx`**

```jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PlusCircleIcon } from "@heroicons/react/24/outline";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { usePlan } from "../context/PlanContext";
import { useToast } from "../context/ToastContext";

/** CTA "diagnóstico → ação": cria um CaptacaoRecurso pré-preenchido no estágio
 * "oportunidade" e navega ao kanban de Captação (Desenv. Econômico). Só aparece
 * para quem pode escrever no módulo (ADMIN_MUNICIPIO) e o tem no plano — o
 * backend já bloqueia VISUALIZADOR/ADMIN_GLOBAL de qualquer forma. */
export default function CriarOportunidadeCaptacao({ payload, label = "Registrar no funil de captação", compact = false }) {
  const { user } = useAuth();
  const { canAccess } = usePlan();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  if (user?.role !== "ADMIN_MUNICIPIO" || !canAccess("desenvolvimento_economico.captacao")) return null;

  const criar = async () => {
    setSaving(true);
    try {
      await api.post("/desenvolvimento-economico/captacao", { estagio: "oportunidade", ...payload });
      addToast("Oportunidade criada no funil de captação", "success");
      navigate("/app/desenvolvimento-economico/captacao");
    } catch {
      addToast("Erro ao criar oportunidade", "error");
      setSaving(false);
    }
  };

  if (compact) {
    return (
      <button onClick={criar} disabled={saving} title={label}
        className="text-xs font-semibold text-[var(--accent-1)] hover:underline disabled:opacity-50 whitespace-nowrap">
        {saving ? "..." : "+ funil"}
      </button>
    );
  }
  return (
    <button onClick={criar} disabled={saving}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] hover:shadow-md transition-shadow disabled:opacity-50">
      <PlusCircleIcon className="w-5 h-5" />
      {saving ? "Criando…" : label}
    </button>
  );
}
```

- [ ] **Step 2: Criar `frontend-observatorio/src/pages/dinheiro-na-mesa/DinheiroNaMesaPage.jsx`**

```jsx
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useViewAs } from "../../context/ViewAsContext";
import InfoTooltip from "../../components/InfoTooltip";
import KpiCard from "../../components/KpiCard";
import CriarOportunidadeCaptacao from "../../components/CriarOportunidadeCaptacao";
import { NidPanel, NidPageHeader } from "../../components/nid/Panel";
import { MultiLineChart, fmtMoneyShort, fmtMoneyFull } from "../../components/nid/charts";

const fmtMi = (v) => {
  if (v == null) return "—";
  if (Math.abs(v) >= 1e6) return `R$ ${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  return `R$ ${(v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
};
const fmtHab = (n) => (n == null ? "—" : Number(n).toLocaleString("pt-BR"));

// ── Hero do diagnóstico ──────────────────────────────────────────────────────
function HeroDiagnostico({ d }) {
  const abaixo = !d.acima_da_media && d.media_pares != null;
  const tom = abaixo
    ? { cor: "rgba(245,158,11,.45)", bg: "rgba(245,158,11,.08)", titulo: "Dinheiro na mesa" }
    : { cor: "rgba(16,185,129,.45)", bg: "rgba(16,185,129,.08)", titulo: "Acima da média dos pares" };
  return (
    <div className="rounded-2xl p-6 border" style={{ borderColor: tom.cor, background: tom.bg }}>
      <p className="text-xs uppercase tracking-wider font-semibold text-[var(--text-mute)]">{tom.titulo}</p>
      <p className="text-lg md:text-2xl font-bold mt-2 text-[var(--text)] leading-snug">
        {d.media_pares == null ? (
          <>Sem municípios pares com dados na sua UF para comparar ({d.ano_referencia}).</>
        ) : (
          <>Municípios pares captaram em média {fmtMi(d.media_pares)} em {d.ano_referencia}; você captou {fmtMi(d.voce_firmado)}
            {abaixo && <> — <span className="whitespace-nowrap">{fmtMi(d.dinheiro_na_mesa)} na mesa</span></>}.</>
        )}
      </p>
      <p className="text-sm mt-2 text-[var(--text-dim)]">
        Pares = municípios da mesma faixa populacional do FPM na {d.uf}
        {d.faixa_pop_min != null && <> ({fmtHab(d.faixa_pop_min)}–{d.faixa_pop_max != null ? fmtHab(d.faixa_pop_max) : "∞"} hab.)</>}
        {" "}· grupo de {d.total_grupo} municípios · convênios e transferências da União (SICONV), repasse federal firmado no ano.
        {d.media_nacional != null && <> Média nacional da faixa: {fmtMi(d.media_nacional)}.</>}
      </p>
    </div>
  );
}

// ── Página ───────────────────────────────────────────────────────────────────
export default function DinheiroNaMesaPage() {
  const { user } = useAuth();
  const { viewAsId } = useViewAs();
  const needsMunicipio = user?.role === "ADMIN_GLOBAL" && viewAsId == null;

  const [diag, setDiag] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (needsMunicipio) { setLoading(false); return; }
    api.get("/captacao-federal/diagnostico")
      .then((r) => setDiag(r.data))
      .catch((err) => console.error("Erro ao carregar diagnóstico de captação:", err))
      .finally(() => setLoading(false));
  }, [needsMunicipio]);

  const serieChart = useMemo(() => (diag?.serie || []).map((i) => ({
    label: i.parcial ? `${i.ano}*` : String(i.ano),
    "Você": i.voce,
    "Média dos pares": i.media_pares ?? 0,
  })), [diag]);

  const serieDesc = useMemo(() => [...(diag?.serie || [])].reverse(), [diag]);

  if (needsMunicipio) {
    return (
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <NidPageHeader title="Dinheiro na Mesa" sub="Captação federal vs. municípios pares" />
        <div className="mt-6 rounded-2xl p-10 text-center" style={{ background: "var(--panel)", border: "1px dashed var(--border-strong)" }}>
          <p className="text-base font-semibold text-[var(--text)]">Selecione um município</p>
          <p className="text-sm mt-1 text-[var(--text-dim)]">Use <b>"Ver como"</b> na administração de Municípios.</p>
        </div>
      </motion.div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="nid-kpi" style={{ minHeight: 110, opacity: 0.4 }} />
        ))}
      </div>
    );
  }

  const indisponivel = !diag?.disponivel;

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-6">
      <div className="flex items-center gap-2">
        <NidPageHeader title="Dinheiro na Mesa" sub="Captação de convênios federais vs. municípios do mesmo porte" />
        <InfoTooltip dataset="captacao_federal" />
      </div>

      {indisponivel ? (
        <div className="rounded-2xl p-10 text-center" style={{ background: "var(--panel)", border: "1px dashed var(--border-strong)" }}>
          <p className="text-base font-semibold text-[var(--text)]">
            {diag?.nao_aplicavel ? "Não se aplica" : "Sem dados de captação"}
          </p>
          <p className="text-sm mt-1 text-[var(--text-dim)]">
            {diag?.motivo === "capital" && "A comparação usa as faixas do FPM-Interior; capitais ficam fora do grupo de pares."}
            {diag?.motivo === "sem_codigo_ibge" && "Cadastre o código IBGE do município na administração."}
            {diag?.motivo === "sem_populacao" && "Execute a fonte automática \"População (IBGE)\" em Administração → Fontes de Dados."}
            {diag?.motivo === "sem_dados" && "Execute a fonte automática \"Captação Federal — convênios (SICONV)\" em Administração → Fontes de Dados (UF inteira)."}
            {!["capital", "sem_codigo_ibge", "sem_populacao", "sem_dados"].includes(diag?.motivo) &&
              "Dados indisponíveis para este município."}
          </p>
        </div>
      ) : (
        <>
          <HeroDiagnostico d={diag} />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label={`Captação firmada (${diag.ano_referencia})`} value={fmtMoneyShort(diag.voce_firmado)} sub={`${diag.qtd_convenios ?? 0} convênio(s)`} dataset="captacao_federal" indicadorKey="voce_firmado" />
            <KpiCard label="Via emenda parlamentar" value={fmtMoneyShort(diag.via_emenda)} sub="parte do firmado" dataset="captacao_federal" indicadorKey="via_emenda" />
            <KpiCard label={`Desembolsado (${diag.ano_referencia})`} value={fmtMoneyShort(diag.desembolsado)} sub="dinheiro que entrou no ano" dataset="captacao_federal" indicadorKey="desembolsado" />
            <KpiCard label="Posição no grupo" value={diag.posicao != null ? `${diag.posicao}º` : "—"} sub={`de ${diag.total_grupo} municípios pares`} dataset="captacao_federal" indicadorKey="posicao" />
          </div>

          <NidPanel title="Captação anual — você vs. média dos pares" sub="Repasse federal firmado por ano · * ano corrente (parcial)">
            <MultiLineChart
              data={serieChart}
              series={["Você", "Média dos pares"]}
              colors={["var(--accent-1)", "var(--accent-3)"]}
              height={280}
              yFmt={fmtMoneyShort}
              tipFmt={fmtMoneyFull}
              legend
              emptyMessage='Sem dados — execute a fonte "Captação Federal" em Administração → Fontes de Dados.'
            />
          </NidPanel>

          <NidPanel title="Detalhe anual" sub="Valores firmados, via emenda e desembolsados">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left">
                    <th className="px-3 py-2 font-semibold text-[var(--text-dim)]">Ano</th>
                    <th className="px-3 py-2 font-semibold text-[var(--text-dim)] text-right">Você (R$)</th>
                    <th className="px-3 py-2 font-semibold text-[var(--text-dim)] text-right">Média pares (R$)</th>
                    <th className="px-3 py-2 font-semibold text-[var(--text-dim)] text-right">Via emenda (R$)</th>
                    <th className="px-3 py-2 font-semibold text-[var(--text-dim)] text-right">Desembolsado (R$)</th>
                    <th className="px-3 py-2 font-semibold text-[var(--text-dim)] text-right">Convênios</th>
                  </tr>
                </thead>
                <tbody>
                  {serieDesc.map((i) => (
                    <tr key={i.ano} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-3 py-2 font-medium text-[var(--text)]">{i.ano}{i.parcial ? "*" : ""}</td>
                      <td className="px-3 py-2 text-right text-[var(--text)]">{fmtMoneyFull(i.voce)}</td>
                      <td className="px-3 py-2 text-right text-[var(--text-dim)]">{i.media_pares != null ? fmtMoneyFull(i.media_pares) : "—"}</td>
                      <td className="px-3 py-2 text-right text-[var(--text-dim)]">{fmtMoneyFull(i.via_emenda)}</td>
                      <td className="px-3 py-2 text-right text-[var(--text-dim)]">{fmtMoneyFull(i.desembolsado)}</td>
                      <td className="px-3 py-2 text-right text-[var(--text-dim)]">{i.qtd_convenios}</td>
                    </tr>
                  ))}
                  {serieDesc.length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-6 text-center text-[var(--text-dim)]">Sem dados de captação.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </NidPanel>

          <div className="flex justify-end">
            <CriarOportunidadeCaptacao
              payload={{
                tipo: "convenio",
                titulo: "Nova oportunidade de convênio federal",
                entidade_origem: "Transferegov / SICONV",
                valor_estimado: diag.dinheiro_na_mesa > 0 ? diag.dinheiro_na_mesa : null,
                descricao: `Diagnóstico Dinheiro na Mesa (${diag.ano_referencia}): média dos pares ${diag.media_pares != null ? fmtMi(diag.media_pares) : "—"}, captado ${fmtMi(diag.voce_firmado)}.`,
              }}
            />
          </div>
        </>
      )}
    </motion.div>
  );
}
```

- [ ] **Step 3: Rota em `AppRouter.jsx`**

Junto aos imports de páginas (após `import FpmPage from "../../pages/fpm/FpmPage";`):

```jsx
import DinheiroNaMesaPage from "../../pages/dinheiro-na-mesa/DinheiroNaMesaPage";
```

Após `<Route path="fpm" element={<FpmPage />} />` (linha 95):

```jsx
          <Route path="dinheiro-na-mesa" element={<DinheiroNaMesaPage />} />
```

- [ ] **Step 4: Sidebar em `DashboardLayout.jsx`**

No grupo "Economia" (children, ~linha 57), após a linha do FPM:

```jsx
      { to: "/app/dinheiro-na-mesa", label: "Dinheiro na Mesa", icon: BanknotesIcon, modulo: "captacao_federal" },
```

- [ ] **Step 5: Chave de plano em `PlanoConfigAdminPage.jsx`**

Em `MODULOS`, após `{ key: "vaf", ... }` (linha 11):

```jsx
  { key: "captacao_federal", label: "Dinheiro na Mesa — Captação vs. Pares" },
```

- [ ] **Step 6: Build**

Run: `cd frontend-observatorio; npm run build`
Expected: build OK (avisos do baseline eslint são conhecidos e ignorados).

- [ ] **Step 7: Commit**

```bash
git add frontend-observatorio/src/components/CriarOportunidadeCaptacao.jsx frontend-observatorio/src/pages/dinheiro-na-mesa/DinheiroNaMesaPage.jsx frontend-observatorio/src/app/router/AppRouter.jsx frontend-observatorio/src/app/layouts/DashboardLayout.jsx frontend-observatorio/src/pages/admin/PlanoConfigAdminPage.jsx
git commit -m "feat(captacao): pagina Dinheiro na Mesa + CTA para o funil de captacao + gating por plano"
```

---

### Task 12: Frontend — página Radar de Emendas

**Files:**
- Create: `frontend-observatorio/src/pages/emendas/EmendasPage.jsx`
- Modify: `frontend-observatorio/src/app/router/AppRouter.jsx`
- Modify: `frontend-observatorio/src/app/layouts/DashboardLayout.jsx`
- Modify: `frontend-observatorio/src/pages/admin/PlanoConfigAdminPage.jsx`

**Interfaces:**
- Consumes: `GET /emendas/radar?ano=` (Task 10); `CriarOportunidadeCaptacao` (Task 11).
- Produces: rota `/app/emendas`; chave de plano `emendas`.

- [ ] **Step 1: Criar `frontend-observatorio/src/pages/emendas/EmendasPage.jsx`**

```jsx
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useViewAs } from "../../context/ViewAsContext";
import InfoTooltip from "../../components/InfoTooltip";
import KpiCard from "../../components/KpiCard";
import CriarOportunidadeCaptacao from "../../components/CriarOportunidadeCaptacao";
import { NidPanel, NidPageHeader } from "../../components/nid/Panel";
import { fmtMoneyShort, fmtMoneyFull } from "../../components/nid/charts";

const tipoCurto = (t) => (t || "").split(" - ")[0];

/** Barra de execução (empenhado → pago). pct null = sem empenho. */
function BarraExecucao({ pct }) {
  if (pct == null) return <span className="text-xs text-[var(--text-dim)]">—</span>;
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-2 rounded-full bg-[var(--panel-2)] overflow-hidden" aria-hidden>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 100 ? "rgba(16,185,129,.8)" : "var(--accent-1)" }} />
      </div>
      <span className="text-xs text-[var(--text-dim)] w-10 text-right">{Number(pct).toLocaleString("pt-BR")}%</span>
    </div>
  );
}

export default function EmendasPage() {
  const { user } = useAuth();
  const { viewAsId } = useViewAs();
  const needsMunicipio = user?.role === "ADMIN_GLOBAL" && viewAsId == null;

  const [radar, setRadar] = useState(null);
  const [ano, setAno] = useState("");           // "" = todos os anos
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (needsMunicipio) { setLoading(false); return; }
    setLoading(true);
    api.get("/emendas/radar", { params: ano ? { ano } : {} })
      .then((r) => setRadar(r.data))
      .catch((err) => console.error("Erro ao carregar radar de emendas:", err))
      .finally(() => setLoading(false));
  }, [needsMunicipio, ano]);

  const maxFuncao = useMemo(
    () => Math.max(1, ...(radar?.por_funcao || []).map((f) => f.empenhado)),
    [radar]
  );

  if (needsMunicipio) {
    return (
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <NidPageHeader title="Radar de Emendas" sub="Emendas parlamentares destinadas ao município" />
        <div className="mt-6 rounded-2xl p-10 text-center" style={{ background: "var(--panel)", border: "1px dashed var(--border-strong)" }}>
          <p className="text-base font-semibold text-[var(--text)]">Selecione um município</p>
          <p className="text-sm mt-1 text-[var(--text-dim)]">Use <b>"Ver como"</b> na administração de Municípios.</p>
        </div>
      </motion.div>
    );
  }

  if (loading && !radar) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="nid-kpi" style={{ minHeight: 110, opacity: 0.4 }} />
        ))}
      </div>
    );
  }

  const k = radar?.kpis;
  const indisponivel = !radar?.disponivel;

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        <NidPageHeader title="Radar de Emendas" sub="Quem envia recurso, quanto e o que já foi executado" />
        <InfoTooltip dataset="emendas" />
        {(radar?.anos || []).length > 0 && (
          <select
            value={ano}
            onChange={(e) => setAno(e.target.value)}
            className="ml-auto rounded-xl border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] text-sm px-3 py-1.5"
            aria-label="Filtrar por ano"
          >
            <option value="">Todos os anos</option>
            {radar.anos.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
      </div>

      {indisponivel ? (
        <div className="rounded-2xl p-10 text-center" style={{ background: "var(--panel)", border: "1px dashed var(--border-strong)" }}>
          <p className="text-base font-semibold text-[var(--text)]">Sem emendas carregadas</p>
          <p className="text-sm mt-1 text-[var(--text-dim)]">
            Execute a fonte automática "Emendas Parlamentares (Portal da Transparência)" em Administração → Fontes de Dados.
            Emendas com localidade "Nacional" ou estadual não são municipalizáveis — o total aqui é um piso.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label="Total destinado (empenhado)" value={fmtMoneyShort(k.total_empenhado)} sub={`${k.num_emendas} emenda(s)`} dataset="emendas" indicadorKey="total_empenhado" />
            <KpiCard label="Executado (pago)" value={fmtMoneyShort(k.pago_total)} sub={k.pct_pago != null ? `${Number(k.pct_pago).toLocaleString("pt-BR")}% do empenhado` : "—"} dataset="emendas" indicadorKey="pago_total" />
            <KpiCard label="Parlamentares" value={String(k.num_parlamentares)} sub="autores com emendas destinadas" dataset="emendas" indicadorKey="num_parlamentares" />
            <KpiCard label="Maior padrinho" value={k.top_autor || "—"} sub={k.top_autor_valor != null ? fmtMoneyShort(k.top_autor_valor) : ""} dataset="emendas" indicadorKey="top_autor" />
          </div>

          <NidPanel title="Ranking por parlamentar" sub="Total destinado e execução — quem manda (e quem não manda) recurso">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left">
                    <th className="px-3 py-2 font-semibold text-[var(--text-dim)]">#</th>
                    <th className="px-3 py-2 font-semibold text-[var(--text-dim)]">Parlamentar</th>
                    <th className="px-3 py-2 font-semibold text-[var(--text-dim)] text-right">Emendas</th>
                    <th className="px-3 py-2 font-semibold text-[var(--text-dim)] text-right">Destinado (R$)</th>
                    <th className="px-3 py-2 font-semibold text-[var(--text-dim)] text-right">Pago (R$)</th>
                    <th className="px-3 py-2 font-semibold text-[var(--text-dim)]">Execução</th>
                  </tr>
                </thead>
                <tbody>
                  {radar.por_autor.map((a, i) => (
                    <tr key={a.autor} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-3 py-2 text-[var(--text-dim)]">{i + 1}º</td>
                      <td className="px-3 py-2 font-medium text-[var(--text)]">{a.autor}</td>
                      <td className="px-3 py-2 text-right text-[var(--text-dim)]">{a.num_emendas}</td>
                      <td className="px-3 py-2 text-right text-[var(--text)]">{fmtMoneyFull(a.empenhado)}</td>
                      <td className="px-3 py-2 text-right text-[var(--text-dim)]">{fmtMoneyFull(a.pago_total)}</td>
                      <td className="px-3 py-2"><BarraExecucao pct={a.pct_pago} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </NidPanel>

          <NidPanel title="Destino por área" sub="Total empenhado por função orçamentária">
            <div className="space-y-2">
              {radar.por_funcao.map((f) => (
                <div key={f.funcao} className="flex items-center gap-3">
                  <span className="text-sm text-[var(--text)] w-40 truncate" title={f.funcao}>{f.funcao}</span>
                  <div className="flex-1 h-3 rounded-full bg-[var(--panel-2)] overflow-hidden" aria-hidden>
                    <div className="h-full rounded-full" style={{ width: `${(f.empenhado / maxFuncao) * 100}%`, background: "var(--accent-3)" }} />
                  </div>
                  <span className="text-xs text-[var(--text-dim)] w-24 text-right">{fmtMoneyShort(f.empenhado)}</span>
                </div>
              ))}
              {radar.por_funcao.length === 0 && (
                <p className="text-sm text-[var(--text-dim)] text-center py-4">Sem detalhamento por função.</p>
              )}
            </div>
          </NidPanel>

          <NidPanel title="Emendas destinadas ao município" sub="Funil de execução: empenhado → liquidado → pago (inclui restos a pagar pagos)">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left">
                    <th className="px-3 py-2 font-semibold text-[var(--text-dim)]">Ano</th>
                    <th className="px-3 py-2 font-semibold text-[var(--text-dim)]">Autor</th>
                    <th className="px-3 py-2 font-semibold text-[var(--text-dim)]">Tipo</th>
                    <th className="px-3 py-2 font-semibold text-[var(--text-dim)]">Área</th>
                    <th className="px-3 py-2 font-semibold text-[var(--text-dim)] text-right">Empenhado (R$)</th>
                    <th className="px-3 py-2 font-semibold text-[var(--text-dim)] text-right">Pago (R$)</th>
                    <th className="px-3 py-2 font-semibold text-[var(--text-dim)]">Execução</th>
                    <th className="px-3 py-2" aria-label="Ações"></th>
                  </tr>
                </thead>
                <tbody>
                  {radar.emendas.map((e) => (
                    <tr key={`${e.codigo}-${e.ano}`} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-3 py-2 text-[var(--text)]">{e.ano}</td>
                      <td className="px-3 py-2 font-medium text-[var(--text)]">{e.autor}</td>
                      <td className="px-3 py-2 text-[var(--text-dim)]" title={e.tipo}>{tipoCurto(e.tipo)}</td>
                      <td className="px-3 py-2 text-[var(--text-dim)]">{e.funcao || "—"}</td>
                      <td className="px-3 py-2 text-right text-[var(--text)]">{fmtMoneyFull(e.empenhado)}</td>
                      <td className="px-3 py-2 text-right text-[var(--text-dim)]">{fmtMoneyFull(e.pago_total)}</td>
                      <td className="px-3 py-2"><BarraExecucao pct={e.pct_pago} /></td>
                      <td className="px-3 py-2 text-right">
                        <CriarOportunidadeCaptacao
                          compact
                          label="Criar oportunidade no funil a partir desta emenda"
                          payload={{
                            tipo: "emenda",
                            titulo: `Emenda ${e.numero || e.codigo} — ${e.autor} (${e.ano})`,
                            entidade_origem: e.autor,
                            valor_estimado: e.empenhado || null,
                            descricao: `Emenda ${tipoCurto(e.tipo)} · área ${e.funcao || "n/d"} · pago ${fmtMoneyFull(e.pago_total)} de ${fmtMoneyFull(e.empenhado)}.`,
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </NidPanel>
        </>
      )}
    </motion.div>
  );
}
```

- [ ] **Step 2: Rota em `AppRouter.jsx`**

Import (após o `DinheiroNaMesaPage`):

```jsx
import EmendasPage from "../../pages/emendas/EmendasPage";
```

Rota (após `dinheiro-na-mesa`):

```jsx
          <Route path="emendas" element={<EmendasPage />} />
```

- [ ] **Step 3: Sidebar em `DashboardLayout.jsx`**

No grupo "Economia", após a linha do Dinheiro na Mesa:

```jsx
      { to: "/app/emendas", label: "Emendas", icon: BuildingLibraryIcon, modulo: "emendas" },
```

(`BuildingLibraryIcon` já está importado no arquivo.)

- [ ] **Step 4: Chave de plano em `PlanoConfigAdminPage.jsx`**

Em `MODULOS`, após a linha do `captacao_federal`:

```jsx
  { key: "emendas", label: "Radar de Emendas Parlamentares" },
```

- [ ] **Step 5: Build**

Run: `cd frontend-observatorio; npm run build`
Expected: build OK.

- [ ] **Step 6: Commit**

```bash
git add frontend-observatorio/src/pages/emendas/EmendasPage.jsx frontend-observatorio/src/app/router/AppRouter.jsx frontend-observatorio/src/app/layouts/DashboardLayout.jsx frontend-observatorio/src/pages/admin/PlanoConfigAdminPage.jsx
git commit -m "feat(emendas): pagina Radar de Emendas (ranking por parlamentar, execucao, CTA por emenda)"
```

---

### Task 13: Frontend — cards teaser no Painel do Prefeito

**Files:**
- Create: `frontend-observatorio/src/components/DinheiroNaMesaCard.jsx`
- Create: `frontend-observatorio/src/components/EmendasResumoCard.jsx`
- Modify: `frontend-observatorio/src/pages/painel-prefeito/PainelPrefeitoPage.jsx` (imports ~linha 10, JSX ~linha 370)

**Interfaces:**
- Consumes: `GET /captacao-federal/resumo` e `GET /emendas/resumo` (livres — teaser do híbrido). Padrão `AlertaFpmCard`: componente autossuficiente, `null` sem dados.
- Produces: dois cards linkando para `/app/dinheiro-na-mesa` e `/app/emendas`.

- [ ] **Step 1: Criar `frontend-observatorio/src/components/DinheiroNaMesaCard.jsx`**

```jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { BanknotesIcon, ArrowTrendingUpIcon } from "@heroicons/react/24/outline";
import api from "../services/api";

const fmtMi = (v) => {
  if (v == null) return null;
  if (Math.abs(v) >= 1e6) return `R$ ${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  return `R$ ${(v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
};

/** Teaser livre do Dinheiro na Mesa (decisão de produto: card livre, página
 * gateada). Autossuficiente: fetch próprio, null sem dados. */
export default function DinheiroNaMesaCard() {
  const [resumo, setResumo] = useState(null);

  useEffect(() => {
    api.get("/captacao-federal/resumo").then((r) => setResumo(r.data)).catch(() => setResumo(null));
  }, []);

  if (!resumo?.disponivel || resumo.media_pares == null) return null;
  const abaixo = !resumo.acima_da_media;
  const tom = abaixo
    ? { border: "rgba(245,158,11,.45)", bg: "rgba(245,158,11,.08)", Icon: BanknotesIcon, iconCls: "text-amber-500" }
    : { border: "rgba(16,185,129,.45)", bg: "rgba(16,185,129,.08)", Icon: ArrowTrendingUpIcon, iconCls: "text-emerald-500" };
  const { Icon } = tom;

  return (
    <Link to="/app/dinheiro-na-mesa" className="block" aria-label="Ver diagnóstico de captação">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-4 md:p-5 border transition-shadow hover:shadow-md"
        style={{ borderColor: tom.border, background: tom.bg }}
      >
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-[var(--panel)] border border-[var(--border)] flex-shrink-0">
            <Icon className={`w-5 h-5 ${tom.iconCls}`} />
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider font-semibold text-[var(--text-mute)]">
              Dinheiro na mesa — captação federal
            </p>
            <p className="text-sm md:text-base mt-1 text-[var(--text)] leading-snug">
              {abaixo ? (
                <>Municípios pares captaram em média <b>{fmtMi(resumo.media_pares)}</b> em {resumo.ano_referencia}; você captou <b>{fmtMi(resumo.voce_firmado)}</b> — <b>{fmtMi(resumo.dinheiro_na_mesa)}</b> na mesa.</>
              ) : (
                <>Você captou <b>{fmtMi(resumo.voce_firmado)}</b> em {resumo.ano_referencia} — acima da média dos pares (<b>{fmtMi(resumo.media_pares)}</b>).</>
              )}
            </p>
            <p className="text-xs mt-1.5 text-[var(--text-dim)]">
              Convênios federais (SICONV) · grupo de {resumo.total_grupo} municípios do mesmo porte na sua UF
            </p>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
```

- [ ] **Step 2: Criar `frontend-observatorio/src/components/EmendasResumoCard.jsx`**

```jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { BuildingLibraryIcon } from "@heroicons/react/24/outline";
import api from "../services/api";

const fmtMi = (v) => {
  if (v == null) return null;
  if (Math.abs(v) >= 1e6) return `R$ ${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  return `R$ ${(v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
};

/** Teaser livre do Radar de Emendas. Autossuficiente: fetch próprio, null sem dados. */
export default function EmendasResumoCard() {
  const [resumo, setResumo] = useState(null);

  useEffect(() => {
    api.get("/emendas/resumo").then((r) => setResumo(r.data)).catch(() => setResumo(null));
  }, []);

  if (!resumo?.disponivel) return null;

  return (
    <Link to="/app/emendas" className="block" aria-label="Ver radar de emendas">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-4 md:p-5 border transition-shadow hover:shadow-md"
        style={{ borderColor: "var(--border)", background: "var(--panel)" }}
      >
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-[var(--panel)] border border-[var(--border)] flex-shrink-0">
            <BuildingLibraryIcon className="w-5 h-5 text-[var(--accent-1)]" />
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider font-semibold text-[var(--text-mute)]">
              Radar de emendas parlamentares
            </p>
            <p className="text-sm md:text-base mt-1 text-[var(--text)] leading-snug">
              <b>{fmtMi(resumo.total_empenhado)}</b> em emendas destinadas ao município em {resumo.ano}
              {resumo.num_parlamentares != null && <> · <b>{resumo.num_parlamentares}</b> parlamentar(es)</>}
              {resumo.top_autor && <> · maior padrinho: <b>{resumo.top_autor}</b></>}.
            </p>
            <p className="text-xs mt-1.5 text-[var(--text-dim)]">
              Portal da Transparência · inclui emendas Pix · valores empenhados
            </p>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
```

- [ ] **Step 3: Inserir no `PainelPrefeitoPage.jsx`**

Imports (após `import AlertaFpmCard from "../../components/AlertaFpmCard";`, linha 10):

```jsx
import DinheiroNaMesaCard from "../../components/DinheiroNaMesaCard";
import EmendasResumoCard from "../../components/EmendasResumoCard";
```

JSX — logo após o bloco do FPM (`<div className="mb-7"><AlertaFpmCard /></div>`, ~linha 370):

```jsx
      {/* Captação federal + emendas (teasers livres) */}
      <div className="mb-7 space-y-4">
        <DinheiroNaMesaCard />
        <EmendasResumoCard />
      </div>
```

- [ ] **Step 4: Build**

Run: `cd frontend-observatorio; npm run build`
Expected: build OK.

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/components/DinheiroNaMesaCard.jsx frontend-observatorio/src/components/EmendasResumoCard.jsx frontend-observatorio/src/pages/painel-prefeito/PainelPrefeitoPage.jsx
git commit -m "feat(captacao,emendas): cards teaser no Painel do Prefeito"
```

---

### Task 14: Verificação final + docs

**Files:**
- Modify: `README.md` (tabela "Datasets & Pages" e "API Reference")

**Interfaces:**
- Consumes: tudo acima.

- [ ] **Step 1: Suíte completa + build**

```powershell
cd backend; python -m pytest
cd ..\frontend-observatorio; npm run build
```

Expected: pytest todos PASS; build OK.

- [ ] **Step 2: Atualizar README**

Na tabela "Datasets & Pages", após a linha do IPS:

```markdown
| Dinheiro na Mesa | Federal grants (SICONV) vs. peer municipalities | Transferegov/SICONV |
| Emendas | Parliamentary amendments earmarked to the city | Portal da Transparência |
```

Na tabela "API Reference", após a linha de `/comparativo/arrecadacao`:

```markdown
| GET | `/api/v1/captacao-federal/resumo` | Captação headline (free teaser) |
| GET | `/api/v1/captacao-federal/diagnostico` | Full peer-comparison diagnostic |
| GET | `/api/v1/emendas/resumo` | Amendments headline (free teaser) |
| GET | `/api/v1/emendas/radar` | Amendments radar by author/execution |
```

- [ ] **Step 3: Verificação manual E2E (precisa de DB + rede; fora do pytest por decisão de projeto)**

1. `docker-compose up -d db` + backend (`uvicorn app.main:app --reload --port 8000` de `backend/`) + frontend (`npm run dev`).
2. Login ADMIN_GLOBAL → `/admin/fontes`: rodar **População (IBGE)** (se ainda não rodou), depois **Captação Federal — convênios (SICONV)** com UF = MG (⚠️ demora alguns minutos — baixa ~230 MB; a proposta é o maior arquivo), depois **Emendas Parlamentares** com UF = MG.
3. Conferir em `/admin/fontes` a última execução (status ok/aviso, nº de linhas) e o `IngestaoAudit`.
4. Login como usuário de município MG (ou "Ver como"): abrir `/app/dinheiro-na-mesa` (hero + série vs. pares) e `/app/emendas` (ranking por parlamentar).
5. Painel do Prefeito: os dois cards aparecem com os headlines.
6. `/admin/planos`: desligar `captacao_federal`/`emendas` no plano do município de teste → páginas mostram o teaser bloqueado (`PlanLockedView`) e os endpoints completos retornam 403; cards do Painel continuam funcionando (livres).
7. Sino de notificações: primeira carga gera notificação de captação; emendas novas do ano corrente geram notificação de emendas.
8. CTA: como ADMIN_MUNICIPIO com módulo de captação no plano, "Registrar no funil" cria card em `/app/desenvolvimento-economico/captacao`.

- [ ] **Step 4: Commit final**

```bash
git add README.md
git commit -m "docs(readme): paginas e endpoints de captacao federal e emendas"
```

---

## Riscos operacionais (aceitos no spec)

1. `siconv_proposta.csv.zip` ~190 MB — maior download da esteira; streaming em disco temp. Plano B: rodar em horário calmo; se o worker do Railway sofrer timeout, considerar elevar `timeout` do gunicorn (fora do escopo deste plano).
2. Emendas não municipalizáveis (Nacional/UF) ficam fora — total municipal é piso (texto no empty state e InfoTooltip).
3. Convênio originado de emenda aparece nos DOIS datasets — as páginas nunca somam entre si; `valor_via_emenda` torna a sobreposição visível.
4. Mudança de layout dos CSVs → `indices_colunas` falha audível com "layout mudou?" no `IngestaoAudit`.

