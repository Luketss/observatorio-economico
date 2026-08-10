"""Parsers puros das fontes automáticas (IBGE / STN) — sem rede, sem DB.
Fixtures copiadas de respostas reais das APIs (2026-07-06)."""
from app.services.ingestao_automatica.populacao_ibge import parse_populacao_ibge

# Resposta real de GET .../agregados/6579/periodos/2024/variaveis/9324?localidades=N6[3122306,3126109]
PAYLOAD_IBGE = [{
    "id": "9324",
    "variavel": "População residente estimada",
    "unidade": "Pessoas",
    "resultados": [{
        "classificacoes": [],
        "series": [
            {"localidade": {"id": "3122306", "nivel": {"id": "N6", "nome": "Município"},
                            "nome": "Divinópolis (MG)"}, "serie": {"2024": "242328"}},
            {"localidade": {"id": "3126109", "nivel": {"id": "N6", "nome": "Município"},
                            "nome": "Formiga (MG)"}, "serie": {"2024": "70668"}},
        ],
    }],
}]


def test_parse_ibge_extrai_populacao_por_codigo_e_ano():
    out = parse_populacao_ibge(PAYLOAD_IBGE)
    assert out == {"3122306": {2024: 242328}, "3126109": {2024: 70668}}


def test_parse_ibge_ignora_valores_nao_numericos_e_payload_vazio():
    payload = [{"resultados": [{"series": [
        {"localidade": {"id": "9999999"}, "serie": {"2024": "...", "2025": "-"}},
    ]}]}]
    assert parse_populacao_ibge(payload) == {}
    assert parse_populacao_ibge([]) == {}
    assert parse_populacao_ibge(None) == {}


# ── STN: FPM por município (CSV) ─────────────────────────────────────────────
from app.services.ingestao_automatica.fpm_stn import (
    _norm_nome,
    _parse_valor,
    parse_fpm_csv,
)

# Recorte real do fpm-por-municipio.csv da STN (latin-1, ';', meses futuros '-')
CSV_STN = (
    "COD_MUN;Município;UF;Município - UF;Mês;2025;2026\n"
    "4445;Divinópolis;MG;Divinópolis - MG;1; 11.281.019,33 ; 12.281.019,33 \n"
    "4445;Divinópolis;MG;Divinópolis - MG;7; 10.000.000,00 ; -   \n"
    "0643;Acrelândia;AC;Acrelândia - AC;1; 50.880,73 ; 60.000,00 \n"
)


def test_parse_valor_pt_br():
    assert _parse_valor(" 12.281.019,33 ") == 12281019.33
    assert _parse_valor(" -   ") is None
    assert _parse_valor("") is None
    assert _parse_valor(None) is None


def test_norm_nome_remove_acentos_e_caixa():
    assert _norm_nome("Divinópolis") == "divinopolis"
    assert _norm_nome("  SÃO PAULO ") == "sao paulo"


def test_parse_fpm_csv_filtra_por_nome_uf_e_pula_meses_futuros():
    alvo = {("divinopolis", "MG"): 42}
    out = parse_fpm_csv(CSV_STN, alvo)
    assert set(out.keys()) == {42}
    assert (2025, 1, 11281019.33) in out[42]
    assert (2026, 1, 12281019.33) in out[42]
    assert (2025, 7, 10000000.0) in out[42]
    # mês 7/2026 é ' -   ' → não entra
    assert not any(a == 2026 and m == 7 for a, m, _ in out[42])


def test_parse_fpm_csv_filtro_de_anos():
    alvo = {("divinopolis", "MG"): 42}
    out = parse_fpm_csv(CSV_STN, alvo, anos={2026})
    assert all(a == 2026 for a, _, _ in out[42])


def test_parse_fpm_csv_ignora_preambulo_antes_do_header():
    com_preambulo = "MINISTÉRIO DA FAZENDA;;\n;;\n" + CSV_STN
    out = parse_fpm_csv(com_preambulo, {("acrelandia", "AC"): 7})
    assert out == {7: [(2025, 1, 50880.73), (2026, 1, 60000.0)]}


