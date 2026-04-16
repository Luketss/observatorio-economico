"""0013 add notificacoes and notificacoes_lidas tables

Revision ID: 0013_notificacoes
Revises: 0012_paid_to_pro_premium
Create Date: 2026-04-15
"""

from alembic import op
import sqlalchemy as sa

revision = "0013_notificacoes"
down_revision = "0012_paid_to_pro_premium"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "notificacoes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("titulo", sa.String(length=100), nullable=False),
        sa.Column("mensagem", sa.Text(), nullable=False),
        sa.Column("tipo", sa.String(length=20), nullable=False, server_default="info"),
        sa.Column("municipio_ids", sa.JSON(), nullable=True),
        sa.Column("criado_por", sa.Integer(), nullable=False),
        sa.Column(
            "criado_em",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("expira_em", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["criado_por"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_notificacoes_id"), "notificacoes", ["id"], unique=False)

    op.create_table(
        "notificacoes_lidas",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("notificacao_id", sa.Integer(), nullable=False),
        sa.Column("usuario_id", sa.Integer(), nullable=False),
        sa.Column(
            "lida_em",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["notificacao_id"], ["notificacoes.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["usuario_id"], ["usuarios.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("notificacao_id", "usuario_id", name="uq_notif_usuario"),
    )
    op.create_index(
        op.f("ix_notificacoes_lidas_id"), "notificacoes_lidas", ["id"], unique=False
    )


def downgrade():
    op.drop_index(op.f("ix_notificacoes_lidas_id"), table_name="notificacoes_lidas")
    op.drop_table("notificacoes_lidas")
    op.drop_index(op.f("ix_notificacoes_id"), table_name="notificacoes")
    op.drop_table("notificacoes")
