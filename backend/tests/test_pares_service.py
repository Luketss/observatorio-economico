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


# ── helpers de endpoint (puros) ──────────────────────────────────────────────
from app.services.pares_service import (  # noqa: E402
    MAX_FIXADOS,
    elegiveis_por_cobertura,
    parse_fixados,
    resolver_grupo,
)

REFS = {r.id: r for r in [FOCO, PERTO, LONGE, OUTRA_UF, VIZINHA, BH]}


def test_parse_fixados_apara_e_higieniza():
    assert parse_fixados("12, 7,99") == [12, 7, 99]
    assert parse_fixados("1,2,3,4,5") == [1, 2, 3]          # MAX_FIXADOS
    assert parse_fixados("1,1,2") == [1, 2]                 # sem repetição
    assert parse_fixados("1,abc,,3") == [1, 3]              # ignora lixo
    assert parse_fixados(None) == [] and parse_fixados("") == []
    assert MAX_FIXADOS == 3


def test_elegiveis_por_cobertura_exige_todos_os_anos_do_foco():
    linhas = [(1, 2020), (1, 2021), (2, 2020), (2, 2021), (3, 2021)]
    assert elegiveis_por_cobertura(linhas, {2020, 2021}) == {1, 2}
    assert elegiveis_por_cobertura(linhas, {2021}) == {1, 2, 3}
    assert elegiveis_por_cobertura(linhas, set()) == set()


def test_resolver_grupo_monta_foco_pares_e_fixados():
    g = resolver_grupo(REFS, mid=1, elegiveis={2, 3, 4}, fixados_ids=[5, 1, 2], limite=2)
    assert g.foco.id == 1
    # 2 (PERTO) foi tirado do pool de pares porque o usuário fixou — fixado
    # tem precedência, então quem sobra pro card de "par automático" é 3 e 4.
    assert [p.id for p in g.pares] == [3, 4]
    # 1 é o próprio foco; 5 e 2 sobrevivem como fixados, na ordem pedida.
    assert [f.id for f in g.fixados] == [5, 2]
    assert g.motivo is None


def test_resolver_grupo_fixado_tem_precedencia_sobre_par_automatico():
    # Antes da correção, um id fixado que caía no grupo que a cascata
    # escolheria como par automático era descartado silenciosamente: não
    # virava chip nem par, e o usuário via o seletor fechar sem nada mudar
    # na tela. Agora o fixado sai do pool ANTES de `selecionar_pares` rodar.
    g = resolver_grupo(REFS, mid=1, elegiveis={2, 3}, fixados_ids=[2], limite=6)
    assert [p.id for p in g.pares] == [3]
    assert [f.id for f in g.fixados] == [2]


def test_resolver_grupo_fixado_demo_nao_entra():
    # Município demo é dado fabricado — não pode ser fixado como se fosse
    # município real (mesma exclusão que o resto do comparativo já aplica).
    demo = MunicipioRef(id=21, nome="Demo", estado="MG", populacao=20_600, is_demo=True)
    refs = {**REFS, 21: demo}
    g = resolver_grupo(refs, mid=1, elegiveis={2, 3, 4}, fixados_ids=[21, 5], limite=2)
    assert [f.id for f in g.fixados] == [5]


def test_resolver_grupo_sem_municipio_conhecido():
    g = resolver_grupo(REFS, mid=999, elegiveis={2}, fixados_ids=[])
    assert g.motivo == "sem_municipio"
    assert g.foco is None and g.pares == []


def test_resolver_grupo_propaga_motivo_de_sem_pares():
    g = resolver_grupo(REFS, mid=1, elegiveis=set(), fixados_ids=[5])
    assert g.foco.id == 1
    assert g.pares == []
    assert g.motivo == "sem_pares"
    assert [f.id for f in g.fixados] == [5]    # fixado sobrevive mesmo sem pares


