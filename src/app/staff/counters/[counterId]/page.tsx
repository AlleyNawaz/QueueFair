import { Staff } from "@/components/staff";
import { requirePageUser } from "@/server/page-auth";
export default async function Page({
  params,
}: {
  params: Promise<{ counterId: string }>;
}) {
  await requirePageUser(false);
  const { counterId } = await params;
  return <Staff counterId={counterId} />;
}
