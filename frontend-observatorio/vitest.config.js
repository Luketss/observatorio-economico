import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// plugins: [react()] fica pela paridade com o vite.config.js do app real,
// mas neste projeto (Vite 8 + @vitejs/plugin-react 6, que configura o
// transform de JSX via "oxc"/rolldown) o Vitest 2.1.9 não consome esse
// caminho — seu transform de teste ainda passa pelo esbuild "clássico" da
// Vite, que só o campo esbuild.jsx abaixo alcança. Sem os dois, arquivos
// .jsx falham com "ReferenceError: React is not defined" mesmo com o
// plugin presente. environment "node" e o include continuam os mesmos —
// testes puros (utils/hooks) não pedem DOM e seguem rápidos; quem precisa
// de DOM declara "// @vitest-environment jsdom".
export default defineConfig({
  plugins: [react()],
  esbuild: { jsx: "automatic" },
  test: { environment: "node", include: ["src/**/*.test.{js,jsx}"] },
});
