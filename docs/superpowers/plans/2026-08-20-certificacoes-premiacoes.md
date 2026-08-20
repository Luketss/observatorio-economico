# Certificações e Premiações (Fase 4) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shell "Certificações e Premiações" com abas que navegam entre as 5 rotas existentes (Premiações, Captação, Escrita, Dinheiro na Mesa, Emendas), item único na sidebar e guards de view-as unificados.

**Architecture:** Backend primeiro (3 GETs ganham `municipio_id` para ADMIN_GLOBAL, espelho do `listar_retencao` da F3 — zero migração); depois o shell (`CertificacoesShell` com `NidTabBar` dirigido por rota) envolve as 5 rotas no `AppRouter`; a sidebar troca o grupo por item único com flag nova `oculto` preservando `NAV_FLAT`; por fim as 5 telas perdem header/wrapper próprios e as 3 CRUD adotam o guard `needsMunicipio`.

**Tech Stack:** React 19 + react-router-dom v7 (useLocation/useNavigate), NidTabBar existente; FastAPI (Query param); Vitest/jsdom + pytest (fixture sqlite estilo da casa).

**Spec:** `docs/superpowers/specs/2026-08-20-certificacoes-premiacoes-design.md`

## Global Constraints

- **Nenhuma URL muda; nenhum redirect novo; chaves de plano e áreas de permissão intocadas.** ROTA_MODULO do teste de invariantes NÃO muda; NAV_FLAT continua com 32 itens.
- **Zero migração.** Backend só adiciona `municipio_id` Query aos 3 GETs de listagem (padrão exato do `listar_retencao` atual no mesmo arquivo).
- **Conteúdo interno das 5 telas byte-idêntico** fora de: header/wrapper removidos, sub-row nova (DnM/Emendas), guard (3 CRUD) e flags `!isGlobal` em canEditar/canExcluir.
- Gates: backend `venv/Scripts/python -m pytest backend/tests -q` da RAIZ (baseline 430); front `npx vitest run` de `frontend-observatorio/` (baseline 278). **pytest sempre via Bash tool (git-bash), nunca PowerShell.**
- `git add` caminho a caminho — NUNCA `-A`/`.` (proibidos: .claude/, dados/, node_modules/).
- Lint não é gate: novos limpos (exceto falso-positivo `motion unused` em arquivos com motion.div); modificados sem erro NOVO vs base.
- Copy pt-BR; commits convencionais + trailers padrão da sessão.

---

### Task 1: Backend — view-as nos 3 GETs de listagem

**Files:**
- Modify: `backend/app/api/v1/routers/desenvolvimento_economico.py` (handlers `listar_captacao` ~linha 269, `listar_escrita` ~333, `listar_premiacoes` ~397 — versão atual)
- Test: `backend/tests/test_certificacoes_view_as.py`

**Interfaces:**
- Consumes: `Query` já importado (F3); `_apply_tenant` deixa de ser usado nesses 3 (continua usado pelo funil).
- Produces (Task 4 depende): `GET /captacao|/escrita|/premiacoes` aceitam `?municipio_id=` honrado SÓ para ADMIN_GLOBAL (não-global ignora; global sem param vê tudo — comportamento atual preservado).

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `backend/tests/test_certificacoes_view_as.py`:

