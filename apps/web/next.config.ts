import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@steward/core"],
  // /docs is the static memo + explainer, copied into public/docs by scripts/copy-docs.mjs.
  async redirects() {
    return [{ source: "/docs", destination: "/docs/index.html", permanent: false }];
  },
};

export default nextConfig;
