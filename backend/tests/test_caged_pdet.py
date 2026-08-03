"""Agregação pura dos microdados do Novo CAGED — sem rede, sem DB.

Header real do PDET (validado 2026-08-02); saldomovimentação ±1 por linha;
EXC entra com sinal -1 no MESMO lado (admissão excluída decrementa admissões,
não vira desligamento)."""
import ftplib
import io
from datetime import date

import py7zr

from app.services.ingestao_automatica import caged_pdet
from app.services.ingestao_automatica.caged_pdet import (
    NAO_PUBLICADO,
    SEXO_MAP,
    agregar_arquivo,
    anos_completos,
    baixar_e_extrair,
    baixar_tolerante,
    meses_forexc,
    novo_agregados,
)

HEADER = (
    "competênciamov;região;uf;município;seção;subclasse;saldomovimentação;"
    "cbo2002ocupação;categoria;graudeinstrução;idade;horascontratuais;raçacor;"
    "sexo;tipoempregador;tipoestabelecimento;tipomovimentação;tipodedeficiência;"
    "indtrabintermitente;indtrabparcial;salário;tamestabjan;indicadoraprendiz;"
    "origemdainformação;competênciadec;indicadordeforadoprazo;"
    "unidadesaláriocódigo;valorsaláriofixo"
)


def _linha(comp="202506", mun="312230", secao="A", saldo="1", grau="7",
           idade="30", raca="3", sexo="1", tipo_emp="0", tipo_estab="1",
           tipo_mov="20", tipo_def="0", intermitente="0", parcial="0",
           sal="1500,00", tam="2", aprendiz="0", fora_prazo="0"):
    return (
        f"{comp};3;31;{mun};{secao};111302;{saldo};622020;101;{grau};{idade};44,00;"
        f"{raca};{sexo};{tipo_emp};{tipo_estab};{tipo_mov};{tipo_def};"
        f"{intermitente};{parcial};{sal};{tam};{aprendiz};1;{comp};{fora_prazo};5;{sal}"
    )


ALVO = {"312230": 42}
JANELA = {(2025, 6)}


def _agrega(linhas, sinal=1, agg=None):
    agg = agg or novo_agregados()
    agregar_arquivo(io.StringIO("\n".join([HEADER] + linhas)), ALVO, JANELA, agg, sinal)
    return agg


def test_admissao_e_desligamento_no_mensal():
    agg = _agrega([_linha(saldo="1"), _linha(saldo="1"), _linha(saldo="-1")])
    assert agg["mensal"][(42, 2025, 6)] == {"admissoes": 2, "desligamentos": 1}


def test_exc_decrementa_o_mesmo_lado():
    agg = _agrega([_linha(saldo="1"), _linha(saldo="1")])
    _agrega([_linha(saldo="1")], sinal=-1, agg=agg)  # exclusão de uma admissão
    assert agg["mensal"][(42, 2025, 6)] == {"admissoes": 1, "desligamentos": 0}


def test_fora_da_janela_e_fora_do_alvo_sao_ignorados():
    agg = _agrega([
        _linha(comp="202401"),          # fora da janela
        _linha(mun="355030"),           # fora do alvo
        _linha(),
    ])
    assert agg["mensal"] == {(42, 2025, 6): {"admissoes": 1, "desligamentos": 0}}


def test_mapa_sexo_novo_caged():
    # Novo CAGED: 1=Homem, 3=Mulher (a codificação antiga usava 2=Feminino)
    assert SEXO_MAP == {"1": "Masculino", "3": "Feminino"}
    agg = _agrega([_linha(sexo="1"), _linha(sexo="3"), _linha(sexo="9")])
    assert agg["por_sexo"][(42, 2025, 6, "Masculino")]["admissoes"] == 1
    assert agg["por_sexo"][(42, 2025, 6, "Feminino")]["admissoes"] == 1
    assert agg["por_sexo"][(42, 2025, 6, "Não informado")]["admissoes"] == 1


def test_salario_media_ponderada_com_sinal():
    agg = _agrega([_linha(sal="1000,00"), _linha(sal="2000,00")])
    _agrega([_linha(sal="2000,00")], sinal=-1, agg=agg)
    s = agg["salario"][(42, 2025, 6)]
    assert s["sum_adm"] == 1000.0 and s["cnt_adm"] == 1


def test_indicadores_anuais_e_pcd():
    agg = _agrega([
        _linha(parcial="1"),
        _linha(tipo_def="1", saldo="-1"),
        _linha(fora_prazo="1"),
        _linha(tipo_def="9"),  # Não Identificado NÃO conta como PCD
    ])
    ind = agg["indicadores"][(42, 2025)]
    assert ind["total"] == 4 and ind["parcial"] == 1
    assert ind["pcd"] == 1 and ind["fora_prazo"] == 1
    assert (42, 2025, 6, "Física") in agg["por_tipo_def"]


