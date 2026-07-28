# Fonte Automática Arrecadação (repasses MG) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fonte automática `arrecadacao` que baixa o star schema de repasses de ICMS/IPVA/IPI do CKAN de MG e faz upsert mensal na tabela `arrecadacao_mensal` existente.

**Architecture:** Módulo novo `arrecadacao_mg.py` no pacote `ingestao_automatica`, no padrão das 11 fontes: helpers puros testáveis (parse das dimensões, join do fato) + `executar()` + `registrar(...)`. URLs resolvidas via API CKAN com fallback fixo (mesmo padrão da fonte FPM/STN). Runner//admin/fontes/meta-job pegam pelo registry.

**Tech Stack:** Python 3.13, requests, gzip+csv (stdlib), SQLAlchemy, pytest.

## Global Constraints

- Upstream: CKAN `dados.mg.gov.br`, dataset `transferencia-de-impostos-a-municipios`; resources CSV **gzip** (UTF-8 BOM, `;`): `ft_repasse_mun.csv.gz` (`id_tempo;id_municipio;ano_particao;vr_icms;vr_ipi;vr_ipva`), `dm_tempo_mensal.csv.gz` (`id_tempo;anomes_iso;mes;ano;anomes_formatado`), `dm_municipio.csv.gz` (`id_municipio;cd_municipio_ibge;nome`).
- `dm_municipio` contém territórios com códigos curtos — só linhas com `cd_municipio_ibge` de 7 dígitos valem.
- Derivados NOT NULL do modelo: `nome_mes` (pt-BR capitalizado), `data_base` = date(ano, mês, 1); `valor_total` = icms+ipva+ipi.
- Upsert real por (município, ano, mês); default série completa; filtro `anos` restringe.
- Municípios-alvo de UF ≠ MG → UM aviso único + somam em `municipios_erro`.
- Teste de paridade exige `captacao_federal`/`emendas` como duas últimas em `ORDEM_EXECUCAO_TODAS`.
- Testes puros em `backend/tests/` (sem DB/rede); pytest de `backend/` com `..\venv\Scripts\python.exe -m pytest`; confiar no exit code.
- Spec: `docs/superpowers/specs/2026-07-27-fonte-arrecadacao-mg-design.md`.

---

### Task 1: Helpers puros do star schema (TDD)

**Files:**
- Create: `backend/app/services/ingestao_automatica/arrecadacao_mg.py` (parte pura)
- Test: `backend/tests/test_ingestao_automatica.py` (acrescentar ao final)

**Interfaces:**
- Consumes: nada.
- Produces (Task 2 depende): `NOME_MESES: list[str]` (12 nomes pt-BR, índice 0 = Janeiro); `parse_dim_tempo(linhas) -> dict[str, tuple[int, int]]`; `parse_dim_municipio(linhas) -> dict[str, str]` (id → código IBGE, só 7 dígitos); `montar_repasses(linhas_fato, tempo, municipio_ibge, alvo: dict[str, int], anos=None) -> list[dict]` (dicts prontos p/ `ArrecadacaoMensal`).

- [ ] **Step 1: Testes que falham** — acrescentar ao FINAL de `backend/tests/test_ingestao_automatica.py`:

