/**
 * Gera dataset RAIS - Oliveira (Ano + Mês)
 * Fonte: Pacote_Trabalho_Multicidades/RAIS
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pastaRais = path.resolve(
  __dirname,
  "../../Pacote_Trabalho_Multicidades/RAIS",
);

const outputPath = path.resolve(__dirname, "../src/data/rais_oliveira.json");

function gerar() {
  const arquivos = fs.readdirSync(pastaRais);
  const arquivoOliveira = arquivos.find((a) =>
    a.toLowerCase().includes("oliveira"),
  );

  if (!arquivoOliveira) {
    console.error("Arquivo RAIS de Oliveira não encontrado.");
    return;
  }

  const caminho = path.join(pastaRais, arquivoOliveira);
  const raw = fs.readFileSync(caminho, "utf-8");
  const linhas = raw.split("\n").slice(1);

  // Estruturas: mensal e anual
  const mapaMensal = {};
  const mapaAnual = {};

  for (const linha of linhas) {
    if (!linha.trim()) continue;

    const cols = linha.split(";");

    const ano = Number(cols[0]);
    const mesAdmissao = Number(cols[6]);
    const vinculoAtivo = Number(cols[4]);
    const sexoCodigo = Number(cols[52]); // coluna sexo (posição correta)
    const remuneracao = Number(cols[37]) || 0; // valor_remuneracao_dezembro (posição correta)

    if (!ano || vinculoAtivo !== 1) continue;

    const mes = mesAdmissao && mesAdmissao > 0 ? mesAdmissao : 12;

    const sexo =
      sexoCodigo === 1
        ? "Masculino"
        : sexoCodigo === 2
          ? "Feminino"
          : "Ignorado";

    // ===== MENSAL =====
    const chaveMensal = `${ano}-${mes}-${sexo}`;

    if (!mapaMensal[chaveMensal]) {
      mapaMensal[chaveMensal] = {
        ano,
        mes,
        sexo,
        total_vinculos: 0,
        massa_salarial: 0,
      };
    }

    mapaMensal[chaveMensal].total_vinculos += 1;
    mapaMensal[chaveMensal].massa_salarial += remuneracao;

    // ===== ANUAL =====
    const chaveAnual = `${ano}-${sexo}`;

    if (!mapaAnual[chaveAnual]) {
      mapaAnual[chaveAnual] = {
        ano,
        sexo,
        total_vinculos: 0,
        massa_salarial: 0,
      };
    }

    mapaAnual[chaveAnual].total_vinculos += 1;
    mapaAnual[chaveAnual].massa_salarial += remuneracao;
  }

  const mensal = Object.values(mapaMensal)
    .map((item) => ({
      ...item,
      media_salarial:
        item.total_vinculos > 0 ? item.massa_salarial / item.total_vinculos : 0,
    }))
    .sort((a, b) =>
      a.ano === b.ano
        ? a.mes === b.mes
          ? a.sexo.localeCompare(b.sexo)
          : a.mes - b.mes
        : a.ano - b.ano,
    );

  const anual = Object.values(mapaAnual)
    .map((item) => ({
      ...item,
      media_salarial:
        item.total_vinculos > 0 ? item.massa_salarial / item.total_vinculos : 0,
    }))
    .sort((a, b) =>
      a.ano === b.ano ? a.sexo.localeCompare(b.sexo) : a.ano - b.ano,
    );

  const resultado = {
    mensal,
    anual,
  };

  fs.writeFileSync(outputPath, JSON.stringify(resultado, null, 2));

  console.log("✅ RAIS Oliveira (mensal + anual por sexo) gerado:", outputPath);
}

gerar();
