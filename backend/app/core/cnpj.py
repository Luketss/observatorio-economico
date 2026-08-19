import re


def cnpj_para_basico(valor: str | None) -> str | None:
    """Normaliza um CNPJ digitado para a raiz de 8 dígitos usada pela base RFB
    (`empresas.cnpj_basico`). Aceita máscara ou dígitos; devolve None quando o
    texto não contém pelo menos 8 dígitos."""
    if not valor:
        return None
    digitos = re.sub(r"\D", "", valor)
    return digitos[:8] if len(digitos) >= 8 else None
