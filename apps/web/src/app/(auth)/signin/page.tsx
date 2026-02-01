import { redirect } from "next/navigation";

/**
 * Generic /signin redirects to writer sign-in.
 * Writer landing and nav use /writer/signin; reader use /reader/signin.
 */
export default function SignInRedirect() {
  redirect("/writer/signin");
}
