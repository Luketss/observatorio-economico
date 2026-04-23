# Contributing Guide — Backend
Observatório Econômico

---

## Regras Gerais

- Controllers devem ser thin — queries SQLAlchemy diretas, sem lógica de negócio complexa
- Todo endpoint de dados deve filtrar por `municipio_id` para non-ADMIN_GLOBAL
- Nunca hardcodar `estado="MG"` — usar o parâmetro recebido
- Nunca usar `allow_origins=["*"]` com `allow_credentials=True`
- Toda nova tabela precisa de migração Alembic

---

## Fluxo para Nova Feature

```
1. app/models/{dataset}.py          ← ORM model com FK para municipios.id
2. app/schemas/{dataset}.py         ← Pydantic schemas de resposta
3. app/api/v1/routers/{dataset}.py  ← endpoints com filtro municipio_id
4. app/main.py                      ← registrar router
5. alembic revision --autogenerate  ← criar migração
6. alembic upgrade head             ← aplicar
7. ingestao/carregar_{dataset}.py   ← script de ingestão
8. ingestao/carregar_tudo.py        ← adicionar ao LOADERS
```

---

## Padrão de Router

```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.api.deps import get_db, get_current_user
from app.models.meu_dataset import MeuModel
from app.schemas.meu_dataset import MeuSchema

router = APIRouter(prefix="/meu_dataset", tags=["Meu Dataset"])

@router.get("/serie", response_model=List[MeuSchema])
def serie(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    query = db.query(MeuModel)
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(MeuModel.municipio_id == current_user.municipio_id)
    return query.order_by(MeuModel.ano).all()
```

---

## Padrão de Loader de Ingestão

```python
BASE_PATH = "dados/Meu_Dataset_Pasta"

def obter_ou_criar_municipio(db, nome, estado, codigo_ibge=None):
    if codigo_ibge:
        m = db.query(Municipio).filter(Municipio.codigo_ibge == codigo_ibge).first()
        if m:
            return m
    m = db.query(Municipio).filter(Municipio.nome == nome, Municipio.estado == estado).first()
    if not m:
        m = Municipio(nome=nome, estado=estado, codigo_ibge=codigo_ibge, ativo=True)
        db.add(m); db.commit(); db.refresh(m)
    return m

def carregar_csv(db, caminho, estado):
    ...

def main():
    db = SessionLocal()
    try:
        for arquivo in os.listdir(BASE_PATH):
            if arquivo.endswith(".csv"):
                carregar_csv(db, os.path.join(BASE_PATH, arquivo), "MG")
    finally:
        db.close()
```

---

## Padrão de Commit

```
feat: adiciona endpoint /comex/por_produto com filtro estado
fix: corrige filtro municipio_id em /rais/serie para ADMIN_MUNICIPIO
refactor: simplifica query de comparativo arrecadacao
docs: atualiza guia de manutenção com fluxo multi-estado
migration: add tabela notificacoes e notificacoes_lidas
```

---

## Checklist de Revisão

Antes de abrir PR:

- [ ] Filtro `municipio_id` presente em todos os endpoints de dados?
- [ ] Schema cobre todos os campos que o frontend usa?
- [ ] `down_revision` da migração aponta para a migração anterior correta?
- [ ] Loader adicionado ao `LOADERS` em `carregar_tudo.py`?
- [ ] `BASE_PATH` definido no loader (necessário para `run_loader`)?
- [ ] Testado manualmente em `/docs`?
- [ ] Sem `estado="MG"` hardcoded em loaders?
