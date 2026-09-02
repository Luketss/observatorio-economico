"""Relevância e risco calculados — funções puras, sem DB.
Cada faixa de cada fator com as fronteiras da spec; sinais um a um com as
fronteiras de 90 e 30 dias; nível por contagem e por rfb_baixada."""
from datetime import date, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.services.gestao_empresarial import (
    DIAS_DEMANDA_ABERTA,
    DIAS_SEM_CONTATO,
    Enriquecimento,
    calcular_relevancia,
    calcular_risco,
    enriquecer,
    faixa_de,
    ordenar_por_relevancia,
)

HOJE = date(2026, 9, 2)
RECENTE = datetime(2026, 8, 20, 12, 0)  # cadastro com < 90 dias: não dispara "sem contato"


def cadastro(**kw):
    base = dict(id=1, nome="ACME", municipio_id=1, cnpj_basico=None, num_empregos=None,
                potencial_expansao="baixo", proxima_acao=None, proxima_acao_data=None,
                criado_em=RECENTE)
    base.update(kw)
    return SimpleNamespace(**base)


def perfil(**kw):
    base = dict(situacao="02", porte=None, data_inicio=None, capital_social=None)
    base.update(kw)
    return SimpleNamespace(**base)


def pontos(rel, chave):
    return next(f.pontos for f in rel.fatores if f.chave == chave)


def _anos_atras(anos, dias=0):
    return date(HOJE.year - anos, HOJE.month, HOJE.day) + timedelta(days=dias)


# ── relevância: fatores ──────────────────────────────────────────────────────

@pytest.mark.parametrize("n,esperado", [
    (None, 0), (0, 0), (1, 10), (9, 10), (10, 20), (49, 20), (50, 30), (99, 30),
    (100, 36), (499, 36), (500, 40), (5000, 40),
])
def test_fator_empregos(n, esperado):
    assert pontos(calcular_relevancia(cadastro(num_empregos=n), None, HOJE), "empregos") == esperado


def test_fator_empregos_ausente_tem_rotulo_nao_informado():
    rel = calcular_relevancia(cadastro(num_empregos=None), None, HOJE)
    f = next(f for f in rel.fatores if f.chave == "empregos")
    assert (f.rotulo, f.maximo, f.origem) == ("Empregos: não informado", 40, "cadastro")
    rel42 = calcular_relevancia(cadastro(num_empregos=42), None, HOJE)
    assert next(f for f in rel42.fatores if f.chave == "empregos").rotulo == "Empregos informados: 42"


@pytest.mark.parametrize("porte,esperado", [(None, 0), ("", 0), ("00", 0), ("01", 6), ("03", 12), ("05", 20)])
def test_fator_porte(porte, esperado):
    assert pontos(calcular_relevancia(cadastro(), perfil(porte=porte), HOJE), "porte") == esperado


@pytest.mark.parametrize("inicio,esperado", [
    (None, 0), (HOJE, 3), (_anos_atras(2, +1), 3), (_anos_atras(2), 7), (_anos_atras(5, +1), 7),
    (_anos_atras(5), 11), (_anos_atras(10, +1), 11), (_anos_atras(10), 15), (date(1990, 1, 1), 15),
])
def test_fator_tempo(inicio, esperado):
    assert pontos(calcular_relevancia(cadastro(), perfil(data_inicio=inicio), HOJE), "tempo") == esperado


@pytest.mark.parametrize("capital,esperado", [
    (None, 0), (0, 0), (10_000, 0), (10_000.01, 3), (100_000, 3), (100_000.01, 6),
    (1_000_000, 6), (1_000_000.01, 8), (10_000_000, 8), (10_000_000.01, 10), (120e9, 10),
])
def test_fator_capital(capital, esperado):
    assert pontos(calcular_relevancia(cadastro(), perfil(capital_social=capital), HOJE), "capital") == esperado


@pytest.mark.parametrize("exp,esperado", [("baixo", 0), ("medio", 8), ("alto", 15), ("xyz", 0)])
def test_fator_expansao(exp, esperado):
    assert pontos(calcular_relevancia(cadastro(potencial_expansao=exp), None, HOJE), "expansao") == esperado