# ── validação de codigo_ibge e resiliência por chunk (IBGE) ──────────────────
# Bug real (2026-07-07): "Município Padrão" com codigo_ibge "0000000" fazia a
# API de agregados responder 500 para o chunk inteiro, zerando a ingestão.
from app.services.ingestao_automatica.populacao_ibge import codigo_ibge_valido


def test_codigo_ibge_valido():
    assert codigo_ibge_valido("3122306")
    assert codigo_ibge_valido(" 3122306 ")      # tolera espaços acidentais
    assert not codigo_ibge_valido("0000000")    # placeholder (Município Padrão)
    assert not codigo_ibge_valido("")
    assert not codigo_ibge_valido(None)
    assert not codigo_ibge_valido("312230")     # 6 dígitos
    assert not codigo_ibge_valido("31223066")   # 8 dígitos
    assert not codigo_ibge_valido("abc1234")


def test_buscar_ano_isola_falha_de_chunk(monkeypatch):
    import app.services.ingestao_automatica.populacao_ibge as mod

    class FakeResp:
        def __init__(self, fail):
            self._fail = fail

        def raise_for_status(self):
            if self._fail:
                raise mod.requests.HTTPError("500 Server Error")

        def json(self):
            return [{"resultados": [{"series": [
                {"localidade": {"id": "3122306"}, "serie": {"2024": "242328"}}]}]}]

    monkeypatch.setattr(mod.requests, "get", lambda url, timeout: FakeResp(fail="0000000" in url))
    monkeypatch.setattr(mod, "_CHUNK", 1)
    payload, erros = mod._buscar_ano(2024, ["3122306", "0000000"])
    assert payload, "chunk bom deve sobreviver à falha do chunk ruim"
    assert len(erros) == 1 and "2024" in erros[0]


# ── grafias históricas da STN (s/z, th, hífen) ───────────────────────────────
# Casos reais de MG que não casavam: Brasópolis, Dona Eusébia, São Thomé das
# Letras, Passa-Vinte (grafias do CSV) vs grafia IBGE do banco.
def test_norm_nome_casa_grafias_stn():
    assert _norm_nome("Brazópolis") == _norm_nome("Brasópolis")
    assert _norm_nome("Dona Euzébia") == _norm_nome("Dona Eusébia")
    assert _norm_nome("São Tomé das Letras") == _norm_nome("São Thomé das Letras")
    assert _norm_nome("Passa Vinte") == _norm_nome("Passa-Vinte")
    # nomes distintos continuam distintos
    assert _norm_nome("Passa Tempo") != _norm_nome("Passa Quatro")
    assert _norm_nome("Divinópolis") != _norm_nome("Divinésia")


# ── util: competências das fontes mensais ────────────────────────────────────
from datetime import date

from app.services.ingestao_automatica.util import competencias_janela, norm_nome_municipio


def test_competencias_default_ultimos_12_meses():
    out = competencias_janela(hoje=date(2026, 7, 9))
    assert len(out) == 12
    assert out[0] == (2025, 7)
    assert out[-1] == (2026, 6)  # mês anterior ao corrente


def test_competencias_por_anos_clampa_inicio_e_fim():
    out = competencias_janela(anos=[2021, 2022], inicio=(2022, 1), hoje=date(2026, 7, 9))
    assert out[0] == (2022, 1)          # 2021 clampado para o início da série
    assert out[-1] == (2022, 12)
    out2 = competencias_janela(anos=[2026], inicio=(2022, 1), hoje=date(2026, 7, 9))
    assert out2[-1] == (2026, 6)        # nunca inclui o mês corrente/futuro


def test_competencias_em_janeiro_rola_para_dezembro_anterior():
    out = competencias_janela(hoje=date(2026, 1, 15))
    assert out[-1] == (2025, 12)   # mês anterior a janeiro = dezembro do ano anterior
    assert len(out) == 12
    assert out[0] == (2025, 1)


def test_norm_nome_municipio_compartilhado():
    assert norm_nome_municipio("Divinópolis") == "divinopolis"
    assert norm_nome_municipio("São Thomé das Letras") == norm_nome_municipio("São Tomé das Letras")