def test_cnae_faixa_etaria_e_tamanho_oficial():
    agg = _agrega([_linha(secao="C", idade="17", tam="10")])
    assert agg["por_cnae"][(42, 2025, 6, "C", "Indústrias de Transformação")]["admissoes"] == 1
    assert agg["por_faixa_etaria"][(42, 2025, 6, "Até 17 anos")]["admissoes"] == 1
    # tamestabjan oficial: 10 = "1000 ou Mais" (codificação antiga tinha 9=1000+)
    assert agg["por_tamanho"][(42, 2025, 6, "1000 ou mais")]["admissoes"] == 1


def test_linha_malformada_nao_derruba():
    agg = _agrega(["lixo;sem;colunas", _linha()])
    assert agg["mensal"][(42, 2025, 6)]["admissoes"] == 1


def test_grau_instrucao_completo():
    # Verifica que código "80" = "Pós-graduação completa" existe
    from app.services.ingestao_automatica.caged_pdet import GRAU_INSTRUCAO_MAP
    assert GRAU_INSTRUCAO_MAP["80"] == "Pós-graduação completa"


def test_nenhum_dado_descartado_nos_recortes():
    agg = _agrega([
        _linha(tam="99"), _linha(tam="123"), _linha(tipo_emp="9"),
        _linha(tipo_estab="9"), _linha(secao="Z"), _linha(secao=""),
    ])
    assert agg["por_tamanho"][(42, 2025, 6, "Ignorado")]["admissoes"] == 1
    assert agg["por_tamanho"][(42, 2025, 6, "Código 123")]["admissoes"] == 1
    assert agg["por_tipo_emp"][(42, 2025, 6, "Não informado")]["admissoes"] == 1
    assert agg["por_tipo_estab"][(42, 2025, 6, "Não informado")]["admissoes"] == 1
    assert agg["por_cnae"][(42, 2025, 6, "Z", "Z")]["admissoes"] == 1
    assert agg["por_cnae"][(42, 2025, 6, "?", "Não informada")]["admissoes"] == 1


def test_rotulo_grande_e_truncado_ao_limite_da_coluna():
    # tamanho: String(60) em app/models/caged.py — código cru inédito não pode
    # estourar a coluna do banco.
    codigo_grande = "9" * 70
    agg = _agrega([_linha(tam=codigo_grande)])
    rotulo_esperado = f"Código {codigo_grande}"[:60]
    assert len(rotulo_esperado) == 60
    chave = (42, 2025, 6, rotulo_esperado)
    assert agg["por_tamanho"][chave]["admissoes"] == 1


def test_anos_completos_exige_todos_os_meses_publicados():
    meses_2024 = {(2024, m) for m in range(1, 13)}
    # 2024 completo; 2025 até o último publicado (2025-06) completo
    ok = meses_2024 | {(2025, m) for m in range(1, 7)}
    assert anos_completos(ok, (2025, 6)) == [2024, 2025]
    # sem janeiro/2025, 2025 não é completo
    assert anos_completos(ok - {(2025, 1)}, (2025, 6)) == [2024]
    # janela parcial de 2024 (só dez) não recomputa 2024
    assert anos_completos({(2024, 12)} | {(2025, m) for m in range(1, 7)}, (2025, 6)) == [2025]


def test_meses_forexc_vai_da_janela_ate_o_mes_anterior_a_hoje():
    # janela = ano fechado 2024; FOR/EXC de exclusões tardias vão até 2026-06
    janela = [(2024, m) for m in range(1, 13)]
    meses = meses_forexc(janela, hoje=date(2026, 7, 15))
    assert meses[0] == (2024, 1) and meses[-1] == (2026, 6)
    assert len(meses) == 30


class _FtpInexistente:
    def __init__(self):
        self.cmds = []

    def retrbinary(self, cmd, cb):
        self.cmds.append(cmd)
        raise ftplib.error_perm("550 The system cannot find the file specified.")


def test_baixar_e_extrair_550_vira_none(tmp_path):
    ftp = _FtpInexistente()
    assert baixar_e_extrair(ftp, "MOV", 2026, 7, str(tmp_path)) is None
    assert ftp.cmds == ["RETR /pdet/microdados/NOVO CAGED/2026/202607/CAGEDMOV202607.7z"]
    assert list(tmp_path.iterdir()) == []  # nada de .7z parcial deixado para trás