def test_score_maximo_100_ordem_dos_fatores_e_faixa_alta():
    rel = calcular_relevancia(
        cadastro(num_empregos=500, potencial_expansao="alto"),
        perfil(porte="05", data_inicio=date(2000, 1, 1), capital_social=50e6), HOJE,
    )
    assert (rel.score, rel.faixa, rel.parcial) == (100, "alta", False)
    assert [f.chave for f in rel.fatores] == ["empregos", "porte", "tempo", "capital", "expansao"]
    assert sum(f.maximo for f in rel.fatores) == 100


# ── relevância: modificador de situação ──────────────────────────────────────

def test_situacao_inapta_divide_por_2_com_fator_explicativo():
    rel = calcular_relevancia(cadastro(num_empregos=1), perfil(situacao="04", porte="01"), HOJE)  # 16 → 8
    assert rel.score == 8
    sit = rel.fatores[-1]
    assert (sit.chave, sit.pontos, sit.maximo, sit.origem) == ("situacao", -8, 0, "rfb")
    assert sit.rotulo == "inapta na RFB: score reduzido pela metade"


def test_situacao_suspensa_arredonda_para_baixo():
    rel = calcular_relevancia(cadastro(num_empregos=1),
                              perfil(situacao="03", porte="01", capital_social=50_000), HOJE)  # 19 → 9
    assert rel.score == 9 and rel.fatores[-1].pontos == -10
    assert rel.fatores[-1].rotulo == "suspensa na RFB: score reduzido pela metade"


def test_situacao_baixada_zera():
    rel = calcular_relevancia(cadastro(num_empregos=500, potencial_expansao="alto"),
                              perfil(situacao="08", porte="05"), HOJE)  # 75 → 0
    assert (rel.score, rel.faixa) == (0, "baixa")
    assert (rel.fatores[-1].rotulo, rel.fatores[-1].pontos) == ("baixada na RFB: score zerado", -75)


def test_situacao_nula_zera():
    rel = calcular_relevancia(cadastro(num_empregos=1), perfil(situacao="01"), HOJE)
    assert rel.score == 0 and rel.fatores[-1].rotulo == "nula na RFB: score zerado"


@pytest.mark.parametrize("sit", ["02", "", None, "99"])
def test_situacao_ativa_ou_desconhecida_nao_modifica(sit):
    rel = calcular_relevancia(cadastro(num_empregos=1), perfil(situacao=sit, porte="01"), HOJE)
    assert rel.score == 16 and all(f.chave != "situacao" for f in rel.fatores)


# ── relevância: sem vínculo e faixas ─────────────────────────────────────────

def test_sem_vinculo_rfb_parcial_maximo_55():
    rel = calcular_relevancia(cadastro(num_empregos=500, potencial_expansao="alto"), None, HOJE)
    assert (rel.score, rel.parcial) == (55, True)
    rfb = [f for f in rel.fatores if f.origem == "rfb"]
    assert [f.chave for f in rfb] == ["porte", "tempo", "capital"]
    assert [f.pontos for f in rfb] == [0, 0, 0]
    assert all(f.rotulo.endswith("sem vínculo RFB") for f in rfb)


@pytest.mark.parametrize("score,faixa", [
    (0, "baixa"), (29, "baixa"), (30, "media"), (59, "media"), (60, "alta"), (100, "alta"),
])
def test_faixas(score, faixa):
    assert faixa_de(score) == faixa


# ── risco: sinais ────────────────────────────────────────────────────────────

def test_sem_sinais_nivel_nenhum():
    r = calcular_risco(cadastro(), None, None, None, HOJE)
    assert (r.nivel, r.sinais) == ("nenhum", ())


def test_proxima_acao_vencida_so_com_texto_e_data_passada():
    ontem = HOJE - timedelta(days=1)
    r = calcular_risco(cadastro(proxima_acao="Ligar", proxima_acao_data=ontem), None, None, None, HOJE)
    assert [(s.chave, s.desde) for s in r.sinais] == [("proxima_acao_vencida", ontem)]
    assert r.nivel == "atencao"
    assert calcular_risco(cadastro(proxima_acao="Ligar", proxima_acao_data=HOJE), None, None, None, HOJE).sinais == ()
    assert calcular_risco(cadastro(proxima_acao=None, proxima_acao_data=ontem), None, None, None, HOJE).sinais == ()