def test_norm_nome_municipio_apostrofo_tipografico():
    assert norm_nome_municipio("Sant’Ana do Riacho") == norm_nome_municipio("Sant'Ana do Riacho")


# ── competências não publicadas (403 do host da CGU = arquivo inexistente) ──
import requests

from app.services.ingestao_automatica.util import (
    agrupar_competencias,
    eh_nao_publicado,
    msg_nao_publicadas,
)


def _http_error(status: int) -> requests.HTTPError:
    resp = requests.Response()
    resp.status_code = status
    return requests.HTTPError(response=resp)


def test_eh_nao_publicado_403_e_404():
    assert eh_nao_publicado(_http_error(403)) is True
    assert eh_nao_publicado(_http_error(404)) is True


def test_eh_nao_publicado_erros_reais_continuam_tecnicos():
    assert eh_nao_publicado(_http_error(500)) is False
    assert eh_nao_publicado(_http_error(429)) is False
    assert eh_nao_publicado(requests.ConnectionError("boom")) is False
    assert eh_nao_publicado(requests.Timeout("slow")) is False


def test_agrupar_competencias_faixa_atravessa_virada_de_ano():
    assert agrupar_competencias(["202512", "202601", "202602"]) == "202512–202602"


def test_agrupar_competencias_faixas_e_isolados():
    out = agrupar_competencias(["202606", "202511", "202512", "202603", "202602"])
    assert out == "202511–202512, 202602–202603, 202606"


def test_agrupar_competencias_um_mes():
    assert agrupar_competencias(["202512"]) == "202512"


def test_msg_nao_publicadas():
    assert msg_nao_publicadas("Pé-de-Meia", []) is None
    assert msg_nao_publicadas("Pé-de-Meia", ["202512"]) == (
        "Pé-de-Meia: competência 202512 ainda não publicada pelo Portal da Transparência"
    )
    assert msg_nao_publicadas("Bolsa Família", ["202512", "202601"]) == (
        "Bolsa Família: competências 202512–202601 ainda não publicadas pelo Portal da Transparência"
    )


# ── fonte inss (EMPS) ──
from app.services.ingestao_automatica.inss_emps import (
    CATEGORIAS,
    achar_aba,
    montar_registros,
    parse_emps_aba,
)


def test_parse_emps_aba_so_linhas_com_codigo_ibge_7_digitos():
    rows = [
        ("Nome ", "Código IBGE", "UF", "hdr", "hdr", "hdr", "hdr", "hdr", "hdr", "hdr", "hdr", "hdr", "hdr"),
        ("Água Branca", "2700102", "AL", 2586, 2126, 318, 142, 907, 178, 8, 3679, 642, 4321),
        ("Total Brasil", None, "", 9, 9, 9, 9, 9, 9, 9, 9, 9, 9),
        ("Fonte: SÍNTESE/Dataprev", "", "", None, None, None, None, None, None, None, None, None, None),
    ]
    out = parse_emps_aba(rows)
    assert list(out) == ["2700102"]
    assert out["2700102"]["Aposentadorias por idade"] == 2126.0
    assert out["2700102"]["Pensões por morte"] == 907.0
    assert out["2700102"]["Benefícios assistenciais"] == 642.0
    # subtotais/total NÃO viram categoria
    assert len(out["2700102"]) == len(CATEGORIAS) == 7


def test_parse_emps_aba_codigo_numerico_e_celulas_vazias():
    rows = [("Cidade X", 3122306, "MG", 10, 4, None, 3, 2, "", 1, 10, 5, 15)]
    out = parse_emps_aba(rows)
    assert "3122306" in out
    assert out["3122306"]["Aposentadorias por invalidez"] == 0.0   # None → 0
    assert out["3122306"]["Auxílios"] == 0.0                        # "" → 0
    assert out["3122306"]["Outros benefícios previdenciários"] == 1.0


