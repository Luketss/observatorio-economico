"""Execução 'todas as fontes' (meta-job) — lógica pura, sem DB/rede."""
from app.services.ingestao_automatica import FONTES_AUTOMATICAS  # noqa: F401 — importa o pacote e registra as fontes
from app.services.ingestao_automatica.base import (
    DATASET_TODAS,
    FONTES_FORA_DO_TODAS,
    ORDEM_EXECUCAO_TODAS,
)


def test_ordem_comeca_por_populacao():
    # coeficiente estimado do FPM depende de população já carregada
    assert ORDEM_EXECUCAO_TODAS[0] == "populacao"


def test_ordem_cobre_o_registry_sem_sobras_nem_faltas():
    # quebra se alguém registrar fonte nova e esquecer de incluí-la na ordem
    # (ou de listá-la em FONTES_FORA_DO_TODAS, se for exceção deliberada).
    assert set(ORDEM_EXECUCAO_TODAS) == set(FONTES_AUTOMATICAS) - FONTES_FORA_DO_TODAS
    assert len(ORDEM_EXECUCAO_TODAS) == len(set(ORDEM_EXECUCAO_TODAS))


def test_captacao_e_emendas_por_ultimo():
    # as duas mais lentas fecham a fila — o grosso dos dados aparece cedo
    assert ORDEM_EXECUCAO_TODAS[-2:] == ["captacao_federal", "emendas"]


def test_key_todas_e_reservada():
    assert DATASET_TODAS == "todas"
    assert DATASET_TODAS not in FONTES_AUTOMATICAS


from app.services.ingestao_automatica.base import ResumoIngestao
from app.services.ingestao_automatica.todas import (
    item_resumo_erro,
    item_resumo_ok,
    mensagem_erro_todas,
    precisa_expandir_captacao,
    prefixo_etapa,
    status_final_todas,
)


def _resumo(linhas=10, ok=3, erro=0, erros=None):
    return ResumoIngestao(dataset="pib", municipios_ok=ok, municipios_erro=erro,
                          linhas=linhas, erros=erros or [])


# --- precisa_expandir_captacao -------------------------------------------

def test_captacao_com_municipios_avulsos_expande():
    assert precisa_expandir_captacao("captacao_federal", {"municipio_ids": [1, 2]}) is True


def test_captacao_por_uf_ou_brasil_nao_expande():
    assert precisa_expandir_captacao("captacao_federal", {"estado": "MG"}) is False
    assert precisa_expandir_captacao("captacao_federal", {}) is False
    assert precisa_expandir_captacao("captacao_federal", None) is False


def test_outras_fontes_nunca_expandem():
    assert precisa_expandir_captacao("emendas", {"municipio_ids": [1]}) is False


# --- prefixo_etapa --------------------------------------------------------

def test_prefixo_etapa_com_e_sem_detalhe():
    assert prefixo_etapa(3, 10, "PIB (IBGE)", "baixando ano 2021") == \
        "3/10 · PIB (IBGE) — baixando ano 2021"
    assert prefixo_etapa(3, 10, "PIB (IBGE)", None) == "3/10 · PIB (IBGE)"


# --- itens do resumo agregado --------------------------------------------

def test_item_ok_sem_erros():
    item = item_resumo_ok("pib", _resumo(linhas=42, ok=3))
    assert item == {"key": "pib", "status": "ok", "linhas": 42,
                    "municipios_ok": 3, "municipios_erro": 0, "erros": []}


def test_item_ok_com_erros_parciais_vira_aviso_e_trunca_a_5():
    erros = [f"municipio {i} falhou" for i in range(8)]
    item = item_resumo_ok("fpm", _resumo(erro=8, erros=erros))
    assert item["status"] == "aviso"
    assert item["erros"] == erros[:5]


def test_item_erro_de_excecao():
    item = item_resumo_erro("comex", RuntimeError("x" * 500))
    assert item["status"] == "erro"
    assert item["linhas"] == 0 and item["municipios_ok"] == 0
    assert len(item["erros"]) == 1 and len(item["erros"][0]) == 300


# --- status final e mensagem de erro -------------------------------------

def test_status_final_concluido_se_alguma_fonte_passou():
    itens = [{"status": "erro"}, {"status": "aviso"}, {"status": "erro"}]
    assert status_final_todas(itens) == "concluido"
    assert status_final_todas([{"status": "ok"}]) == "concluido"


def test_status_final_erro_so_se_todas_falharem():
    assert status_final_todas([{"status": "erro"}, {"status": "erro"}]) == "erro"


def test_mensagem_erro_cita_total_e_primeira_falha():
    itens = [
        {"key": "populacao", "status": "erro", "erros": ["IBGE fora do ar"]},
        {"key": "fpm", "status": "erro", "erros": ["timeout"]},
    ]
    msg = mensagem_erro_todas(itens)
    assert "2 fontes" in msg and "IBGE fora do ar" in msg
