import { getEntry } from "astro:content";
import {
  MACHINE_UI_KEYS,
  TRANSLATION_FORMAT,
  type MachineUiKey,
  type TranslationSource,
} from "./machine";
import { defaultLang, ui } from "./ui";

let cached: Promise<TranslationSource> | undefined;

async function build(): Promise<TranslationSource> {
  const entry = await getEntry("portfolio", defaultLang);
  const rendered = entry?.rendered?.html;
  if (!rendered) {
    throw new Error(`Missing rendered portfolio content for "${defaultLang}"`);
  }

  const html = rendered.replaceAll("<code>", '<code translate="no">');

  const uiStrings = Object.fromEntries(
    MACHINE_UI_KEYS.map((key) => [key, ui[defaultLang][key]]),
  ) as Record<MachineUiKey, string>;

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      JSON.stringify({ format: TRANSLATION_FORMAT, html, ui: uiStrings }),
    ),
  );
  const hash = Array.from(new Uint8Array(digest).slice(0, 8), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

  return { hash, html, ui: uiStrings };
}

export function getTranslationSource(): Promise<TranslationSource> {
  cached ??= build();
  return cached;
}
