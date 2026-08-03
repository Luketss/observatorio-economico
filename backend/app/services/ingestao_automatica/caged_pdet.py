"""Fonte automática: Novo CAGED por município (microdados PDET/MTE, FTP).

Metodologia "com ajustes": saldo do mês M = MOV(M) + FOR(competência M)
− EXC(competência M). EXC entra com sinal -1 no MESMO lado da movimentação
original (admissão excluída decrementa admissões — não vira desligamento).
Arquivos FOR/EXC de um mês carregam competências antigas, por isso são
filtrados por `competencias_alvo`. Mapas código→rótulo seguem o layout
OFICIAL do Novo CAGED (xlsx no FTP) — a codificação difere do CAGED antigo
usado nos CSVs manuais (sexo 1/3, tamestabjan deslocado, tipomovimentação).
Rótulos mantêm as strings já existentes no banco quando o conceito coincide.

REGRA GERAL: nenhum descarte silencioso — todo dado da origem entra em algum
recorte com rótulo. Códigos não mapeados recebem fallback: `f"Código {raw}"`
se inédito, `"Não informado"` se vazio.

EXCEÇÕES DELIBERADAS (não sofrem fallback):
- `por_tipo_def` (PCD): apenas códigos em TIPO_DEFICIENCIA_MAP (1–6) entram
  no recorte e no indicador pcd (0, 9 = "Não Identificado" ficam fora).
- `salario`: só média valores > 0 (desligados sem renda = ignorados).

ESCALA: execução Brasil-inteiro mantém agregados de todos os municípios em
memória — usar com parcimônia até existir o worker separado (RAIS/CNPJ).
"""
import contextlib
import csv
import ftplib
import os
import tempfile
from datetime import date
from ftplib import FTP

import py7zr
from sqlalchemy import tuple_

from app.services.ingestao_automatica.base import FonteAutomatica, ResumoIngestao, registrar
from app.services.ingestao_automatica.util import competencias_janela, parse_valor_br
from ingestao.carregar_caged import CNAE_SECAO_DESC, _faixa_etaria

SEXO_MAP = {"1": "Masculino", "3": "Feminino"}

RACA_COR_MAP = {
    "1": "Branca", "2": "Preta", "3": "Parda", "4": "Amarela",
    "5": "Indígena", "6": "Não informada",
}

GRAU_INSTRUCAO_MAP = {
    "1": "Analfabeto", "2": "Até 5ª incompleto", "3": "5ª completo fundamental",
    "4": "6ª a 9ª fundamental", "5": "Fund. completo", "6": "Médio incompleto",
    "7": "Médio completo", "8": "Superior incompleto", "9": "Superior completo",
    "10": "Mestrado", "11": "Doutorado", "80": "Pós-graduação completa",
}

TIPO_MOV_MAP = {
    "10": "Admissão por primeiro emprego",
    "20": "Admissão por reemprego",
    "25": "Admissão por contrato trabalho prazo determinado",
    "31": "Desligamento por demissão sem justa causa",
    "32": "Desligamento por demissão com justa causa",
    "33": "Culpa recíproca",
    "35": "Admissão por reintegração",
    "40": "Desligamento a pedido",
    "43": "Término contrato trabalho prazo determinado",
    "45": "Desligamento por término de contrato",
    "50": "Desligamento por aposentadoria",
    "60": "Desligamento por morte",
    "70": "Admissão por transferência",
    "80": "Desligamento por transferência",
    "90": "Desligamento por acordo entre empregado e empregador",
    "97": "Admissão de tipo ignorado",
    "98": "Desligamento de tipo ignorado",
}

TIPO_DEFICIENCIA_MAP = {
    "1": "Física", "2": "Auditiva", "3": "Visual",
    "4": "Mental / Intelectual", "5": "Múltipla", "6": "Reabilitado",
}

