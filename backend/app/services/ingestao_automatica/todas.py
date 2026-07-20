"""Lógica pura do meta-job 'todas as fontes' — decisões testáveis sem DB.

O loop de execução em si vive no runner (precisa de sessões/queries); aqui
ficam o formato do resumo agregado, a regra do status final, o prefixo de
etapa e a decisão de expansão da captação federal."""
from app.services.ingestao_automatica.base import ResumoIngestao


def precisa_expandir_captacao(fonte_key: str, filtros: dict | None) -> bool:
    """Na execução 'todas' com municípios avulsos, a captação federal roda
    para as UFs inteiras da seleção — o diagnóstico compara pares por UF e
    rodar só o município deixaria os pares vazios."""
    return fonte_key == "captacao_federal" and bool((filtros or {}).get("municipio_ids"))


def prefixo_etapa(indice: int, total: int, label: str, etapa: str | None) -> str:
    """Etapa exibida no meta-job: '3/10 · PIB (IBGE) — baixando ano 2021'."""
    base = f"{indice}/{total} · {label}"
    return f"{base} — {etapa}" if etapa else base


def item_resumo_ok(key: str, resumo: ResumoIngestao) -> dict:
    return {
        "key": key,
        "status": "aviso" if resumo.erros else "ok",
        "linhas": resumo.linhas,
        "municipios_ok": resumo.municipios_ok,
        "municipios_erro": resumo.municipios_erro,
        "erros": resumo.erros[:5],
    }


def item_resumo_erro(key: str, exc: Exception) -> dict:
    return {
        "key": key,
        "status": "erro",
        "linhas": 0,
        "municipios_ok": 0,
        "municipios_erro": 0,
        "erros": [str(exc)[:300]],
    }


def status_final_todas(itens: list[dict]) -> str:
    """'concluido' se ao menos uma fonte terminou sem exceção; 'erro' só se
    todas falharem (a lista nunca é vazia — a ordem tem sempre as 10 fontes)."""
    return "concluido" if any(i["status"] != "erro" for i in itens) else "erro"


def mensagem_erro_todas(itens: list[dict]) -> str:
    primeira = next(
        (i["erros"][0] for i in itens if i["status"] == "erro" and i.get("erros")), ""
    )
    return f"Todas as {len(itens)} fontes falharam — primeira falha: {primeira}"[:1000]
