"""Comando local `python -m app.coletar_cnpj` (sem rede, SQLite em memoria).

O advisory lock do Postgres (`pg_advisory_xact_lock(hashtext(...))`) nao existe
no SQLite: registramos funcoes SQL no-op na conexao para o criar_job rodar."""
from unittest.mock import patch

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.coletar_cnpj as cmd
from app.db.base import Base
import app.models  # noqa: F401  (registra todas as tabelas)
from app.models.ingestao_job import IngestaoJob
from app.models.municipio import Municipio
from app.models.role import Role
from app.models.usuario import Usuario
from app.services.ingestao_automatica.runner import criar_job


@pytest.fixture()
def Sessao():
    engine = create_engine("sqlite://", poolclass=StaticPool,
                           connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def _fns(conn, _rec):
        conn.create_function("pg_advisory_xact_lock", 1, lambda _x: None)
        conn.create_function("hashtext", 1, lambda _x: 0)

    Base.metadata.create_all(engine)
    S = sessionmaker(bind=engine, autoflush=False)
    db = S()
    admin_role = Role(nome="ADMIN_GLOBAL", builtin=True, permissoes={})
    viz_role = Role(nome="VISUALIZADOR", builtin=True, permissoes={})
    db.add_all([admin_role, viz_role])
    db.flush()
    db.add_all([
        Municipio(id=12, nome="Divinopolis", estado="MG", ativo=True),
        Municipio(id=13, nome="Divino das Laranjeiras", estado="MG", ativo=True),
        Municipio(id=14, nome="Divinopolis Inativa", estado="MG", ativo=False),
        Municipio(id=15, nome="Outra", estado="SP", ativo=True),
        Usuario(nome="A", email="admin@x.com", senha_hash="x", role_id=admin_role.id, ativo=True),
        Usuario(nome="I", email="inativo@x.com", senha_hash="x", role_id=admin_role.id, ativo=False),
        Usuario(nome="V", email="viz@x.com", senha_hash="x", role_id=viz_role.id, ativo=True),
    ])
    db.commit()
    db.close()
    with patch.object(cmd, "SessionLocal", S):
        yield S


def _jobs(S):
    db = S()
    try:
        return db.query(IngestaoJob).all()
    finally:
        db.close()


def test_listar_imprime_municipios_ativos_e_nao_cria_job(Sessao, capsys):
    with patch.object(cmd, "_executar_job") as ex:
        assert cmd.main(["--listar", "divin"]) == 0
    out = capsys.readouterr().out
    assert "12" in out and "Divinopolis" in out and "Divino das Laranjeiras" in out
    assert "MG" in out and "Inativa" not in out and "Outra" not in out
    assert _jobs(Sessao) == []
    ex.assert_not_called()


@pytest.mark.parametrize("email", ["nao@existe.com", "inativo@x.com", "viz@x.com"])
def test_email_invalido_sai_com_2_sem_job(Sessao, capsys, email):
    with patch.object(cmd, "_executar_job") as ex:
        with pytest.raises(SystemExit) as e:
            cmd.main(["--email", email, "--municipio-id", "12"])
    assert e.value.code == 2
    assert capsys.readouterr().err.strip()
    assert _jobs(Sessao) == []
    ex.assert_not_called()


def test_caminho_feliz_cria_job_executando_e_executa_uma_vez(Sessao, capsys):
    estado = {}

    def fake_exec(job_id, ja_reivindicado=False):
        db = Sessao()
        j = db.get(IngestaoJob, job_id)
        estado["status_na_execucao"] = j.status
        j.status = "concluido"
        j.resumo = {"municipios_ok": 2, "linhas": 99, "erros": []}
        db.commit()
        db.close()

    with patch.object(cmd, "_executar_job", side_effect=fake_exec) as ex:
        rc = cmd.main(["--email", "admin@x.com", "--municipio-id", "12", "--municipio-id", "13"])
    assert rc == 0
    (job,) = _jobs(Sessao)
    assert estado["status_na_execucao"] == "executando"  # nunca 'pendente'
    assert job.dataset == "cnpj"
    assert job.filtros == {"municipio_ids": [12, 13], "notificar": False}
    assert job.iniciado_em is not None and job.atualizado_em is not None
    ex.assert_called_once_with(job.id, ja_reivindicado=True)
    assert "concluido" in capsys.readouterr().out


def test_job_terminando_em_erro_devolve_1(Sessao):
    def fake_exec(job_id, ja_reivindicado=False):
        db = Sessao()
        j = db.get(IngestaoJob, job_id)
        j.status, j.erro = "erro", "boom"
        db.commit()
        db.close()

    with patch.object(cmd, "_executar_job", side_effect=fake_exec):
        assert cmd.main(["--email", "admin@x.com", "--municipio-id", "12"]) == 1


def test_job_ativo_existente_devolve_1_com_mensagem_do_409(Sessao, capsys):
    db = Sessao()
    from app.services.ingestao_automatica.runner import _agora
    db.add(IngestaoJob(dataset="pib", status="executando", atualizado_em=_agora()))
    db.commit()
    db.close()
    # SQLite devolve datetimes sem tz; job_orfao compara com agora (aware) -> fixa 'nao orfao'
    with patch.object(cmd, "_executar_job") as ex,             patch("app.services.ingestao_automatica.runner.job_orfao", return_value=False):
        with pytest.raises(SystemExit) as e:
            cmd.main(["--email", "admin@x.com", "--municipio-id", "12"])
    assert e.value.code == 1
    assert "Já existe uma execução em andamento" in capsys.readouterr().err
    assert len(_jobs(Sessao)) == 1
    ex.assert_not_called()


def test_municipio_inexistente_devolve_1(Sessao, capsys):
    with pytest.raises(SystemExit) as e:
        cmd.main(["--email", "admin@x.com", "--municipio-id", "999"])
    assert e.value.code == 1
    assert "Nenhum município ativo" in capsys.readouterr().err


def test_criar_job_nao_reivindicado_continua_pendente(Sessao):
    db = Sessao()
    job = criar_job(db, "cnpj", {"municipio_ids": [12]}, usuario_id=None, reivindicado=False)
    assert job.status == "pendente" and job.iniciado_em is None
    db.close()
