# Manutenção

## Adicionar novo dataset

1. **Model** — criar `backend/app/models/{dataset}.py` com a tabela SQLAlchemy e foreign key para `Municipio`
2. **Schema** — criar `backend/app/schemas/{dataset}.py` com os Pydantic models de resposta
3. **Router** — criar `backend/app/api/v1/routers/{dataset}.py` com os endpoints; filtrar por `municipio_id` para não-ADMIN_GLOBAL
4. **Registrar** — adicionar `app.include_router(...)` em `backend/app/main.py`
5. **Migração** — `alembic revision --autogenerate -m "add_{dataset}"` → revisar → `alembic upgrade head`
6. **Ingestão** — criar `ingestao/carregar_{dataset}.py` seguindo o padrão: `obter_ou_criar_municipio(db, nome, estado)` + `carregar_csv(db, caminho, estado)`; adicionar ao `LOADERS` em `carregar_tudo.py`

---

## Adicionar endpoint a dataset existente

1. Adicionar query no router existente
2. Adicionar schema se a resposta for nova
3. Não é necessário criar migração (dados já existem)

---

## Migrações

```bash
# Ver status
alembic current
alembic history --verbose

# Criar migração automática
alembic revision --autogenerate -m "descricao_curta"

# Aplicar
alembic upgrade head

# Reverter uma
alembic downgrade -1
```

IDs de revisão: usar formato `NNNN_descricao` com ≤ 32 caracteres.
`down_revision` deve apontar para a migração anterior na cadeia.

---

## Ingestão de dados

```bash
# Carregar todos os dados de MG
python -m ingestao.carregar_tudo --estado MG

# Carregar cidades específicas
python -m ingestao.carregar_tudo --estado MG --cidades Divinopolis "Para de Minas"

# Outro estado
python -m ingestao.carregar_tudo --estado MT --cidades Cuiaba
```

Cada loader individual também aceita `--estado`:

```bash
python -m ingestao.carregar_caged  # usa "MG" hardcoded no main() local
```

Para PIX, colocar CSVs em `dados/PIX/`.

---

## Adicionar novo estado

1. Adicionar CSVs dos datasets nas pastas existentes (ex: `dados/Arrecadacao_Cidades_MG/`) — ou criar sub-pastas por estado se preferir organizar assim
2. Executar: `python -m ingestao.carregar_tudo --estado XX --cidades CidadeA CidadeB`
3. O sistema cria o `Municipio` automaticamente com `estado="XX"` se não existir
4. Municípios são deduplicados por código IBGE (se disponível) ou por `(nome, estado)`

---

## Variáveis de ambiente

Arquivo `.env` na raiz do projeto:

```
DATABASE_URL=postgresql://user:pass@host/db
SECRET_KEY=chave-muito-secreta
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
CORS_ORIGINS=http://localhost:5173,https://meudominio.com
```

---

## Checklist de produção

- [ ] `SECRET_KEY` forte e única
- [ ] `CORS_ORIGINS` com domínios reais (sem `*`)
- [ ] `DATABASE_URL` apontando para banco de produção
- [ ] `alembic upgrade head` executado
- [ ] HTTPS ativo (Nginx + Let's Encrypt)
- [ ] Logs em nível `INFO`
