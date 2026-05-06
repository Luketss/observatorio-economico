from app.db.base import Base
from sqlalchemy import Float, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship


class IpsMunicipio(Base):
    __tablename__ = "ips_municipio"
    __table_args__ = (UniqueConstraint("municipio_id", "ano", name="uq_ips_municipio_ano"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    municipio_id: Mapped[int] = mapped_column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    ano: Mapped[int] = mapped_column(Integer, index=True)

    # City metadata
    area_km2: Mapped[float | None] = mapped_column(Float, nullable=True)
    populacao: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pib_per_capita: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Main index + 3 dimensions
    ips_geral: Mapped[float | None] = mapped_column(Float, nullable=True)
    necessidades_humanas_basicas: Mapped[float | None] = mapped_column(Float, nullable=True)
    fundamentos_bem_estar: Mapped[float | None] = mapped_column(Float, nullable=True)
    oportunidades: Mapped[float | None] = mapped_column(Float, nullable=True)

    # 12 components
    nutricao_cuidados_medicos: Mapped[float | None] = mapped_column(Float, nullable=True)
    agua_saneamento: Mapped[float | None] = mapped_column(Float, nullable=True)
    moradia: Mapped[float | None] = mapped_column(Float, nullable=True)
    seguranca_pessoal: Mapped[float | None] = mapped_column(Float, nullable=True)
    acesso_conhecimento_basico: Mapped[float | None] = mapped_column(Float, nullable=True)
    acesso_informacao_comunicacao: Mapped[float | None] = mapped_column(Float, nullable=True)
    saude_bem_estar: Mapped[float | None] = mapped_column(Float, nullable=True)
    qualidade_meio_ambiente: Mapped[float | None] = mapped_column(Float, nullable=True)
    direitos_individuais: Mapped[float | None] = mapped_column(Float, nullable=True)
    liberdades_individuais: Mapped[float | None] = mapped_column(Float, nullable=True)
    inclusao_social: Mapped[float | None] = mapped_column(Float, nullable=True)
    acesso_educacao_superior: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Sub-indicators — NHB
    cobertura_vacinal_poliomielite: Mapped[float | None] = mapped_column(Float, nullable=True)
    hospitalizacoes_csa: Mapped[float | None] = mapped_column(Float, nullable=True)
    mortalidade_ajustada_csa: Mapped[float | None] = mapped_column(Float, nullable=True)
    mortalidade_infantil_5_anos: Mapped[float | None] = mapped_column(Float, nullable=True)
    subnutricao: Mapped[float | None] = mapped_column(Float, nullable=True)
    abastecimento_agua_rede: Mapped[float | None] = mapped_column(Float, nullable=True)
    esgotamento_sanitario_adequado: Mapped[float | None] = mapped_column(Float, nullable=True)
    indice_abastecimento_agua: Mapped[float | None] = mapped_column(Float, nullable=True)
    indice_perdas_agua: Mapped[float | None] = mapped_column(Float, nullable=True)
    domicilios_coleta_residuos: Mapped[float | None] = mapped_column(Float, nullable=True)
    domicilios_iluminacao_eletrica: Mapped[float | None] = mapped_column(Float, nullable=True)
    domicilios_paredes_adequadas: Mapped[float | None] = mapped_column(Float, nullable=True)
    domicilios_piso_adequado: Mapped[float | None] = mapped_column(Float, nullable=True)
    assassinatos_jovens: Mapped[float | None] = mapped_column(Float, nullable=True)
    assassinatos_mulheres: Mapped[float | None] = mapped_column(Float, nullable=True)
    homicidios: Mapped[float | None] = mapped_column(Float, nullable=True)
    mortes_acidente_transporte: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Sub-indicators — FBE
    abandono_ensino_fundamental: Mapped[float | None] = mapped_column(Float, nullable=True)
    abandono_ensino_medio: Mapped[float | None] = mapped_column(Float, nullable=True)
    evasao_ensino_medio: Mapped[float | None] = mapped_column(Float, nullable=True)
    distorcao_idade_serie: Mapped[float | None] = mapped_column(Float, nullable=True)
    ideb_ensino_fundamental: Mapped[float | None] = mapped_column(Float, nullable=True)
    reprovacao_escolar_medio: Mapped[float | None] = mapped_column(Float, nullable=True)
    cobertura_internet_movel: Mapped[float | None] = mapped_column(Float, nullable=True)
    densidade_internet_banda_larga: Mapped[float | None] = mapped_column(Float, nullable=True)
    densidade_telefonia_movel: Mapped[float | None] = mapped_column(Float, nullable=True)
    qualidade_internet_movel: Mapped[float | None] = mapped_column(Float, nullable=True)
    consumo_alimentos_ultraprocessados: Mapped[float | None] = mapped_column(Float, nullable=True)
    expectativa_vida: Mapped[float | None] = mapped_column(Float, nullable=True)
    mortalidade_15_50_anos: Mapped[float | None] = mapped_column(Float, nullable=True)
    mortalidade_dcnt: Mapped[float | None] = mapped_column(Float, nullable=True)
    obesidade: Mapped[float | None] = mapped_column(Float, nullable=True)
    suicidios: Mapped[float | None] = mapped_column(Float, nullable=True)
    areas_verdes_urbanas: Mapped[float | None] = mapped_column(Float, nullable=True)
    emissoes_co2_habitante: Mapped[float | None] = mapped_column(Float, nullable=True)
    focos_calor: Mapped[float | None] = mapped_column(Float, nullable=True)
    ivcm: Mapped[float | None] = mapped_column(Float, nullable=True)
    supressao_vegetacao: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Sub-indicators — Oportunidades
    acesso_prog_direitos_humanos: Mapped[float | None] = mapped_column(Float, nullable=True)
    acoes_direitos_minorias: Mapped[float | None] = mapped_column(Float, nullable=True)
    atendimento_demanda_justica: Mapped[float | None] = mapped_column(Float, nullable=True)
    resposta_processos_previdenciarios: Mapped[float | None] = mapped_column(Float, nullable=True)
    resposta_processos_familiares: Mapped[float | None] = mapped_column(Float, nullable=True)
    taxa_congestionamento_processos: Mapped[float | None] = mapped_column(Float, nullable=True)
    acesso_cultura_lazer_esporte: Mapped[float | None] = mapped_column(Float, nullable=True)
    gravidez_adolescencia: Mapped[float | None] = mapped_column(Float, nullable=True)
    ivcad: Mapped[float | None] = mapped_column(Float, nullable=True)
    pracas_parques_urbanas: Mapped[float | None] = mapped_column(Float, nullable=True)
    familias_situacao_rua: Mapped[float | None] = mapped_column(Float, nullable=True)
    paridade_genero_camara: Mapped[float | None] = mapped_column(Float, nullable=True)
    paridade_negros_camara: Mapped[float | None] = mapped_column(Float, nullable=True)
    violencia_indigenas: Mapped[float | None] = mapped_column(Float, nullable=True)
    violencia_mulheres: Mapped[float | None] = mapped_column(Float, nullable=True)
    violencia_negros: Mapped[float | None] = mapped_column(Float, nullable=True)
    empregados_ensino_superior: Mapped[float | None] = mapped_column(Float, nullable=True)
    mulheres_empregadas_ensino_superior: Mapped[float | None] = mapped_column(Float, nullable=True)
    nota_mediana_enem: Mapped[float | None] = mapped_column(Float, nullable=True)

    municipio = relationship("Municipio")
