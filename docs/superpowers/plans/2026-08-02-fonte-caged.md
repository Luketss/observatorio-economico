# Fonte automática CAGED (PDET/MTE) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fonte automática `caged` no pipeline de ingestão: microdados do Novo CAGED via FTP do PDET, com ajustes (MOV+FOR−EXC), alimentando as 13 tabelas `caged_*` com REPLACE por (município, mês).

**Architecture:** Módulo novo `caged_pdet.py` no padrão das fontes existentes (`comex_mdic.py` é a referência). Helpers puros de agregação (testáveis sem rede/DB) + wrapper FTP fino + `executar()` que orquestra mês a mês em disco. Registro via `registrar(FonteAutomatica(...))` + import no `__init__` + entrada em `ORDEM_EXECUCAO_TODAS`.

**Tech Stack:** Python 3.13, SQLAlchemy 2, ftplib (stdlib), py7zr (novo), pytest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-02-fonte-caged-design.md` — em dúvida, o spec manda.
- Testes rodam de `backend/`: `..\venv\Scripts\python.exe -m pytest` (Windows, venv na raiz do repo).
- Fontes nunca carregam o período inteiro em memória: 1 mês por vez, extração em `tempfile.TemporaryDirectory`, apagada após agregar.
- Mapas código→rótulo são os do layout OFICIAL do Novo CAGED (extraídos do xlsx do FTP em 2026-08-02, transcritos abaixo) — NÃO copiar os mapas de `ingestao/carregar_caged.py` (codificação antiga; sexo/tipomovimentação/tamanho divergem).
- Rótulos idênticos aos existentes quando o conceito coincide (ex.: sexo 1→"Masculino", 3→"Feminino") para não fragmentar séries.
- Commits pequenos por task, mensagem `feat(ingestao): ...`, com trailer padrão do projeto.

---

## Contexto validado (2026-08-02)

- FTP `ftp.mtps.gov.br`, login anônimo, `ftp.encoding = "latin-1"` (caminhos têm acento).
- `/pdet/microdados/NOVO CAGED/{ano}/{YYYYMM}/CAGED{MOV|FOR|EXC}{YYYYMM}.7z`; interno um `.txt` UTF-8 com BOM, `;`, decimal vírgula. MOV ~55 MB comprimido; FOR ~1 MB; EXC ~0,1 MB. Arquivo/mês inexistente → erro FTP `550`.
- Header real: `competênciamov;região;uf;município;seção;subclasse;saldomovimentação;cbo2002ocupação;categoria;graudeinstrução;idade;horascontratuais;raçacor;sexo;tipoempregador;tipoestabelecimento;tipomovimentação;tipodedeficiência;indtrabintermitente;indtrabparcial;salário;tamestabjan;indicadoraprendiz;origemdainformação;competênciadec;indicadordeforadoprazo;unidadesaláriocódigo;valorsaláriofixo` (EXC acrescenta `competênciaexc;indicadordeexclusão`).
- `município` = IBGE 6 dígitos (sem DV) → casar com `codigo_ibge[:6]`.
- `saldomovimentação` = ±1 por linha. Linhas FOR/EXC de um arquivo YYYYMM podem referir competências ANTIGAS (`competênciamov` < YYYYMM).
- py7zr 1.1.x NÃO tem leitura em memória — só `extractall(path)`.

---

### Task 1: Mapas oficiais + agregação pura (TDD)

**Files:**
- Create: `backend/app/services/ingestao_automatica/caged_pdet.py`
- Test: `backend/tests/test_caged_pdet.py`
- Modify: `backend/requirements.txt` (adicionar `py7zr==1.1.3`)

**Interfaces:**
- Produces: `novo_agregados() -> dict`, `agregar_arquivo(linhas, ibge6_para_mid: dict[str,int], competencias_alvo: set[tuple[int,int]], agg: dict, sinal: int = 1) -> int` (linhas = iterável de linhas de texto, header incluso; retorna nº de linhas agregadas). Estrutura de `agg`: chaves `mensal, por_sexo, por_raca, salario, por_cnae, por_escolaridade, por_faixa_etaria, por_tipo_mov, por_tipo_def, por_tamanho, por_tipo_emp, por_tipo_estab, indicadores` (dicts; ver código).

- [ ] **Step 1: Escrever os testes que falham**

```python
# backend/tests/test_caged_pdet.py
"""Agregação pura dos microdados do Novo CAGED — sem rede, sem DB.

Header real do PDET (validado 2026-08-02); saldomovimentação ±1 por linha;
EXC entra com sinal -1 no MESMO lado (admissão excluída decrementa admissões,
não vira desligamento)."""
import io

from app.services.ingestao_automatica.caged_pdet import (
    SEXO_MAP,
    agregar_arquivo,
    novo_agregados,
)