def test_montar_registros_casa_qtd_e_valor():
    qtd = parse_emps_aba([("A", "2700102", "AL", 13, 4, 3, 3, 2, 1, 0, 13, 5, 18)])
    val = parse_emps_aba([("A", "2700102", "AL", 130.0, 40.0, 30.0, 30.0, 20.55, 10.0, 0.0, 130.55, 50.0, 180.55)])
    regs = montar_registros(qtd, val, {"2700102": 77}, 2024)
    assert len(regs) == 7
    r = next(x for x in regs if x["categoria"] == "Pensões por morte")
    assert r == {"municipio_id": 77, "ano": 2024, "categoria": "Pensões por morte",
                 "quantidade_beneficios": 2, "valor_anual": 20.55}


def test_montar_registros_ignora_alvo_fora_do_emps():
    assert montar_registros({}, {}, {"9999999": 1}, 2024) == []


def test_achar_aba_por_prefixo_case_insensitive():
    abas = ["Qtd_dez2024", "Valor_R$_dez24", "Valor_Médio_R$_dez24", "Valor_Total_2024"]
    assert achar_aba(abas, "qtd") == "Qtd_dez2024"
    assert achar_aba(abas, "valor_total") == "Valor_Total_2024"   # não confunde com Valor_R$
    assert achar_aba(abas, "xyz") is None


# ── fonte arrecadacao (repasses MG) ──
from datetime import date as _date

from app.services.ingestao_automatica.arrecadacao_mg import (
    montar_repasses,
    parse_dim_municipio,
    parse_dim_tempo,
)


def test_parse_dim_tempo():
    linhas = ["id_tempo;anomes_iso;mes;ano;anomes_formatado",
              "1009;202211;11;2022;11/2022",
              "1189;202605;5;2026;05/2026"]
    assert parse_dim_tempo(linhas) == {"1009": (2022, 11), "1189": (2026, 5)}


def test_parse_dim_municipio_descarta_territorios():
    linhas = ["id_municipio;cd_municipio_ibge;nome",
              "896;37;TERRITORIO ALTO JEQUITINHONHA",
              "474;3109501;CABO VERDE"]
    assert parse_dim_municipio(linhas) == {"474": "3109501"}


def test_montar_repasses_join_e_derivados():
    tempo = {"1009": (2022, 11)}
    mun = {"474": "3109501"}
    fato = ["id_tempo;id_municipio;ano_particao;vr_icms;vr_ipi;vr_ipva",
            "1009;474;2022;161332.64;2712.47;22250.11",
            "1009;999;2022;1.0;1.0;1.0"]          # id_municipio fora das dims → ignorado
    regs = montar_repasses(fato, tempo, mun, {"3109501": 77})
    assert len(regs) == 1
    r = regs[0]
    assert r["municipio_id"] == 77 and r["ano"] == 2022 and r["mes"] == 11
    assert r["nome_mes"] == "Novembro"
    assert r["data_base"] == _date(2022, 11, 1)
    assert r["valor_icms"] == 161332.64 and r["valor_ipi"] == 2712.47 and r["valor_ipva"] == 22250.11
    assert r["valor_total"] == round(161332.64 + 2712.47 + 22250.11, 2)


def test_montar_repasses_filtro_anos_e_alvo():
    tempo = {"1": (2022, 1), "2": (2023, 1)}
    mun = {"474": "3109501", "500": "3106200"}
    fato = ["id_tempo;id_municipio;ano_particao;vr_icms;vr_ipi;vr_ipva",
            "1;474;2022;10;1;2",
            "2;474;2023;20;2;4",
            "2;500;2023;30;3;6"]                   # 3106200 não é alvo
    regs = montar_repasses(fato, tempo, mun, {"3109501": 77}, anos=[2023])
    assert len(regs) == 1
    assert regs[0]["ano"] == 2023 and regs[0]["valor_icms"] == 20.0


def test_montar_repasses_valor_vazio_vira_zero():
    tempo = {"1": (2022, 1)}
    mun = {"474": "3109501"}
    fato = ["id_tempo;id_municipio;ano_particao;vr_icms;vr_ipi;vr_ipva",
            "1;474;2022;;;5.5"]
    r = montar_repasses(fato, tempo, mun, {"3109501": 77})[0]
    assert r["valor_icms"] == 0.0 and r["valor_ipi"] == 0.0 and r["valor_ipva"] == 5.5
    assert r["valor_total"] == 5.5


