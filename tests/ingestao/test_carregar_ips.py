import csv
from pathlib import Path
from unittest.mock import MagicMock, patch
from ingestao.carregar_ips import carregar


HEADER = (
    "Código IBGE;Município;UF;Área (km²);População 2022;PIB per capita 2021;"
    "Índice de Progresso Social;Necessidades Humanas Básicas;Fundamentos do Bem-estar;"
    "Oportunidades;Nutrição e Cuidados Médicos Básicos;Água e Saneamento;Moradia;"
    "Segurança Pessoal;Acesso ao Conhecimento Básico;Acesso à Informação e Comunicação;"
    "Saúde e Bem-estar;Qualidade do Meio Ambiente;Direitos Individuais;"
    "Liberdades Individuais e de Escolha;Inclusão Social;Acesso à Educação Superior;"
    "Cobertura Vacinal (Poliomielite);Hospitalizações por Condições Sensíveis à Atenção Primária;"
    "Mortalidade Ajustada por Condições Sensíveis à Atenção Primária;"
    "Mortalidade Infantil até 5 Anos;Subnutrição;Abastecimento de Água via Rede de Distribuição;"
    "Esgotamento Sanitário Adequado;Índice de Abastecimento de Água;"
    "Índice de Perdas de Água na Distribuição;Domicílios com Coleta de Resíduos Adequada;"
    "Domicílios com Iluminação Elétrica Adequada;Domicílios com Paredes Adequadas;"
    "Domicílios com Piso Adequado;Assassinatos de Jovens;Assassinatos de Mulheres;"
    "Homicídios;Mortes por Acidente de Transporte;Abandono no Ensino Fundamental;"
    "Abandono no Ensino Médio;Evasão no Ensino Médio;Distorção Idade-Série no Ensino Médio;"
    "Ideb Ensino Fundamental;Reprovação Escolar no Ensino Médio;"
    "Cobertura de Internet Móvel (4G/5G);Densidade de Internet Banda Larga Fixa;"
    "Densidade de Telefonia Móvel;Qualidade de Internet Móvel;"
    "Consumo de Alimentos Ultraprocessados;Expectativa de Vida;"
    "Mortalidade entre 15 e 50 anos;Mortalidade por Doenças Crônicas Não Transmissíveis;"
    "Obesidade;Suicídios;Áreas Verdes Urbanas;Emissões de CO₂e por Habitante;"
    "Focos de Calor;Índice de Vulnerabilidade Climática dos Municípios (IVCM);"
    "Supressão da Vegetação Primária e Secundária;"
    "Acesso a Programas de Direitos Humanos;Existência de Ações para Direitos de Minorias;"
    "Índice de Atendimento à Demanda de Justiça;Resposta a Processos Previdenciários;"
    "Resposta a Processos Familiares;Taxa de Congestionamento Líquido de Processos;"
    "Acesso à Cultura, Lazer e Esporte;Gravidez na Adolescência (<19 anos);"
    "Índice de Vulnerabilidade das Famílias do Cadastro Único (IVCAD);"
    "Praças e Parques em Áreas Urbanas;Famílias em Situação de Rua;"
    "Paridade de Gênero na Câmara Municipal;Paridade de Negros na Câmara Municipal;"
    "Violência contra Indígenas;Violência contra Mulheres;Violência contra Negros;"
    "Empregados com Ensino Superior;Mulheres Empregadas com Ensino Superior;Nota Mediana do Enem"
)
ROW = (
    "3105905;Cabo Verde;MG;331,5;8500;28000,00;"
    "55,5;62,1;58,3;46,2;70,1;45,2;88,3;51,4;"
    "65,0;60,0;55,0;48,0;40,0;35,0;38,0;42,0;"
    "80,0;2500,0;130,0;12,0;5,0;28,0;5,0;"
    "50,0;60,0;55,0;95,0;88,0;97,0;"
    "18,0;15,0;12,0;14,0;"
    "1,5;8,0;9,0;20,0;4,5;2,0;"
    "70,0;12,0;65,0;95,0;;"
    "71,0;2,5;500,0;18,0;12,0;2,0;15,0;100,0;45,0;25,0;10;0;"
    "85,0;;;50,0;3;15,0;;4,0;;0,3;0,8;90,0;400,0;120,0;45,0;65,0;"
)


def make_csv(tmp_path: Path) -> Path:
    p = tmp_path / "ips_brasil_municipios_2024.csv"
    p.write_text(f"{HEADER}\n{ROW}\n", encoding="utf-8")
    return p


def test_carregar_inserts_row(tmp_path):
    csv_path = make_csv(tmp_path)
    db = MagicMock()
    municipio = MagicMock(); municipio.id = 1
    db.query.return_value.filter.return_value.first.return_value = None  # no existing

    with patch("ingestao.carregar_ips.obter_ou_criar_municipio", return_value=municipio):
        carregar(csv_path, 2024, db)

    db.add.assert_called_once()
    db.commit.assert_called()


def test_carregar_is_idempotent(tmp_path):
    csv_path = make_csv(tmp_path)
    db = MagicMock()
    municipio = MagicMock(); municipio.id = 1
    existing = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = existing  # already exists

    with patch("ingestao.carregar_ips.obter_ou_criar_municipio", return_value=municipio):
        carregar(csv_path, 2024, db)

    db.add.assert_not_called()


def test_carregar_filters_by_estado(tmp_path):
    csv_path = make_csv(tmp_path)
    db = MagicMock()
    municipio = MagicMock(); municipio.id = 1
    db.query.return_value.filter.return_value.first.return_value = None

    with patch("ingestao.carregar_ips.obter_ou_criar_municipio", return_value=municipio):
        carregar(csv_path, 2024, db, estado="SP")  # row is MG, should be skipped

    db.add.assert_not_called()