HEADER = (
    "competênciamov;região;uf;município;seção;subclasse;saldomovimentação;"
    "cbo2002ocupação;categoria;graudeinstrução;idade;horascontratuais;raçacor;"
    "sexo;tipoempregador;tipoestabelecimento;tipomovimentação;tipodedeficiência;"
    "indtrabintermitente;indtrabparcial;salário;tamestabjan;indicadoraprendiz;"
    "origemdainformação;competênciadec;indicadordeforadoprazo;"
    "unidadesaláriocódigo;valorsaláriofixo"
)


def _linha(comp="202506", mun="312230", secao="A", saldo="1", grau="7",
           idade="30", raca="3", sexo="1", tipo_emp="0", tipo_estab="1",
           tipo_mov="20", tipo_def="0", intermitente="0", parcial="0",
           sal="1500,00", tam="2", aprendiz="0", fora_prazo="0"):
    return (
        f"{comp};3;31;{mun};{secao};111302;{saldo};622020;101;{grau};{idade};44,00;"
        f"{raca};{sexo};{tipo_emp};{tipo_estab};{tipo_mov};{tipo_def};"
        f"{intermitente};{parcial};{sal};{tam};{aprendiz};1;{comp};{fora_prazo};5;{sal}"
    )


ALVO = {"312230": 42}
JANELA = {(2025, 6)}


def _agrega(linhas, sinal=1, agg=None):
    agg = agg or novo_agregados()
    agregar_arquivo(io.StringIO("\n".join([HEADER] + linhas)), ALVO, JANELA, agg, sinal)
    return agg


def test_admissao_e_desligamento_no_mensal():
    agg = _agrega([_linha(saldo="1"), _linha(saldo="1"), _linha(saldo="-1")])
    assert agg["mensal"][(42, 2025, 6)] == {"admissoes": 2, "desligamentos": 1}


def test_exc_decrementa_o_mesmo_lado():
    agg = _agrega([_linha(saldo="1"), _linha(saldo="1")])
    _agrega([_linha(saldo="1")], sinal=-1, agg=agg)  # exclusão de uma admissão
    assert agg["mensal"][(42, 2025, 6)] == {"admissoes": 1, "desligamentos": 0}


def test_fora_da_janela_e_fora_do_alvo_sao_ignorados():
    agg = _agrega([
        _linha(comp="202401"),          # fora da janela
        _linha(mun="355030"),           # fora do alvo
        _linha(),
    ])
    assert agg["mensal"] == {(42, 2025, 6): {"admissoes": 1, "desligamentos": 0}}


def test_mapa_sexo_novo_caged():
    # Novo CAGED: 1=Homem, 3=Mulher (a codificação antiga usava 2=Feminino)
    assert SEXO_MAP == {"1": "Masculino", "3": "Feminino"}
    agg = _agrega([_linha(sexo="1"), _linha(sexo="3"), _linha(sexo="9")])
    assert agg["por_sexo"][(42, 2025, 6, "Masculino")]["admissoes"] == 1
    assert agg["por_sexo"][(42, 2025, 6, "Feminino")]["admissoes"] == 1
    assert agg["por_sexo"][(42, 2025, 6, "Não informado")]["admissoes"] == 1


def test_salario_media_ponderada_com_sinal():
    agg = _agrega([_linha(sal="1000,00"), _linha(sal="2000,00")])
    _agrega([_linha(sal="2000,00")], sinal=-1, agg=agg)
    s = agg["salario"][(42, 2025, 6)]
    assert s["sum_adm"] == 1000.0 and s["cnt_adm"] == 1


def test_indicadores_anuais_e_pcd():
    agg = _agrega([
        _linha(parcial="1"),
        _linha(tipo_def="1", saldo="-1"),
        _linha(fora_prazo="1"),
        _linha(tipo_def="9"),  # Não Identificado NÃO conta como PCD
    ])
    ind = agg["indicadores"][(42, 2025)]
    assert ind["total"] == 4 and ind["parcial"] == 1
    assert ind["pcd"] == 1 and ind["fora_prazo"] == 1
    assert (42, 2025, 6, "Física") in agg["por_tipo_def"]


def test_cnae_faixa_etaria_e_tamanho_oficial():
    agg = _agrega([_linha(secao="C", idade="17", tam="10")])
    assert agg["por_cnae"][(42, 2025, 6, "C", "Indústrias de Transformação")]["admissoes"] == 1
    assert agg["por_faixa_etaria"][(42, 2025, 6, "Até 17 anos")]["admissoes"] == 1
    # tamestabjan oficial: 10 = "1000 ou Mais" (codificação antiga tinha 9=1000+)
    assert agg["por_tamanho"][(42, 2025, 6, "1000 ou mais")]["admissoes"] == 1


