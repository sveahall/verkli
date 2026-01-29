"use server";

import { updateActiveRole, type ActiveRole } from "@/features/auth/roles";

export async function setActiveRole(role: ActiveRole) {
  await updateActiveRole(role);
}
