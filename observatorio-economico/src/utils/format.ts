export function formatNumber(value: number | string) {
  const number =
    typeof value === "string" ? Number(value) : value;

  if (isNaN(number)) return "0";

  return number.toLocaleString("pt-BR");
}

export function formatCurrency(value: number | string) {
  const number =
    typeof value === "string" ? Number(value) : value;

  if (isNaN(number)) return "R$ 0";

  return number.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function formatPercent(value: number) {
  if (isNaN(value)) return "0%";

  return `${value.toFixed(1).replace(".", ",")}%`;
}
