export const languages = {
  en: "English",
  pt: "Português",
} as const;

export type Lang = keyof typeof languages;

export const defaultLang = "en" satisfies Lang;
export const showDefaultLang = false;

const en = {
  "site.title": "Matheus Calegari",
  "site.description":
    "Software engineer crafting clean, considered web experiences.",
  "language.label": "Language",
  "theme.toggle": "Toggle theme",
  "hero.title": "Matheus Calegari",
  "curriculum.download": "Open curriculum",
  "curriculum.hint": "Opens in current language",
  "footer.builtWith": "Built with",
  "footer.inspiration": "Inspired by",
  "footer.rights": "All rights reserved.",
  "notFound.title": "Page not found",
  "notFound.message": "The page you're looking for doesn't exist or has moved.",
  "notFound.back": "Back home",
} as const;

type UiKey = keyof typeof en;

export const ui = {
  en,
  pt: {
    "site.title": "Matheus Calegari",
    "site.description":
      "Engenheiro de software criando experiências web limpas e bem pensadas.",
    "language.label": "Idioma",
    "theme.toggle": "Alternar tema",
    "hero.title": "Matheus Calegari",
    "curriculum.download": "Abrir currículo",
    "curriculum.hint": "Abre no idioma atual",
    "footer.builtWith": "Feito com",
    "footer.inspiration": "Inspirado em",
    "footer.rights": "Todos os direitos reservados.",
    "notFound.title": "Página não encontrada",
    "notFound.message": "A página que você procura não existe ou foi movida.",
    "notFound.back": "Voltar ao início",
  },
} satisfies Record<Lang, Record<UiKey, string>>;

export type TranslationKey = UiKey;