def test_linha_malformada_nao_derruba():
    agg = _agrega(["lixo;sem;colunas", _linha()])
    assert agg["mensal"][(42, 2025, 6)]["admissoes"] == 1
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run (de `backend/`): `..\venv\Scripts\python.exe -m pytest tests/test_caged_pdet.py -x`
Expected: FAIL — `ModuleNotFoundError`/`ImportError: caged_pdet`

- [ ] **Step 3: Implementar mapas + agregação**

```python
# backend/app/services/ingestao_automatica/caged_pdet.py
"""Fonte automática: Novo CAGED por município (microdados PDET/MTE, FTP).

Metodologia "com ajustes": saldo do mês M = MOV(M) + FOR(competência M)
− EXC(competência M). EXC entra com sinal -1 no MESMO lado da movimentação
original (admissão excluída decrementa admissões — não vira desligamento).
Arquivos FOR/EXC de um mês carregam competências antigas, por isso são
filtrados por `competencias_alvo`. Mapas código→rótulo seguem o layout
OFICIAL do Novo CAGED (xlsx no FTP) — a codificação difere do CAGED antigo
usado nos CSVs manuais (sexo 1/3, tamestabjan deslocado, tipomovimentação).
Rótulos mantêm as strings já existentes no banco quando o conceito coincide."""
import csv
import logging

from app.services.ingestao_automatica.base import FonteAutomatica, ResumoIngestao, registrar
from app.services.ingestao_automatica.util import parse_valor_br
from ingestao.carregar_caged import CNAE_SECAO_DESC, _faixa_etaria

logger = logging.getLogger(__name__)

SEXO_MAP = {"1": "Masculino", "3": "Feminino"}

RACA_COR_MAP = {
    "1": "Branca", "2": "Preta", "3": "Parda", "4": "Amarela",
    "5": "Indígena", "6": "Não informada",
}

GRAU_INSTRUCAO_MAP = {
    "1": "Analfabeto", "2": "Até 5ª incompleto", "3": "5ª completo fundamental",
    "4": "6ª a 9ª fundamental", "5": "Fund. completo", "6": "Médio incompleto",
    "7": "Médio completo", "8": "Superior incompleto", "9": "Superior completo",
    "10": "Mestrado", "11": "Doutorado", "80": "Pós-graduação completa",
}

TIPO_MOV_MAP = {
    "10": "Admissão por primeiro emprego",
    "20": "Admissão por reemprego",
    "25": "Admissão por contrato trabalho prazo determinado",
    "31": "Desligamento por demissão sem justa causa",
    "32": "Desligamento por demissão com justa causa",
    "33": "Culpa recíproca",
    "35": "Admissão por reintegração",
    "40": "Desligamento a pedido",
    "43": "Término contrato trabalho prazo determinado",
    "45": "Desligamento por término de contrato",
    "50": "Desligamento por aposentadoria",
    "60": "Desligamento por morte",
    "70": "Admissão por transferência",
    "80": "Desligamento por transferência",
    "90": "Desligamento por acordo entre empregado e empregador",
    "97": "Admissão de tipo ignorado",
    "98": "Desligamento de tipo ignorado",
}

TIPO_DEFICIENCIA_MAP = {
    "1": "Física", "2": "Auditiva", "3": "Visual",
    "4": "Mental / Intelectual", "5": "Múltipla", "6": "Reabilitado",
}

TAMANHO_ESTAB_MAP = {
    "1": "Zero", "2": "1 a 4", "3": "5 a 9", "4": "10 a 19", "5": "20 a 49",
    "6": "50 a 99", "7": "100 a 249", "8": "250 a 499", "9": "500 a 999",
    "10": "1000 ou mais",
}

TIPO_EMPREGADOR_MAP = {"0": "CNPJ raiz", "2": "CPF"}

TIPO_ESTABELECIMENTO_MAP = {
    "1": "CNPJ", "3": "CAEPF (pessoa física)", "4": "CNO (obra)",
    "5": "CEI (CAGED)",
}

_COLUNAS = (
    "competênciamov", "município", "seção", "saldomovimentação",
    "graudeinstrução", "idade", "raçacor", "sexo", "tipoempregador",
    "tipoestabelecimento", "tipomovimentação", "tipodedeficiência",
    "indtrabintermitente", "indtrabparcial", "salário", "tamestabjan",
    "indicadoraprendiz", "indicadordeforadoprazo",
)

_CHAVES_AGG = (
    "mensal", "por_sexo", "por_raca", "salario", "por_cnae",
    "por_escolaridade", "por_faixa_etaria", "por_tipo_mov", "por_tipo_def",
    "por_tamanho", "por_tipo_emp", "por_tipo_estab", "indicadores",
)


def novo_agregados() -> dict:
    return {k: {} for k in _CHAVES_AGG}


def _soma(d: dict, chave, lado: str, inc: int) -> None:
    item = d.setdefault(chave, {"admissoes": 0, "desligamentos": 0})
    item[lado] += inc


def agregar_arquivo(linhas, ibge6_para_mid, competencias_alvo, agg, sinal: int = 1) -> int:
    """Agrega um arquivo (MOV/FOR com sinal=+1; EXC com sinal=-1) em `agg`.
    `linhas` = iterável de linhas de texto (header incluso). Retorna quantas
    linhas entraram na agregação."""
    reader = csv.reader(linhas, delimiter=";")
    header = next(reader, None)
    if header is None:
        raise ValueError("CAGED: arquivo vazio")
    idx = {c.strip(): i for i, c in enumerate(header)}
    faltando = [c for c in _COLUNAS if c not in idx]
    if faltando:
        raise ValueError(f"CAGED: colunas ausentes {faltando} — layout mudou?")

    def col(row, nome):
        return row[idx[nome]].strip()

    agregadas = 0
    for row in reader:
        try:
            mid = ibge6_para_mid.get(col(row, "município"))
            if mid is None:
                continue
            comp = col(row, "competênciamov")
            ano, mes = int(comp[:4]), int(comp[4:6])
            if (ano, mes) not in competencias_alvo:
                continue
            saldo = int(col(row, "saldomovimentação"))
        except (IndexError, ValueError):
            continue
        lado = "admissoes" if saldo > 0 else "desligamentos"
        inc = sinal * abs(saldo)
        agregadas += 1

        _soma(agg["mensal"], (mid, ano, mes), lado, inc)
        _soma(agg["por_sexo"], (mid, ano, mes, SEXO_MAP.get(col(row, "sexo"), "Não informado")), lado, inc)
        _soma(agg["por_raca"], (mid, ano, mes, RACA_COR_MAP.get(col(row, "raçacor"), "Não informada")), lado, inc)
        _soma(agg["por_escolaridade"], (mid, ano, mes, GRAU_INSTRUCAO_MAP.get(col(row, "graudeinstrução"), "Não informado")), lado, inc)

        secao = col(row, "seção").upper()
        if secao and secao in CNAE_SECAO_DESC:
            _soma(agg["por_cnae"], (mid, ano, mes, secao, CNAE_SECAO_DESC[secao]), lado, inc)

        try:
            idade = int(col(row, "idade") or 0)
        except ValueError:
            idade = 0
        _soma(agg["por_faixa_etaria"], (mid, ano, mes, _faixa_etaria(idade)), lado, inc)

        tipo_mov = col(row, "tipomovimentação")
        rotulo_mov = TIPO_MOV_MAP.get(tipo_mov, f"Código {tipo_mov}" if tipo_mov else "Não informado")
        _soma(agg["por_tipo_mov"], (mid, ano, mes, rotulo_mov), lado, inc)

        tipo_def = col(row, "tipodedeficiência")
        eh_pcd = tipo_def in TIPO_DEFICIENCIA_MAP
        if eh_pcd:
            _soma(agg["por_tipo_def"], (mid, ano, mes, TIPO_DEFICIENCIA_MAP[tipo_def]), lado, inc)

        tam = TAMANHO_ESTAB_MAP.get(col(row, "tamestabjan"))
        if tam:
            _soma(agg["por_tamanho"], (mid, ano, mes, tam), lado, inc)
        emp = TIPO_EMPREGADOR_MAP.get(col(row, "tipoempregador"))
        if emp:
            _soma(agg["por_tipo_emp"], (mid, ano, mes, emp), lado, inc)
        estab = TIPO_ESTABELECIMENTO_MAP.get(col(row, "tipoestabelecimento"))
        if estab:
            _soma(agg["por_tipo_estab"], (mid, ano, mes, estab), lado, inc)

        sal = parse_valor_br(col(row, "salário")) or 0.0
        if sal > 0:
            s = agg["salario"].setdefault((mid, ano, mes), {"sum_adm": 0.0, "cnt_adm": 0, "sum_des": 0.0, "cnt_des": 0})
            if saldo > 0:
                s["sum_adm"] += sinal * sal * abs(saldo)
                s["cnt_adm"] += inc
            else:
                s["sum_des"] += sinal * sal * abs(saldo)
                s["cnt_des"] += inc

        ind = agg["indicadores"].setdefault((mid, ano), {
            "total": 0, "parcial": 0, "intermitente": 0,
            "aprendiz": 0, "pcd": 0, "fora_prazo": 0,
        })
        ind["total"] += inc
        if col(row, "indtrabparcial") == "1":
            ind["parcial"] += inc
        if col(row, "indtrabintermitente") == "1":
            ind["intermitente"] += inc
        if col(row, "indicadoraprendiz") == "1":
            ind["aprendiz"] += inc
        if eh_pcd:
            ind["pcd"] += inc
        if col(row, "indicadordeforadoprazo") == "1":
            ind["fora_prazo"] += inc
    return agregadas
```

