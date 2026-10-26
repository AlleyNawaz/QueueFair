import { Display } from "@/components/student";
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <Display slug={slug} />;
}
