"""Escolha de municípios comparáveis — mesma UF + faixa populacional do FPM.
Núcleo puro: nenhuma query, os candidatos chegam prontos."""
from app.services.pares_service import (
    LIMITE_PADRAO,
    MunicipioRef,
    eh_capital,
    mesma_faixa,
    rotulo_faixa,
    selecionar_pares,
)

# Faixa 3 do FPM (16.981–23.772 hab) — os quatro primeiros caem nela.
FOCO = MunicipioRef(id=1, nome="Foco", estado="MG", populacao=20_000, codigo_ibge="3100000")
PERTO = MunicipioRef(id=2, nome="Perto", estado="MG", populacao=20_500, codigo_ibge="3100001")
LONGE = MunicipioRef(id=3, nome="Longe", estado="MG", populacao=23_000, codigo_ibge="3100002")
OUTRA_UF = MunicipioRef(id=4, nome="OutraUf", estado="SP", populacao=20_100, codigo_ibge="3500001")
# Faixa 4 (23.773–30.564) — adjacente à do foco.
VIZINHA = MunicipioRef(id=5, nome="Vizinha", estado="MG", populacao=25_000, codigo_ibge="3100003")
# Faixa 0 — nem mesma faixa nem adjacente.
DISTANTE = MunicipioRef(id=6, nome="Distante", estado="MG", populacao=5_000, codigo_ibge="3100004")
BH = MunicipioRef(id=7, nome="Belo Horizonte", estado="MG", populacao=2_300_000, codigo_ibge="3106200")
SP = MunicipioRef(id=8, nome="São Paulo", estado="SP", populacao=11_400_000, codigo_ibge="3550308")
# Capital com código IBGE real (Boa Vista/RR) mas população fictícia, escolhida
# para cair na mesma faixa FPM do FOCO: isola o filtro "não é capital" do
# filtro de faixa — sem isso BH já seria descartado por faixa (índice 17 vs 3),
# e o teste passaria mesmo sem excluir capitais do pool de município comum.
CAPITAL_NA_FAIXA_DO_FOCO = MunicipioRef(
    id=13, nome="Boa Vista", estado="RR", populacao=20_400, codigo_ibge="1400100"
)


def test_capital_e_faixa():
    assert eh_capital(BH) is True
    assert eh_capital(FOCO) is False
    assert mesma_faixa(FOCO, PERTO) is True
    assert mesma_faixa(FOCO, VIZINHA) is False
    assert mesma_faixa(FOCO, MunicipioRef(id=9, nome="X", estado="MG", populacao=None)) is False
    assert rotulo_faixa(FOCO) == "faixa FPM 16.981–23.772 hab"
    assert rotulo_faixa(BH) == "faixa FPM acima de 156.216 hab"


def test_mesma_uf_e_faixa_tem_prioridade_e_ordena_por_proximidade():
    # limite=2 para o teste ver só o primeiro estrato: com limite=6 a cascata
    # completaria o grupo com OUTRA_UF, que é justamente o comportamento
    # verificado no teste seguinte.
    r = selecionar_pares(FOCO, [LONGE, OUTRA_UF, PERTO], limite=2)
    assert [p.id for p in r.pares] == [2, 3]          # Perto antes de Longe
    assert r.criterio == "mesma UF · faixa FPM 16.981–23.772 hab"
    assert r.motivo is None


def test_completa_o_grupo_com_outra_uf_quando_sobra_vaga():
    r = selecionar_pares(FOCO, [LONGE, OUTRA_UF, PERTO])   # limite padrão = 6
    assert [p.id for p in r.pares] == [2, 3, 4]
    assert r.criterio == (
        "mesma UF · faixa FPM 16.981–23.772 hab + faixa FPM 16.981–23.772 hab · nacional"
    )


def test_cascata_para_nacional_e_depois_faixa_adjacente():
    r = selecionar_pares(FOCO, [OUTRA_UF, VIZINHA, DISTANTE], limite=3)
    assert [p.id for p in r.pares] == [4, 5]          # nacional mesma faixa, depois UF/faixa vizinha
    assert r.criterio == (
        "faixa FPM 16.981–23.772 hab · nacional + mesma UF · faixa FPM próxima"
    )


def test_exclui_proprio_demo_e_sem_populacao():
    demo = MunicipioRef(id=10, nome="Demo", estado="MG", populacao=20_200, is_demo=True)
    sem_pop = MunicipioRef(id=11, nome="SemPop", estado="MG", populacao=None)
    r = selecionar_pares(FOCO, [FOCO, demo, sem_pop, PERTO])
    assert [p.id for p in r.pares] == [2]


def test_capital_recebe_capitais_como_pares():
    r = selecionar_pares(BH, [SP, PERTO, LONGE])
    assert [p.id for p in r.pares] == [8]
    assert r.criterio == "capitais · proximidade populacional"


def test_capital_nao_entra_como_par_de_municipio_comum():
    r = selecionar_pares(FOCO, [CAPITAL_NA_FAIXA_DO_FOCO, PERTO])
    assert [p.id for p in r.pares] == [2]


def test_foco_sem_populacao_e_sem_candidatos():
    sem_pop = MunicipioRef(id=12, nome="SemPop", estado="MG", populacao=None)
    assert selecionar_pares(sem_pop, [PERTO]).motivo == "sem_populacao"
    assert selecionar_pares(FOCO, []).motivo == "sem_pares"
    assert selecionar_pares(FOCO, []).pares == []


def test_limite_respeitado():
    muitos = [
        MunicipioRef(id=100 + i, nome=f"M{i}", estado="MG", populacao=20_000 + i, codigo_ibge=f"31000{i:02d}")
        for i in range(20)
    ]
    assert len(selecionar_pares(FOCO, muitos).pares) == LIMITE_PADRAO
    assert len(selecionar_pares(FOCO, muitos, limite=2).pares) == 2
