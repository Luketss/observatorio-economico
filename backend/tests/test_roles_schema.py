"""Validação pura dos schemas de Role (pydantic, sem DB)."""
import pytest
from app.schemas.role import RoleCreate, RoleUpdate


def test_create_valido():
    r = RoleCreate(nome="Assessor", permissoes={"captacao": ["criar", "editar"]})
    assert r.municipio_id is None
    assert r.permissoes == {"captacao": ["criar", "editar"]}


def test_create_area_invalida():
    with pytest.raises(ValueError):
        RoleCreate(nome="X", permissoes={"narnia": ["criar"]})


def test_create_verbo_invalido():
    with pytest.raises(ValueError):
        RoleCreate(nome="X", permissoes={"projetos": ["voar"]})


def test_create_nome_vazio():
    with pytest.raises(ValueError):
        RoleCreate(nome="  ", permissoes={})


def test_update_parcial_sem_permissoes():
    r = RoleUpdate(descricao="nova")
    assert r.model_dump(exclude_unset=True) == {"descricao": "nova"}


def test_update_permissoes_validadas():
    with pytest.raises(ValueError):
        RoleUpdate(permissoes={"projetos": ["voar"]})
