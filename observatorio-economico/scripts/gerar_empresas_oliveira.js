/**
 * Gera dataset Empresas - Oliveira (Mensal + Setor)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pasta = path.resolve(__dirname, "../../Pacote_CNPJ_Completo_Corrigido");

const outputPath = path.resolve(
  __dirname,
  "../src/data/empresas_oliveira.json",
);

function gerar() {
  const arquivos = fs.readdirSync(pasta);
  const arquivo = arquivos.find((a) => a.toLowerCase().includes("oliveira"));

  if (!arquivo) {
    console.error("Arquivo CNPJ Oliveira não encontrado.");
    return;
  }

  const raw = fs.readFileSync(path.join(pasta, arquivo), "utf-8");
  const linhas = raw.split("\n").slice(1);

  const mapaMensal = {};
  const mapaSetor = {};

  for (const linha of linhas) {
    if (!linha.trim()) continue;

    const cols = linha.split(";");

    const dataInicio = cols[6]; // data_inicio
    const dataSituacao = cols[5]; // data_situacao
    const situacao = cols[4];
    const cnae = cols[7];

    if (dataInicio && dataInicio.length === 8) {
      const ano = Number(dataInicio.slice(0, 4));
      const mes = Number(dataInicio.slice(4, 6));

      const chave = `${ano}-${mes}`;

      if (!mapaMensal[chave]) {
        mapaMensal[chave] = {
          ano,
          mes,
          aberturas: 0,
          fechamentos: 0,
        };
      }

      mapaMensal[chave].aberturas += 1;

      const setor = cnae?.slice(0, 2) || "Outros";
      if (!mapaSetor[setor]) mapaSetor[setor] = 0;
      mapaSetor[setor] += 1;
    }

    // Fechamento
    if (situacao !== "02" && dataSituacao && dataSituacao.length === 8) {
      const ano = Number(dataSituacao.slice(0, 4));
      const mes = Number(dataSituacao.slice(4, 6));

      const chave = `${ano}-${mes}`;

      if (!mapaMensal[chave]) {
        mapaMensal[chave] = {
          ano,
          mes,
          aberturas: 0,
          fechamentos: 0,
        };
      }

      mapaMensal[chave].fechamentos += 1;
    }
  }

  const serie = Object.values(mapaMensal)
    .map((item) => ({
      ...item,
      saldo: item.aberturas - item.fechamentos,
    }))
    .sort((a, b) => (a.ano === b.ano ? a.mes - b.mes : a.ano - b.ano));

  const setores = Object.entries(mapaSetor).map(([setor, total]) => ({
    setor,
    total,
  }));

  fs.writeFileSync(outputPath, JSON.stringify({ serie, setores }, null, 2));

  console.log("✅ Empresas Oliveira gerado:", outputPath);
}

gerar();