# ── Fontes com arquivo (requer_arquivo) ──────────────────────────────────────
import pytest
from fastapi import HTTPException
from types import SimpleNamespace

from app.services.ingestao_automatica.base import (
    FONTES_AUTOMATICAS,
    FonteAutomatica,
    registrar,
)


def test_requer_arquivo_default_false():
    f = FonteAutomatica(key="x", label="X", fonte="X", executar=lambda **kw: None)
    assert f.requer_arquivo is False


def test_executar_rejeita_fonte_que_requer_arquivo():
    # guard roda antes de tocar db — db=object() prova que não há acesso
    from app.api.v1.routers.ingestao_automatica import ExecutarIn, executar_fonte

    registrar(FonteAutomatica(key="_teste_arq", label="T", fonte="T",
                              executar=lambda **kw: None, requer_arquivo=True))
    try:
        with pytest.raises(HTTPException) as exc:
            executar_fonte("_teste_arq", ExecutarIn(), db=object(),
                           current_user=SimpleNamespace(id=1))
        assert exc.value.status_code == 400
        assert "arquivo" in exc.value.detail
    finally:
        FONTES_AUTOMATICAS.pop("_teste_arq", None)


# ── multipart endpoint executar-arquivo para fontes com requer_arquivo ───────
def _upload_fake(conteudo: bytes = b"PK...", nome: str = "ips_brasil_municipios_2025.xlsx"):
    import io
    return SimpleNamespace(file=io.BytesIO(conteudo), filename=nome)


def test_executar_arquivo_404_para_fonte_inexistente():
    from app.api.v1.routers.ingestao_automatica import executar_fonte_com_arquivo

    with pytest.raises(HTTPException) as exc:
        executar_fonte_com_arquivo("nao_existe", arquivo=_upload_fake(), ano=2025,
                                   notificar=True, db=object(),
                                   current_user=SimpleNamespace(id=1))
    assert exc.value.status_code == 404


def test_executar_arquivo_400_para_fonte_sem_flag():
    import app.services.ingestao_automatica  # noqa: F401 — registra 'populacao'
    from app.api.v1.routers.ingestao_automatica import executar_fonte_com_arquivo

    with pytest.raises(HTTPException) as exc:
        executar_fonte_com_arquivo("populacao", arquivo=_upload_fake(), ano=2025,
                                   notificar=True, db=object(),
                                   current_user=SimpleNamespace(id=1))
    assert exc.value.status_code == 400


def test_executar_arquivo_400_para_ano_invalido_e_arquivo_grande():
    from app.api.v1.routers.ingestao_automatica import (
        _LIMITE_UPLOAD_BYTES,
        executar_fonte_com_arquivo,
    )

    registrar(FonteAutomatica(key="_teste_arq2", label="T", fonte="T",
                              executar=lambda **kw: None, requer_arquivo=True))
    try:
        with pytest.raises(HTTPException) as exc:
            executar_fonte_com_arquivo("_teste_arq2", arquivo=_upload_fake(), ano=1889,
                                       notificar=True, db=object(),
                                       current_user=SimpleNamespace(id=1))
        assert exc.value.status_code == 400

        grande = _upload_fake(conteudo=b"x" * (_LIMITE_UPLOAD_BYTES + 1))
        with pytest.raises(HTTPException) as exc:
            executar_fonte_com_arquivo("_teste_arq2", arquivo=grande, ano=2025,
                                       notificar=True, db=object(),
                                       current_user=SimpleNamespace(id=1))
        assert exc.value.status_code == 400
        assert "20 MB" in exc.value.detail
    finally:
        FONTES_AUTOMATICAS.pop("_teste_arq2", None)


def test_rota_executar_arquivo_e_multipart_no_openapi():
    from app.main import app

    schema = app.openapi()
    op = schema["paths"]["/api/v1/ingestao-automatica/{dataset_key}/executar-arquivo"]["post"]
    assert "multipart/form-data" in op["requestBody"]["content"]
