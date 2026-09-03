"""Descoberta na base RFB: o score SQL espelha calcular_relevancia sem
cadastro (máximo 45); universo exclui acompanhadas; filtros, ordem e
paginação."""
import itertools
from datetime import date, timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.db.base import Base
from app.models.desenvolvimento_economico import EmpresaRetencao
from app.models.empresa import Empresa
from app.models.municipio import Municipio
from app.services.gestao_empresarial import (
    _datas_de_corte,
    calcular_relevancia,
    descobrir,
    divisoes_disponiveis,
    expressao_score_rfb,
)

HOJE = date(2026, 9, 2)
SEM_CADASTRO = SimpleNamespace(num_empregos=None, potencial_expansao="baixo")


@pytest.fixture()
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine, tables=[Municipio.__table__, Empresa.__table__, EmpresaRetencao.__table__])
    sessao = sessionmaker(bind=engine)()
    yield sessao
    sessao.close()


def _municipio(db, nome="Alfa"):
    m = Municipio(nome=nome, estado="MG")
    db.add(m)
    db.flush()
    return m


def _empresa(db, m, raiz, **kw):
    base = dict(municipio_id=m.id, cnpj_basico=raiz, razao_social=f"Empresa {raiz}", situacao="02")
    base.update(kw)
    e = Empresa(**base)
    db.add(e)
    db.flush()
    return e


def _acompanhar(db, m, raiz):
    db.add(EmpresaRetencao(municipio_id=m.id, nome=f"Acompanhada {raiz}", cnpj_basico=raiz))
    db.flush()


# ── consistência SQL × Python ────────────────────────────────────────────────

PORTES = [None, "00", "01", "03", "05"]
SITUACOES = ["02", "03", "04", "08", "01", None]
CAPITAIS = [None, 10_000.0, 10_000.01, 100_000.01, 1_000_000.01, 10_000_000.01]


def _datas_amostra():
    c10, c5, c2 = _datas_de_corte(HOJE)
    return [None, HOJE, c2 + timedelta(days=1), c2, c5, c10, date(1990, 1, 1)]


def test_score_sql_igual_ao_python_em_todas_as_combinacoes(db):
    m = _municipio(db)
    combos = list(itertools.product(PORTES, SITUACOES, CAPITAIS, _datas_amostra()))
    for i, (porte, sit, cap, ini) in enumerate(combos):
        _empresa(db, m, f"{i:08d}", porte=porte, situacao=sit, capital_social=cap, data_inicio=ini)
    db.commit()
    lidos = {e.cnpj_basico: int(s) for e, s in
             db.query(Empresa, expressao_score_rfb(HOJE)).filter(Empresa.municipio_id == m.id)}
    divergencias = []
    for i, (porte, sit, cap, ini) in enumerate(combos):
        perfil = SimpleNamespace(porte=porte, situacao=sit, capital_social=cap, data_inicio=ini)
        esperado = calcular_relevancia(SEM_CADASTRO, perfil, HOJE).score
        if lidos[f"{i:08d}"] != esperado:
            divergencias.append((porte, sit, cap, ini, lidos[f"{i:08d}"], esperado))
    assert divergencias == []
    assert max(lidos.values()) == 45


def test_datas_de_corte_em_29_de_fevereiro():
    assert _datas_de_corte(date(2028, 2, 29)) == (date(2018, 2, 28), date(2023, 2, 28), date(2026, 2, 28))
    assert _datas_de_corte(HOJE) == (date(2016, 9, 2), date(2021, 9, 2), date(2024, 9, 2))


# ── descobrir ────────────────────────────────────────────────────────────────

def test_descobrir_exclui_acompanhadas_so_do_mesmo_municipio(db):
    m1, m2 = _municipio(db, "Alfa"), _municipio(db, "Beta")
    _empresa(db, m1, "11111111", porte="05")
    _empresa(db, m1, "22222222", porte="01")
    _empresa(db, m2, "11111111", porte="05")
    _acompanhar(db, m1, "11111111")
    db.commit()
    total, linhas = descobrir(db, m1.id, hoje=HOJE)
    assert total == 1 and [e.cnpj_basico for e, _ in linhas] == ["22222222"]
    total2, linhas2 = descobrir(db, m2.id, hoje=HOJE)   # a mesma raiz em outro município segue descoberta
    assert total2 == 1 and linhas2[0][0].cnpj_basico == "11111111"


