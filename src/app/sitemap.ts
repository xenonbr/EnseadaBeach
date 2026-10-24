import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://enseadabeach.com.br";
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/cardapio`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/privacidade`, changeFrequency: "monthly", priority: 0.3 },
  ];
}
