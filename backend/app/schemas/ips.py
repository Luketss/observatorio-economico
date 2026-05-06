from pydantic import BaseModel


class IpsMunicipioItem(BaseModel):
    municipio_id: int
    nome: str
    estado: str


class IpsScorecardItem(BaseModel):
    municipio_id: int
    ano: int
    area_km2: float | None = None
    populacao: int | None = None
    pib_per_capita: float | None = None
    ips_geral: float | None = None
    necessidades_humanas_basicas: float | None = None
    fundamentos_bem_estar: float | None = None
    oportunidades: float | None = None
    nutricao_cuidados_medicos: float | None = None
    agua_saneamento: float | None = None
    moradia: float | None = None
    seguranca_pessoal: float | None = None
    acesso_conhecimento_basico: float | None = None
    acesso_informacao_comunicacao: float | None = None
    saude_bem_estar: float | None = None
    qualidade_meio_ambiente: float | None = None
    direitos_individuais: float | None = None
    liberdades_individuais: float | None = None
    inclusao_social: float | None = None
    acesso_educacao_superior: float | None = None
    cobertura_vacinal_poliomielite: float | None = None
    hospitalizacoes_csa: float | None = None
    mortalidade_ajustada_csa: float | None = None
    mortalidade_infantil_5_anos: float | None = None
    subnutricao: float | None = None
    abastecimento_agua_rede: float | None = None
    esgotamento_sanitario_adequado: float | None = None
    indice_abastecimento_agua: float | None = None
    indice_perdas_agua: float | None = None
    domicilios_coleta_residuos: float | None = None
    domicilios_iluminacao_eletrica: float | None = None
    domicilios_paredes_adequadas: float | None = None
    domicilios_piso_adequado: float | None = None
    assassinatos_jovens: float | None = None
    assassinatos_mulheres: float | None = None
    homicidios: float | None = None
    mortes_acidente_transporte: float | None = None
    abandono_ensino_fundamental: float | None = None
    abandono_ensino_medio: float | None = None
    evasao_ensino_medio: float | None = None
    distorcao_idade_serie: float | None = None
    ideb_ensino_fundamental: float | None = None
    reprovacao_escolar_medio: float | None = None
    cobertura_internet_movel: float | None = None
    densidade_internet_banda_larga: float | None = None
    densidade_telefonia_movel: float | None = None
    qualidade_internet_movel: float | None = None
    consumo_alimentos_ultraprocessados: float | None = None
    expectativa_vida: float | None = None
    mortalidade_15_50_anos: float | None = None
    mortalidade_dcnt: float | None = None
    obesidade: float | None = None
    suicidios: float | None = None
    areas_verdes_urbanas: float | None = None
    emissoes_co2_habitante: float | None = None
    focos_calor: float | None = None
    ivcm: float | None = None
    supressao_vegetacao: float | None = None
    acesso_prog_direitos_humanos: float | None = None
    acoes_direitos_minorias: float | None = None
    atendimento_demanda_justica: float | None = None
    resposta_processos_previdenciarios: float | None = None
    resposta_processos_familiares: float | None = None
    taxa_congestionamento_processos: float | None = None
    acesso_cultura_lazer_esporte: float | None = None
    gravidez_adolescencia: float | None = None
    ivcad: float | None = None
    pracas_parques_urbanas: float | None = None
    familias_situacao_rua: float | None = None
    paridade_genero_camara: float | None = None
    paridade_negros_camara: float | None = None
    violencia_indigenas: float | None = None
    violencia_mulheres: float | None = None
    violencia_negros: float | None = None
    empregados_ensino_superior: float | None = None
    mulheres_empregadas_ensino_superior: float | None = None
    nota_mediana_enem: float | None = None


class IpsEvolucaoItem(BaseModel):
    ano: int
    ips_geral: float | None = None
    necessidades_humanas_basicas: float | None = None
    fundamentos_bem_estar: float | None = None
    oportunidades: float | None = None


class IpsRanking(BaseModel):
    ranking_nacional: int
    total_nacional: int
    ranking_estadual: int
    total_estadual: int


class IpsComparativoItem(BaseModel):
    municipio_id: int
    nome: str
    estado: str
    ips_geral: float | None = None
    necessidades_humanas_basicas: float | None = None
    fundamentos_bem_estar: float | None = None
    oportunidades: float | None = None


class IpsDestaque(BaseModel):
    campo: str
    label: str
    valor: float
    media_nacional: float
    diferenca: float


class IpsDestaques(BaseModel):
    melhores: list[IpsDestaque]
    piores: list[IpsDestaque]


class IpsSugestao(BaseModel):
    municipio_id: int
    nome: str
    estado: str
    ips_geral: float | None = None
    pib_per_capita: float | None = None
