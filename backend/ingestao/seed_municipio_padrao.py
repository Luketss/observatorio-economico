"""
Seed de dados SIMULADOS para o Município Padrão (id=1).

Após o clone do município "Demo", algumas telas continuaram vazias porque a
origem também não tinha esses dados (VAF, Dados Internos, Projetos, Timeline,
Desenvolvimento Econômico, cards custom e um sub-agregado do RAIS). Este script
popula essas tabelas com dados fictícios plausíveis para que nenhuma tela fique
vazia na demonstração.

Idempotente: cada bloco só insere se a tabela estiver vazia para o município.

Uso (da raiz do projeto, com o backend no PYTHONPATH):
    set -a && . ./.env.local && set +a && PYTHONPATH=backend python -m ingestao.seed_municipio_padrao
    # opcional: --municipio-id N  (default 1)
"""
import argparse
from datetime import date, datetime, time, timezone

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.dados_internos import EventoMunicipio, IndicadorInterno, PlanoGovAcao
from app.models.dashboard_card_custom import DashboardCardCustom
from app.models.desenvolvimento_economico import (
    CaptacaoRecurso,
    EmpresaRetencao,
    EscritaProjeto,
    InvestimentoFunil,
    Premiacao,
    VisitaRetencao,
)
from app.models.marco import Marco
from app.models.municipio import Municipio
from app.models.projeto import Projeto, ProjetoEixo
from app.models.rais import RaisPorMotivoDesligamento
from app.models.vaf import VafAnual


def _vazio(db: Session, model, municipio_id: int) -> bool:
    return db.query(model).filter(model.municipio_id == municipio_id).count() == 0


