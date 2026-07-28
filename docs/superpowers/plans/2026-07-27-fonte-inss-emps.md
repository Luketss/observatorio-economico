# Fonte Automática INSS (EMPS) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fonte automática `inss` que baixa o XLSX anual do EMPS (gov.br/previdência), agrega por categoria oficial e faz replace por (município, ano) na tabela `inss_anual` existente.

**Architecture:** Um módulo novo `inss_emps.py` no pacote `ingestao_automatica`, seguindo o padrão das 10 fontes existentes: funções puras testáveis (parse/montagem) + `executar(db, municipios, ...)` + `registrar(FonteAutomatica(...))`. O runner, o `/admin/fontes` e o meta-job "todas" pegam a fonte automaticamente pelo registry; só é preciso importar o módulo no `__init__.py` e inserir a key em `ORDEM_EXECUCAO_TODAS`.

**Tech Stack:** Python 3.13, requests, openpyxl (dependência NOVA — leitura de XLSX), SQLAlchemy, pytest.

## Global Constraints

- URL do EMPS: `https://www.gov.br/previdencia/pt-br/assuntos/previdencia-social/arquivos/ben_municipios_especie_{ano}.xlsx` (~3 MB/ano; padrão vale para anos ≥ 2019).
- Layout validado (2024): abas `Qtd_dez{ano}` e `Valor_Total_{ano}` (resolver por prefixo `qtd` / `valor_total` — sufixo varia), colunas A–M, header em L5–L7, dados da L8 em diante; linha de dados = célula B com código IBGE de 7 dígitos.
- Categorias gravadas (colunas 0-based 4,5,6,7,8,9,11): Aposentadorias por idade / por invalidez / por tempo de contribuição, Pensões por morte, Auxílios, Outros benefícios previdenciários, Benefícios assistenciais. NUNCA gravar subtotais (colunas 3, 10) nem Total (12).
- `quantidade_beneficios` = aba Qtd (estoque de dezembro); `valor_anual` = aba Valor_Total.
- REPLACE por (município, ano): delete + insert das 7 categorias por município coberto.
- Anos default: dois últimos anos-calendário encerrados; ano com 403/404 vira aviso "ainda não publicado pela Previdência" (usar `eh_nao_publicado` de `util.py`).
- Testes puros em `backend/tests/` (nunca abrem DB/rede); rodar pytest de `backend/` com o venv da raiz (`..\venv\Scripts\python.exe -m pytest`); o resumo do pytest é engolido nesta máquina — confiar no exit code.
- Teste de paridade existente exige: `set(ORDEM_EXECUCAO_TODAS) == set(FONTES_AUTOMATICAS)` e `ORDEM_EXECUCAO_TODAS[-2:] == ["captacao_federal", "emendas"]`.
- Spec: `docs/superpowers/specs/2026-07-27-fontes-ips-inss-design.md`.

---

### Task 1: Helpers puros do parse EMPS (TDD)

**Files:**
- Create: `backend/app/services/ingestao_automatica/inss_emps.py` (só a parte pura nesta task)
- Test: `backend/tests/test_ingestao_automatica.py` (acrescentar ao final)

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces (Task 2 depende): `CATEGORIAS: list[tuple[int, str]]`; `parse_emps_aba(rows) -> dict[str, dict[str, float]]` (código IBGE → {categoria: valor}); `montar_registros(qtd_por_codigo, valor_por_codigo, alvo: dict[str, int], ano: int) -> list[dict]` (dicts prontos p/ `InssAnual(**d)`); `achar_aba(sheetnames: list[str], prefixo: str) -> str | None`.

- [ ] **Step 1: Escrever os testes que falham** — acrescentar ao FINAL de `backend/tests/test_ingestao_automatica.py`:

