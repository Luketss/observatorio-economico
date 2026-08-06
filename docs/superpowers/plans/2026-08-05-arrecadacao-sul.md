# Arrecadação estadual — conectores PR e RS (roteador por UF) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expandir a fonte `arrecadacao` (hoje MG-only) para PR e RS: novo `arrecadacao.py` assume o registro como roteador por UF (mesma key, um card só), `arrecadacao_mg.py` vira conector (`executar_mg`, lógica intacta), e dois conectores novos gravam em `arrecadacao_mensal` — PR via relatório JSP mensal da SEFA (HTML), RS via .xls BIFF da Sefaz (ICMS + IPVA, com regra anti-meio-mês).

**Architecture:** Parsers puros TDD ancorados nas amostras REAIS salvas na sondagem de 2026-08-05 (`scratchpad/rrepassesmun_2024_06_mensal.html`, `rs_icms_202601.xls`, `rs_ipva_202501.xls`). No RS, a extração xlrd (`extrair_matriz`, thin, sem teste) é separada da interpretação (funções puras sobre `list[list]`, testadas com matrizes sintéticas — nenhum teste gera BIFF). Match por nome+UF via `norm_nome_municipio` (nenhuma das duas fontes traz código IBGE). Upsert-com-UPDATE por `(municipio_id, ano, mes)` no idioma REAL do MG (query dos existentes + setattr/add — o MG não usa `on_conflict_do_update`), commit por mês. Spec: `docs/superpowers/specs/2026-08-05-arrecadacao-sul-design.md`.

**Fatos verificados nas amostras (inspecionadas em 2026-08-06 com o venv):**

- **PR** (`rrepassesmun_2024_06_mensal.html`): os bytes decodificam como **UTF-8** (a spec previa windows-1252; sob cp1252 o arquivo vira mojibake e tem 1 byte inválido `0x8d`) → decodificação tenta UTF-8 e cai para cp1252. Tabela de dados com 403 `<tr>`: linha 0 `['Referência: Junho/2024', 'Em Reais']`; linha 1 (cabeçalho, com dígitos das notas `<sup>` colados) `['Município', 'Índices do FPM', 'ICMS1', 'Fundo de Exportação2', 'Royalties Petróleo3', 'IPVA4', 'Total Repasse Líquido']`; linha 2 `['Repasse Bruto', 'Repasse Líquido']`; 399 linhas de dados com **8 células** `[nome, índice FPM, ICMS bruto, ICMS líquido, Fundo Exp., Royalties, IPVA, Total]` em número BR (`'585.309,96'`); última linha `'Total em Junho/2024'`. Conferência do mapeamento (Abatiá): 468.247,98 + 8.122,05 + 40.789,94 = 517.159,97 = 517.606,18 (total da página) − 446,21 (royalties).
- **RS ICMS** (`rs_icms_202601.xls`, BIFF real, OLE2; sheets `['JANEIRO 2026', 'Planilha1']`, a 2ª vazia): linha 0 `['MUNICIPIO', 46028.0, '', '', 46035.0, '', '', 46042.0, '', '', 46049.0, '', '', 'TOTAL JANEIRO/2026', '', '', 'TOTAL EM 2026', '', '']` (19 colunas NESTE mês — 4 semanas; o nº varia); linha 1 `REPASSE/RETENÇÃO/LÍQUIDO` por bloco; dados da linha 2 em diante (`'ACEGUA'`, `'XANGRI-LA'` — maiúsculo sem acento); última linha `'REPASSE TOTAL ICMS'`. 497 municípios.
- **RS IPVA** (`rs_ipva_202501.xls`; sheet `['Repasses']`): linha 0 `['NOME DO MUNICÍPIO', 45659.0, …, 45688.0, 'Total Mês', 'Total Ano']` (22 seriais DIÁRIOS neste mês — o nº varia); dados direto da linha 1 (SEM sub-cabeçalho); última linha `'TOTAIS'`. Serial 45659 = 2025-01-02 com epoch `date(1899,12,30)` (datemode 0 nas duas amostras).
- `norm_nome_municipio` casa as grafias RS/PR com as do IBGE no banco: `XANGRI-LA`≡`Xangri-lá`, `ACEGUA`≡`Aceguá`, `WESTFALIA`≡`Westfália`, `SANT'ANA DO LIVRAMENTO`≡`Sant'Ana do Livramento`, `Abatiá`≡`Abatiá` (verificado no venv).

**Tech Stack:** Python 3.11, `html.parser` (stdlib, PR), `xlrd==2.0.2` (**dependência nova**, só o RS usa), requests, SQLAlchemy 2.0, pytest.

## Global Constraints

- **Zero frontend, zero migração de schema.** Única dependência nova: `xlrd==2.0.2` (sinalizada em `requirements.txt` como exclusiva do RS).
- Gate por task: `venv/Scripts/python -m pytest backend/tests -q` da RAIZ → exit 0 (273 atuais + novos).
- Branch: `feat/arrecadacao-sul`, criada na Task 1 a partir da `main`.
- WIP do usuário — NÃO commitar: `.claude/settings.local.json`, `dados/`, `docs/superpowers/plans/2026-05-06-ips-feature.md`; `README.md` conferir `git status` antes (se modificado pelo usuário, editar sem commitar). **A task termina COMMITADA** (a regra de WIP é só sobre esses arquivos).
- Regra transversal **"nenhum descarte silencioso"**: guarda layout-mudou = erro audível hard-stop da UF (nenhuma linha do mês gravada); nomes-alvo sem match = contados + aviso agregado; linhas ilegíveis = contadas + aviso; RS grava o mês SÓ com ICMS **E** IPVA válidos (anti-meio-mês).
- Upsert: paridade com o que `arrecadacao_mg.executar` REALMENTE faz — query dos existentes por chave + `setattr`/`db.add` (não é `on_conflict_do_update`).
- `ORDEM_EXECUCAO_TODAS`/`FONTES_FORA_DO_TODAS` inalterados (`arrecadacao` continua no "todas", 1 entrada só).

---

## File Map

| File | Action |
|---|---|
| `backend/app/services/ingestao_automatica/arrecadacao_pr.py` | Create — T1 parser puro; T3 executar_pr |
| `backend/app/services/ingestao_automatica/arrecadacao_rs.py` | Create — T2 interpretação pura + extração thin; T3 executar_rs |
| `backend/app/services/ingestao_automatica/arrecadacao.py` | Create — T3 roteador + registro (key `arrecadacao`) |
| `backend/app/services/ingestao_automatica/arrecadacao_mg.py` | Modify — T3: `executar`→`executar_mg`, remove auto-registro (lógica intacta) |
| `backend/app/services/ingestao_automatica/__init__.py` | Modify — T3: import do roteador no lugar do arrecadacao_mg |
| `backend/requirements.txt` | Modify — T3: `xlrd==2.0.2` |
| `backend/tests/test_arrecadacao_pr.py` | Create — T1 (+ append T3) |
| `backend/tests/test_arrecadacao_rs.py` | Create — T2 (+ append T3) |
| `backend/tests/test_arrecadacao_roteador.py` | Create — T3 |
| `README.md` | Modify — T4: linha da fonte Arrecadação (conferir WIP antes) |

---

### Task 1: Parser PR puro (TDD)

**Files:**
- Create: `backend/app/services/ingestao_automatica/arrecadacao_pr.py` (parte 1: decodificação, extrator de tabelas, parse + guardas)
- Test: `backend/tests/test_arrecadacao_pr.py`

**Interfaces:**
- Consumes: `parse_valor_br`/`norm_nome_municipio` de `util.py`; `NOME_MESES` de `arrecadacao_mg` (fonte única do rótulo `nome_mes`).
- Produces (T3 depende): `decodificar(bytes) -> str`, `parse_html_mensal(html, ano, mes) -> (dict[str, tuple[float, float, float]], list[str])`, exceção `MesDivergente`.

- [ ] **Step 0: Criar a branch**

```bash
cd c:\Users\lucas\Documents\projetos\dashboard_prefeituras
git checkout main && git checkout -b feat/arrecadacao-sul
```

- [ ] **Step 1: Escrever os testes que falham**

