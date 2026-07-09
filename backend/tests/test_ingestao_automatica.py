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


def test_norm_nome_municipio_compartilhado():
    assert norm_nome_municipio("Divinópolis") == "divinopolis"
    assert norm_nome_municipio("São Thomé das Letras") == norm_nome_municipio("São Tomé das Letras")
