// Mapeamento mouse → viewBox para o hover dos gráficos de linha.
// O overlay <rect> dos gráficos cobre apenas o plot interno (x: padL..padL+innerW),
// então a fração do mouse dentro dele precisa ser projetada nesse intervalo.

export function viewBoxXFromOverlay(clientX, overlayRect, padL, innerW) {
  if (!overlayRect.width) return padL;
  return padL + ((clientX - overlayRect.left) / overlayRect.width) * innerW;
}

export function nearestIndexByX(xs, px) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < xs.length; i++) {
    const d = Math.abs(xs[i] - px);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}
