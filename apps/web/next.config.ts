import type { NextConfig } from "next";
const nextConfig: NextConfig = { transpilePackages: ["@agent-hub/contracts", "@agent-hub/catalog"] };
export default nextConfig;
