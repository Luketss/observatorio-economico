"""Bundle de CA estendido para servidores gov.br com cadeia incompleta.

balanca.economia.gov.br (Comex/MDIC) envia só o certificado leaf, sem o
intermediário Sectigo — Python não faz AIA chasing como navegadores, então a
verificação padrão do requests falha. O fix embute o intermediário num bundle
certifi+extras usado via `verify=`."""
import ssl
from pathlib import Path

import certifi

from app.services.ingestao_automatica import comex_mdic, util
from app.services.ingestao_automatica.util import ca_bundle_gov

CERTS_DIR = Path(util.__file__).with_name("certs")


def test_bundle_contem_certifi_e_intermediarios():
    caminho = ca_bundle_gov()
    conteudo = Path(caminho).read_text(encoding="utf-8")
    assert Path(certifi.where()).read_text(encoding="utf-8")[:500] in conteudo
    pems = sorted(CERTS_DIR.glob("*.pem"))
    assert pems, "certs/ deve conter ao menos o intermediário Sectigo OV R36"
    for pem in pems:
        assert pem.read_text(encoding="utf-8").strip() in conteudo


def test_bundle_cacheado_por_processo():
    assert ca_bundle_gov() == ca_bundle_gov()


def test_intermediario_sectigo_e_um_cert_valido():
    pem = (CERTS_DIR / "sectigo-ov-r36.pem").read_text(encoding="utf-8")
    der = ssl.PEM_cert_to_DER_cert(pem)  # levanta se o PEM for inválido
    assert len(der) > 500


def test_comex_baixa_com_bundle_gov(monkeypatch):
    """Todos os downloads do comex (tabelas auxiliares e MUN) verificam TLS
    com o bundle estendido — sem isso o job morre em CERTIFICATE_VERIFY_FAILED."""
    chamadas = []

    class _Resp:
        status_code = 200
        content = b'"CO";"NO"\n"1";"x"\n'

        def raise_for_status(self):
            pass

    def fake_get(url, **kwargs):
        chamadas.append((url, kwargs.get("verify")))
        return _Resp()

    monkeypatch.setattr(comex_mdic.requests, "get", fake_get)
    comex_mdic._tabela_auxiliar("https://exemplo.gov.br/x.csv", "CO", "NO")
    assert chamadas and all(v == ca_bundle_gov() for _, v in chamadas)