# ── captação continua com a mesma semântica após a refatoração ───────────────
def test_pares_de_captacao_mantem_grupos_ilimitados():
    from app.services.captacao_federal_service import _pares_de

    refs = {r.id: r for r in [FOCO, PERTO, LONGE, OUTRA_UF, VIZINHA, BH,
                              MunicipioRef(id=20, nome="D", estado="MG",
                                           populacao=20_300, is_demo=True)]}
    meta, pares, nacional = _pares_de(1, refs)
    assert meta["uf"] == "MG"
    assert meta["faixa"].indice == 3
    assert pares == {2, 3}              # mesma UF + mesma faixa, sem limite
    assert nacional == {2, 3, 4}        # mesma faixa, qualquer UF
    # capital, demo, faixa diferente e o próprio ficam fora dos dois grupos
    assert 7 not in nacional and 20 not in nacional and 5 not in nacional


def test_pares_de_captacao_nao_corta_em_seis_com_oito_candidatos():
    """`test_pares_de_captacao_mantem_grupos_ilimitados` usa só 2 candidatos
    elegíveis — passaria verde mesmo se alguém reintroduzisse um corte [:6] em
    `_pares_de` (o limite do GRÁFICO de pares, que não deve vazar para a
    amostra estatística de captação). Este teste usa 8 municípios na mesma
    UF+faixa do foco e exige que os 8 sobrevivam, provando que não há corte."""
    from app.services.captacao_federal_service import _pares_de

    muitos = [
        MunicipioRef(id=200 + i, nome=f"P{i}", estado="MG", populacao=20_000 + i,
                     codigo_ibge=f"320{i:04d}")
        for i in range(8)
    ]
    refs = {r.id: r for r in [FOCO, *muitos]}
    _, pares, nacional = _pares_de(1, refs)
    assert pares == {m.id for m in muitos}
    assert nacional == {m.id for m in muitos}
    assert len(pares) == 8   # > LIMITE_PADRAO (6): prova que não há corte de gráfico aqui


# ── carregar_refs — sem banco, com duplo de Session ──────────────────────────
class _DbFalso:
    """Duplo mínimo de `Session`: implementa só a cadeia
    `.query(...).outerjoin(...).filter(...).all()` que `carregar_refs` usa,
    devolvendo as linhas (tuplas) que o teste controla. Nenhum banco real
    entra na suíte — `linhas` já chega no formato
    (id, nome, estado, codigo_ibge, is_demo, ano, populacao)."""

    def __init__(self, linhas):
        self._linhas = linhas

    def query(self, *args, **kwargs):
        return self

    def outerjoin(self, *args, **kwargs):
        return self

    def filter(self, *args, **kwargs):
        return self

    def all(self):
        return self._linhas


def test_carregar_refs_ano_mais_recente_vence_mesmo_fora_de_ordem():
    """Cobre a condição de três braços de `carregar_refs` (mid já visto? ano
    veio nulo? ano é <= o melhor já visto?) que decide qual linha de
    população vence quando o outerjoin devolve os anos fora de ordem —
    exatamente o caminho que a refatoração também colocou no fluxo de
    produção da captação, sem nenhum teste dedicado até aqui."""
    from app.services.pares_service import carregar_refs

    # Município 1: três anos de população chegando fora de ordem (ano do
    # meio, depois o mais antigo, depois o mais recente) — o ano mais
    # recente (2021) tem que vencer mesmo entrando por último na lista.
    # Município 2 misturado na mesma lista, sem nenhuma linha de população
    # (outerjoin sem PopulacaoMunicipio correspondente): aparece com
    # populacao=None em vez de sumir da resposta.
    linhas = [
        (1, "Um", "MG", "3100000", False, 2020, 1_100),
        (2, "Dois", "SP", "3500000", False, None, None),
        (1, "Um", "MG", "3100000", False, 2019, 1_000),
        (1, "Um", "MG", "3100000", False, 2021, 1_200),
    ]
    refs = carregar_refs(_DbFalso(linhas))

    assert set(refs.keys()) == {1, 2}   # os dois municípios sobrevivem misturados na mesma lista
    assert refs[1].populacao == 1_200   # o ano mais recente (2021) venceu, mesmo fora de ordem
    assert refs[1].nome == "Um" and refs[1].estado == "MG" and refs[1].codigo_ibge == "3100000"
    assert refs[2].populacao is None    # sem linha de população: aparece, não some
    assert refs[2].is_demo is False
