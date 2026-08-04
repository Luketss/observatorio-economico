# Fonte automática Empresas/CNPJ (dados abertos RFB) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fonte automática `cnpj` no registry: baixa o snapshot mensal do cadastro CNPJ (share Nextcloud/SERPRO da RFB, ~7,6GB), filtra os municípios-alvo em duas passadas (Estabelecimentos → Empresas/Simples) e faz REPLACE por município na tabela `empresas`.

**Architecture:** Módulo `cnpj_rfb.py` com núcleo puro (parse posicional sem header, match TOM→nome+UF, matriz preferida, junção das passadas) + transporte HTTP/WebDAV streaming (um zip por vez, parse de DENTRO do zip sem extração). Parsers de valores byte-compatíveis com `carregar_cnpj.py` (paridade: datas AAAAMMDD, capital com vírgula, MEI data-como-flag). Spec: `docs/superpowers/specs/2026-08-04-fonte-cnpj-design.md`.

**Tech Stack:** Python 3.11, requests (streaming), zipfile stdlib, SQLAlchemy 2.0, pytest.

## Global Constraints

- **Zero frontend, zero migração de schema, zero dependência nova.**
- Gate por task: `venv/Scripts/python -m pytest backend/tests -q` da RAIZ → exit 0 (248 atuais + novos). Suite `tests/` da raiz NÃO é gate.
- Branch: `feat/fonte-cnpj`, criada na Task 1 a partir da `main`.
- WIP do usuário — NÃO commitar: `.claude/settings.local.json`, `dados/`, `docs/superpowers/plans/2026-05-06-ips-feature.md`; `README.md` conferir `git status` antes.
- **Paridade de parsing com `carregar_cnpj.py`** (dados novos e manuais convivem): `_parse_data` (AAAAMMDD), `_parse_capital` (remove `.` de milhar, `,`→`.`), `_parse_bool` (S/SIM/1/TRUE), `_parse_mei` (S/N OU data AAAAMMDD como flag) — transcritos verbatim.
- Códigos crus preservados (`situacao` "02", `porte` "05") — a página filtra por código.
- `razao_social` é NOT NULL no model: fallback `nome_fantasia or ""` quando a passada 2 não cobrir.
- Regra "nenhum descarte silencioso": TOM desconhecido contado e audível; linha malformada contada; guarda "layout mudou?" por contagem de colunas (30/7/7/2) na 1ª linha de cada arquivo.
- Se QUALQUER zip de Estabelecimentos falhar → gravação inteira ABORTADA (snapshot parcial nunca vira REPLACE); falha só em Empresas/Simples degrada com aviso.
- `"cnpj"` entra em `FONTES_FORA_DO_TODAS` (base.py) e NÃO em `ORDEM_EXECUCAO_TODAS`.

---

## File Map

| File | Action |
|---|---|
| `backend/app/services/ingestao_automatica/cnpj_rfb.py` | Create — fonte completa |
| `backend/app/services/ingestao_automatica/base.py` | Modify — `"cnpj"` no `FONTES_FORA_DO_TODAS` |
| `backend/app/services/ingestao_automatica/__init__.py` | Modify — 1 import |
| `backend/tests/test_cnpj_rfb.py` | Create — testes puros |
| `README.md` | Modify (Task 3) — linha na tabela de fontes |

---

### Task 1: Núcleo puro — layouts, parse, match e junção (TDD)

**Files:**
- Create: `backend/app/services/ingestao_automatica/cnpj_rfb.py` (parte 1)
- Test: `backend/tests/test_cnpj_rfb.py`

**Interfaces:**
- Consumes: `norm_nome_municipio` de `app.services.ingestao_automatica.util` (existente).
- Produces (Task 2 depende): `carregar_mapa_tom(fobj) -> dict`, `indexar_alvos(municipios) -> dict[(nome_norm, uf)] -> mid`, `processar_estabelecimentos(fobj, mapa_tom, alvos, colhidas, stats) -> None`, `processar_empresas(fobj, cnpjs, dados_emp)`, `processar_simples(fobj, cnpjs, dados_simples)`, `montar_linhas(colhidas, dados_emp, dados_simples) -> dict[mid] -> list[dict]`, `validar_colunas(row, esperado, arquivo)`, constantes `COLS_ESTAB=30, COLS_EMPRESAS=7, COLS_SIMPLES=7, COLS_MUNICIPIOS=2`.

