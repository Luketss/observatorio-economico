"""demanda_status_historico: transicoes de status das demandas (Gestao Empresarial)

Revision ID: 0041_demanda_status_historico
Revises: 0040_cidade_inteligente
Create Date: 2026-09-03

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0041_demanda_status_historico'
down_revision = '0040_cidade_inteligente'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('demanda_status_historico',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('demanda_id', sa.Integer(), nullable=False),
    sa.Column('municipio_id', sa.Integer(), nullable=False),
    sa.Column('de', sa.String(length=20), nullable=True),
    sa.Column('para', sa.String(length=20), nullable=False),
    sa.Column('alterado_por', sa.Integer(), nullable=True),
    sa.Column('alterado_em', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['alterado_por'], ['usuarios.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['demanda_id'], ['demanda_empresa.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['municipio_id'], ['municipios.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_demanda_status_historico_demanda_id'), 'demanda_status_historico', ['demanda_id'], unique=False)
    op.create_index(op.f('ix_demanda_status_historico_id'), 'demanda_status_historico', ['id'], unique=False)
    op.create_index(op.f('ix_demanda_status_historico_municipio_id'), 'demanda_status_historico', ['municipio_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_demanda_status_historico_municipio_id'), table_name='demanda_status_historico')
    op.drop_index(op.f('ix_demanda_status_historico_id'), table_name='demanda_status_historico')
    op.drop_index(op.f('ix_demanda_status_historico_demanda_id'), table_name='demanda_status_historico')
    op.drop_table('demanda_status_historico')