E em `backend/requirements.txt`, depois da linha `openpyxl==3.1.5`, adicionar:

```
py7zr==1.1.3
```

- [ ] **Step 4: Rodar os testes**

Run: `..\venv\Scripts\python.exe -m pytest tests/test_caged_pdet.py -x`
Expected: PASS (8 testes)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ingestao_automatica/caged_pdet.py backend/tests/test_caged_pdet.py backend/requirements.txt
git commit -m "feat(ingestao): agregacao pura do Novo CAGED (mapas oficiais, MOV+FOR-EXC)"
```

---

### Task 2: Janela de competências + regra do ano completo (TDD)

**Files:**
- Modify: `backend/app/services/ingestao_automatica/caged_pdet.py`
- Test: `backend/tests/test_caged_pdet.py` (append)

**Interfaces:**
- Consumes: `competencias_janela` de `app.services.ingestao_automatica.util` (assinatura: `competencias_janela(anos=None, inicio=(2022,1), meses_default=12, hoje=None) -> list[tuple[int,int]]`).
- Produces: `anos_completos(meses_ok: set[tuple[int,int]], ultimo_publicado: tuple[int,int]) -> list[int]` e `meses_forexc(competencias: list[tuple[int,int]], hoje) -> list[tuple[int,int]]`.

- [ ] **Step 1: Testes que falham** (append em `test_caged_pdet.py`)

```python
from datetime import date