```python
# ── fonte inss (EMPS) ──
from app.services.ingestao_automatica.inss_emps import (
    CATEGORIAS,
    achar_aba,
    montar_registros,
    parse_emps_aba,
)


def test_parse_emps_aba_so_linhas_com_codigo_ibge_7_digitos():
    rows = [
        ("Nome ", "Código IBGE", "UF", "hdr", "hdr", "hdr", "hdr", "hdr", "hdr", "hdr", "hdr", "hdr", "hdr"),
        ("Água Branca", "2700102", "AL", 2586, 2126, 318, 142, 907, 178, 8, 3679, 642, 4321),
        ("Total Brasil", None, "", 9, 9, 9, 9, 9, 9, 9, 9, 9, 9),
        ("Fonte: SÍNTESE/Dataprev", "", "", None, None, None, None, None, None, None, None, None, None),
    ]
    out = parse_emps_aba(rows)
    assert list(out) == ["2700102"]
    assert out["2700102"]["Aposentadorias por idade"] == 2126.0
    assert out["2700102"]["Pensões por morte"] == 907.0
    assert out["2700102"]["Benefícios assistenciais"] == 642.0
    # subtotais/total NÃO viram categoria
    assert len(out["2700102"]) == len(CATEGORIAS) == 7


def test_parse_emps_aba_codigo_numerico_e_celulas_vazias():
    rows = [("Cidade X", 3122306, "MG", 10, 4, None, 3, 2, "", 1, 10, 5, 15)]
    out = parse_emps_aba(rows)
    assert "3122306" in out
    assert out["3122306"]["Aposentadorias por invalidez"] == 0.0   # None → 0
    assert out["3122306"]["Auxílios"] == 0.0                        # "" → 0
    assert out["3122306"]["Outros benefícios previdenciários"] == 1.0


def test_montar_registros_casa_qtd_e_valor():
    qtd = parse_emps_aba([("A", "2700102", "AL", 13, 4, 3, 3, 2, 1, 0, 13, 5, 18)])
    val = parse_emps_aba([("A", "2700102", "AL", 130.0, 40.0, 30.0, 30.0, 20.55, 10.0, 0.0, 130.55, 50.0, 180.55)])
    regs = montar_registros(qtd, val, {"2700102": 77}, 2024)
    assert len(regs) == 7
    r = next(x for x in regs if x["categoria"] == "Pensões por morte")
    assert r == {"municipio_id": 77, "ano": 2024, "categoria": "Pensões por morte",
                 "quantidade_beneficios": 2, "valor_anual": 20.55}


def test_montar_registros_ignora_alvo_fora_do_emps():
    assert montar_registros({}, {}, {"9999999": 1}, 2024) == []


def test_achar_aba_por_prefixo_case_insensitive():
    abas = ["Qtd_dez2024", "Valor_R$_dez24", "Valor_Médio_R$_dez24", "Valor_Total_2024"]
    assert achar_aba(abas, "qtd") == "Qtd_dez2024"
    assert achar_aba(abas, "valor_total") == "Valor_Total_2024"   # não confunde com Valor_R$
    assert achar_aba(abas, "xyz") is None
```

- [ ] **Step 2: Rodar e ver falhar**

Run (de `backend/`): `..\venv\Scripts\python.exe -m pytest tests\test_ingestao_automatica.py -q`
Expected: exit 2, `ImportError: cannot import name ... from 'app.services.ingestao_automatica.inss_emps'` (módulo inexistente).

- [ ] **Step 3: Criar `backend/app/services/ingestao_automatica/inss_emps.py`** (parte pura):

