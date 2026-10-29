"""captacao_recurso, escrita_projeto, premiacao: escopo global

Registros globais (cadastrados pelo ADMIN_GLOBAL) ficam sem municipio_id e
com escopo = 'global'; aparecem para todos os municipios. Registros
existentes recebem escopo = 'municipal' pelo server_default e nao mudam.

Revision ID: 0046_certificacoes_escopo_global
Revises: 0044_usuario_mfa_email
Create Date: 2026-10-28
"""

import sqlalchemy as sa
from alembic import op


revision = "0046_certificacoes_escopo_global"
down_revision = "0044_usuario_mfa_email"
branch_labels = None
depends_on = None

TABELAS = ("captacao_recurso", "escrita_projeto", "premiacao")


def upgrade():
    for tabela in TABELAS:
        with op.batch_alter_table(tabela) as batch:
            batch.add_column(
                sa.Column("escopo", sa.String(length=10), nullable=False, server_default="municipal")
            )
            batch.alter_column("municipio_id", existing_type=sa.Integer(), nullable=True)
            batch.create_check_constraint(
                f"ck_{tabela}_escopo_municipio",
                "(escopo = 'global' AND municipio_id IS NULL) OR "
                "(escopo = 'municipal' AND municipio_id IS NOT NULL)",
            )


def downgrade():
    # Registros globais nao tem municipio e nao cabem no esquema antigo
    # (municipio_id NOT NULL). Em vez de apagar dados em silencio, o
    # downgrade recusa enquanto existirem; remova-os conscientemente antes.
    conn = op.get_bind()
    for tabela in TABELAS:
        total = conn.execute(
            sa.text(f"SELECT COUNT(*) FROM {tabela} WHERE escopo = 'global'")
        ).scalar()
        if total:
            raise RuntimeError(
                f"{tabela} tem {total} registro(s) global(is); remova-os "
                "(e os vinculos de escrita_projeto.oportunidade_captacao_id) antes do downgrade."
            )
    for tabela in TABELAS:
        with op.batch_alter_table(tabela) as batch:
            batch.drop_constraint(f"ck_{tabela}_escopo_municipio", type_="check")
            batch.alter_column("municipio_id", existing_type=sa.Integer(), nullable=False)
            batch.drop_column("escopo")