```python
# ── fonte arrecadacao (repasses MG) ──
from datetime import date as _date

from app.services.ingestao_automatica.arrecadacao_mg import (
    montar_repasses,
    parse_dim_municipio,
    parse_dim_tempo,
)


def test_parse_dim_tempo():
    linhas = ["id_tempo;anomes_iso;mes;ano;anomes_formatado",
              "1009;202211;11;2022;11/2022",
              "1189;202605;5;2026;05/2026"]
    assert parse_dim_tempo(linhas) == {"1009": (2022, 11), "1189": (2026, 5)}


def test_parse_dim_municipio_descarta_territorios():
    linhas = ["id_municipio;cd_municipio_ibge;nome",
              "896;37;TERRITORIO ALTO JEQUITINHONHA",
              "474;3109501;CABO VERDE"]
    assert parse_dim_municipio(linhas) == {"474": "3109501"}


def test_montar_repasses_join_e_derivados():
    tempo = {"1009": (2022, 11)}
    mun = {"474": "3109501"}
    fato = ["id_tempo;id_municipio;ano_particao;vr_icms;vr_ipi;vr_ipva",
            "1009;474;2022;161332.64;2712.47;22250.11",
            "1009;999;2022;1.0;1.0;1.0"]          # id_municipio fora das dims → ignorado
    regs = montar_repasses(fato, tempo, mun, {"3109501": 77})
    assert len(regs) == 1
    r = regs[0]
    assert r["municipio_id"] == 77 and r["ano"] == 2022 and r["mes"] == 11
    assert r["nome_mes"] == "Novembro"
    assert r["data_base"] == _date(2022, 11, 1)
    assert r["valor_icms"] == 161332.64 and r["valor_ipi"] == 2712.47 and r["valor_ipva"] == 22250.11
    assert r["valor_total"] == round(161332.64 + 2712.47 + 22250.11, 2)


def test_montar_repasses_filtro_anos_e_alvo():
    tempo = {"1": (2022, 1), "2": (2023, 1)}
    mun = {"474": "3109501", "500": "3106200"}
    fato = ["id_tempo;id_municipio;ano_particao;vr_icms;vr_ipi;vr_ipva",
            "1;474;2022;10;1;2",
            "2;474;2023;20;2;4",
            "2;500;2023;30;3;6"]                   # 3106200 não é alvo
    regs = montar_repasses(fato, tempo, mun, {"3109501": 77}, anos=[2023])
    assert len(regs) == 1
    assert regs[0]["ano"] == 2023 and regs[0]["valor_icms"] == 20.0


def test_montar_repasses_valor_vazio_vira_zero():
    tempo = {"1": (2022, 1)}
    mun = {"474": "3109501"}
    fato = ["id_tempo;id_municipio;ano_particao;vr_icms;vr_ipi;vr_ipva",
            "1;474;2022;;;5.5"]
    r = montar_repasses(fato, tempo, mun, {"3109501": 77})[0]
    assert r["valor_icms"] == 0.0 and r["valor_ipi"] == 0.0 and r["valor_ipva"] == 5.5
    assert r["valor_total"] == 5.5
```

- [ ] **Step 2: Rodar e ver falhar**

Run (de `backend/`): `..\venv\Scripts\python.exe -m pytest tests\test_ingestao_automatica.py -q`
Expected: exit 2, `ModuleNotFoundError: ... arrecadacao_mg`.

- [ ] **Step 3: Criar `backend/app/services/ingestao_automatica/arrecadacao_mg.py`** (parte pura):

