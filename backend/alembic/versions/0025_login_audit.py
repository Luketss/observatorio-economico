"""login audit table + usuarios.last_login

Records every login attempt (success and failure) for security inspection,
and tracks the last successful login per user. Auth remains stateless JWT —
this is an audit trail, not a session store.

Revision ID: 0025_login_audit
Revises: 0024_dataset_unique_constraints
Create Date: 2026-05-20
"""

import sqlalchemy as sa
from alembic import op


revision = "0025_login_audit"
down_revision = "0024_dataset_unique_constraints"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "login_audit",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "usuario_id",
            sa.Integer(),
            sa.ForeignKey("usuarios.id"),
            nullable=True,
        ),
        sa.Column("email_tentado", sa.String(length=150), nullable=False),
        sa.Column("sucesso", sa.Boolean(), nullable=False),
        sa.Column("motivo", sa.String(length=50), nullable=True),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.Column(
            "criado_em",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_login_audit_id", "login_audit", ["id"])
    op.create_index("ix_login_audit_usuario_id", "login_audit", ["usuario_id"])
    op.create_index("ix_login_audit_email_tentado", "login_audit", ["email_tentado"])
    op.create_index("ix_login_audit_criado_em", "login_audit", ["criado_em"])

    op.add_column(
        "usuarios",
        sa.Column("last_login", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade():
    op.drop_column("usuarios", "last_login")
    op.drop_index("ix_login_audit_criado_em", table_name="login_audit")
    op.drop_index("ix_login_audit_email_tentado", table_name="login_audit")
    op.drop_index("ix_login_audit_usuario_id", table_name="login_audit")
    op.drop_index("ix_login_audit_id", table_name="login_audit")
    op.drop_table("login_audit")
