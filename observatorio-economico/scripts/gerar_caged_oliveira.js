/**
 * Gera dataset CAGED - Oliveira
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

const outputPath = path.resolve(__dirname, "../src/data/caged_oliveira.json");

function gerar() {
  const arquivos = fs.readdirSync(pastaCaged);
  const arquivoOliveira = arquivos.find((a) =>
    a.toLowerCase().includes("oliveira"),
  );

  if (!arquivoOliveira) {
    console.error("Arquivo CAGED de Oliveira não encontrado.");
    return;
  }

  const caminho = path.join(pastaCaged, arquivoOliveira);
  const raw = fs.readFileSync(caminho, "utf-8");
  const linhas = raw.split("\n").slice(1);

  const resultado = [];

  for (const linha of linhas) {
    if (!linha.trim()) continue;

    // Detecta automaticamente o separador
    const separador = linha.includes(";") ? ";" : ",";
    const cols = linha.split(separador);

    // Limpeza de valores (remove ponto de milhar e ajusta vírgula decimal)
    const parseNumero = (valor) =>
      Number((valor || "0").replace(/\./g, "").replace(",", ".").trim());

    const ano = parseNumero(cols[0]);
    const mes = parseNumero(cols[1]);

    // No layout real:
    // cols[6] = saldo_movimentacao
    const saldoMov = parseNumero(cols[6]);

    if (!ano || !mes) continue;

    const chave = `${ano}-${mes}`;

    let registro = resultado.find((r) => r.ano === ano && r.mes === mes);

    if (!registro) {
      registro = {
        ano,
        mes,
        admissoes: 0,
        desligamentos: 0,
        saldo: 0,
      };
      resultado.push(registro);
    }

    // saldo_movimentacao:
    //  1  = admissão
    // -1  = desligamento
    // outros valores podem existir dependendo da base
    if (saldoMov > 0) registro.admissoes += saldoMov;
    if (saldoMov < 0) registro.desligamentos += Math.abs(saldoMov);

    registro.saldo += saldoMov;
  }

  resultado.sort((a, b) => (a.ano === b.ano ? a.mes - b.mes : a.ano - b.ano));

  fs.writeFileSync(outputPath, JSON.stringify(resultado, null, 2));

  console.log("✅ CAGED Oliveira gerado:", outputPath);
}

gerar();
