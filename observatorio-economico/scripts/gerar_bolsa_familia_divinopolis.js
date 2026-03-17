/**
 * Gera dataset agregado Bolsa Família - Divinópolis
 * Fonte: Bolsa_Familia_Cidades_Completo
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pastaBolsa = path.resolve(
  __dirname,
  "../../Bolsa_Familia_Cidades_Completo",
);

const outputPath = path.resolve(
  __dirname,
  "../src/data/bolsa_familia_divinopolis.json",
);

function gerar() {
  const arquivos = fs.readdirSync(pastaBolsa);
  const arquivoDiv = arquivos.find((a) =>
    a.toLowerCase().includes("divinopolis"),
  );

  if (!arquivoDiv) {
    console.error("Arquivo Bolsa Família de Divinópolis não encontrado.");
    return;
  }

  const caminho = path.join(pastaBolsa, arquivoDiv);
  const raw = fs.readFileSync(caminho, "utf-8");
  const linhas = raw.split("\n").slice(1);

  const agregados = {};

  for (const linha of linhas) {
    if (!linha.trim()) continue;

    const cols = linha.split(";");
    const ano = Number(cols[0]); // assumindo ano na primeira coluna
    const beneficiarios = Number(cols[1]); // total beneficiários
    const valor = Number((cols[2] || "0").replace(",", ".")); // valor repassado (se existir)

    if (!ano) continue;

    if (!agregados[ano]) {
      agregados[ano] = {
        ano,
        total_beneficiarios: 0,
        total_repasses: 0,
      };
    }

    if (beneficiarios) agregados[ano].total_beneficiarios += beneficiarios;

    if (valor) agregados[ano].total_repasses += valor;
  }

  const resultado = Object.values(agregados).sort((a, b) => a.ano - b.ano);

  fs.writeFileSync(outputPath, JSON.stringify(resultado, null, 2));

  console.log("✅ Bolsa Família Divinópolis gerado:", outputPath);
}

gerar();
