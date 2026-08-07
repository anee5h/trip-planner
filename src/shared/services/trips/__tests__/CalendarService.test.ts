import { describe, it, expect } from "vitest";
import {
  generateIcsContent,
  generateGoogleCalendarUrl,
} from "../CalendarService";
import type { Trip } from "@/shared/types/trip";

const mockTrip: Trip = {
  id: "trip-1",
  userId: "user-123",
  title: "Tokyo Autumn Adventure",
  startDate: "2026-11-01",
  endDate: "2026-11-05",
  status: "planned",
  stops: [
    {
      id: "stop-1",
      type: "destination",
      destinationId: "shinjuku",
      name: "Shinjuku Gyoen",
      date: "2026-11-02",
    },
  ],
  createdAt: "2026-07-23T12:00:00Z",
  updatedAt: "2026-07-23T12:00:00Z",
};

describe("CalendarService Unit Tests", () => {
  it("generates a valid .ics VEVENT payload", () => {
    const ics = generateIcsContent(mockTrip);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("SUMMARY:Tokyo Autumn Adventure");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261101");
    expect(ics).toContain("DTEND;VALUE=DATE:20261106");
    expect(ics).toContain("DESCRIPTION:1. Shinjuku Gyoen — 2026-11-02");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("END:VCALENDAR");
  });

  it("generates a valid Google Calendar template URL with exclusive end date", () => {
    const url = generateGoogleCalendarUrl(mockTrip);
    expect(url).toContain(
      "https://calendar.google.com/calendar/render?action=TEMPLATE",
    );
    expect(url).toContain("text=Tokyo%20Autumn%20Adventure");
    expect(url).toContain("dates=20261101/20261106");
    expect(url).toContain("details=Plan%20Link");
  });
});
