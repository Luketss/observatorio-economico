/**
 * Gera dataset agregado CAGED - Divinópolis
 * Fonte: Pacote_Trabalho_Multicidades/CAGED
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pastaCaged = path.resolve(
  __dirname,
  "../../Pacote_Trabalho_Multicidades/CAGED",
);

const outputPath = path.resolve(
  __dirname,
  "../src/data/caged_divinopolis.json",
);

function gerar() {
  const arquivos = fs.readdirSync(pastaCaged);
  const arquivoDiv = arquivos.find((a) =>
    a.toLowerCase().includes("divinopolis"),
  );

  if (!arquivoDiv) {
    console.error("Arquivo CAGED de Divinópolis não encontrado.");
    return;
  }

  const caminho = path.join(pastaCaged, arquivoDiv);
  const raw = fs.readFileSync(caminho, "utf-8");
  const linhas = raw.split("\n").slice(1);

  const agregados = {};

  for (const linha of linhas) {
    if (!linha.trim()) continue;

    const cols = linha.split(";");

    // Ajustar conforme estrutura real do CSV
    const ano = Number(cols[0]);
    const mes = Number(cols[1]);
    const admissoes = Number(cols[2]);
    const desligamentos = Number(cols[3]);

    if (!ano || !mes) continue;

    const chave = `${ano}-${mes}`;

    if (!agregados[chave]) {
      agregados[chave] = {
        ano,
        mes,
        admissoes: 0,
        desligamentos: 0,
        saldo: 0,
      };
    }

    agregados[chave].admissoes += admissoes || 0;
    agregados[chave].desligamentos += desligamentos || 0;
    agregados[chave].saldo =
      agregados[chave].admissoes - agregados[chave].desligamentos;
  }

  const resultado = Object.values(agregados).sort(
    (a, b) => a.ano - b.ano || a.mes - b.mes,
  );

  fs.writeFileSync(outputPath, JSON.stringify(resultado, null, 2));

  console.log("✅ CAGED Divinópolis gerado:", outputPath);
}

gerar();
