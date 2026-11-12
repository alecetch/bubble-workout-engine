export function getBrand(env = process.env) {
  return Object.freeze({
    variant: "forma",
    name: "Forma",
    titleSuffix: "Forma",
    tagline: "Measure. Understand. Improve.",
    siteUrl: (env.BASE_URL ?? "https://getforma.fit").replace(/\/+$/, ""),
    domain: "getforma.fit",
    supportEmail: env.SUPPORT_EMAIL ?? "support@getforma.fit",
    pressEmail: env.PRESS_EMAIL ?? env.SUPPORT_EMAIL ?? "hello@getforma.fit",
    logo: Object.freeze({
      header: "/images/forma_masthead.png",
      headerAlt: "Forma - Measure. Understand. Improve.",
      favicon: "/images/forma_icon.png",
      ogImage: "/images/forma_masthead.png",
    }),
    operator: "Engle Consulting Limited",
  });
}
