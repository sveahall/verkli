import { Suspense } from "react";
import AuthorSignInForm from "./AuthorSignInForm";

function SignInFallback() {
  return <div className="min-h-screen min-h-dvh bg-background" aria-hidden />;
}

export default function AuthorSignInPage() {
  return (
    <Suspense fallback={<SignInFallback />}>
      <AuthorSignInForm />
    </Suspense>
  );
}
