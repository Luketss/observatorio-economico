"""Fonte automática: População residente estimada (IBGE, agregado 6579).

Uma requisição por ano cobre todos os municípios (códigos separados por
vírgula). Ao final do upsert dispara as notificações de faixa do FPM."""
import logging
import re
from datetime import date

import requests

from app.services.ingestao_automatica.base import FonteAutomatica, ResumoIngestao, registrar

logger = logging.getLogger(__name__)

IBGE_URL = (
    "https://servicodados.ibge.gov.br/api/v3/agregados/6579/"
    "periodos/{ano}/variaveis/9324?localidades=N6[{codigos}]"
)
_CHUNK = 100  # códigos por requisição

# 7 dígitos iniciando pela região (1-5). Um código inválido no lote (ex.: o
# placeholder "0000000" do Município Padrão) faz a API de agregados responder
# 500 para o chunk INTEIRO — por isso validamos antes de requisitar.
_CODIGO_IBGE_RE = re.compile(r"^[1-5]\d{6}$")


def codigo_ibge_valido(codigo) -> bool:
    return bool(_CODIGO_IBGE_RE.match((codigo or "").strip()))


def parse_populacao_ibge(payload) -> dict[str, dict[int, int]]:
    """Payload da API de agregados → {codigo_ibge: {ano: populacao}}.
    Valores não numéricos ('...', '-') são ignorados."""
    out: dict[str, dict[int, int]] = {}
    for variavel in payload or []:
        for resultado in variavel.get("resultados", []):
            for serie in resultado.get("series", []):
                codigo = str((serie.get("localidade") or {}).get("id") or "")
                for ano_str, valor in (serie.get("serie") or {}).items():
                    try:
                        out.setdefault(codigo, {})[int(ano_str)] = int(valor)
                    except (TypeError, ValueError):
                        continue
    return {k: v for k, v in out.items() if v}


def _buscar_ano(ano: int, codigos: list[str]) -> tuple[list, list[str]]:
    """Busca um ano em chunks. Falha de um chunk não derruba os demais —
    retorna (payload agregado, erros por chunk)."""
    payload: list = []
    erros: list[str] = []
    for i in range(0, len(codigos), _CHUNK):
        chunk = codigos[i:i + _CHUNK]
        try:
            resp = requests.get(IBGE_URL.format(ano=ano, codigos=",".join(chunk)), timeout=60)
            resp.raise_for_status()
            payload.extend(resp.json() or [])
        except requests.RequestException as exc:
            erros.append(f"IBGE {ano} (lote {i // _CHUNK + 1}): {exc}")
    return payload, erros


def executar(db, municipios, anos=None, usuario_id=None, notificar=True, progresso=None) -> ResumoIngestao:
    from app.models.populacao import PopulacaoMunicipio

    resumo = ResumoIngestao(dataset="populacao")
    com_codigo = []
    for m in municipios:
        if codigo_ibge_valido(m.codigo_ibge):
            com_codigo.append(m)
        else:
            resumo.municipios_erro += 1
            motivo = (
                "sem codigo_ibge cadastrado"
                if not m.codigo_ibge
                else f"codigo_ibge inválido ({m.codigo_ibge!r})"
            )
            resumo.erros.append(f"{m.nome}/{m.estado}: {motivo}")
    if not com_codigo:
        return resumo

    if anos is None:
        atual = date.today().year
        anos = list(range(atual - 5, atual + 1))

    por_codigo: dict[str, dict[int, int]] = {}
    for ano in anos:
        if progresso:
            progresso(0, len(com_codigo), f"consultando IBGE {ano}")
        payload, erros_ano = _buscar_ano(ano, [m.codigo_ibge.strip() for m in com_codigo])
        resumo.erros.extend(erros_ano)
        for codigo, serie in parse_populacao_ibge(payload).items():
            por_codigo.setdefault(codigo, {}).update(serie)

    atualizados: list[int] = []
    for i, m in enumerate(com_codigo, start=1):
        if progresso:
            progresso(i, len(com_codigo), "processando municípios")
        serie = por_codigo.get(m.codigo_ibge.strip())
        if not serie:
            resumo.municipios_erro += 1
            resumo.erros.append(f"{m.nome}/{m.estado}: IBGE não retornou dados")
            continue
        existentes = {
            r.ano: r
            for r in db.query(PopulacaoMunicipio)
            .filter(PopulacaoMunicipio.municipio_id == m.id)
            .all()
        }
        for ano, pop in sorted(serie.items()):
            reg = existentes.get(ano)
            if reg:
                reg.populacao = pop
                reg.fonte = "Estimativa IBGE"
            else:
                db.add(PopulacaoMunicipio(
                    municipio_id=m.id, ano=ano, populacao=pop, fonte="Estimativa IBGE",
                ))
            resumo.linhas += 1
        resumo.municipios_ok += 1
        atualizados.append(m.id)
    db.commit()

    if notificar and usuario_id and atualizados:
        from app.services.fpm_service import gerar_notificacoes_fpm

        resumo.notificacoes = gerar_notificacoes_fpm(db, atualizados, usuario_id)
    return resumo


registrar(FonteAutomatica(
    key="populacao",
    label="População (IBGE)",
    fonte="IBGE — Estimativas de População (agregado 6579)",
    executar=executar,
))
