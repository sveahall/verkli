import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@verkli/ui", "@verkli/shared"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
