"""Validação pura dos schemas de tarefa de projeto (pydantic, sem DB)."""
from datetime import date

import pytest
from app.schemas.projeto import TarefaCreate, TarefaOut, TarefaUpdate


def test_create_valido():
    t = TarefaCreate(titulo="Licitação concluída", prazo="2026-08-01")
    assert t.prazo == date(2026, 8, 1)


def test_create_sem_prazo():
    t = TarefaCreate(titulo="Vistoria final")
    assert t.prazo is None


def test_create_titulo_obrigatorio():
    with pytest.raises(ValueError):
        TarefaCreate(prazo="2026-08-01")


def test_create_titulo_vazio():
    with pytest.raises(ValueError):
        TarefaCreate(titulo="   ")


def test_create_data_invalida():
    with pytest.raises(ValueError):
        TarefaCreate(titulo="X", prazo="31/08/2026")


def test_update_parcial_so_concluida():
    u = TarefaUpdate(concluida=True)
    assert u.model_dump(exclude_unset=True) == {"concluida": True}


def test_update_limpa_prazo_explicitamente():
    u = TarefaUpdate(prazo=None)
    assert u.model_dump(exclude_unset=True) == {"prazo": None}


def test_out_from_attributes():
    class Fake:
        id = 1
        titulo = "Obra iniciada"
        prazo = date(2026, 6, 1)
        concluida = False

    out = TarefaOut.model_validate(Fake())
    assert out.concluida is False


def test_update_null_explicito_rejeitado():
    with pytest.raises(ValueError):
        TarefaUpdate(titulo=None)
    with pytest.raises(ValueError):
        TarefaUpdate(concluida=None)


def test_update_prazo_null_continua_ok():
    u = TarefaUpdate(prazo=None)
    assert u.model_dump(exclude_unset=True) == {"prazo": None}


def test_titulo_max_length():
    with pytest.raises(ValueError):
        TarefaCreate(titulo="x" * 256)
    with pytest.raises(ValueError):
        TarefaUpdate(titulo="x" * 256)
