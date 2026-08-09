"""Envelope dos comparativos por pares — defaults e composição."""
from app.schemas.pares import MunicipioRefOut, ParesMeta
from app.schemas.pib import PibComparativoOut
from app.schemas.vaf import VafComparativoOut


def test_pares_meta_tem_defaults_vazios():
    m = ParesMeta()
    assert m.foco is None and m.pares == [] and m.fixados == []
    assert m.criterio_pares is None and m.motivo is None


def test_defaults_nao_sao_compartilhados_entre_instancias():
    a, b = ParesMeta(), ParesMeta()
    a.pares.append(MunicipioRefOut(municipio_id=1, nome="X", estado="MG"))
    assert b.pares == []


def test_envelope_pib_vazio_e_preenchido():
    vazio = PibComparativoOut(motivo="sem_municipio")
    assert vazio.itens == [] and vazio.foco is None

    cheio = PibComparativoOut(
        foco=MunicipioRefOut(municipio_id=1, nome="Foco", estado="MG"),
        pares=[MunicipioRefOut(municipio_id=2, nome="Par", estado="MG")],
        criterio_pares="mesma UF · faixa FPM 16.981–23.772 hab",
        itens=[{"ano": 2021, "municipio_id": 1, "cidade": "Foco", "pib_total": 10.0}],
    )
    assert cheio.itens[0].municipio_id == 1
    assert cheio.pares[0].nome == "Par"


def test_envelope_vaf_item_carrega_municipio_id():
    out = VafComparativoOut(
        foco=MunicipioRefOut(municipio_id=1, nome="Foco", estado="MG"),
        itens=[{"ano_base": 2021, "municipio_id": 1, "cidade": "Foco",
                "indice_participacao_municipal": 0.5}],
    )
    assert out.itens[0].municipio_id == 1
    assert out.itens[0].indice_participacao_municipal == 0.5
