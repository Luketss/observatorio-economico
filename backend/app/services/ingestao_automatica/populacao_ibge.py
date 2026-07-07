"""Fonte automática: População residente estimada (IBGE, agregado 6579).

Uma requisição por ano cobre todos os municípios (códigos separados por
vírgula). Ao final do upsert dispara as notificações de faixa do FPM."""
import logging
from datetime import date

import requests

from app.services.ingestao_automatica.base import FonteAutomatica, ResumoIngestao, registrar

logger = logging.getLogger(__name__)

IBGE_URL = (
    "https://servicodados.ibge.gov.br/api/v3/agregados/6579/"
    "periodos/{ano}/variaveis/9324?localidades=N6[{codigos}]"
)
_CHUNK = 100  # códigos por requisição


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


def _buscar_ano(ano: int, codigos: list[str]) -> list:
    payload: list = []
    for i in range(0, len(codigos), _CHUNK):
        chunk = codigos[i:i + _CHUNK]
        resp = requests.get(IBGE_URL.format(ano=ano, codigos=",".join(chunk)), timeout=60)
        resp.raise_for_status()
        payload.extend(resp.json() or [])
    return payload


def executar(db, municipios, anos=None, usuario_id=None, notificar=True) -> ResumoIngestao:
    from app.models.populacao import PopulacaoMunicipio

    resumo = ResumoIngestao(dataset="populacao")
    com_codigo = []
    for m in municipios:
        if m.codigo_ibge:
            com_codigo.append(m)
        else:
            resumo.municipios_erro += 1
            resumo.erros.append(f"{m.nome}/{m.estado}: sem codigo_ibge cadastrado")
    if not com_codigo:
        return resumo

    if anos is None:
        atual = date.today().year
        anos = list(range(atual - 5, atual + 1))

    por_codigo: dict[str, dict[int, int]] = {}
    for ano in anos:
        try:
            payload = _buscar_ano(ano, [m.codigo_ibge for m in com_codigo])
        except requests.RequestException as exc:
            resumo.erros.append(f"IBGE {ano}: {exc}")
            continue
        for codigo, serie in parse_populacao_ibge(payload).items():
            por_codigo.setdefault(codigo, {}).update(serie)

    atualizados: list[int] = []
    for m in com_codigo:
        serie = por_codigo.get(m.codigo_ibge)
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
