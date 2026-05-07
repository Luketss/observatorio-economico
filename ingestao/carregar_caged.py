import csv
from collections import defaultdict
from pathlib import Path

from sqlalchemy.orm import Session

from app.models.caged import CagedMovimentacao, CagedPorCnae, CagedPorEscolaridade, CagedPorFaixaEtaria, CagedPorRaca, CagedPorSexo, CagedPorTipoMovimentacao, CagedSalario
from ingestao.utils import obter_ou_criar_municipio

SEXO_MAP = {
    "1": "Masculino",
    "2": "Feminino",
    "3": "Não informado",
    "9": "Não informado",
}

RACA_COR_MAP = {
    "1": "Branca",
    "2": "Preta",
    "3": "Parda",
    "4": "Amarela",
    "5": "Indígena",
    "6": "Não informada",
    "9": "Não informada",
}

GRAU_INSTRUCAO_MAP = {
    "1": "Analfabeto",
    "2": "Até 5ª incompleto",
    "3": "5ª completo fundamental",
    "4": "6ª a 9ª fundamental",
    "5": "Fund. completo",
    "6": "Médio incompleto",
    "7": "Médio completo",
    "8": "Superior incompleto",
    "9": "Superior completo",
    "10": "Mestrado",
    "11": "Doutorado",
}

TIPO_MOV_MAP = {
    "10": "Admissão — Primeiro Emprego",
    "20": "Admissão — Reemprego",
    "25": "Admissão — Transferência",
    "31": "Desligamento — A Pedido",
    "32": "Desligamento — Sem Justa Causa",
    "33": "Desligamento — Por Justa Causa",
    "40": "Desligamento — Transferência",
    "50": "Desligamento — Término de Contrato",
    "60": "Desligamento — Falecimento",
}


def _faixa_etaria(idade: int) -> str:
    if idade < 18:
        return "Até 17 anos"
    if idade < 25:
        return "18 a 24 anos"
    if idade < 30:
        return "25 a 29 anos"
    if idade < 40:
        return "30 a 39 anos"
    if idade < 50:
        return "40 a 49 anos"
    if idade < 65:
        return "50 a 64 anos"
    return "65 anos ou mais"


CNAE_SECAO_DESC = {
    "A": "Agricultura, Pecuária e Silvicultura",
    "B": "Indústrias Extrativas",
    "C": "Indústrias de Transformação",
    "D": "Eletricidade e Gás",
    "E": "Água, Esgoto e Resíduos",
    "F": "Construção",
    "G": "Comércio e Reparação de Veículos",
    "H": "Transporte e Armazenagem",
    "I": "Alojamento e Alimentação",
    "J": "Informação e Comunicação",
    "K": "Atividades Financeiras e de Seguros",
    "L": "Atividades Imobiliárias",
    "M": "Atividades Profissionais e Científicas",
    "N": "Atividades Administrativas",
    "O": "Administração Pública e Defesa",
    "P": "Educação",
    "Q": "Saúde Humana e Serviços Sociais",
    "R": "Artes, Cultura e Esporte",
    "S": "Outras Atividades de Serviços",
    "T": "Serviços Domésticos",
    "U": "Organismos Internacionais",
}


