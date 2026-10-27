import { MeetingRequestView } from "@/components/office-meetings";

export default async function Page({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  return <MeetingRequestView publicId={publicId} />;
}