def test_descobrir_ordena_por_score_desc_e_razao_social(db):
    m = _municipio(db)
    _empresa(db, m, "00000001", razao_social="Zeta", porte="05", capital_social=5e6, data_inicio=date(2000, 1, 1))  # 20+15+8 = 43
    _empresa(db, m, "00000002", razao_social="Beta", porte="01")                                                     # 6
    _empresa(db, m, "00000003", razao_social="Alfa", porte="01")                                                     # 6
    _empresa(db, m, "00000004", razao_social="Gama", porte="05", situacao="04", capital_social=5e6, data_inicio=date(2000, 1, 1))  # 43 // 2 = 21
    db.commit()
    _, linhas = descobrir(db, m.id, situacao="todas", hoje=HOJE)
    assert [(e.razao_social, int(s)) for e, s in linhas] == [("Zeta", 43), ("Gama", 21), ("Alfa", 6), ("Beta", 6)]


def test_descobrir_situacao_padrao_ativas_e_filtros(db):
    m = _municipio(db)
    _empresa(db, m, "11111111", razao_social="Padaria Pão", nome_fantasia="Pão Quente", porte="01", cnae_fiscal="4721102")
    _empresa(db, m, "12345678", razao_social="Metal Forte", porte="05", cnae_fiscal="2511000")
    _empresa(db, m, "22222222", razao_social="Baixada SA", porte="05", situacao="08", cnae_fiscal="2511000")
    db.commit()
    nomes = lambda **kw: [e.razao_social for e, _ in descobrir(db, m.id, hoje=HOJE, **kw)[1]]
    assert descobrir(db, m.id, hoje=HOJE)[0] == 2                     # "02" por padrão
    assert descobrir(db, m.id, situacao="todas", hoje=HOJE)[0] == 3
    assert nomes(situacao="08") == ["Baixada SA"]
    assert nomes(porte="05") == ["Metal Forte"]
    assert nomes(divisao="47") == ["Padaria Pão"]
    assert nomes(q="quente") == ["Padaria Pão"]                        # nome fantasia, sem distinguir caixa
    assert nomes(q="1234") == ["Metal Forte"]                          # 3+ dígitos: prefixo da raiz
    assert descobrir(db, m.id, q="p", hoje=HOJE)[0] == 2               # < 2 caracteres: filtro ignorado


def test_descobrir_rejeita_codigos_invalidos(db):
    m = _municipio(db)
    with pytest.raises(ValueError):
        descobrir(db, m.id, situacao="99", hoje=HOJE)
    with pytest.raises(ValueError):
        descobrir(db, m.id, porte="09", hoje=HOJE)


def test_descobrir_pagina_com_total_estavel_e_sem_repetir(db):
    m = _municipio(db)
    for i in range(7):
        _empresa(db, m, f"{i:08d}", razao_social=f"E{i}")
    db.commit()
    total, p1 = descobrir(db, m.id, limit=3, offset=0, hoje=HOJE)
    _, p2 = descobrir(db, m.id, limit=3, offset=3, hoje=HOJE)
    _, p3 = descobrir(db, m.id, limit=3, offset=6, hoje=HOJE)
    assert (total, len(p1), len(p2), len(p3)) == (7, 3, 3, 1)
    assert len({e.cnpj_basico for e, _ in p1 + p2 + p3}) == 7


def test_divisoes_disponiveis_so_ativas_nao_acompanhadas_com_cnae(db):
    m = _municipio(db)
    _empresa(db, m, "00000001", cnae_fiscal="4721102")
    _empresa(db, m, "00000002", cnae_fiscal="4711302")
    _empresa(db, m, "00000003", cnae_fiscal="2511000", situacao="08")   # baixada: fora
    _empresa(db, m, "00000004", cnae_fiscal=None)                       # sem CNAE: fora
    _empresa(db, m, "00000005", cnae_fiscal="8599604")
    _acompanhar(db, m, "00000005")                                      # acompanhada: fora
    db.commit()
    assert sorted(divisoes_disponiveis(db, m.id)) == [("47", 2)]
