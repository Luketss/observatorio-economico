"""MEI/Simples flag parsing — the bug where opcao_mei (a date column) was read
as an S/N boolean and always came out False."""
from ingestao.carregar_cnpj import _parse_bool, _parse_mei


def test_parse_bool_flag():
    assert _parse_bool("S")
    assert _parse_bool("SIM")
    assert _parse_bool("1")
    assert not _parse_bool("N")
    assert not _parse_bool("")
    assert not _parse_bool("00000000")


def test_parse_mei_from_optin_date():
    # The Simples extract stores the MEI opt-in DATE (AAAAMMDD) in opcao_mei.
    assert _parse_mei("20090701") is True   # opted in → MEI
    assert _parse_mei("20230115") is True
    assert _parse_mei("00000000") is False  # never opted
    assert _parse_mei("") is False
    assert _parse_mei("N") is False
    assert _parse_mei("S") is True          # plain flag still accepted
