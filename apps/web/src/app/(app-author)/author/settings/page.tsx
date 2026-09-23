import { redirect } from "next/navigation";

/** `/author/settings` has no content of its own; Account is the first section. */
export default function AuthorSettingsIndex() {
  redirect("/author/settings/account");
}
