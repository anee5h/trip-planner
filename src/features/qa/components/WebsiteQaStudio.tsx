import { useEffect, useMemo, useState } from "react";
import {
  Copy,
  Download,
  ExternalLink,
  Link2,
  RefreshCw,
  Search,
} from "lucide-react";
import type { Destination } from "@/shared/types/destination";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { toast } from "sonner";

type WebsiteQaStatus =
  "MISSING" | "OK" | "BROKEN" | "WRONG_DESTINATION" | "NEEDS_REVIEW";

interface WebsiteQaOverride {
  qaStatus: WebsiteQaStatus;
  officialWebsite?: string;
  notes?: string;
}

const STORAGE_KEY = "tabimap-qa-website-overrides";
const STATUSES: WebsiteQaStatus[] = [
  "OK",
  "MISSING",
  "BROKEN",
  "WRONG_DESTINATION",
  "NEEDS_REVIEW",
];

function getStatus(
  destination: Destination,
  override?: WebsiteQaOverride,
): WebsiteQaStatus {
  return override?.qaStatus || (destination.officialWebsite ? "OK" : "MISSING");
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

export default function WebsiteQaStudio({
  destinations,
}: {
  destinations: Destination[];
}) {
  const websiteDestinations = useMemo(
    () =>
      destinations.filter(
        (destination) => destination.placeType === "destination",
      ),
    [destinations],
  );
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<WebsiteQaStatus | "ALL">("MISSING");
  const [sort, setSort] = useState<"name" | "prefecture">("name");
  const [overrides, setOverrides] = useState<Record<string, WebsiteQaOverride>>(
    () => {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      } catch {
        return {};
      }
    },
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  }, [overrides]);

  const filteredDestinations = useMemo(() => {
    return websiteDestinations
      .filter((destination) => {
        const status = getStatus(destination, overrides[destination.id]);
        if (filter !== "ALL" && status !== filter) return false;
        if (!search.trim()) return true;
        const query = search.toLowerCase();
        return [destination.name, destination.id, destination.prefecture].some(
          (value) => value.toLowerCase().includes(query),
        );
      })
      .sort((a, b) =>
        sort === "name"
          ? a.name.localeCompare(b.name)
          : a.prefecture.localeCompare(b.prefecture) ||
            a.name.localeCompare(b.name),
      );
  }, [websiteDestinations, overrides, filter, search, sort]);

  const count = (status: WebsiteQaStatus) =>
    websiteDestinations.filter(
      (destination) =>
        getStatus(destination, overrides[destination.id]) === status,
    ).length;

  const update = (id: string, patch: Partial<WebsiteQaOverride>) => {
    setOverrides((current) => ({
      ...current,
      [id]: {
        ...current[id],
        qaStatus: current[id]?.qaStatus || "MISSING",
        ...patch,
      },
    }));
  };

  const updateUrl = (id: string, officialWebsite: string) =>
    update(id, {
      officialWebsite,
      qaStatus: officialWebsite.trim() ? "NEEDS_REVIEW" : "MISSING",
    });

  const exportCsv = () => {
    const rows = [
      [
        "Destination ID",
        "Name",
        "Prefecture",
        "QA Status",
        "Official Website URL",
        "Notes",
      ],
      ...websiteDestinations.map((destination) => {
        const override = overrides[destination.id];
        return [
          destination.id,
          destination.name,
          destination.prefecture,
          getStatus(destination, override),
          override?.officialWebsite || destination.officialWebsite || "",
          override?.notes || "",
        ];
      }),
    ];
    const link = document.createElement("a");
    link.href = encodeURI(
      "data:text/csv;charset=utf-8," +
        rows.map((row) => row.map(csvCell).join(",")).join("\n"),
    );
    link.download = `tabimap_official_website_qa_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Exported official website QA CSV.");
  };

  const reset = () => {
    if (!window.confirm("Reset all official website QA overrides?")) return;
    setOverrides({});
    localStorage.removeItem(STORAGE_KEY);
    toast.info("Cleared official website QA overrides.");
  };

  return (
    <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6 shadow-sm">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-extrabold tracking-tight flex items-center gap-2">
            <Link2 className="w-5 h-5 text-emerald-500" />
            Official Website QA ({websiteDestinations.length} destinations)
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Paste a verified operator, government, or tourism-board URL. Open it
            before marking OK.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={exportCsv}
            size="sm"
            className="rounded-xl font-bold bg-emerald-700 hover:bg-emerald-800 text-white text-xs"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" /> Export CSV
          </Button>
          <Button
            onClick={() =>
              navigator.clipboard.writeText(JSON.stringify(overrides, null, 2))
            }
            size="sm"
            variant="outline"
            className="rounded-xl font-bold text-xs"
          >
            <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy JSON
          </Button>
          {Object.keys(overrides).length > 0 && (
            <Button
              onClick={reset}
              size="sm"
              variant="ghost"
              className="rounded-xl font-semibold text-rose-500 text-xs"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Reset
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search destination, ID, or prefecture..."
            className="pl-10 rounded-2xl bg-slate-50 dark:bg-slate-800/50"
          />
        </div>
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as typeof sort)}
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold"
          aria-label="Sort official website QA destinations"
        >
          <option value="name">Sort by name</option>
          <option value="prefecture">Sort by prefecture</option>
        </select>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-slate-100 dark:border-slate-800 pt-4">
        {[...STATUSES, "ALL" as const].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold ${filter === status ? "bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-950" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}
          >
            {status.replace("_", " ")} (
            {status === "ALL" ? websiteDestinations.length : count(status)})
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filteredDestinations.map((destination) => {
          const override = overrides[destination.id];
          const status = getStatus(destination, override);
          const website =
            override?.officialWebsite || destination.officialWebsite || "";
          return (
            <div
              key={destination.id}
              className="grid grid-cols-1 xl:grid-cols-[1.2fr_1fr_1.6fr] gap-3 items-start p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30"
            >
              <div className="min-w-0">
                <div className="font-extrabold text-sm truncate">
                  {destination.name}
                </div>
                <div className="text-[11px] font-mono text-slate-500 truncate">
                  {destination.id} · {destination.prefecture}
                </div>
                {website && (
                  <a
                    href={website}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 mt-2 text-xs text-emerald-700 dark:text-emerald-300 max-w-full"
                  >
                    <span className="truncate">{website}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-2 gap-1.5">
                {STATUSES.map((nextStatus) => (
                  <button
                    key={nextStatus}
                    onClick={() =>
                      update(destination.id, { qaStatus: nextStatus })
                    }
                    className={`px-2 py-1.5 rounded-lg text-[10px] font-extrabold border ${status === nextStatus ? "bg-emerald-700 text-white border-emerald-700" : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"}`}
                  >
                    {nextStatus.replace("_", " ")}
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                <Input
                  value={override?.officialWebsite || ""}
                  onChange={(event) =>
                    updateUrl(destination.id, event.target.value)
                  }
                  placeholder="Paste official website URL..."
                  className="text-xs h-9 rounded-xl bg-white dark:bg-slate-900"
                  aria-label={`Official website for ${destination.name}`}
                />
                <Input
                  value={override?.notes || ""}
                  onChange={(event) =>
                    update(destination.id, { notes: event.target.value })
                  }
                  placeholder="Optional QA note"
                  className="text-xs h-9 rounded-xl bg-white dark:bg-slate-900"
                  aria-label={`QA note for ${destination.name}`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