```python
"""Fonte automática: Arrecadação — repasses de impostos do Estado de MG aos
municípios (ICMS/IPVA/IPI).

Star schema Frictionless do CKAN dados.mg.gov.br (dataset
transferencia-de-impostos-a-municipios, que alimenta a consulta oficial da
Transparência-MG): fato ft_repasse_mun (~3,6 MB gz, 2007→mês corrente) +
dimensões dm_tempo_mensal e dm_municipio. CSVs gzip UTF-8 BOM ';'. Match por
código IBGE; territórios (códigos curtos) descartados. Upsert por
(município, ano, mês) — o Estado corrige o fato retroativamente. Fonte
MG-only: alvos de outra UF geram um aviso único."""
import csv
import gzip
import logging
from datetime import date

import requests

from app.services.ingestao_automatica.base import FonteAutomatica, ResumoIngestao, registrar

logger = logging.getLogger(__name__)

CKAN_PACKAGE_SHOW = (
    "https://dados.mg.gov.br/api/3/action/package_show"
    "?id=transferencia-de-impostos-a-municipios"
)
_BASE_FALLBACK = "https://dados.mg.gov.br/dataset/5a849756-f55b-4399-860f-b9b08eca0f1a/resource"
URLS_FALLBACK = {
    "ft_repasse_mun": f"{_BASE_FALLBACK}/ebed720b-5c5e-4e38-878b-be800c6e9967/download/ft_repasse_mun.csv.gz",
    "dm_tempo_mensal": f"{_BASE_FALLBACK}/a3a38dfc-2724-4276-9e0f-0b98d4138f09/download/dm_tempo_mensal.csv.gz",
    "dm_municipio": f"{_BASE_FALLBACK}/bf4671ef-1131-497f-9580-e720bb8ad585/download/dm_municipio.csv.gz",
}

NOME_MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
              "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]


def parse_dim_tempo(linhas) -> dict[str, tuple[int, int]]:
    """dm_tempo_mensal → {id_tempo: (ano, mes)}."""
    out: dict[str, tuple[int, int]] = {}
    for row in csv.DictReader(linhas, delimiter=";"):
        out[row["id_tempo"].strip()] = (int(row["ano"]), int(row["mes"]))
    return out


def parse_dim_municipio(linhas) -> dict[str, str]:
    """dm_municipio → {id_municipio: cd_municipio_ibge}, só municípios reais
    (código IBGE de 7 dígitos); territórios/agregados ficam de fora."""
    out: dict[str, str] = {}
    for row in csv.DictReader(linhas, delimiter=";"):
        codigo = (row.get("cd_municipio_ibge") or "").strip()
        if codigo.isdigit() and len(codigo) == 7:
            out[row["id_municipio"].strip()] = codigo
    return out


def _valor(campo) -> float:
    campo = (campo or "").strip()
    return float(campo) if campo else 0.0


def montar_repasses(linhas_fato, tempo, municipio_ibge, alvo: dict[str, int], anos=None) -> list[dict]:
    """Join fato × dims, filtrado pelos municípios-alvo (código IBGE → id) e
    opcionalmente por anos → dicts prontos para ArrecadacaoMensal."""
    anos_set = set(anos) if anos else None
    regs: list[dict] = []
    for row in csv.DictReader(linhas_fato, delimiter=";"):
        codigo = municipio_ibge.get(row["id_municipio"].strip())
        mid = alvo.get(codigo) if codigo else None
        if mid is None:
            continue
        par = tempo.get(row["id_tempo"].strip())
        if par is None:
            continue
        ano, mes = par
        if anos_set is not None and ano not in anos_set:
            continue
        icms, ipi, ipva = _valor(row["vr_icms"]), _valor(row["vr_ipi"]), _valor(row["vr_ipva"])
        regs.append({
            "municipio_id": mid,
            "ano": ano,
            "mes": mes,
            "nome_mes": NOME_MESES[mes - 1],
            "data_base": date(ano, mes, 1),
            "valor_icms": icms,
            "valor_ipva": ipva,
            "valor_ipi": ipi,
            "valor_total": round(icms + ipva + ipi, 2),
        })
    return regs
```

- [ ] **Step 4: Rodar e ver passar**

Run (de `backend/`): `..\venv\Scripts\python.exe -m pytest tests\test_ingestao_automatica.py -q`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ingestao_automatica/arrecadacao_mg.py backend/tests/test_ingestao_automatica.py
git commit -m "feat(ingestao): helpers puros do star schema de repasses MG"
```

---

### Task 2: `executar` + registro no pipeline

**Files:**
- Modify: `backend/app/services/ingestao_automatica/arrecadacao_mg.py` (acrescentar ao final)
- Modify: `backend/app/services/ingestao_automatica/__init__.py` (import após `inss_emps`)
- Modify: `backend/app/services/ingestao_automatica/base.py` (ORDEM_EXECUCAO_TODAS)

**Interfaces:**
- Consumes: helpers da Task 1; `FonteAutomatica/ResumoIngestao/registrar` (base.py).
- Produces: fonte `key="arrecadacao"` no registry.

- [ ] **Step 1: Acrescentar ao final de `arrecadacao_mg.py`:**

```python
def _resolver_urls() -> dict[str, str]:
    """URLs dos 3 resources via API CKAN; cai para as URLs fixas se a API
    estiver fora (mesmo padrão da fonte FPM/STN)."""
    urls = dict(URLS_FALLBACK)
    try:
        resp = requests.get(CKAN_PACKAGE_SHOW, timeout=30)
        resp.raise_for_status()
        for recurso in resp.json()["result"]["resources"]:
            url = recurso.get("url") or ""
            for chave in urls:
                if chave in url:
                    urls[chave] = url
    except (requests.RequestException, KeyError, ValueError) as exc:
        logger.warning("CKAN de MG indisponível (%s); usando URLs fixas.", exc)
    return urls


