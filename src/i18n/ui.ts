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
  "scrollTop.label": "Back to top",
  "hero.title": "Matheus Calegari",
  "curriculum.download": "Open curriculum",
  "curriculum.hint": "Opens in current language",
  "curriculum.hintEnglish": "Opens in English",
  "footer.builtWith": "Built with",
  "footer.inspiration": "Inspired by",
  "footer.rights": "All rights reserved.",
  "notFound.title": "Page not found",
  "notFound.message": "The page you're looking for doesn't exist or has moved.",
  "notFound.back": "Back home",
  "translate.search": "Search languages…",
  "translate.noResults": "No languages found",
  "translate.notice": "Machine-translated from English by DeepL.",
  "translate.original": "View original",
  "translate.loading": "Translating…",
  "translate.error":
    "Translation is unavailable right now. Showing the original.",
  "translate.machine": "Machine translation",
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
    "scrollTop.label": "Voltar ao topo",
    "hero.title": "Matheus Calegari",
    "curriculum.download": "Abrir currículo",
    "curriculum.hint": "Abre no idioma atual",
    "curriculum.hintEnglish": "Abre em inglês",
    "footer.builtWith": "Feito com",
    "footer.inspiration": "Inspirado em",
    "footer.rights": "Todos os direitos reservados.",
    "notFound.title": "Página não encontrada",
    "notFound.message": "A página que você procura não existe ou foi movida.",
    "notFound.back": "Voltar ao início",
    "translate.search": "Buscar idiomas…",
    "translate.noResults": "Nenhum idioma encontrado",
    "translate.notice": "Tradução automática do inglês feita pelo DeepL.",
    "translate.original": "Ver original",
    "translate.loading": "Traduzindo…",
    "translate.error":
      "A tradução está indisponível no momento. Exibindo o original.",
    "translate.machine": "Tradução automática",
  },
} satisfies Record<Lang, Record<UiKey, string>>;

export type TranslationKey = UiKey;