```python
"""View-as (municipio_id) nas listagens de captação, escrita e premiações —
espelho do comportamento do listar_retencao (F3)."""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.db.base import Base
from app.models.desenvolvimento_economico import (
    CaptacaoRecurso, EscritaProjeto, Premiacao,
)
from app.models.municipio import Municipio
from app.models.role import Role
from app.models.usuario import Usuario


@pytest.fixture()
def ctx():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine, tables=[
        Municipio.__table__, Role.__table__, Usuario.__table__,
        CaptacaoRecurso.__table__, EscritaProjeto.__table__, Premiacao.__table__,
    ])
    db = sessionmaker(bind=engine)()
    role_g = Role(nome="ADMIN_GLOBAL", builtin=True, permissoes={})
    role_m = Role(nome="GESTOR", builtin=False, permissoes={})
    m1 = Municipio(nome="Alfa", estado="MG")
    m2 = Municipio(nome="Beta", estado="MG")
    db.add_all([role_g, role_m, m1, m2])
    db.flush()
    admin = Usuario(nome="G", email="g@x.com", senha_hash="x", role_id=role_g.id)
    u1 = Usuario(nome="U1", email="u1@x.com", senha_hash="x", role_id=role_m.id, municipio_id=m1.id)
    db.add_all([admin, u1])
    db.add_all([
        CaptacaoRecurso(municipio_id=m1.id, titulo="Edital Alfa"),
        CaptacaoRecurso(municipio_id=m2.id, titulo="Edital Beta"),
        EscritaProjeto(municipio_id=m1.id, titulo="Projeto Alfa"),
        EscritaProjeto(municipio_id=m2.id, titulo="Projeto Beta"),
        Premiacao(municipio_id=m1.id, titulo="Prêmio Alfa"),
        Premiacao(municipio_id=m2.id, titulo="Prêmio Beta"),
    ])
    db.commit()
    yield db, admin, u1, m1, m2
    db.close()


def test_captacao_view_as(ctx):
    from app.api.v1.routers.desenvolvimento_economico import listar_captacao
    db, admin, u1, m1, m2 = ctx
    assert len(listar_captacao(municipio_id=None, db=db, current_user=admin)) == 2
    so_m1 = listar_captacao(municipio_id=m1.id, db=db, current_user=admin)
    assert [i.titulo for i in so_m1] == ["Edital Alfa"]
    u1_ignora = listar_captacao(municipio_id=m2.id, db=db, current_user=u1)
    assert [i.titulo for i in u1_ignora] == ["Edital Alfa"]


def test_escrita_view_as(ctx):
    from app.api.v1.routers.desenvolvimento_economico import listar_escrita
    db, admin, u1, m1, m2 = ctx
    assert len(listar_escrita(municipio_id=None, db=db, current_user=admin)) == 2
    assert [i.titulo for i in listar_escrita(municipio_id=m2.id, db=db, current_user=admin)] == ["Projeto Beta"]
    assert [i.titulo for i in listar_escrita(municipio_id=m2.id, db=db, current_user=u1)] == ["Projeto Alfa"]


def test_premiacoes_view_as(ctx):
    from app.api.v1.routers.desenvolvimento_economico import listar_premiacoes
    db, admin, u1, m1, m2 = ctx
    assert len(listar_premiacoes(municipio_id=None, db=db, current_user=admin)) == 2
    assert [i.titulo for i in listar_premiacoes(municipio_id=m1.id, db=db, current_user=admin)] == ["Prêmio Alfa"]
    assert [i.titulo for i in listar_premiacoes(municipio_id=m1.id, db=db, current_user=u1)] == ["Prêmio Alfa"]
```

(Se `CaptacaoRecurso`/`EscritaProjeto`/`Premiacao` exigirem campos NOT NULL além de `titulo`/`municipio_id`, preencher mínimos reais espelhando os models — ajuste pré-autorizado.)

- [ ] **Step 2: RED**

Run: `venv/Scripts/python -m pytest backend/tests/test_certificacoes_view_as.py -q`
Expected: FAIL — `listar_captacao() got an unexpected keyword argument 'municipio_id'`.

- [ ] **Step 3: Implementar**

Nos 3 handlers, substituir a assinatura e o corpo da query pelo padrão do `listar_retencao` (mesmo arquivo, seção 3.2). Exemplo para captação — replicar nos outros dois trocando model/ordenação:

```python
@router.get("/captacao", response_model=List[CaptacaoRecursoOut])
def listar_captacao(
    municipio_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    query = db.query(CaptacaoRecurso)
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(CaptacaoRecurso.municipio_id == current_user.municipio_id)
    elif municipio_id is not None:
        query = query.filter(CaptacaoRecurso.municipio_id == municipio_id)
    return query.order_by(CaptacaoRecurso.criado_em.desc()).all()
```

(`listar_escrita`: `EscritaProjeto`, `order_by(EscritaProjeto.criado_em.desc())`; `listar_premiacoes`: `Premiacao`, `order_by(Premiacao.criado_em.desc())`. `_apply_tenant` permanece para o funil.)

- [ ] **Step 4: GREEN + suite completa**

