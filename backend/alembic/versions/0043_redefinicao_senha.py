"""redefinicao_senha: tokens de "esqueci minha senha" (hash SHA-256, 30 min, uso unico)

Spec 2026-10-06-email-resend-redefinicao-mfa, secao 2.

Revision ID: 0043_redefinicao_senha
Revises: 0042_usuario_mfa
Create Date: 2026-10-06
"""

import sqlalchemy as sa
from alembic import op


revision = "0043_redefinicao_senha"
down_revision = "0042_usuario_mfa"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "redefinicao_senha",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "usuario_id", sa.Integer(),
            sa.ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expira_em", sa.DateTime(timezone=True), nullable=False),
        sa.Column("usado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column(
            "criado_em", sa.DateTime(timezone=True),
            server_default=sa.func.now(), nullable=False,
        ),
    )
    op.create_index("ix_redefinicao_senha_id", "redefinicao_senha", ["id"])
    op.create_index("ix_redefinicao_senha_usuario_id", "redefinicao_senha", ["usuario_id"])
    op.create_index("ix_redefinicao_senha_token_hash", "redefinicao_senha", ["token_hash"], unique=True)


def downgrade():
    op.drop_index("ix_redefinicao_senha_token_hash", table_name="redefinicao_senha")
    op.drop_index("ix_redefinicao_senha_usuario_id", table_name="redefinicao_senha")
    op.drop_index("ix_redefinicao_senha_id", table_name="redefinicao_senha")
    op.drop_table("redefinicao_senha")
