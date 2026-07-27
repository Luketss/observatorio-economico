import { describe, it, expect } from "vitest";
import { viewBoxXFromOverlay, nearestIndexByX } from "./chartHover";

// Geometria típica dos gráficos de linha (AreaLineChart / MultiLineChart):
// viewBox de largura w, plot interno começando em padL.
const w = 800;
const padL = 56;
const padR = 16;
const innerW = w - padL - padR; // 728

// 13 pontos (ex.: 12 meses + atual) distribuídos no plot interno
const N = 13;
const sx = (i) => padL + (i / (N - 1)) * innerW;
const xs = Array.from({ length: N }, (_, i) => sx(i));

// O overlay <rect> cobre só o plot interno: rect.left ↔ viewBox x = padL,
// rect.width ↔ innerW (aqui renderizado 1:1; offset de página arbitrário).
const overlay = { left: 100, width: innerW };

describe("viewBoxXFromOverlay", () => {
  it("mouse exatamente sobre cada ponto mapeia para o x do ponto no viewBox", () => {
    for (let i = 0; i < N; i++) {
      const clientX = overlay.left + (sx(i) - padL); // posição do ponto na tela
      const px = viewBoxXFromOverlay(clientX, overlay, padL, innerW);
      expect(px).toBeCloseTo(sx(i), 6);
    }
  });

  it("funciona quando o SVG é renderizado em escala (responsivo)", () => {
    const scaled = { left: 40, width: innerW / 2 }; // gráfico na metade do tamanho
    for (let i = 0; i < N; i++) {
      const clientX = scaled.left + ((sx(i) - padL) / innerW) * scaled.width;
      const px = viewBoxXFromOverlay(clientX, scaled, padL, innerW);
      expect(px).toBeCloseTo(sx(i), 6);
    }
  });

  it("largura zero não divide por zero", () => {
    expect(viewBoxXFromOverlay(123, { left: 100, width: 0 }, padL, innerW)).toBe(padL);
  });
});

describe("nearestIndexByX", () => {
  it("mouse sobre o ponto seleciona o próprio ponto (não o anterior)", () => {
    for (let i = 0; i < N; i++) {
      const clientX = overlay.left + (sx(i) - padL);
      const px = viewBoxXFromOverlay(clientX, overlay, padL, innerW);
      expect(nearestIndexByX(xs, px)).toBe(i);
    }
  });

  it("logo após o ponto médio entre dois pontos, seleciona o ponto seguinte", () => {
    for (let i = 0; i < N - 1; i++) {
      const midScreen = overlay.left + ((sx(i) + sx(i + 1)) / 2 - padL) + 1;
      const px = viewBoxXFromOverlay(midScreen, overlay, padL, innerW);
      expect(nearestIndexByX(xs, px)).toBe(i + 1);
    }
  });

  it("logo antes do ponto médio, mantém o ponto atual", () => {
    for (let i = 0; i < N - 1; i++) {
      const midScreen = overlay.left + ((sx(i) + sx(i + 1)) / 2 - padL) - 1;
      const px = viewBoxXFromOverlay(midScreen, overlay, padL, innerW);
      expect(nearestIndexByX(xs, px)).toBe(i);
    }
  });
});