from app.services.ingestao_automatica.caged_pdet import anos_completos, meses_forexc


def test_anos_completos_exige_todos_os_meses_publicados():
    meses_2024 = {(2024, m) for m in range(1, 13)}
    # 2024 completo; 2025 até o último publicado (2025-06) completo
    ok = meses_2024 | {(2025, m) for m in range(1, 7)}
    assert anos_completos(ok, (2025, 6)) == [2024, 2025]
    # sem janeiro/2025, 2025 não é completo
    assert anos_completos(ok - {(2025, 1)}, (2025, 6)) == [2024]
    # janela parcial de 2024 (só dez) não recomputa 2024
    assert anos_completos({(2024, 12)} | {(2025, m) for m in range(1, 7)}, (2025, 6)) == [2025]


def test_meses_forexc_vai_da_janela_ate_o_mes_anterior_a_hoje():
    # janela = ano fechado 2024; FOR/EXC de exclusões tardias vão até 2026-06
    janela = [(2024, m) for m in range(1, 13)]
    meses = meses_forexc(janela, hoje=date(2026, 7, 15))
    assert meses[0] == (2024, 1) and meses[-1] == (2026, 6)
    assert len(meses) == 30
```

- [ ] **Step 2: Rodar — FAIL** (`ImportError: anos_completos`)

- [ ] **Step 3: Implementar** (em `caged_pdet.py`)

```python
def anos_completos(meses_ok, ultimo_publicado) -> list[int]:
    """Anos cujo total anual pode ser recomputado: todos os meses publicados
    do ano (jan..dez, ou jan..último publicado para o ano corrente) foram
    processados com sucesso nesta execução. Ano parcial preserva o valor
    existente em caged_indicadores_contrato."""
    anos = sorted({a for (a, _m) in meses_ok})
    completos = []
    for ano in anos:
        fim = ultimo_publicado[1] if ano == ultimo_publicado[0] else 12
        if all((ano, m) in meses_ok for m in range(1, fim + 1)):
            completos.append(ano)
    return completos


def meses_forexc(competencias, hoje) -> list[tuple[int, int]]:
    """FOR/EXC precisam ir do início da janela até o mês anterior a `hoje`:
    exclusões/atrasos de uma competência antiga aparecem em arquivos de
    meses posteriores (validado: linhas de 202001 no EXC de 202606)."""
    ano, mes = min(competencias)
    fim = (hoje.year, hoje.month - 1) if hoje.month > 1 else (hoje.year - 1, 12)
    out = []
    while (ano, mes) <= fim:
        out.append((ano, mes))
        ano, mes = (ano, mes + 1) if mes < 12 else (ano + 1, 1)
    return out
```

- [ ] **Step 4: Rodar — PASS**

Run: `..\venv\Scripts\python.exe -m pytest tests/test_caged_pdet.py -x`

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ingestao_automatica/caged_pdet.py backend/tests/test_caged_pdet.py
git commit -m "feat(ingestao): janela CAGED - regra do ano completo e faixa FOR/EXC"
```

---

### Task 3: Download FTP + extração 7z (wrapper fino, 550 tolerado)

**Files:**
- Modify: `backend/app/services/ingestao_automatica/caged_pdet.py`
- Test: `backend/tests/test_caged_pdet.py` (append — só a lógica de 550)

**Interfaces:**
- Produces: `baixar_e_extrair(ftp, tipo: str, ano: int, mes: int, destino_dir: str) -> str | None` (caminho do `.txt` extraído; `None` se o arquivo não existe no FTP — competência não publicada), `conectar_ftp() -> FTP`.

