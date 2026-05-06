import csv
from collections import defaultdict
from pathlib import Path

from sqlalchemy.orm import Session

from app.models.caged import CagedMovimentacao, CagedPorCnae, CagedPorRaca, CagedPorSexo, CagedSalario
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
        print(f"  ⚠️  caged.csv não encontrado em {cidade_dir} — pulando.")
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

    db.commit()
