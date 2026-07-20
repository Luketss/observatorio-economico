"""Execução 'todas as fontes' (meta-job) — lógica pura, sem DB/rede."""
from app.services.ingestao_automatica import FONTES_AUTOMATICAS  # noqa: F401 — importa o pacote e registra as fontes
from app.services.ingestao_automatica.base import DATASET_TODAS, ORDEM_EXECUCAO_TODAS


def test_ordem_comeca_por_populacao():
    # coeficiente estimado do FPM depende de população já carregada
    assert ORDEM_EXECUCAO_TODAS[0] == "populacao"


def test_ordem_cobre_o_registry_sem_sobras_nem_faltas():
    # quebra se alguém registrar fonte nova e esquecer de incluí-la na ordem
    assert set(ORDEM_EXECUCAO_TODAS) == set(FONTES_AUTOMATICAS)
    assert len(ORDEM_EXECUCAO_TODAS) == len(set(ORDEM_EXECUCAO_TODAS))


def test_captacao_e_emendas_por_ultimo():
    # as duas mais lentas fecham a fila — o grosso dos dados aparece cedo
    assert ORDEM_EXECUCAO_TODAS[-2:] == ["captacao_federal", "emendas"]


def test_key_todas_e_reservada():
    assert DATASET_TODAS == "todas"
    assert DATASET_TODAS not in FONTES_AUTOMATICAS
