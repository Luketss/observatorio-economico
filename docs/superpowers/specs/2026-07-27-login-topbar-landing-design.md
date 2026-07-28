# Botão de login na topbar da landing page — Design

**Data:** 2026-07-27
**Status:** aprovado pelo usuário (opção "Ghost Entrar + CTA")

## Objetivo

Dar acesso ao login diretamente pela topbar da landing page (`/`). Hoje o login só é alcançável pelos botões "Acessar o NID" do hero e do CTA final; a topbar tem apenas o CTA comercial "Comece agora" (WhatsApp).

## Decisão

Adicionar um botão secundário **"Entrar"** na topbar, imediatamente à esquerda do "Comece agora". O CTA comercial permanece o elemento principal (laranja/glow); o login entra como ação discreta — padrão de mercado para SaaS.

## Especificação

- **Arquivo:** `frontend-observatorio/src/pages/landing/LandingPage.jsx`, header `#site-header` (container flex `justify-between` existente).
- **Elemento:** `<Link to="/login">` com rótulo "Entrar". Os dois botões ("Entrar" + "Comece agora") ficam agrupados num wrapper flex à direita com gap pequeno (ex.: `gap-2 sm:gap-3`).
- **Estilo:** mesmo vocabulário dos botões secundários da página (o "Entre em contato" do hero): `rounded-lg border border-[var(--border)] glass`, texto `var(--foreground)`, hover `border-[color-mix(in_oklab,var(--primary)_60%,transparent)]`. Padding responsivo idêntico ao CTA vizinho (`px-3 py-2 text-xs sm:px-4 sm:text-sm`) para as alturas baterem. Sem ícone.
- **Mobile:** ambos os botões visíveis (o header já compacta em telas pequenas; "Entrar" é curto e não estoura o layout).
- **Fora de escopo:** nenhuma mudança de backend, rotas, nav âncora, hero ou CTA final.

## Verificação

Arquivo é JSX de apresentação sem lógica extraível — nada novo para teste unitário. Gate: `npm run build` + lint (baseline sujo conhecido: só não introduzir erro novo) + conferência visual do usuário (desktop e mobile estreito).
