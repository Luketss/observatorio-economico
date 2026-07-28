import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import "./landing.css";
import uaiziLogo from "../../assets/logo_uaizi.png";

/* WhatsApp deep-links (kept verbatim from the source design) */
const WA_CONTRATAR =
  "https://wa.me/5537998720903?text=Tenho%20interesse%20em%20contratar%20o%20NID.";
const WA_PLATAFORMA =
  "https://wa.me/5537998720903?text=Ol%C3%A1%21%20Tenho%20interesse%20na%20plataforma%20NID.";

function ArrowIcon({ size = 16, className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

const VALUE_PROPS = [
  {
    title: "Indicadores",
    desc: "Tributários, econômicos e sociais consolidados.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--primary-foreground)]">
        <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
        <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
      </svg>
    ),
  },
  {
    title: "Benchmark municipal",
    desc: "Compare seu município com outros em segundos.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--primary-foreground)]">
        <path d="M3 3v18h18" />
        <path d="M18 17V9" />
        <path d="M13 17V5" />
        <path d="M8 17v-3" />
      </svg>
    ),
  },
  {
    title: "Insights prontos",
    desc: "Onde agir primeiro — sem planilha, sem espera.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--primary-foreground)]">
        <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
        <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
        <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
        <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
      </svg>
    ),
  },
];

const STEPS = [
  ["Informação espalhada", "Decisão objetiva"],
  ["Dúvida", "Prioridade"],
  ["Tempo perdido", "Ação"],
];

const BENCHMARK = [
  { city: "Itabira", pct: 78, primary: true },
  { city: "Ipatinga", pct: 64 },
  { city: "Sete Lagoas", pct: 59 },
  { city: "Governador Valadares", pct: 51 },
  { city: "Divinópolis", pct: 47 },
];

const SOURCES = ["IBGE", "CAGED", "RAIS", "Banco Central", "Receita Federal"];

const FAQ = [
  {
    q: "Como começo a usar o NID?",
    a: "Clique em qualquer botão da página, fale com nosso time pelo WhatsApp e em poucos minutos sua prefeitura já estará dentro da plataforma.",
    open: true,
  },
  {
    q: "Preciso ter equipe técnica?",
    a: "Não. O NID é uma plataforma SaaS na nuvem. Basta acessar pelo navegador, sem instalação ou infraestrutura.",
  },
  {
    q: "Posso cancelar quando quiser?",
    a: "Sim. Não temos contrato de fidelidade. Você cancela a qualquer momento, sem multa.",
  },
  {
    q: "Os dados são confiáveis?",
    a: "Sim. Trabalhamos com fontes 100% oficiais como IBGE, CAGED, RAIS, Banco Central, Receita Federal e MDIC.",
  },
  {
    q: "Tem suporte para configurar?",
    a: "Sim. Nosso time acompanha sua equipe na configuração e treinamento inicial, sem custo extra.",
  },
];

function formatNumber(n, format) {
  if (format === "k") return (n / 1000).toFixed(1).replace(".", ",") + "k";
  return n.toLocaleString("pt-BR");
}

