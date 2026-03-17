/**
 * Gera dataset agregado RAIS - Divinópolis
 * Fonte: Pacote_Trabalho_Multicidades/RAIS
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pastaRAIS = path.resolve(
  __dirname,
  "../../Pacote_Trabalho_Multicidades/RAIS",
);

const outputPath = path.resolve(__dirname, "../src/data/rais_divinopolis.json");

function gerar() {
  const arquivos = fs.readdirSync(pastaRAIS);
  const arquivoDiv = arquivos.find((a) =>
    a.toLowerCase().includes("divinopolis"),
  );

  if (!arquivoDiv) {
    console.error("Arquivo RAIS de Divinópolis não encontrado.");
    return;
  }

  const caminho = path.join(pastaRAIS, arquivoDiv);
  const raw = fs.readFileSync(caminho, "utf-8");
  const linhas = raw.split("\n").slice(1);

  const agregados = {};

  for (const linha of linhas) {
    if (!linha.trim()) continue;

    const cols = linha.split(";");
    const ano = Number(cols[0]); // assumindo ano na primeira coluna
    const setor = cols[1]; // assumindo setor na segunda coluna
    const vinculos = Number(cols[2]); // assumindo total vínculos

    if (!ano || !setor || !vinculos) continue;

    if (!agregados[ano]) {
      agregados[ano] = {
        ano,
        total_vinculos: 0,
        setores: {},
      };
    }

    agregados[ano].total_vinculos += vinculos;

    if (!agregados[ano].setores[setor]) {
      agregados[ano].setores[setor] = 0;
    }

    agregados[ano].setores[setor] += vinculos;
  }

  const resultado = Object.values(agregados).sort((a, b) => a.ano - b.ano);

  fs.writeFileSync(outputPath, JSON.stringify(resultado, null, 2));

  console.log("✅ RAIS Divinópolis gerado:", outputPath);
}

gerar();
