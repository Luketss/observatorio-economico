"""Agenda do gestor (serviço puro sobre fixture SQLite, `hoje` fixo):
vencidas e sem contato vêm dos sinais; próximas, sem data, demandas e
contatos recentes são calculados aqui."""
from datetime import date, datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.db.base import Base
from app.models.desenvolvimento_economico import (
    ContatoEmpresa, DemandaEmpresa, DemandaStatusHistorico, EmpresaRetencao, VisitaRetencao,
)
from app.models.empresa import Empresa
from app.models.municipio import Municipio
from app.services.gestao_empresarial import JANELAS_AGENDA, agenda, agenda_vazia

HOJE = date(2026, 9, 3)
ANTIGO = datetime(2025, 1, 1, 12, tzinfo=timezone.utc)      # cadastro velho: sem contato dispara
RECENTE = datetime(2026, 8, 25, 12, tzinfo=timezone.utc)    # cadastro novo: sem contato não dispara


@pytest.fixture()
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine, tables=[
        Municipio.__table__, Empresa.__table__, EmpresaRetencao.__table__, ContatoEmpresa.__table__,
        VisitaRetencao.__table__, DemandaEmpresa.__table__, DemandaStatusHistorico.__table__,
    ])
    sessao = sessionmaker(bind=engine)()
    m = Municipio(nome="Alfa", estado="MG")
    sessao.add(m)
    sessao.flush()
    sessao.info["mid"] = m.id
    yield sessao
    sessao.close()


def _emp(db, nome, criado_em=RECENTE, **kw):
    e = EmpresaRetencao(municipio_id=db.info["mid"], nome=nome, criado_em=criado_em, **kw)
    db.add(e)
    db.flush()
    return e


def _todas(db):
    return db.query(EmpresaRetencao).all()


def test_vencidas_vem_do_sinal_com_dias_de_atraso_e_ordem(db):
    _emp(db, "A", proxima_acao="Ligar", proxima_acao_data=HOJE - timedelta(days=4), responsavel="Ana")
    _emp(db, "B", proxima_acao="Visitar", proxima_acao_data=HOJE - timedelta(days=10))
    _emp(db, "C", proxima_acao="Hoje", proxima_acao_data=HOJE)               # não é vencida: é próxima com dias 0
    _emp(db, "D", proxima_acao=None, proxima_acao_data=HOJE - timedelta(days=3))  # sem texto: não é ação
    db.commit()
    ag = agenda(db, _todas(db), hoje=HOJE, dias=7)
    assert [(i.empresa_nome, i.dias, i.responsavel) for i in ag.vencidas] == [("B", 10, None), ("A", 4, "Ana")]
    assert [(i.empresa_nome, i.dias) for i in ag.proximas] == [("C", 0)]
    assert ag.kpis.vencidas == 2 and ag.kpis.proximas == 1


def test_proximas_respeita_a_janela_nas_fronteiras(db):
    _emp(db, "Dentro7", proxima_acao="x", proxima_acao_data=HOJE + timedelta(days=7))
    _emp(db, "Fora7", proxima_acao="x", proxima_acao_data=HOJE + timedelta(days=8))
    _emp(db, "Dentro14", proxima_acao="x", proxima_acao_data=HOJE + timedelta(days=14))
    db.commit()
    assert [i.empresa_nome for i in agenda(db, _todas(db), hoje=HOJE, dias=7).proximas] == ["Dentro7"]
    assert [i.empresa_nome for i in agenda(db, _todas(db), hoje=HOJE, dias=14).proximas] == ["Dentro7", "Fora7", "Dentro14"]
    assert agenda(db, _todas(db), hoje=HOJE, dias=30).kpis.proximas == 3


def test_sem_data_e_ordem_por_nome(db):
    _emp(db, "Zeta", proxima_acao="Enviar proposta")
    _emp(db, "Alfa", proxima_acao="Cobrar retorno")
    _emp(db, "Sem", proxima_acao=None)
    db.commit()
    ag = agenda(db, _todas(db), hoje=HOJE)
    assert [(i.empresa_nome, i.proxima_acao, i.proxima_acao_data, i.dias) for i in ag.sem_data] == \
        [("Alfa", "Cobrar retorno", None, None), ("Zeta", "Enviar proposta", None, None)]
    assert ag.kpis.sem_data == 2