def _baixar_gz_linhas(url: str) -> list[str]:
    resp = requests.get(url, timeout=(30, 300), headers={"User-Agent": "Mozilla/5.0"})
    resp.raise_for_status()
    return gzip.decompress(resp.content).decode("utf-8-sig").splitlines()


def executar(db, municipios, anos=None, usuario_id=None, notificar=True, progresso=None) -> ResumoIngestao:
    from app.models.arrecadacao import ArrecadacaoMensal

    resumo = ResumoIngestao(dataset="arrecadacao")

    fora_mg = [m for m in municipios if (m.estado or "").upper() != "MG"]
    de_mg = [m for m in municipios if (m.estado or "").upper() == "MG"]
    if fora_mg:
        resumo.erros.append(
            f"fonte cobre apenas municípios de MG — {len(fora_mg)} município(s) de outra(s) UF ignorado(s)"
        )
        resumo.municipios_erro += len(fora_mg)

    alvo = {str(m.codigo_ibge).strip(): m.id for m in de_mg if m.codigo_ibge}
    for m in de_mg:
        if not m.codigo_ibge:
            resumo.erros.append(f"{m.nome}/{m.estado}: sem codigo_ibge cadastrado")
            resumo.municipios_erro += 1
    if not alvo:
        return resumo

    if progresso:
        progresso(0, len(alvo), "baixando repasses de MG (CKAN)")
    try:
        urls = _resolver_urls()
        tempo = parse_dim_tempo(_baixar_gz_linhas(urls["dm_tempo_mensal"]))
        municipio_ibge = parse_dim_municipio(_baixar_gz_linhas(urls["dm_municipio"]))
        linhas_fato = _baixar_gz_linhas(urls["ft_repasse_mun"])
    except requests.RequestException as exc:
        resumo.erros.append(f"repasses de MG: indisponível ({exc})")
        resumo.municipios_erro += len(alvo)
        return resumo

    if progresso:
        progresso(0, len(alvo), "cruzando fato × dimensões")
    regs = montar_repasses(linhas_fato, tempo, municipio_ibge, alvo, anos=anos)

    mids = {r["municipio_id"] for r in regs}
    existentes = {
        (r.municipio_id, r.ano, r.mes): r
        for r in db.query(ArrecadacaoMensal).filter(ArrecadacaoMensal.municipio_id.in_(mids)).all()
    } if mids else {}
    for r in regs:
        reg = existentes.get((r["municipio_id"], r["ano"], r["mes"]))
        if reg:
            for coluna, valor in r.items():
                setattr(reg, coluna, valor)
        else:
            db.add(ArrecadacaoMensal(**r))
        resumo.linhas += 1
    db.commit()

    resumo.municipios_ok = len(mids)
    faltantes = set(alvo.values()) - mids
    resumo.municipios_erro += len(faltantes)
    if faltantes:
        nomes = {m.id: f"{m.nome}/{m.estado}" for m in de_mg}
        for mid in sorted(faltantes):
            resumo.erros.append(f"{nomes.get(mid, mid)}: não encontrado nos repasses de MG")
    if progresso:
        progresso(len(mids), len(alvo), "repasses gravados")
    return resumo


registrar(FonteAutomatica(
    key="arrecadacao",
    label="Arrecadação (repasses MG)",
    fonte="SEF-MG via dados.mg.gov.br — repasses mensais de ICMS, IPVA e IPI aos municípios (consulta oficial da Transparência-MG)",
    executar=executar,
))
```

- [ ] **Step 2: Import no `__init__.py`** — após a linha do `inss_emps`:

```python
from app.services.ingestao_automatica import arrecadacao_mg  # noqa: F401
```

- [ ] **Step 3: ORDEM_EXECUCAO_TODAS** — em `base.py`, inserir `"arrecadacao",` depois de `"inss",`:

```python
    "bolsa_familia",
    "pe_de_meia",
    "inss",
    "arrecadacao",
    "captacao_federal",
    "emendas",
]
```

- [ ] **Step 4: Suíte completa**

Run (de `backend/`): `..\venv\Scripts\python.exe -m pytest tests -q`
Expected: exit 0 (paridade da ORDEM agora com 12 fontes).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ingestao_automatica/arrecadacao_mg.py backend/app/services/ingestao_automatica/__init__.py backend/app/services/ingestao_automatica/base.py
git commit -m "feat(ingestao): fonte automatica arrecadacao via CKAN de MG"
```