```python
"""Fonte automática: INSS — benefícios por município (EMPS/MPS).

XLSX anual nacional das Estatísticas Municipais da Previdência Social
(SÍNTESE/Dataprev): ben_municipios_especie_{ano}.xlsx (~3 MB, anos >= 2019).
Abas Qtd_dez{ano} (estoque de benefícios em dezembro) e Valor_Total_{ano}
(valor emitido no ano) — mesmas colunas A–M, header em 3 linhas mescladas,
dados a partir da linha cujo campo B é código IBGE de 7 dígitos.
REPLACE por (município, ano) com as 7 categorias-folha oficiais (subtotais
e Total ficam de fora — dupla contagem)."""
import io
from datetime import date

import requests

from app.services.ingestao_automatica.base import FonteAutomatica, ResumoIngestao, registrar
from app.services.ingestao_automatica.util import eh_nao_publicado

URL = "https://www.gov.br/previdencia/pt-br/assuntos/previdencia-social/arquivos/ben_municipios_especie_{ano}.xlsx"
INICIO_SERIE = 2019  # anos anteriores existem com nomes/paths antigos fora do padrão

# (índice 0-based na linha, nome da categoria) — só folhas mutuamente
# exclusivas: somam o Total (col 12); subtotais 3 e 10 ficam de fora.
CATEGORIAS: list[tuple[int, str]] = [
    (4, "Aposentadorias por idade"),
    (5, "Aposentadorias por invalidez"),
    (6, "Aposentadorias por tempo de contribuição"),
    (7, "Pensões por morte"),
    (8, "Auxílios"),
    (9, "Outros benefícios previdenciários"),
    (11, "Benefícios assistenciais"),
]


def parse_emps_aba(rows) -> dict[str, dict[str, float]]:
    """Linhas de uma aba do EMPS → {codigo_ibge: {categoria: valor}}.
    Linha de dados = campo B (índice 1) com código IBGE de 7 dígitos; o resto
    (headers mesclados, totais Brasil, rodapés) é ignorado."""
    out: dict[str, dict[str, float]] = {}
    for row in rows:
        codigo = str(row[1] if len(row) > 1 and row[1] is not None else "").strip()
        if not (codigo.isdigit() and len(codigo) == 7):
            continue
        vals: dict[str, float] = {}
        for idx, categoria in CATEGORIAS:
            v = row[idx] if len(row) > idx else None
            vals[categoria] = float(v) if v is not None and str(v).strip() != "" else 0.0
        out[codigo] = vals
    return out


def montar_registros(qtd_por_codigo, valor_por_codigo, alvo: dict[str, int], ano: int) -> list[dict]:
    """Casa Qtd × Valor por código IBGE dos municípios-alvo → dicts prontos
    para InssAnual(**d). Município ausente das DUAS abas fica de fora."""
    regs: list[dict] = []
    for codigo, mid in alvo.items():
        qtd = qtd_por_codigo.get(codigo)
        val = valor_por_codigo.get(codigo)
        if qtd is None and val is None:
            continue
        for _, categoria in CATEGORIAS:
            regs.append({
                "municipio_id": mid,
                "ano": ano,
                "categoria": categoria,
                "quantidade_beneficios": int((qtd or {}).get(categoria, 0.0)),
                "valor_anual": round((val or {}).get(categoria, 0.0), 2),
            })
    return regs


def achar_aba(sheetnames: list[str], prefixo: str) -> str | None:
    """Resolve aba por prefixo case-insensitive ('qtd', 'valor_total') — o
    sufixo varia entre anos (dez2024 vs dez24)."""
    for nome in sheetnames:
        if nome.lower().startswith(prefixo.lower()):
            return nome
    return None
```

- [ ] **Step 4: Rodar e ver passar**

