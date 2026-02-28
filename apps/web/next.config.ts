import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
  transpilePackages: ["@verkli/ui", "@verkli/shared"],
  serverExternalPackages: ["epub", "pdf-parse"],
  async redirects() {
    return [
      { source: "/writer", destination: "/author", permanent: true },
      { source: "/writer/home", destination: "/author/home", permanent: true },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  // Allow cross-origin requests from network IP during development
  allowedDevOrigins: ["192.168.35.146"],
};

export default nextConfig;
