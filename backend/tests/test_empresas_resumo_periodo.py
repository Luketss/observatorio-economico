"""Resumo de empresas com período de abertura — schema e branch sem-módulo do
router (padrão do repo: sem TestClient e sem DB — a função é chamada direto;
o caminho mid=None retorna antes de tocar a Session)."""
from datetime import date

from app.api.v1.routers.empresas import resumo_empresas
from app.schemas.empresa import EmpresaResumo


def test_schema_sem_abertas_periodo_retrocompativel():
    r = EmpresaResumo(total_empresas=1, total_ativas=1, total_mei=0, total_simples=0)
    assert r.abertas_periodo is None


def test_schema_com_abertas_periodo():
    r = EmpresaResumo(
        total_empresas=5, total_ativas=3, total_mei=1, total_simples=2,
        abertas_periodo=4,
    )
    assert r.abertas_periodo == 4


def test_router_sem_modulo_devolve_zeros_com_abertas_periodo():
    r = resumo_empresas(abertas_de=None, abertas_ate=None, mid=None, db=None)
    assert r.total_empresas == 0
    assert r.abertas_periodo == 0


def test_router_sem_modulo_com_datas_tambem_zera():
    r = resumo_empresas(
        abertas_de=date(2025, 9, 1), abertas_ate=date(2026, 8, 31),
        mid=None, db=None,
    )
    assert r.abertas_periodo == 0