---

### Task 3: E2E real contra a Railway (1 município)

**Files:**
- Create (scratchpad, NÃO commitar): script E2E service-level

**Interfaces:**
- Consumes: fonte `arrecadacao` registrada (Task 2); banco Railway via `backend/.env`.
- Produces: evidência para conferência visual em /app/arrecadacao.

- [ ] **Step 1: Script E2E no scratchpad:**

```python
"""E2E: fonte arrecadacao para Cabo Verde/MG contra a Railway."""
from app.db.session import SessionLocal
from app.models.municipio import Municipio
from app.models.arrecadacao import ArrecadacaoMensal
from app.services.ingestao_automatica import FONTES_AUTOMATICAS

db = SessionLocal()
m = db.query(Municipio).filter(Municipio.nome == "Cabo Verde", Municipio.estado == "MG").one()
antes = db.query(ArrecadacaoMensal).filter(ArrecadacaoMensal.municipio_id == m.id).count()
print(f"município id={m.id} ibge={m.codigo_ibge} | linhas ANTES: {antes}")

resumo = FONTES_AUTOMATICAS["arrecadacao"].executar(
    db, [m], anos=None, notificar=False, progresso=lambda a, t, e: print(f"  {e}"))
print(f"resumo: linhas={resumo.linhas} ok={resumo.municipios_ok} erros={resumo.erros}")

depois = db.query(ArrecadacaoMensal).filter(ArrecadacaoMensal.municipio_id == m.id).count()
ult = (db.query(ArrecadacaoMensal).filter(ArrecadacaoMensal.municipio_id == m.id)
       .order_by(ArrecadacaoMensal.ano.desc(), ArrecadacaoMensal.mes.desc()).limit(3).all())
print(f"linhas DEPOIS: {depois}")
for r in ult:
    print(f"  {r.ano}-{r.mes:02d} {r.nome_mes}: ICMS={r.valor_icms:,.2f} IPVA={r.valor_ipva:,.2f} IPI={r.valor_ipi:,.2f} total={r.valor_total:,.2f}")
db.close()
```

- [ ] **Step 2: Rodar** (de `backend/`, PYTHONPATH=`.`): `..\venv\Scripts\python.exe <scratchpad>\e2e_arrecadacao.py`
Expected: ~230+ linhas (série 2007→2026), últimos meses de 2026 presentes, valores mensais na casa de centenas de milhares de reais para Cabo Verde, `erros: []`.

- [ ] **Step 3: Conferência visual** — usuário abre /app/arrecadacao de Cabo Verde e valida a série.

- [ ] **Step 4: Nada a commitar** (script fica no scratchpad).

---

## Self-Review

- **Spec coverage:** upstream CKAN+fallback (Task 2 `_resolver_urls`), gzip/BOM/`;` (Task 1-2), territórios descartados (Task 1), derivados NOT NULL (Task 1), upsert real (Task 2), série completa + filtro anos (Task 1), aviso único fora-MG (Task 2), integração registry/ORDEM (Task 2), testes puros (Task 1), suíte (Task 2 Step 4), E2E (Task 3). VAF adiado — sem task, conforme spec. ✓
- **Placeholder scan:** sem TBD/TODO; código completo. ✓
- **Type consistency:** `parse_dim_tempo → dict[str, tuple[int,int]]` e `parse_dim_municipio → dict[str, str]` alimentam `montar_repasses(..., alvo: dict[str,int], anos)` → `list[dict]` com as chaves exatas de `ArrecadacaoMensal`; `_resolver_urls → dict[str,str]` com as mesmas 3 chaves de `URLS_FALLBACK`. ✓