Run (de `backend/`): `..\venv\Scripts\python.exe -m pytest tests\test_ingestao_automatica.py -q`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ingestao_automatica/inss_emps.py backend/tests/test_ingestao_automatica.py
git commit -m "feat(ingestao): helpers puros do parse EMPS (fonte inss)"
```

---

### Task 2: `executar` + registro no pipeline

**Files:**
- Modify: `backend/app/services/ingestao_automatica/inss_emps.py` (acrescentar `executar` + `registrar` ao final)
- Modify: `backend/app/services/ingestao_automatica/__init__.py` (import do módulo)
- Modify: `backend/app/services/ingestao_automatica/base.py:38-49` (ORDEM_EXECUCAO_TODAS)
- Modify: `backend/requirements.txt` (openpyxl)

**Interfaces:**
- Consumes: `CATEGORIAS`, `parse_emps_aba`, `montar_registros`, `achar_aba` (Task 1); `eh_nao_publicado` (util.py); `FonteAutomatica/ResumoIngestao/registrar` (base.py).
- Produces: fonte `key="inss"` no registry — runner, `/admin/fontes` e meta-job "todas" a consomem sem código novo.

- [ ] **Step 1: Acrescentar ao final de `inss_emps.py`:**

```python
def executar(db, municipios, anos=None, usuario_id=None, notificar=True, progresso=None) -> ResumoIngestao:
    import openpyxl

    from app.models.inss import InssAnual

    resumo = ResumoIngestao(dataset="inss")
    alvo = {str(m.codigo_ibge).strip(): m.id for m in municipios if m.codigo_ibge}
    for m in municipios:
        if not m.codigo_ibge:
            resumo.erros.append(f"{m.nome}/{m.estado}: sem codigo_ibge cadastrado")
            resumo.municipios_erro += 1
    if not alvo:
        return resumo

    ultimo_encerrado = date.today().year - 1
    anos_alvo = sorted({a for a in (anos or [ultimo_encerrado - 1, ultimo_encerrado]) if a >= INICIO_SERIE})
    mids_ok: set[int] = set()
    nao_publicados: list[str] = []

    for i, ano in enumerate(anos_alvo, start=1):
        if progresso:
            progresso(len(mids_ok), len(alvo), f"baixando EMPS {ano} ({i}/{len(anos_alvo)})")
        try:
            resp = requests.get(URL.format(ano=ano), timeout=(30, 300),
                                headers={"User-Agent": "Mozilla/5.0"})
            resp.raise_for_status()
        except requests.RequestException as exc:
            if eh_nao_publicado(exc):
                nao_publicados.append(str(ano))
            else:
                resumo.erros.append(f"EMPS {ano}: indisponível ({exc})")
            continue

        wb = openpyxl.load_workbook(io.BytesIO(resp.content), read_only=True, data_only=True)
        aba_qtd = achar_aba(wb.sheetnames, "qtd")
        aba_valor = achar_aba(wb.sheetnames, "valor_total")
        if not aba_qtd or not aba_valor:
            resumo.erros.append(f"EMPS {ano}: abas não reconhecidas ({wb.sheetnames}) — layout mudou?")
            continue
        qtd = parse_emps_aba(wb[aba_qtd].iter_rows(values_only=True))
        val = parse_emps_aba(wb[aba_valor].iter_rows(values_only=True))
        regs = montar_registros(qtd, val, alvo, ano)

        mids_do_ano = {r["municipio_id"] for r in regs}
        if mids_do_ano:
            db.query(InssAnual).filter(
                InssAnual.municipio_id.in_(mids_do_ano), InssAnual.ano == ano,
            ).delete(synchronize_session=False)
        for r in regs:
            db.add(InssAnual(**r))
        db.commit()
        resumo.linhas += len(regs)
        mids_ok |= mids_do_ano
        if progresso:
            progresso(len(mids_ok), len(alvo), f"EMPS {ano} gravado")

    if nao_publicados:
        anos_txt = ", ".join(nao_publicados)
        plural = "s" if len(nao_publicados) > 1 else ""
        resumo.erros.append(f"EMPS: ano{plural} {anos_txt} ainda não publicado{plural} pela Previdência")

    resumo.municipios_ok = len(mids_ok)
    faltantes = set(alvo.values()) - mids_ok
    resumo.municipios_erro += len(faltantes)
    if faltantes:
        nomes = {m.id: f"{m.nome}/{m.estado}" for m in municipios}
        for mid in sorted(faltantes):
            resumo.erros.append(f"{nomes.get(mid, mid)}: não encontrado no EMPS")
    return resumo


