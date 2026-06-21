"""codigo_ibge validation that guards re-ingestion against wrong-city loads."""
from app.api.v1.routers.municipios import _csv_ibge_mismatch


def _csv(tmp_path, name, content):
    p = tmp_path / name
    p.write_text(content, encoding="utf-8")
    return p


def test_matching_ibge_returns_none(tmp_path):
    csv = _csv(tmp_path, "vaf.csv", "ano_base;codigo_ibge\n2024;3167509\n2023;3167509\n")
    assert _csv_ibge_mismatch(csv, "3167509") is None


def test_mismatching_ibge_flagged(tmp_path):
    csv = _csv(tmp_path, "vaf.csv", "ano_base;codigo_ibge\n2024;9999999\n")
    detail = _csv_ibge_mismatch(csv, "3167509")
    assert detail is not None
    assert "9999999" in detail


def test_no_ibge_column_skips(tmp_path):
    csv = _csv(tmp_path, "pib.csv", "Ano;PIB_Total\n2024;100\n")
    assert _csv_ibge_mismatch(csv, "3167509") is None


def test_no_expected_ibge_skips(tmp_path):
    csv = _csv(tmp_path, "vaf.csv", "ano_base;codigo_ibge\n2024;3167509\n")
    assert _csv_ibge_mismatch(csv, None) is None
