// Util compartilhado dos releases de imprensa — extraído de ReleasesPage,
// ReleasesPanel e ReleasesAdminPage (as 3 superfícies tinham DATASET_LABELS,
// fmtDate, getLabel e o template de impressão triplicados). DATASET_LABELS
// abaixo é a união das 3 cópias — elas já batiam exatamente nas mesmas 12
// chaves/labels, sem divergência a resolver.

export const DATASET_LABELS = {
  geral: "Visão Geral",
  arrecadacao: "Arrecadação",
  pib: "PIB",
  caged: "CAGED",
  rais: "RAIS",
  bolsa_familia: "Bolsa Família",
  pe_de_meia: "Pé-de-Meia",
  inss: "INSS",
  estban: "Bancos (Estban)",
  comex: "Comércio Exterior",
  empresas: "Empresas",
  pix: "PIX",
};

// Aceita tanto a chave crua ("caged") quanto o dataset prefixado que vem do
// backend ("release_caged") — o replace é um no-op quando não há prefixo.
export function getLabel(dataset) {
  if (!dataset) return dataset;
  const key = dataset.replace(/^release_/, "");
  return DATASET_LABELS[key] || key;
}

// Formato longo (dia + mês por extenso + ano) usado no documento impresso e
// na data exibida em ReleasesPage. "—" no falsy é o fallback mais seguro das
// 3 cópias originais (Panel/Admin devolviam "" / null nesse caso).
export function fmtDateRelease(dt) {
  if (!dt) return "—";
  return new Date(dt).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

// Monta e abre a janela de impressão do release. Guarda contra pop-up
// bloqueado (window.open retornando null) — antes disso estourava TypeError
// em win.document.write. Retorna boolean para o chamador decidir se avisa o
// usuário.
export function abrirImpressao(release, municipioNome = "Município") {
  const label = getLabel(release.dataset);
  const dataGerado = fmtDateRelease(release.gerado_em);
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Release — ${label} — ${municipioNome}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 12pt;
      line-height: 1.8;
      color: #1a1a1a;
      background: white;
      max-width: 720px;
      margin: 0 auto;
      padding: 48px 40px;
    }
    header {
      border-bottom: 3px solid #1a1a1a;
      padding-bottom: 16px;
      margin-bottom: 28px;
    }
    .tag {
      font-size: 8.5pt;
      font-weight: bold;
      letter-spacing: .12em;
      text-transform: uppercase;
      color: #666;
      margin-bottom: 8px;
    }
    h1 { font-size: 22pt; font-weight: bold; line-height: 1.2; margin-bottom: 8px; }
    .meta { font-size: 9pt; color: #555; font-style: italic; }
    .body p { margin-bottom: 1.4em; text-align: justify; hyphens: auto; }
    @media print { body { padding: 0; max-width: 100%; } @page { margin: 2cm; } }
  </style>
</head>
<body>
  <header>
    <div class="tag">Release de Imprensa</div>
    <h1>Prefeitura de ${municipioNome}</h1>
    <div class="meta">${label} &mdash; ${dataGerado}</div>
  </header>
  <div class="body">
    ${release.bullets.map((p) => `<p>${p}</p>`).join("\n    ")}
  </div>
  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`;
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}