def seed(db: Session, municipio_id: int) -> dict[str, int]:
    municipio = db.get(Municipio, municipio_id)
    if not municipio:
        raise SystemExit(f"Município id={municipio_id} não encontrado.")

    resumo: dict[str, int] = {}

    # ── VAF (Economia → VAF) ────────────────────────────────────────────────
    if _vazio(db, VafAnual, municipio_id):
        base = [
            (2015, 0.00780, 0.00810, 0.02300, 3.10),
            (2016, 0.00805, 0.00792, 0.02240, -2.60),
            (2017, 0.00760, 0.00782, 0.02190, -2.23),
            (2018, 0.00748, 0.00754, 0.02110, -3.65),
            (2019, 0.00890, 0.00819, 0.02180, 3.32),
            (2020, 0.00915, 0.00902, 0.02360, 8.26),
            (2021, 0.01030, 0.00972, 0.02480, 5.08),
            (2022, 0.01180, 0.01105, 0.02610, 5.24),
            (2023, 0.01095, 0.01137, 0.02550, -2.30),
            (2024, 0.01140, 0.01117, 0.02490, -2.35),
        ]
        rows = []
        for i, (ano, indice, indice_medio, ipm, pct_ipm) in enumerate(base):
            prev = base[i - 1] if i > 0 else None
            rows.append(VafAnual(
                municipio_id=municipio_id,
                ano_base=ano,
                ano_aplicacao=ano + 2,
                vaf_individual=0.0,
                pct_vaf_individual=0.0,
                vaf_estado=0.0,
                pct_vaf_estado=0.0,
                indice=indice,
                pct_indice=round((indice / prev[1] - 1) * 100, 2) if prev else 0.0,
                indice_medio=indice_medio,
                pct_indice_medio=round((indice_medio / prev[2] - 1) * 100, 2) if prev else 0.0,
                indice_participacao_municipal=ipm,
                pct_ipm=pct_ipm,
            ))
        db.add_all(rows)
        resumo["VafAnual"] = len(rows)

    # ── RAIS — Por Motivo de Desligamento ───────────────────────────────────
    if _vazio(db, RaisPorMotivoDesligamento, municipio_id):
        motivos = [
            ("Dispensa sem justa causa", 320, 298),
            ("Pedido de demissão", 145, 167),
            ("Término de contrato", 88, 102),
            ("Aposentadoria", 12, 9),
            ("Falecimento", 4, 3),
        ]
        rows = []
        for ano in (2023, 2024):
            idx = 0 if ano == 2023 else 1
            for motivo, *vals in motivos:
                rows.append(RaisPorMotivoDesligamento(
                    municipio_id=municipio_id, ano=ano, motivo=motivo,
                    total_desligamentos=vals[idx],
                ))
        db.add_all(rows)
        resumo["RaisPorMotivoDesligamento"] = len(rows)

    # ── Dados Internos → Indicadores ────────────────────────────────────────
    if _vazio(db, IndicadorInterno, municipio_id):
        inds = [
            ("Saúde", "Cobertura de Atenção Básica", 78.4, "%", "anual", 2025, None),
            ("Saúde", "Leitos SUS por mil hab.", 1.8, "leitos", "anual", 2025, None),
            ("Educação", "IDEB Anos Iniciais", 6.1, "índice", "anual", 2025, None),
            ("Educação", "Matrículas na rede municipal", 4230, "alunos", "anual", 2025, None),
            ("Infraestrutura", "Vias pavimentadas", 64.2, "%", "anual", 2025, None),
            ("Meio Ambiente", "Cobertura de coleta seletiva", 41.0, "%", "mensal", 2026, 5),
            ("Assistência Social", "Famílias no CRAS", 1280, "famílias", "mensal", 2026, 5),
        ]
        rows = [
            IndicadorInterno(
                municipio_id=municipio_id, area=area, nome_metrica=nome, valor=valor,
                unidade=unidade, periodo_tipo=ptipo, periodo_ano=ano, periodo_mes=mes,
                fonte="Secretaria Municipal (dado simulado)",
            )
            for area, nome, valor, unidade, ptipo, ano, mes in inds
        ]
        db.add_all(rows)
        resumo["IndicadorInterno"] = len(rows)

    # ── Dados Internos → Plano de Governo (Kanban) ──────────────────────────
    if _vazio(db, PlanoGovAcao, municipio_id):
        acoes = [
            ("Saúde", "Reforma da UBS Central", "concluido", "Dra. Marina Alves"),
            ("Educação", "Programa de reforço escolar", "em_andamento", "Prof. Carlos Lima"),
            ("Infraestrutura", "Pavimentação do Bairro Industrial", "em_andamento", "Eng. Roberto Souza"),
            ("Meio Ambiente", "Implantação de coleta seletiva", "nao_iniciado", "Ana Paula Reis"),
            ("Turismo", "Sinalização turística do centro histórico", "nao_iniciado", "João Mendes"),
            ("Assistência Social", "Ampliação do CRAS", "em_andamento", "Equipe SMAS"),
        ]
        rows = [
            PlanoGovAcao(
                municipio_id=municipio_id, departamento=dep, titulo=tit, status=st,
                responsavel=resp, descricao=f"Ação do plano de governo: {tit}.",
                data_inicio=date(2025, 1, 15), data_prazo=date(2026, 12, 31),
                departamentos_envolvidos=[dep],
            )
            for dep, tit, st, resp in acoes
        ]
        db.add_all(rows)
        resumo["PlanoGovAcao"] = len(rows)

    # ── Dados Internos → Calendário ─────────────────────────────────────────
    if _vazio(db, EventoMunicipio, municipio_id):
        eventos = [
            ("Reunião do COMDEMA", date(2026, 6, 18), time(9, 0), "reuniao", "Sala de reuniões da Prefeitura"),
            ("Audiência Pública do Orçamento", date(2026, 6, 25), time(19, 0), "audiencia", "Câmara Municipal"),
            ("Festa do Município", date(2026, 7, 12), None, "evento", "Praça Central"),
            ("Capacitação de Servidores", date(2026, 6, 30), time(14, 0), "reuniao", "Centro Administrativo"),
            ("Entrega de obra — UBS Central", date(2026, 7, 5), time(10, 0), "evento", "Bairro Central"),
        ]
        rows = [
            EventoMunicipio(
                municipio_id=municipio_id, titulo=tit, data_inicio=d,
                horario_inicio=h, tipo=tipo, local=local,
                descricao=f"{tit} (evento simulado).",
            )
            for tit, d, h, tipo, local in eventos
        ]
        db.add_all(rows)
        resumo["EventoMunicipio"] = len(rows)

    # ── Cards custom do Dashboard ───────────────────────────────────────────
    if _vazio(db, DashboardCardCustom, municipio_id):
        cards = [
            ("População estimada", "21.430 hab.", "IBGE 2024", "UsersIcon", "blue", 0),
            ("Servidores ativos", "612", "Folha 06/2026", "BriefcaseIcon", "green", 1),
            ("Escolas municipais", "14", "Rede própria", "AcademicCapIcon", "purple", 2),
            ("Unidades de saúde", "9", "UBS + UPA", "HeartIcon", "rose", 3),
        ]
        rows = [
            DashboardCardCustom(
                municipio_id=municipio_id, titulo=tit, valor=val, subtitulo=sub,
                icone=icone, cor=cor, ordem=ordem, ativo=True,
            )
            for tit, val, sub, icone, cor, ordem in cards
        ]
        db.add_all(rows)
        resumo["DashboardCardCustom"] = len(rows)

    # ── Timeline do Mandato (Marcos) ────────────────────────────────────────
    if _vazio(db, Marco, municipio_id):
        marcos = [
            (date(2025, 1, 1), "Início do mandato", "inicio_mandato"),
            (date(2025, 3, 20), "Lançamento do Plano de Governo", "politica"),
            (date(2025, 6, 10), "Início da pavimentação do Bairro Industrial", "obras"),
            (date(2025, 9, 15), "Inauguração da nova creche municipal", "obras"),
            (date(2026, 2, 5), "Adesão ao programa estadual de turismo", "politica"),
            (date(2026, 5, 1), "Entrega da reforma da UBS Central", "obras"),
        ]
        rows = [
            Marco(
                municipio_id=municipio_id, data=d, titulo=tit, tipo=tipo, ativo=True,
                descricao=f"{tit} (marco simulado).",
            )
            for d, tit, tipo in marcos
        ]
        db.add_all(rows)
        resumo["Marco"] = len(rows)

    # ── Projetos (por eixo) ─────────────────────────────────────────────────
    if _vazio(db, Projeto, municipio_id):
        eixos = {e.nome.lower(): e.id for e in db.query(ProjetoEixo).all()}
        # fallback: usa qualquer eixo existente se os nomes não baterem
        eixo_ids = list(eixos.values())
        def eixo(nome_parcial: str) -> int:
            for nome, eid in eixos.items():
                if nome_parcial in nome:
                    return eid
            return eixo_ids[0]
        projetos = [
            (eixo("turismo"), "Rota Turística do Centro Histórico", "em_andamento", "Sec. de Turismo"),
            (eixo("turismo"), "Festival Gastronômico Municipal", "nao_iniciado", "Sec. de Turismo"),
            (eixo("desenvolvimento"), "Distrito Industrial — Fase 2", "em_andamento", "Sec. de Desenvolvimento"),
            (eixo("desenvolvimento"), "Programa Empreender Local", "concluido", "Sec. de Desenvolvimento"),
            (eixo("saude"), "Telemedicina nas UBS", "nao_iniciado", "Sec. de Saúde"),
            (eixo("saude"), "Mutirão de Especialidades", "em_andamento", "Sec. de Saúde"),
        ]
        rows = [
            Projeto(
                municipio_id=municipio_id, eixo_id=eid, titulo=tit, status=st,
                responsavel=resp, descricao=f"{tit} (projeto simulado).",
                data_inicio=date(2025, 4, 1), data_prazo=date(2026, 12, 31),
                departamento=resp,
            )
            for eid, tit, st, resp in projetos
        ]
        db.add_all(rows)
        resumo["Projeto"] = len(rows)

    # ── Desenvolvimento Econômico → Funil de Investimentos ──────────────────
    if _vazio(db, InvestimentoFunil, municipio_id):
        funil = [
            ("Metalúrgica Vale Verde", "Indústria", 4_500_000, "lead", "Equipe DE"),
            ("AgroTech Cerrado", "Agronegócio", 2_200_000, "contato", "Equipe DE"),
            ("Logística Sul Ltda.", "Logística", 8_000_000, "negociacao", "Equipe DE"),
            ("Solar Minas Energia", "Energia", 12_000_000, "implantacao", "Equipe DE"),
            ("Têxtil Boa Vista", "Indústria", 1_800_000, "contato", "Equipe DE"),
        ]
        rows = [
            InvestimentoFunil(
                municipio_id=municipio_id, empresa_nome=nome, setor=setor,
                valor_estimado=valor, estagio=estagio, responsavel=resp,
                proxima_acao="Agendar visita técnica", proxima_acao_data=date(2026, 6, 30),
                descricao=f"Oportunidade de atração — {nome} (simulado).",
            )
            for nome, setor, valor, estagio, resp in funil
        ]
        db.add_all(rows)
        resumo["InvestimentoFunil"] = len(rows)

    # ── Desenvolvimento Econômico → Retenção & Expansão (+ visitas) ─────────
    if _vazio(db, EmpresaRetencao, municipio_id):
        empresas = [
            ("Laticínios Serra Azul", "12.345.678/0001-90", "Alimentos", 85, "baixo", "alto"),
            ("Cerâmica Real", "98.765.432/0001-10", "Construção", 140, "medio", "medio"),
            ("Móveis Planejados MG", "11.222.333/0001-44", "Móveis", 60, "alto", "baixo"),
            ("Frigorífico Bom Corte", "55.666.777/0001-88", "Alimentos", 210, "medio", "alto"),
        ]
        empresa_rows = []
        for nome, cnpj, setor, emp, risco, exp in empresas:
            er = EmpresaRetencao(
                municipio_id=municipio_id, nome=nome, cnpj=cnpj, setor=setor,
                num_empregos=emp, status_risco=risco, potencial_expansao=exp,
                responsavel="Equipe DE",
            )
            db.add(er)
            empresa_rows.append(er)
        db.flush()  # garante IDs para as visitas
        resumo["EmpresaRetencao"] = len(empresa_rows)

        visitas = []
        for er in empresa_rows[:3]:
            visitas.append(VisitaRetencao(
                empresa_id=er.id, municipio_id=municipio_id,
                data_visita=date(2026, 5, 20), responsavel="Equipe DE",
                observacoes=f"Visita de relacionamento à {er.nome} (simulado).",
            ))
        db.add_all(visitas)
        resumo["VisitaRetencao"] = len(visitas)

    # ── Desenvolvimento Econômico → Captação de Recursos ────────────────────
    if _vazio(db, CaptacaoRecurso, municipio_id):
        captacoes = [
            ("edital", "Edital FNMA — Saneamento", "Ministério do Meio Ambiente", 1_500_000, "oportunidade"),
            ("convenio", "Convênio Turismo Regional", "Governo de MG", 800_000, "em_elaboracao"),
            ("emenda", "Emenda parlamentar — UBS", "Bancada Federal MG", 600_000, "enviado"),
            ("edital", "PAC Mobilidade Urbana", "Governo Federal", 5_000_000, "aprovado"),
        ]
        rows = [
            CaptacaoRecurso(
                municipio_id=municipio_id, tipo=tipo, titulo=tit, entidade_origem=ent,
                valor_estimado=valor, estagio=estagio, prazo=date(2026, 9, 30),
                descricao=f"{tit} (oportunidade simulada).",
            )
            for tipo, tit, ent, valor, estagio in captacoes
        ]
        db.add_all(rows)
        resumo["CaptacaoRecurso"] = len(rows)

    # ── Desenvolvimento Econômico → Escrita de Projetos ─────────────────────
    if _vazio(db, EscritaProjeto, municipio_id):
        escritas = [
            ("Projeto Cidade Inteligente", "ideia", None, "Equipe DE"),
            ("Requalificação da Orla", "elaboracao", None, "Sec. de Obras"),
            ("Centro de Inovação Municipal", "submissao", None, "Sec. de Desenvolvimento"),
            ("Programa Jovem Aprendiz", "resultado", "aprovado", "Sec. de Educação"),
        ]
        rows = [
            EscritaProjeto(
                municipio_id=municipio_id, titulo=tit, estagio=estagio, resultado=res,
                responsavel=resp, prazo=date(2026, 10, 15), valor_pleiteado=750_000,
                descricao=f"{tit} (projeto simulado).",
            )
            for tit, estagio, res, resp in escritas
        ]
        db.add_all(rows)
        resumo["EscritaProjeto"] = len(rows)

    # ── Desenvolvimento Econômico → Premiações ──────────────────────────────
    if _vazio(db, Premiacao, municipio_id):
        premiacoes = [
            ("Prêmio Gestão Eficiente", "Confederação Nacional de Municípios", "premio", "oportunidade"),
            ("Selo Município Sustentável", "Governo de MG", "selo", "em_andamento"),
            ("Prêmio Inovação na Saúde", "Ministério da Saúde", "premio", "conquistado"),
        ]
        rows = [
            Premiacao(
                municipio_id=municipio_id, titulo=tit, entidade=ent, tipo=tipo, status=status,
                prazo=date(2026, 11, 30), descricao=f"{tit} (simulado).",
            )
            for tit, ent, tipo, status in premiacoes
        ]
        db.add_all(rows)
        resumo["Premiacao"] = len(rows)

    db.commit()
    return resumo


def main():
    parser = argparse.ArgumentParser(description="Seed de dados simulados para o Município Padrão.")
    parser.add_argument("--municipio-id", type=int, default=1)
    args = parser.parse_args()

    db = SessionLocal()
    try:
        resumo = seed(db, args.municipio_id)
        if not resumo:
            print("Nada a inserir — todas as tabelas já tinham dados.")
        else:
            total = sum(resumo.values())
            print(f"Seed concluído — {len(resumo)} tabela(s), {total} linha(s):")
            for k, v in resumo.items():
                print(f"  {k:28} {v}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
