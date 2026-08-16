"""acao_audit table + login_audit FK ondelete

Trilha de acoes administrativas (CRUD de usuarios) e leituras de dados
pessoais (listagens). Tambem corrige a FK login_audit.usuario_id para
SET NULL — sem isso, hard delete de usuario com historico de login
estoura FK.

Revision ID: 0037_acao_audit
Revises: 0036_ingestao_arquivo
Create Date: 2026-08-16
"""

import sqlalchemy as sa
from alembic import op


revision = "0037_acao_audit"
down_revision = "0036_ingestao_arquivo"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "acao_audit",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("categoria", sa.String(length=10), nullable=False),
        sa.Column("acao", sa.String(length=40), nullable=False),
        sa.Column(
            "ator_id", sa.Integer(),
            sa.ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column("ator_email", sa.String(length=150), nullable=False),
        sa.Column(
            "alvo_usuario_id", sa.Integer(),
            sa.ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column("alvo_email", sa.String(length=150), nullable=True),
        sa.Column(
            "municipio_id", sa.Integer(),
            sa.ForeignKey("municipios.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column("detalhe", sa.Text(), nullable=True),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.Column(
            "criado_em", sa.DateTime(timezone=True),
            server_default=sa.func.now(), nullable=False,
        ),
    )
    for col in ("id", "categoria", "acao", "ator_id", "alvo_usuario_id", "criado_em"):
        op.create_index(f"ix_acao_audit_{col}", "acao_audit", [col])

    op.drop_constraint("login_audit_usuario_id_fkey", "login_audit", type_="foreignkey")
    op.create_foreign_key(
        "login_audit_usuario_id_fkey", "login_audit", "usuarios",
        ["usuario_id"], ["id"], ondelete="SET NULL",
    )


def downgrade():
    op.drop_constraint("login_audit_usuario_id_fkey", "login_audit", type_="foreignkey")
    op.create_foreign_key(
        "login_audit_usuario_id_fkey", "login_audit", "usuarios",
        ["usuario_id"], ["id"],
    )
    for col in ("criado_em", "alvo_usuario_id", "ator_id", "acao", "categoria", "id"):
        op.drop_index(f"ix_acao_audit_{col}", table_name="acao_audit")
    op.drop_table("acao_audit")
