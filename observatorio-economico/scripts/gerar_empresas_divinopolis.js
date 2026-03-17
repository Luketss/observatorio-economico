/**
 * Script para gerar dataset agregado de abertura de empresas
 * Cidade: Divinópolis
 * Fonte: Pacote_CNPJ_Completo_Corrigido/CNPJ_Completo_Divinopolis.csv
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const csvPath = path.resolve(
  __dirname,
  "../../Pacote_CNPJ_Completo_Corrigido/CNPJ_Completo_Divinopolis.csv",
);

const outputPath = path.resolve(
  __dirname,
  "../src/data/empresas_divinopolis.json",
);

// Mapeamento simplificado de CNAE → Setor
function mapearSetor(cnae) {
  if (!cnae) return "Outros";

  const codigo = parseInt(cnae.substring(0, 2));

  if (codigo >= 45 && codigo <= 47) return "Comércio";
  if (codigo >= 10 && codigo <= 33) return "Indústria";
  if (codigo >= 55 && codigo <= 96) return "Serviços";

  return "Outros";
}

function gerar() {
  const raw = fs.readFileSync(csvPath, "utf-8");
  const linhas = raw.split("\n").slice(1); // remove header

  const agregados = {};

  for (const linha of linhas) {
    if (!linha.trim()) continue;

    const cols = linha.split(";");
    const dataInicio = cols[6];
    const cnae = cols[7];

    if (!dataInicio || dataInicio.length !== 8) continue;

    const ano = dataInicio.substring(0, 4);
    const mes = dataInicio.substring(4, 6);
    const setor = mapearSetor(cnae);

    const chave = `${ano}-${mes}-${setor}`;

    if (!agregados[chave]) {
      agregados[chave] = {
        cidade: "Divinópolis",
        ano: parseInt(ano),
        mes: parseInt(mes),
        setor,
        aberturas: 0,
      };
    }

    agregados[chave].aberturas++;
  }

  const resultado = Object.values(agregados).sort(
    (a, b) => a.ano - b.ano || a.mes - b.mes || a.setor.localeCompare(b.setor),
  );

  fs.writeFileSync(outputPath, JSON.stringify(resultado, null, 2));

  console.log("✅ Arquivo gerado:", outputPath);
}

gerar();
