export const languages = {
  en: "English",
  pt: "Português",
} as const;

export type Lang = keyof typeof languages;

export const defaultLang = "en" satisfies Lang;
export const showDefaultLang = false;

const en = {
  "site.title": "Matheus Calegari",
  "site.description": "A minimalist personal portfolio.",
  "nav.home": "Home",
  "nav.curriculum": "Curriculum",
  "language.label": "Language",
  "theme.toggle": "Toggle theme",
  "hero.eyebrow": "Portfolio",
  "hero.title": "Matheus Calegari",
  "hero.description":
    "A short placeholder introduction for the portfolio. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Donec molestie vel enim ut lobortis. Nam euismod, ante quis hendrerit iaculis, lectus sem accumsan erat, mollis consectetur odio risus ut arcu. Proin convallis tincidunt quam. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur dolor felis, efficitur in posuere quis, accumsan vitae dui. Sed at consequat elit. Pellentesque ut dui vitae nisl ullamcorper luctus \n eget ut mi. Pellentesque vitae purus lacus. Suspendisse consequat ex ac nulla pretium, a fringilla mauris euismod. Nam sit amet enim est. \n Morbi ac augue et eros consectetur tincidunt. Nunc molestie euismod congue. Maecenas mollis justo vitae viverra euismod. Mauris congue lorem et euismod pretium. Vivamus porttitor metus ac quam commodo luctus id id mi. Phasellus tortor libero, blandit non massa in, varius sagittis lacus. Integer iaculis fringilla ipsum, in vestibulum nulla commodo eu. Morbi tincidunt, dolor sit amet laoreet cursus, ex lorem egestas quam, vestibulum commodo lectus libero id nulla. Sed vitae maximus arcu. Aenean bibendum \n convallis neque sit amet sodales. Nulla efficitur et risus nec suscipit. Mauris eget ultricies odio, nec suscipit justo. Ut venenatis nibh luctus nisi faucibus aliquet. Mauris consequat nisl ipsum, eget eleifend nibh tempus eget.\n",
  "curriculum.download": "Download curriculum",
} as const;

type UiKey = keyof typeof en;

export const ui = {
  en,
  pt: {
    "site.title": "Matheus Calegari",
    "site.description": "Um portfólio pessoal minimalista.",
    "nav.home": "Início",
    "nav.curriculum": "Currículo",
    "language.label": "Idioma",
    "theme.toggle": "Alternar tema",
    "hero.eyebrow": "Portfólio",
    "hero.title": "Matheus Calegari",
    "hero.description": "Uma breve introdução provisória para o portfólio.",
    "curriculum.download": "Baixar currículo",
  },
} satisfies Record<Lang, Record<UiKey, string>>;

export type TranslationKey = UiKey;
