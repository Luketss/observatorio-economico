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
