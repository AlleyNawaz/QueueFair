import { ManageServices } from "@/components/admin";
import { requirePageUser } from "@/server/page-auth";
export default async function Page({
  params,
}: {
  params: Promise<{ serviceId: string }>;
}) {
  await requirePageUser(true);
  const { serviceId } = await params;
  return <ManageServices serviceId={serviceId} />;
}
