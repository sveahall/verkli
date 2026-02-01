import { redirect } from "next/navigation";

/**
 * Generic /signin redirects to author sign-in.
 * author landing and nav use /author/signin; reader use /reader/signin.
 */
export default function SignInRedirect() {
  redirect("/author/signin");
}
