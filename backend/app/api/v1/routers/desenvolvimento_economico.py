from dataclasses import asdict
from datetime import date
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user, get_db, require_permissao, scoped_modulo
from app.core.cnpj import cnpj_para_basico
from app.core.cnae import CNAE_SECAO
from app.core.datas import hoje_local
from app.core.exceptions import ForbiddenException, NotFoundException
from app.models.desenvolvimento_economico import (
    CaptacaoRecurso,
    ContatoEmpresa,
    DemandaEmpresa,
    DemandaStatusHistorico,
    EmpresaRetencao,
    EscritaProjeto,
    InvestimentoFunil,
    Premiacao,
    VisitaRetencao,
)
from app.models.usuario import Usuario
from app.schemas.desenvolvimento_economico import (
    AgendaOut,
    CaptacaoRecursoCreate,
    CaptacaoRecursoOut,
    CaptacaoRecursoUpdate,
    ContatoEmpresaCreate,
    ContatoEmpresaOut,
    ContatoEmpresaUpdate,
    DemandaEmpresaCreate,
    DemandaEmpresaOut,
    DemandaEmpresaUpdate,
    DescobertaItem,
    DescobertaPage,
    DivisaoCnaeOut,
    EmpresaRetencaoCreate,
    EmpresaRetencaoLeanOut,
    EmpresaRetencaoOut,
    EmpresaRetencaoUpdate,
    EscritaProjetoCreate,
    EscritaProjetoOut,
    EscritaProjetoUpdate,
    FunilResumo,
    InvestimentoFunilCreate,
    InvestimentoFunilOut,
    InvestimentoFunilUpdate,
    PremiacaoCreate,
    PremiacaoOut,
    PremiacaoUpdate,
    VisitaRetencaoCreate,
    VisitaRetencaoOut,
)
from app.services.gestao_empresarial import JANELAS_AGENDA, Enriquecimento, agenda, agenda_vazia, descobrir, divisoes_disponiveis, enriquecer, ordenar_por_relevancia

router = APIRouter(prefix="/desenvolvimento-economico", tags=["Desenvolvimento Econômico"])

ESTAGIOS_FUNIL = ["lead", "contato", "negociacao", "implantacao"]


def _exigir_municipio(current_user: Usuario) -> None:
    """Criação usa o município do usuário — ADMIN_GLOBAL não tem um."""
    if current_user.municipio_id is None:
        raise ForbiddenException("ADMIN_GLOBAL não possui município associado")


def _municipio_id(current_user: Usuario) -> int:
    return current_user.municipio_id  # type: ignore[return-value]


def _apply_tenant(query, model, current_user: Usuario):
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(model.municipio_id == current_user.municipio_id)
    return query


def _colunas(obj) -> dict:
    """Colunas mapeadas do ORM como dict — os schemas enriquecidos têm campos
    obrigatórios que o ORM não tem, então a serialização é explícita."""
    return {a.key: getattr(obj, a.key) for a in sa_inspect(type(obj)).column_attrs}


def _lean_out(empresa: EmpresaRetencao, calc: Enriquecimento) -> EmpresaRetencaoLeanOut:
    return EmpresaRetencaoLeanOut.model_validate(
        {**_colunas(empresa), "relevancia": asdict(calc.relevancia), "risco": asdict(calc.risco)},
        from_attributes=True,
    )


def _lean_enriquecido(db: Session, empresa: EmpresaRetencao) -> EmpresaRetencaoLeanOut:
    return _lean_out(empresa, enriquecer(db, [empresa], hoje=hoje_local())[empresa.id])


def _registrar_status_demanda(db: Session, demanda: DemandaEmpresa, de: str | None, para: str,
                              usuario_id: int | None) -> None:
    """Uma linha de histórico por transição (sub-frente C). Não faz commit:
    entra no mesmo commit da demanda."""
    db.add(DemandaStatusHistorico(
        demanda_id=demanda.id, municipio_id=demanda.municipio_id,
        de=de, para=para, alterado_por=usuario_id,
    ))


