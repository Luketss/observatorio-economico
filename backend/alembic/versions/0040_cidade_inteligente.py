"""cidade inteligente: certificacoes de cidade e requisitos

Revision ID: 0040_cidade_inteligente
Revises: 0039_marco_link
Create Date: 2026-08-20

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0040_cidade_inteligente'
down_revision = '0039_marco_link'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('certificacao_cidade',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('municipio_id', sa.Integer(), nullable=False),
    sa.Column('nome', sa.String(length=150), nullable=False),
    sa.Column('entidade', sa.String(length=100), nullable=True),
    sa.Column('descricao', sa.Text(), nullable=True),
    sa.Column('ativo', sa.Boolean(), nullable=True),
    sa.Column('criado_em', sa.DateTime(timezone=True), nullable=False),
    sa.Column('atualizado_em', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['municipio_id'], ['municipios.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_certificacao_cidade_id'), 'certificacao_cidade', ['id'], unique=False)
    op.create_index(op.f('ix_certificacao_cidade_municipio_id'), 'certificacao_cidade', ['municipio_id'], unique=False)

    op.create_table('certificacao_requisito',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('certificacao_id', sa.Integer(), nullable=False),
    sa.Column('titulo', sa.String(length=200), nullable=False),
    sa.Column('categoria', sa.String(length=100), nullable=True),
    sa.Column('status', sa.String(length=20), nullable=False, server_default='pendente'),
    sa.Column('responsavel', sa.String(length=120), nullable=True),
    sa.Column('evidencia_url', sa.Text(), nullable=True),
    sa.Column('evidencia_nota', sa.Text(), nullable=True),
    sa.Column('criado_em', sa.DateTime(timezone=True), nullable=False),
    sa.Column('atualizado_em', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['certificacao_id'], ['certificacao_cidade.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_certificacao_requisito_certificacao_id'), 'certificacao_requisito', ['certificacao_id'], unique=False)
    op.create_index(op.f('ix_certificacao_requisito_id'), 'certificacao_requisito', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_certificacao_requisito_id'), table_name='certificacao_requisito')
    op.drop_index(op.f('ix_certificacao_requisito_certificacao_id'), table_name='certificacao_requisito')
    op.drop_table('certificacao_requisito')

    op.drop_index(op.f('ix_certificacao_cidade_municipio_id'), table_name='certificacao_cidade')
    op.drop_index(op.f('ix_certificacao_cidade_id'), table_name='certificacao_cidade')
    op.drop_table('certificacao_cidade')
