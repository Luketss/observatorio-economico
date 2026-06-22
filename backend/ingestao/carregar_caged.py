import csv
from collections import defaultdict
from pathlib import Path

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models.caged import (
    CagedMovimentacao, CagedPorCnae, CagedPorEscolaridade, CagedPorFaixaEtaria,
    CagedPorRaca, CagedPorSexo, CagedPorTipoMovimentacao, CagedSalario,
    CagedPorTipoDeficiencia, CagedPorTamanhoEstabelecimento,
    CagedPorTipoEmpregador, CagedPorTipoEstabelecimento, CagedIndicadoresContrato,
)
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

TIPO_DEFICIENCIA_MAP = {
    "1": "Física",
    "2": "Auditiva",
    "3": "Visual",
    "4": "Mental / Intelectual",
    "5": "Múltipla",
    "6": "Reabilitado",
}

TAMANHO_ESTAB_MAP = {
    "1": "Até 4 vínculos",
    "2": "5 a 9",
    "3": "10 a 19",
    "4": "20 a 49",
    "5": "50 a 99",
    "6": "100 a 249",
    "7": "250 a 499",
    "8": "500 a 999",
    "9": "1000 ou mais",
    "0": "Zero / não classificado",
}

TIPO_EMPREGADOR_MAP = {
    "0": "CNPJ",
    "1": "CPF",
    "2": "Particular",
    "3": "Empregador rural CEI / CNO",
}