def test_sem_contato_90d_fronteira_com_contato():
    limite = HOJE - timedelta(days=DIAS_SEM_CONTATO)
    assert calcular_risco(cadastro(), None, limite, None, HOJE).sinais == ()  # exatamente 90 dias: não
    r = calcular_risco(cadastro(), None, limite - timedelta(days=1), None, HOJE)
    assert [(s.chave, s.desde) for s in r.sinais] == [("sem_contato_90d", limite - timedelta(days=1))]


def test_sem_contato_nunca_depende_da_data_do_cadastro():
    limite = HOJE - timedelta(days=DIAS_SEM_CONTATO)
    no_limite = cadastro(criado_em=datetime.combine(limite, datetime.min.time()))
    assert calcular_risco(no_limite, None, None, None, HOJE).sinais == ()  # criado há exatamente 90 dias: não
    antigo = cadastro(criado_em=datetime.combine(limite - timedelta(days=1), datetime.min.time()))
    r = calcular_risco(antigo, None, None, None, HOJE)
    assert [(s.chave, s.desde) for s in r.sinais] == [("sem_contato_90d", limite - timedelta(days=1))]


def test_demanda_aberta_30d_fronteira():
    limite = HOJE - timedelta(days=DIAS_DEMANDA_ABERTA)
    assert calcular_risco(cadastro(), None, None, limite + timedelta(days=1), HOJE).sinais == ()
    r = calcular_risco(cadastro(), None, None, limite, HOJE)
    assert [(s.chave, s.desde) for s in r.sinais] == [("demanda_aberta_30d", limite)]


@pytest.mark.parametrize("sit,chave", [
    ("03", "rfb_irregular"), ("04", "rfb_irregular"), ("08", "rfb_baixada"), ("01", "rfb_baixada"),
])
def test_sinais_rfb_mutuamente_exclusivos(sit, chave):
    r = calcular_risco(cadastro(), perfil(situacao=sit), None, None, HOJE)
    assert [(s.chave, s.desde) for s in r.sinais] == [(chave, None)]


def test_rfb_ativa_e_sem_vinculo_nao_geram_sinal_rfb():
    assert calcular_risco(cadastro(), perfil(situacao="02"), None, None, HOJE).sinais == ()
    assert calcular_risco(cadastro(), None, None, None, HOJE).sinais == ()


# ── risco: nível ─────────────────────────────────────────────────────────────

def test_rfb_baixada_sozinha_e_nivel_alto():
    assert calcular_risco(cadastro(), perfil(situacao="08"), None, None, HOJE).nivel == "alto"


def test_dois_sinais_e_nivel_alto():
    ontem = HOJE - timedelta(days=1)
    r = calcular_risco(cadastro(proxima_acao="x", proxima_acao_data=ontem), None, None,
                       HOJE - timedelta(days=40), HOJE)
    assert r.nivel == "alto" and [s.chave for s in r.sinais] == ["proxima_acao_vencida", "demanda_aberta_30d"]


# ── enriquecer / ordenar ─────────────────────────────────────────────────────

def test_enriquecer_lista_vazia_nao_consulta():
    db = MagicMock()
    assert enriquecer(db, [], hoje=HOJE) == {}
    db.query.assert_not_called()


def test_ordenar_por_relevancia_desempata_por_nome_sem_caso():
    a, b, c = cadastro(id=1, nome="beta"), cadastro(id=2, nome="Alfa"), cadastro(id=3, nome="Zeta", num_empregos=500)
    calc = {x.id: Enriquecimento(calcular_relevancia(x, None, HOJE),
                                 calcular_risco(x, None, None, None, HOJE), None) for x in (a, b, c)}
    assert [x.nome for x in ordenar_por_relevancia([a, b, c], calc)] == ["Zeta", "Alfa", "beta"]
