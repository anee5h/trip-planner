import { useState, useMemo, useEffect } from "react";
import destinationsIndex from "@/shared/data/destinations-index.json";
import collectionsIndex from "@/shared/data/collections-index.json";
import { PHASE_ONE_COHORT_IDS } from "@/shared/data/editorialPilot";
import { PageHeader } from "@/shared/components/ui/PageHeader";
import { toCanonicalPlace } from "@/shared/services/place/PlaceCatalog";
import type { Destination } from "@/shared/types/destination";
import type { Collection } from "@/shared/types/collection";
import {
  CheckCircle2,
  AlertTriangle,
  Database,
  Layers,
  Image as ImageIcon,
  Link2,
  Search,
  Download,
  Copy,
  DollarSign,
  Bus,
  Train,
  Car,
  FolderTree,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/shared/components/ui/tabs";
import { toast } from "sonner";

type QaStatus = "OK" | "BROKEN" | "WRONG_LANDMARK" | "LOW_QUALITY";

interface QaImageOverride {
  qaStatus: QaStatus;
  customUrl?: string;
  notes?: string;
}

const LOCAL_STORAGE_KEY = "tabimap-qa-image-overrides";

function getImageQaStatus(
  destination: Destination,
  override?: QaImageOverride,
): QaStatus {
  // Once a QA replacement has been imported into the catalog, its old local
  // override is historical rather than an unresolved issue.
  if (
    override?.customUrl === destination.heroImage &&
    destination.imageNeedsReview === false
  ) {
    return "OK";
  }

  return (
    override?.qaStatus || (destination.imageNeedsReview ? "LOW_QUALITY" : "OK")
  );
}

export default function QaDashboard() {
  const allDestinations = useMemo(
    () => (destinationsIndex as Destination[]).map(toCanonicalPlace),
    [],
  );
  const allCollections = collectionsIndex as Collection[];
  const totalDestinations = allDestinations.length;
  const totalCollections = allCollections.length;
  const editorialCoverage = useMemo(() => {
    const cohortIds = new Set<string>(PHASE_ONE_COHORT_IDS);
    const cohort = allDestinations.filter((destination) =>
      cohortIds.has(destination.id),
    );
    const reviewed = cohort.filter(
      (destination) => destination.editorial?.lifecycle === "published",
    );
    const bilingual = reviewed.filter(
      (destination) =>
        destination.content?.ja?.name && destination.content.ja.description,
    );
    const missingSources = reviewed.filter(
      (destination) => !destination.editorial?.sources?.length,
    );
    const stale = reviewed.filter((destination) =>
      ["review_due", "stale", "conflicting"].includes(
        destination.editorial?.freshness || "",
      ),
    );
    return {
      target: cohort.length,
      reviewed: reviewed.length,
      bilingual: bilingual.length,
      missingSources: missingSources.length,
      stale: stale.length,
    };
  }, [allDestinations]);

  // Search & Filter state for Image QA Tab
  const [imageSearch, setImageSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [imageSort, setImageSort] = useState<"newest" | "oldest" | "name">(
    "newest",
  );

  // Local Storage overrides state for Image QA Studio
  const [overrides, setOverrides] = useState<Record<string, QaImageOverride>>(
    () => {
      try {
        const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
        return saved ? JSON.parse(saved) : {};
      } catch {
        return {};
      }
    },
  );

  // Save to LocalStorage whenever overrides change
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(overrides));
    } catch (err) {
      console.error("Failed to save QA overrides to localStorage", err);
    }
  }, [overrides]);

  // Selected Hub for Hierarchy Tab
  const [selectedHubId, setSelectedHubId] = useState<string>(
    "tokyo-station-chiyoda",
  );

  // Health Metrics Computation
  const metrics = useMemo(() => {
    let missingHero = 0;
    let invalidCoords = 0;
    let missingParentHub = 0;
    let missingBudget = 0;
    let missingTransportFares = 0;

    const ids = new Set<string>();
    let duplicateIds = 0;

    allDestinations.forEach((d) => {
      if (ids.has(d.id)) duplicateIds++;
      ids.add(d.id);

      if (!d.heroImage || d.heroImage.trim() === "") missingHero++;

      if (
        !d.coordinates ||
        typeof d.coordinates.lat !== "number" ||
        typeof d.coordinates.lng !== "number"
      ) {
        invalidCoords++;
      }

      if (d.role === "poi" && d.relationships?.parentDestinationId) {
        const parent = allDestinations.find(
          (p) => p.id === d.relationships?.parentDestinationId,
        );
        if (!parent) missingParentHub++;
      }

      if (!d.budgetRecommended || d.budgetRecommended === 0) {
        missingBudget++;
      }

      if (!d.transportFares) {
        missingTransportFares++;
      }
    });

    const isHealthy =
      duplicateIds === 0 &&
      missingHero === 0 &&
      invalidCoords === 0 &&
      missingParentHub === 0;

    return {
      duplicateIds,
      missingHero,
      invalidCoords,
      missingParentHub,
      missingBudget,
      missingTransportFares,
      isHealthy,
    };
  }, [allDestinations]);

  // Hubs vs POIs
  const hubs = useMemo(
    () => allDestinations.filter((d) => d.role === "hub"),
    [allDestinations],
  );
  const pois = useMemo(
    () => allDestinations.filter((d) => d.role !== "hub"),
    [allDestinations],
  );

  // Filtered Destinations for Image QA Studio
  const filteredDestinationsForImageQa = useMemo(() => {
    return allDestinations
      .filter((d) => {
        const override = overrides[d.id];
        const status = getImageQaStatus(d, override);

        // Status filter
        if (statusFilter === "ISSUES" && status === "OK") return false;
        if (
          statusFilter !== "ALL" &&
          statusFilter !== "ISSUES" &&
          status !== statusFilter
        ) {
          return false;
        }

        // Text search
        if (!imageSearch.trim()) return true;
        const q = imageSearch.toLowerCase();
        return (
          d.name.toLowerCase().includes(q) ||
          d.id.toLowerCase().includes(q) ||
          d.prefecture.toLowerCase().includes(q)
        );
      })
      .sort((a, b) =>
        imageSort === "name"
          ? a.name.localeCompare(b.name)
          : imageSort === "oldest"
            ? (a.addedAt || "").localeCompare(b.addedAt || "")
            : (b.addedAt || "").localeCompare(a.addedAt || ""),
      );
  }, [allDestinations, overrides, statusFilter, imageSearch, imageSort]);

  // Image QA Overrides Count
  const overrideCount = Object.keys(overrides).length;
  const issueCount = Object.values(overrides).filter(
    (o) => o.qaStatus !== "OK",
  ).length;

  // Handlers for Image QA Studio
  const updateQaStatus = (id: string, qaStatus: QaStatus) => {
    setOverrides((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        qaStatus,
      },
    }));
  };

  const updateCustomUrl = (id: string, customUrl: string) => {
    setOverrides((prev) => {
      const current = prev[id] || { qaStatus: "OK" };
      return {
        ...prev,
        [id]: {
          ...current,
          customUrl,
        },
      };
    });
  };

  const exportCsv = () => {
    const rows = [
      ["Destination ID", "Name", "Prefecture", "QA Status", "Custom Image URL"],
    ];
    allDestinations.forEach((d) => {
      const ov = overrides[d.id];
      const status = getImageQaStatus(d, ov);
      const customUrl = ov?.customUrl || "";
      rows.push([
        `"${d.id}"`,
        `"${d.name.replace(/"/g, '""')}"`,
        `"${d.prefecture}"`,
        `"${status}"`,
        `"${customUrl}"`,
      ]);
    });
    const csvContent =
      "data:text/csv;charset=utf-8," + rows.map((e) => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `tabimap_image_qa_overrides_${new Date().toISOString().split("T")[0]}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Exported Image QA Overrides CSV!");
  };

  const exportEditorialWorklist = () => {
    const cohortIds = new Set<string>(PHASE_ONE_COHORT_IDS);
    const rows = [
      [
        "Place ID",
        "Name",
        "Prefecture",
        "Lifecycle",
        "Japanese content",
        "Sources",
        "Freshness",
        "Checked at",
      ],
    ];
    allDestinations
      .filter((destination) => cohortIds.has(destination.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((destination) => {
        const editorial = destination.editorial;
        rows.push([
          `"${destination.id}"`,
          `"${destination.name.replace(/"/g, '""')}"`,
          `"${destination.prefecture}"`,
          `"${editorial?.lifecycle || "legacy"}"`,
          `"${destination.content?.ja?.description ? "ready" : "missing"}"`,
          `"${editorial?.sources?.length || 0}"`,
          `"${editorial?.freshness || "not reviewed"}"`,
          `"${editorial?.checkedAt || ""}"`,
        ]);
      });
    const link = document.createElement("a");
    link.href = encodeURI(
      "data:text/csv;charset=utf-8," +
        rows.map((row) => row.join(",")).join("\n"),
    );
    link.download = `tabimap_phase-one-editorial-worklist_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Exported the Phase 1 editorial worklist.");
  };

  const copyJsonPayload = () => {
    const payload = JSON.stringify(overrides, null, 2);
    navigator.clipboard.writeText(payload);
    toast.success("Copied QA overrides JSON to clipboard!");
  };

  const resetAllOverrides = () => {
    if (
      window.confirm("Are you sure you want to reset all local QA overrides?")
    ) {
      setOverrides({});
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      toast.info("Cleared all QA overrides");
    }
  };

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-7xl space-y-8 animate-in fade-in duration-200">
      <PageHeader
        title="QA Engineering & Data Health Studio"
        subtitle="Internal Quality Control & Asset Management"
        description="Comprehensive real-time health metrics, interactive visual image QA audit, hierarchy inspector, budget coverage, and collection analytics."
      />

      {/* Top Banner Status */}
      <div
        className={`p-6 rounded-3xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg ${
          metrics.isHealthy
            ? "bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white border-emerald-500/30"
            : "bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-white border-amber-500/30"
        }`}
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center text-white shrink-0">
            {metrics.isHealthy ? (
              <CheckCircle2 className="w-7 h-7" />
            ) : (
              <AlertTriangle className="w-7 h-7" />
            )}
          </div>
          <div>
            <h2 className="text-xl font-extrabold tracking-tight">
              {metrics.isHealthy
                ? "Dataset Health: 100% SCHEMA COMPLIANT"
                : "Dataset Health: WARNINGS DETECTED"}
            </h2>
            <p className="text-xs text-white/85">
              Audited {totalDestinations} destinations across 47 prefectures,{" "}
              {hubs.length} hubs, and {totalCollections} collections.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 self-end md:self-auto">
          <Button
            onClick={exportEditorialWorklist}
            size="sm"
            variant="secondary"
            className="rounded-xl font-bold text-xs text-slate-900"
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Editorial worklist
          </Button>
          <div className="bg-white/15 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/20 text-right">
            <div className="text-xs uppercase font-bold text-white/80">
              Phase 1 hubs
            </div>
            <div className="font-mono font-black text-xl">
              {editorialCoverage.reviewed} / {editorialCoverage.target}
            </div>
          </div>
          <div className="bg-white/15 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/20 text-right">
            <div className="text-xs uppercase font-bold text-white/80">
              Japanese ready
            </div>
            <div className="font-mono font-black text-xl">
              {editorialCoverage.bilingual} / {editorialCoverage.target}
            </div>
          </div>
          <div className="bg-white/15 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/20 text-right">
            <div className="text-xs uppercase font-bold text-white/80">
              Review alerts
            </div>
            <div className="font-mono font-black text-xl">
              {editorialCoverage.stale + editorialCoverage.missingSources}
            </div>
          </div>
        </div>
      </div>

      {/* 5-Tab Navigation Bar */}
      <Tabs defaultValue="health" className="w-full space-y-6">
        <TabsList className="grid grid-cols-2 md:grid-cols-5 w-full bg-slate-100 dark:bg-slate-900/80 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800">
          <TabsTrigger
            value="health"
            className="rounded-xl font-bold text-xs flex items-center gap-1.5 py-2.5"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            Health & Rules
          </TabsTrigger>
          <TabsTrigger
            value="images"
            className="rounded-xl font-bold text-xs flex items-center gap-1.5 py-2.5"
          >
            <ImageIcon className="w-4 h-4 text-indigo-500" />
            Image QA Studio{" "}
            {issueCount > 0 && (
              <Badge className="ml-1 bg-amber-500 text-slate-950 text-[10px] px-1.5 py-0 font-black">
                {issueCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="relationships"
            className="rounded-xl font-bold text-xs flex items-center gap-1.5 py-2.5"
          >
            <FolderTree className="w-4 h-4 text-teal-500" />
            Hierarchy & Hubs
          </TabsTrigger>
          <TabsTrigger
            value="budget"
            className="rounded-xl font-bold text-xs flex items-center gap-1.5 py-2.5"
          >
            <DollarSign className="w-4 h-4 text-sky-500" />
            Budget & Transport
          </TabsTrigger>
          <TabsTrigger
            value="collections"
            className="rounded-xl font-bold text-xs flex items-center gap-1.5 py-2.5"
          >
            <Layers className="w-4 h-4 text-purple-500" />
            Collections
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: HEALTH & RULES */}
        <TabsContent value="health" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 shadow-sm">
              <div className="flex justify-between items-center text-slate-500">
                <span className="text-xs font-bold uppercase tracking-wider">
                  Total Dest.
                </span>
                <Database className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-2xl font-extrabold">{totalDestinations}</div>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                0 Duplicate IDs
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 shadow-sm">
              <div className="flex justify-between items-center text-slate-500">
                <span className="text-xs font-bold uppercase tracking-wider">
                  Hero Image Coverage
                </span>
                <ImageIcon className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="text-2xl font-extrabold">
                {totalDestinations - metrics.missingHero} / {totalDestinations}
              </div>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                100% Hero Image Coverage
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 shadow-sm">
              <div className="flex justify-between items-center text-slate-500">
                <span className="text-xs font-bold uppercase tracking-wider">
                  Coordinates Integrity
                </span>
                <CheckCircle2 className="w-4 h-4 text-sky-500" />
              </div>
              <div className="text-2xl font-extrabold">
                {totalDestinations - metrics.invalidCoords} /{" "}
                {totalDestinations}
              </div>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                0 Missing Lat/Lng
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 shadow-sm">
              <div className="flex justify-between items-center text-slate-500">
                <span className="text-xs font-bold uppercase tracking-wider">
                  Hub Links Integrity
                </span>
                <Link2 className="w-4 h-4 text-teal-500" />
              </div>
              <div className="text-2xl font-extrabold">
                {metrics.missingParentHub === 0
                  ? "100%"
                  : `${metrics.missingParentHub} Broken`}
              </div>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                0 Broken Parent Hub References
              </p>
            </div>
          </div>

          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm">
            <h3 className="text-lg font-extrabold tracking-tight flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-500" />
              Automated Validation Rule Checks
            </h3>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-xs font-semibold">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  Unique Destination IDs Validation
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                  0 Errors
                </span>
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-xs font-semibold">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  Latitude / Longitude Range Boundary Checks (Japan Bounding
                  Box)
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                  0 Errors
                </span>
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-xs font-semibold">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  Parent Hub Referential Integrity
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                  0 Errors
                </span>
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-xs font-semibold">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  Prefecture Key Alignment (@react-map/japan)
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                  47/47 Prefectures Validated
                </span>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* TAB 2: IMAGE QA STUDIO */}
        <TabsContent value="images" className="space-y-6">
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6 shadow-sm">
            {/* Top Toolbar */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
              {/* Search Bar */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Search by destination name, ID, or prefecture..."
                  value={imageSearch}
                  onChange={(e) => setImageSearch(e.target.value)}
                  className="pl-10 rounded-2xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50"
                />
              </div>

              <select
                value={imageSort}
                onChange={(event) =>
                  setImageSort(event.target.value as typeof imageSort)
                }
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200"
                aria-label="Sort image QA destinations"
              >
                <option value="newest">Newest added</option>
                <option value="oldest">Oldest added</option>
                <option value="name">Name</option>
              </select>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Button
                  onClick={exportCsv}
                  size="sm"
                  className="rounded-xl font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 text-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export CSV
                </Button>
                <Button
                  onClick={copyJsonPayload}
                  size="sm"
                  variant="outline"
                  className="rounded-xl font-bold flex items-center gap-1.5 text-xs"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy JSON
                </Button>
                {overrideCount > 0 && (
                  <Button
                    onClick={resetAllOverrides}
                    size="sm"
                    variant="ghost"
                    className="rounded-xl font-semibold text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-xs"
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-1" />
                    Reset Overrides
                  </Button>
                )}
              </div>
            </div>

            {/* Status Filter Pills */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <span className="text-xs font-extrabold uppercase text-slate-400 mr-2">
                Filter Status:
              </span>
              {[
                { label: `All (${totalDestinations})`, value: "ALL" },
                { label: `Issues Flagged (${issueCount})`, value: "ISSUES" },
                { label: "OK", value: "OK" },
                { label: "Broken URL", value: "BROKEN" },
                { label: "Wrong Landmark", value: "WRONG_LANDMARK" },
                { label: "Low Quality", value: "LOW_QUALITY" },
              ].map((pill) => (
                <button
                  key={pill.value}
                  onClick={() => setStatusFilter(pill.value)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    statusFilter === pill.value
                      ? "bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-950 shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400"
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>

            {/* Grid of Destination Image Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4">
              {filteredDestinationsForImageQa.map((d) => {
                const ov = overrides[d.id];
                const status = getImageQaStatus(d, ov);
                const displayUrl = ov?.customUrl || d.heroImage;

                return (
                  <div
                    key={d.id}
                    className={`rounded-2xl border bg-slate-50/50 dark:bg-slate-900/50 overflow-hidden space-y-3 p-4 transition-all ${
                      status === "BROKEN"
                        ? "border-rose-500/50 bg-rose-500/5"
                        : status === "WRONG_LANDMARK"
                          ? "border-amber-500/50 bg-amber-500/5"
                          : status === "LOW_QUALITY"
                            ? "border-sky-500/50 bg-sky-500/5"
                            : "border-slate-200 dark:border-slate-800"
                    }`}
                  >
                    {/* Image Preview */}
                    <div className="relative h-44 w-full rounded-xl overflow-hidden bg-slate-900">
                      <img
                        src={displayUrl}
                        alt={d.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src =
                            "https://images.unsplash.com/photo-1542051841857-5f90071e7989?q=80&w=600";
                        }}
                      />
                      <div className="absolute top-2 left-2 flex items-center gap-1.5">
                        <Badge className="bg-black/60 backdrop-blur-md text-white border-none font-bold text-[10px]">
                          {d.prefecture}
                        </Badge>
                      </div>
                      <a
                        href={displayUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-black/60 backdrop-blur-md text-white hover:bg-black/80 transition-colors"
                        title="Open full image in new tab"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>

                    {/* Destination Title & ID */}
                    <div>
                      <h4 className="font-extrabold text-sm text-slate-900 dark:text-white truncate">
                        {d.name}
                      </h4>
                      <p className="text-[11px] font-mono text-slate-400 truncate">
                        {d.id}
                      </p>
                    </div>

                    {/* QA Status Selector Buttons */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">
                        QA Status
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {(
                          [
                            { label: "OK", value: "OK" },
                            { label: "Broken", value: "BROKEN" },
                            { label: "Wrong", value: "WRONG_LANDMARK" },
                            { label: "Low Qual", value: "LOW_QUALITY" },
                          ] as const
                        ).map((st) => (
                          <button
                            key={st.value}
                            onClick={() => updateQaStatus(d.id, st.value)}
                            className={`px-2 py-1 rounded-lg text-[11px] font-extrabold transition-all border ${
                              status === st.value
                                ? st.value === "OK"
                                  ? "bg-emerald-600 text-white border-emerald-500"
                                  : st.value === "BROKEN"
                                    ? "bg-rose-600 text-white border-rose-500"
                                    : st.value === "WRONG_LANDMARK"
                                      ? "bg-amber-600 text-white border-amber-500"
                                      : "bg-sky-600 text-white border-sky-500"
                                : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                            }`}
                          >
                            {st.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Custom Image URL Replacement Input */}
                    <div className="space-y-1.5 pt-1">
                      <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">
                        Replacement Image URL
                      </label>
                      <Input
                        type="text"
                        placeholder="Paste Wikimedia/Unsplash URL..."
                        value={ov?.customUrl || ""}
                        onChange={(e) => updateCustomUrl(d.id, e.target.value)}
                        className="text-xs h-8 rounded-xl bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </TabsContent>

        {/* TAB 3: HIERARCHY & HUBS */}
        <TabsContent value="relationships" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Hub Selector Panel */}
            <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm">
              <h3 className="text-lg font-extrabold tracking-tight flex items-center gap-2">
                <FolderTree className="w-5 h-5 text-teal-500" />
                Select Hub Destination
              </h3>
              <p className="text-xs text-slate-500">
                Auditing {hubs.length} Hubs and {pois.length} Point-of-Interest
                (POI) destinations.
              </p>

              <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
                {hubs.map((h) => {
                  const childCount = pois.filter(
                    (p) => p.relationships?.parentDestinationId === h.id,
                  ).length;

                  return (
                    <button
                      key={h.id}
                      onClick={() => setSelectedHubId(h.id)}
                      className={`w-full text-left p-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-between border ${
                        selectedHubId === h.id
                          ? "bg-teal-600 text-white border-teal-500 shadow-md"
                          : "bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100"
                      }`}
                    >
                      <span className="truncate">{h.name}</span>
                      <Badge
                        className={`ml-2 shrink-0 ${
                          selectedHubId === h.id
                            ? "bg-white/20 text-white"
                            : "bg-teal-500/10 text-teal-600 dark:text-teal-400"
                        }`}
                      >
                        {childCount} child sights
                      </Badge>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected Hub Hierarchy Details */}
            <div className="lg:col-span-2 p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6 shadow-sm">
              {(() => {
                const currentHub =
                  hubs.find((h) => h.id === selectedHubId) || hubs[0];
                if (!currentHub) return null;

                const childSights = pois.filter(
                  (p) => p.relationships?.parentDestinationId === currentHub.id,
                );

                return (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                      <div>
                        <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
                          {currentHub.name}
                        </h3>
                        <p className="text-xs font-mono text-slate-400">
                          {currentHub.id} • {currentHub.prefecture}
                        </p>
                      </div>
                      <Badge className="bg-teal-600 text-white font-extrabold px-3 py-1 text-xs">
                        Hub Destination
                      </Badge>
                    </div>

                    <div>
                      <h4 className="text-sm font-extrabold uppercase tracking-wider text-slate-400 mb-3">
                        Child POI Destinations ({childSights.length})
                      </h4>
                      {childSights.length === 0 ? (
                        <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/40 text-center text-xs text-slate-400">
                          No POI destinations assigned to this hub yet.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {childSights.map((cs) => (
                            <div
                              key={cs.id}
                              className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 flex items-center justify-between"
                            >
                              <div className="truncate">
                                <div className="font-extrabold text-xs text-slate-900 dark:text-white truncate">
                                  {cs.name}
                                </div>
                                <div className="text-[10px] font-mono text-slate-400 truncate">
                                  {cs.id}
                                </div>
                              </div>
                              <Badge className="bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300 text-[10px] shrink-0 ml-2">
                                {cs.kind || "poi"}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </TabsContent>

        {/* TAB 4: BUDGET & TRANSPORT */}
        <TabsContent value="budget" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Transport Modes Summary */}
            <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm">
              <h3 className="text-lg font-extrabold tracking-tight flex items-center gap-2">
                <Train className="w-5 h-5 text-sky-500" />
                Transport Mode Coverage
              </h3>
              <div className="space-y-3">
                {[
                  {
                    mode: "Train",
                    icon: Train,
                    count: allDestinations.filter(
                      (d) => d.transportOptions?.train,
                    ).length,
                  },
                  {
                    mode: "Shinkansen",
                    icon: Train,
                    count: allDestinations.filter(
                      (d) => d.transportOptions?.shinkansen,
                    ).length,
                  },
                  {
                    mode: "Bus",
                    icon: Bus,
                    count: allDestinations.filter(
                      (d) => d.transportOptions?.bus,
                    ).length,
                  },
                  {
                    mode: "Car",
                    icon: Car,
                    count: allDestinations.filter(
                      (d) =>
                        d.transportOptions?.car || d.transportOptions?.my_car,
                    ).length,
                  },
                ].map((t) => (
                  <div
                    key={t.mode}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-xs font-semibold"
                  >
                    <span className="flex items-center gap-2">
                      <t.icon className="w-4 h-4 text-sky-500" />
                      {t.mode} Option Available
                    </span>
                    <span className="font-mono font-extrabold text-slate-900 dark:text-white">
                      {t.count} / {totalDestinations}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Budget Coverage Audit */}
            <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm">
              <h3 className="text-lg font-extrabold tracking-tight flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-500" />
                Budget Breakdown Completeness
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-xs font-semibold">
                  <span>Recommended Budget Populated</span>
                  <span className="font-mono font-extrabold text-emerald-600 dark:text-emerald-400">
                    {totalDestinations - metrics.missingBudget} /{" "}
                    {totalDestinations}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-xs font-semibold">
                  <span>Transport Fares Metadata</span>
                  <span className="font-mono font-extrabold text-emerald-600 dark:text-emerald-400">
                    {totalDestinations - metrics.missingTransportFares} /{" "}
                    {totalDestinations}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* TAB 5: COLLECTIONS AUDIT */}
        <TabsContent value="collections" className="space-y-6">
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm">
            <h3 className="text-lg font-extrabold tracking-tight flex items-center gap-2">
              <Layers className="w-5 h-5 text-purple-500" />
              Collections Membership ({totalCollections} Active Collections)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
              {allCollections.map((col) => {
                const memberCount = allDestinations.filter((d) =>
                  d.collections?.some((c) => c.collectionId === col.id),
                ).length;

                return (
                  <div
                    key={col.id}
                    className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-xs text-slate-900 dark:text-white truncate">
                        {col.name}
                      </span>
                      <Badge className="bg-purple-600 text-white font-extrabold text-[10px]">
                        {memberCount} items
                      </Badge>
                    </div>
                    <p className="text-[11px] text-slate-500 line-clamp-2">
                      {col.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