def _bytes_7z_valido(tmp_path, nome_interno):
    """Monta um .7z real (via py7zr) contendo um único arquivo txt — usado
    para exercitar o baixar_e_extrair de verdade (sem mockar a extração)."""
    origem_dir = tmp_path / "origem_7z"
    origem_dir.mkdir()
    arquivo = origem_dir / nome_interno
    arquivo.write_text("dado\n", encoding="utf-8")
    caminho_7z = origem_dir / "pacote.7z"
    with py7zr.SevenZipFile(caminho_7z, "w") as z:
        z.write(str(arquivo), nome_interno)
    return caminho_7z.read_bytes()


class _FtpFalhaRede:
    """Falha transitória de rede (timeout) — não é 550, deve disparar reconexão."""

    def __init__(self):
        self.cmds = []
        self.closed = False

    def retrbinary(self, cmd, cb):
        self.cmds.append(cmd)
        raise ftplib.error_temp("421 timeout")

    def close(self):
        self.closed = True


class _FtpSucesso:
    def __init__(self, dados: bytes):
        self.dados = dados
        self.cmds = []

    def retrbinary(self, cmd, cb):
        self.cmds.append(cmd)
        cb(self.dados)


def test_baixar_tolerante_reconecta_apos_falha_transitoria(tmp_path, monkeypatch):
    dados = _bytes_7z_valido(tmp_path, "CAGEDMOV202607")
    ftp_ruim = _FtpFalhaRede()
    ftp_bom = _FtpSucesso(dados)
    monkeypatch.setattr(caged_pdet, "conectar_ftp", lambda: ftp_bom)
    destino = tmp_path / "destino"
    destino.mkdir()

    ftp, caminho, erro = baixar_tolerante(ftp_ruim, "MOV", 2026, 7, str(destino))

    assert ftp is ftp_bom
    assert erro is None
    assert caminho == str(destino / "CAGEDMOV202607")
    assert ftp_ruim.closed is True  # conexão ruim foi fechada antes de reconectar


def test_baixar_tolerante_falha_dupla_retorna_erro_de_rede(tmp_path, monkeypatch):
    ftp_ruim = _FtpFalhaRede()
    ftp_tambem_ruim = _FtpFalhaRede()
    monkeypatch.setattr(caged_pdet, "conectar_ftp", lambda: ftp_tambem_ruim)

    ftp, caminho, erro = baixar_tolerante(ftp_ruim, "MOV", 2026, 7, str(tmp_path))

    assert caminho is None
    assert erro and erro != NAO_PUBLICADO
    assert "421" in erro


def test_baixar_tolerante_550_retorna_nao_publicado(tmp_path):
    ftp = _FtpInexistente()

    ftp_retornado, caminho, erro = baixar_tolerante(ftp, "MOV", 2026, 7, str(tmp_path))

    assert ftp_retornado is ftp
    assert caminho is None
    assert erro == NAO_PUBLICADO


def test_baixar_tolerante_reconexao_impossivel_retorna_none(tmp_path, monkeypatch):
    # Regressão: se a rede ainda está fora quando conectar_ftp() é chamado de
    # novo, a função NÃO pode devolver a conexão original (já fechada) — o
    # chamador reusaria uma conexão morta no mês seguinte e cairia com
    # AttributeError (fora de ftplib.all_errors), derrubando o job inteiro.
    ftp_ruim = _FtpFalhaRede()

    def _reconectar_falha():
        raise ftplib.error_temp("421 reconexão falhou")

    monkeypatch.setattr(caged_pdet, "conectar_ftp", _reconectar_falha)

    ftp, caminho, erro = baixar_tolerante(ftp_ruim, "MOV", 2026, 7, str(tmp_path))

    assert ftp is None
    assert caminho is None
    assert erro and erro != NAO_PUBLICADO


def test_baixar_tolerante_reconecta_a_partir_de_none(tmp_path, monkeypatch):
    # Contrato pós-fix: ftp=None de entrada significa "reconecte antes de
    # tentar" — é o que o call-site em executar() faz naturalmente no mês
    # seguinte a uma reconexão impossível.
    dados = _bytes_7z_valido(tmp_path, "CAGEDMOV202607")
    ftp_bom = _FtpSucesso(dados)
    monkeypatch.setattr(caged_pdet, "conectar_ftp", lambda: ftp_bom)
    destino = tmp_path / "destino"
    destino.mkdir()

    ftp, caminho, erro = baixar_tolerante(None, "MOV", 2026, 7, str(destino))

    assert ftp is ftp_bom
    assert erro is None
    assert caminho == str(destino / "CAGEDMOV202607")
