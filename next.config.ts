import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // typedRoutes: re-enable in Phase 3, once /wallet, /draws, /referrals and
  // /activity actually exist. Leaving it on now would only be satisfiable by
  // stubbing empty pages, which hides how much is still unbuilt.
  typedRoutes: false,
};

export default nextConfig;
