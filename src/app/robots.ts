import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/login", "/admin", "/api", "/account", "/documents", "/drafts", "/inbox", "/sent", "/completed", "/notifications", "/resources", "/work-schedule", "/youth", "/question-bank"],
    },
    sitemap: "https://bajaul.com/sitemap.xml",
  };
}
