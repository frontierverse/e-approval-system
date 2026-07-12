import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://bajaul.com/login",
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
