import type { Trip } from "@/shared/types/trip";

export function generateIcsContent(trip: Trip): string {
  const formatIcsDate = (dateStr: string) => {
    return dateStr.replace(/-/g, "") + "T000000Z";
  };

  const getNextDay = (dateStr: string) => {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + 1);
    return date.toISOString().split("T")[0];
  };

  const start = trip.startDate
    ? formatIcsDate(trip.startDate)
    : formatIcsDate(new Date().toISOString().split("T")[0]);
  const end = trip.endDate
    ? formatIcsDate(getNextDay(trip.endDate))
    : formatIcsDate(
        getNextDay(trip.startDate || new Date().toISOString().split("T")[0]),
      );

  const description = trip.stops
    .map((s, idx) => `${idx + 1}. ${s.name}${s.date ? ` — ${s.date}` : ""}`)
    .join("\\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Meguruto//Trip Planner//EN",
    "BEGIN:VEVENT",
    `UID:${trip.id}`,
    `DTSTAMP:${formatIcsDate(new Date().toISOString().split("T")[0])}`,
    `DTSTART;VALUE=DATE:${start.split("T")[0]}`,
    `DTEND;VALUE=DATE:${end.split("T")[0]}`,
    `SUMMARY:${trip.title}`,
    `DESCRIPTION:${description}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function downloadIcsFile(trip: Trip): void {
  if (typeof window === "undefined") return;
  const content = generateIcsContent(trip);
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute(
    "download",
    `${trip.title.toLowerCase().replace(/\s+/g, "-")}.ics`,
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function generateGoogleCalendarUrl(trip: Trip): string {
  const formatUrlDate = (dateStr: string) => {
    return dateStr.replace(/-/g, "");
  };

  const getNextDay = (dateStr: string) => {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + 1);
    return date.toISOString().split("T")[0];
  };

  const startDate = trip.startDate || new Date().toISOString().split("T")[0];
  const endDate = trip.endDate
    ? getNextDay(trip.endDate)
    : getNextDay(startDate);

  const dates = `${formatUrlDate(startDate)}/${formatUrlDate(endDate)}`;
  const text = encodeURIComponent(trip.title);

  // Build deep link back to this specific trip
  const tripLink = `${window.location.origin}/my-trips?tripId=${trip.id}`;

  const stopsSummary = trip.stops
    .map((s, idx) => `${idx + 1}. ${s.name}${s.date ? ` — ${s.date}` : ""}`)
    .join("\n");

  const body = `Plan Link: ${tripLink}\n\nItinerary Overview:\n${stopsSummary}`;
  const details = encodeURIComponent(body);

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}&details=${details}`;
}

export function openGoogleCalendar(trip: Trip): void {
  if (typeof window === "undefined") return;
  const url = generateGoogleCalendarUrl(trip);
  window.open(url, "_blank", "noopener,noreferrer");
}