# ── 3.1 Funil de Investimentos ─────────────────────────────────────────────

@router.get("/funil/resumo", response_model=FunilResumo)
def resumo_funil(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    query = _apply_tenant(db.query(InvestimentoFunil), InvestimentoFunil, current_user)
    items = query.all()
    por_estagio = {e: 0 for e in ESTAGIOS_FUNIL}
    valor_total = 0.0
    for item in items:
        if item.estagio in por_estagio:
            por_estagio[item.estagio] += 1
        valor_total += item.valor_estimado or 0.0
    total = len(items)
    implantados = por_estagio.get("implantacao", 0)
    taxa = round(implantados / total * 100, 1) if total else 0.0
    return FunilResumo(por_estagio=por_estagio, valor_total_estimado=valor_total, taxa_conversao=taxa)


@router.get("/funil", response_model=List[InvestimentoFunilOut])
def listar_funil(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    query = _apply_tenant(db.query(InvestimentoFunil), InvestimentoFunil, current_user)
    return query.order_by(InvestimentoFunil.criado_em.desc()).all()


@router.post("/funil", response_model=InvestimentoFunilOut)
def criar_funil(
    data: InvestimentoFunilCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("funil", "criar")),
):
    _exigir_municipio(current_user)
    item = InvestimentoFunil(
        **data.model_dump(),
        municipio_id=_municipio_id(current_user),
        criado_por=current_user.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/funil/{item_id}", response_model=InvestimentoFunilOut)
def atualizar_funil(
    item_id: int,
    data: InvestimentoFunilUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("funil", "editar")),
):
    item = db.get(InvestimentoFunil, item_id)
    if not item:
        raise NotFoundException("Lead não encontrado")
    if current_user.role.nome != "ADMIN_GLOBAL" and item.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/funil/{item_id}")
def deletar_funil(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("funil", "excluir")),
):
    item = db.get(InvestimentoFunil, item_id)
    if not item:
        raise NotFoundException("Lead não encontrado")
    if current_user.role.nome != "ADMIN_GLOBAL" and item.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    db.delete(item)
    db.commit()
    return {"ok": True}


# ── 3.2 Retenção & Expansão ────────────────────────────────────────────────