```python
# backend/tests/test_arrecadacao_pr.py
"""Parser puro do relatório mensal de repasses da SEFA-PR — sem rede, sem DB.

Fixture derivado da amostra REAL de 06/2024 (rrepassesmun_2024_06_mensal.html):
mesma estrutura de tabela (3 linhas de cabeçalho, 8 células por município,
linha final 'Total em Mês/Ano'), com 3 municípios reais transcritos."""
import pytest

from app.services.ingestao_automatica.arrecadacao_pr import (
    MesDivergente,
    decodificar,
    parse_html_mensal,
)
from app.services.ingestao_automatica.util import norm_nome_municipio

# Estrutura idêntica à da página real (tags, <sup> de nota de rodapé,
# entidades HTML, números BR); valores transcritos da amostra de 06/2024.
FIXTURE_PR = """
<html><body>
<table border="0" cellpadding="0" class="cinza">
  <tr class="tr_cabecalho">
    <td colspan="3"><b>Refer&ecirc;ncia: Junho/2024</b></td>
    <td colspan="5"><b>Em Reais</b></td>
  </tr>
  <tr class="tr_cabecalho">
    <td><p align="center"><b>Munic&iacute;pio</b></td>
    <td><b>&Iacute;ndices do FPM</b></td>
    <td colspan="2"><b>ICMS<sup>1</sup></b></td>
    <td><p align="center"><b>Fundo de Exporta&ccedil;&atilde;o<sup>2</sup></b></td>
    <td><b>Royalties Petr&oacute;leo<sup>3</sup></b></td>
    <td><b>IPVA<sup>4</sup></b></td>
    <td><p align="center"><b>Total Repasse L&iacute;quido</b></td>
  </tr>
  <tr class="tr_cabecalho">
    <td><span>Repasse Bruto</span></td>
    <td><span>Repasse L&iacute;quido</span></td>
  </tr>
  <tr>
    <td><font face="Arial" size=1>Abati&aacute;</font></td>
    <td>0,00059739134986</td>
    <td>585.309,96</td>
    <td>468.247,98</td>
    <td>8.122,05</td>
    <td>446,21</td>
    <td>40.789,94</td>
    <td>517.606,18</td>
  </tr>
  <tr>
    <td><font face="Arial" size=1>Boa Ventura de S&atilde;o Roque</font></td>
    <td>0,00151576302834</td>
    <td>1.485.108,86</td>
    <td>1.188.087,10</td>
    <td>20.608,10</td>
    <td>1.132,17</td>
    <td>48.966,08</td>
    <td>1.258.793,45</td>
  </tr>
  <tr>
    <td><font face="Arial" size=1>Xambr&ecirc;</font></td>
    <td>0,00067848862153</td>
    <td>664.767,14</td>
    <td>531.813,73</td>
    <td>9.224,64</td>
    <td>506,79</td>
    <td>43.229,40</td>
    <td>584.774,56</td>
  </tr>
  <tr>
    <td><strong>Total em Junho/2024</strong></td>
    <td>1,000000000000000000</td>
    <td>979.776.409,57</td>
    <td>783.821.134,06</td>
    <td>13.595.855,62</td>
    <td>746.933,08</td>
    <td>138.141.006,90</td>
    <td><strong>936.304.929,66</strong></td>
  </tr>
</table>
</body></html>
"""


def test_parse_extrai_municipios_e_mapeia_tributos():
    valores, ignoradas = parse_html_mensal(FIXTURE_PR, 2024, 6)
    assert len(valores) == 3 and ignoradas == []
    # (icms_liquido, fundo_exportacao, ipva) — bruto (col 2) NÃO é usado
    assert valores["Abatiá"] == (468247.98, 8122.05, 40789.94)
    assert valores["Xambrê"] == (531813.73, 9224.64, 43229.40)


def test_royalties_fica_fora_total_diverge_da_pagina():
    valores, _ = parse_html_mensal(FIXTURE_PR, 2024, 6)
    icms, ipi, ipva = valores["Abatiá"]
    # total das 3 partes = Total da página (517.606,18) − Royalties (446,21)
    assert round(icms + ipi + ipva, 2) == round(517606.18 - 446.21, 2)


def test_linhas_de_cabecalho_e_total_nao_viram_municipio():
    valores, _ = parse_html_mensal(FIXTURE_PR, 2024, 6)
    assert not any("Total em" in nome for nome in valores)
    assert "Município" not in valores and "Repasse Bruto" not in valores


def test_acentos_preservados_e_match_com_grafia_ibge():
    valores, _ = parse_html_mensal(FIXTURE_PR, 2024, 6)
    assert "Boa Ventura de São Roque" in valores
    assert norm_nome_municipio("Boa Ventura de São Roque") in {
        norm_nome_municipio(n) for n in valores
    }


def test_mes_divergente():
    with pytest.raises(MesDivergente):
        parse_html_mensal(FIXTURE_PR, 2024, 7)


def test_ano_divergente():
    with pytest.raises(MesDivergente):
        parse_html_mensal(FIXTURE_PR, 2023, 6)


def test_referencia_ausente_e_layout_hard_stop():
    sem_ref = FIXTURE_PR.replace("Refer&ecirc;ncia: Junho/2024", "Bem-vindo")
    with pytest.raises(ValueError, match="layout"):
        parse_html_mensal(sem_ref, 2024, 6)


def test_coluna_renomeada_e_layout_hard_stop():
    mudou = FIXTURE_PR.replace("<b>IPVA<sup>4</sup></b>", "<b>Frota<sup>4</sup></b>")
    with pytest.raises(ValueError, match="layout"):
        parse_html_mensal(mudou, 2024, 6)


def test_subcolunas_icms_divergentes_e_layout_hard_stop():
    mudou = FIXTURE_PR.replace("Repasse Bruto", "Bruto")
    with pytest.raises(ValueError, match="layout"):
        parse_html_mensal(mudou, 2024, 6)


def test_nota_de_rodape_renumerada_e_tolerada():
    # o <sup> cola dígitos no texto ("ICMS1"); renumeração não pode quebrar
    renum = FIXTURE_PR.replace("<sup>2</sup>", "<sup>9</sup>")
    valores, _ = parse_html_mensal(renum, 2024, 6)
    assert len(valores) == 3


def test_linha_ilegivel_vira_ignorada_nao_silenciosa():
    quebrada = FIXTURE_PR.replace("531.813,73", "n/d")
    valores, ignoradas = parse_html_mensal(quebrada, 2024, 6)
    assert "Xambrê" not in valores and ignoradas == ["Xambrê"]
    assert len(valores) == 2


def test_decodificar_utf8_e_fallback_cp1252():
    # amostra real de 2026-08-05 veio em UTF-8 (spec previa cp1252)
    assert decodificar("Referência: Março".encode("utf-8")) == "Referência: Março"
    assert decodificar("Referência: Março".encode("cp1252")) == "Referência: Março"
```

- [ ] **Step 2: Rodar e confirmar que falham**

```bash
venv/Scripts/python -m pytest backend/tests/test_arrecadacao_pr.py -q
```

Expected: FAIL — módulo não existe.

- [ ] **Step 3: Criar `arrecadacao_pr.py` (parte 1 — parser puro)**

```python
"""Fonte automática: Arrecadação PR — repasses da SEFA-PR aos municípios.

Relatório JSP legado do Portal da Transparência do PR (www4.pr.gov.br), GET
sem sessão: rrepassesmun.jsp?Param_Data=01/MM/AAAA&Param_Tiporelatorio=MENSAL.
Uma página HTML por mês, ~399 municípios; formato atual desde 2003 (anos
anteriores usam a variante rrepassesmun_lk.jsp — fora do escopo).

Layout real (amostra 06/2024): tabela com "Referência: Junho/2024", cabeçalho
[Município | Índices do FPM | ICMS | Fundo de Exportação | Royalties Petróleo
| IPVA | Total Repasse Líquido] (dígitos de <sup> colados: "ICMS1"),
sub-colunas do ICMS [Repasse Bruto | Repasse Líquido], 8 células por
município em número BR e linha final "Total em Junho/2024".

Mapeamento (colunas fixas de arrecadacao_mensal, sem coluna "outros"):
valor_icms = ICMS Repasse LÍQUIDO; valor_ipi = Fundo de Exportação (cota
municipal do IPI-Exportação); valor_ipva = IPVA; valor_total = soma dos três.
ROYALTIES PETRÓLEO FICA FORA por decisão explícita (não há coluna própria e
criá-la exigiria migração) — logo valor_total DIVERGE do "Total Repasse
Líquido" da página quando o município recebe royalties (na amostra: Abatiá
517.159,97 = 517.606,18 − 446,21 de royalties).

Match por nome+UF via norm_nome_municipio (a página não traz código IBGE).
Guardas: cabeçalho divergente → ValueError audível hard-stop (nenhuma linha
do mês, meses restantes abortados); Referência de outro mês → MesDivergente
(mês tratado como ainda-não-publicado); linha ilegível → contada em
`ignoradas` (aviso agregado — nenhum descarte silencioso).

Encoding: a sondagem de 2026-08-05 devolveu a página em UTF-8 (a spec previa
windows-1252) — decodificar() tenta UTF-8 e cai para cp1252."""
import logging
import re
import unicodedata
from datetime import date
from html.parser import HTMLParser

import requests

from app.services.ingestao_automatica.arrecadacao_mg import NOME_MESES
from app.services.ingestao_automatica.base import ResumoIngestao
from app.services.ingestao_automatica.util import (
    ca_bundle_gov,
    competencias_janela,
    norm_nome_municipio,
    parse_valor_br,
)

logger = logging.getLogger(__name__)

URL_MENSAL = (
    "https://www4.pr.gov.br/Gestao/portaldatransparencia/repasses/relatorio/"
    "rrepassesmun.jsp?Param_Data=01/{mes:02d}/{ano}&Param_Tiporelatorio=MENSAL"
)
INICIO_SERIE = (2003, 1)  # antes disso o relatório é o rrepassesmun_lk.jsp (fora do escopo)

# Cabeçalhos REAIS da amostra 06/2024, após _norm_header (que remove os
# dígitos de nota de rodapé colados pelo <sup>: "ICMS1" → "icms").
CABECALHO_ESPERADO = ["município", "índices do fpm", "icms", "fundo de exportação",
                     "royalties petróleo", "ipva", "total repasse líquido"]
SUBCABECALHO_ESPERADO = ["repasse bruto", "repasse líquido"]


class MesDivergente(Exception):
    """A página respondeu com Referência de outro mês (pedido não publicado)."""


class _ExtratorTabelas(HTMLParser):
    """Extrai TODAS as <table> do HTML (aninhadas inclusive) como listas de
    linhas; cada linha é a lista dos textos das células. convert_charrefs
    resolve as entidades (&ecirc; etc.)."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tabelas: list[list[list[list[str]]]] = []
        self._pilha: list[list[list[list[str]]]] = []
        self._celula: list[str] | None = None

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self._pilha.append([])
        elif tag == "tr" and self._pilha:
            self._pilha[-1].append([])
        elif tag in ("td", "th") and self._pilha and self._pilha[-1]:
            self._celula = []
            self._pilha[-1][-1].append(self._celula)

    def handle_endtag(self, tag):
        if tag == "table" and self._pilha:
            self.tabelas.append(self._pilha.pop())
        elif tag in ("td", "th"):
            self._celula = None

    def handle_data(self, data):
        if self._celula is not None:
            self._celula.append(data)


def _texto(celula: list[str]) -> str:
    return " ".join("".join(celula).split())


def _sem_acento(s: str) -> str:
    s = unicodedata.normalize("NFD", s)
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def _norm_header(s: str) -> str:
    return re.sub(r"\d+", "", s).strip().lower()


def decodificar(conteudo: bytes) -> str:
    """UTF-8 (formato real observado) com fallback cp1252 (formato declarado
    historicamente pelo JSP). UTF-8 é autovalidante: texto cp1252 acentuado
    não decodifica como UTF-8, então a ordem é segura."""
    try:
        return conteudo.decode("utf-8")
    except UnicodeDecodeError:
        return conteudo.decode("windows-1252", errors="replace")


def parse_html_mensal(html: str, ano: int, mes: int) -> tuple[dict[str, tuple[float, float, float]], list[str]]:
    """HTML do relatório MENSAL → ({nome: (icms_liq, fundo_exp, ipva)}, ignoradas).

    ValueError se o layout divergiu (hard-stop); MesDivergente se a página é
    de outro mês. Linhas ilegíveis vão para `ignoradas` (nunca descartadas em
    silêncio)."""
    extrator = _ExtratorTabelas()
    extrator.feed(html)

    tabela, idx_header = None, None
    for t in extrator.tabelas:
        for i, linha in enumerate(t):
            if [_norm_header(_texto(c)) for c in linha] == CABECALHO_ESPERADO:
                tabela, idx_header = t, i
                break
        if tabela is not None:
            break
    if tabela is None:
        raise ValueError(
            f"PR {mes:02d}/{ano}: cabeçalho esperado não encontrado — layout mudou?")

    # "Referência: Junho/2024" fica nas linhas ANTES do cabeçalho
    texto_pre = " ".join(_texto(c) for linha in tabela[:idx_header] for c in linha)
    m = re.search(r"referencia:\s*([a-z]+)\s*/\s*(\d{4})", _sem_acento(texto_pre).lower())
    if not m:
        raise ValueError(
            f"PR {mes:02d}/{ano}: linha 'Referência: Mês/Ano' ausente — layout mudou?")
    esperado = _sem_acento(NOME_MESES[mes - 1]).lower()
    if (m.group(1), int(m.group(2))) != (esperado, ano):
        raise MesDivergente(f"página retornou referência {m.group(1)}/{m.group(2)}")

    sub = tabela[idx_header + 1] if idx_header + 1 < len(tabela) else []
    if [_norm_header(_texto(c)) for c in sub] != SUBCABECALHO_ESPERADO:
        raise ValueError(
            f"PR {mes:02d}/{ano}: sub-colunas do ICMS divergentes — layout mudou?")

    valores: dict[str, tuple[float, float, float]] = {}
    ignoradas: list[str] = []
    for linha in tabela[idx_header + 2:]:
        celulas = [_texto(c) for c in linha]
        if not celulas or not celulas[0]:
            continue
        if _sem_acento(celulas[0]).lower().startswith("total em"):
            continue  # linha-resumo final da página
        if len(celulas) != 8:
            ignoradas.append(celulas[0])
            continue
        # 0=nome 1=índice FPM 2=ICMS bruto 3=ICMS LÍQUIDO 4=Fundo Exportação
        # 5=Royalties (FORA — ver docstring) 6=IPVA 7=Total da página (não usado)
        icms = parse_valor_br(celulas[3])
        fundo = parse_valor_br(celulas[4])
        ipva = parse_valor_br(celulas[6])
        if icms is None or fundo is None or ipva is None:
            ignoradas.append(celulas[0])
            continue
        valores[celulas[0]] = (icms, fundo, ipva)
    return valores, ignoradas
```

