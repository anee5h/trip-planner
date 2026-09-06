import { AlertTriangle } from "lucide-react";
import type { Destination } from "@/shared/types/destination";

type RestrictionKind =
  | "seasonal_closure"
  | "private_car_access"
  | "required_transfer"
  | "reservation_required";

export interface DecisionCriticalRestriction {
  kind: RestrictionKind;
  detail: string;
}

function combinedOperationalText(destination: Destination): string {
  return [
    destination.notes,
    destination.reservation,
    destination.parking,
    destination.content?.en?.notes,
    destination.content?.ja?.notes,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function reservationIsExplicitlyNotRequired(value: string): boolean {
  const reservationClauses = value
    .split(/[.!?;]/)
    .map((clause) => clause.trim())
    .filter((clause) => /(reservation|reserve|book|permit)/i.test(clause));
  if (reservationClauses.length === 0) return false;

  return reservationClauses.every((clause) =>
    /(?:\b(?:no|without)\b.*(?:reservation|reserve|book|permit).*\b(?:required|needed|necessary)\b|\b(?:reservation|reserve|book|permit).*\b(?:not required|not needed|not necessary)\b)/i.test(
      clause,
    ),
  );
}

export function getDecisionCriticalRestrictions(
  destination: Destination,
): DecisionCriticalRestriction[] {
  const text = combinedOperationalText(destination);
  const lower = text.toLowerCase();
  const restrictions: DecisionCriticalRestriction[] = [];

  if (
    /(closed|closure|inaccessible)/i.test(text) &&
    /(season|winter|snow|mid-|november|december|january|february|march|april)/i.test(
      text,
    )
  ) {
    restrictions.push({
      kind: "seasonal_closure",
      detail: destination.notes ?? text,
    });
  }

  if (
    /(private\s+cars?|private\s+vehicles?|personal\s+cars?)/i.test(text) &&
    /(ban|prohibit|not allowed|restricted|mandatory)/i.test(lower)
  ) {
    restrictions.push({
      kind: "private_car_access",
      detail: destination.reservation ?? text,
    });
  }

  if (
    /(shuttle|bus|taxi|transfer)/i.test(lower) &&
    /required|mandatory/i.test(lower)
  ) {
    restrictions.push({
      kind: "required_transfer",
      detail: /private\s+cars?\s+banned/i.test(lower)
        ? "A mandatory shuttle/bus transfer is required; private cars are banned."
        : (destination.reservation ?? text),
    });
  }

  if (
    destination.reservation &&
    /(reservation|reserve|book|permit)/i.test(destination.reservation) &&
    !reservationIsExplicitlyNotRequired(destination.reservation)
  ) {
    restrictions.push({
      kind: "reservation_required",
      detail: destination.reservation,
    });
  }

  return restrictions;
}

export function DecisionCriticalRestrictionNotice({
  destination,
  locale,
}: {
  destination: Destination;
  locale: "en" | "ja";
}) {
  const restrictions = getDecisionCriticalRestrictions(destination);
  if (restrictions.length === 0) return null;

  return (
    <aside
      aria-label={
        locale === "ja" ? "重要なアクセス情報" : "Important access information"
      }
      className="mb-3 rounded-xl border border-amber-300/60 bg-amber-50/95 px-3 py-2.5 text-amber-950 shadow-sm"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-800">
            {locale === "ja" ? "計画前に確認" : "Check before planning"}
          </p>
          <ul className="mt-1 space-y-1 text-sm">
            {restrictions.map((restriction) => (
              <li key={restriction.kind}>
                <strong>
                  {locale === "ja"
                    ? restriction.kind === "seasonal_closure"
                      ? "季節閉鎖"
                      : restriction.kind === "private_car_access"
                        ? "自家用車の制限"
                        : restriction.kind === "required_transfer"
                          ? "乗り換え必須"
                          : "予約・許可が必要"
                    : restriction.kind === "seasonal_closure"
                      ? "Seasonal closure"
                      : restriction.kind === "private_car_access"
                        ? "Private-car access"
                        : restriction.kind === "required_transfer"
                          ? "Required transfer"
                          : "Reservation/permit"}
                  : {restriction.detail}
                </strong>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
}
