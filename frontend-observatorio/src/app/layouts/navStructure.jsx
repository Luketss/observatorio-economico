import {
  AcademicCapIcon,
  BanknotesIcon,
  BoltIcon,
  BriefcaseIcon,
  BuildingLibraryIcon,
  BuildingOffice2Icon,
  BuildingOfficeIcon,
  BuildingStorefrontIcon,
  CalendarDaysIcon,
  CalendarIcon,
  ChartBarIcon,
  ChartBarSquareIcon,
  ChartPieIcon,
  ClipboardDocumentListIcon,
  FolderOpenIcon,
  FunnelIcon,
  GlobeAltIcon,
  HeartIcon,
  HomeIcon,
  NewspaperIcon,
  PencilSquareIcon,
  PresentationChartBarIcon,
  ShieldCheckIcon,
  TrophyIcon,
} from "@heroicons/react/24/outline";

// Navegação do app em 5 seções-eixo (spec 2026-08-18-reorganizacao-eixos).
// As chaves `modulo` acoplam este arquivo a plano_config.modulos (banco) e a
// scoped_modulo() no backend — NÃO renomear sem migração de dados.
export const NAV_STRUCTURE = [
  {
    type: "section",
    label: "Visão Executiva",
    items: [
      { type: "link", to: "/app", label: "Núcleo de Dados", icon: HomeIcon, end: true, modulo: "geral" },
      { type: "link", to: "/app/painel-prefeito", label: "Visão do Prefeito", icon: BuildingLibraryIcon, modulo: "painel_prefeito" },
      { type: "link", to: "/app/benchmark", label: "Benchmark", icon: ChartBarSquareIcon, modulo: "benchmark" },
      {
        type: "group", label: "Panorama Socioeconômico", icon: HeartIcon,
        children: [
          { to: "/app/ips", label: "IPS", icon: PresentationChartBarIcon, modulo: "ips" },
          { to: "/app/bolsa-familia", label: "Bolsa Família", icon: HeartIcon, modulo: "bolsa_familia" },
          { to: "/app/pe-de-meia", label: "Pé-de-Meia", icon: AcademicCapIcon, modulo: "pe_de_meia" },
          { to: "/app/inss", label: "INSS", icon: ShieldCheckIcon, modulo: "inss" },
        ],
      },
    ],
  },
  {
    type: "section",
    label: "Indicadores & Cidade Int.",
    items: [
      { type: "link", to: "/app/dados-internos/indicadores", label: "Indicadores Internos", icon: ChartPieIcon, modulo: "dados_internos.indicadores" },
    ],
  },
  {
    type: "section",
    label: "Dados Econômicos",
    items: [
      { type: "link", to: "/app/pib", label: "PIB", icon: ChartBarIcon, modulo: "pib" },
      { type: "link", to: "/app/vaf", label: "VAF", icon: ChartPieIcon, modulo: "vaf" },
      { type: "link", to: "/app/empresas", label: "Empresas", icon: BuildingStorefrontIcon, modulo: "empresas" },
      { type: "link", to: "/app/estban", label: "Bancos", icon: BuildingOfficeIcon, modulo: "estban" },
      { type: "link", to: "/app/comex", label: "Comércio Exterior", icon: GlobeAltIcon, modulo: "comex" },
      { type: "link", to: "/app/pix", label: "PIX", icon: BanknotesIcon, modulo: "pix" },
      { type: "link", to: "/app/analise-economica", label: "Análise Econômica", icon: PresentationChartBarIcon },
      {
        type: "group", label: "Emprego", icon: BriefcaseIcon,
        children: [
          { to: "/app/caged", label: "CAGED", icon: BriefcaseIcon, modulo: "caged" },
          { to: "/app/rais", label: "RAIS", icon: BuildingLibraryIcon, modulo: "rais" },
        ],
      },
      {
        type: "group", label: "Fiscal", icon: BanknotesIcon,
        children: [
          { to: "/app/arrecadacao", label: "Arrecadação", icon: BanknotesIcon, modulo: "arrecadacao" },
          { to: "/app/fpm", label: "FPM", icon: BanknotesIcon },
        ],
      },
    ],
  },
  {
    type: "section",
    label: "Desenv. Empresarial",
    items: [
      { type: "link", to: "/app/desenvolvimento-economico/retencao", label: "Gestão Empresarial", icon: BuildingOffice2Icon, modulo: "desenvolvimento_economico.retencao" },
      { type: "link", to: "/app/desenvolvimento-economico/funil", label: "Atração de Investimentos", icon: FunnelIcon, modulo: "desenvolvimento_economico.funil" },
      {
        type: "group", label: "Certificações e Premiações", icon: TrophyIcon,
        children: [
          { to: "/app/desenvolvimento-economico/premiacoes", label: "Premiações", icon: TrophyIcon, modulo: "desenvolvimento_economico.premiacoes" },
          { to: "/app/desenvolvimento-economico/captacao", label: "Captação de Recursos", icon: BanknotesIcon, modulo: "desenvolvimento_economico.captacao" },
          { to: "/app/desenvolvimento-economico/escrita", label: "Escrita de Projetos", icon: PencilSquareIcon, modulo: "desenvolvimento_economico.escrita" },
          { to: "/app/dinheiro-na-mesa", label: "Dinheiro na Mesa", icon: BanknotesIcon, modulo: "captacao_federal" },
          { to: "/app/emendas", label: "Emendas", icon: BuildingLibraryIcon, modulo: "emendas" },
        ],
      },
    ],
  },
  {
    type: "section",
    label: "Gestão",
    items: [
      { type: "link", to: "/app/projetos", label: "Planos de Desenvolvimento", icon: FolderOpenIcon, modulo: "projetos" },
      { type: "link", to: "/app/dados-internos/plano-gov", label: "Plano de Governo", icon: ClipboardDocumentListIcon, modulo: "dados_internos.plano_gov" },
      { type: "link", to: "/app/timeline", label: "Histórico Institucional", icon: CalendarDaysIcon, modulo: "timeline_mandato" },
      { type: "link", to: "/app/dados-internos/calendario", label: "Calendário", icon: CalendarIcon, modulo: "dados_internos.calendario" },
      { type: "link", to: "/app/impacto", label: "Impacto de Ações", icon: BoltIcon, modulo: "impacto" },
      { type: "link", to: "/app/releases", label: "Releases", icon: NewspaperIcon, modulo: "releases", hideForAdmin: true },
    ],
  },
];

// Lista plana de tudo que é navegável (links + filhos de grupo) — mapeia a
// rota atual para seu módulo (teaser de bloqueio por plano no layout).
export const NAV_FLAT = NAV_STRUCTURE.flatMap((section) =>
  section.items.flatMap((item) =>
    item.type === "group" ? item.children : item.type === "link" ? [item] : []
  )
);

export function isChildActive(children, pathname) {
  return children.some(
    (c) => pathname === c.to || (c.to !== "/" && pathname.startsWith(c.to))
  );
}

// Semântica idêntica ao isLocked que vivia no DashboardLayout: global,
// catálogo ainda não carregado (null) ou item sem chave nunca bloqueiam.
export function isModuloLocked({ isGlobal, modulos, modulo }) {
  if (isGlobal || modulos === null || modulo == null) return false;
  return !modulos.includes(modulo);
}
