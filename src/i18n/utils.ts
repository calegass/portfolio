import {
  defaultLang,
  showDefaultLang,
  ui,
  type Lang,
  type TranslationKey,
} from "./ui";

export function getLangFromUrl(url: URL): Lang {
  const [, lang] = url.pathname.split("/");

  if (lang in ui) {
    return lang as Lang;
  }

  return defaultLang;
}

export function getPathWithoutLang(url: URL): string {
  const parts = url.pathname.split("/").filter(Boolean);

  if (parts[0] && parts[0] in ui) {
    parts.shift();
  }

  if (parts.length === 0) {
    return "/";
  }

  return `/${parts.join("/")}/`;
}

export function getLocalizedPath(lang: Lang, path = "/"): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const pathWithTrailingSlash = normalizedPath.endsWith("/")
    ? normalizedPath
    : `${normalizedPath}/`;

  if (!showDefaultLang && lang === defaultLang) {
    return pathWithTrailingSlash;
  }

  return `/${lang}${pathWithTrailingSlash}`;
}

export function useTranslations(lang: Lang) {
  return function t(key: TranslationKey): string {
    return ui[lang][key] || ui[defaultLang][key];
  };
}
