import { redirect } from "next/navigation";

/**
 * Generic /signup redirects to reader sign-up.
 * Reader signup shows a form immediately with no loading state.
 * Authors use /author/signup directly from the author landing pages.
 */
export default function SignUpRedirect() {
  redirect("/reader/signup");
}