export default function LandingPage() {
  const wrapperRef = useRef(null);

  /* Faithful tab title from the source design */
  useEffect(() => {
    const prev = document.title;
    document.title = "NID — Decida com dados. Governe com inteligência.";
    return () => {
      document.title = prev;
    };
  }, []);

  /* Reveal-on-scroll */
  useEffect(() => {
    const root = wrapperRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    root.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  /* Animated number counters */
  useEffect(() => {
    const root = wrapperRef.current;
    if (!root) return;
    const counterIO = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const el = e.target;
          const target = parseInt(el.dataset.counter, 10);
          const suffix = el.dataset.suffix || "";
          const format = el.dataset.format || "";
          const dur = 1200;
          const t0 = performance.now();
          const step = (t) => {
            const p = Math.min(1, (t - t0) / dur);
            const eased = 1 - Math.pow(1 - p, 3);
            const v = Math.round(target * eased);
            el.textContent = formatNumber(v, format) + suffix;
            if (p < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
          counterIO.unobserve(el);
        });
      },
      { threshold: 0.4 }
    );
    root.querySelectorAll("[data-counter]").forEach((el) => counterIO.observe(el));
    return () => counterIO.disconnect();
  }, []);

  /* Header gains a shadow after scrolling */
  useEffect(() => {
    const header = wrapperRef.current?.querySelector("#site-header");
    if (!header) return;
    const onScroll = () => {
      if (window.scrollY > 20) header.classList.add("shadow-card");
      else header.classList.remove("shadow-card");
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div ref={wrapperRef} className="nid-landing min-h-screen">
      {/* ───────── Header ───────── */}
      <header id="site-header" className="sticky top-0 z-50 glass border-b border-[var(--border)] header-shrink">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
          <a href="#top" className="flex items-center gap-3">
            <img src={uaiziLogo} alt="UAIZI" className="h-8 w-auto sm:h-9" />
            <span className="font-display text-base font-semibold tracking-tight sm:text-lg flex items-center gap-2">
              <span className="text-[var(--muted-foreground)]">·</span>
              <span className="text-gradient-orange text-sm font-semibold">NID</span>
            </span>
          </a>
          <nav className="hidden items-center gap-8 md:flex">
            <a href="#beneficios" className="text-sm text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]">Benefícios</a>
            <a href="#como-funciona" className="text-sm text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]">Como funciona</a>
            <a href="#produto" className="text-sm text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]">Produto</a>
            <a href="#faq" className="text-sm text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]">FAQ</a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link to="/login" className="inline-flex items-center rounded-lg border border-[var(--border)] glass px-3 py-2 text-xs font-semibold text-[var(--foreground)] transition hover:border-[color-mix(in_oklab,var(--primary)_60%,transparent)] sm:px-4 sm:text-sm">
              Entrar
            </Link>
            <a href={WA_CONTRATAR} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-orange-gradient px-3 py-2 text-xs font-semibold text-[var(--primary-foreground)] shadow-glow transition hover:opacity-95 sm:px-4 sm:text-sm">
              Comece agora
              <ArrowIcon size={14} />
            </a>
          </div>
        </div>
      </header>

      <main>
        {/* ───────── Hero ───────── */}
        <section id="top" className="relative overflow-hidden">
          <div className="absolute inset-0">
            <img src="/hero-city.jpg" alt="" aria-hidden="true" className="h-full w-full object-cover object-center" />
            <div className="absolute inset-0" style={{ background: "radial-gradient(1200px 600px at 80% -10%, rgba(255,106,0,0.28), transparent 60%), radial-gradient(900px 500px at 0% 10%, rgba(255,106,0,0.16), transparent 60%)" }}></div>
            <div className="absolute inset-0 hero-overlay"></div>
            <div className="absolute inset-0 backdrop-blur-[2px]"></div>
          </div>
          <div className="absolute inset-0 grid-bg opacity-40" aria-hidden="true"></div>

          <div className="relative mx-auto max-w-5xl px-4 pb-20 pt-12 text-center sm:px-6 sm:pb-24 sm:pt-16 md:pb-32 md:pt-28">
            <span className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--primary)_30%,transparent)] glass px-4 py-1.5 text-xs font-medium text-[color-mix(in_oklab,var(--foreground)_90%,transparent)] shadow-glow">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)] pulse-dot"></span>
              Núcleo de Inteligência e Dados
            </span>
            <h1 className="mt-6 font-display leading-[1.05] text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-semibold drop-shadow-[0_4px_30px_rgba(0,0,0,0.6)]">
              Transforme dados em <span className="text-gradient-orange">decisões estratégicas</span>
              <br className="hidden sm:block" /> para o seu município.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base text-[color-mix(in_oklab,var(--foreground)_75%,transparent)] sm:text-lg">
              Dados oficiais consolidados em indicadores e benchmarks prontos para apoiar a decisão da sua gestão.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link to="/login" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-orange-gradient px-7 py-4 text-sm font-semibold text-[var(--primary-foreground)] shadow-glow transition hover:opacity-95 sm:w-auto">
                Acessar o NID
                <ArrowIcon size={16} />
              </Link>
              <a href={WA_PLATAFORMA} target="_blank" rel="noopener noreferrer" className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--border)] glass px-7 py-4 text-sm font-semibold text-[var(--foreground)] transition hover:border-[color-mix(in_oklab,var(--primary)_60%,transparent)] sm:w-auto">
                Entre em contato com nossa equipe
              </a>
            </div>
          </div>
        </section>

        {/* ───────── Brazil map ───────── */}
        <section className="relative overflow-hidden border-y border-[var(--border)] py-20 md:py-28" style={{ background: "oklch(0.12 0.012 250)" }}>
          <div className="absolute inset-0 grid-bg opacity-30" aria-hidden="true"></div>
          <div className="absolute inset-0 opacity-60" aria-hidden="true" style={{ background: "radial-gradient(600px 400px at 50% 50%, rgba(255,106,0,0.18), transparent 70%)" }}></div>
          <div className="relative mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 md:grid-cols-2 md:items-center">
            <div data-reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--primary)_30%,transparent)] glass px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-[var(--primary)]">
                Cobertura nacional
              </span>
              <h2 className="mt-5 font-display text-3xl font-bold sm:text-5xl text-balance">
                Uma visão completa para evoluir sua gestão pública.
              </h2>
              <p className="mt-4 max-w-md text-[var(--muted-foreground)]">
                Mais de 5.500 municípios mapeados em uma única plataforma. Dados oficiais de todos os estados brasileiros, prontos para análise comparativa em tempo real.
              </p>
              <div className="mt-6 grid grid-cols-3 gap-4">
                <div className="rounded-xl border border-[var(--border)] p-3 text-center" style={{ background: "color-mix(in oklab, var(--card) 40%, transparent)" }}>
                  <div className="font-display text-xl font-bold text-gradient-orange tick" data-counter="27" data-suffix="">0</div>
                  <div className="text-[11px] uppercase tracking-wider text-[var(--muted-foreground)]">estados</div>
                </div>
                <div className="rounded-xl border border-[var(--border)] p-3 text-center" style={{ background: "color-mix(in oklab, var(--card) 40%, transparent)" }}>
                  <div className="font-display text-xl font-bold text-gradient-orange tick" data-counter="5500" data-suffix="+" data-format="k">0</div>
                  <div className="text-[11px] uppercase tracking-wider text-[var(--muted-foreground)]">municípios</div>
                </div>
                <div className="rounded-xl border border-[var(--border)] p-3 text-center" style={{ background: "color-mix(in oklab, var(--card) 40%, transparent)" }}>
                  <div className="font-display text-xl font-bold text-gradient-orange tick" data-counter="30" data-suffix="+">0</div>
                  <div className="text-[11px] uppercase tracking-wider text-[var(--muted-foreground)]">fontes oficiais</div>
                </div>
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-md" data-reveal>
              <div className="absolute inset-0 -z-10 blur-3xl" aria-hidden="true" style={{ background: "radial-gradient(closest-side, rgba(255,106,0,0.35), transparent 70%)" }}></div>
              <div className="drop-shadow-[0_0_30px_rgba(255,106,0,0.35)]">
                <img src="/brazil-map.svg" alt="Mapa do Brasil" className="h-auto w-full" />
              </div>
            </div>
          </div>
        </section>

        {/* ───────── Social proof ───────── */}
        <section className="border-y border-[var(--border)] py-8" style={{ background: "color-mix(in oklab, var(--card) 30%, transparent)" }}>
          <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-6 text-center sm:flex-row sm:text-left">
            <div className="text-sm text-[var(--muted-foreground)]">
              <span className="font-semibold text-[var(--foreground)]">+30 fontes oficiais</span>
              {" · "}
              {SOURCES.map((s, i) => (
                <span key={s}>
                  <span className="font-mono text-xs tracking-tight">{s}</span>
                  {i < SOURCES.length - 1 ? " · " : null}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ───────── Value props ───────── */}
        <section id="beneficios" className="relative py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto max-w-3xl text-center" data-reveal>
              <span className="inline-block rounded-full border border-[var(--border)] px-4 py-1 text-xs text-[color-mix(in_oklab,var(--foreground)_80%,transparent)]" style={{ background: "color-mix(in oklab, var(--card) 60%, transparent)" }}>
                Em poucos minutos
              </span>
              <h2 className="mt-5 font-display text-3xl font-bold sm:text-5xl text-balance">
                Indicadores, benchmark e <span className="text-gradient-orange">insights prontos para agir.</span>
              </h2>
            </div>
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {VALUE_PROPS.map((card) => (
                <article key={card.title} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-card transition hover:-translate-y-1 hover:border-[color-mix(in_oklab,var(--primary)_40%,transparent)]" data-reveal>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-gradient shadow-glow">
                    {card.icon}
                  </div>
                  <h3 className="mt-5 font-display text-lg font-semibold">{card.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">{card.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ───────── How it works ───────── */}
        <section id="como-funciona" className="relative py-20 md:py-28" style={{ background: "color-mix(in oklab, var(--card) 30%, transparent)" }}>
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto max-w-3xl text-center" data-reveal>
              <h2 className="font-display text-3xl font-bold sm:text-5xl text-balance">
                A transformação que sua <span className="text-gradient-orange">gestão precisa.</span>
              </h2>
            </div>
            <div className="mx-auto mt-12 flex max-w-3xl flex-col gap-4">
              {STEPS.map(([before, after]) => (
                <div key={before} className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--background)] px-6 py-5 sm:gap-6 sm:px-10 sm:py-6" data-reveal>
                  <span className="text-right font-display text-base text-[var(--muted-foreground)] line-through sm:text-lg">{before}</span>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-gradient shadow-glow">
                    <ArrowIcon size={20} className="text-[var(--primary-foreground)]" />
                  </span>
                  <span className="text-left font-display text-base font-semibold text-gradient-orange sm:text-lg">{after}</span>
                </div>
              ))}
            </div>
            <div className="mt-12 text-center">
              <a href={WA_CONTRATAR} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-orange-gradient px-7 py-4 text-sm font-semibold text-[var(--primary-foreground)] shadow-glow transition hover:opacity-95">
                Quero começar agora
                <ArrowIcon size={16} />
              </a>
            </div>
          </div>
        </section>

        {/* ───────── Product preview ───────── */}
        <section id="produto" className="relative py-20 md:py-28 overflow-hidden">
          <div className="absolute inset-0 grid-bg opacity-30" aria-hidden="true"></div>
          <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto max-w-3xl text-center" data-reveal>
              <span className="inline-block rounded-full border border-[var(--border)] px-4 py-1 text-xs text-[color-mix(in_oklab,var(--foreground)_80%,transparent)]" style={{ background: "color-mix(in oklab, var(--card) 60%, transparent)" }}>
                Dentro da plataforma
              </span>
              <h2 className="mt-5 font-display text-3xl font-bold sm:text-5xl text-balance">
                Painéis estratégicos prontos para <span className="text-gradient-orange">apresentar.</span>
              </h2>
              <p className="mt-4 text-[var(--muted-foreground)]">Uma visão geral do que sua equipe encontra no primeiro acesso.</p>
            </div>

            {/* Browser-frame dashboard */}
            <div className="relative mx-auto mt-12 max-w-5xl rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-card overflow-hidden" data-reveal>
              {/* Chrome */}
              <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3" style={{ background: "color-mix(in oklab, var(--background) 60%, transparent)" }}>
                <div className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: "oklch(0.62 0.18 27)" }}></span>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: "oklch(0.78 0.15 90)" }}></span>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: "oklch(0.68 0.15 145)" }}></span>
                </div>
                <div className="flex-1 mx-4 hidden sm:flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-1 text-[11px] font-mono text-[var(--muted-foreground)]" style={{ background: "color-mix(in oklab, var(--background) 70%, transparent)" }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                  app.uaizi.com.br/nid/dashboard
                </div>
                <span className="text-[11px] uppercase tracking-wider text-[var(--muted-foreground)]">UAIZI · NID</span>
              </div>

              {/* Dashboard body */}
              <div className="dash-grid p-4 sm:p-6">
                {/* Top bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-[var(--muted-foreground)]">Município</div>
                    <div className="font-display text-lg font-semibold flex items-center gap-2">
                      Itabira, MG
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider" style={{ background: "color-mix(in oklab, var(--primary) 18%, transparent)", color: "var(--primary)" }}>ao vivo</span>
                    </div>
                  </div>
                  <div className="flex gap-2 text-[11px]">
                    <span className="rounded-md border border-[var(--border)] px-2.5 py-1.5">Últimos 12m</span>
                    <span className="rounded-md border border-[color-mix(in_oklab,var(--primary)_40%,transparent)] bg-orange-gradient px-2.5 py-1.5 text-[var(--primary-foreground)] font-semibold">Comparar</span>
                  </div>
                </div>

                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-xl border border-[var(--border)] p-3" style={{ background: "color-mix(in oklab, var(--background) 50%, transparent)" }}>
                    <div className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">Arrecadação YTD</div>
                    <div className="mt-1 font-display text-xl font-bold tick">R$ 487M</div>
                    <div className="text-[11px] mt-0.5" style={{ color: "oklch(0.72 0.16 145)" }}>▲ 12,4% vs 2024</div>
                  </div>
                  <div className="rounded-xl border border-[var(--border)] p-3" style={{ background: "color-mix(in oklab, var(--background) 50%, transparent)" }}>
                    <div className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">IDH-M</div>
                    <div className="mt-1 font-display text-xl font-bold tick">0,749</div>
                    <div className="text-[11px] mt-0.5 text-[var(--muted-foreground)]">posição 412/853</div>
                  </div>
                  <div className="rounded-xl border border-[var(--border)] p-3" style={{ background: "color-mix(in oklab, var(--background) 50%, transparent)" }}>
                    <div className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">Empregos formais</div>
                    <div className="mt-1 font-display text-xl font-bold tick">31.842</div>
                    <div className="text-[11px] mt-0.5" style={{ color: "oklch(0.72 0.16 145)" }}>▲ 3,1% trim.</div>
                  </div>
                  <div className="rounded-xl border border-[color-mix(in_oklab,var(--primary)_40%,transparent)] p-3 shadow-glow" style={{ background: "color-mix(in oklab, var(--primary) 8%, var(--background))" }}>
                    <div className="text-[10px] uppercase tracking-wider text-[var(--primary)]">Alerta NID</div>
                    <div className="mt-1 font-display text-xl font-bold">3 áreas</div>
                    <div className="text-[11px] mt-0.5 text-[var(--muted-foreground)]">prioridade alta</div>
                  </div>
                </div>

                {/* Chart + side */}
                <div className="mt-4 grid gap-3 md:grid-cols-[2fr_1fr]">
                  <div className="rounded-xl border border-[var(--border)] p-4" style={{ background: "color-mix(in oklab, var(--background) 50%, transparent)" }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[11px] uppercase tracking-wider text-[var(--muted-foreground)]">Arrecadação ISS · 12 meses</div>
                        <div className="font-display text-base font-semibold mt-0.5">R$ 142,8M acumulado</div>
                      </div>
                      <div className="flex gap-1 text-[10px] font-mono text-[var(--muted-foreground)]">
                        <span className="px-2 py-1 rounded border border-[var(--border)]">Mensal</span>
                        <span className="px-2 py-1 rounded border border-[color-mix(in_oklab,var(--primary)_40%,transparent)] text-[var(--primary)]">Trimestral</span>
                      </div>
                    </div>
                    {/* Mini SVG chart */}
                    <svg viewBox="0 0 400 140" className="mt-3 w-full h-32">
                      <defs>
                        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#ff8a3d" stopOpacity="0.5" />
                          <stop offset="100%" stopColor="#ff8a3d" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <g stroke="rgba(255,255,255,0.06)" strokeWidth="1">
                        <line x1="0" y1="30" x2="400" y2="30" />
                        <line x1="0" y1="60" x2="400" y2="60" />
                        <line x1="0" y1="90" x2="400" y2="90" />
                        <line x1="0" y1="120" x2="400" y2="120" />
                      </g>
                      <path d="M0,100 L40,92 L80,85 L120,78 L160,70 L200,60 L240,55 L280,45 L320,40 L360,32 L400,22 L400,140 L0,140 Z" fill="url(#areaGrad)" />
                      <path d="M0,100 L40,92 L80,85 L120,78 L160,70 L200,60 L240,55 L280,45 L320,40 L360,32 L400,22" fill="none" stroke="#ff8a3d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <g fill="#ff8a3d">
                        <circle cx="200" cy="60" r="3" />
                        <circle cx="400" cy="22" r="4" stroke="white" strokeWidth="1" />
                      </g>
                    </svg>
                    <div className="flex justify-between text-[10px] font-mono text-[var(--muted-foreground)] mt-1">
                      <span>jul/24</span><span>out/24</span><span>jan/25</span><span>abr/25</span><span>jul/25</span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[var(--border)] p-4" style={{ background: "color-mix(in oklab, var(--background) 50%, transparent)" }}>
                    <div className="text-[11px] uppercase tracking-wider text-[var(--muted-foreground)]">Benchmark · porte similar</div>
                    <ul className="mt-3 space-y-2.5 text-xs">
                      {BENCHMARK.map(({ city, pct, primary }) => (
                        <li key={city} className="flex items-center justify-between">
                          <span className={primary ? "text-[var(--foreground)]" : "text-[var(--muted-foreground)]"}>{city}</span>
                          <span className="flex items-center gap-2">
                            <span className="block h-1.5 w-20 rounded-full" style={{ background: `linear-gradient(to right, ${primary ? "var(--primary)" : "var(--muted-foreground)"} ${pct}%, var(--border) ${pct}%)` }}></span>
                            <span className="font-mono tabular-nums w-9 text-right">{pct}%</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Insights row */}
                <div className="mt-4 rounded-xl border border-[color-mix(in_oklab,var(--primary)_30%,transparent)] p-4 flex items-start gap-3" style={{ background: "color-mix(in oklab, var(--primary) 5%, var(--background))" }}>
                  <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-orange-gradient">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-[var(--primary-foreground)]"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" /></svg>
                  </span>
                  <div className="flex-1">
                    <div className="font-display text-sm font-semibold">Insight gerado pelo NID</div>
                    <p className="text-xs text-[var(--muted-foreground)] mt-1">Aumento de <span className="text-[var(--foreground)] font-semibold">+18%</span> em abertura de MEIs no setor de serviços. Sugestão: revisar ISS de serviços técnicos para capturar R$ 4,2M/ano em base estimada.</p>
                  </div>
                  <span className="text-[10px] font-mono text-[var(--muted-foreground)] uppercase">há 2h</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ───────── Guarantee ───────── */}
        <section className="py-16" style={{ background: "color-mix(in oklab, var(--card) 30%, transparent)" }}>
          <div className="mx-auto grid max-w-5xl gap-6 px-4 sm:px-6 sm:grid-cols-3">
            <div className="flex items-start gap-4" data-reveal>
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-[color-mix(in_oklab,var(--primary)_30%,transparent)] bg-[var(--background)] text-[var(--primary)]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></svg>
              </div>
              <div>
                <div className="font-display text-sm font-semibold">Sem fidelidade</div>
                <p className="text-sm text-[var(--muted-foreground)]">Cancele a qualquer momento.</p>
              </div>
            </div>

            <div className="flex items-start gap-4" data-reveal>
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-[color-mix(in_oklab,var(--primary)_30%,transparent)] bg-[var(--background)] text-[var(--primary)]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>
              </div>
              <div>
                <div className="font-display text-sm font-semibold">Dados oficiais</div>
                <p className="text-sm text-[var(--muted-foreground)]">Fontes públicas integradas e atualizadas.</p>
              </div>
            </div>

            <div className="flex items-start gap-4" data-reveal>
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-[color-mix(in_oklab,var(--primary)_30%,transparent)] bg-[var(--background)] text-[var(--primary)]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
              </div>
              <div>
                <div className="font-display text-sm font-semibold">Suporte real</div>
                <p className="text-sm text-[var(--muted-foreground)]">Atendimento fácil e ágil para sua equipe.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ───────── FAQ ───────── */}
        <section id="faq" className="relative py-20 md:py-28">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <div className="text-center" data-reveal>
              <h2 className="font-display text-3xl font-bold sm:text-5xl">
                Perguntas <span className="text-gradient-orange">frequentes</span>
              </h2>
            </div>
            <div className="mt-10 flex flex-col gap-3">
              {FAQ.map(({ q, a, open }) => (
                <details key={q} className="group rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 open:border-[color-mix(in_oklab,var(--primary)_40%,transparent)]" open={open}>
                  <summary className="flex cursor-pointer items-center justify-between gap-4">
                    <span className="font-display text-base font-semibold">{q}</span>
                    <span className="faq-icon flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--primary)]">
                      <PlusIcon />
                    </span>
                  </summary>
                  <p className="mt-3 text-sm text-[var(--muted-foreground)]">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ───────── Final CTA ───────── */}
        <section id="cta-final" className="relative py-20 md:py-28">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="relative overflow-hidden rounded-3xl border border-[color-mix(in_oklab,var(--primary)_30%,transparent)] bg-[var(--card)] p-6 text-center shadow-glow sm:p-10 md:p-16">
              <div className="absolute inset-0 bg-hero opacity-60" aria-hidden="true"></div>
              <div className="absolute inset-0 grid-bg opacity-50" aria-hidden="true"></div>
              <div className="relative">
                <h2 className="font-display text-3xl font-bold leading-tight sm:text-5xl text-balance">
                  Pronto para governar com <span className="text-gradient-orange">inteligência?</span>
                </h2>
                <p className="mx-auto mt-5 max-w-xl text-[var(--muted-foreground)]">
                  Comece hoje. Sem cartão. Sem fidelidade. Resultados desde o primeiro acesso.
                </p>
                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Link to="/login" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-orange-gradient px-7 py-4 text-sm font-semibold text-[var(--primary-foreground)] shadow-glow transition hover:opacity-95 sm:w-auto">
                    Acessar o NID
                    <ArrowIcon size={16} />
                  </Link>
                  <a href={WA_PLATAFORMA} target="_blank" rel="noopener noreferrer" className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-7 py-4 text-sm font-semibold text-[var(--foreground)] transition hover:border-[color-mix(in_oklab,var(--primary)_40%,transparent)] sm:w-auto" style={{ background: "color-mix(in oklab, var(--background) 60%, transparent)" }}>
                    Entre em contato com nossa equipe
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ───────── Footer ───────── */}
      <footer className="border-t border-[var(--border)]" style={{ background: "color-mix(in oklab, var(--background) 60%, transparent)" }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10">
          <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div>
              <div className="flex items-center gap-3">
                <img src={uaiziLogo} alt="UAIZI" className="h-9 w-auto" />
                <span className="font-display text-base font-semibold text-[var(--muted-foreground)]">© 2026</span>
              </div>
              <p className="mt-3 max-w-md text-sm text-[var(--muted-foreground)]">
                Inteligência de dados para gestões municipais que querem resultado.
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
              © 2026
              <img src={uaiziLogo} alt="UAIZI" className="h-5 w-auto" />
              Tech.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
