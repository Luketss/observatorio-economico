"""suporte_tickets e suporte_ticket_eventos: formulario de atendimento

Tickets abertos pelos usuarios e trilha append-only de eventos (abertura,
mudanca de status, anotacao interna).
Spec 2026-10-19-suporte-tickets, secao Modelo de dados.

Revision ID: 0045_suporte_tickets
Revises: 0044_usuario_mfa_email
Create Date: 2026-10-19
"""

import sqlalchemy as sa
from alembic import op


revision = "0045_suporte_tickets"
down_revision = "0044_usuario_mfa_email"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "suporte_tickets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("usuario_id", sa.Integer(), sa.ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True),
        sa.Column("usuario_nome", sa.String(length=150), nullable=False),
        sa.Column("usuario_email", sa.String(length=150), nullable=False),
        sa.Column("usuario_role", sa.String(length=50), nullable=False),
        sa.Column("municipio_id", sa.Integer(), sa.ForeignKey("municipios.id", ondelete="SET NULL"), nullable=True),
        sa.Column("municipio_nome", sa.String(length=150), nullable=True),
        sa.Column("mensagem", sa.Text(), nullable=False),
        sa.Column("whatsapp", sa.String(length=20), nullable=True),
        sa.Column("canal_preferido", sa.String(length=10), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("atualizado_em", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("primeiro_contato_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolvido_em", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_suporte_tickets_id", "suporte_tickets", ["id"])
    op.create_index("ix_suporte_tickets_usuario_id", "suporte_tickets", ["usuario_id"])
    op.create_index("ix_suporte_tickets_municipio_id", "suporte_tickets", ["municipio_id"])
    op.create_index("ix_suporte_tickets_status", "suporte_tickets", ["status"])
    op.create_index("ix_suporte_tickets_criado_em", "suporte_tickets", ["criado_em"])

    op.create_table(
        "suporte_ticket_eventos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ticket_id", sa.Integer(), sa.ForeignKey("suporte_tickets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tipo", sa.String(length=20), nullable=False),
        sa.Column("status_de", sa.String(length=20), nullable=True),
        sa.Column("status_para", sa.String(length=20), nullable=True),
        sa.Column("texto", sa.Text(), nullable=True),
        sa.Column("autor_id", sa.Integer(), sa.ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True),
        sa.Column("autor_email", sa.String(length=150), nullable=False),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_suporte_ticket_eventos_id", "suporte_ticket_eventos", ["id"])
    op.create_index("ix_suporte_ticket_eventos_ticket_id", "suporte_ticket_eventos", ["ticket_id"])
    op.create_index("ix_suporte_ticket_eventos_criado_em", "suporte_ticket_eventos", ["criado_em"])


def downgrade():
    op.drop_index("ix_suporte_ticket_eventos_criado_em", table_name="suporte_ticket_eventos")
    op.drop_index("ix_suporte_ticket_eventos_ticket_id", table_name="suporte_ticket_eventos")
    op.drop_index("ix_suporte_ticket_eventos_id", table_name="suporte_ticket_eventos")
    op.drop_table("suporte_ticket_eventos")
    op.drop_index("ix_suporte_tickets_criado_em", table_name="suporte_tickets")
    op.drop_index("ix_suporte_tickets_status", table_name="suporte_tickets")
    op.drop_index("ix_suporte_tickets_municipio_id", table_name="suporte_tickets")
    op.drop_index("ix_suporte_tickets_usuario_id", table_name="suporte_tickets")
    op.drop_index("ix_suporte_tickets_id", table_name="suporte_tickets")
    op.drop_table("suporte_tickets")