TAMANHO_ESTAB_MAP = {
    "1": "Zero", "2": "1 a 4", "3": "5 a 9", "4": "10 a 19", "5": "20 a 49",
    "6": "50 a 99", "7": "100 a 249", "8": "250 a 499", "9": "500 a 999",
    "10": "1000 ou mais", "90": "Não informado", "97": "Não se aplica",
    "98": "Inválido", "99": "Ignorado",
}

TIPO_EMPREGADOR_MAP = {"0": "CNPJ raiz", "2": "CPF", "9": "Não informado"}

TIPO_ESTABELECIMENTO_MAP = {
    "1": "CNPJ", "3": "CAEPF (pessoa física)", "4": "CNO (obra)",
    "5": "CEI (CAGED)", "9": "Não informado",
}

_COLUNAS = (
    "competênciamov", "município", "seção", "saldomovimentação",
    "graudeinstrução", "idade", "raçacor", "sexo", "tipoempregador",
    "tipoestabelecimento", "tipomovimentação", "tipodedeficiência",
    "indtrabintermitente", "indtrabparcial", "salário", "tamestabjan",
    "indicadoraprendiz", "indicadordeforadoprazo",
)

_CHAVES_AGG = (
    "mensal", "por_sexo", "por_raca", "salario", "por_cnae",
    "por_escolaridade", "por_faixa_etaria", "por_tipo_mov", "por_tipo_def",
    "por_tamanho", "por_tipo_emp", "por_tipo_estab", "indicadores",
)


def novo_agregados() -> dict:
    return {k: {} for k in _CHAVES_AGG}


def _soma(d: dict, chave, lado: str, inc: int) -> None:
    item = d.setdefault(chave, {"admissoes": 0, "desligamentos": 0})
    item[lado] += inc


