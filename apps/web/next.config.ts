import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@steward/core"],
  // The site is the docs: the memo, narrative, and pages rendered from the Markdown,
  // copied into public/docs by scripts/copy-docs.mjs. The app itself is the MCP
  // endpoint and the /approve fallback page.
  async redirects() {
    return [
      { source: "/", destination: "/docs/index.html", permanent: false },
      { source: "/docs", destination: "/docs/index.html", permanent: false },
      { source: "/narrative", destination: "/docs/narrative.html", permanent: false },
      { source: "/plan", destination: "/docs/plan.html", permanent: false },
      { source: "/PLAN.md", destination: "/docs/plan.html", permanent: false },
    ];
  },
};

export default nextConfig;