- [ ] **Step 0: Criar a branch**

```bash
cd c:\Users\lucas\Documents\projetos\dashboard_prefeituras
git checkout main && git checkout -b feat/fonte-cnpj
```

- [ ] **Step 1: Escrever os testes que falham**

```python
# backend/tests/test_cnpj_rfb.py
"""Núcleo puro da fonte CNPJ/RFB — sem rede, sem DB.

Arquivos reais: CSV ';' com aspas, latin-1, SEM header, posicionais
(Estabelecimentos 30 colunas, Empresas 7, Simples 7, Municípios 2).
Município nas linhas de Estabelecimentos = código TOM da RFB (não IBGE);
match via mapa TOM->nome + UF da própria linha."""
import io
from unittest.mock import MagicMock

import pytest

from app.services.ingestao_automatica.cnpj_rfb import (
    COLS_ESTAB,
    carregar_mapa_tom,
    indexar_alvos,
    montar_linhas,
    processar_empresas,
    processar_estabelecimentos,
    processar_simples,
    validar_colunas,
)


def _mun(mid, nome, estado):
    m = MagicMock()
    m.id, m.nome, m.estado = mid, nome, estado
    return m


ALVOS_MUNS = [_mun(1, "Belo Horizonte", "MG")]


def _csv(linhas):
    return io.StringIO("\n".join(linhas))


def _estab(cnpj="12345678", matriz="1", fantasia="PADARIA X", situacao="02",
           data_ini="20200115", cnae="4721102", uf="MG", tom="4123"):
    campos = [""] * COLS_ESTAB
    campos[0], campos[3], campos[4], campos[5] = cnpj, matriz, fantasia, situacao
    campos[10], campos[11], campos[19], campos[20] = data_ini, cnae, uf, tom
    return ";".join(f'"{c}"' for c in campos)


MAPA_TOM = {"4123": "BELO HORIZONTE", "7107": "SAO PAULO"}


def _roda_estab(linhas, alvos=None):
    alvos = alvos if alvos is not None else indexar_alvos(ALVOS_MUNS)
    colhidas, stats = {}, {"tom_desconhecido": 0, "malformadas": 0}
    processar_estabelecimentos(_csv(linhas), MAPA_TOM, alvos, colhidas, stats)
    return colhidas, stats


def test_indexar_alvos_normaliza_nome_e_uf():
    alvos = indexar_alvos([_mun(7, "São Paulo", "sp")])
    assert list(alvos.values()) == [7]
    (chave,) = alvos
    assert chave[1] == "SP"


def test_carregar_mapa_tom():
    mapa = carregar_mapa_tom(_csv(['"4123";"BELO HORIZONTE"', '"7107";"SAO PAULO"']))
    assert mapa == MAPA_TOM


def test_estabelecimento_do_alvo_e_colhido():
    colhidas, stats = _roda_estab([_estab()])
    assert (1, "12345678") in colhidas
    e = colhidas[(1, "12345678")]
    assert e["situacao"] == "02" and e["cnae_fiscal"] == "4721102"
    assert e["nome_fantasia"] == "PADARIA X" and e["matriz"] is True
    assert stats["tom_desconhecido"] == 0


def test_fora_do_alvo_uf_ou_tom_diferente_ignorado():
    colhidas, _ = _roda_estab([_estab(tom="7107", uf="SP")])
    assert colhidas == {}


def test_matriz_preferida_sobre_filial():
    colhidas, _ = _roda_estab([
        _estab(matriz="2", fantasia="FILIAL"),
        _estab(matriz="1", fantasia="MATRIZ"),
        _estab(matriz="2", fantasia="OUTRA FILIAL"),
    ])
    assert colhidas[(1, "12345678")]["nome_fantasia"] == "MATRIZ"


def test_tom_desconhecido_e_contado_nao_silencioso():
    colhidas, stats = _roda_estab([_estab(tom="9998")])
    assert colhidas == {} and stats["tom_desconhecido"] == 1


def test_linha_malformada_contada_apos_primeira():
    colhidas, stats = _roda_estab([_estab(), '"so";"tres";"campos"'])
    assert (1, "12345678") in colhidas
    assert stats["malformadas"] == 1


def test_validar_colunas_layout_mudou():
    with pytest.raises(ValueError, match="layout mudou"):
        validar_colunas(["a", "b"], COLS_ESTAB, "Estabelecimentos0")


def test_processar_empresas_filtra_por_cnpj_e_parseia_capital():
    dados = {}
    processar_empresas(
        _csv(['"12345678";"PADARIA X LTDA";"2062";"49";"1.000,50";"01";""',
              '"99999999";"OUTRA";"2062";"49";"5,00";"05";""']),
        {"12345678"}, dados)
    assert set(dados) == {"12345678"}
    assert dados["12345678"]["razao_social"] == "PADARIA X LTDA"
    assert dados["12345678"]["capital_social"] == 1000.5
    assert dados["12345678"]["porte"] == "01"


def test_processar_simples_flags():
    dados = {}
    processar_simples(
        _csv(['"12345678";"S";"20200101";"";"20200101";"20200101";""']),
        {"12345678"}, dados)
    assert dados["12345678"]["opcao_simples"] is True
    assert dados["12345678"]["opcao_mei"] is True  # data AAAAMMDD vale como flag


def test_montar_linhas_junta_passadas_e_faz_fallback_de_razao():
    colhidas = {(1, "12345678"): {"nome_fantasia": "PADARIA X", "situacao": "02",
                                  "data_inicio": "20200115", "cnae_fiscal": "4721102",
                                  "matriz": True}}
    linhas = montar_linhas(colhidas, {}, {})  # passada 2 vazia (degradada)
    (row,) = linhas[1]
    assert row["razao_social"] == "PADARIA X"  # fallback: nome_fantasia
    assert row["opcao_simples"] is False and row["opcao_mei"] is False
    assert str(row["data_inicio"]) == "2020-01-15"
    assert row["cnpj_basico"] == "12345678"


def test_montar_linhas_com_passada_2_completa():
    colhidas = {(1, "12345678"): {"nome_fantasia": None, "situacao": "08",
                                  "data_inicio": "", "cnae_fiscal": "4721102",
                                  "matriz": False}}
    linhas = montar_linhas(
        colhidas,
        {"12345678": {"razao_social": "R" * 200, "capital_social": 10.0, "porte": "05"}},
        {"12345678": {"opcao_simples": False, "opcao_mei": False}})
    (row,) = linhas[1]
    assert len(row["razao_social"]) == 150  # truncado ao String(150)
    assert row["porte"] == "05" and row["data_inicio"] is None
```

