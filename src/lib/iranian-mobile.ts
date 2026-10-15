const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

function toEnglishDigits(value: string) {
  return value.replace(/[۰-۹٠-٩]/gu, (digit) => {
    const persianIndex = PERSIAN_DIGITS.indexOf(digit);
    if (persianIndex >= 0) return String(persianIndex);

    return String(ARABIC_DIGITS.indexOf(digit));
  });
}

export function normalizeIranianMobile(value: string) {
  const normalized = toEnglishDigits(value.normalize("NFKC").trim());

  if (!/^(?:\+|00)?\d(?:[\d -]*\d)?$/u.test(normalized)) {
    return null;
  }

  const compact = normalized.replace(/[ -]/gu, "");

  if (/^09\d{9}$/u.test(compact)) {
    return `+98${compact.slice(1)}`;
  }

  if (/^00989\d{9}$/u.test(compact)) {
    return `+${compact.slice(2)}`;
  }

  if (/^\+989\d{9}$/u.test(compact)) {
    return compact;
  }

  return null;
}

export function isValidIranianMobile(value: string) {
  return normalizeIranianMobile(value) !== null;
}
