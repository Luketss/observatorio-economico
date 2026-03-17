/**
 * Gera dataset agregado de abertura de empresas
 * Todas as cidades disponíveis em:
 * Pacote_CNPJ_Completo_Corrigido/
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pastaCNPJ = path.resolve(
  __dirname,
  "../../Pacote_CNPJ_Completo_Corrigido",
);

const outputPath = path.resolve(
  __dirname,
  "../src/data/empresas_multicidades.json",
);

// CNAE → Setor simplificado
function mapearSetor(cnae) {
  if (!cnae) return "Outros";

  const codigo = parseInt(cnae.substring(0, 2));

  if (codigo >= 45 && codigo <= 47) return "Comércio";
  if (codigo >= 10 && codigo <= 33) return "Indústria";
  if (codigo >= 55 && codigo <= 96) return "Serviços";

  return "Outros";
}

function normalizarNomeCidade(nomeArquivo) {
  return nomeArquivo
    .replace("CNPJ_Completo_", "")
    .replace(".csv", "")
    .replaceAll("_", " ")
    .trim();
}

function gerar() {
  const arquivos = fs.readdirSync(pastaCNPJ);
  const agregados = {};

  for (const arquivo of arquivos) {
    if (!arquivo.endsWith(".csv")) continue;

    const cidade = normalizarNomeCidade(arquivo);
    const caminhoArquivo = path.join(pastaCNPJ, arquivo);

    const raw = fs.readFileSync(caminhoArquivo, "utf-8");
    const linhas = raw.split("\n").slice(1);

    for (const linha of linhas) {
      if (!linha.trim()) continue;

      const cols = linha.split(";");
      const dataInicio = cols[6];
      const cnae = cols[7];

      if (!dataInicio || dataInicio.length !== 8) continue;

      const ano = dataInicio.substring(0, 4);
      const mes = dataInicio.substring(4, 6);
      const setor = mapearSetor(cnae);

      const chave = `${cidade}-${ano}-${mes}-${setor}`;

      if (!agregados[chave]) {
        agregados[chave] = {
          cidade,
          ano: parseInt(ano),
          mes: parseInt(mes),
          setor,
          aberturas: 0,
        };
      }

      agregados[chave].aberturas++;
    }
  }

  const resultado = Object.values(agregados).sort(
    (a, b) =>
      a.cidade.localeCompare(b.cidade) ||
      a.ano - b.ano ||
      a.mes - b.mes ||
      a.setor.localeCompare(b.setor),
  );

  fs.writeFileSync(outputPath, JSON.stringify(resultado, null, 2));

  console.log("✅ Dataset multicidades gerado:", outputPath);
}

gerar();