- [ ] **Step 2: Rodar e confirmar que falham**

```bash
venv/Scripts/python -m pytest backend/tests/test_cnpj_rfb.py -q
```

Expected: FAIL — módulo não existe.

- [ ] **Step 3: Criar `cnpj_rfb.py` (parte 1 — núcleo puro)**

```python
"""Fonte automática Empresas/CNPJ — snapshot mensal dos dados abertos da RFB.

Share Nextcloud/SERPRO (WebDAV público; a URL antiga morreu em jan/2026).
Arquivos nacionais SEM header, CSV ';' com aspas, latin-1, posicionais:
Estabelecimentos (30 colunas, único com município — código TOM da RFB, não
IBGE), Empresas (7), Simples (7), auxiliar Municípios (2: TOM -> nome, SEM UF).
Match de município: TOM -> nome (auxiliar) + UF da própria linha, casados com
os alvos via norm_nome_municipio + estado (padrão FPM).

Duas passadas: Estabelecimentos filtra os alvos e colhe cnpj_basico (matriz
preferida); Empresas/Simples completam razão social, porte, capital e opções.
Parsers de valores byte-compatíveis com backend/ingestao/carregar_cnpj.py
(paridade com dados manuais). Códigos crus preservados (situacao "02" etc.).

Gravação: REPLACE por município na tabela empresas (snapshot completo), commit
por município, com anti-wipe (alvo sem estabelecimentos não sofre delete).
Se QUALQUER zip de Estabelecimentos falhar, NADA é gravado (snapshot parcial
geraria REPLACE com menos empresas); falha só em Empresas/Simples degrada com
aviso audível. `anos` e `notificar` são aceitos e ignorados (snapshot corrente,
sem regra de notificação).
ESCALA: ~7,6GB de download por execução (varredura nacional obrigatória) — a
fonte mais pesada da esteira; fora do meta-job, pensada para o worker."""
import contextlib
import csv
import io
import logging
import os
import tempfile
import zipfile
from datetime import datetime

import requests

from app.services.ingestao_automatica.base import (
    FonteAutomatica,
    ResumoIngestao,
    registrar,
)
from app.services.ingestao_automatica.util import norm_nome_municipio

logger = logging.getLogger(__name__)

# Share público oficial da RFB (Nextcloud/SERPRO) — token faz parte da URL
# publicada, não é segredo.
WEBDAV = "https://arquivos.receitafederal.gov.br/public.php/webdav"
SHARE_TOKEN = "YggdBLfdninEJX9"

COLS_ESTAB = 30
COLS_EMPRESAS = 7
COLS_SIMPLES = 7
COLS_MUNICIPIOS = 2

# Posições oficiais (metadados RFB) usadas em cada arquivo
E_CNPJ, E_MATRIZ, E_FANTASIA, E_SITUACAO = 0, 3, 4, 5
E_DATA_INICIO, E_CNAE, E_UF, E_TOM = 10, 11, 19, 20
P_CNPJ, P_RAZAO, P_CAPITAL, P_PORTE = 0, 1, 4, 5
S_CNPJ, S_OPCAO_SIMPLES, S_OPCAO_MEI = 0, 1, 4


# ── Parsers byte-compatíveis com backend/ingestao/carregar_cnpj.py ──────────

def _parse_data(valor: str):
    valor = (valor or "").strip()
    if not valor:
        return None
    try:
        return datetime.strptime(valor, "%Y%m%d").date()
    except ValueError:
        return None


def _parse_capital(valor: str):
    valor = (valor or "").strip()
    if not valor:
        return None
    try:
        return float(valor.replace(".", "").replace(",", "."))
    except ValueError:
        return None


def _parse_bool(valor: str) -> bool:
    return (valor or "").strip().upper() in ("S", "SIM", "1", "TRUE")


def _parse_mei(valor: str) -> bool:
    v = (valor or "").strip().upper()
    if v in ("S", "SIM", "TRUE"):
        return True
    if v in ("", "N", "NAO", "NÃO", "0", "00000000"):
        return False
    return v.isdigit() and len(v) == 8  # data AAAAMMDD de opção vale como flag


# ── Núcleo puro ─────────────────────────────────────────────────────────────

def validar_colunas(row, esperado: int, arquivo: str) -> None:
    if len(row) != esperado:
        raise ValueError(
            f"CNPJ {arquivo}: {len(row)} colunas (esperado {esperado}) — layout mudou?")


def _reader(fobj):
    return csv.reader(fobj, delimiter=";", quotechar='"')


def carregar_mapa_tom(fobj) -> dict:
    """Auxiliar Municípios: código TOM -> nome (sem UF)."""
    mapa = {}
    primeira = True
    for row in _reader(fobj):
        if primeira:
            validar_colunas(row, COLS_MUNICIPIOS, "Municipios")
            primeira = False
        if len(row) >= 2:
            mapa[row[0].strip()] = row[1].strip()
    return mapa


def indexar_alvos(municipios) -> dict:
    """(nome normalizado, UF) -> municipio_id."""
    return {
        (norm_nome_municipio(m.nome), (m.estado or "").upper()): m.id
        for m in municipios
    }


def processar_estabelecimentos(fobj, mapa_tom, alvos, colhidas, stats) -> None:
    """Passada 1: colhe estabelecimentos dos alvos por (mid, cnpj_basico),
    com matriz preferida. TOM sem entrada no mapa é contado (nunca silencioso)."""
    primeira = True
    for row in _reader(fobj):
        if primeira:
            validar_colunas(row, COLS_ESTAB, "Estabelecimentos")
            primeira = False
        if len(row) != COLS_ESTAB:
            stats["malformadas"] += 1
            continue
        tom = row[E_TOM].strip()
        nome = mapa_tom.get(tom)
        if nome is None:
            if tom:
                stats["tom_desconhecido"] += 1
            continue
        mid = alvos.get((norm_nome_municipio(nome), row[E_UF].strip().upper()))
        if mid is None:
            continue
        cnpj = row[E_CNPJ].strip()
        if not cnpj:
            stats["malformadas"] += 1
            continue
        eh_matriz = row[E_MATRIZ].strip() == "1"
        chave = (mid, cnpj)
        atual = colhidas.get(chave)
        if atual is not None and (atual["matriz"] or not eh_matriz):
            continue  # mantém matriz (ou a primeira filial vista)
        colhidas[chave] = {
            "nome_fantasia": row[E_FANTASIA].strip() or None,
            "situacao": row[E_SITUACAO].strip() or None,
            "data_inicio": row[E_DATA_INICIO].strip(),
            "cnae_fiscal": row[E_CNAE].strip() or None,
            "matriz": eh_matriz,
        }


def processar_empresas(fobj, cnpjs: set, dados: dict) -> None:
    """Passada 2a: razão social, capital e porte dos cnpjs colhidos."""
    primeira = True
    for row in _reader(fobj):
        if primeira:
            validar_colunas(row, COLS_EMPRESAS, "Empresas")
            primeira = False
        if len(row) != COLS_EMPRESAS:
            continue
        cnpj = row[P_CNPJ].strip()
        if cnpj in cnpjs and cnpj not in dados:
            dados[cnpj] = {
                "razao_social": row[P_RAZAO].strip() or None,
                "capital_social": _parse_capital(row[P_CAPITAL]),
                "porte": row[P_PORTE].strip() or None,
            }


def processar_simples(fobj, cnpjs: set, dados: dict) -> None:
    """Passada 2b: opções Simples/MEI dos cnpjs colhidos."""
    primeira = True
    for row in _reader(fobj):
        if primeira:
            validar_colunas(row, COLS_SIMPLES, "Simples")
            primeira = False
        if len(row) != COLS_SIMPLES:
            continue
        cnpj = row[S_CNPJ].strip()
        if cnpj in cnpjs and cnpj not in dados:
            dados[cnpj] = {
                "opcao_simples": _parse_bool(row[S_OPCAO_SIMPLES]),
                "opcao_mei": _parse_mei(row[S_OPCAO_MEI]),
            }


def montar_linhas(colhidas, dados_emp, dados_simples) -> dict:
    """Junta as passadas em rows da tabela empresas, agrupadas por municipio_id.
    razao_social é NOT NULL: fallback nome_fantasia -> '' quando a passada 2
    não cobrir (modo degradado, sempre audível no resumo)."""
    por_mid: dict[int, list[dict]] = {}
    for (mid, cnpj), e in colhidas.items():
        emp = dados_emp.get(cnpj, {})
        simp = dados_simples.get(cnpj, {})
        razao = emp.get("razao_social") or e.get("nome_fantasia") or ""
        por_mid.setdefault(mid, []).append({
            "municipio_id": mid,
            "cnpj_basico": cnpj[:8],
            "razao_social": razao[:150],
            "nome_fantasia": (e.get("nome_fantasia") or None) and e["nome_fantasia"][:150],
            "situacao": (e.get("situacao") or None) and e["situacao"][:2],
            "data_inicio": _parse_data(e.get("data_inicio", "")),
            "cnae_fiscal": (e.get("cnae_fiscal") or None) and e["cnae_fiscal"][:7],
            "porte": (emp.get("porte") or None) and emp["porte"][:2],
            "capital_social": emp.get("capital_social"),
            "opcao_simples": simp.get("opcao_simples", False),
            "opcao_mei": simp.get("opcao_mei", False),
        })
    return por_mid
```

