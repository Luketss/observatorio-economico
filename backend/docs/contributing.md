# Contribuição

## Fluxo para nova feature

1. Criar branch a partir de `develop`
2. Implementar: model → schema → router → registrar em main.py → migração
3. Testar manualmente via `/docs` (Swagger)
4. Abrir PR para `develop`
5. Após validação, merge para `main`

---

## Padrões de código

**Router** — thin controller, query direta SQLAlchemy:
```python
@router.get("/serie", response_model=List[Schema])
def serie(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    query = db.query(Model)
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(Model.municipio_id == current_user.municipio_id)
    return query.order_by(Model.ano).all()
```

**Schema** — Pydantic com `model_config = ConfigDict(from_attributes=True)` quando serializa ORM:
```python
class MeuItem(BaseModel):
    ano: int
    valor: float
    model_config = ConfigDict(from_attributes=True)
```

**Model** — sempre com FK para `municipio_id`:
```python
class MeuDataset(Base):
    __tablename__ = "meu_dataset"
    id: Mapped[int] = mapped_column(primary_key=True)
    municipio_id: Mapped[int] = mapped_column(ForeignKey("municipios.id"), index=True)
    ano: Mapped[int]
```

---

## Padrões de commit

```
feat: adiciona endpoint /comex/por_produto
fix: corrige filtro municipio_id em /rais/serie
refactor: simplifica query de comparativo
docs: atualiza guia de manutenção
migration: add tabela pix_mensais
```

---

## O que NÃO fazer

- Não colocar `estado="MG"` hardcoded em nenhum loader — usar o parâmetro `estado`
- Não usar `allow_origins=["*"]` com `allow_credentials=True` no CORS
- Não criar migração sem `down_revision` correto
- Não remover campos de modelos sem migração `drop_column`
- Não retornar dados de outros municípios para `VISUALIZADOR` ou `ADMIN_MUNICIPIO`

---

## Revisão antes do merge

- [ ] Filtro `municipio_id` presente nos endpoints de dados?
- [ ] Schema tem todos os campos que o frontend espera?
- [ ] Migração tem `down_revision` apontando para a migração anterior?
- [ ] `main.py` registra o novo router?
- [ ] Loader adicionado ao `LOADERS` em `carregar_tudo.py`?
