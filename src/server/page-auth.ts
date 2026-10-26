import { redirect } from "next/navigation";
import { requireUser } from "./auth";
import { AppError } from "./errors";
export async function requirePageUser(admin = false) {
  try {
    return await requireUser(admin);
  } catch (e) {
    if (e instanceof AppError)
      redirect(e.status === 403 ? "/unauthorized" : "/login");
    throw e;
  }
}
