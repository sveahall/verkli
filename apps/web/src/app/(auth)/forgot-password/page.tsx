import { redirect } from "next/navigation";

/**
 * Generic /forgot-password redirects to author reset flow.
 * Reader uses /reader/forgot-password.
 */
export default function ForgotPasswordRedirect() {
  redirect("/author/forgot-password");
}