def agregar_arquivo(linhas, ibge6_para_mid, competencias_alvo, agg, sinal: int = 1) -> int:
    """Agrega um arquivo (MOV/FOR com sinal=+1; EXC com sinal=-1) em `agg`.
    `linhas` = iterável de linhas de texto (header incluso). Retorna quantas
    linhas entraram na agregação."""
    reader = csv.reader(linhas, delimiter=";")
    header = next(reader, None)
    if header is None:
        raise ValueError("CAGED: arquivo vazio")
    idx = {c.strip(): i for i, c in enumerate(header)}
    faltando = [c for c in _COLUNAS if c not in idx]
    if faltando:
        raise ValueError(f"CAGED: colunas ausentes {faltando} — layout mudou?")

    def col(row, nome):
        return row[idx[nome]].strip()

    agregadas = 0
    for row in reader:
        try:
            mid = ibge6_para_mid.get(col(row, "município"))
            if mid is None:
                continue
            comp = col(row, "competênciamov")
            ano, mes = int(comp[:4]), int(comp[4:6])
            if (ano, mes) not in competencias_alvo:
                continue
            saldo = int(col(row, "saldomovimentação"))
        except (IndexError, ValueError):
            continue
        lado = "admissoes" if saldo > 0 else "desligamentos"
        inc = sinal * abs(saldo)
        agregadas += 1

        _soma(agg["mensal"], (mid, ano, mes), lado, inc)
        _soma(agg["por_sexo"], (mid, ano, mes, SEXO_MAP.get(col(row, "sexo"), "Não informado")), lado, inc)
        _soma(agg["por_raca"], (mid, ano, mes, RACA_COR_MAP.get(col(row, "raçacor"), "Não informada")), lado, inc)
        _soma(agg["por_escolaridade"], (mid, ano, mes, GRAU_INSTRUCAO_MAP.get(col(row, "graudeinstrução"), "Não informado")), lado, inc)

        secao = col(row, "seção").upper()
        secao_label = (CNAE_SECAO_DESC.get(secao, secao) if secao else "Não informada")[:150]
        secao_chave = (secao or "?")[:5]
        _soma(agg["por_cnae"], (mid, ano, mes, secao_chave, secao_label), lado, inc)

        try:
            idade = int(col(row, "idade") or 0)
        except ValueError:
            idade = 0
        _soma(agg["por_faixa_etaria"], (mid, ano, mes, _faixa_etaria(idade)), lado, inc)

        tipo_mov = col(row, "tipomovimentação")
        rotulo_mov = TIPO_MOV_MAP.get(tipo_mov, f"Código {tipo_mov}" if tipo_mov else "Não informado")[:80]
        _soma(agg["por_tipo_mov"], (mid, ano, mes, rotulo_mov), lado, inc)

        tipo_def = col(row, "tipodedeficiência")
        eh_pcd = tipo_def in TIPO_DEFICIENCIA_MAP
        if eh_pcd:
            _soma(agg["por_tipo_def"], (mid, ano, mes, TIPO_DEFICIENCIA_MAP[tipo_def]), lado, inc)

        raw_tam = col(row, "tamestabjan")
        tam = (TAMANHO_ESTAB_MAP.get(raw_tam) or (f"Código {raw_tam}" if raw_tam else "Não informado"))[:60]
        _soma(agg["por_tamanho"], (mid, ano, mes, tam), lado, inc)
        raw_emp = col(row, "tipoempregador")
        emp = (TIPO_EMPREGADOR_MAP.get(raw_emp) or (f"Código {raw_emp}" if raw_emp else "Não informado"))[:80]
        _soma(agg["por_tipo_emp"], (mid, ano, mes, emp), lado, inc)
        raw_estab = col(row, "tipoestabelecimento")
        estab = (TIPO_ESTABELECIMENTO_MAP.get(raw_estab) or (f"Código {raw_estab}" if raw_estab else "Não informado"))[:80]
        _soma(agg["por_tipo_estab"], (mid, ano, mes, estab), lado, inc)

        sal = parse_valor_br(col(row, "salário")) or 0.0
        if sal > 0:
            s = agg["salario"].setdefault((mid, ano, mes), {"sum_adm": 0.0, "cnt_adm": 0, "sum_des": 0.0, "cnt_des": 0})
            if saldo > 0:
                s["sum_adm"] += sinal * sal * abs(saldo)
                s["cnt_adm"] += inc
            else:
                s["sum_des"] += sinal * sal * abs(saldo)
                s["cnt_des"] += inc

        ind = agg["indicadores"].setdefault((mid, ano), {
            "total": 0, "parcial": 0, "intermitente": 0,
            "aprendiz": 0, "pcd": 0, "fora_prazo": 0,
        })
        ind["total"] += inc
        if col(row, "indtrabparcial") == "1":
            ind["parcial"] += inc
        if col(row, "indtrabintermitente") == "1":
            ind["intermitente"] += inc
        if col(row, "indicadoraprendiz") == "1":
            ind["aprendiz"] += inc
        if eh_pcd:
            ind["pcd"] += inc
        if col(row, "indicadordeforadoprazo") == "1":
            ind["fora_prazo"] += inc
    return agregadas


def anos_completos(meses_ok: set, ultimo_publicado: tuple) -> list:
    """Anos cujo total anual pode ser recomputado: todos os meses publicados
    do ano (jan..dez, ou jan..último publicado para o ano corrente) foram
    processados com sucesso nesta execução. Ano parcial preserva o valor
    existente em caged_indicadores_contrato."""
    anos = sorted({a for (a, _m) in meses_ok})
    completos = []
    for ano in anos:
        fim = ultimo_publicado[1] if ano == ultimo_publicado[0] else 12
        if all((ano, m) in meses_ok for m in range(1, fim + 1)):
            completos.append(ano)
    return completos


