import { StaffMeetingInbox } from "@/components/office-meetings";
import { StaffShell } from "@/components/staff";
import { requirePageUser } from "@/server/page-auth";

export default async function Page() {
  await requirePageUser(false);
  return (
    <StaffShell>
      <StaffMeetingInbox />
    </StaffShell>
  );
}
