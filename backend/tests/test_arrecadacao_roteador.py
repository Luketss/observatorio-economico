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