def meses_forexc(competencias: list, hoje) -> list:
    """FOR/EXC precisam ir do início da janela até o mês anterior a `hoje`:
    exclusões/atrasos de uma competência antiga aparecem em arquivos de
    meses posteriores (validado: linhas de 202001 no EXC de 202606)."""
    ano, mes = min(competencias)
    fim = (hoje.year, hoje.month - 1) if hoje.month > 1 else (hoje.year - 1, 12)
    out = []
    while (ano, mes) <= fim:
        out.append((ano, mes))
        ano, mes = (ano, mes + 1) if mes < 12 else (ano + 1, 1)
    return out


FTP_HOST = "ftp.mtps.gov.br"
FTP_DIR = "/pdet/microdados/NOVO CAGED/{ano}/{ano}{mes:02d}"


def conectar_ftp() -> FTP:
    ftp = FTP(FTP_HOST, timeout=120)
    ftp.login()
    ftp.encoding = "latin-1"  # caminhos do PDET têm acento
    return ftp


def baixar_e_extrair(ftp, tipo: str, ano: int, mes: int, destino_dir: str) -> str | None:
    """RETR do CAGED{tipo}{AAAAMM}.7z para disco + extractall (py7zr 1.1 não
    lê em memória). 550 = competência não publicada → None (aviso, não erro).
    O .7z é removido em todos os caminhos (sucesso, 550, falha de extração)."""
    nome = f"CAGED{tipo}{ano}{mes:02d}"
    remoto = f"{FTP_DIR.format(ano=ano, mes=mes)}/{nome}.7z"
    caminho_7z = os.path.join(destino_dir, f"{nome}.7z")
    try:
        with open(caminho_7z, "wb") as f:
            ftp.retrbinary(f"RETR {remoto}", f.write)
        with py7zr.SevenZipFile(caminho_7z) as z:
            nomes = z.getnames()
            z.extractall(destino_dir)
    except ftplib.error_perm as exc:
        if str(exc).startswith("550"):
            return None
        raise
    finally:
        if os.path.exists(caminho_7z):
            os.remove(caminho_7z)
    return os.path.join(destino_dir, nomes[0])


NAO_PUBLICADO = "nao_publicado"


def baixar_tolerante(ftp, tipo: str, ano: int, mes: int, destino_dir: str):
    """baixar_e_extrair com UMA reconexão em falha transitória de rede.
    Retorna (ftp, caminho, erro): caminho None quando não baixou; erro None
    no sucesso, NAO_PUBLICADO (550) ou a mensagem da falha de rede. O ftp
    retornado pode ser conexão nova — ou None quando nem a reconexão foi
    possível; passar None de volta faz a próxima chamada reconectar."""
    try:
        if ftp is None:
            ftp = conectar_ftp()
        caminho = baixar_e_extrair(ftp, tipo, ano, mes, destino_dir)
        return ftp, caminho, (None if caminho else NAO_PUBLICADO)
    except ftplib.all_errors:
        with contextlib.suppress(Exception):
            if ftp is not None:
                ftp.close()
        try:
            ftp = conectar_ftp()
            caminho = baixar_e_extrair(ftp, tipo, ano, mes, destino_dir)
            return ftp, caminho, (None if caminho else NAO_PUBLICADO)
        except ftplib.all_errors as exc:
            return None, None, f"{type(exc).__name__}: {exc}"


