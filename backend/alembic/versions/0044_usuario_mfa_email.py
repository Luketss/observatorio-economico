"""usuario_mfa: metodo email (codigo HMAC por e-mail) alem do TOTP

segredo_cifrado passa a aceitar NULL (metodo="email"); colunas do codigo por e-mail.
Spec 2026-10-06-email-resend-redefinicao-mfa, secao 3.

Revision ID: 0044_usuario_mfa_email
Revises: 0043_redefinicao_senha
Create Date: 2026-10-06
"""

import sqlalchemy as sa
from alembic import op


revision = "0044_usuario_mfa_email"
down_revision = "0043_redefinicao_senha"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column("usuario_mfa", "segredo_cifrado", existing_type=sa.Text(), nullable=True)
    op.add_column("usuario_mfa", sa.Column("metodo", sa.String(length=10), nullable=False, server_default="totp"))
    op.add_column("usuario_mfa", sa.Column("codigo_hash", sa.String(length=64), nullable=True))
    op.add_column("usuario_mfa", sa.Column("codigo_expira_em", sa.DateTime(timezone=True), nullable=True))
    op.add_column("usuario_mfa", sa.Column("codigo_enviado_em", sa.DateTime(timezone=True), nullable=True))
    op.add_column("usuario_mfa", sa.Column("codigo_tentativas", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("usuario_mfa", sa.Column("codigo_reenvios", sa.Integer(), nullable=False, server_default="0"))


def downgrade():
    # Cadastros por e-mail nao tem segredo TOTP: nao sobrevivem ao NOT NULL de volta.
    usuario_mfa = sa.table("usuario_mfa", sa.column("segredo_cifrado", sa.Text()))
    op.execute(usuario_mfa.delete().where(usuario_mfa.c.segredo_cifrado.is_(None)))
    op.drop_column("usuario_mfa", "codigo_reenvios")
    op.drop_column("usuario_mfa", "codigo_tentativas")
    op.drop_column("usuario_mfa", "codigo_enviado_em")
    op.drop_column("usuario_mfa", "codigo_expira_em")
    op.drop_column("usuario_mfa", "codigo_hash")
    op.drop_column("usuario_mfa", "metodo")
    op.alter_column("usuario_mfa", "segredo_cifrado", existing_type=sa.Text(), nullable=False)