Run: `venv/Scripts/python -m pytest backend/tests/test_certificacoes_view_as.py -q` → PASS (3).
Run: `venv/Scripts/python -m pytest backend/tests -q` → 430 + 3 = 433, zero falhas.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/routers/desenvolvimento_economico.py backend/tests/test_certificacoes_view_as.py
git commit -m "feat(certificacoes): view-as de leitura nas listagens de captacao, escrita e premiacoes"
```

---

### Task 2: `CertificacoesShell` — abas dirigidas por rota + AppRouter

**Files:**
- Create: `frontend-observatorio/src/pages/desenvolvimento-economico/CertificacoesShell.jsx`
- Test: `frontend-observatorio/src/pages/desenvolvimento-economico/CertificacoesShell.test.jsx`
- Modify: `frontend-observatorio/src/app/router/AppRouter.jsx` (5 elementos embrulhados; rotas/paths inalterados)

**Interfaces:**
- Consumes: `NidTabBar` (`{ tabs, value, onChange, ariaLabel }`; `value` aceita key — auto-detecção; **conferir no arquivo o que `onChange` emite**: se emitir índice, o handler tolerante abaixo já cobre).
- Produces (Task 4 depende): `export default CertificacoesShell({ children })` + `export const ABAS_CERTIFICACOES` (key/label/rota das 5 abas na ordem Premiações · Captação · Escrita · Dinheiro na Mesa · Emendas).

- [ ] **Step 1: Escrever o teste (falhando)**

```jsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import CertificacoesShell from "./CertificacoesShell";

function Sonda() {
  const { pathname } = useLocation();
  return <div data-testid="rota">{pathname}</div>;
}

const montar = (rotaInicial) =>
  render(
    <MemoryRouter initialEntries={[rotaInicial]}>
      <CertificacoesShell>
        <Sonda />
      </CertificacoesShell>
    </MemoryRouter>
  );

