import type { Metadata } from "next";
import { Bento } from "@/components/landing/bento";
import { Benefits } from "@/components/landing/benefits";
import { Faq } from "@/components/landing/faq";
import { FinalCta } from "@/components/landing/final-cta";
import { LandingFooter } from "@/components/landing/footer";
import { LandingHeader } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";
import { ProductDemo } from "@/components/landing/product-demo";
import { SectionHeading } from "@/components/landing/section";
import { Simulator } from "@/components/landing/simulator";
import { siteUrl } from "@/lib/landing/site";

const TITLE = "NEXO — Seu dinheiro. Tudo conectado.";
const DESCRIPTION = "Contas, cartões, faturas, parcelamentos e a projeção do seu saldo dia a dia em um só lugar. Gestão financeira pessoal com mais clareza e controle.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "NEXO",
    url: "/",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "/brand/icon-512.png", width: 512, height: 512, alt: "NEXO" }],
  },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION, images: ["/brand/icon-512.png"] },
};

export default function LandingPage() {
  return (
    <div data-landing className="relative min-h-dvh overflow-x-clip">
      <a href="#conteudo" className="sr-only z-50 rounded-lg bg-surface px-4 py-2 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Ir para o conteúdo</a>
      <LandingHeader />
      <main id="conteudo">
        <Hero />
        <Benefits />
        <Bento />
        <section id="demonstracao" aria-labelledby="titulo-demo" className="scroll-mt-20 mx-auto max-w-6xl px-5 pb-20 sm:px-8 lg:pb-28">
          <SectionHeading id="titulo-demo" eyebrow="Demonstração" title="Veja seu dinheiro além de hoje." subtitle="Descubra como entradas e saídas podem transformar seu saldo nos próximos dias." />
          <Simulator />
          <ProductDemo />
        </section>
        <Faq />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}
