"use server";
import { redirect } from "next/navigation";
import { revokeCurrentSession } from "../src/server/auth.js";

export async function logoutAction(): Promise<void> {
  await revokeCurrentSession();
  redirect("/login");
}
