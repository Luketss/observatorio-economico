from pydantic import BaseModel


class CagedItem(BaseModel):
    ano: int
    mes: int
    admissoes: int
    desligamentos: int
    saldo: int


class CagedResumo(BaseModel):
    total_admissoes: int
    total_desligamentos: int
    saldo_total: int


class CagedSexoItem(BaseModel):
    ano: int
    mes: int
    sexo: str
    admissoes: int
    desligamentos: int
    saldo: int


class CagedRacaItem(BaseModel):
    ano: int
    mes: int
    raca_cor: str
    admissoes: int
    desligamentos: int
    saldo: int


class CagedSalarioItem(BaseModel):
    ano: int
    mes: int
    salario_medio_admissoes: float | None
    salario_medio_desligamentos: float | None


class CagedCnaeItem(BaseModel):
    ano: int
    mes: int
    secao: str
    descricao_secao: str
    admissoes: int
    desligamentos: int
    saldo: int


class CagedEscolaridadeItem(BaseModel):
    ano: int
    mes: int
    grau_instrucao: str
    admissoes: int
    desligamentos: int
    saldo: int


class CagedFaixaEtariaItem(BaseModel):
    ano: int
    mes: int
    faixa_etaria: str
    admissoes: int
    desligamentos: int
    saldo: int


class CagedTipoMovimentacaoItem(BaseModel):
    ano: int
    mes: int
    tipo_movimentacao: str
    admissoes: int
    desligamentos: int
    saldo: int


class CagedTipoDeficienciaItem(BaseModel):
    ano: int
    mes: int
    tipo_deficiencia: str
    admissoes: int
    desligamentos: int
    saldo: int


class CagedTamanhoEstabelecimentoItem(BaseModel):
    ano: int
    mes: int
    tamanho: str
    admissoes: int
    desligamentos: int
    saldo: int


class CagedTipoEmpregadorItem(BaseModel):
    ano: int
    mes: int
    tipo_empregador: str
    admissoes: int
    desligamentos: int
    saldo: int


class CagedTipoEstabelecimentoItem(BaseModel):
    ano: int
    mes: int
    tipo_estabelecimento: str
    admissoes: int
    desligamentos: int
    saldo: int


class CagedIndicadoresContratoItem(BaseModel):
    ano: int
    total_movimentacoes: int
    total_parcial: int
    total_intermitente: int
    total_aprendiz: int
    total_pcd: int
    total_fora_prazo: int