- [ ] **Step 1: Teste que falha** (append)

```python
import ftplib

from app.services.ingestao_automatica.caged_pdet import baixar_e_extrair


class _FtpInexistente:
    def retrbinary(self, cmd, cb):
        raise ftplib.error_perm("550 The system cannot find the file specified.")


def test_baixar_e_extrair_550_vira_none(tmp_path):
    assert baixar_e_extrair(_FtpInexistente(), "MOV", 2026, 7, str(tmp_path)) is None
```

- [ ] **Step 2: Rodar — FAIL** (`ImportError: baixar_e_extrair`)

- [ ] **Step 3: Implementar** (em `caged_pdet.py`; imports novos no topo: `import ftplib`, `import os`, `from ftplib import FTP`, `import py7zr`)

```python
FTP_HOST = "ftp.mtps.gov.br"
FTP_DIR = "/pdet/microdados/NOVO CAGED/{ano}/{ano}{mes:02d}"


def conectar_ftp() -> "FTP":
    ftp = FTP(FTP_HOST, timeout=120)
    ftp.login()
    ftp.encoding = "latin-1"  # caminhos do PDET têm acento
    return ftp


def baixar_e_extrair(ftp, tipo: str, ano: int, mes: int, destino_dir: str) -> str | None:
    """RETR do CAGED{tipo}{AAAAMM}.7z para disco + extractall (py7zr 1.1 não
    lê em memória). 550 = competência não publicada → None (aviso, não erro)."""
    nome = f"CAGED{tipo}{ano}{mes:02d}"
    remoto = f"{FTP_DIR.format(ano=ano, mes=mes)}/{nome}.7z"
    caminho_7z = os.path.join(destino_dir, f"{nome}.7z")
    try:
        with open(caminho_7z, "wb") as f:
            ftp.retrbinary(f"RETR {remoto}", f.write)
    except ftplib.error_perm as exc:
        if str(exc).startswith("550"):
            return None
        raise
    with py7zr.SevenZipFile(caminho_7z) as z:
        nomes = z.getnames()
        z.extractall(destino_dir)
    os.remove(caminho_7z)
    return os.path.join(destino_dir, nomes[0])
```

