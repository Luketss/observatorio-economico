"""Fonte automática: Arrecadação PR — repasses da SEFA-PR aos municípios.

Relatório JSP legado do Portal da Transparência do PR (www4.pr.gov.br), GET
sem sessão: rrepassesmun.jsp?Param_Data=01/MM/AAAA&Param_Tiporelatorio=MENSAL.
Uma página HTML por mês, ~399 municípios; formato atual desde 2003 (anos
anteriores usam a variante rrepassesmun_lk.jsp — fora do escopo).

Layout real (amostra 06/2024): tabela com "Referência: Junho/2024", cabeçalho
[Município | Índices do FPM | ICMS | Fundo de Exportação | Royalties Petróleo
| IPVA | Total Repasse Líquido] (dígitos de <sup> colados: "ICMS1"),
sub-colunas do ICMS [Repasse Bruto | Repasse Líquido], 8 células por
município em número BR e linha final "Total em Junho/2024".

Mapeamento (colunas fixas de arrecadacao_mensal, sem coluna "outros"):
valor_icms = ICMS Repasse LÍQUIDO; valor_ipi = Fundo de Exportação (cota
municipal do IPI-Exportação); valor_ipva = IPVA; valor_total = soma dos três.
ROYALTIES PETRÓLEO FICA FORA por decisão explícita (não há coluna própria e
criá-la exigiria migração) — logo valor_total DIVERGE do "Total Repasse
Líquido" da página quando o município recebe royalties (na amostra: Abatiá
517.159,97 = 517.606,18 − 446,21 de royalties).

Match por nome+UF via norm_nome_municipio (a página não traz código IBGE).
Guardas: cabeçalho divergente → ValueError audível hard-stop (nenhuma linha
do mês, meses restantes abortados); Referência de outro mês → MesDivergente
(mês tratado como ainda-não-publicado); linha ilegível → contada em
`ignoradas` (aviso agregado — nenhum descarte silencioso).

Encoding: a sondagem de 2026-08-05 devolveu a página em UTF-8 (a spec previa
windows-1252) — decodificar() tenta UTF-8 e cai para cp1252."""
import logging
import re
import unicodedata
from datetime import date
from html.parser import HTMLParser

import requests

from app.services.ingestao_automatica.arrecadacao_mg import NOME_MESES
from app.services.ingestao_automatica.base import ResumoIngestao
from app.services.ingestao_automatica.util import (
    ca_bundle_gov,
    competencias_janela,
    norm_nome_municipio,
    parse_valor_br,
)

logger = logging.getLogger(__name__)

URL_MENSAL = (
    "https://www4.pr.gov.br/Gestao/portaldatransparencia/repasses/relatorio/"
    "rrepassesmun.jsp?Param_Data=01/{mes:02d}/{ano}&Param_Tiporelatorio=MENSAL"
)
INICIO_SERIE = (2003, 1)  # antes disso o relatório é o rrepassesmun_lk.jsp (fora do escopo)

# Cabeçalhos REAIS da amostra 06/2024, após _norm_header (que remove os
# dígitos de nota de rodapé colados pelo <sup>: "ICMS1" → "icms").
CABECALHO_ESPERADO = ["município", "índices do fpm", "icms", "fundo de exportação",
                     "royalties petróleo", "ipva", "total repasse líquido"]
SUBCABECALHO_ESPERADO = ["repasse bruto", "repasse líquido"]


class MesDivergente(Exception):
    """A página respondeu com Referência de outro mês (pedido não publicado)."""


