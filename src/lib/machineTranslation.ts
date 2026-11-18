import {
  MACHINE_UI_KEYS,
  isMachineLang,
  type MachineLang,
  type TranslationPayload,
} from "../i18n/machine";

/** Dispatched on `document` after translated content is in the page. */
export const TRANSLATED_EVENT = "portfolio:translated";

export type TranslationResult = "translated" | "failed" | "aborted";

let controller: AbortController | undefined;

const ALLOWED_TAGS = new Set([
  "P",
  "H2",
  "H3",
  "H4",
  "UL",
  "OL",
  "LI",
  "STRONG",
  "EM",
  "A",
  "CODE",
  "BLOCKQUOTE",
  "HR",
  "BR",
  "TABLE",
  "THEAD",
  "TBODY",
  "TR",
  "TH",
  "TD",
]);
const RTL_LANGS = new Set<MachineLang>(["ar", "he"]);
const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

function sanitize(html: string): DocumentFragment {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const fragment = document.createDocumentFragment();

  const copy = (from: Node, to: Node) => {
    for (const child of Array.from(from.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        to.appendChild(document.createTextNode(child.textContent ?? ""));
        continue;
      }
      if (!(child instanceof Element)) continue;

      if (!ALLOWED_TAGS.has(child.tagName)) {
        copy(child, to);
        continue;
      }

      const element = document.createElement(child.tagName.toLowerCase());
      if (child.tagName === "A") {
        const href = child.getAttribute("href");
        try {
          const target = href ? new URL(href, location.href) : null;
          if (target && SAFE_LINK_PROTOCOLS.has(target.protocol)) {
            element.setAttribute("href", target.href);
          }
        } catch {}
      }
      if (child.tagName === "CODE") element.setAttribute("translate", "no");
      copy(child, element);
      to.appendChild(element);
    }
  };

  copy(parsed.body, fragment);
  return fragment;
}

function isPayload(
  value: unknown,
  lang: MachineLang,
): value is TranslationPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    payload.lang === lang &&
    typeof payload.html === "string" &&
    !!payload.ui &&
    typeof payload.ui === "object"
  );
}

async function fetchTranslation(
  lang: MachineLang,
  hash: string,
  signal: AbortSignal,
): Promise<TranslationPayload> {
  const params = new URLSearchParams({ lang, v: hash });
  const response = await fetch(`/api/translate?${params}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`translate failed: ${response.status}`);
  const data: unknown = await response.json();
  if (!isPayload(data, lang)) throw new Error("translate: invalid payload");
  return data;
}

// Keeps the top-level blocks and swaps only their children, so the scroll
// animations bound to them keep working.
function applyTranslation(payload: TranslationPayload): void {
  const section = document.querySelector<HTMLElement>(".portfolio-content");
  if (section) {
    const fragment = sanitize(payload.html);
    const current = Array.from(section.children);
    const incoming = Array.from(fragment.children);
    const sameShape =
      current.length === incoming.length &&
      current.every((el, i) => el.tagName === incoming[i]?.tagName);

    if (sameShape) {
      current.forEach((el, i) => {
        el.replaceChildren(...Array.from(incoming[i]?.childNodes ?? []));
      });
    } else {
      section.replaceChildren(fragment);
    }
  }

  for (const key of MACHINE_UI_KEYS) {
    const value = payload.ui[key];
    if (typeof value !== "string") continue;
    for (const el of document.querySelectorAll<HTMLElement>(
      `[data-i18n="${key}"]`,
    )) {
      el.textContent = value;
    }
    for (const el of document.querySelectorAll<HTMLElement>(
      `[data-i18n-aria="${key}"]`,
    )) {
      el.setAttribute("aria-label", value);
    }
    for (const el of document.querySelectorAll<HTMLInputElement>(
      `[data-i18n-placeholder="${key}"]`,
    )) {
      el.placeholder = value;
    }
  }

  document.documentElement.lang = payload.lang;
  document.documentElement.dir = RTL_LANGS.has(payload.lang) ? "rtl" : "ltr";
  document.dispatchEvent(new CustomEvent(TRANSLATED_EVENT));
}

function setPageState(state: "loading" | "translated" | "failed" | "idle") {
  const section = document.querySelector<HTMLElement>(".portfolio-content");
  const notice = document.querySelector<HTMLElement>("[data-mt-notice]");
  const error = document.querySelector<HTMLElement>("[data-mt-error]");

  section?.toggleAttribute("aria-busy", state === "loading");
  if (notice) notice.hidden = state !== "translated";
  if (error) error.hidden = state !== "failed";
}

/**
 * Translates the page in place.
 */
export async function translatePage(
  lang: MachineLang,
  hash: string,
): Promise<TranslationResult> {
  controller?.abort();
  const current = new AbortController();
  controller = current;

  setPageState("loading");
  try {
    const payload = await fetchTranslation(lang, hash, current.signal);
    if (current.signal.aborted) return "aborted";
    applyTranslation(payload);
    setPageState("translated");
    return "translated";
  } catch (error) {
    if (current.signal.aborted) return "aborted";
    console.error(error);
    history.replaceState(history.state, "", location.pathname);
    setPageState("failed");
    return "failed";
  }
}

document.addEventListener("astro:before-swap", () => controller?.abort());

export function getRequestedMachineLang(): MachineLang | null {
  const lang = new URLSearchParams(location.search).get("lang")?.toLowerCase();
  return isMachineLang(lang) ? lang : null;
}