@router.get("/retencao", response_model=List[EmpresaRetencaoLeanOut])
def listar_retencao(
    municipio_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    query = db.query(EmpresaRetencao)
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(EmpresaRetencao.municipio_id == current_user.municipio_id)
    elif municipio_id is not None:
        query = query.filter(EmpresaRetencao.municipio_id == municipio_id)
    empresas = query.all()
    calc = enriquecer(db, empresas, hoje=hoje_local())
    # Ordem de relevância decrescente com desempate por nome (antes: só nome).
    return [_lean_out(e, calc[e.id]) for e in ordenar_por_relevancia(empresas, calc)]


def _divisao_cnae(cnae_fiscal: str | None) -> tuple[str | None, str | None]:
    if not cnae_fiscal:
        return None, None
    div = cnae_fiscal[:2]
    return div, CNAE_SECAO.get(div, f"Divisão {div}")


# Rotas estáticas de /retencao ficam ANTES de /retencao/{empresa_id}: o
# Starlette casa em ordem de declaração e `{empresa_id}` é int — "descobrir"
# viraria 422. test_rotas_de_descoberta_vem_antes_do_detalhe_por_id guarda isso.
@router.get("/retencao/descobrir", response_model=DescobertaPage)
def descobrir_retencao(
    situacao: str = Query("02"),
    porte: str | None = Query(None),
    divisao: str | None = Query(None, pattern=r"^\d{2}$"),
    q: str | None = Query(None, max_length=100),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    mid: int | None = Depends(scoped_modulo("empresas")),
    db: Session = Depends(get_db),
):
    """Empresas da base RFB do município ainda não acompanhadas, por score RFB
    decrescente (espelho SQL de calcular_relevancia sem cadastro; máximo 45).
    Plano `empresas` e escopo/view-as pela dependência; sem município → vazio."""
    if mid is None:
        return DescobertaPage(total=0, itens=[])
    try:
        total, linhas = descobrir(db, mid, situacao=situacao, porte=porte, divisao=divisao,
                                  q=q, limit=limit, offset=offset, hoje=hoje_local())
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    itens = []
    for e, score in linhas:
        div, descricao = _divisao_cnae(e.cnae_fiscal)
        itens.append(DescobertaItem(
            cnpj_basico=e.cnpj_basico, razao_social=e.razao_social, nome_fantasia=e.nome_fantasia,
            situacao=e.situacao, porte=e.porte, cnae_fiscal=e.cnae_fiscal,
            divisao=div, divisao_descricao=descricao,
            capital_social=e.capital_social, data_inicio=e.data_inicio, score=score,
        ))
    return DescobertaPage(total=total, itens=itens)


@router.get("/retencao/descobrir/divisoes", response_model=List[DivisaoCnaeOut])
def descobrir_divisoes(
    mid: int | None = Depends(scoped_modulo("empresas")),
    db: Session = Depends(get_db),
):
    """Divisões CNAE presentes entre as ativas não acompanhadas — popula o
    filtro da aba Descobrir uma vez por montagem."""
    if mid is None:
        return []
    itens = [
        DivisaoCnaeOut(divisao=d, descricao=CNAE_SECAO.get(d, f"Divisão {d}"), total=n)
        for d, n in divisoes_disponiveis(db, mid)
    ]
    return sorted(itens, key=lambda i: i.descricao)


@router.get("/retencao/agenda", response_model=AgendaOut)
def agenda_retencao(
    dias: int = Query(7),
    municipio_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Agenda do gestor: ações vencidas, próximas N dias, sem data, demandas
    abertas, sem contato 90 d+ e contatos recentes. Mesmo tenant de
    /retencao; ADMIN_GLOBAL sem view-as recebe a agenda vazia. Rota estática
    ANTES de /retencao/{empresa_id}."""
    if dias not in JANELAS_AGENDA:
        raise HTTPException(status_code=422, detail=f"dias deve ser um de {list(JANELAS_AGENDA)}")
    hoje = hoje_local()
    query = db.query(EmpresaRetencao)
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(EmpresaRetencao.municipio_id == current_user.municipio_id)
    elif municipio_id is not None:
        query = query.filter(EmpresaRetencao.municipio_id == municipio_id)
    else:
        return AgendaOut(**asdict(agenda_vazia(hoje, dias)))
    return AgendaOut(**asdict(agenda(db, query.all(), hoje=hoje, dias=dias)))


@router.get("/retencao/{empresa_id}", response_model=EmpresaRetencaoOut)
def detalhe_retencao(
    empresa_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    empresa = (
        db.query(EmpresaRetencao)
        .options(
            selectinload(EmpresaRetencao.visitas),
            selectinload(EmpresaRetencao.contatos),
            selectinload(EmpresaRetencao.demandas)
            .selectinload(DemandaEmpresa.historico)
            .selectinload(DemandaStatusHistorico.usuario),
        )
        .filter(EmpresaRetencao.id == empresa_id)
        .first()
    )
    if not empresa:
        raise NotFoundException("Empresa não encontrada")
    if current_user.role.nome != "ADMIN_GLOBAL" and empresa.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    empresa.visitas.sort(key=lambda v: v.data_visita)
    empresa.contatos.sort(key=lambda c: c.data)
    empresa.demandas.sort(key=lambda d: d.data_registro)
    calc = enriquecer(db, [empresa], hoje=hoje_local())[empresa.id]  # perfil RFB lido uma única vez, aqui
    return EmpresaRetencaoOut.model_validate(
        {
            **_colunas(empresa),
            "visitas": empresa.visitas,
            "contatos": empresa.contatos,
            "demandas": empresa.demandas,
            "perfil_rfb": calc.perfil_rfb,
            "relevancia": asdict(calc.relevancia),
            "risco": asdict(calc.risco),
        },
        from_attributes=True,
    )


@router.post("/retencao", response_model=EmpresaRetencaoLeanOut)
def criar_retencao(
    data: EmpresaRetencaoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("retencao", "criar")),
):
    _exigir_municipio(current_user)
    payload = data.model_dump()
    if payload.get("cnpj_basico") is None:
        payload["cnpj_basico"] = cnpj_para_basico(payload.get("cnpj"))
    empresa = EmpresaRetencao(
        **payload,
        municipio_id=_municipio_id(current_user),
        criado_por=current_user.id,
    )
    db.add(empresa)
    db.commit()
    db.refresh(empresa)
    return _lean_enriquecido(db, empresa)


@router.put("/retencao/{empresa_id}", response_model=EmpresaRetencaoLeanOut)
def atualizar_retencao(
    empresa_id: int,
    data: EmpresaRetencaoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("retencao", "editar")),
):
    empresa = db.get(EmpresaRetencao, empresa_id)
    if not empresa:
        raise NotFoundException("Empresa não encontrada")
    if current_user.role.nome != "ADMIN_GLOBAL" and empresa.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    campos = data.model_dump(exclude_unset=True)
    if "cnpj" in campos and "cnpj_basico" not in campos:
        campos["cnpj_basico"] = cnpj_para_basico(campos.get("cnpj"))
    for field, value in campos.items():
        setattr(empresa, field, value)
    db.commit()
    db.refresh(empresa)
    return _lean_enriquecido(db, empresa)


@router.delete("/retencao/{empresa_id}")
def deletar_retencao(
    empresa_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("retencao", "excluir")),
):
    empresa = db.get(EmpresaRetencao, empresa_id)
    if not empresa:
        raise NotFoundException("Empresa não encontrada")
    if current_user.role.nome != "ADMIN_GLOBAL" and empresa.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    db.delete(empresa)
    db.commit()
    return {"ok": True}


@router.post("/retencao/{empresa_id}/visitas", response_model=VisitaRetencaoOut)
def adicionar_visita(
    empresa_id: int,
    data: VisitaRetencaoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("retencao", "editar")),
):
    empresa = db.get(EmpresaRetencao, empresa_id)
    if not empresa:
        raise NotFoundException("Empresa não encontrada")
    if current_user.role.nome != "ADMIN_GLOBAL" and empresa.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    visita = VisitaRetencao(
        **data.model_dump(),
        empresa_id=empresa_id,
        municipio_id=empresa.municipio_id,
    )
    db.add(visita)
    db.commit()
    db.refresh(visita)
    return visita


@router.delete("/retencao/visitas/{visita_id}")
def deletar_visita(
    visita_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("retencao", "editar")),
):
    visita = db.get(VisitaRetencao, visita_id)
    if not visita:
        raise NotFoundException("Visita não encontrada")
    if current_user.role.nome != "ADMIN_GLOBAL" and visita.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    db.delete(visita)
    db.commit()
    return {"ok": True}


@router.post("/retencao/{empresa_id}/contatos", response_model=ContatoEmpresaOut)
def adicionar_contato(
    empresa_id: int,
    data: ContatoEmpresaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("retencao", "editar")),
):
    empresa = db.get(EmpresaRetencao, empresa_id)
    if not empresa:
        raise NotFoundException("Empresa não encontrada")
    if current_user.role.nome != "ADMIN_GLOBAL" and empresa.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    contato = ContatoEmpresa(
        **data.model_dump(),
        empresa_id=empresa_id,
        municipio_id=empresa.municipio_id,
        criado_por=current_user.id,
    )
    db.add(contato)
    db.commit()
    db.refresh(contato)
    return contato


@router.put("/retencao/contatos/{contato_id}", response_model=ContatoEmpresaOut)
def atualizar_contato(
    contato_id: int,
    data: ContatoEmpresaUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("retencao", "editar")),
):
    contato = db.get(ContatoEmpresa, contato_id)
    if not contato:
        raise NotFoundException("Contato não encontrado")
    if current_user.role.nome != "ADMIN_GLOBAL" and contato.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(contato, field, value)
    db.commit()
    db.refresh(contato)
    return contato


@router.delete("/retencao/contatos/{contato_id}")
def deletar_contato(
    contato_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("retencao", "editar")),
):
    contato = db.get(ContatoEmpresa, contato_id)
    if not contato:
        raise NotFoundException("Contato não encontrado")
    if current_user.role.nome != "ADMIN_GLOBAL" and contato.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    db.delete(contato)
    db.commit()
    return {"ok": True}


@router.post("/retencao/{empresa_id}/demandas", response_model=DemandaEmpresaOut)
def adicionar_demanda(
    empresa_id: int,
    data: DemandaEmpresaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("retencao", "editar")),
):
    empresa = db.get(EmpresaRetencao, empresa_id)
    if not empresa:
        raise NotFoundException("Empresa não encontrada")
    if current_user.role.nome != "ADMIN_GLOBAL" and empresa.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    demanda = DemandaEmpresa(
        **data.model_dump(),
        empresa_id=empresa_id,
        municipio_id=empresa.municipio_id,
        criado_por=current_user.id,
    )
    db.add(demanda)
    db.flush()  # id da demanda para a linha inicial do histórico
    _registrar_status_demanda(db, demanda, None, demanda.status, current_user.id)
    db.commit()
    db.refresh(demanda)
    return demanda


@router.put("/retencao/demandas/{demanda_id}", response_model=DemandaEmpresaOut)
def atualizar_demanda(
    demanda_id: int,
    data: DemandaEmpresaUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("retencao", "editar")),
):
    demanda = db.get(DemandaEmpresa, demanda_id)
    if not demanda:
        raise NotFoundException("Demanda não encontrada")
    if current_user.role.nome != "ADMIN_GLOBAL" and demanda.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    campos = data.model_dump(exclude_unset=True)
    status_antigo = demanda.status
    for field, value in campos.items():
        setattr(demanda, field, value)
    if "status" in campos and campos["status"] != status_antigo:
        _registrar_status_demanda(db, demanda, status_antigo, campos["status"], current_user.id)
    db.commit()
    db.refresh(demanda)
    return demanda


@router.delete("/retencao/demandas/{demanda_id}")
def deletar_demanda(
    demanda_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("retencao", "editar")),
):
    demanda = db.get(DemandaEmpresa, demanda_id)
    if not demanda:
        raise NotFoundException("Demanda não encontrada")
    if current_user.role.nome != "ADMIN_GLOBAL" and demanda.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    db.delete(demanda)
    db.commit()
    return {"ok": True}


# ── 3.3 Captação de Recursos ───────────────────────────────────────────────

@router.get("/captacao", response_model=List[CaptacaoRecursoOut])
def listar_captacao(
    municipio_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    query = db.query(CaptacaoRecurso)
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(CaptacaoRecurso.municipio_id == current_user.municipio_id)
    elif municipio_id is not None:
        query = query.filter(CaptacaoRecurso.municipio_id == municipio_id)
    return query.order_by(CaptacaoRecurso.criado_em.desc()).all()


@router.post("/captacao", response_model=CaptacaoRecursoOut)
def criar_captacao(
    data: CaptacaoRecursoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("captacao", "criar")),
):
    _exigir_municipio(current_user)
    item = CaptacaoRecurso(
        **data.model_dump(),
        municipio_id=_municipio_id(current_user),
        criado_por=current_user.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/captacao/{item_id}", response_model=CaptacaoRecursoOut)
def atualizar_captacao(
    item_id: int,
    data: CaptacaoRecursoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("captacao", "editar")),
):
    item = db.get(CaptacaoRecurso, item_id)
    if not item:
        raise NotFoundException("Oportunidade não encontrada")
    if current_user.role.nome != "ADMIN_GLOBAL" and item.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/captacao/{item_id}")
def deletar_captacao(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("captacao", "excluir")),
):
    item = db.get(CaptacaoRecurso, item_id)
    if not item:
        raise NotFoundException("Oportunidade não encontrada")
    if current_user.role.nome != "ADMIN_GLOBAL" and item.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    db.delete(item)
    db.commit()
    return {"ok": True}


# ── 3.4 Escrita de Projetos ────────────────────────────────────────────────

@router.get("/escrita", response_model=List[EscritaProjetoOut])
def listar_escrita(
    municipio_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    query = db.query(EscritaProjeto)
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(EscritaProjeto.municipio_id == current_user.municipio_id)
    elif municipio_id is not None:
        query = query.filter(EscritaProjeto.municipio_id == municipio_id)
    return query.order_by(EscritaProjeto.criado_em.desc()).all()


@router.post("/escrita", response_model=EscritaProjetoOut)
def criar_escrita(
    data: EscritaProjetoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("escrita", "criar")),
):
    _exigir_municipio(current_user)
    item = EscritaProjeto(
        **data.model_dump(),
        municipio_id=_municipio_id(current_user),
        criado_por=current_user.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/escrita/{item_id}", response_model=EscritaProjetoOut)
def atualizar_escrita(
    item_id: int,
    data: EscritaProjetoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("escrita", "editar")),
):
    item = db.get(EscritaProjeto, item_id)
    if not item:
        raise NotFoundException("Projeto não encontrado")
    if current_user.role.nome != "ADMIN_GLOBAL" and item.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/escrita/{item_id}")
def deletar_escrita(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("escrita", "excluir")),
):
    item = db.get(EscritaProjeto, item_id)
    if not item:
        raise NotFoundException("Projeto não encontrado")
    if current_user.role.nome != "ADMIN_GLOBAL" and item.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    db.delete(item)
    db.commit()
    return {"ok": True}


# ── 3.5 Premiações ─────────────────────────────────────────────────────────

@router.get("/premiacoes", response_model=List[PremiacaoOut])
def listar_premiacoes(
    municipio_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    query = db.query(Premiacao)
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(Premiacao.municipio_id == current_user.municipio_id)
    elif municipio_id is not None:
        query = query.filter(Premiacao.municipio_id == municipio_id)
    return query.order_by(Premiacao.criado_em.desc()).all()


@router.post("/premiacoes", response_model=PremiacaoOut)
def criar_premiacao(
    data: PremiacaoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("premiacoes", "criar")),
):
    _exigir_municipio(current_user)
    item = Premiacao(
        **data.model_dump(),
        municipio_id=_municipio_id(current_user),
        criado_por=current_user.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/premiacoes/{item_id}", response_model=PremiacaoOut)
def atualizar_premiacao(
    item_id: int,
    data: PremiacaoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("premiacoes", "editar")),
):
    item = db.get(Premiacao, item_id)
    if not item:
        raise NotFoundException("Premiação não encontrada")
    if current_user.role.nome != "ADMIN_GLOBAL" and item.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/premiacoes/{item_id}")
def deletar_premiacao(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("premiacoes", "excluir")),
):
    item = db.get(Premiacao, item_id)
    if not item:
        raise NotFoundException("Premiação não encontrada")
    if current_user.role.nome != "ADMIN_GLOBAL" and item.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    db.delete(item)
    db.commit()
    return {"ok": True}
