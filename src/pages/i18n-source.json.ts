import type { APIRoute } from "astro";
import { getTranslationSource } from "../i18n/source";

export const GET: APIRoute = async () =>
  new Response(JSON.stringify(await getTranslationSource()), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
