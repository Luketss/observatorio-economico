"""prioridades: permissao para ADMIN_MUNICIPIO builtin (data-only)

Concede a area "prioridades" (todos os verbos, paridade com
app.core.permissions.PERMISSOES_TODAS/seed; o backend consulta apenas
"editar") a role builtin ADMIN_MUNICIPIO. Zero mudanca de schema.

Revision ID: 0035_prioridades_permissao
Revises: 0034_projeto_tarefa
Create Date: 2026-07-25
"""

import json

import sqlalchemy as sa
from alembic import op


revision = "0035_prioridades_permissao"
down_revision = "0034_projeto_tarefa"
branch_labels = None
depends_on = None

# Copia literal (migrations nao importam codigo da app).
PRIORIDADES_VERBOS = ["criar", "editar", "excluir"]


def _carregar(conn):
    row = conn.execute(
        sa.text(
            "SELECT id, permissoes FROM roles "
            "WHERE nome = 'ADMIN_MUNICIPIO' AND builtin = true"
        )
    ).first()
    if row is None:
        return None, None
    permissoes = row.permissoes
    if not isinstance(permissoes, dict):
        permissoes = json.loads(permissoes or "{}")
    return row.id, permissoes


def upgrade():
    conn = op.get_bind()
    role_id, permissoes = _carregar(conn)
    if role_id is None:
        return  # sem builtin ADMIN_MUNICIPIO (banco vazio): seed cobre
    permissoes["prioridades"] = PRIORIDADES_VERBOS
    conn.execute(
        sa.text("UPDATE roles SET permissoes = :p WHERE id = :id"),
        {"p": json.dumps(permissoes), "id": role_id},
    )


def downgrade():
    conn = op.get_bind()
    role_id, permissoes = _carregar(conn)
    if role_id is None:
        return
    permissoes.pop("prioridades", None)
    conn.execute(
        sa.text("UPDATE roles SET permissoes = :p WHERE id = :id"),
        {"p": json.dumps(permissoes), "id": role_id},
    )