registrar(FonteAutomatica(
    key="inss",
    label="INSS (EMPS/Previdência)",
    fonte="EMPS — Estatísticas Municipais da Previdência Social (MPS/Dataprev): benefícios emitidos por município e categoria",
    executar=executar,
))
```

- [ ] **Step 2: Import no `__init__.py`** — acrescentar após a linha do `pe_de_meia_portal`:

```python
from app.services.ingestao_automatica import inss_emps  # noqa: F401
```

- [ ] **Step 3: ORDEM_EXECUCAO_TODAS** — em `base.py`, inserir `"inss",` depois de `"pe_de_meia",` (mantendo `captacao_federal`/`emendas` como últimas):

```python
ORDEM_EXECUCAO_TODAS = [
    "populacao",
    "fpm",
    "pib",
    "pix",
    "comex",
    "estban",
    "bolsa_familia",
    "pe_de_meia",
    "inss",
    "captacao_federal",
    "emendas",
]
```

- [ ] **Step 4: Dependência** — acrescentar em `backend/requirements.txt`:

```
openpyxl==3.1.5
```

(Já instalada no venv da raiz em 2026-07-27; a linha garante o deploy na Railway.)

- [ ] **Step 5: Suíte completa**

Run (de `backend/`): `..\venv\Scripts\python.exe -m pytest tests -q`
Expected: exit 0 — inclui o teste de paridade de `ORDEM_EXECUCAO_TODAS` (agora com 11 fontes) e o de `captacao_federal`/`emendas` no fim.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/ingestao_automatica/inss_emps.py backend/app/services/ingestao_automatica/__init__.py backend/app/services/ingestao_automatica/base.py backend/requirements.txt
git commit -m "feat(ingestao): fonte automatica inss via EMPS da Previdencia"
```

---

### Task 3: E2E real contra a Railway (1 município)

**Files:**
- Create (scratchpad, NÃO commitar): script E2E service-level

**Interfaces:**
- Consumes: fonte `inss` registrada (Task 2); banco da Railway via `backend/.env`.
- Produces: evidência de dados reais em `inss_anual` para conferência visual em /app/inss.

- [ ] **Step 1: Script E2E no scratchpad** (service-level, sem HTTP/JWT — mesmo padrão dos E2E anteriores):

```python
"""E2E: fonte inss para Cabo Verde/MG contra a Railway."""
from app.db.session import SessionLocal
from app.models.municipio import Municipio
from app.models.inss import InssAnual
from app.services.ingestao_automatica import FONTES_AUTOMATICAS

db = SessionLocal()
m = db.query(Municipio).filter(Municipio.nome == "Cabo Verde", Municipio.estado == "MG").one()
resumo = FONTES_AUTOMATICAS["inss"].executar(db, [m], anos=[2024], notificar=False,
                                             progresso=lambda a, t, e: print(f"  {e}"))
print("linhas:", resumo.linhas, "| ok:", resumo.municipios_ok, "| erros:", resumo.erros)
for r in db.query(InssAnual).filter(InssAnual.municipio_id == m.id, InssAnual.ano == 2024).all():
    print(f"  {r.categoria}: qtd={r.quantidade_beneficios} valor={r.valor_anual}")
db.close()
```

- [ ] **Step 2: Rodar** (de `backend/`, com PYTHONPATH=`.`): `..\venv\Scripts\python.exe <scratchpad>\e2e_inss.py`
Expected: `linhas: 7`, 7 categorias impressas com valores plausíveis (aposentadorias na casa de milhares de benefícios/dezenas de milhões de R$ para um município pequeno), `erros: []`.

- [ ] **Step 3: Conferir a página** — usuário abre /app/inss de Cabo Verde e valida o gráfico com as novas categorias.

- [ ] **Step 4: Nada a commitar** (script fica no scratchpad). Registrar resultado no resumo final ao usuário.

---

## Self-Review

- **Spec coverage:** upstream/layout/categorias/semântica (Task 1-2), replace por (município,ano) (Task 2 Step 1), anos default + aviso não-publicado (Task 2 Step 1), integração registry/ORDEM/requirements (Task 2 Steps 2-4), testes puros (Task 1), suíte (Task 2 Step 5), E2E + conferência visual (Task 3). IPS adiado — sem task, conforme spec. ✓
- **Placeholder scan:** sem TBD/TODO; todo código completo. ✓
- **Type consistency:** `parse_emps_aba` → `dict[str, dict[str, float]]` consumido por `montar_registros(qtd, val, alvo: dict[str,int], ano)` → `list[dict]` com chaves exatas de `InssAnual`; `achar_aba(list[str], str) -> str|None` usado em `executar`. ✓
