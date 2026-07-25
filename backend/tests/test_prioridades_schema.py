"""Testes puros dos schemas do PUT /insights/prioridades (sem DB)."""
import pytest
from pydantic import ValidationError

from app.api.v1.routers.insights import PrioridadeEditItem, SalvarPrioridadesRequest


def item(**kw):
    base = {"titulo": "Atenção: ICMS caiu", "observacao": "Queda de 12% no trimestre."}
    base.update(kw)
    return base


def test_item_valido_com_dataset_opcional():
    p = PrioridadeEditItem(**item())
    assert p.dataset_referencia is None
    p2 = PrioridadeEditItem(**item(dataset_referencia="arrecadacao"))
    assert p2.dataset_referencia == "arrecadacao"


def test_titulo_vazio_rejeitado():
    with pytest.raises(ValidationError):
        PrioridadeEditItem(**item(titulo=""))


def test_observacao_vazia_rejeitada():
    with pytest.raises(ValidationError):
        PrioridadeEditItem(**item(observacao=""))


def test_titulo_max_255():
    PrioridadeEditItem(**item(titulo="x" * 255))
    with pytest.raises(ValidationError):
        PrioridadeEditItem(**item(titulo="x" * 256))


def test_observacao_max_1000():
    PrioridadeEditItem(**item(observacao="x" * 1000))
    with pytest.raises(ValidationError):
        PrioridadeEditItem(**item(observacao="x" * 1001))


def test_request_1_a_3_itens():
    SalvarPrioridadesRequest(prioridades=[item()])
    SalvarPrioridadesRequest(prioridades=[item(), item(), item()])
    with pytest.raises(ValidationError):
        SalvarPrioridadesRequest(prioridades=[])
    with pytest.raises(ValidationError):
        SalvarPrioridadesRequest(prioridades=[item(), item(), item(), item()])


def test_request_municipio_id_opcional():
    req = SalvarPrioridadesRequest(prioridades=[item()])
    assert req.municipio_id is None
    req2 = SalvarPrioridadesRequest(municipio_id=7, prioridades=[item()])
    assert req2.municipio_id == 7
