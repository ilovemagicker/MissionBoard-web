import { redirect } from "next/navigation";

/** Task-calendar lives under missions IA; keep /app/calendar as canonical page. */
export default function MissionsCalendarPage() {
  redirect("/app/calendar");
}
