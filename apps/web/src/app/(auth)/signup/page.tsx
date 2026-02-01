import { redirect } from "next/navigation";

/**
 * Generic /signup redirects to writer sign-up.
 * Writer landing and nav use /writer/signup; reader use /reader/signup.
 */
export default function SignUpRedirect() {
  redirect("/writer/signup");
}
