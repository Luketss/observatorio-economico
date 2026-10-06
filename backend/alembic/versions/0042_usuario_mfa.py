"""usuario_mfa: segundo fator TOTP (1:1 com usuarios)

Segredo cifrado (Fernet), codigos de recuperacao (hashes bcrypt em JSON),
anti-replay por ultimo_passo_usado. Spec 2026-10-06-mfa-totp-admin-global.

Revision ID: 0042_usuario_mfa
Revises: 0041_demanda_status_historico
Create Date: 2026-10-06
"""

import sqlalchemy as sa
from alembic import op


revision = "0042_usuario_mfa"
down_revision = "0041_demanda_status_historico"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "usuario_mfa",
        sa.Column(
            "usuario_id", sa.Integer(),
            sa.ForeignKey("usuarios.id", ondelete="CASCADE"), primary_key=True,
        ),
        sa.Column("segredo_cifrado", sa.Text(), nullable=False),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("ativado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ultimo_passo_usado", sa.BigInteger(), nullable=True),
        sa.Column("codigos_recuperacao", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column(
            "criado_em", sa.DateTime(timezone=True),
            server_default=sa.func.now(), nullable=False,
        ),
        sa.Column(
            "atualizado_em", sa.DateTime(timezone=True),
            server_default=sa.func.now(), nullable=False,
        ),
    )


def downgrade():
    op.drop_table("usuario_mfa")
