import { redirect } from "next/navigation";

/**
 * Generic /signup redirects to author sign-up.
 * author landing and nav use /author/signup; reader use /reader/signup.
 */
export default function SignUpRedirect() {
  redirect("/author/signup");
}
