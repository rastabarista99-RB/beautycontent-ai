import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-page">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Link href="/" className="flex items-center gap-2 font-semibold"><Sparkles className="text-primary" size={20} />BeautyContent AI</Link>
        <Link href="/login" className="text-sm font-medium text-muted hover:text-primary">Sign in</Link>
      </header>
      <section className="mx-auto max-w-4xl px-5 pb-24 pt-20 text-center sm:pt-32">
        <span className="inline-flex rounded-full bg-accent-light px-3 py-1 text-sm font-medium text-primary-dark">AI marketing assistant for beauty businesses</span>
        <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight text-ink sm:text-6xl">Create content your salon is proud to share.</h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-muted">Build a consistent marketing presence with content shaped around your business, services and goals.</p>
        <Link href="/register" className="mt-8 inline-flex"><Button size="lg">Get started <ArrowRight size={18} /></Button></Link>
      </section>
    </main>
  );
}
