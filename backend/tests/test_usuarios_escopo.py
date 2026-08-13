"""Escopo fail-closed da listagem de usuários (segurança).

Bug corrigido: GET /usuarios aceitava qualquer autenticado e, para usuário
não-global com municipio_id NULL, o filtro virava None — que o repository
trata como "sem filtro" — vazando TODOS os usuários da plataforma.
"""
from types import SimpleNamespace

import pytest

from app.core.exceptions import ForbiddenException
from app.core.permissions import escopo_listagem_usuarios, pode_gerenciar_usuario


def _role(nome, permissoes=None):
    return SimpleNamespace(nome=nome, permissoes=permissoes or {})


DELEGADO = _role("ADMIN_MUNICIPIO", {"usuarios": ["criar", "editar", "excluir"]})
VISUALIZADOR = _role("VISUALIZADOR", {})
ANALISTA = _role("ANALISTA", {"projetos": ["editar"]})


# ── escopo_listagem_usuarios ────────────────────────────────────────────────

def test_admin_global_lista_sem_filtro():
    assert escopo_listagem_usuarios(_role("ADMIN_GLOBAL"), None) is None


def test_delegado_com_municipio_filtra_pelo_proprio_municipio():
    assert escopo_listagem_usuarios(DELEGADO, 42) == 42


def test_delegado_SEM_municipio_e_negado_nunca_lista_tudo():
    # O caso do vazamento: municipio_id NULL não pode virar "sem filtro".
    with pytest.raises(ForbiddenException):
        escopo_listagem_usuarios(DELEGADO, None)


def test_role_sem_verbos_de_usuarios_e_negada():
    for role in (VISUALIZADOR, ANALISTA):
        with pytest.raises(ForbiddenException):
            escopo_listagem_usuarios(role, 42)


def test_qualquer_verbo_da_area_usuarios_basta_para_listar():
    so_editar = _role("GESTOR_LOCAL", {"usuarios": ["editar"]})
    assert escopo_listagem_usuarios(so_editar, 7) == 7


def test_role_none_e_negada():
    with pytest.raises(ForbiddenException):
        escopo_listagem_usuarios(None, 42)


# ── pode_gerenciar_usuario: fail-closed p/ ator sem município ───────────────

def test_delegado_sem_municipio_nao_gerencia_ninguem():
    # NULL == NULL não pode autorizar gerência entre usuários sem município.
    assert pode_gerenciar_usuario("ADMIN_MUNICIPIO", None, "VISUALIZADOR", None) is False
    assert pode_gerenciar_usuario("ADMIN_MUNICIPIO", None, "VISUALIZADOR", 7) is False


def test_gerencia_normal_continua_valendo():
    assert pode_gerenciar_usuario("ADMIN_GLOBAL", None, "VISUALIZADOR", 7) is True
    assert pode_gerenciar_usuario("ADMIN_MUNICIPIO", 7, "VISUALIZADOR", 7) is True
    assert pode_gerenciar_usuario("ADMIN_MUNICIPIO", 7, "VISUALIZADOR", 8) is False
    assert pode_gerenciar_usuario("ADMIN_MUNICIPIO", 7, "ADMIN_GLOBAL", 7) is False