def executar(db, municipios, anos=None, usuario_id=None, notificar=True, progresso=None) -> ResumoIngestao:
    from app.models.caged import (
        CagedIndicadoresContrato, CagedMovimentacao, CagedPorCnae,
        CagedPorEscolaridade, CagedPorFaixaEtaria, CagedPorRaca, CagedPorSexo,
        CagedPorTamanhoEstabelecimento, CagedPorTipoDeficiencia,
        CagedPorTipoEmpregador, CagedPorTipoEstabelecimento,
        CagedPorTipoMovimentacao, CagedSalario,
    )
    from app.services.ingestao_automatica.populacao_ibge import codigo_ibge_valido

    resumo = ResumoIngestao(dataset="caged")
    alvo: dict[str, int] = {}
    for m in municipios:
        if codigo_ibge_valido(m.codigo_ibge):
            alvo[m.codigo_ibge.strip()[:6]] = m.id
        else:
            resumo.municipios_erro += 1
            resumo.erros.append(f"{m.nome}/{m.estado}: codigo_ibge ausente/inválido")
    if not alvo:
        return resumo

    competencias = competencias_janela(anos, inicio=(2020, 1))
    if not competencias:
        resumo.erros.append("CAGED: nenhuma competência na janela (fonte começa em 2020-01)")
        return resumo

    agg = novo_agregados()
    meses_ok: set[tuple[int, int]] = set()
    total_meses = len(competencias)

    # Fase 1 — MOV mês a mês (pesado): baixa, extrai, agrega, apaga.
    ftp = conectar_ftp()
    try:
        for i, (ano, mes) in enumerate(competencias, start=1):
            if progresso:
                progresso(i - 1, total_meses, f"MOV {ano}-{mes:02d}: baixando")
            with tempfile.TemporaryDirectory(prefix="caged_") as tmp:
                ftp, caminho, erro = baixar_tolerante(ftp, "MOV", ano, mes, tmp)
                if caminho is None:
                    if erro == NAO_PUBLICADO:
                        resumo.erros.append(
                            f"CAGED {ano}-{mes:02d}: competência ainda não publicada — mês pulado"
                        )
                    else:
                        resumo.erros.append(
                            f"CAGED MOV {ano}-{mes:02d}: falha de rede ({erro}) — mês pulado, dados existentes preservados"
                        )
                    continue
                if progresso:
                    progresso(i, total_meses, f"MOV {ano}-{mes:02d}: agregando")
                with open(caminho, newline="", encoding="utf-8-sig") as f:
                    agregar_arquivo(f, alvo, {(ano, mes)}, agg, sinal=1)
            meses_ok.add((ano, mes))

        if not meses_ok:
            return resumo

        # Fase 2 — FOR (+1) e EXC (−1): pequenos, cobrem exclusões/atrasos
        # publicados DEPOIS da competência; filtrados aos meses com MOV ok.
        for j, (ano, mes) in enumerate(meses_forexc(competencias, date.today()), start=1):
            if progresso:
                progresso(total_meses, total_meses, f"ajustes {ano}-{mes:02d} (FOR/EXC)")
            for tipo, sinal in (("FOR", 1), ("EXC", -1)):
                with tempfile.TemporaryDirectory(prefix="caged_") as tmp:
                    ftp, caminho, erro = baixar_tolerante(ftp, tipo, ano, mes, tmp)
                    if caminho is None:
                        if erro != NAO_PUBLICADO:
                            resumo.erros.append(
                                f"CAGED {tipo} {ano}-{mes:02d}: falha de rede ({erro}) — ajuste pulado"
                            )
                        continue  # 550 = ajuste do mês ainda não publicado — normal
                    with open(caminho, newline="", encoding="utf-8-sig") as f:
                        agregar_arquivo(f, alvo, meses_ok, agg, sinal=sinal)
    finally:
        if ftp is not None:
            try:
                ftp.quit()
            except Exception:  # noqa: BLE001 — conexão pode já ter caído
                ftp.close()

    ultimo_publicado = max(meses_ok)
    anos_ind = anos_completos(meses_ok, ultimo_publicado)
    for ano in sorted({a for (a, _m) in meses_ok if a not in anos_ind}):
        resumo.erros.append(
            f"CAGED {ano}: indicadores anuais preservados (janela não cobre o ano inteiro)"
        )

    # Fase 3 — REPLACE por (município, mês) nas 12 tabelas mensais.
    def _linhas(d):
        # d: chave (mid, ano, mes, *extras) → {"admissoes","desligamentos"}
        for chave, tot in d.items():
            yield chave, {
                "admissoes": tot["admissoes"], "desligamentos": tot["desligamentos"],
                "saldo": tot["admissoes"] - tot["desligamentos"],
            }

    mensais = [
        (CagedMovimentacao, agg["mensal"], ()),
        (CagedPorSexo, agg["por_sexo"], ("sexo",)),
        (CagedPorRaca, agg["por_raca"], ("raca_cor",)),
        (CagedPorEscolaridade, agg["por_escolaridade"], ("grau_instrucao",)),
        (CagedPorFaixaEtaria, agg["por_faixa_etaria"], ("faixa_etaria",)),
        (CagedPorTipoMovimentacao, agg["por_tipo_mov"], ("tipo_movimentacao",)),
        (CagedPorTipoDeficiencia, agg["por_tipo_def"], ("tipo_deficiencia",)),
        (CagedPorTamanhoEstabelecimento, agg["por_tamanho"], ("tamanho",)),
        (CagedPorTipoEmpregador, agg["por_tipo_emp"], ("tipo_empregador",)),
        (CagedPorTipoEstabelecimento, agg["por_tipo_estab"], ("tipo_estabelecimento",)),
    ]

    todos_mids = sorted(set(alvo.values()))
    meses_lista = sorted(meses_ok)
    for i, mid in enumerate(todos_mids, start=1):
        if progresso:
            progresso(i, len(todos_mids), "gravando municípios")
        for model, _dados, _extras in mensais + [(CagedPorCnae, None, None), (CagedSalario, None, None)]:
            db.query(model).filter(
                model.municipio_id == mid,
                tuple_(model.ano, model.mes).in_(meses_lista),
            ).delete(synchronize_session=False)

        for model, dados, extras in mensais:
            for chave, valores in _linhas(dados):
                if chave[0] != mid:
                    continue
                extra_vals = dict(zip(extras, chave[3:]))
                db.add(model(municipio_id=mid, ano=chave[1], mes=chave[2], **extra_vals, **valores))
                resumo.linhas += 1

        for (m_id, ano, mes, secao, desc), tot in agg["por_cnae"].items():
            if m_id != mid:
                continue
            db.add(CagedPorCnae(
                municipio_id=mid, ano=ano, mes=mes, secao=secao, descricao_secao=desc,
                admissoes=tot["admissoes"], desligamentos=tot["desligamentos"],
                saldo=tot["admissoes"] - tot["desligamentos"],
            ))
            resumo.linhas += 1

        for (m_id, ano, mes), s in agg["salario"].items():
            if m_id != mid:
                continue
            db.add(CagedSalario(
                municipio_id=mid, ano=ano, mes=mes,
                salario_medio_admissoes=(s["sum_adm"] / s["cnt_adm"]) if s["cnt_adm"] > 0 else None,
                salario_medio_desligamentos=(s["sum_des"] / s["cnt_des"]) if s["cnt_des"] > 0 else None,
            ))
            resumo.linhas += 1

        if anos_ind:
            db.query(CagedIndicadoresContrato).filter(
                CagedIndicadoresContrato.municipio_id == mid,
                CagedIndicadoresContrato.ano.in_(anos_ind),
            ).delete(synchronize_session=False)
            for (m_id, ano), ind in agg["indicadores"].items():
                if m_id != mid or ano not in anos_ind:
                    continue
                db.add(CagedIndicadoresContrato(
                    municipio_id=mid, ano=ano,
                    total_movimentacoes=ind["total"], total_parcial=ind["parcial"],
                    total_intermitente=ind["intermitente"], total_aprendiz=ind["aprendiz"],
                    total_pcd=ind["pcd"], total_fora_prazo=ind["fora_prazo"],
                ))
                resumo.linhas += 1

        db.commit()
        resumo.municipios_ok += 1
        # município sem linha = sem movimentação formal (zero é dado, não erro)
    return resumo


registrar(FonteAutomatica(
    key="caged",
    label="Emprego formal (Novo CAGED/MTE)",
    fonte="MTE — Novo CAGED, microdados de movimentações (PDET/FTP), com ajustes",
    executar=executar,
))
