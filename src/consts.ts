export const SITE_URL = "https://calegari.dev.br";

export const OG_IMAGE = "/og-image.png";

export const SOCIAL_LINKS: { label: string; href: string }[] = [
  { label: "Email", href: "mailto:matheus@calegari.dev.br" },
  { label: "GitHub", href: "https://github.com/calegass" },
  { label: "LinkedIn", href: "https://linkedin.com/in/matheus-calegari" },
];

export const TECH_STACK = ["Astro", "Tailwind CSS", "Three.js", "GSAP"];

export const INSPIRATIONS: { label: string; href: string }[] = [
  {
    label: "Aaron Iker (confetti animations)",
    href: "https://codepen.io/aaroniker/pen/bGVGNrV",
  },
  { label: "GSAPify", href: "https://gsapify.com/gsap-animations" },
  {
    label: "Yuki Kojima (cursor blob)",
    href: "https://tympanus.net/codrops/2025/06/09/how-to-create-interactive-droplet-like-metaballs-with-three-js-and-glsl/",
  },
];

export const OG_LOCALE: Record<string, string> = {
  en: "en_US",
  pt: "pt_BR",
};