- [ ] **Step 4: Rodar até passar (arquivo + suite)**

```bash
venv/Scripts/python -m pytest backend/tests/test_cnpj_rfb.py -q
venv/Scripts/python -m pytest backend/tests -q
```

Expected: 12 novos passando; suite exit 0.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ingestao_automatica/cnpj_rfb.py backend/tests/test_cnpj_rfb.py
git commit -m "test(cnpj): nucleo puro da fonte CNPJ/RFB (parse posicional, TOM+UF, 2 passadas)"
```

---

### Task 2: Transporte WebDAV, orquestração e REPLACE

**Files:**
- Modify: `backend/app/services/ingestao_automatica/cnpj_rfb.py` (parte 2, append)
- Modify: `backend/app/services/ingestao_automatica/base.py` (1 linha)
- Modify: `backend/app/services/ingestao_automatica/__init__.py` (1 import)
- Test: `backend/tests/test_cnpj_rfb.py` (acrescentar)

**Interfaces:**
- Consumes: núcleo da Task 1; `Empresa` de `app.models.empresa`; `FONTES_FORA_DO_TODAS` de base.
- Produces: `executar(...)` padrão do registry; key `"cnpj"`; `listar_meses() -> list[str]`, `baixar_zip(mes, nome, destino_dir) -> tuple[str | None, str | None]`, `iterar_arquivo_do_zip(caminho)` (context manager que devolve fobj de texto).

- [ ] **Step 1: Testes novos (append)**

```python
# ── Task 2: transporte/orquestração (fakes, sem rede) ────────────────────────
import app.services.ingestao_automatica.cnpj_rfb as cnpj_rfb


