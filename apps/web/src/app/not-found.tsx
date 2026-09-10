import Image from "next/image";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <Image src="/favi.svg" alt="Verkli" width={60} height={54} className="mb-8" />
      <p className="text-sm text-muted-foreground">404 · Page not found</p>
      <h1 className="mt-4 font-display text-4xl font-normal tracking-tight text-foreground sm:text-5xl">A page turned elsewhere.</h1>
      <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-muted-foreground">This link may have moved. Let’s get you back to your next chapter.</p>
      <Link href="/" className="btn-primary mt-8">Back to Verkli</Link>
    </main>
  );
}