- [ ] **Step 4: Rodar — PASS**, depois a suíte inteira: `..\venv\Scripts\python.exe -m pytest`

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ingestao_automatica/caged_pdet.py backend/tests/test_caged_pdet.py
git commit -m "feat(ingestao): download FTP + extracao 7z do Novo CAGED (550 tolerado)"
```

---

### Task 4: `executar()` + gravação REPLACE + registro da fonte

**Files:**
- Modify: `backend/app/services/ingestao_automatica/caged_pdet.py`
- Modify: `backend/app/services/ingestao_automatica/__init__.py` (import `caged_pdet`)
- Modify: `backend/app/services/ingestao_automatica/base.py` (`"caged"` em `ORDEM_EXECUCAO_TODAS`, entre `"arrecadacao"` e `"captacao_federal"`)

**Interfaces:**
- Consumes: tudo das Tasks 1–3; `codigo_ibge_valido` de `populacao_ibge`; `competencias_janela` de `util`; models de `app.models.caged`; `tuple_` do SQLAlchemy.
- Produces: fonte registrada `key="caged"` — o teste de paridade existente (`test_ingestao_todas.py`) passa a exigir a entrada em `ORDEM_EXECUCAO_TODAS`.

- [ ] **Step 1: Implementar `executar()`** (append em `caged_pdet.py`; imports novos: `import tempfile`, `from datetime import date`, `from sqlalchemy import tuple_`, `from app.services.ingestao_automatica.util import competencias_janela`)

```python
def executar(db, municipios, anos=None, usuario_id=None, notificar=True, progresso=None) -> ResumoIngestao:
    from app.models.caged import (
        CagedIndicadoresContrato, CagedMovimentacao, CagedPorCnae,
        CagedPorEscolaridade, CagedPorFaixaEtaria, CagedPorRaca, CagedPorSexo,
        CagedPorTamanhoEstabelecimento, CagedPorTipoDeficiencia,
        CagedPorTipoEmpregador, CagedPorTipoEstabelecimento,
        CagedPorTipoMovimentacao, CagedSalario,
    )
    from app.services.ingestao_automatica.populacao_ibge import codigo_ibge_valido

    resumo = ResumoIngestao(dataset="caged")
    alvo: dict[str, int] = {}
    for m in municipios:
        if codigo_ibge_valido(m.codigo_ibge):
            alvo[m.codigo_ibge.strip()[:6]] = m.id
        else:
            resumo.municipios_erro += 1
            resumo.erros.append(f"{m.nome}/{m.estado}: codigo_ibge ausente/inválido")
    if not alvo:
        return resumo

    competencias = competencias_janela(anos, inicio=(2020, 1))
    if not competencias:
        resumo.erros.append("CAGED: nenhuma competência na janela (fonte começa em 2020-01)")
        return resumo

    agg = novo_agregados()
    meses_ok: set[tuple[int, int]] = set()
    total_meses = len(competencias)

    # Fase 1 — MOV mês a mês (pesado): baixa, extrai, agrega, apaga.
    ftp = conectar_ftp()
    try:
        for i, (ano, mes) in enumerate(competencias, start=1):
            if progresso:
                progresso(i - 1, total_meses, f"MOV {ano}-{mes:02d}: baixando")
            with tempfile.TemporaryDirectory(prefix="caged_") as tmp:
                caminho = baixar_e_extrair(ftp, "MOV", ano, mes, tmp)
                if caminho is None:
                    resumo.erros.append(
                        f"CAGED {ano}-{mes:02d}: competência ainda não publicada — mês pulado"
                    )
                    continue
                if progresso:
                    progresso(i, total_meses, f"MOV {ano}-{mes:02d}: agregando")
                with open(caminho, newline="", encoding="utf-8-sig") as f:
                    agregar_arquivo(f, alvo, {(ano, mes)}, agg, sinal=1)
            meses_ok.add((ano, mes))

        if not meses_ok:
            return resumo

        # Fase 2 — FOR (+1) e EXC (−1): pequenos, cobrem exclusões/atrasos
        # publicados DEPOIS da competência; filtrados aos meses com MOV ok.
        for j, (ano, mes) in enumerate(meses_forexc(competencias, date.today()), start=1):
            if progresso:
                progresso(total_meses, total_meses, f"ajustes {ano}-{mes:02d} (FOR/EXC)")
            for tipo, sinal in (("FOR", 1), ("EXC", -1)):
                with tempfile.TemporaryDirectory(prefix="caged_") as tmp:
                    caminho = baixar_e_extrair(ftp, tipo, ano, mes, tmp)
                    if caminho is None:
                        continue  # ajuste do mês ainda não publicado — normal
                    with open(caminho, newline="", encoding="utf-8-sig") as f:
                        agregar_arquivo(f, alvo, meses_ok, agg, sinal=sinal)
    finally:
        try:
            ftp.quit()
        except Exception:  # noqa: BLE001 — conexão pode já ter caído
            ftp.close()

    ultimo_publicado = max(meses_ok)
    anos_ind = anos_completos(meses_ok, ultimo_publicado)
    for ano in sorted({a for (a, _m) in meses_ok if a not in anos_ind}):
        resumo.erros.append(
            f"CAGED {ano}: indicadores anuais preservados (janela não cobre o ano inteiro)"
        )

    # Fase 3 — REPLACE por (município, mês) nas 12 tabelas mensais.
    def _linhas(d):
        # d: chave (mid, ano, mes, *extras) → {"admissoes","desligamentos"}
        for chave, tot in d.items():
            yield chave, {
                "admissoes": tot["admissoes"], "desligamentos": tot["desligamentos"],
                "saldo": tot["admissoes"] - tot["desligamentos"],
            }

    mensais = [
        (CagedMovimentacao, agg["mensal"], ()),
        (CagedPorSexo, agg["por_sexo"], ("sexo",)),
        (CagedPorRaca, agg["por_raca"], ("raca_cor",)),
        (CagedPorEscolaridade, agg["por_escolaridade"], ("grau_instrucao",)),
        (CagedPorFaixaEtaria, agg["por_faixa_etaria"], ("faixa_etaria",)),
        (CagedPorTipoMovimentacao, agg["por_tipo_mov"], ("tipo_movimentacao",)),
        (CagedPorTipoDeficiencia, agg["por_tipo_def"], ("tipo_deficiencia",)),
        (CagedPorTamanhoEstabelecimento, agg["por_tamanho"], ("tamanho",)),
        (CagedPorTipoEmpregador, agg["por_tipo_emp"], ("tipo_empregador",)),
        (CagedPorTipoEstabelecimento, agg["por_tipo_estab"], ("tipo_estabelecimento",)),
    ]

    todos_mids = sorted(set(alvo.values()))
    meses_lista = sorted(meses_ok)
    for i, mid in enumerate(todos_mids, start=1):
        if progresso:
            progresso(i, len(todos_mids), "gravando municípios")
        for model, _dados, _extras in mensais + [(CagedPorCnae, None, None), (CagedSalario, None, None)]:
            db.query(model).filter(
                model.municipio_id == mid,
                tuple_(model.ano, model.mes).in_(meses_lista),
            ).delete(synchronize_session=False)

        for model, dados, extras in mensais:
            for chave, valores in _linhas(dados):
                if chave[0] != mid:
                    continue
                extra_vals = dict(zip(extras, chave[3:]))
                db.add(model(municipio_id=mid, ano=chave[1], mes=chave[2], **extra_vals, **valores))
                resumo.linhas += 1

        for (m_id, ano, mes, secao, desc), tot in agg["por_cnae"].items():
            if m_id != mid:
                continue
            db.add(CagedPorCnae(
                municipio_id=mid, ano=ano, mes=mes, secao=secao, descricao_secao=desc,
                admissoes=tot["admissoes"], desligamentos=tot["desligamentos"],
                saldo=tot["admissoes"] - tot["desligamentos"],
            ))
            resumo.linhas += 1

        for (m_id, ano, mes), s in agg["salario"].items():
            if m_id != mid:
                continue
            db.add(CagedSalario(
                municipio_id=mid, ano=ano, mes=mes,
                salario_medio_admissoes=(s["sum_adm"] / s["cnt_adm"]) if s["cnt_adm"] > 0 else None,
                salario_medio_desligamentos=(s["sum_des"] / s["cnt_des"]) if s["cnt_des"] > 0 else None,
            ))
            resumo.linhas += 1

        if anos_ind:
            db.query(CagedIndicadoresContrato).filter(
                CagedIndicadoresContrato.municipio_id == mid,
                CagedIndicadoresContrato.ano.in_(anos_ind),
            ).delete(synchronize_session=False)
            for (m_id, ano), ind in agg["indicadores"].items():
                if m_id != mid or ano not in anos_ind:
                    continue
                db.add(CagedIndicadoresContrato(
                    municipio_id=mid, ano=ano,
                    total_movimentacoes=ind["total"], total_parcial=ind["parcial"],
                    total_intermitente=ind["intermitente"], total_aprendiz=ind["aprendiz"],
                    total_pcd=ind["pcd"], total_fora_prazo=ind["fora_prazo"],
                ))
                resumo.linhas += 1

        db.commit()
        resumo.municipios_ok += 1
        # município sem linha = sem movimentação formal (zero é dado, não erro)
    return resumo


