/** CPF/CNPJ helpers (mirror of the server's check in server/src/fieldRules.ts). */

/** 11 digits = CPF, 14 = CNPJ, with valid check digits. */
export function isValidDocument(raw: string): boolean {
  const d = raw.replace(/\D/g, "");
  if (!/^(\d{11}|\d{14})$/.test(d) || /^(\d)\1+$/.test(d)) return false;
  const digit = (base: string, weights: number[]) => {
    const r = base.split("").reduce((s, c, i) => s + Number(c) * weights[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  if (d.length === 11) {
    const w = (n: number) => Array.from({ length: n }, (_, i) => n + 1 - i);
    return digit(d.slice(0, 9), w(9)) === Number(d[9]) && digit(d.slice(0, 10), w(10)) === Number(d[10]);
  }
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  return digit(d.slice(0, 12), w1) === Number(d[12]) && digit(d.slice(0, 13), [6, ...w1]) === Number(d[13]);
}

/** Mask while typing: up to 11 digits as CPF (000.000.000-00), beyond as CNPJ (00.000.000/0000-00). */
export function maskDocument(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) {
    return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}
