import { OfficeDetailView } from "@/components/office-meetings";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <OfficeDetailView slug={slug} />;
}