(Os imports de `requests`/`ca_bundle_gov`/`competencias_janela`/`norm_nome_municipio`/`date`/`ResumoIngestao`/`logging` são usados pela parte 2, na Task 3 — ficam desde já para o módulo nascer com o cabeçalho definitivo.)

- [ ] **Step 4: Rodar até passar (arquivo + suite)**

```bash
venv/Scripts/python -m pytest backend/tests/test_arrecadacao_pr.py -q
venv/Scripts/python -m pytest backend/tests -q
```

Expected: 12 novos passando; suite completa exit 0 (o módulo ainda não registra nada — `__init__.py` só muda na Task 3).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ingestao_automatica/arrecadacao_pr.py backend/tests/test_arrecadacao_pr.py
git commit -m "test(arrecadacao): parser puro do relatorio mensal SEFA-PR (guardas de layout e referencia)"
```

---

### Task 2: Parser RS puro (TDD) + extração xlrd thin

**Files:**
- Create: `backend/app/services/ingestao_automatica/arrecadacao_rs.py` (parte 1: interpretação pura + `extrair_matriz` thin)
- Test: `backend/tests/test_arrecadacao_rs.py`

**Interfaces:**
- Consumes: `norm_nome_municipio` de `util.py`; `NOME_MESES` de `arrecadacao_mg`.
- Produces (T3 depende): `interpretar_matriz_icms(matriz, ano, mes)`, `interpretar_matriz_ipva(matriz, ano, mes)` → `(dict[str, float], list[str])`; `montar_registros_rs(valores_icms, valores_ipva, alvo, ano, mes)` → `(list[dict], list[str])`; `extrair_matriz(bytes) -> list[list]` (thin, sem teste); exceção `MesDivergente`.

- [ ] **Step 1: Escrever os testes que falham**

```python
# backend/tests/test_arrecadacao_rs.py
"""Interpretação pura dos .xls de repasses da Sefaz-RS — sem rede, sem DB,
sem BIFF: matrizes sintéticas (list[list]) com a MESMA forma das amostras
reais (rs_icms_202601.xls sheet 'JANEIRO 2026'; rs_ipva_202501.xls sheet
'Repasses'), valores transcritos delas. A extração xlrd (extrair_matriz) é
thin e fica fora dos testes por design."""
from datetime import date

import pytest

from app.services.ingestao_automatica.arrecadacao_rs import (
    MesDivergente,
    interpretar_matriz_icms,
    interpretar_matriz_ipva,
    montar_registros_rs,
)

# ICMS 01/2026 real tem 4 blocos semanais; aqui 2 (o parser DEVE achar o
# bloco TOTAL dinamicamente). Seriais 46028/46035 = 2026-01-06/13.
MATRIZ_ICMS = [
    ["MUNICIPIO", 46028.0, "", "", 46035.0, "", "",
     "TOTAL JANEIRO/2026", "", "", "TOTAL EM 2026", "", ""],
    ["", "REPASSE", "RETENÇÃO", "LÍQUIDO", "REPASSE", "RETENÇÃO", "LÍQUIDO",
     "REPASSE", "RETENÇÃO", "LÍQUIDO", "REPASSE", "RETENÇÃO", "LÍQUIDO"],
    ["ACEGUA", 73827.82, 2113.41, 71714.41, 52242.05, 51499.12, 742.93,
     1349464.36, 75900.72, 1273563.64, 1349464.36, 75900.72, 1273563.64],
    ["AGUA SANTA", 49164.69, 1902.07, 47262.62, 34789.91, 34000.0, 789.91,
     898658.38, 104037.13, 794621.25, 898658.38, 104037.13, 794621.25],
    ["XANGRI-LA", 40866.67, 5164.24, 35702.43, 28918.07, 26932.7, 1985.37,
     746982.81, 254512.0, 492470.81, 746982.81, 254512.0, 492470.81],
    ["REPASSE TOTAL ICMS", 50973749.04, 0.0, "", 36070045.66, "", "",
     931725330.9, "", "", 931725330.9, "", ""],
]

# IPVA 01/2025 real tem 22 seriais diários; aqui 3 (coluna 'Total Mês'
# localizada dinamicamente). Serial 45659 = 2025-01-02.
MATRIZ_IPVA = [
    ["NOME DO MUNICÍPIO", 45659.0, 45660.0, 45663.0, "Total Mês", "Total Ano"],
    ["ACEGUA", 33659.13, 117246.71, 17588.99, 279318.16, 279318.16],
    ["AGUA SANTA", 36082.34, 139570.08, 7040.73, 219682.51, 219682.51],
    ["XANGRI-LA", 123091.73, 501038.0, 46563.13, 1157990.51, 1157990.51],
    ["TOTAIS", 89269281.24, 233715889.4, 19228229.27, 505523459.6, 505523459.57],
]


def _clona(matriz):
    return [list(linha) for linha in matriz]


# ── ICMS ─────────────────────────────────────────────────────────────────────

def test_icms_usa_liquido_do_bloco_total_do_mes():
    valores, ignoradas = interpretar_matriz_icms(MATRIZ_ICMS, 2026, 1)
    assert valores == {"ACEGUA": 1273563.64, "AGUA SANTA": 794621.25,
                       "XANGRI-LA": 492470.81}
    assert ignoradas == []


def test_icms_bloco_total_localizado_dinamicamente():
    # mês com 1 semana a menos: bloco TOTAL desloca 3 colunas para a esquerda
    m = [linha[:4] + linha[7:] for linha in MATRIZ_ICMS]
    valores, _ = interpretar_matriz_icms(m, 2026, 1)
    assert valores["ACEGUA"] == 1273563.64


def test_icms_nao_confunde_total_em_ano_com_total_do_mes():
    # sem o bloco do mês, 'TOTAL EM 2026' NÃO pode ser usado no lugar
    m = [linha[:7] + linha[10:] for linha in MATRIZ_ICMS]
    with pytest.raises(ValueError, match="layout"):
        interpretar_matriz_icms(m, 2026, 1)


def test_icms_mes_divergente():
    with pytest.raises(MesDivergente):
        interpretar_matriz_icms(MATRIZ_ICMS, 2026, 2)
    with pytest.raises(MesDivergente):
        interpretar_matriz_icms(MATRIZ_ICMS, 2025, 1)


def test_icms_linha_de_total_geral_pulada():
    valores, _ = interpretar_matriz_icms(MATRIZ_ICMS, 2026, 1)
    assert "REPASSE TOTAL ICMS" not in valores


def test_icms_header_municipio_mudou_e_layout_hard_stop():
    m = _clona(MATRIZ_ICMS)
    m[0][0] = "CIDADE"
    with pytest.raises(ValueError, match="layout"):
        interpretar_matriz_icms(m, 2026, 1)


def test_icms_bloco_sem_liquido_e_layout_hard_stop():
    m = _clona(MATRIZ_ICMS)
    m[1][9] = "SALDO"  # LÍQUIDO do bloco TOTAL JANEIRO/2026
    with pytest.raises(ValueError, match="layout"):
        interpretar_matriz_icms(m, 2026, 1)


def test_icms_retencao_sem_acento_tolerada():
    m = _clona(MATRIZ_ICMS)
    m[1] = [c.replace("RETENÇÃO", "RETENCAO").replace("LÍQUIDO", "LIQUIDO")
            if isinstance(c, str) else c for c in m[1]]
    valores, _ = interpretar_matriz_icms(m, 2026, 1)
    assert len(valores) == 3


def test_icms_celula_nao_numerica_vira_ignorada():
    m = _clona(MATRIZ_ICMS)
    m[3][9] = ""  # LÍQUIDO total de AGUA SANTA
    valores, ignoradas = interpretar_matriz_icms(m, 2026, 1)
    assert "AGUA SANTA" not in valores and ignoradas == ["AGUA SANTA"]


# ── IPVA ─────────────────────────────────────────────────────────────────────

def test_ipva_usa_coluna_total_mes():
    valores, ignoradas = interpretar_matriz_ipva(MATRIZ_IPVA, 2025, 1)
    assert valores == {"ACEGUA": 279318.16, "AGUA SANTA": 219682.51,
                       "XANGRI-LA": 1157990.51}
    assert ignoradas == []


def test_ipva_total_mes_localizado_dinamicamente():
    # mês com mais dias de repasse: 'Total Mês' desloca para a direita
    m = [[linha[0], linha[1], 45661.0, linha[2], linha[3], linha[4], linha[5]]
         for linha in MATRIZ_IPVA]
    valores, _ = interpretar_matriz_ipva(m, 2025, 1)
    assert valores["ACEGUA"] == 279318.16


def test_ipva_linha_totais_pulada():
    valores, _ = interpretar_matriz_ipva(MATRIZ_IPVA, 2025, 1)
    assert "TOTAIS" not in valores


def test_ipva_mes_divergente_pelo_serial():
    with pytest.raises(MesDivergente):
        interpretar_matriz_ipva(MATRIZ_IPVA, 2025, 2)
    with pytest.raises(MesDivergente):
        interpretar_matriz_ipva(MATRIZ_IPVA, 2024, 12)


def test_ipva_sem_coluna_total_mes_e_layout_hard_stop():
    m = [[c for c in linha[:4]] + [linha[5]] for linha in MATRIZ_IPVA]  # só Total Ano
    with pytest.raises(ValueError, match="layout"):
        interpretar_matriz_ipva(m, 2025, 1)


def test_ipva_header_mudou_e_layout_hard_stop():
    m = _clona(MATRIZ_IPVA)
    m[0][0] = "MUNICIPIO"
    with pytest.raises(ValueError, match="layout"):
        interpretar_matriz_ipva(m, 2025, 1)


def test_ipva_celula_nao_numerica_vira_ignorada():
    m = _clona(MATRIZ_IPVA)
    m[2][4] = "-"
    valores, ignoradas = interpretar_matriz_ipva(m, 2025, 1)
    assert ignoradas == ["AGUA SANTA"] and "AGUA SANTA" not in valores