def test_extrair_meses_do_propfind():
    xml = "<d:href>/public.php/webdav/2026-06/</d:href><d:href>/public.php/webdav/2026-07/</d:href>"
    assert cnpj_rfb.extrair_meses(xml) == ["2026-06", "2026-07"]


def test_extrair_meses_vazio_e_erro_audivel():
    with pytest.raises(ValueError, match="nenhum mês"):
        cnpj_rfb.extrair_meses("<xml/>")


def test_nomes_dos_zips():
    nomes = cnpj_rfb.nomes_zips()
    assert nomes[0] == "Municipios.zip"
    assert "Estabelecimentos9.zip" in nomes and "Empresas0.zip" in nomes
    assert nomes[-1] == "Simples.zip" and len(nomes) == 22
    assert "Socios0.zip" not in nomes


def test_cnpj_registrado_fora_do_todas():
    from app.services.ingestao_automatica.base import (
        FONTES_AUTOMATICAS,
        FONTES_FORA_DO_TODAS,
        ORDEM_EXECUCAO_TODAS,
    )
    assert "cnpj" in FONTES_AUTOMATICAS
    assert "cnpj" in FONTES_FORA_DO_TODAS
    assert "cnpj" not in ORDEM_EXECUCAO_TODAS
```

- [ ] **Step 2: Implementar a parte 2 (append em `cnpj_rfb.py`)**

```python
# ── Transporte (WebDAV público do share da RFB) ─────────────────────────────

