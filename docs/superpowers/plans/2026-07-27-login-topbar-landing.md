# BotÃ£o de Login na Topbar da Landing â€” Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um botÃ£o secundÃ¡rio "Entrar" (link para `/login`) na topbar da landing page, Ã  esquerda do CTA "Comece agora".

**Architecture:** MudanÃ§a puramente de apresentaÃ§Ã£o em `LandingPage.jsx`: o CTA existente do header ganha um wrapper flex que agrupa o novo `<Link to="/login">` (estilo ghost/glass, mesmo vocabulÃ¡rio do botÃ£o "Entre em contato" do hero) e o CTA laranja atual, com alturas idÃªnticas via mesmo padding responsivo. Zero backend, zero rotas novas (`/login` jÃ¡ existe), zero mudanÃ§as fora do header.

**Tech Stack:** React 19 + react-router-dom (`Link`, jÃ¡ importado no arquivo) + Tailwind com CSS vars do design system da landing (`--border`, `--foreground`, `--primary`, classe `glass`).

## Global Constraints

- RÃ³tulo do botÃ£o: exatamente **"Entrar"** (sem Ã­cone).
- Padding responsivo idÃªntico ao CTA vizinho: `px-3 py-2 text-xs sm:px-4 sm:text-sm`.
- Ambos os botÃµes visÃ­veis tambÃ©m no mobile (nenhum `hidden`).
- Nada alÃ©m do header `#site-header` muda (hero, nav, CTA final intactos).
- Spec: `docs/superpowers/specs/2026-07-27-login-topbar-landing-design.md`.
- Gate de verificaÃ§Ã£o do projeto: `npm run build` limpo; eslint tem baseline sujo conhecido ("motion unused", set-state-in-effect) â€” sÃ³ nÃ£o introduzir erro NOVO. Arquivo Ã© JSX de apresentaÃ§Ã£o sem lÃ³gica extraÃ­vel: nÃ£o hÃ¡ teste unitÃ¡rio a escrever (convenÃ§Ã£o do projeto: vitest sÃ³ para lÃ³gica pura em `src/utils`/`src/hooks`).

---

### Task 1: BotÃ£o "Entrar" no header da landing

**Files:**
- Modify: `frontend-observatorio/src/pages/landing/LandingPage.jsx` (header `#site-header`, o `<a>` do CTA "Comece agora" â€” aprox. linhas 223-226)

**Interfaces:**
- Consumes: rota `/login` jÃ¡ registrada em `src/app/router/AppRouter.jsx`; `Link` jÃ¡ importado na linha 2 do arquivo; constante `WA_CONTRATAR` existente.
- Produces: nada consumido por outras tasks (task Ãºnica).

- [x] **Step 1: Substituir o CTA solto pelo grupo flex com "Entrar" + CTA**

No `LandingPage.jsx`, dentro do header, substituir este bloco:

```jsx
          <a href={WA_CONTRATAR} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-orange-gradient px-3 py-2 text-xs font-semibold text-[var(--primary-foreground)] shadow-glow transition hover:opacity-95 sm:px-4 sm:text-sm">
            Comece agora
            <ArrowIcon size={14} />
          </a>
```

por este:

```jsx
          <div className="flex items-center gap-2 sm:gap-3">
            <Link to="/login" className="inline-flex items-center rounded-lg border border-[var(--border)] glass px-3 py-2 text-xs font-semibold text-[var(--foreground)] transition hover:border-[color-mix(in_oklab,var(--primary)_60%,transparent)] sm:px-4 sm:text-sm">
              Entrar
            </Link>
            <a href={WA_CONTRATAR} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-orange-gradient px-3 py-2 text-xs font-semibold text-[var(--primary-foreground)] shadow-glow transition hover:opacity-95 sm:px-4 sm:text-sm">
              Comece agora
              <ArrowIcon size={14} />
            </a>
          </div>
```

(O `<a>` do CTA Ã© idÃªntico ao atual â€” sÃ³ ganha o wrapper e o `Link` irmÃ£o.)

- [x] **Step 2: Build**

Run (de `frontend-observatorio/`): `npm run build`
Expected: `âœ“ built` sem erros (warning de chunk >500kB Ã© prÃ©-existente, ignorar).

- [x] **Step 3: Lint sem erros novos**

Run (de `frontend-observatorio/`): `npx eslint src/pages/landing/LandingPage.jsx`
Expected: nenhum erro NOVO neste arquivo (baseline do projeto Ã© sujo em outros arquivos; este arquivo nÃ£o deve reportar nada).

- [x] **Step 4: Commit**

```bash
git add frontend-observatorio/src/pages/landing/LandingPage.jsx
git commit -m "feat(landing): botao Entrar na topbar linkando para /login"
```

---

## Self-Review

- **Spec coverage:** rÃ³tulo/posiÃ§Ã£o/estilo/mobile/fora-de-escopo â€” tudo coberto pela Task 1; verificaÃ§Ã£o (build+lint) nos steps 2-3. âœ“
- **Placeholder scan:** nenhum TBD/TODO; cÃ³digo completo no step 1. âœ“
- **Type consistency:** task Ãºnica, sem interfaces entre tasks. âœ“