class _ExtratorTabelas(HTMLParser):
    """Extrai TODAS as <table> do HTML (aninhadas inclusive) como listas de
    linhas; cada linha é a lista dos textos das células. convert_charrefs
    resolve as entidades (&ecirc; etc.)."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tabelas: list[list[list[list[str]]]] = []
        self._pilha: list[list[list[list[str]]]] = []
        self._celula: list[str] | None = None

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self._pilha.append([])
        elif tag == "tr" and self._pilha:
            self._pilha[-1].append([])
        elif tag in ("td", "th") and self._pilha and self._pilha[-1]:
            self._celula = []
            self._pilha[-1][-1].append(self._celula)

    def handle_endtag(self, tag):
        if tag == "table" and self._pilha:
            self.tabelas.append(self._pilha.pop())
        elif tag in ("td", "th"):
            self._celula = None

    def handle_data(self, data):
        if self._celula is not None:
            self._celula.append(data)


def _texto(celula: list[str]) -> str:
    return " ".join("".join(celula).split())


def _sem_acento(s: str) -> str:
    s = unicodedata.normalize("NFD", s)
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def _norm_header(s: str) -> str:
    return re.sub(r"\d+", "", s).strip().lower()


def decodificar(conteudo: bytes) -> str:
    """UTF-8 (formato real observado) com fallback cp1252 (formato declarado
    historicamente pelo JSP). UTF-8 é autovalidante: texto cp1252 acentuado
    não decodifica como UTF-8, então a ordem é segura."""
    try:
        return conteudo.decode("utf-8")
    except UnicodeDecodeError:
        return conteudo.decode("windows-1252", errors="replace")


def parse_html_mensal(html: str, ano: int, mes: int) -> tuple[dict[str, tuple[float, float, float]], list[str]]:
    """HTML do relatório MENSAL → ({nome: (icms_liq, fundo_exp, ipva)}, ignoradas).

    ValueError se o layout divergiu (hard-stop); MesDivergente se a página é
    de outro mês. Linhas ilegíveis vão para `ignoradas` (nunca descartadas em
    silêncio)."""
    extrator = _ExtratorTabelas()
    extrator.feed(html)

    tabela, idx_header = None, None
    for t in extrator.tabelas:
        for i, linha in enumerate(t):
            if [_norm_header(_texto(c)) for c in linha] == CABECALHO_ESPERADO:
                tabela, idx_header = t, i
                break
        if tabela is not None:
            break
    if tabela is None:
        raise ValueError(
            f"PR {mes:02d}/{ano}: cabeçalho esperado não encontrado — layout mudou?")

    # "Referência: Junho/2024" fica nas linhas ANTES do cabeçalho
    texto_pre = " ".join(_texto(c) for linha in tabela[:idx_header] for c in linha)
    m = re.search(r"referencia:\s*([a-z]+)\s*/\s*(\d{4})", _sem_acento(texto_pre).lower())
    if not m:
        raise ValueError(
            f"PR {mes:02d}/{ano}: linha 'Referência: Mês/Ano' ausente — layout mudou?")
    esperado = _sem_acento(NOME_MESES[mes - 1]).lower()
    if (m.group(1), int(m.group(2))) != (esperado, ano):
        raise MesDivergente(f"página retornou referência {m.group(1)}/{m.group(2)}")

    sub = tabela[idx_header + 1] if idx_header + 1 < len(tabela) else []
    if [_norm_header(_texto(c)) for c in sub] != SUBCABECALHO_ESPERADO:
        raise ValueError(
            f"PR {mes:02d}/{ano}: sub-colunas do ICMS divergentes — layout mudou?")

    valores: dict[str, tuple[float, float, float]] = {}
    ignoradas: list[str] = []
    for linha in tabela[idx_header + 2:]:
        celulas = [_texto(c) for c in linha]
        if not celulas or not celulas[0]:
            continue
        if _sem_acento(celulas[0]).lower().startswith("total em"):
            continue  # linha-resumo final da página
        if len(celulas) != 8:
            ignoradas.append(celulas[0])
            continue
        # 0=nome 1=índice FPM 2=ICMS bruto 3=ICMS LÍQUIDO 4=Fundo Exportação
        # 5=Royalties (FORA — ver docstring) 6=IPVA 7=Total da página (não usado)
        icms = parse_valor_br(celulas[3])
        fundo = parse_valor_br(celulas[4])
        ipva = parse_valor_br(celulas[6])
        if icms is None or fundo is None or ipva is None:
            ignoradas.append(celulas[0])
            continue
        valores[celulas[0]] = (icms, fundo, ipva)
    return valores, ignoradas


# ── HTTP + execução (parte 2) ────────────────────────────────────────────────

def _get_retry(url: str) -> requests.Response:
    """GET com 1 retry, mas só em falha de rede (timeout/conexão) — o status
    HTTP de um servidor legado é determinístico, então re-tentar HTTPError só
    duplica tráfego sem chance de resultado diferente. HTTPError propaga
    direto, sem retry. verify=ca_bundle_gov(): superconjunto do certifi que
    fecha cadeias gov.br com intermediário faltando."""
    try:
        resp = requests.get(url, timeout=(30, 120),
                            headers={"User-Agent": "Mozilla/5.0"}, verify=ca_bundle_gov())
        resp.raise_for_status()
        return resp
    except requests.HTTPError:
        raise
    except requests.RequestException:
        resp = requests.get(url, timeout=(30, 120),
                            headers={"User-Agent": "Mozilla/5.0"}, verify=ca_bundle_gov())
        resp.raise_for_status()
        return resp


def _baixar_html(ano: int, mes: int) -> str:
    return decodificar(_get_retry(URL_MENSAL.format(ano=ano, mes=mes)).content)


def _upsert_mensal(db, regs: list[dict], resumo: ResumoIngestao, mids_ok: set) -> None:
    """Upsert-com-UPDATE por (municipio_id, ano, mes) no idioma REAL do
    conector MG (query dos existentes + setattr/add), commit por mês. Todos
    os regs de uma chamada são do MESMO (ano, mes)."""
    from app.models.arrecadacao import ArrecadacaoMensal

    if not regs:
        return
    mids = {r["municipio_id"] for r in regs}
    existentes = {
        (r.municipio_id, r.ano, r.mes): r
        for r in db.query(ArrecadacaoMensal).filter(
            ArrecadacaoMensal.municipio_id.in_(mids),
            ArrecadacaoMensal.ano == regs[0]["ano"],
            ArrecadacaoMensal.mes == regs[0]["mes"]).all()
    }
    for r in regs:
        reg = existentes.get((r["municipio_id"], r["ano"], r["mes"]))
        if reg:
            for coluna, valor in r.items():
                setattr(reg, coluna, valor)
        else:
            db.add(ArrecadacaoMensal(**r))
        resumo.linhas += 1
        mids_ok.add(r["municipio_id"])
    db.commit()


def executar_pr(db, municipios, anos=None, usuario_id=None, notificar=True, progresso=None) -> ResumoIngestao:
    """Conector PR. Janela default: últimas 36 competências (idioma das
    demais fontes mensais do repo — pix/estban); com `anos`, todos os meses
    desses anos, clampados pela competencias_janela entre INICIO_SERIE
    (2003-01) e o mês anterior. Backfill histórico = `anos` explícitos.
    `notificar` aceito e ignorado (a fonte arrecadação não tem regra de
    notificação)."""
    resumo = ResumoIngestao(dataset="arrecadacao")
    de_pr = [m for m in municipios if (m.estado or "").upper() == "PR"]
    fora = len(municipios) - len(de_pr)
    if fora:
        resumo.erros.append(
            f"conector PR cobre apenas municípios do PR — {fora} município(s) de outra UF ignorado(s)")
        resumo.municipios_erro += fora
    alvo = {norm_nome_municipio(m.nome): m.id for m in de_pr}
    if not alvo:
        return resumo

    competencias = competencias_janela(anos=anos, inicio=INICIO_SERIE, meses_default=36)
    mids_ok: set[int] = set()
    for i, (ano, mes) in enumerate(competencias):
        if progresso:
            progresso(i, len(competencias), f"repasses PR {mes:02d}/{ano}")
        try:
            html = _baixar_html(ano, mes)
        except requests.RequestException as exc:
            resumo.erros.append(
                f"{mes:02d}/{ano}: SEFA-PR indisponível ({exc}) — meses restantes abortados")
            break
        try:
            valores, ignoradas = parse_html_mensal(html, ano, mes)
        except MesDivergente as exc:
            resumo.erros.append(f"{mes:02d}/{ano}: ainda não publicado ({exc})")
            continue
        except ValueError as exc:
            resumo.erros.append(f"{exc} — nenhuma linha do mês gravada; meses restantes abortados")
            break
        if ignoradas:
            resumo.erros.append(
                f"{mes:02d}/{ano}: {len(ignoradas)} linha(s) ilegível(is) ignorada(s): "
                + ", ".join(sorted(ignoradas)[:5]))
        regs = []
        for nome, (icms, fundo, ipva) in valores.items():
            mid = alvo.get(norm_nome_municipio(nome))
            if mid is None:
                continue  # município do PR que não é alvo desta execução
            regs.append({
                "municipio_id": mid, "ano": ano, "mes": mes,
                "nome_mes": NOME_MESES[mes - 1], "data_base": date(ano, mes, 1),
                "valor_icms": icms, "valor_ipva": ipva, "valor_ipi": fundo,
                "valor_total": round(icms + ipva + fundo, 2),
            })
        _upsert_mensal(db, regs, resumo, mids_ok)

    resumo.municipios_ok = len(mids_ok)
    faltantes = set(alvo.values()) - mids_ok
    resumo.municipios_erro += len(faltantes)
    nomes = {m.id: f"{m.nome}/PR" for m in de_pr}
    for mid in sorted(faltantes):
        resumo.erros.append(
            f"{nomes.get(mid, mid)}: não encontrado nos repasses da SEFA-PR (grafia divergente?)")
    if progresso:
        progresso(len(competencias), len(competencias), "repasses PR gravados")
    return resumo
