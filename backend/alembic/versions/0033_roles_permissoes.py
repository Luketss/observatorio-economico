"""roles: municipio_id (catalogo hibrido), builtin e permissoes JSON

Roles builtin existentes sao marcadas e ADMIN_MUNICIPIO recebe todas as
permissoes (comportamento atual preservado). ADMIN_GLOBAL tem bypass em
codigo; VISUALIZADOR/ANALISTA ficam sem permissoes.

Revision ID: 0033_roles_permissoes
Revises: 0032_ingestao_job
Create Date: 2026-07-23
"""

import json

import sqlalchemy as sa
from alembic import op


revision = "0033_roles_permissoes"
down_revision = "0032_ingestao_job"
branch_labels = None
depends_on = None

# Copia literal de app.core.permissions.PERMISSOES_TODAS (migrations nao
# importam codigo da app — teste de paridade em test_permissions.py cobre
# a fonte; se as areas mudarem, nova migration de dados, nao editar esta).
PERMISSOES_TODAS = {
    area: ["criar", "editar", "excluir"]
    for area in (
        "projetos", "captacao", "funil", "escrita", "premiacoes",
        "retencao", "dados_internos", "mandato", "usuarios",
    )
}

BUILTIN = ("ADMIN_GLOBAL", "ADMIN_MUNICIPIO", "ANALISTA", "VISUALIZADOR")


def upgrade():
    op.add_column("roles", sa.Column("municipio_id", sa.Integer(), nullable=True))
    op.add_column(
        "roles",
        sa.Column("builtin", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "roles",
        sa.Column("permissoes", sa.JSON(), nullable=False, server_default="{}"),
    )
    op.create_foreign_key(
        "fk_roles_municipio_id",
        "roles",
        "municipios",
        ["municipio_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(op.f("ix_roles_municipio_id"), "roles", ["municipio_id"])

    conn = op.get_bind()
    conn.execute(
        sa.text("UPDATE roles SET builtin = true WHERE nome = ANY(:nomes)"),
        {"nomes": list(BUILTIN)},
    )
    conn.execute(
        sa.text("UPDATE roles SET permissoes = :p WHERE nome = 'ADMIN_MUNICIPIO'"),
        {"p": json.dumps(PERMISSOES_TODAS)},
    )


def downgrade():
    op.drop_index(op.f("ix_roles_municipio_id"), table_name="roles")
    op.drop_constraint("fk_roles_municipio_id", "roles", type_="foreignkey")
    op.drop_column("roles", "permissoes")
    op.drop_column("roles", "builtin")
    op.drop_column("roles", "municipio_id")