def extrair_meses(xml: str) -> list[str]:
    import re
    meses = sorted(set(re.findall(r"webdav/(\d{4}-\d{2})/", xml)))
    if not meses:
        raise ValueError("CNPJ: nenhum mês encontrado no share da RFB — layout mudou?")
    return meses


def listar_meses() -> list[str]:
    r = requests.request(
        "PROPFIND", WEBDAV + "/", auth=(SHARE_TOKEN, ""),
        headers={"Depth": "1"}, timeout=60,
    )
    r.raise_for_status()
    return extrair_meses(r.text)


def nomes_zips() -> list[str]:
    """Ordem de processamento: auxiliar -> Estabelecimentos -> Empresas -> Simples."""
    return (["Municipios.zip"]
            + [f"Estabelecimentos{i}.zip" for i in range(10)]
            + [f"Empresas{i}.zip" for i in range(10)]
            + ["Simples.zip"])


def baixar_zip(mes: str, nome: str, destino_dir: str):
    """(caminho, erro): download streaming com 1 re-tentativa em falha
    transitória. Falha dupla devolve (None, mensagem)."""
    destino = os.path.join(destino_dir, nome)
    for tentativa in (1, 2):
        try:
            with requests.get(f"{WEBDAV}/{mes}/{nome}", auth=(SHARE_TOKEN, ""),
                              stream=True, timeout=300) as r:
                r.raise_for_status()
                with open(destino, "wb") as f:
                    for chunk in r.iter_content(chunk_size=1024 * 1024):
                        f.write(chunk)
            return destino, None
        except requests.RequestException as exc:
            if tentativa == 2:
                return None, f"{type(exc).__name__}: {exc}"
    return None, "inalcançável"


@contextlib.contextmanager
def iterar_arquivo_do_zip(caminho_zip: str):
    """Abre o único arquivo interno do zip como texto latin-1, SEM extrair."""
    with zipfile.ZipFile(caminho_zip) as z:
        interno = z.namelist()[0]
        with z.open(interno) as raw:
            yield io.TextIOWrapper(raw, encoding="latin-1", newline="")


# ── Orquestração ────────────────────────────────────────────────────────────

