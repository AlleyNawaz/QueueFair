import { TicketView } from "@/components/student";
export default async function Page({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  return <TicketView publicId={publicId} />;
}
