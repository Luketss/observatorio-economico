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