def executar(db, municipios, anos=None, usuario_id=None, notificar=True, progresso=None) -> ResumoIngestao:
    """`anos` e `notificar` aceitos e ignorados (snapshot corrente do cadastro)."""
    from app.models.empresa import Empresa

    resumo = ResumoIngestao(dataset="cnpj")
    alvos = indexar_alvos(municipios)
    nomes_por_mid = {m.id: m.nome for m in municipios}
    if not alvos:
        return resumo

    try:
        mes = listar_meses()[-1]
    except (requests.RequestException, ValueError) as exc:
        resumo.erros.append(f"share da RFB indisponível: {exc}")
        return resumo

    zips = nomes_zips()
    total = len(zips)
    mapa_tom: dict = {}
    colhidas: dict = {}
    dados_emp: dict = {}
    dados_simples: dict = {}
    stats = {"tom_desconhecido": 0, "malformadas": 0}
    estab_falhou = False

    cnpjs: set = set()
    for i, nome in enumerate(zips, start=1):
        if progresso:
            progresso(i - 1, total, f"CNPJ {mes}: baixando {nome}")
        with tempfile.TemporaryDirectory(prefix="cnpj_") as tmp:
            caminho, erro = baixar_zip(mes, nome, tmp)
            if erro:
                resumo.erros.append(f"{nome}: {erro}")
                if nome.startswith(("Municipios", "Estabelecimentos")):
                    estab_falhou = True
                continue
            if progresso:
                progresso(i - 1, total, f"CNPJ {mes}: processando {nome}")
            try:
                with iterar_arquivo_do_zip(caminho) as f:
                    if nome == "Municipios.zip":
                        mapa_tom = carregar_mapa_tom(f)
                    elif nome.startswith("Estabelecimentos"):
                        processar_estabelecimentos(f, mapa_tom, alvos, colhidas, stats)
                    elif nome.startswith("Empresas"):
                        if not cnpjs:
                            cnpjs = {c for (_, c) in colhidas}
                        processar_empresas(f, cnpjs, dados_emp)
                    else:  # Simples.zip
                        if not cnpjs:
                            cnpjs = {c for (_, c) in colhidas}
                        processar_simples(f, cnpjs, dados_simples)
            except (zipfile.BadZipFile, ValueError) as exc:
                resumo.erros.append(f"{nome}: {exc}")
                if nome.startswith(("Municipios", "Estabelecimentos")):
                    estab_falhou = True

    if stats["tom_desconhecido"]:
        resumo.erros.append(
            f"{stats['tom_desconhecido']} linha(s) com código TOM fora do mapa de municípios da RFB")
    if stats["malformadas"]:
        resumo.erros.append(f"{stats['malformadas']} linha(s) malformada(s) puladas")

    if estab_falhou:
        resumo.erros.append(
            "snapshot incompleto (Municípios/Estabelecimentos com falha) — NADA foi gravado")
        return resumo

    linhas_por_mid = montar_linhas(colhidas, dados_emp, dados_simples)
    if not dados_emp and colhidas:
        resumo.erros.append(
            "passada de Empresas vazia — razão social/porte/capital em modo degradado")

    mids = sorted(alvos.values())
    for i, mid in enumerate(mids, start=1):
        if progresso:
            progresso(i, len(mids), "gravando municípios")
        linhas = linhas_por_mid.get(mid, [])
        if not linhas:
            resumo.erros.append(
                f"{nomes_por_mid.get(mid, mid)}: sem estabelecimentos no arquivo — dados anteriores mantidos")
            continue
        db.query(Empresa).filter(Empresa.municipio_id == mid).delete(synchronize_session=False)
        for row in linhas:
            db.add(Empresa(**row))
        resumo.linhas += len(linhas)
        db.commit()
        resumo.municipios_ok += 1
    return resumo


registrar(FonteAutomatica(
    key="cnpj",
    label="Empresas (CNPJ/RFB)",
    fonte="RFB — Cadastro Nacional da Pessoa Jurídica, dados abertos mensais",
    executar=executar,
))
```

Em `base.py`: `FONTES_FORA_DO_TODAS = frozenset({"rais", "cnpj"})` (atualizar o comentário: "o Ciclo C adicionou cnpj"). Em `__init__.py`: `from app.services.ingestao_automatica import cnpj_rfb  # noqa: F401` (ordem alfabética junto dos demais).

- [ ] **Step 3: Gates + smoke**

```bash
venv/Scripts/python -m pytest backend/tests/test_cnpj_rfb.py -q
venv/Scripts/python -m pytest backend/tests -q
```

