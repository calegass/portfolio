import type { TranslationKey } from "./ui";

export const MACHINE_LANGS = {
  ar: "AR",
  bg: "BG",
  cs: "CS",
  da: "DA",
  de: "DE",
  el: "EL",
  es: "ES",
  "es-419": "ES-419",
  et: "ET",
  fi: "FI",
  fr: "FR",
  he: "HE",
  hu: "HU",
  id: "ID",
  it: "IT",
  ja: "JA",
  ko: "KO",
  lt: "LT",
  lv: "LV",
  nb: "NB",
  nl: "NL",
  pl: "PL",
  ro: "RO",
  ru: "RU",
  sk: "SK",
  sl: "SL",
  sv: "SV",
  th: "TH",
  tr: "TR",
  uk: "UK",
  vi: "VI",
  "zh-hans": "ZH-HANS",
  "zh-hant": "ZH-HANT",
} as const;

export type MachineLang = keyof typeof MACHINE_LANGS;

export function isMachineLang(value: unknown): value is MachineLang {
  return typeof value === "string" && Object.hasOwn(MACHINE_LANGS, value);
}

export const MACHINE_UI_KEYS = [
  "site.description",
  "language.label",
  "theme.toggle",
  "scrollTop.label",
  "curriculum.download",
  "curriculum.hintEnglish",
  "footer.builtWith",
  "footer.inspiration",
  "footer.rights",
  "translate.search",
  "translate.noResults",
  "translate.notice",
  "translate.original",
] as const satisfies readonly TranslationKey[];

export type MachineUiKey = (typeof MACHINE_UI_KEYS)[number];

export const TRANSLATION_SOURCE_PATH = "/i18n-source.json";

// Bump to invalidate every cached translation (e.g. when the payload shape changes).
export const TRANSLATION_FORMAT = 2;

export interface TranslationSource {
  hash: string;
  html: string;
  ui: Record<MachineUiKey, string>;
}

export interface TranslationPayload {
  lang: MachineLang;
  hash: string;
  html: string;
  ui: Partial<Record<MachineUiKey, string>>;
}
