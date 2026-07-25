"""Testes puros do núcleo de permissões (sem DB — usa stubs de Role)."""
from types import SimpleNamespace

from app.core.permissions import (
    AREA_LABELS,
    AREAS,
    PERMISSOES_TODAS,
    VERBOS,
    erros_permissoes,
    pode_gerenciar_usuario,
    permissoes_efetivas,
    tem_permissao,
    valida_atribuicao,
)


def role(nome="CUSTOM", permissoes=None):
    return SimpleNamespace(nome=nome, permissoes=permissoes or {})


# ── tem_permissao ────────────────────────────────────────────────────────

def test_admin_global_sempre_pode():
    assert tem_permissao(role("ADMIN_GLOBAL"), "projetos", "excluir") is True


def test_role_none_nunca_pode():
    assert tem_permissao(None, "projetos", "criar") is False


def test_verbo_presente_na_area():
    r = role(permissoes={"captacao": ["criar", "editar"]})
    assert tem_permissao(r, "captacao", "criar") is True
    assert tem_permissao(r, "captacao", "excluir") is False


def test_area_ausente():
    r = role(permissoes={"captacao": ["criar"]})
    assert tem_permissao(r, "projetos", "criar") is False


def test_permissoes_none_no_banco():
    r = SimpleNamespace(nome="CUSTOM", permissoes=None)
    assert tem_permissao(r, "projetos", "criar") is False


# ── permissoes_efetivas ──────────────────────────────────────────────────

def test_efetivas_admin_global_tudo():
    assert permissoes_efetivas(role("ADMIN_GLOBAL")) == PERMISSOES_TODAS


def test_efetivas_filtra_lixo():
    r = role(permissoes={"captacao": ["criar", "voar"], "narnia": ["editar"]})
    assert permissoes_efetivas(r) == {"captacao": ["criar"]}


def test_efetivas_role_none():
    assert permissoes_efetivas(None) == {}


# ── valida_atribuicao ────────────────────────────────────────────────────

def test_role_global_serve_para_todos():
    assert valida_atribuicao(None, 42) is True
    assert valida_atribuicao(None, None) is True


def test_role_municipal_exige_mesmo_municipio():
    assert valida_atribuicao(7, 7) is True
    assert valida_atribuicao(7, 8) is False
    assert valida_atribuicao(7, None) is False


# ── pode_gerenciar_usuario ───────────────────────────────────────────────

def test_global_gerencia_qualquer_um():
    assert pode_gerenciar_usuario("ADMIN_GLOBAL", None, "VISUALIZADOR", 9) is True


def test_delegado_nao_toca_admin_global():
    assert pode_gerenciar_usuario("CUSTOM", 7, "ADMIN_GLOBAL", None) is False


def test_delegado_nao_cruza_municipio():
    assert pode_gerenciar_usuario("CUSTOM", 7, "VISUALIZADOR", 8) is False


def test_delegado_gerencia_proprio_municipio():
    assert pode_gerenciar_usuario("CUSTOM", 7, "VISUALIZADOR", 7) is True


# ── erros_permissoes ─────────────────────────────────────────────────────

def test_payload_valido_sem_erros():
    assert erros_permissoes({"projetos": ["criar"], "mandato": []}) == []


def test_payload_nao_dict():
    assert erros_permissoes(["projetos"]) != []


def test_area_invalida():
    erros = erros_permissoes({"narnia": ["criar"]})
    assert any("narnia" in e for e in erros)


def test_verbo_invalido():
    erros = erros_permissoes({"projetos": ["voar"]})
    assert any("voar" in e for e in erros)


def test_verbos_nao_lista():
    assert erros_permissoes({"projetos": "criar"}) != []


# ── paridade de constantes ───────────────────────────────────────────────

def test_area_labels_cobre_todas_as_areas():
    assert set(AREA_LABELS) == set(AREAS)


def test_permissoes_todas_cobre_tudo():
    assert set(PERMISSOES_TODAS) == set(AREAS)
    for verbos in PERMISSOES_TODAS.values():
        assert list(verbos) == list(VERBOS)


# ── área prioridades (10ª área, verbo consultado: editar) ────────────────

def test_prioridades_na_lista_de_areas():
    assert "prioridades" in AREAS
    assert AREA_LABELS["prioridades"] == "Prioridades do Mês"


def test_prioridades_editar_concedido():
    r = role(permissoes={"prioridades": ["editar"]})
    assert tem_permissao(r, "prioridades", "editar") is True


def test_prioridades_negado_sem_area():
    r = role(permissoes={"captacao": ["criar", "editar", "excluir"]})
    assert tem_permissao(r, "prioridades", "editar") is False


def test_prioridades_efetivas_aparece():
    r = role(permissoes={"prioridades": ["editar"]})
    assert permissoes_efetivas(r) == {"prioridades": ["editar"]}
