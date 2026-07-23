"""add projeto_tarefa (checklist de projetos)

Tarefas do acompanhamento: titulo + prazo opcional + concluida.
FK com ondelete=CASCADE — some junto com o projeto (inclusive no bulk
delete do municipio_management, que nao dispara cascade Python).

Revision ID: 0034_projeto_tarefa
Revises: 0033_roles_permissoes
Create Date: 2026-07-23
"""

import sqlalchemy as sa
from alembic import op


revision = "0034_projeto_tarefa"
down_revision = "0033_roles_permissoes"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "projeto_tarefa",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("projeto_id", sa.Integer(), nullable=False),
        sa.Column("titulo", sa.String(length=255), nullable=False),
        sa.Column("prazo", sa.Date(), nullable=True),
        sa.Column("concluida", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "criado_em",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["projeto_id"], ["projetos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_projeto_tarefa_id"), "projeto_tarefa", ["id"], unique=False)
    op.create_index(
        op.f("ix_projeto_tarefa_projeto_id"), "projeto_tarefa", ["projeto_id"], unique=False
    )


def downgrade():
    op.drop_index(op.f("ix_projeto_tarefa_projeto_id"), table_name="projeto_tarefa")
    op.drop_index(op.f("ix_projeto_tarefa_id"), table_name="projeto_tarefa")
    op.drop_table("projeto_tarefa")