Expected: exit 0 (o teste de paridade `test_ingestao_todas` já referencia `FONTES_FORA_DO_TODAS` — passa sem mudança). Smoke da pasta backend/: `../venv/Scripts/python -c "import app.services.ingestao_automatica as ia; assert 'cnpj' in ia.FONTES_AUTOMATICAS; print('ok')"`

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/ingestao_automatica/cnpj_rfb.py \
        backend/app/services/ingestao_automatica/base.py \
        backend/app/services/ingestao_automatica/__init__.py \
        backend/tests/test_cnpj_rfb.py
git commit -m "feat(cnpj): fonte automatica Empresas/CNPJ (share RFB, 2 passadas, REPLACE)"
```

---

### Task 3: Verificação final — E2E real via worker + README

**Files:**
- Modify: `README.md` (linha na tabela de fontes; conferir WIP antes)

- [ ] **Step 1: Gates completos**

```bash
venv/Scripts/python -m pytest backend/tests -q
```

- [ ] **Step 2: Smoke real BARATO (auxiliar apenas, ~KB)**

Script no scratchpad: `listar_meses()` real (assert mês ≥ 2026-07); `baixar_zip(mes, "Municipios.zip", tmp)` + `iterar_arquivo_do_zip` + `carregar_mapa_tom` → assert ≥ 5000 entradas e `"4123" -> BELO HORIZONTE`. Valida transporte + auxiliar sem custo.

- [ ] **Step 3: E2E real via worker local (banco de dev) — ~7,6GB, 30-60min**

Mesmo arranjo dos ciclos A/B (uvicorn 8011 `INGESTAO_EXECUTOR=worker` + `python -m app.worker`, usuário sintético com cleanup): `POST /ingestao-automatica/cnpj/executar {"municipio_ids": [<1 município MG pequeno>]}` → 202; acompanhar etapas (22 arquivos); ao `concluido`: contagens na tabela `empresas` para o município (total, por situacao, com razao_social não-vazia ≥ 95%), comparar com a página/router (`/empresas/resumo`); re-POST → REPLACE idempotente (mesmas contagens). Cleanup padrão; dados reais ficam.

- [ ] **Step 4: README + report**

Linha na tabela de fontes automáticas ("Empresas (CNPJ/RFB) — snapshot mensal do cadastro; fora do meta-job; a mais pesada (~7,6GB/execução), rodar no worker"). Conferir WIP antes de commitar. Registrar no ledger: pendência do usuário = rodar CNPJ pela tela em prod.

```bash
git add README.md
git commit -m "docs(cnpj): fonte CNPJ na tabela de fontes automaticas"
```

---

## Self-review do plano (executado na escrita)

- **Spec coverage:** share/WebDAV/meses → `listar_meses`/`extrair_meses`; um zip por vez sem extração → `baixar_zip` + `iterar_arquivo_do_zip` + `TemporaryDirectory` por zip; TOM→nome+UF com norm → `carregar_mapa_tom`/`indexar_alvos`/`processar_estabelecimentos`; matriz preferida → idem + teste; passada 2 → `processar_empresas`/`processar_simples` (first-wins como o loader manual); REPLACE por município + anti-wipe → `executar`; abort de snapshot parcial → `estab_falhou` (inclui Municipios.zip, sem o qual nada casa); degradação de Empresas/Simples audível; guarda de colunas 30/7/7/2 → `validar_colunas` + testes; paridade de parsers → transcritos verbatim do `carregar_cnpj.py`; razão NOT NULL → fallback em `montar_linhas` + teste; fora do "todas" → base.py + teste.
- **Placeholders:** nenhum.
- **Consistência:** shapes de `colhidas`/`dados_emp`/`dados_simples` idênticas entre Task 1 (parse/testes) e `montar_linhas`/`executar`; truncamentos casados com o model real (`String(8/150/150/2/7/2)`); `cnpjs` construído uma vez ao encontrar o primeiro zip da passada 2 (Estabelecimentos vêm antes na ordem de `nomes_zips`).
- **Nota de memória:** `colhidas` guarda só os alvos (dezenas de MB para uma capital); o set `cnpjs` idem — sem risco de OOM mesmo em seleção grande, diferente da RAIS (backlog F3 de lá não se aplica aqui).