# ── Junção ICMS+IPVA (anti-meio-registro) ────────────────────────────────────

ALVO = {"acegua": 9}  # norm_nome_municipio("Aceguá") -> municipio_id 9


def test_montar_junta_por_nome_normalizado_e_ipi_zero():
    regs, sem_match = montar_registros_rs(
        {"ACEGUA": 1273563.64}, {"ACEGUA": 279318.16}, ALVO, 2026, 1)
    assert sem_match == []
    (r,) = regs
    assert r["municipio_id"] == 9 and r["ano"] == 2026 and r["mes"] == 1
    assert r["nome_mes"] == "Janeiro" and r["data_base"] == date(2026, 1, 1)
    assert r["valor_icms"] == 1273563.64 and r["valor_ipva"] == 279318.16
    assert r["valor_ipi"] == 0.0  # RS não publica IPI-Exportação
    assert r["valor_total"] == round(1273563.64 + 279318.16, 2)


def test_montar_alvo_so_num_arquivo_nao_grava_meio_registro():
    regs, sem_match = montar_registros_rs(
        {"ACEGUA": 1273563.64}, {}, ALVO, 2026, 1)
    assert regs == [] and sem_match == ["acegua: ausente no arquivo de IPVA"]


def test_montar_alvo_ausente_dos_dois_e_audivel():
    regs, sem_match = montar_registros_rs(
        {"OUTRA CIDADE": 1.0}, {"OUTRA CIDADE": 2.0}, ALVO, 2026, 1)
    assert regs == []
    assert sem_match == ["acegua: ausente nos arquivos de ICMS e IPVA"]


def test_montar_municipio_nao_alvo_e_ignorado():
    regs, sem_match = montar_registros_rs(
        {"ACEGUA": 1.0, "AGUA SANTA": 2.0}, {"ACEGUA": 3.0, "AGUA SANTA": 4.0},
        ALVO, 2026, 1)
    assert len(regs) == 1 and regs[0]["municipio_id"] == 9 and sem_match == []
```

- [ ] **Step 2: Rodar e confirmar que falham; criar `arrecadacao_rs.py` (parte 1)**

```python
"""Fonte automática: Arrecadação RS — repasses da Sefaz-RS aos municípios.

Download direto (ASP.NET legado): MontaArquivo.aspx?al=l_icms_rep_AAAAMM e
al=l_ipva_rep_AAAAMM — um .xls por tributo/mês. VERIFICADO nas amostras de
2026-08-05: é BIFF real (OLE2), lido com xlrd==2.0.2 (dependência nova,
exclusiva desta fonte) — NÃO é tabela HTML disfarçada. Série mensal desde
2007 (2005/2006 têm arquivo anual único de formato distinto — fora do
escopo). Município identificado SÓ POR NOME (maiúsculo sem acento).

Layout ICMS (amostra 01/2026, sheet "JANEIRO 2026"): linha 0 = "MUNICIPIO" +
um serial de data POR SEMANA de repasse + blocos "TOTAL <MES>/<ANO>" e
"TOTAL EM <ANO>"; linha 1 = REPASSE/RETENÇÃO/LÍQUIDO por bloco (3 colunas);
o Nº DE COLUNAS VARIA com as semanas → o bloco do total do mês é localizado
DINAMICAMENTE pelo texto do cabeçalho (nunca por posição fixa). Última linha
"REPASSE TOTAL ICMS" (total geral, pulada). Usa-se o LÍQUIDO do bloco TOTAL.

Layout IPVA (amostra 01/2025, sheet "Repasses"): linha 0 = "NOME DO
MUNICÍPIO" + um serial de data POR DIA de repasse (quantidade varia) +
"Total Mês" + "Total Ano"; dados direto da linha 1 (sem sub-cabeçalho);
última linha "TOTAIS" (pulada). A coluna "Total Mês" é localizada pelo texto
e o mês do arquivo é validado pelo primeiro serial (epoch 1899-12-30,
datemode 0 confirmado nas amostras).

valor_icms = LÍQUIDO total do mês; valor_ipva = Total Mês; valor_ipi = 0.0
(o RS NÃO publica a cota do IPI-Exportação em fonte dedicada — documentado
também no texto da fonte no registro); valor_total = ICMS + IPVA.

Regra anti-meio-mês: o mês SÓ é gravado quando os DOIS arquivos respondem
com layout válido — o ICMS costuma sair antes do IPVA e gravar meio-mês
criaria um registro incompleto que uma rodada futura corrigiria em silêncio.
Guardas de layout → ValueError audível hard-stop; arquivo de outro mês →
MesDivergente (aviso, mês fica de fora). Nenhum descarte silencioso: linha
ilegível → `ignoradas`; alvo sem match → `sem_match` (agregado no executar).

Testabilidade: extração xlrd (extrair_matriz, thin, sem teste) separada da
interpretação (funções puras sobre list[list], testadas com matrizes
sintéticas — nenhum teste gera BIFF)."""
import logging
import re
import unicodedata
from datetime import date, timedelta

import requests

from app.services.ingestao_automatica.arrecadacao_mg import NOME_MESES
from app.services.ingestao_automatica.base import ResumoIngestao
from app.services.ingestao_automatica.util import (
    ca_bundle_gov,
    competencias_janela,
    norm_nome_municipio,
)

logger = logging.getLogger(__name__)

URL_ARQUIVO = "https://www.sefaz.rs.gov.br/Site/MontaArquivo.aspx?al={al}"
INICIO_SERIE = (2007, 1)  # 2005/2006 = arquivos anuais de formato distinto (fora do escopo)
_MAGIC_OLE2 = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"  # assinatura de .xls BIFF real

# Como aparecem no cabeçalho "TOTAL <MES>/<ANO>" do ICMS (comparação sem
# acento via _norm_txt — tolera MARÇO/MARCO).
MESES_RS = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
            "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"]

_EPOCH_XLS = date(1899, 12, 30)


class MesDivergente(Exception):
    """O arquivo respondido é de outro mês (pedido ainda não publicado)."""


