import { Staff } from "@/components/staff";
import { requirePageUser } from "@/server/page-auth";
export default async function Page() {
  await requirePageUser(false);
  return <Staff />;
}