def carregar(cidade_dir: Path, city_name: str, estado: str, db: Session) -> None:
    caminho = cidade_dir / "caged.csv"
    if not caminho.exists():
        print(f"  [AVISO]  caged.csv não encontrado em {cidade_dir} — pulando.")
        return
    municipio = obter_ou_criar_municipio(db, city_name, estado)

    mensal: dict[tuple, dict] = defaultdict(
        lambda: {"admissoes": 0, "desligamentos": 0}
    )
    por_sexo: dict[tuple, dict] = defaultdict(
        lambda: {"admissoes": 0, "desligamentos": 0}
    )
    por_raca: dict[tuple, dict] = defaultdict(
        lambda: {"admissoes": 0, "desligamentos": 0}
    )
    salario_agg: dict[tuple, dict] = defaultdict(
        lambda: {"sum_adm": 0.0, "cnt_adm": 0, "sum_des": 0.0, "cnt_des": 0}
    )
    por_cnae: dict[tuple, dict] = defaultdict(
        lambda: {"admissoes": 0, "desligamentos": 0}
    )
    por_escolaridade: dict[tuple, dict] = defaultdict(
        lambda: {"admissoes": 0, "desligamentos": 0}
    )
    por_faixa_etaria: dict[tuple, dict] = defaultdict(
        lambda: {"admissoes": 0, "desligamentos": 0}
    )
    por_tipo_mov: dict[tuple, dict] = defaultdict(
        lambda: {"admissoes": 0, "desligamentos": 0}
    )

    with open(caminho, newline="", encoding="utf-8-sig") as csvfile:
        reader = csv.DictReader(csvfile, delimiter=";")
        for row in reader:
            ano = int(row["ano"])
            mes = int(row["mes"])
            saldo = int(row["saldo_movimentacao"])
            is_admission = saldo > 0
            chave_mes = (ano, mes)

            if is_admission:
                mensal[chave_mes]["admissoes"] += saldo
            else:
                mensal[chave_mes]["desligamentos"] += abs(saldo)

            sexo_raw = str(row.get("sexo", "")).strip()
            sexo_label = SEXO_MAP.get(sexo_raw, "Não informado")
            chave_sexo = (ano, mes, sexo_label)
            if is_admission:
                por_sexo[chave_sexo]["admissoes"] += saldo
            else:
                por_sexo[chave_sexo]["desligamentos"] += abs(saldo)

            raca_raw = str(row.get("raca_cor", "")).strip()
            raca_label = RACA_COR_MAP.get(raca_raw, "Não informada")
            chave_raca = (ano, mes, raca_label)
            if is_admission:
                por_raca[chave_raca]["admissoes"] += saldo
            else:
                por_raca[chave_raca]["desligamentos"] += abs(saldo)

            try:
                sal = float(row.get("salario_mensal", "") or 0)
            except (ValueError, TypeError):
                sal = 0.0
            if sal > 0:
                if is_admission:
                    salario_agg[chave_mes]["sum_adm"] += sal * saldo
                    salario_agg[chave_mes]["cnt_adm"] += saldo
                else:
                    salario_agg[chave_mes]["sum_des"] += sal * abs(saldo)
                    salario_agg[chave_mes]["cnt_des"] += abs(saldo)

            secao = str(row.get("cnae_2_secao", "")).strip().upper()
            if secao:
                desc = CNAE_SECAO_DESC.get(secao, secao)
                chave_cnae = (ano, mes, secao, desc)
                if is_admission:
                    por_cnae[chave_cnae]["admissoes"] += saldo
                else:
                    por_cnae[chave_cnae]["desligamentos"] += abs(saldo)

            grau_raw = str(row.get("grau_instrucao", "")).strip()
            grau_label = GRAU_INSTRUCAO_MAP.get(grau_raw, "Não informado")
            chave_grau = (ano, mes, grau_label)
            if is_admission:
                por_escolaridade[chave_grau]["admissoes"] += saldo
            else:
                por_escolaridade[chave_grau]["desligamentos"] += abs(saldo)

            try:
                idade_val = int(row.get("idade", 0) or 0)
            except (ValueError, TypeError):
                idade_val = 0
            faixa = _faixa_etaria(idade_val)
            chave_faixa = (ano, mes, faixa)
            if is_admission:
                por_faixa_etaria[chave_faixa]["admissoes"] += saldo
            else:
                por_faixa_etaria[chave_faixa]["desligamentos"] += abs(saldo)

            tipo_raw = str(row.get("tipo_movimentacao", "")).strip()
            tipo_label = TIPO_MOV_MAP.get(tipo_raw, f"Código {tipo_raw}" if tipo_raw else "Não informado")
            chave_tipo = (ano, mes, tipo_label)
            if is_admission:
                por_tipo_mov[chave_tipo]["admissoes"] += saldo
            else:
                por_tipo_mov[chave_tipo]["desligamentos"] += abs(saldo)

    for (ano, mes), totais in mensal.items():
        adm = totais["admissoes"]
        des = totais["desligamentos"]
        if db.query(CagedMovimentacao).filter(
            CagedMovimentacao.municipio_id == municipio.id,
            CagedMovimentacao.ano == ano,
            CagedMovimentacao.mes == mes,
        ).first():
            continue
        db.add(CagedMovimentacao(
            municipio_id=municipio.id, ano=ano, mes=mes,
            admissoes=adm, desligamentos=des, saldo=adm - des,
        ))

    for (ano, mes, sexo_label), totais in por_sexo.items():
        adm = totais["admissoes"]
        des = totais["desligamentos"]
        if db.query(CagedPorSexo).filter(
            CagedPorSexo.municipio_id == municipio.id,
            CagedPorSexo.ano == ano,
            CagedPorSexo.mes == mes,
            CagedPorSexo.sexo == sexo_label,
        ).first():
            continue
        db.add(CagedPorSexo(
            municipio_id=municipio.id, ano=ano, mes=mes,
            sexo=sexo_label, admissoes=adm, desligamentos=des, saldo=adm - des,
        ))

    for (ano, mes, raca_label), totais in por_raca.items():
        adm = totais["admissoes"]
        des = totais["desligamentos"]
        if db.query(CagedPorRaca).filter(
            CagedPorRaca.municipio_id == municipio.id,
            CagedPorRaca.ano == ano,
            CagedPorRaca.mes == mes,
            CagedPorRaca.raca_cor == raca_label,
        ).first():
            continue
        db.add(CagedPorRaca(
            municipio_id=municipio.id, ano=ano, mes=mes,
            raca_cor=raca_label, admissoes=adm, desligamentos=des, saldo=adm - des,
        ))

    for (ano, mes), agg in salario_agg.items():
        sal_adm = agg["sum_adm"] / agg["cnt_adm"] if agg["cnt_adm"] > 0 else None
        sal_des = agg["sum_des"] / agg["cnt_des"] if agg["cnt_des"] > 0 else None
        if db.query(CagedSalario).filter(
            CagedSalario.municipio_id == municipio.id,
            CagedSalario.ano == ano,
            CagedSalario.mes == mes,
        ).first():
            continue
        db.add(CagedSalario(
            municipio_id=municipio.id, ano=ano, mes=mes,
            salario_medio_admissoes=sal_adm, salario_medio_desligamentos=sal_des,
        ))

    for (ano, mes, secao, desc), totais in por_cnae.items():
        adm = totais["admissoes"]
        des = totais["desligamentos"]
        if db.query(CagedPorCnae).filter(
            CagedPorCnae.municipio_id == municipio.id,
            CagedPorCnae.ano == ano,
            CagedPorCnae.mes == mes,
            CagedPorCnae.secao == secao,
        ).first():
            continue
        db.add(CagedPorCnae(
            municipio_id=municipio.id, ano=ano, mes=mes,
            secao=secao, descricao_secao=desc,
            admissoes=adm, desligamentos=des, saldo=adm - des,
        ))

    for (ano, mes, grau), totais in por_escolaridade.items():
        adm = totais["admissoes"]
        des = totais["desligamentos"]
        if db.query(CagedPorEscolaridade).filter(
            CagedPorEscolaridade.municipio_id == municipio.id,
            CagedPorEscolaridade.ano == ano,
            CagedPorEscolaridade.mes == mes,
            CagedPorEscolaridade.grau_instrucao == grau,
        ).first():
            continue
        db.add(CagedPorEscolaridade(
            municipio_id=municipio.id, ano=ano, mes=mes,
            grau_instrucao=grau, admissoes=adm, desligamentos=des, saldo=adm - des,
        ))

    for (ano, mes, faixa), totais in por_faixa_etaria.items():
        adm = totais["admissoes"]
        des = totais["desligamentos"]
        if db.query(CagedPorFaixaEtaria).filter(
            CagedPorFaixaEtaria.municipio_id == municipio.id,
            CagedPorFaixaEtaria.ano == ano,
            CagedPorFaixaEtaria.mes == mes,
            CagedPorFaixaEtaria.faixa_etaria == faixa,
        ).first():
            continue
        db.add(CagedPorFaixaEtaria(
            municipio_id=municipio.id, ano=ano, mes=mes,
            faixa_etaria=faixa, admissoes=adm, desligamentos=des, saldo=adm - des,
        ))

    for (ano, mes, tipo), totais in por_tipo_mov.items():
        adm = totais["admissoes"]
        des = totais["desligamentos"]
        if db.query(CagedPorTipoMovimentacao).filter(
            CagedPorTipoMovimentacao.municipio_id == municipio.id,
            CagedPorTipoMovimentacao.ano == ano,
            CagedPorTipoMovimentacao.mes == mes,
            CagedPorTipoMovimentacao.tipo_movimentacao == tipo,
        ).first():
            continue
        db.add(CagedPorTipoMovimentacao(
            municipio_id=municipio.id, ano=ano, mes=mes,
            tipo_movimentacao=tipo, admissoes=adm, desligamentos=des, saldo=adm - des,
        ))

    db.commit()
