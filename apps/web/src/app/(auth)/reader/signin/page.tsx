import { Suspense } from "react";
import ReaderSignInForm from "./ReaderSignInForm";

export const dynamic = "force-dynamic";

function SignInFallback() {
  return <div className="min-h-screen bg-background" aria-hidden style={{ background: "var(--auth-background)" }} />;
}

export default function ReaderSignInPage() {
  return (
    <Suspense fallback={<SignInFallback />}>
      <ReaderSignInForm />
    </Suspense>
  );
}