describe("CertificacoesShell", () => {
  it("mostra o header único e as 5 abas na ordem", () => {
    montar("/app/desenvolvimento-economico/premiacoes");
    expect(screen.getByText("Certificações e Premiações")).toBeInTheDocument();
    const abas = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(abas).toEqual([
      "Premiações", "Captação de Recursos", "Escrita de Projetos",
      "Dinheiro na Mesa", "Emendas",
    ]);
  });

  it("aba ativa deriva da rota inicial", () => {
    montar("/app/emendas");
    expect(screen.getByRole("tab", { name: "Emendas" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Premiações" })).toHaveAttribute("aria-selected", "false");
  });

  it("clicar numa aba navega para a rota dela (children re-renderiza)", () => {
    montar("/app/desenvolvimento-economico/premiacoes");
    fireEvent.click(screen.getByRole("tab", { name: "Dinheiro na Mesa" }));
    expect(screen.getByTestId("rota").textContent).toBe("/app/dinheiro-na-mesa");
  });
});
```

- [ ] **Step 2: RED**

Run: `npx vitest run src/pages/desenvolvimento-economico/CertificacoesShell.test.jsx`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar o shell**

```jsx
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { TrophyIcon } from "@heroicons/react/24/outline";
import NidTabBar from "../../components/nid/NidTabBar";

// Ordem das abas = ordem aprovada do módulo 16 (cliente).
export const ABAS_CERTIFICACOES = [
  { key: "premiacoes", label: "Premiações", rota: "/app/desenvolvimento-economico/premiacoes" },
  { key: "captacao", label: "Captação de Recursos", rota: "/app/desenvolvimento-economico/captacao" },
  { key: "escrita", label: "Escrita de Projetos", rota: "/app/desenvolvimento-economico/escrita" },
  { key: "dinheiro-na-mesa", label: "Dinheiro na Mesa", rota: "/app/dinheiro-na-mesa" },
  { key: "emendas", label: "Emendas", rota: "/app/emendas" },
];

/** Shell do módulo "Certificações e Premiações": header único + abas que
 *  NAVEGAM entre as 5 rotas existentes (aba ativa = rota atual). */
export default function CertificacoesShell({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const ativa =
    ABAS_CERTIFICACOES.find((a) => location.pathname.startsWith(a.rota))?.key ?? "premiacoes";

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="flex items-center gap-3">
        <TrophyIcon className="w-7 h-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">
            Certificações e Premiações
          </h1>
          <p className="text-xs mt-0.5 text-[var(--text-dim)]">
            Oportunidades, captação e reconhecimentos do município.
          </p>
        </div>
      </div>

      <NidTabBar
        tabs={ABAS_CERTIFICACOES.map((a) => ({ key: a.key, label: a.label }))}
        value={ativa}
        onChange={(v) => {
          const aba = typeof v === "number" ? ABAS_CERTIFICACOES[v] : ABAS_CERTIFICACOES.find((a) => a.key === v);
          if (aba && aba.key !== ativa) navigate(aba.rota);
        }}
        ariaLabel="Seções de Certificações e Premiações"
      />

      {children}
    </motion.div>
  );
}
```

- [ ] **Step 4: Embrulhar as 5 rotas no `AppRouter.jsx`**

Adicionar `import CertificacoesShell from "../../pages/desenvolvimento-economico/CertificacoesShell";` e trocar os 5 elementos (linhas ~122, ~123, ~144, ~145, ~146 — paths INALTERADOS):

```jsx
<Route path="dinheiro-na-mesa" element={<CertificacoesShell><DinheiroNaMesaPage /></CertificacoesShell>} />
<Route path="emendas" element={<CertificacoesShell><EmendasPage /></CertificacoesShell>} />
...
<Route path="desenvolvimento-economico/captacao" element={<CertificacoesShell><CaptacaoTab /></CertificacoesShell>} />
<Route path="desenvolvimento-economico/escrita" element={<CertificacoesShell><EscritaTab /></CertificacoesShell>} />
<Route path="desenvolvimento-economico/premiacoes" element={<CertificacoesShell><PremiacoesTab /></CertificacoesShell>} />
```

(Se os paths no arquivo forem relativos/absolutos diferentes do mostrado, manter EXATAMENTE os paths existentes — só o `element` muda.)

- [ ] **Step 5: GREEN + suite completa**

Run: `npx vitest run src/pages/desenvolvimento-economico/CertificacoesShell.test.jsx` → PASS (3).
Run: `npx vitest run` → 278 + 3 = 281, zero falhas. (Header duplicado nas telas é estado transitório até a Task 4 — não é falha de teste.)

- [ ] **Step 6: Commit**

```bash
git add frontend-observatorio/src/pages/desenvolvimento-economico/CertificacoesShell.jsx frontend-observatorio/src/pages/desenvolvimento-economico/CertificacoesShell.test.jsx frontend-observatorio/src/app/router/AppRouter.jsx
git commit -m "feat(certificacoes): shell com abas dirigidas por rota sobre as 5 telas"
```

---

### Task 3: Sidebar — item único + entradas ocultas

**Files:**
- Modify: `frontend-observatorio/src/app/layouts/navStructure.jsx:90-99` (grupo → 5 links, 4 com `oculto: true`)
- Modify: `frontend-observatorio/src/app/layouts/SidebarNav.jsx` (`isVisible` filtra `oculto`)
- Test: `frontend-observatorio/src/app/layouts/navStructure.test.js` e `SidebarNav.test.jsx` (modificar)

**Interfaces:**
- Consumes: nada novo. Produces: flag `oculto` no shape dos itens (documentada no comentário do arquivo).

- [ ] **Step 1: Atualizar os testes (falhando)**

`navStructure.test.js` — adicionar ao teste de flags:

```js
    expect(porRota["/app/desenvolvimento-economico/premiacoes"].oculto).toBeUndefined();
    ["/app/desenvolvimento-economico/captacao", "/app/desenvolvimento-economico/escrita",
     "/app/dinheiro-na-mesa", "/app/emendas"].forEach((to) => {
      expect(porRota[to].oculto).toBe(true);
    });
```

e ao teste de labels: `expect(labels).toContain("Certificações e Premiações");`. NADA muda em ROTA_MODULO nem no `toHaveLength(32)`.

`SidebarNav.test.jsx` — teste novo no describe de visibilidade:

```jsx
  it("entradas ocultas não aparecem na sidebar (mas o item único sim)", () => {
    renderNav({ user: USER_COMUM });
    expect(screen.getByText("Certificações e Premiações")).toBeInTheDocument();
    expect(screen.queryByText("Captação de Recursos")).toBeNull();
    expect(screen.queryByText("Emendas")).toBeNull();
  });
```

- [ ] **Step 2: RED**

Run: `npx vitest run src/app/layouts/navStructure.test.js src/app/layouts/SidebarNav.test.jsx`
Expected: FAIL (flags/labels/visibilidade).

- [ ] **Step 3: Implementar**

`navStructure.jsx`: substituir o grupo inteiro (linhas ~90-99) pelo bloco da spec (seção Arquitetura §1 — 1 link visível "Certificações e Premiações" com `modulo: "desenvolvimento_economico.premiacoes"` + 4 links `oculto: true` com rotas/chaves/ícones atuais). Atualizar o comentário do topo do arquivo mencionando a flag `oculto` (fica no NAV_FLAT, some da sidebar).

`SidebarNav.jsx`: `const isVisible = (item) => !item.oculto && !(item.hideForAdmin && isGlobal);`

- [ ] **Step 4: GREEN + suite completa**

Run: `npx vitest run src/app/layouts/` → PASS.
Run: `npx vitest run` → 281 + 1 = 282, zero falhas.

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/app/layouts/navStructure.jsx frontend-observatorio/src/app/layouts/SidebarNav.jsx frontend-observatorio/src/app/layouts/navStructure.test.js frontend-observatorio/src/app/layouts/SidebarNav.test.jsx
git commit -m "feat(certificacoes): item unico na sidebar com entradas ocultas preservando NAV_FLAT"
```

---

### Task 4: As 5 telas viram conteúdo de aba + guards unificados

**Files:**
- Modify: `frontend-observatorio/src/pages/desenvolvimento-economico/CaptacaoTab.jsx` (header :235-242; wrappers :246/:257/:268; guard :255-265; permissões :94-96)
- Modify: `frontend-observatorio/src/pages/desenvolvimento-economico/EscritaTab.jsx` (header :208-215; wrappers :219/:230/:241; guard :228-238; permissões :78-80)
- Modify: `frontend-observatorio/src/pages/desenvolvimento-economico/PremiacoesTab.jsx` (header :171-178; wrappers :182/:193/:204; guard :191-201; permissões :59-61)
- Modify: `frontend-observatorio/src/pages/dinheiro-na-mesa/DinheiroNaMesaPage.jsx` (headers :77 e :96-97; wrappers :76/:94)
- Modify: `frontend-observatorio/src/pages/emendas/EmendasPage.jsx` (headers :46 e :66-73; wrappers :45/:64)
- Test: `frontend-observatorio/src/pages/desenvolvimento-economico/PremiacoesTab.test.jsx` (novo — guard)
- Modify: `frontend-observatorio/src/pages/titulosPaginas.test.js`

**Interfaces:**
- Consumes: shell da Task 2 (as telas agora renderizam DENTRO dele); endpoints da Task 1 (view-as); padrão de guard da F3 em `GestaoEmpresarialTab.jsx` (needsMunicipio + effect gated + early-return antes do loading) — usar como molde literal.
- Produces: telas sem header/wrapper próprios.

- [ ] **Step 1: Testes primeiro (falhando)**

1. Criar `PremiacoesTab.test.jsx` (molde: `GestaoEmpresarialTab.test.jsx` — mocks de api/AuthContext/ViewAsContext/ToastContext idênticos, mudando a rota da lista para `/desenvolvimento-economico/premiacoes` e o item mock para `{ id: 1, titulo: "Prêmio X", status: "oportunidade", tipo: "premio" }`):
   - "global sem view-as vê SelecioneMunicipio e não busca a lista" (api.get não chamado);
   - "global com view-as vê a lista em modo leitura" (título do item visível; botão de criar ausente — conferir o texto real do botão no arquivo, ex. "Nova Premiação"/"Nova Oportunidade", e usar o exato).
2. `titulosPaginas.test.js`:
   - Caso novo: `["./desenvolvimento-economico/CertificacoesShell.jsx", "Certificações e Premiações", null]` (ajustar o array CASOS — paths relativos ao teste).
   - Testes de ausência dos headers antigos das 2 páginas de dados:

```js
  it("DinheiroNaMesa e Emendas não têm mais NidPageHeader próprio", () => {
    expect(ler("./dinheiro-na-mesa/DinheiroNaMesaPage.jsx")).not.toContain('title="Dinheiro na Mesa"');
    expect(ler("./emendas/EmendasPage.jsx")).not.toContain('title="Radar de Emendas"');
  });
```

- [ ] **Step 2: RED**

Run: `npx vitest run src/pages/desenvolvimento-economico/PremiacoesTab.test.jsx src/pages/titulosPaginas.test.js`
Expected: FAIL.

- [ ] **Step 3: Editar as 3 CRUD (Captação, Escrita, Premiações — mesmo receituário)**

Em cada uma:
1. **Header e wrappers fora:** deletar o `const header = (...)` e trocar cada `return (<motion.div ...>` por `return (<div className="space-y-6">` (fechamento `</motion.div>` → `</div>`), removendo `{header}` dos 3 branches. Remover import de `motion` se ficar órfão (e o ícone do header se não usado em outro lugar — conferir).
2. **Guard F3:** adicionar `import { useViewAs } from "../../context/ViewAsContext";` e `import SelecioneMunicipio from "../../components/nid/SelecioneMunicipio";`; no componente: `const { viewAsId } = useViewAs(); const needsMunicipio = isGlobal && viewAsId == null;`. Substituir o branch `if (isGlobal) { ...empty-state... }` por:

```jsx
  if (needsMunicipio) {
    return <SelecioneMunicipio />;
  }
```

   (o guard fica ANTES do branch de loading, como na GestaoEmpresarialTab) e no effect de load: `if (needsMunicipio) return;` antes do fetch, com `needsMunicipio` no dep array.
3. **Escrita bloqueada p/ global:** `canEditar` e `canExcluir` ganham `&& !isGlobal` (o `canCriar` já tem).

- [ ] **Step 4: Editar as 2 páginas de dados**

`DinheiroNaMesaPage.jsx`: remover os DOIS `NidPageHeader` (branch guard e normal; remover import se órfão). No branch normal, no lugar do header, a linha compacta:

```jsx
      <div className="flex items-center gap-2 text-xs text-[var(--text-dim)]">
        <span>Captação de convênios federais vs. municípios do mesmo porte</span>
        <InfoTooltip dataset="captacao_federal" />
      </div>
```

No branch `needsMunicipio`, deixar só `<SelecioneMunicipio />` (sem header). Os wrappers `motion.div` das duas páginas TAMBÉM saem (o shell é dono): virar `<div className="space-y-6">`.

`EmendasPage.jsx`: idem — linha compacta com o subtítulo "Quem envia recurso, quanto e o que já foi executado", `InfoTooltip dataset="emendas"` e o `NidSelect` de ano com `className="ml-auto"` preservado na mesma linha (`flex items-center gap-2 flex-wrap`).

- [ ] **Step 5: GREEN + suite completa**

Run: `npx vitest run src/pages/desenvolvimento-economico/PremiacoesTab.test.jsx src/pages/titulosPaginas.test.js` → PASS.
Run: `npx vitest run` → 282 + 2 + (1 caso estático) ≈ 285 (reportar exato), zero falhas.

- [ ] **Step 6: Commit**

```bash
git add frontend-observatorio/src/pages/desenvolvimento-economico/CaptacaoTab.jsx frontend-observatorio/src/pages/desenvolvimento-economico/EscritaTab.jsx frontend-observatorio/src/pages/desenvolvimento-economico/PremiacoesTab.jsx frontend-observatorio/src/pages/desenvolvimento-economico/PremiacoesTab.test.jsx frontend-observatorio/src/pages/dinheiro-na-mesa/DinheiroNaMesaPage.jsx frontend-observatorio/src/pages/emendas/EmendasPage.jsx frontend-observatorio/src/pages/titulosPaginas.test.js
git commit -m "feat(certificacoes): telas viram conteudo de aba com guards de view-as unificados"
```

---

### Task 5: Verificação final

**Files:** nenhum novo; commit só se houver correção.

- [ ] **Step 1: Suites completas**

Run: `venv/Scripts/python -m pytest backend/tests -q` (raiz) → 433, zero falhas.
Run: `npx vitest run` (frontend-observatorio) → zero falhas (reportar total).

- [ ] **Step 2: Lint comparativo**

Novos (`CertificacoesShell.jsx` + testes novos): zero erros além do falso-positivo `motion unused` (o shell usa motion.div). Modificados (5 telas, AppRouter, navStructure, SidebarNav, router backend): comparar com a base da fase via `git show <base>:<path> | npx eslint --stdin --stdin-filename <path>` — nenhum erro novo (nota: remover `motion` das telas pode REDUZIR a contagem — ótimo; um erro que SUMA não é problema).

- [ ] **Step 3: Invariantes**

Run: `npx vitest run src/app/layouts/navStructure.test.js` → PASS (32 rotas, 30 chaves, ocultas corretas).

- [ ] **Step 4: Relato final (sem commit)**

Pendências do usuário: push + deploy da api (sem migração nesta fase — mas a 0038 da F3 continua pendente de deploy) + checklist visual (shell com 5 abas nos temas; navegação por aba preserva deep link; admin em view-as vê as 5 abas em leitura; DnM/Emendas sem header duplicado; kanbans intactos).