def _norm_txt(s) -> str:
    s = unicodedata.normalize("NFD", str(s or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return " ".join(s.upper().split())


def _numero(v) -> float | None:
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    return float(v)


def interpretar_matriz_icms(matriz, ano: int, mes: int) -> tuple[dict[str, float], list[str]]:
    """Matriz do .xls de ICMS → ({nome: líquido_total_do_mês}, ignoradas)."""
    if not matriz or _norm_txt(matriz[0][0]) != "MUNICIPIO":
        raise ValueError(
            f"RS ICMS {mes:02d}/{ano}: primeira célula não é MUNICIPIO — layout mudou?")
    alvo_header = f"TOTAL {_norm_txt(MESES_RS[mes - 1])}/{ano}"
    col = next((i for i, c in enumerate(matriz[0])
                if isinstance(c, str) and _norm_txt(c) == alvo_header), None)
    if col is None:
        outro = next((_norm_txt(c) for c in matriz[0] if isinstance(c, str)
                      and re.fullmatch(r"TOTAL \S+/\d{4}", _norm_txt(c))), None)
        if outro:
            raise MesDivergente(f"arquivo traz '{outro}', esperado '{alvo_header}'")
        raise ValueError(
            f"RS ICMS {mes:02d}/{ano}: bloco '{alvo_header}' ausente da linha 0 — layout mudou?")
    if len(matriz) < 3 or [_norm_txt(c) for c in matriz[1][col:col + 3]] != \
            ["REPASSE", "RETENCAO", "LIQUIDO"]:
        raise ValueError(
            f"RS ICMS {mes:02d}/{ano}: bloco TOTAL sem REPASSE/RETENÇÃO/LÍQUIDO — layout mudou?")
    col_liquido = col + 2

    valores: dict[str, float] = {}
    ignoradas: list[str] = []
    for linha in matriz[2:]:
        nome = str(linha[0] or "").strip()
        if not nome:
            continue
        if _norm_txt(nome).startswith("REPASSE TOTAL"):
            continue  # linha de total geral do arquivo
        v = _numero(linha[col_liquido]) if col_liquido < len(linha) else None
        if v is None:
            ignoradas.append(nome)
            continue
        valores[nome] = v
    return valores, ignoradas


def interpretar_matriz_ipva(matriz, ano: int, mes: int) -> tuple[dict[str, float], list[str]]:
    """Matriz do .xls de IPVA → ({nome: total_do_mês}, ignoradas)."""
    if not matriz or _norm_txt(matriz[0][0]) != "NOME DO MUNICIPIO":
        raise ValueError(
            f"RS IPVA {mes:02d}/{ano}: primeira célula não é NOME DO MUNICÍPIO — layout mudou?")
    col = next((i for i, c in enumerate(matriz[0])
                if isinstance(c, str) and _norm_txt(c) == "TOTAL MES"), None)
    if col is None:
        raise ValueError(
            f"RS IPVA {mes:02d}/{ano}: coluna 'Total Mês' ausente da linha 0 — layout mudou?")
    serial = next((_numero(c) for c in matriz[0][1:] if _numero(c) is not None), None)
    if serial is None:
        raise ValueError(
            f"RS IPVA {mes:02d}/{ano}: nenhum serial de data na linha 0 — layout mudou?")
    d = _EPOCH_XLS + timedelta(days=int(serial))
    if (d.year, d.month) != (ano, mes):
        raise MesDivergente(f"arquivo traz repasses de {d.month:02d}/{d.year}")

    valores: dict[str, float] = {}
    ignoradas: list[str] = []
    for linha in matriz[1:]:
        nome = str(linha[0] or "").strip()
        if not nome:
            continue
        if _norm_txt(nome) == "TOTAIS":
            continue  # linha de total geral do arquivo
        v = _numero(linha[col]) if col < len(linha) else None
        if v is None:
            ignoradas.append(nome)
            continue
        valores[nome] = v
    return valores, ignoradas


def montar_registros_rs(valores_icms, valores_ipva, alvo: dict[str, int],
                        ano: int, mes: int) -> tuple[list[dict], list[str]]:
    """Junção ICMS+IPVA por nome normalizado, restrita aos alvos
    (`alvo` = {norm_nome_municipio(nome): municipio_id}).

    Só monta registro para município presente NOS DOIS arquivos (espelho
    municipal da regra anti-meio-mês); alvo ausente de um ou dos dois entra
    em `sem_match` (contado e audível, nunca silencioso)."""
    icms_norm = {norm_nome_municipio(n): v for n, v in valores_icms.items()}
    ipva_norm = {norm_nome_municipio(n): v for n, v in valores_ipva.items()}
    regs: list[dict] = []
    sem_match: list[str] = []
    for nome_norm, mid in alvo.items():
        icms, ipva = icms_norm.get(nome_norm), ipva_norm.get(nome_norm)
        if icms is None and ipva is None:
            sem_match.append(f"{nome_norm}: ausente nos arquivos de ICMS e IPVA")
            continue
        if icms is None or ipva is None:
            faltou = "ICMS" if icms is None else "IPVA"
            sem_match.append(f"{nome_norm}: ausente no arquivo de {faltou}")
            continue
        regs.append({
            "municipio_id": mid,
            "ano": ano,
            "mes": mes,
            "nome_mes": NOME_MESES[mes - 1],
            "data_base": date(ano, mes, 1),
            "valor_icms": icms,
            "valor_ipva": ipva,
            "valor_ipi": 0.0,  # RS não publica IPI-Exportação (docstring do módulo)
            "valor_total": round(icms + ipva, 2),
        })
    return regs, sem_match


def extrair_matriz(conteudo: bytes) -> list[list]:
    """EXTRAÇÃO thin (deliberadamente sem teste): bytes .xls → matriz de
    células da primeira sheet não vazia, com a semântica de tipos do xlrd
    (str para texto, float para números e seriais de data, '' para vazio).
    Toda a interpretação fica nas funções puras acima. Import local: xlrd só
    é exigido quando a fonte RS de fato roda."""
    import xlrd

    wb = xlrd.open_workbook(file_contents=conteudo)
    for sh in wb.sheets():
        if sh.nrows:
            return [sh.row_values(r) for r in range(sh.nrows)]
    return []
```

(Como no PR, os imports de `requests`/`ca_bundle_gov`/`competencias_janela` são da parte 2 — Task 3.)

- [ ] **Step 3: Rodar até passar (arquivo + suite)**

```bash
venv/Scripts/python -m pytest backend/tests/test_arrecadacao_rs.py -q
venv/Scripts/python -m pytest backend/tests -q
```

Expected: 20 novos passando; suite completa exit 0.

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/ingestao_automatica/arrecadacao_rs.py backend/tests/test_arrecadacao_rs.py
git commit -m "test(arrecadacao): interpretacao pura dos xls da Sefaz-RS (bloco TOTAL dinamico, anti-meio-mes)"
```

---

### Task 3: Conectores completos + roteador por UF + registro + xlrd

**Files:**
- Modify: `backend/app/services/ingestao_automatica/arrecadacao_pr.py` (parte 2, append)
- Modify: `backend/app/services/ingestao_automatica/arrecadacao_rs.py` (parte 2, append)
- Create: `backend/app/services/ingestao_automatica/arrecadacao.py` (roteador + registro)
- Modify: `backend/app/services/ingestao_automatica/arrecadacao_mg.py` (executar→executar_mg, sem auto-registro)
- Modify: `backend/app/services/ingestao_automatica/__init__.py` (1 linha)
- Modify: `backend/requirements.txt` (xlrd)
- Test: `backend/tests/test_arrecadacao_roteador.py` (novo) + appends em `test_arrecadacao_pr.py`/`test_arrecadacao_rs.py`

**Interfaces:**
- Consumes: parsers das Tasks 1-2; `executar_mg`; `ArrecadacaoMensal`; contrato do registry (`(db, municipios, anos=None, usuario_id=None, notificar=True, progresso=None) -> ResumoIngestao`).
- Produces: `executar_pr`, `executar_rs`, roteador `executar` registrado na key `"arrecadacao"` (única entrada — `ORDEM_EXECUCAO_TODAS` intocada).

- [ ] **Step 1: Testes novos que falham**

Novo `backend/tests/test_arrecadacao_roteador.py`:

```python
"""Roteador por UF da fonte 'arrecadacao' — sem DB/rede (fakes e MagicMock)."""
from unittest.mock import MagicMock

import app.services.ingestao_automatica.arrecadacao as arrecadacao
from app.services.ingestao_automatica import FONTES_AUTOMATICAS  # registra as fontes
from app.services.ingestao_automatica.arrecadacao import (
    agrupar_por_uf,
    executar,
    mesclar_resumo,
)
from app.services.ingestao_automatica.base import ResumoIngestao


def _mun(nome, uf, mid=1):
    return MagicMock(nome=nome, estado=uf, id=mid)


def _resumo(ok=0, erro=0, linhas=0, erros=None):
    return ResumoIngestao(dataset="arrecadacao", municipios_ok=ok,
                          municipios_erro=erro, linhas=linhas, erros=erros or [])


def test_agrupar_por_uf_normaliza_caixa_e_none():
    grupos = agrupar_por_uf([_mun("A", "mg"), _mun("B", "MG"), _mun("C", "PR"),
                             _mun("D", None)])
    assert sorted(grupos) == ["?", "MG", "PR"]
    assert len(grupos["MG"]) == 2 and len(grupos["?"]) == 1


def test_mesclar_soma_contadores_e_prefixa_erros():
    destino = _resumo(ok=1, linhas=10)
    mesclar_resumo(destino, _resumo(ok=2, erro=1, linhas=5, erros=["falhou X"]), "PR")
    assert destino.municipios_ok == 3 and destino.municipios_erro == 1
    assert destino.linhas == 15 and destino.erros == ["PR: falhou X"]


def test_uf_sem_conector_vira_aviso_agregado():
    db = MagicMock()
    resumo = executar(db, [_mun("Floripa", "SC", 1), _mun("Chapecó", "SC", 2),
                           _mun("Santos", "SP", 3)])
    assert resumo.municipios_erro == 3
    assert any("sem conector para UF SC" in e and "2 município(s)" in e for e in resumo.erros)
    assert any("sem conector para UF SP" in e and "1 município(s)" in e for e in resumo.erros)


def test_despacho_por_uf_e_mescla(monkeypatch):
    chamadas = {}

    def fake_mg(db, municipios, **kw):
        chamadas["MG"] = [m.nome for m in municipios]
        return _resumo(ok=1, linhas=12)

    def fake_pr(db, municipios, **kw):
        chamadas["PR"] = [m.nome for m in municipios]
        return _resumo(ok=1, linhas=7, erros=["06/2026: ainda não publicado"])

    monkeypatch.setitem(arrecadacao.CONECTORES, "MG", fake_mg)
    monkeypatch.setitem(arrecadacao.CONECTORES, "PR", fake_pr)
    resumo = executar(MagicMock(), [_mun("Uberaba", "MG", 1), _mun("Abatiá", "PR", 2)])
    assert chamadas == {"MG": ["Uberaba"], "PR": ["Abatiá"]}
    assert resumo.municipios_ok == 2 and resumo.linhas == 19
    assert resumo.erros == ["PR: 06/2026: ainda não publicado"]


def test_isolamento_falha_de_um_conector_nao_derruba_os_outros(monkeypatch):
    def bomba(db, municipios, **kw):
        raise RuntimeError("JSP fora do ar")

    def fake_rs(db, municipios, **kw):
        return _resumo(ok=1, linhas=3)

    monkeypatch.setitem(arrecadacao.CONECTORES, "PR", bomba)
    monkeypatch.setitem(arrecadacao.CONECTORES, "RS", fake_rs)
    db = MagicMock()
    resumo = executar(db, [_mun("Abatiá", "PR", 1), _mun("Aceguá", "RS", 2)])
    assert any("PR: conector falhou" in e and "JSP fora do ar" in e for e in resumo.erros)
    assert resumo.municipios_erro == 1        # o grupo do PR inteiro
    assert resumo.municipios_ok == 1 and resumo.linhas == 3   # RS rodou
    db.rollback.assert_called()               # transação abortada não vaza p/ próxima UF


def test_progresso_repartido_por_uf(monkeypatch):
    eventos = []

    def fake(db, municipios, progresso=None, **kw):
        progresso(1, 2, "meio")
        progresso(2, 2, "fim")
        return _resumo(ok=len(municipios))

    monkeypatch.setitem(arrecadacao.CONECTORES, "MG", fake)
    monkeypatch.setitem(arrecadacao.CONECTORES, "PR", fake)
    executar(MagicMock(), [_mun("A", "MG", 1), _mun("B", "MG", 2),
                           _mun("C", "PR", 3), _mun("D", "PR", 4)],
             progresso=lambda a, t, e: eventos.append((a, t, e)))
    assert eventos == [(1, 4, "MG: meio"), (2, 4, "MG: fim"),
                       (3, 4, "PR: meio"), (4, 4, "PR: fim"),
                       (4, 4, "arrecadação concluída")]


def test_registro_unico_e_roteador_na_key_arrecadacao():
    fonte = FONTES_AUTOMATICAS["arrecadacao"]
    assert fonte.executar is executar
    assert "MG/PR/RS" in fonte.label
```

Append em `backend/tests/test_arrecadacao_pr.py`:

```python
# ── Task 3: executar_pr (HTTP e DB falsos) ───────────────────────────────────
from unittest.mock import MagicMock

import app.services.ingestao_automatica.arrecadacao_pr as arrecadacao_pr
from app.services.ingestao_automatica.arrecadacao_pr import executar_pr


def _db_vazio():
    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = []
    return db


def test_executar_pr_grava_mes_publicado_e_avisa_os_demais(monkeypatch):
    # fixture é Junho/2024: nos outros meses de 2024 o parser levanta
    # MesDivergente → aviso 'ainda não publicado', sem hard-stop
    monkeypatch.setattr(arrecadacao_pr, "_baixar_html", lambda ano, mes: FIXTURE_PR)
    db = _db_vazio()
    mun = MagicMock(nome="Abatiá", estado="PR", id=7)
    resumo = executar_pr(db, [mun], anos=[2024])
    assert db.add.call_count == 1
    reg = db.add.call_args[0][0]
    assert reg.municipio_id == 7 and reg.ano == 2024 and reg.mes == 6
    assert reg.valor_icms == 468247.98 and reg.valor_ipi == 8122.05
    assert reg.valor_ipva == 40789.94
    assert reg.valor_total == round(468247.98 + 8122.05 + 40789.94, 2)
    assert resumo.municipios_ok == 1 and resumo.linhas == 1
    assert sum("ainda não publicado" in e for e in resumo.erros) == 11


def test_executar_pr_layout_mudou_hard_stop_sem_gravar(monkeypatch):
    quebrado = FIXTURE_PR.replace("<b>IPVA<sup>4</sup></b>", "<b>Frota</b>")
    monkeypatch.setattr(arrecadacao_pr, "_baixar_html", lambda ano, mes: quebrado)
    db = _db_vazio()
    resumo = executar_pr(db, [MagicMock(nome="Abatiá", estado="PR", id=7)], anos=[2024])
    db.add.assert_not_called()
    assert any("layout mudou" in e and "abortados" in e for e in resumo.erros)
    assert resumo.municipios_ok == 0 and resumo.municipios_erro == 1


def test_executar_pr_alvo_fora_da_uf_e_avisado_sem_http(monkeypatch):
    def explode(ano, mes):
        raise AssertionError("não deveria baixar nada")
    monkeypatch.setattr(arrecadacao_pr, "_baixar_html", explode)
    resumo = executar_pr(_db_vazio(), [MagicMock(nome="Santos", estado="SP", id=1)])
    assert resumo.municipios_erro == 1
    assert any("outra UF" in e for e in resumo.erros)


def test_executar_pr_janela_default_e_36_meses(monkeypatch):
    # sem `anos`: últimas 36 competências (decisão do usuário de 2026-08-06;
    # backfill histórico só via `anos` explícitos)
    meses = []

    def fake(ano, mes):
        meses.append((ano, mes))
        return FIXTURE_PR  # meses fora de 06/2024 viram MesDivergente (aviso)

    monkeypatch.setattr(arrecadacao_pr, "_baixar_html", fake)
    executar_pr(_db_vazio(), [MagicMock(nome="Abatiá", estado="PR", id=7)])
    assert len(meses) == 36 and len(set(meses)) == 36
```

Append em `backend/tests/test_arrecadacao_rs.py`:

```python
# ── Task 3: executar_rs (HTTP e DB falsos) ───────────────────────────────────
from unittest.mock import MagicMock

import app.services.ingestao_automatica.arrecadacao_rs as arrecadacao_rs
from app.services.ingestao_automatica.arrecadacao_rs import executar_rs

# IPVA sintético de JANEIRO/2026 (serial 46032 = 2026-01-10) para casar com
# MATRIZ_ICMS (TOTAL JANEIRO/2026)
MATRIZ_IPVA_JAN26 = [
    ["NOME DO MUNICÍPIO", 46032.0, 46033.0, "Total Mês", "Total Ano"],
    ["ACEGUA", 100.0, 50.0, 279318.16, 279318.16],
    ["TOTAIS", 100.0, 50.0, 279318.16, 279318.16],
]


def _db_vazio():
    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = []
    return db


def test_executar_rs_grava_mes_com_os_dois_arquivos(monkeypatch):
    def fake_baixar(al):
        if al == "l_icms_rep_202601":
            return MATRIZ_ICMS, None
        if al == "l_ipva_rep_202601":
            return MATRIZ_IPVA_JAN26, None
        return None, "não publicado (404)"
    monkeypatch.setattr(arrecadacao_rs, "_baixar_matriz", fake_baixar)
    db = _db_vazio()
    resumo = executar_rs(db, [MagicMock(nome="Aceguá", estado="RS", id=9)], anos=[2026])
    assert db.add.call_count == 1
    reg = db.add.call_args[0][0]
    assert reg.municipio_id == 9 and reg.ano == 2026 and reg.mes == 1
    assert reg.valor_icms == 1273563.64 and reg.valor_ipva == 279318.16
    assert reg.valor_ipi == 0.0
    assert resumo.municipios_ok == 1 and resumo.linhas == 1


def test_executar_rs_anti_meio_mes_nao_grava_so_com_icms(monkeypatch):
    def fake_baixar(al):
        if al == "l_icms_rep_202601":
            return MATRIZ_ICMS, None
        return None, "não publicado (404)"
    monkeypatch.setattr(arrecadacao_rs, "_baixar_matriz", fake_baixar)
    db = _db_vazio()
    resumo = executar_rs(db, [MagicMock(nome="Aceguá", estado="RS", id=9)], anos=[2026])
    db.add.assert_not_called()
    assert any("aguardando publicação completa" in e and "IPVA" in e for e in resumo.erros)
    assert resumo.municipios_ok == 0 and resumo.municipios_erro == 1


def test_executar_rs_janela_default_e_36_meses(monkeypatch):
    # sem `anos`: últimas 36 competências × 2 arquivos (ICMS+IPVA) por mês
    als = []

    def fake(al):
        als.append(al)
        return None, "não publicado (404)"

    monkeypatch.setattr(arrecadacao_rs, "_baixar_matriz", fake)
    executar_rs(_db_vazio(), [MagicMock(nome="Aceguá", estado="RS", id=9)])
    assert len(als) == 72 and len(set(als)) == 72
```

Rodar e confirmar que falham:

```bash
venv/Scripts/python -m pytest backend/tests/test_arrecadacao_roteador.py backend/tests/test_arrecadacao_pr.py backend/tests/test_arrecadacao_rs.py -q
```

- [ ] **Step 2: Parte 2 do `arrecadacao_pr.py` (append ao módulo da Task 1)**

```python
# ── HTTP + execução (parte 2) ────────────────────────────────────────────────

def _get_retry(url: str) -> requests.Response:
    """GET com 1 retry (padrão HTTP das fontes; JSP legado sem SLA).
    verify=ca_bundle_gov(): superconjunto do certifi que fecha cadeias
    gov.br com intermediário faltando."""
    try:
        resp = requests.get(url, timeout=(30, 120),
                            headers={"User-Agent": "Mozilla/5.0"}, verify=ca_bundle_gov())
        resp.raise_for_status()
        return resp
    except requests.RequestException:
        resp = requests.get(url, timeout=(30, 120),
                            headers={"User-Agent": "Mozilla/5.0"}, verify=ca_bundle_gov())
        resp.raise_for_status()
        return resp


def _baixar_html(ano: int, mes: int) -> str:
    return decodificar(_get_retry(URL_MENSAL.format(ano=ano, mes=mes)).content)


def _upsert_mensal(db, regs: list[dict], resumo: ResumoIngestao, mids_ok: set) -> None:
    """Upsert-com-UPDATE por (municipio_id, ano, mes) no idioma REAL do
    conector MG (query dos existentes + setattr/add), commit por mês. Todos
    os regs de uma chamada são do MESMO (ano, mes)."""
    from app.models.arrecadacao import ArrecadacaoMensal

    if not regs:
        return
    mids = {r["municipio_id"] for r in regs}
    existentes = {
        (r.municipio_id, r.ano, r.mes): r
        for r in db.query(ArrecadacaoMensal).filter(
            ArrecadacaoMensal.municipio_id.in_(mids),
            ArrecadacaoMensal.ano == regs[0]["ano"],
            ArrecadacaoMensal.mes == regs[0]["mes"]).all()
    }
    for r in regs:
        reg = existentes.get((r["municipio_id"], r["ano"], r["mes"]))
        if reg:
            for coluna, valor in r.items():
                setattr(reg, coluna, valor)
        else:
            db.add(ArrecadacaoMensal(**r))
        resumo.linhas += 1
        mids_ok.add(r["municipio_id"])
    db.commit()


def executar_pr(db, municipios, anos=None, usuario_id=None, notificar=True, progresso=None) -> ResumoIngestao:
    """Conector PR. Janela default: últimas 36 competências (idioma das
    demais fontes mensais do repo — pix/estban); com `anos`, todos os meses
    desses anos, clampados pela competencias_janela entre INICIO_SERIE
    (2003-01) e o mês anterior. Backfill histórico = `anos` explícitos.
    `notificar` aceito e ignorado (a fonte arrecadação não tem regra de
    notificação)."""
    resumo = ResumoIngestao(dataset="arrecadacao")
    de_pr = [m for m in municipios if (m.estado or "").upper() == "PR"]
    fora = len(municipios) - len(de_pr)
    if fora:
        resumo.erros.append(
            f"conector PR cobre apenas municípios do PR — {fora} município(s) de outra UF ignorado(s)")
        resumo.municipios_erro += fora
    alvo = {norm_nome_municipio(m.nome): m.id for m in de_pr}
    if not alvo:
        return resumo

    competencias = competencias_janela(anos=anos, inicio=INICIO_SERIE, meses_default=36)
    mids_ok: set[int] = set()
    for i, (ano, mes) in enumerate(competencias):
        if progresso:
            progresso(i, len(competencias), f"repasses PR {mes:02d}/{ano}")
        try:
            html = _baixar_html(ano, mes)
        except requests.RequestException as exc:
            resumo.erros.append(
                f"{mes:02d}/{ano}: SEFA-PR indisponível ({exc}) — meses restantes abortados")
            break
        try:
            valores, ignoradas = parse_html_mensal(html, ano, mes)
        except MesDivergente as exc:
            resumo.erros.append(f"{mes:02d}/{ano}: ainda não publicado ({exc})")
            continue
        except ValueError as exc:
            resumo.erros.append(f"{exc} — nenhuma linha do mês gravada; meses restantes abortados")
            break
        if ignoradas:
            resumo.erros.append(
                f"{mes:02d}/{ano}: {len(ignoradas)} linha(s) ilegível(is) ignorada(s): "
                + ", ".join(sorted(ignoradas)[:5]))
        regs = []
        for nome, (icms, fundo, ipva) in valores.items():
            mid = alvo.get(norm_nome_municipio(nome))
            if mid is None:
                continue  # município do PR que não é alvo desta execução
            regs.append({
                "municipio_id": mid, "ano": ano, "mes": mes,
                "nome_mes": NOME_MESES[mes - 1], "data_base": date(ano, mes, 1),
                "valor_icms": icms, "valor_ipva": ipva, "valor_ipi": fundo,
                "valor_total": round(icms + ipva + fundo, 2),
            })
        _upsert_mensal(db, regs, resumo, mids_ok)

    resumo.municipios_ok = len(mids_ok)
    faltantes = set(alvo.values()) - mids_ok
    resumo.municipios_erro += len(faltantes)
    nomes = {m.id: f"{m.nome}/PR" for m in de_pr}
    for mid in sorted(faltantes):
        resumo.erros.append(
            f"{nomes.get(mid, mid)}: não encontrado nos repasses da SEFA-PR (grafia divergente?)")
    if progresso:
        progresso(len(competencias), len(competencias), "repasses PR gravados")
    return resumo
```

- [ ] **Step 3: Parte 2 do `arrecadacao_rs.py` (append ao módulo da Task 2)**

```python
# ── HTTP + execução (parte 2) ────────────────────────────────────────────────

def _get_retry(url: str) -> requests.Response:
    """GET com 1 retry (padrão HTTP das fontes; ASP legado sem SLA)."""
    try:
        resp = requests.get(url, timeout=(30, 120),
                            headers={"User-Agent": "Mozilla/5.0"}, verify=ca_bundle_gov())
        resp.raise_for_status()
        return resp
    except requests.RequestException:
        resp = requests.get(url, timeout=(30, 120),
                            headers={"User-Agent": "Mozilla/5.0"}, verify=ca_bundle_gov())
        resp.raise_for_status()
        return resp


def _baixar_matriz(al: str) -> tuple[list[list] | None, str | None]:
    """(matriz, None) ou (None, motivo-não-publicado). Não-publicado = 404 OU
    corpo que não é OLE2/BIFF (o ASP responde página HTML de erro com 200
    nesses casos — a assinatura mágica é o discriminador). Falha de rede após
    o retry propaga RequestException (o executar aborta a UF, audível)."""
    try:
        resp = _get_retry(URL_ARQUIVO.format(al=al))
    except requests.HTTPError as exc:
        if exc.response is not None and exc.response.status_code == 404:
            return None, "não publicado (404)"
        raise
    if not resp.content.startswith(_MAGIC_OLE2):
        return None, "não publicado (resposta não é .xls)"
    return extrair_matriz(resp.content), None


def _upsert_mensal(db, regs: list[dict], resumo: ResumoIngestao, mids_ok: set) -> None:
    """Idêntico ao do conector PR (idioma do MG; módulos autocontidos como o
    próprio MG — duplicação deliberada de ~20 linhas)."""
    from app.models.arrecadacao import ArrecadacaoMensal

    if not regs:
        return
    mids = {r["municipio_id"] for r in regs}
    existentes = {
        (r.municipio_id, r.ano, r.mes): r
        for r in db.query(ArrecadacaoMensal).filter(
            ArrecadacaoMensal.municipio_id.in_(mids),
            ArrecadacaoMensal.ano == regs[0]["ano"],
            ArrecadacaoMensal.mes == regs[0]["mes"]).all()
    }
    for r in regs:
        reg = existentes.get((r["municipio_id"], r["ano"], r["mes"]))
        if reg:
            for coluna, valor in r.items():
                setattr(reg, coluna, valor)
        else:
            db.add(ArrecadacaoMensal(**r))
        resumo.linhas += 1
        mids_ok.add(r["municipio_id"])
    db.commit()


def executar_rs(db, municipios, anos=None, usuario_id=None, notificar=True, progresso=None) -> ResumoIngestao:
    """Conector RS. Janela default: últimas 36 competências (idioma das
    demais fontes mensais do repo); com `anos`, todos os meses desses anos,
    clampados entre INICIO_SERIE (2007-01) e o mês anterior — backfill
    histórico = `anos` explícitos. Um mês só é gravado com ICMS E IPVA
    válidos (anti-meio-mês — ver docstring do módulo). `notificar` aceito e
    ignorado."""
    resumo = ResumoIngestao(dataset="arrecadacao")
    de_rs = [m for m in municipios if (m.estado or "").upper() == "RS"]
    fora = len(municipios) - len(de_rs)
    if fora:
        resumo.erros.append(
            f"conector RS cobre apenas municípios do RS — {fora} município(s) de outra UF ignorado(s)")
        resumo.municipios_erro += fora
    alvo = {norm_nome_municipio(m.nome): m.id for m in de_rs}
    if not alvo:
        return resumo

    competencias = competencias_janela(anos=anos, inicio=INICIO_SERIE, meses_default=36)
    mids_ok: set[int] = set()
    sem_match_meses: dict[str, int] = {}
    for i, (ano, mes) in enumerate(competencias):
        if progresso:
            progresso(i, len(competencias), f"repasses RS {mes:02d}/{ano}")
        anomes = f"{ano}{mes:02d}"
        try:
            matriz_icms, motivo_icms = _baixar_matriz(f"l_icms_rep_{anomes}")
            matriz_ipva, motivo_ipva = _baixar_matriz(f"l_ipva_rep_{anomes}")
        except requests.RequestException as exc:
            resumo.erros.append(
                f"{mes:02d}/{ano}: Sefaz-RS indisponível ({exc}) — meses restantes abortados")
            break
        if matriz_icms is None or matriz_ipva is None:
            faltas = [f"{rot} {mot}" for rot, mtz, mot in
                      (("ICMS", matriz_icms, motivo_icms), ("IPVA", matriz_ipva, motivo_ipva))
                      if mtz is None]
            resumo.erros.append(
                f"{mes:02d}/{ano}: aguardando publicação completa — {'; '.join(faltas)}")
            continue
        try:
            valores_icms, ign_icms = interpretar_matriz_icms(matriz_icms, ano, mes)
            valores_ipva, ign_ipva = interpretar_matriz_ipva(matriz_ipva, ano, mes)
        except MesDivergente as exc:
            resumo.erros.append(f"{mes:02d}/{ano}: ainda não publicado ({exc})")
            continue
        except ValueError as exc:
            resumo.erros.append(f"{exc} — nenhuma linha do mês gravada; meses restantes abortados")
            break
        if ign_icms or ign_ipva:
            resumo.erros.append(
                f"{mes:02d}/{ano}: linha(s) ilegível(is) ignorada(s) — ICMS {len(ign_icms)}, IPVA {len(ign_ipva)}")
        regs, sem_match = montar_registros_rs(valores_icms, valores_ipva, alvo, ano, mes)
        for s in sem_match:
            sem_match_meses[s] = sem_match_meses.get(s, 0) + 1
        _upsert_mensal(db, regs, resumo, mids_ok)

    for s, n in sorted(sem_match_meses.items()):
        resumo.erros.append(f"{s} em {n} mês(es)")
    resumo.municipios_ok = len(mids_ok)
    faltantes = set(alvo.values()) - mids_ok
    resumo.municipios_erro += len(faltantes)
    if progresso:
        progresso(len(competencias), len(competencias), "repasses RS gravados")
    return resumo
```

- [ ] **Step 4: Criar o roteador `arrecadacao.py` (assume o registro)**

```python
"""Fonte 'arrecadacao' — roteador por UF (um card só, mesma key de sempre).

Agrupa os municípios-alvo por UF e despacha: MG → executar_mg (CKAN
dados.mg.gov.br), PR → executar_pr (SEFA/JSP), RS → executar_rs (Sefaz/.xls).
UF sem conector → 1 aviso agregado por UF (municípios contados em
municipios_erro). Os ResumoIngestao parciais são mesclados (somas; erros
concatenados com prefixo da UF). Falha de um conector NÃO derruba os outros
(isolamento por UF com rollback e erro audível). O progresso é repartido
proporcionalmente ao nº de municípios de cada UF."""
import logging

from app.services.ingestao_automatica.arrecadacao_mg import executar_mg
from app.services.ingestao_automatica.arrecadacao_pr import executar_pr
from app.services.ingestao_automatica.arrecadacao_rs import executar_rs
from app.services.ingestao_automatica.base import FonteAutomatica, ResumoIngestao, registrar

logger = logging.getLogger(__name__)

CONECTORES = {"MG": executar_mg, "PR": executar_pr, "RS": executar_rs}


def agrupar_por_uf(municipios) -> dict[str, list]:
    grupos: dict[str, list] = {}
    for m in municipios:
        grupos.setdefault(((m.estado or "").upper() or "?"), []).append(m)
    return grupos


def mesclar_resumo(destino: ResumoIngestao, parcial: ResumoIngestao, uf: str) -> None:
    destino.municipios_ok += parcial.municipios_ok
    destino.municipios_erro += parcial.municipios_erro
    destino.linhas += parcial.linhas
    destino.notificacoes += parcial.notificacoes
    destino.erros.extend(f"{uf}: {e}" for e in parcial.erros)


def _progresso_da_uf(progresso, base: int, peso: int, total: int, uf: str):
    """Reescala o progresso de um conector para a fatia da sua UF."""
    if progresso is None:
        return None

    def cb(atual, total_uf, etapa):
        fracao = min(atual / total_uf, 1.0) if total_uf else 0.0
        progresso(base + round(fracao * peso), total, f"{uf}: {etapa}")
    return cb


def executar(db, municipios, anos=None, usuario_id=None, notificar=True, progresso=None) -> ResumoIngestao:
    resumo = ResumoIngestao(dataset="arrecadacao")
    grupos = agrupar_por_uf(municipios)
    total = len(municipios)
    base = 0
    for uf in sorted(grupos):
        grupo = grupos[uf]
        conector = CONECTORES.get(uf)
        if conector is None:
            resumo.erros.append(
                f"arrecadação: sem conector para UF {uf} — {len(grupo)} município(s) ignorado(s)")
            resumo.municipios_erro += len(grupo)
        else:
            try:
                parcial = conector(db, grupo, anos=anos, usuario_id=usuario_id,
                                   notificar=notificar,
                                   progresso=_progresso_da_uf(progresso, base, len(grupo), total, uf))
            except Exception as exc:  # isolamento por UF — nunca derruba as outras
                logger.exception("conector de arrecadação %s falhou", uf)
                db.rollback()  # não vazar transação abortada para a próxima UF
                resumo.erros.append(f"{uf}: conector falhou ({type(exc).__name__}: {exc})")
                resumo.municipios_erro += len(grupo)
            else:
                mesclar_resumo(resumo, parcial, uf)
        base += len(grupo)
    if progresso and total:
        progresso(total, total, "arrecadação concluída")
    return resumo


registrar(FonteAutomatica(
    key="arrecadacao",
    label="Arrecadação (repasses MG/PR/RS)",
    fonte="SEF-MG (dados.mg.gov.br), SEFA-PR (Portal da Transparência) e Sefaz-RS — "
          "repasses mensais de ICMS, IPVA e IPI/Fundo de Exportação aos municípios "
          "(RS não publica IPI-Exportação: valor_ipi=0)",
    executar=executar,
))
```

- [ ] **Step 5: Refactor do `arrecadacao_mg.py` (lógica INTACTA)**

Três edits pontuais — nada mais muda no módulo:

1. Import (linha 18): `from app.services.ingestao_automatica.base import FonteAutomatica, ResumoIngestao, registrar` → `from app.services.ingestao_automatica.base import ResumoIngestao`
2. Assinatura: `def executar(db, municipios, ...)` → `def executar_mg(db, municipios, ...)` (corpo intocado).
3. Remover o bloco final `registrar(FonteAutomatica(...))` inteiro (o registro agora é do roteador). Na última frase do docstring do módulo, trocar `Fonte MG-only: alvos de outra UF geram um aviso único.` por `Fonte MG-only: alvos de outra UF geram um aviso único. Registrada pelo roteador arrecadacao.py (como executar_mg); não se registra mais sozinha.`

Em `backend/app/services/ingestao_automatica/__init__.py`, trocar a linha do arrecadacao_mg:

```python
from app.services.ingestao_automatica import arrecadacao  # noqa: F401 — roteador MG/PR/RS (importa arrecadacao_mg/pr/rs)
```

(`ORDEM_EXECUCAO_TODAS` NÃO muda — `arrecadacao` já está lá, e os testes de paridade existentes garantem 1 entrada só.)

Em `backend/requirements.txt`, logo após `openpyxl==3.1.5`:

```text
xlrd==2.0.2  # .xls BIFF legado da Sefaz-RS — só a fonte arrecadacao (conector RS) usa
```

E instalar no venv:

```bash
venv/Scripts/python -m pip install xlrd==2.0.2
```

- [ ] **Step 6: Gates + smoke real de HTTP (poucos requests)**

```bash
venv/Scripts/python -m pytest backend/tests/test_arrecadacao_pr.py backend/tests/test_arrecadacao_rs.py backend/tests/test_arrecadacao_roteador.py -q
venv/Scripts/python -m pytest backend/tests -q
```

Expected: todos os novos + suite exit 0 (os testes existentes de `test_ingestao_automatica.py` seguem passando — importam `montar_repasses`/`parse_dim_*`, que não mudaram; os de `test_ingestao_todas.py` também — a key continua única).

Smoke REAL (3 requests, valida URL/TLS/formato em produção das fontes) — script `smoke_sul.py` no scratchpad:

```python
import sys
sys.path.insert(0, r"C:\Users\lucas\Documents\projetos\dashboard_prefeituras\backend")
from app.services.ingestao_automatica.arrecadacao_pr import _baixar_html, parse_html_mensal
from app.services.ingestao_automatica.arrecadacao_rs import (
    _baixar_matriz, interpretar_matriz_icms, interpretar_matriz_ipva)

v, ig = parse_html_mensal(_baixar_html(2025, 6), 2025, 6)
assert len(v) > 390 and not ig, (len(v), ig[:5])
m, motivo = _baixar_matriz("l_icms_rep_202506"); assert m is not None, motivo
vi, _ = interpretar_matriz_icms(m, 2025, 6); assert len(vi) > 490, len(vi)
m2, motivo2 = _baixar_matriz("l_ipva_rep_202506"); assert m2 is not None, motivo2
vp, _ = interpretar_matriz_ipva(m2, 2025, 6); assert len(vp) > 490, len(vp)
print("smoke ok:", len(v), "PR |", len(vi), "ICMS RS |", len(vp), "IPVA RS")
```

Expected: `smoke ok: 399 PR | 497 ICMS RS | 497 IPVA RS` (±: nº oficial de municípios). Se o `https://www4.pr.gov.br` recusar TLS, testar `http://` e ajustar `URL_MENSAL` (a spec registrou o host sem esquema; o certificado é a única incógnita que só o smoke resolve — investigar antes de seguir, nunca desligar `verify`).

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/ingestao_automatica/arrecadacao.py \
        backend/app/services/ingestao_automatica/arrecadacao_pr.py \
        backend/app/services/ingestao_automatica/arrecadacao_rs.py \
        backend/app/services/ingestao_automatica/arrecadacao_mg.py \
        backend/app/services/ingestao_automatica/__init__.py \
        backend/requirements.txt \
        backend/tests/test_arrecadacao_pr.py \
        backend/tests/test_arrecadacao_rs.py \
        backend/tests/test_arrecadacao_roteador.py
git commit -m "feat(arrecadacao): roteador por UF + conectores PR (SEFA/JSP) e RS (Sefaz/xls, anti-meio-mes)"
```

---

### Task 4: Verificação final — gates, E2E real com sintéticos, docs

**Files:**
- Modify: `README.md` (linha da fonte; conferir WIP antes)

- [ ] **Step 1: Gates completos**

```bash
venv/Scripts/python -m pytest backend/tests -q
```

Expected: exit 0 (273 + 46 novos = 319). Smoke do registro (card único, ordem do "todas" intacta), da pasta `backend/`:

```bash
../venv/Scripts/python -c "import app.services.ingestao_automatica as ia; from app.services.ingestao_automatica.base import ORDEM_EXECUCAO_TODAS; f = ia.FONTES_AUTOMATICAS['arrecadacao']; assert 'MG/PR/RS' in f.label and ORDEM_EXECUCAO_TODAS.count('arrecadacao') == 1; print('registro ok:', f.label)"
```

- [ ] **Step 2: E2E real — municípios PR/RS SINTÉTICOS no banco de dev**

Não há clientes de PR/RS; criar 2 municípios sintéticos com `is_demo=True` (fora de benchmark/ranking), coletar 2 meses REAIS, conferir, re-rodar, limpar. Script `e2e_sul.py` no scratchpad:

```python
import sys
sys.path.insert(0, r"C:\Users\lucas\Documents\projetos\dashboard_prefeituras\backend")
from app.db.session import SessionLocal
from app.models.arrecadacao import ArrecadacaoMensal
from app.models.municipio import Municipio
from app.services.ingestao_automatica import FONTES_AUTOMATICAS

db = SessionLocal()
# 1. sintéticos (is_demo: fora das análises cruzadas)
m_pr = Municipio(nome="Abatiá", estado="PR", codigo_ibge="4100103", ativo=True,
                 plano="free", is_demo=True)
m_rs = Municipio(nome="Aceguá", estado="RS", codigo_ibge="4300034", ativo=True,
                 plano="free", is_demo=True)
db.add_all([m_pr, m_rs]); db.commit()
print("sintéticos:", m_pr.id, m_rs.id)

# 2. coleta real de 2025 via ROTEADOR (mesmo caminho da tela)
resumo = FONTES_AUTOMATICAS["arrecadacao"].executar(db, [m_pr, m_rs], anos=[2025])
print("linhas:", resumo.linhas, "ok:", resumo.municipios_ok, "erro:", resumo.municipios_erro)
for e in resumo.erros:
    print("  erro/aviso:", e)

def contagens():
    q = db.query(ArrecadacaoMensal).filter(
        ArrecadacaoMensal.municipio_id.in_([m_pr.id, m_rs.id]))
    tot = q.count()
    pr = [r for r in q if r.municipio_id == m_pr.id]
    rs = [r for r in q if r.municipio_id == m_rs.id]
    return tot, pr, rs

tot, pr, rs = contagens()
print("total:", tot, "| PR:", len(pr), "| RS:", len(rs))
assert len(pr) == 12, "PR 2025 completo (12 meses)"
assert all(r.valor_ipi == 0.0 and r.valor_icms > 0 and r.valor_ipva > 0 for r in rs), "RS: ipi=0, icms/ipva>0"
assert all(r.valor_icms > 0 and r.valor_total == round(r.valor_icms + r.valor_ipva + r.valor_ipi, 2) for r in pr)

# 3. re-run idempotente (upsert-com-update: mesmas contagens)
r2 = FONTES_AUTOMATICAS["arrecadacao"].executar(db, [m_pr, m_rs], anos=[2025])
tot2, _, _ = contagens()
assert tot2 == tot, f"re-run duplicou: {tot} -> {tot2}"
print("re-run idempotente ok:", tot2)

# 4. cleanup
db.query(ArrecadacaoMensal).filter(
    ArrecadacaoMensal.municipio_id.in_([m_pr.id, m_rs.id])).delete(synchronize_session=False)
db.delete(m_pr); db.delete(m_rs); db.commit()
print("cleanup ok")
db.close()
```

Expected: `PR: 12` (2025 fechado); RS ≤ 12 conforme publicação do IPVA 2025 (meses ausentes aparecem como aviso "aguardando publicação completa" — audíveis, nunca silenciosos); re-run com contagens idênticas; cleanup zera. Se o resumo trouxer erro de match de nome (grafia), investigar antes de concluir — não é aceitável ignorar.

- [ ] **Step 3: Smoke misto do roteador (opcional, mas barato)**

Repetir o Step 2 acrescentando 1 município MG REAL já existente à lista de alvos (sem cleanup dos dados MG — são legítimos e idempotentes): conferir que o resumo mescla as 3 UFs e que os erros vêm prefixados por UF.

- [ ] **Step 4: README + checklist do usuário + commit final**

`git status README.md` primeiro (regra WIP): se o usuário tiver modificação pendente, fazer o edit e NÃO commitar o arquivo. Edit — linha 14 da tabela "Datasets & Pages":

```text
| Arrecadação | Monthly tax revenue (ICMS, IPVA, IPI) | Secretarias da Fazenda MG/PR/RS — automática |
```

Registrar no ledger o checklist do usuário (pós-deploy):
1. `pip install -r backend/requirements.txt` no ambiente de prod (xlrd novo) antes de reiniciar a API/worker.
2. Rodar a fonte Arrecadação pela tela com um alvo MG (regressão do caminho MG via roteador).
3. Quando existir cliente PR/RS real: a execução default cobre as últimas 36 competências. Backfill histórico só com `anos` explícitos (PR aceita desde 2003, RS desde 2007) — nota: corrida longa (~1-2 requests/mês por UF em sistemas legados, dezenas de minutos), idempotente.
4. Conferir na tela de coletas que os avisos por UF aparecem prefixados ("RS: 07/2026: aguardando publicação completa …").

```bash
git add README.md   # SÓ se o git status mostrar o README sem WIP do usuário
git commit -m "docs(arrecadacao): fonte MG/PR/RS na tabela de datasets"
```

(Se o README estiver com WIP, o commit final da task é o da Task 3 — a task termina commitada de qualquer forma.)

---

## Self-review do plano (executado na escrita)

- **Spec coverage:** roteador com mesma key/aviso-agregado/isolamento/progresso repartido → Task 3 Step 4 + testes do roteador; `executar_mg` exportado com lógica intacta → Step 5 (3 edits pontuais); PR stdlib `html.parser` + número BR + guarda de layout + Referência → Task 1; royalties FORA documentado no docstring E provado por teste aritmético (517.606,18 − 446,21); RS BIFF/xlrd (verificação obrigatória: FEITA — amostras são OLE2 reais), bloco TOTAL dinâmico, `valor_ipi=0.0`, anti-meio-mês (arquivo E município), 404/não-OLE2 = não-publicado → Tasks 2-3; upsert = idioma REAL do MG (query+setattr/add, não `on_conflict`) → `_upsert_mensal`; janela default = últimas 36 competências (`competencias_janela(..., meses_default=36)`, idioma pix/estban — decisão do usuário de 2026-08-06 VETANDO a "paridade de janela com MG" da spec; backfill histórico só via `anos` explícitos) → testes de janela default nos dois executars; casos de borda da spec (UF sem conector, grafia divergente, fonte fora com retry 1x, execução mista) todos com teste ou passo E2E; E2E com sintéticos `is_demo` + re-run idempotente + cleanup → Task 4.
- **Amostras reais:** headers transcritos verbatim das inspeções (PR: 7 rótulos + sub-colunas + "Referência:"/"Total em"; ICMS: `MUNICIPIO`/`TOTAL JANEIRO/2026`/`TOTAL EM 2026`/`REPASSE TOTAL ICMS`; IPVA: `NOME DO MUNICÍPIO`/`Total Mês`/`Total Ano`/`TOTAIS`); fixtures com valores reais conferíveis; seriais validados (46028=2026-01-06, 45659=2025-01-02, epoch 1899-12-30).
- **Testabilidade RS:** `extrair_matriz` thin (xlrd, sem teste) vs interpretação pura testada com `list[list]` — nenhum teste gera BIFF; PR testado com fixture string mínimo estruturalmente idêntico à página real.
- **Consistência interna:** assinaturas dos 3 executars idênticas ao contrato de `base.py`; `nome_mes` vem de `NOME_MESES` do MG (byte-igual entre UFs); `valor_total` sempre `round(icms+ipva+ipi, 2)` como no MG; `_upsert_mensal` duplicado deliberadamente em PR e RS (módulos autocontidos, idioma MG — anotado no código); testes de executar usam MagicMock com query-chain configurada (sem DB).
- **Riscos assumidos e onde são pegos:** esquema `https` do www4.pr.gov.br e comportamento do MontaArquivo para mês inexistente não são verificáveis offline → smoke real de 3 requests no Step 6 da Task 3 ANTES do commit da task; encoding PR mudou da spec (UTF-8 real) → `decodificar` cobre os dois e tem teste.
- **Contagem:** 12 (T1) + 20 (T2) + 14 (T3) = 46 testes novos; suite esperada ≈ 319. Placeholders: nenhum — todos os módulos completos nas Tasks 1-3; Task 4 é verificação com scripts concretos.
