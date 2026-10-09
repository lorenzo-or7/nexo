import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // o selo "N" de desenvolvimento do Next se confundia com a interface
  devIndicators: false,
  experimental: {
    // importa só os módulos usados (menos código para compilar e baixar)
    optimizePackageImports: ["lucide-react", "recharts", "motion", "date-fns"],
    // envio de imagens dos cartões (até 2 MB cada, logo + arte)
    serverActions: { bodySizeLimit: "5mb" },
  },
  images: {
    // imagens dos cartões vêm do Supabase Storage (URLs assinadas)
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },
};

export default nextConfig;