TIPO_ESTABELECIMENTO_MAP = {
    "1": "Privado / não-doméstico",
    "2": "Público",
    "3": "Doméstico",
    "4": "Empresa pública / sociedade de economia mista",
    "5": "Outro",
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


def _upsert(db: Session, model, rows: list[dict], conflict_cols: list[str]) -> None:
    if not rows:
        return
    stmt = pg_insert(model).values(rows)
    stmt = stmt.on_conflict_do_nothing(index_elements=conflict_cols)
    db.execute(stmt)


def carregar(cidade_dir: Path, city_name: str, estado: str, db: Session) -> None:
    caminho = cidade_dir / "caged.csv"
    if not caminho.exists():
        print(f"  [AVISO]  caged.csv não encontrado em {cidade_dir} — pulando.")
        return
    municipio = obter_ou_criar_municipio(db, city_name, estado)

    mensal: dict[tuple, dict] = defaultdict(lambda: {"admissoes": 0, "desligamentos": 0})
    por_sexo: dict[tuple, dict] = defaultdict(lambda: {"admissoes": 0, "desligamentos": 0})
    por_raca: dict[tuple, dict] = defaultdict(lambda: {"admissoes": 0, "desligamentos": 0})
    salario_agg: dict[tuple, dict] = defaultdict(
        lambda: {"sum_adm": 0.0, "cnt_adm": 0, "sum_des": 0.0, "cnt_des": 0}
    )
    por_cnae: dict[tuple, dict] = defaultdict(lambda: {"admissoes": 0, "desligamentos": 0})
    por_escolaridade: dict[tuple, dict] = defaultdict(lambda: {"admissoes": 0, "desligamentos": 0})
    por_faixa_etaria: dict[tuple, dict] = defaultdict(lambda: {"admissoes": 0, "desligamentos": 0})
    por_tipo_mov: dict[tuple, dict] = defaultdict(lambda: {"admissoes": 0, "desligamentos": 0})
    por_tipo_def: dict[tuple, dict] = defaultdict(lambda: {"admissoes": 0, "desligamentos": 0})
    por_tamanho: dict[tuple, dict] = defaultdict(lambda: {"admissoes": 0, "desligamentos": 0})
    por_tipo_emp: dict[tuple, dict] = defaultdict(lambda: {"admissoes": 0, "desligamentos": 0})
    por_tipo_estab: dict[tuple, dict] = defaultdict(lambda: {"admissoes": 0, "desligamentos": 0})
    indicadores: dict[int, dict] = defaultdict(lambda: {
        "total": 0, "parcial": 0, "intermitente": 0,
        "aprendiz": 0, "pcd": 0, "fora_prazo": 0,
    })

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

            def_raw = str(row.get("tipo_deficiencia", "") or "").strip()
            if def_raw and def_raw != "0":
                def_label = TIPO_DEFICIENCIA_MAP.get(def_raw, "Outras")
                chave_def = (ano, mes, def_label)
                if is_admission:
                    por_tipo_def[chave_def]["admissoes"] += saldo
                else:
                    por_tipo_def[chave_def]["desligamentos"] += abs(saldo)
                indicadores[ano]["pcd"] += abs(saldo)

            tam_raw = str(row.get("tamanho_estabelecimento_janeiro", "") or "").strip()
            tam_label = TAMANHO_ESTAB_MAP.get(tam_raw)
            if tam_label:
                chave_tam = (ano, mes, tam_label)
                if is_admission:
                    por_tamanho[chave_tam]["admissoes"] += saldo
                else:
                    por_tamanho[chave_tam]["desligamentos"] += abs(saldo)

            emp_raw = str(row.get("tipo_empregador", "") or "").strip()
            emp_label = TIPO_EMPREGADOR_MAP.get(emp_raw)
            if emp_label:
                chave_emp = (ano, mes, emp_label)
                if is_admission:
                    por_tipo_emp[chave_emp]["admissoes"] += saldo
                else:
                    por_tipo_emp[chave_emp]["desligamentos"] += abs(saldo)

            te_raw = str(row.get("tipo_estabelecimento", "") or "").strip()
            te_label = TIPO_ESTABELECIMENTO_MAP.get(te_raw)
            if te_label:
                chave_te = (ano, mes, te_label)
                if is_admission:
                    por_tipo_estab[chave_te]["admissoes"] += saldo
                else:
                    por_tipo_estab[chave_te]["desligamentos"] += abs(saldo)

            move_count = abs(saldo)
            indicadores[ano]["total"] += move_count
            if str(row.get("indicador_trabalho_parcial", "") or "").strip() == "1":
                indicadores[ano]["parcial"] += move_count
            if str(row.get("indicador_trabalho_intermitente", "") or "").strip() == "1":
                indicadores[ano]["intermitente"] += move_count
            if str(row.get("indicador_aprendiz", "") or "").strip() == "1":
                indicadores[ano]["aprendiz"] += move_count
            if str(row.get("indicador_fora_prazo", "") or "").strip() == "1":
                indicadores[ano]["fora_prazo"] += move_count

    mid = municipio.id
    _upsert(db, CagedMovimentacao, [
        {"municipio_id": mid, "ano": ano, "mes": mes,
         "admissoes": t["admissoes"], "desligamentos": t["desligamentos"],
         "saldo": t["admissoes"] - t["desligamentos"]}
        for (ano, mes), t in mensal.items()
    ], ["municipio_id", "ano", "mes"])

    _upsert(db, CagedPorSexo, [
        {"municipio_id": mid, "ano": ano, "mes": mes, "sexo": sexo,
         "admissoes": t["admissoes"], "desligamentos": t["desligamentos"],
         "saldo": t["admissoes"] - t["desligamentos"]}
        for (ano, mes, sexo), t in por_sexo.items()
    ], ["municipio_id", "ano", "mes", "sexo"])

    _upsert(db, CagedPorRaca, [
        {"municipio_id": mid, "ano": ano, "mes": mes, "raca_cor": raca,
         "admissoes": t["admissoes"], "desligamentos": t["desligamentos"],
         "saldo": t["admissoes"] - t["desligamentos"]}
        for (ano, mes, raca), t in por_raca.items()
    ], ["municipio_id", "ano", "mes", "raca_cor"])

    _upsert(db, CagedSalario, [
        {"municipio_id": mid, "ano": ano, "mes": mes,
         "salario_medio_admissoes": (agg["sum_adm"] / agg["cnt_adm"]) if agg["cnt_adm"] > 0 else None,
         "salario_medio_desligamentos": (agg["sum_des"] / agg["cnt_des"]) if agg["cnt_des"] > 0 else None}
        for (ano, mes), agg in salario_agg.items()
    ], ["municipio_id", "ano", "mes"])

    _upsert(db, CagedPorCnae, [
        {"municipio_id": mid, "ano": ano, "mes": mes,
         "secao": secao, "descricao_secao": desc,
         "admissoes": t["admissoes"], "desligamentos": t["desligamentos"],
         "saldo": t["admissoes"] - t["desligamentos"]}
        for (ano, mes, secao, desc), t in por_cnae.items()
    ], ["municipio_id", "ano", "mes", "secao"])

    _upsert(db, CagedPorEscolaridade, [
        {"municipio_id": mid, "ano": ano, "mes": mes, "grau_instrucao": grau,
         "admissoes": t["admissoes"], "desligamentos": t["desligamentos"],
         "saldo": t["admissoes"] - t["desligamentos"]}
        for (ano, mes, grau), t in por_escolaridade.items()
    ], ["municipio_id", "ano", "mes", "grau_instrucao"])

    _upsert(db, CagedPorFaixaEtaria, [
        {"municipio_id": mid, "ano": ano, "mes": mes, "faixa_etaria": faixa,
         "admissoes": t["admissoes"], "desligamentos": t["desligamentos"],
         "saldo": t["admissoes"] - t["desligamentos"]}
        for (ano, mes, faixa), t in por_faixa_etaria.items()
    ], ["municipio_id", "ano", "mes", "faixa_etaria"])

    _upsert(db, CagedPorTipoMovimentacao, [
        {"municipio_id": mid, "ano": ano, "mes": mes, "tipo_movimentacao": tipo,
         "admissoes": t["admissoes"], "desligamentos": t["desligamentos"],
         "saldo": t["admissoes"] - t["desligamentos"]}
        for (ano, mes, tipo), t in por_tipo_mov.items()
    ], ["municipio_id", "ano", "mes", "tipo_movimentacao"])

    _upsert(db, CagedPorTipoDeficiencia, [
        {"municipio_id": mid, "ano": ano, "mes": mes, "tipo_deficiencia": label,
         "admissoes": t["admissoes"], "desligamentos": t["desligamentos"],
         "saldo": t["admissoes"] - t["desligamentos"]}
        for (ano, mes, label), t in por_tipo_def.items()
    ], ["municipio_id", "ano", "mes", "tipo_deficiencia"])

    _upsert(db, CagedPorTamanhoEstabelecimento, [
        {"municipio_id": mid, "ano": ano, "mes": mes, "tamanho": label,
         "admissoes": t["admissoes"], "desligamentos": t["desligamentos"],
         "saldo": t["admissoes"] - t["desligamentos"]}
        for (ano, mes, label), t in por_tamanho.items()
    ], ["municipio_id", "ano", "mes", "tamanho"])

    _upsert(db, CagedPorTipoEmpregador, [
        {"municipio_id": mid, "ano": ano, "mes": mes, "tipo_empregador": label,
         "admissoes": t["admissoes"], "desligamentos": t["desligamentos"],
         "saldo": t["admissoes"] - t["desligamentos"]}
        for (ano, mes, label), t in por_tipo_emp.items()
    ], ["municipio_id", "ano", "mes", "tipo_empregador"])

    _upsert(db, CagedPorTipoEstabelecimento, [
        {"municipio_id": mid, "ano": ano, "mes": mes, "tipo_estabelecimento": label,
         "admissoes": t["admissoes"], "desligamentos": t["desligamentos"],
         "saldo": t["admissoes"] - t["desligamentos"]}
        for (ano, mes, label), t in por_tipo_estab.items()
    ], ["municipio_id", "ano", "mes", "tipo_estabelecimento"])

    _upsert(db, CagedIndicadoresContrato, [
        {"municipio_id": mid, "ano": ano,
         "total_movimentacoes": ind["total"],
         "total_parcial": ind["parcial"],
         "total_intermitente": ind["intermitente"],
         "total_aprendiz": ind["aprendiz"],
         "total_pcd": ind["pcd"],
         "total_fora_prazo": ind["fora_prazo"]}
        for ano, ind in indicadores.items()
    ], ["municipio_id", "ano"])

    db.commit()