def test_demandas_abertas_com_dias_status_desde_e_sinal_30d(db):
    e = _emp(db, "ACME")
    d45 = DemandaEmpresa(empresa_id=e.id, municipio_id=e.municipio_id, descricao="Via", status="em_andamento",
                         data_registro=HOJE - timedelta(days=45), responsavel="Obras")
    d29 = DemandaEmpresa(empresa_id=e.id, municipio_id=e.municipio_id, descricao="Placa", data_registro=HOJE - timedelta(days=29))
    d30 = DemandaEmpresa(empresa_id=e.id, municipio_id=e.municipio_id, descricao="Poda", data_registro=HOJE - timedelta(days=30))
    res = DemandaEmpresa(empresa_id=e.id, municipio_id=e.municipio_id, descricao="Feita", status="resolvida",
                         data_registro=HOJE - timedelta(days=60))
    db.add_all([d45, d29, d30, res])
    db.flush()
    db.add_all([
        DemandaStatusHistorico(demanda_id=d45.id, municipio_id=e.municipio_id, de=None, para="aberta",
                               alterado_em=datetime(2026, 7, 20, 12, tzinfo=timezone.utc)),
        DemandaStatusHistorico(demanda_id=d45.id, municipio_id=e.municipio_id, de="aberta", para="em_andamento",
                               alterado_em=datetime(2026, 8, 10, 15, tzinfo=timezone.utc)),
    ])
    db.commit()
    ag = agenda(db, _todas(db), hoje=HOJE)
    itens = {i.descricao: i for i in ag.demandas}
    assert [i.descricao for i in ag.demandas] == ["Via", "Poda", "Placa"]          # dias em aberto desc
    assert (itens["Via"].dias_em_aberto, itens["Via"].status_desde, itens["Via"].sinal_30d, itens["Via"].responsavel) == \
        (45, date(2026, 8, 10), True, "Obras")
    assert (itens["Poda"].status_desde, itens["Poda"].sinal_30d) == (HOJE - timedelta(days=30), True)   # sem histórico → data_registro
    assert itens["Placa"].sinal_30d is False
    assert ag.kpis.demandas_abertas == 3
    assert itens["Via"].empresa_nome == "ACME" and itens["Via"].demanda_id == d45.id


def test_demandas_de_empresa_fora_dos_cadastros_nao_entram(db):
    dentro = _emp(db, "Dentro")
    fora = _emp(db, "Fora")
    db.add(DemandaEmpresa(empresa_id=fora.id, municipio_id=fora.municipio_id, descricao="X", data_registro=HOJE))
    db.commit()
    ag = agenda(db, [dentro], hoje=HOJE)
    assert ag.demandas == () and ag.kpis.demandas_abertas == 0


def test_sem_contato_vem_do_sinal(db):
    velha = _emp(db, "Velha", criado_em=ANTIGO)                     # nunca teve contato, cadastro antigo → entra
    _emp(db, "Nova", criado_em=RECENTE)                              # cadastro recente → não entra
    com = _emp(db, "Contatada", criado_em=ANTIGO)
    db.add(ContatoEmpresa(empresa_id=com.id, municipio_id=com.municipio_id, data=HOJE - timedelta(days=100), tipo="ligacao"))
    ok = _emp(db, "EmDia", criado_em=ANTIGO)
    db.add(VisitaRetencao(empresa_id=ok.id, municipio_id=ok.municipio_id, data_visita=HOJE - timedelta(days=5)))
    db.commit()
    ag = agenda(db, _todas(db), hoje=HOJE)
    assert [(i.empresa_nome, i.desde, i.dias) for i in ag.sem_contato] == [
        ("Velha", date(2025, 1, 1), (HOJE - date(2025, 1, 1)).days),
        ("Contatada", HOJE - timedelta(days=100), 100),
    ]
    assert ag.kpis.sem_contato == 2
    assert velha.id in {i.empresa_id for i in ag.sem_contato}


def test_contatos_recentes_mescla_ordena_e_corta_em_30_dias(db):
    e = _emp(db, "ACME")
    db.add_all([
        ContatoEmpresa(empresa_id=e.id, municipio_id=e.municipio_id, data=HOJE - timedelta(days=1), tipo="ligacao",
                       responsavel="Ana", observacoes="Retorno"),
        VisitaRetencao(empresa_id=e.id, municipio_id=e.municipio_id, data_visita=HOJE - timedelta(days=3), responsavel="Bia"),
        ContatoEmpresa(empresa_id=e.id, municipio_id=e.municipio_id, data=HOJE - timedelta(days=30), tipo="email"),   # no limite: entra
        ContatoEmpresa(empresa_id=e.id, municipio_id=e.municipio_id, data=HOJE - timedelta(days=31), tipo="outro"),   # fora
    ])
    db.commit()
    ag = agenda(db, _todas(db), hoje=HOJE)
    assert [(i.tipo, i.subtipo, i.data, i.responsavel, i.observacoes) for i in ag.contatos_recentes] == [
        ("contato", "ligacao", HOJE - timedelta(days=1), "Ana", "Retorno"),
        ("visita", None, HOJE - timedelta(days=3), "Bia", None),
        ("contato", "email", HOJE - timedelta(days=30), None, None),
    ]
    assert ag.contatos_recentes[0].empresa_nome == "ACME"


def test_contatos_recentes_limite_50(db):
    e = _emp(db, "ACME")
    db.add_all([ContatoEmpresa(empresa_id=e.id, municipio_id=e.municipio_id, data=HOJE - timedelta(days=i % 20), tipo="outro")
                for i in range(60)])
    db.commit()
    assert len(agenda(db, _todas(db), hoje=HOJE).contatos_recentes) == 50


def test_janela_invalida_e_lista_vazia(db):
    with pytest.raises(ValueError):
        agenda(db, [], hoje=HOJE, dias=10)
    assert JANELAS_AGENDA == (7, 14, 30)
    mock = MagicMock()
    ag = agenda(mock, [], hoje=HOJE, dias=14)
    assert ag == agenda_vazia(HOJE, 14)
    assert ag.kpis.vencidas == 0 and ag.contatos_recentes == () and ag.dias == 14 and ag.hoje == HOJE
    mock.query.assert_not_called()
