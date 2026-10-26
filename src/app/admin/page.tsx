import { AdminOverview } from "@/components/admin";
import { requirePageUser } from "@/server/page-auth";
export default async function Page() {
  await requirePageUser(true);
  return <AdminOverview />;
}