registrar(FonteAutomatica(
    key="caged",
    label="Emprego formal (Novo CAGED/MTE)",
    fonte="MTE — Novo CAGED, microdados de movimentações (PDET/FTP), com ajustes",
    executar=executar,
))
```

- [ ] **Step 2: Registrar no `__init__.py`** — adicionar ao final dos imports:

```python
from app.services.ingestao_automatica import caged_pdet  # noqa: F401
```

- [ ] **Step 3: `base.py`** — em `ORDEM_EXECUCAO_TODAS`, inserir `"caged"` depois de `"arrecadacao"`:

```python
    "arrecadacao",
    "caged",
    "captacao_federal",
```

- [ ] **Step 4: Suíte completa**

Run: `..\venv\Scripts\python.exe -m pytest`
Expected: PASS — atenção ao teste de paridade de `test_ingestao_todas.py` (agora exige `caged` na ordem) e ao smoke de import.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ingestao_automatica/caged_pdet.py backend/app/services/ingestao_automatica/__init__.py backend/app/services/ingestao_automatica/base.py
git commit -m "feat(ingestao): fonte automatica caged (executar + REPLACE por municipio/mes)"
```

---

### Task 5: Verificação E2E (rede real, escopo mínimo)

**Files:** nenhum novo — script descartável no scratchpad.

- [ ] **Step 1: Smoke local sem DB** — baixar e agregar UM mês pequeno real (valida encoding/colunas de MOV de verdade, não só do EXC):

```python
# scratchpad/e2e_caged_smoke.py
import sys, tempfile
sys.path.insert(0, r"C:\Users\lucas\Documents\projetos\dashboard_prefeituras\backend")
from app.services.ingestao_automatica.caged_pdet import (
    agregar_arquivo, baixar_e_extrair, conectar_ftp, novo_agregados,
)

ftp = conectar_ftp()
agg = novo_agregados()
with tempfile.TemporaryDirectory() as tmp:
    caminho = baixar_e_extrair(ftp, "MOV", 2026, 6, tmp)
    with open(caminho, newline="", encoding="utf-8-sig") as f:
        n = agregar_arquivo(f, {"312230": 1}, {(2026, 6)}, agg, 1)
ftp.quit()
print("linhas agregadas (Divinópolis):", n)
print("mensal:", agg["mensal"])
print("salario:", agg["salario"])
```

Expected: contagens plausíveis (> 0 para Divinópolis/MG), sem exceção. Cruzar o saldo com o painel público do Novo CAGED se possível.

- [ ] **Step 2: E2E completo via tela admin** — CONFIRMAR COM O USUÁRIO antes (grava no Postgres de produção do Railway): rodar a fonte "Emprego formal (Novo CAGED/MTE)" com 1 município + ano corrente pela tela de coletas; acompanhar progresso; conferir /app/caged visualmente.

- [ ] **Step 3: Atualizar memória/registro** — IDEAS.md: mover CAGED de "falta" para implementado (nota curta), commit `docs: caged automatico no IDEAS`.
