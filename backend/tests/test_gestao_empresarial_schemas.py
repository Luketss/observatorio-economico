"""Helper de CNPJ e validação dos schemas novos da Gestão Empresarial."""
from datetime import date

import pytest
from pydantic import ValidationError

from app.core.cnpj import cnpj_para_basico
from app.schemas.desenvolvimento_economico import (
    ContatoEmpresaCreate,
    DemandaEmpresaCreate,
    DemandaEmpresaUpdate,
    EmpresaRetencaoCreate,
    EmpresaRetencaoOut,
)


def test_cnpj_para_basico():
    assert cnpj_para_basico("12.345.678/0001-90") == "12345678"
    assert cnpj_para_basico("12345678000190") == "12345678"
    assert cnpj_para_basico("12345678") == "12345678"
    assert cnpj_para_basico("1234567") is None
    assert cnpj_para_basico("") is None
    assert cnpj_para_basico(None) is None


def test_contato_tipo_valido_e_default():
    c = ContatoEmpresaCreate(data=date(2026, 8, 1))
    assert c.tipo == "reuniao"
    c2 = ContatoEmpresaCreate(data=date(2026, 8, 1), tipo="visita_tecnica")
    assert c2.tipo == "visita_tecnica"


def test_contato_tipo_invalido_rejeitado():
    with pytest.raises(ValidationError):
        ContatoEmpresaCreate(data=date(2026, 8, 1), tipo="almoco")


def test_demanda_status_default_e_invalido():
    d = DemandaEmpresaCreate(descricao="X", data_registro=date(2026, 8, 1))
    assert d.status == "aberta"
    with pytest.raises(ValidationError):
        DemandaEmpresaUpdate(status="cancelada")


def test_empresa_create_com_campos_novos():
    e = EmpresaRetencaoCreate(nome="ACME", cnpj_basico="12345678",
                              proxima_acao="Ligar", proxima_acao_data=date(2026, 9, 1))
    assert e.cnpj_basico == "12345678"


def test_empresa_out_tem_novos_campos_opcionais():
    campos = EmpresaRetencaoOut.model_fields
    for f in ("cnpj_basico", "proxima_acao", "proxima_acao_data",
              "contatos", "demandas", "perfil_rfb"):
        assert f in campos
