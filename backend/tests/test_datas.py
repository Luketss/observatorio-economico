"""hoje_local(): o servidor roda em UTC, o usuário está em Brasília (fuso
fixo -3, sem horário de verão desde 2019). Entre 21h e 0h em Brasília,
date.today() já é amanhã — hoje_local() não."""
from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import app.core.datas as datas


class _RelogioFixo(datetime):
    utc_fixo = datetime(2026, 9, 2, 23, 30, tzinfo=timezone.utc)

    @classmethod
    def now(cls, tz=None):
        return cls.utc_fixo.astimezone(tz) if tz else cls.utc_fixo.replace(tzinfo=None)


def test_hoje_local_as_23h30_utc_ainda_e_o_mesmo_dia_no_brasil(monkeypatch):
    monkeypatch.setattr(datas, "datetime", _RelogioFixo)
    assert datas.hoje_local() == date(2026, 9, 2)


def test_hoje_local_as_02h_utc_e_o_dia_anterior_no_brasil(monkeypatch):
    class Relogio(_RelogioFixo):
        utc_fixo = datetime(2026, 9, 3, 2, 0, tzinfo=timezone.utc)   # 23h de 02/09 em Brasília
    monkeypatch.setattr(datas, "datetime", Relogio)
    assert datas.hoje_local() == date(2026, 9, 2)
    assert date(2026, 9, 3) == Relogio.utc_fixo.date()               # date.today() diria 03/09


def test_enriquecer_sem_hoje_usa_hoje_local(monkeypatch):
    import app.services.gestao_empresarial as ge
    relogio = MagicMock(return_value=date(2026, 9, 2))
    monkeypatch.setattr(ge, "hoje_local", relogio)
    cadastro = SimpleNamespace(id=1, nome="A", municipio_id=1, cnpj_basico=None, num_empregos=None,
                               potencial_expansao="baixo", proxima_acao=None, proxima_acao_data=None,
                               criado_em=datetime(2026, 8, 1))
    db = MagicMock()   # MagicMock é iterável vazio: as agregações não devolvem linhas
    calc = ge.enriquecer(db, [cadastro])
    relogio.assert_called_once()
    assert calc[1].risco.nivel == "nenhum"


def test_cnae_secao_mora_em_app_core_e_o_router_reexporta():
    from app.core.cnae import CNAE_SECAO
    from app.api.v1.routers.empresas import CNAE_SECAO as do_router
    assert CNAE_SECAO["47"] == "Comércio varejista" and CNAE_SECAO["25"] == "Fabricação de produtos de metal"
    assert do_router is CNAE_SECAO
