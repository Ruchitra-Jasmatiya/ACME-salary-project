/**
 * Currency and country reference data.
 *
 * Rates are static on purpose (see docs/REQUIREMENTS.md): reports stay
 * deterministic and testable. A rates table is the extension point for live FX.
 */

export const REPORTING_CURRENCY = 'USD';

/** Units of USD per one unit of the given currency. */
export const USD_RATES: Readonly<Record<string, number>> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
  INR: 0.012,
  CAD: 0.73,
  AUD: 0.65,
  JPY: 0.0067,
  SGD: 0.74,
  BRL: 0.18,
};

export const COUNTRIES: Readonly<Record<string, { name: string; currency: string }>> = {
  US: { name: 'United States', currency: 'USD' },
  GB: { name: 'United Kingdom', currency: 'GBP' },
  DE: { name: 'Germany', currency: 'EUR' },
  FR: { name: 'France', currency: 'EUR' },
  IN: { name: 'India', currency: 'INR' },
  CA: { name: 'Canada', currency: 'CAD' },
  AU: { name: 'Australia', currency: 'AUD' },
  JP: { name: 'Japan', currency: 'JPY' },
  SG: { name: 'Singapore', currency: 'SGD' },
  BR: { name: 'Brazil', currency: 'BRL' },
};

export function isKnownCurrency(code: string): boolean {
  return Object.hasOwn(USD_RATES, code);
}

export function isKnownCountry(code: string): boolean {
  return Object.hasOwn(COUNTRIES, code);
}

export function toUsd(amount: number, currency: string): number {
  if (!isKnownCurrency(currency)) {
    throw new Error(`Unknown currency: ${currency}`);
  }
  return amount * USD_RATES[currency];
}

/**
 * SQL expression converting a salary column to USD. Built only from the
 * constants above (never from user input), so interpolation is safe.
 */
export function usdSql(salaryColumn = 'salary', currencyColumn = 'currency'): string {
  const whens = Object.entries(USD_RATES)
    .map(([code, rate]) => `WHEN '${code}' THEN ${rate}`)
    .join(' ');
  return `(${salaryColumn} * CASE ${currencyColumn} ${whens} END)`;
}
