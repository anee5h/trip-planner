import { useState, useMemo } from "react";
import destinationsIndex from "@/shared/data/destinations-index.json";
import { PageHeader } from "@/shared/components/ui/PageHeader";
import { toCanonicalPlace } from "@/shared/services/place/PlaceCatalog";
import type {
  Destination,
  EditorialLifecycle,
} from "@/shared/types/destination";
import {
  ShieldCheck,
  AlertTriangle,
  Database,
  FileSpreadsheet,
  Download,
  Search,
  Globe,
  Building2,
  Copy,
  Check,
  Layers,
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

interface QueueItem {
  id: string;
  name: string;
  nameJa?: string;
  region: string;
  prefecture: string;
  placeType: string;
  role: string;
  lifecycle: EditorialLifecycle;
  method: string;
  confidence: string;
  riskReasons: string[];
  sourcesCount: number;
  hasJapanese: boolean;
  checkedAt?: string;
  reviewedAt?: string;
}

export default function EditorialDashboard() {
  const allDestinations = useMemo(
    () => (destinationsIndex as Destination[]).map(toCanonicalPlace),
    [],
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRegion, setSelectedRegion] = useState<string>("ALL");
  const [selectedLifecycle, setSelectedLifecycle] = useState<string>("ALL");
  const [selectedRiskReason, setSelectedRiskReason] = useState<string>("ALL");
  const [copied, setCopied] = useState(false);

  const NOW = Date.now();
  const DAY_MS = 86400000;

  // Analysis computation
  const metrics = useMemo(() => {
    const total = allDestinations.length;
    const lifecycleCounts: Record<string, number> = {
      published: 0,
      approved: 0,
      in_review: 0,
      draft: 0,
      legacy: 0,
    };
    const methodCounts: Record<string, number> = {
      manual: 0,
      assisted: 0,
      calculated: 0,
      unassigned: 0,
    };

    let staleCount = 0;
    let lowConfidenceCount = 0;
    let missingSourcesCount = 0;
    let missingJapaneseCount = 0;
    let imageReviewCount = 0;

    const queue: QueueItem[] = [];
    const hubsMap = new Map<
      string,
      {
        id: string;
        name: string;
        prefecture: string;
        region: string;
        riskReasons: Set<string>;
      }
    >();

    for (const place of allDestinations) {
      const lifecycle = (place.editorial?.lifecycle ||
        "legacy") as EditorialLifecycle;
      lifecycleCounts[lifecycle] = (lifecycleCounts[lifecycle] || 0) + 1;

      const method =
        place.ratingMetadata?.method ||
        place.editorial?.changes?.[0]?.method ||
        "unassigned";
      methodCounts[method] = (methodCounts[method] || 0) + 1;

      const riskReasons: string[] = [];

      // Staleness
      const checkedAtMs = place.editorial?.checkedAt
        ? new Date(place.editorial.checkedAt).getTime()
        : 0;
      const isStale =
        place.editorial?.freshness === "stale" ||
        place.editorial?.freshness === "review_due" ||
        (checkedAtMs > 0 && NOW - checkedAtMs > 180 * DAY_MS);

      if (isStale) {
        staleCount++;
        riskReasons.push("stale_data");
      }

      // Confidence
      const confidence = place.ratingMetadata?.confidence || "medium";
      if (confidence === "low") {
        lowConfidenceCount++;
        riskReasons.push("low_confidence_rating");
      }

      // Sources
      const sourcesCount = place.editorial?.sources?.length || 0;
      if (sourcesCount === 0) {
        missingSourcesCount++;
        riskReasons.push("missing_sources");
      }

      // Japanese content
      const hasJapanese = Boolean(
        place.nameJa ||
        (place.content?.ja?.name && place.content?.ja?.description),
      );
      if (!hasJapanese) {
        missingJapaneseCount++;
        riskReasons.push("missing_japanese");
      }

      // Image review
      if (place.imageNeedsReview) {
        imageReviewCount++;
        riskReasons.push("image_needs_review");
      }

      // Lifecycle incomplete
      if (lifecycle !== "published" && lifecycle !== "approved") {
        riskReasons.push(`lifecycle_${lifecycle}`);
      }

      if (riskReasons.length > 0) {
        queue.push({
          id: place.id,
          name: place.name,
          nameJa: place.nameJa || place.content?.ja?.name,
          region: place.region,
          prefecture: place.prefecture,
          placeType: place.placeType || "destination",
          role: place.role || "poi",
          lifecycle,
          method,
          confidence,
          riskReasons,
          sourcesCount,
          hasJapanese,
          checkedAt: place.editorial?.checkedAt,
          reviewedAt: place.editorial?.reviewedAt,
        });

        if (place.role === "hub" || place.placeType === "hub") {
          if (!hubsMap.has(place.id)) {
            hubsMap.set(place.id, {
              id: place.id,
              name: place.name,
              prefecture: place.prefecture,
              region: place.region,
              riskReasons: new Set(),
            });
          }
          for (const reason of riskReasons) {
            hubsMap.get(place.id)!.riskReasons.add(reason);
          }
        }
      }
    }

    const regions = Array.from(
      new Set(allDestinations.map((d) => d.region)),
    ).sort();
    const highRiskHubs = Array.from(hubsMap.values()).map((h) => ({
      ...h,
      riskReasons: Array.from(h.riskReasons),
    }));

    return {
      total,
      lifecycleCounts,
      methodCounts,
      staleCount,
      lowConfidenceCount,
      missingSourcesCount,
      missingJapaneseCount,
      imageReviewCount,
      regions,
      highRiskHubs,
      queue,
    };
  }, [allDestinations]);

  // Filtered Review Queue
  const filteredQueue = useMemo(() => {
    return metrics.queue.filter((item) => {
      if (selectedRegion !== "ALL" && item.region !== selectedRegion)
        return false;
      if (selectedLifecycle !== "ALL" && item.lifecycle !== selectedLifecycle)
        return false;
      if (
        selectedRiskReason !== "ALL" &&
        !item.riskReasons.includes(selectedRiskReason)
      )
        return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesNameJa = item.nameJa?.toLowerCase().includes(q);
        const matchesId = item.id.toLowerCase().includes(q);
        const matchesPref = item.prefecture.toLowerCase().includes(q);
        if (!matchesName && !matchesNameJa && !matchesId && !matchesPref)
          return false;
      }
      return true;
    });
  }, [
    metrics.queue,
    selectedRegion,
    selectedLifecycle,
    selectedRiskReason,
    searchQuery,
  ]);

  // Export handlers
  const handleExportJson = () => {
    const jsonStr = JSON.stringify(filteredQueue, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `editorial-review-queue-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredQueue.length} review items to JSON`);
  };

  const handleExportCsv = () => {
    const header =
      "id,name,region,prefecture,lifecycle,method,confidence,sourcesCount,riskReasons\n";
    const rows = filteredQueue
      .map(
        (i) =>
          `"${i.id}","${i.name}","${i.region}","${i.prefecture}","${i.lifecycle}","${i.method}","${i.confidence}",${i.sourcesCount},"${i.riskReasons.join(";")}"`,
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `editorial-review-queue-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredQueue.length} review items to CSV`);
  };

  const handleCopyQueue = () => {
    const ids = filteredQueue.map((i) => i.id).join("\n");
    navigator.clipboard.writeText(ids);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success(`Copied ${filteredQueue.length} place IDs to clipboard`);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <PageHeader
        title="Editorial Quality Dashboard"
        description="Monitor catalogue readiness, source provenance, bilingual parity, and deterministic review queues for Meguruto v2.0."
      />

      {/* Top Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 mt-6">
        <div className="bg-card border border-border rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">
              Total Places
            </span>
            <Database className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="mt-2 text-3xl font-bold">{metrics.total}</div>
          <div className="mt-1 text-xs text-muted-foreground flex gap-2">
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
              {metrics.lifecycleCounts.published || 0} published
            </span>
            <span>•</span>
            <span>{metrics.lifecycleCounts.approved || 0} approved</span>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">
              Source Provenance
            </span>
            <Globe className="w-5 h-5 text-blue-500" />
          </div>
          <div className="mt-2 text-3xl font-bold">
            {metrics.total - metrics.missingSourcesCount}
            <span className="text-sm text-muted-foreground font-normal">
              {" "}
              / {metrics.total}
            </span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {Math.round(
              ((metrics.total - metrics.missingSourcesCount) / metrics.total) *
                100,
            )}
            % places have verified sources
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">
              Japanese Parity
            </span>
            <Languages className="w-5 h-5 text-purple-500" />
          </div>
          <div className="mt-2 text-3xl font-bold">
            {metrics.total - metrics.missingJapaneseCount}
            <span className="text-sm text-muted-foreground font-normal">
              {" "}
              / {metrics.total}
            </span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {Math.round(
              ((metrics.total - metrics.missingJapaneseCount) / metrics.total) *
                100,
            )}
            % Japanese content coverage
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">
              High Risk Hubs
            </span>
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </div>
          <div className="mt-2 text-3xl font-bold text-amber-600 dark:text-amber-400">
            {metrics.highRiskHubs.length}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Hubs requiring editorial verification
          </div>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="queue" className="space-y-6">
        <TabsList className="bg-muted p-1 rounded-lg">
          <TabsTrigger value="queue" className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" />
            Review Queue ({filteredQueue.length})
          </TabsTrigger>
          <TabsTrigger value="hubs" className="flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            High-Risk Hubs ({metrics.highRiskHubs.length})
          </TabsTrigger>
          <TabsTrigger value="lifecycle" className="flex items-center gap-2">
            <Layers className="w-4 h-4" />
            Lifecycle Breakdown
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Review Queue */}
        <TabsContent value="queue" className="space-y-4">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-card p-4 rounded-xl border border-border">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search places by name, ID, or prefecture..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <select
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
                className="h-9 text-xs px-3 rounded-md border border-input bg-background font-medium"
              >
                <option value="ALL">All Regions</option>
                {metrics.regions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>

              <select
                value={selectedLifecycle}
                onChange={(e) => setSelectedLifecycle(e.target.value)}
                className="h-9 text-xs px-3 rounded-md border border-input bg-background font-medium"
              >
                <option value="ALL">All Lifecycles</option>
                <option value="published">Published</option>
                <option value="approved">Approved</option>
                <option value="in_review">In Review</option>
                <option value="draft">Draft</option>
                <option value="legacy">Legacy</option>
              </select>

              <select
                value={selectedRiskReason}
                onChange={(e) => setSelectedRiskReason(e.target.value)}
                className="h-9 text-xs px-3 rounded-md border border-input bg-background font-medium"
              >
                <option value="ALL">All Risk Issues</option>
                <option value="missing_sources">Missing Sources</option>
                <option value="missing_japanese">Missing Japanese</option>
                <option value="stale_data">Stale / Review Due</option>
                <option value="low_confidence_rating">
                  Low Confidence Rating
                </option>
                <option value="image_needs_review">Image Needs Review</option>
              </select>

              <Button
                variant="outline"
                size="sm"
                onClick={handleExportJson}
                className="gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                JSON
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCsv}
                className="gap-1.5"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                CSV
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCopyQueue}
                className="gap-1.5"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                Copy IDs
              </Button>
            </div>
          </div>

          {/* Table Container */}
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 border-b border-border font-semibold text-muted-foreground uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Destination</th>
                    <th className="px-4 py-3">Region / Pref</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Lifecycle</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">Sources</th>
                    <th className="px-4 py-3">Risk Factors</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredQueue.slice(0, 100).map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">
                        <div className="font-semibold text-foreground">
                          {item.name}
                        </div>
                        {item.nameJa && (
                          <div className="text-[11px] text-muted-foreground">
                            {item.nameJa}
                          </div>
                        )}
                        <div className="text-[10px] font-mono text-muted-foreground/70">
                          {item.id}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <div>{item.region}</div>
                        <div className="text-[11px]">{item.prefecture}</div>
                      </td>
                      <td className="px-4 py-3 capitalize text-muted-foreground">
                        <Badge variant="outline" className="text-[10px]">
                          {item.role === "hub" ? "Hub" : item.placeType}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            item.lifecycle === "published"
                              ? "default"
                              : "secondary"
                          }
                          className="text-[10px] capitalize"
                        >
                          {item.lifecycle}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 capitalize text-muted-foreground">
                        {item.method}
                      </td>
                      <td className="px-4 py-3">
                        {item.sourcesCount > 0 ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                            {item.sourcesCount} sources
                          </span>
                        ) : (
                          <span className="text-rose-500 font-medium">
                            0 sources
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {item.riskReasons.map((reason) => (
                            <Badge
                              key={reason}
                              variant="destructive"
                              className="text-[9px] px-1.5 py-0"
                            >
                              {reason.replace(/_/g, " ")}
                            </Badge>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredQueue.length > 100 && (
                <div className="p-3 text-center text-xs text-muted-foreground bg-muted/20 border-t border-border">
                  Showing first 100 of {filteredQueue.length} matching items.
                  Export JSON or CSV for full queue.
                </div>
              )}

              {filteredQueue.length === 0 && (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  No places match the selected editorial queue filters.
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: High-Risk Hubs */}
        <TabsContent value="hubs" className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-6 shadow-xs">
            <h3 className="text-base font-semibold mb-2 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-amber-500" />
              High-Risk Travel Hubs ({metrics.highRiskHubs.length})
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Hubs are primary decision anchors for regional day trips. Missing
              sources or stale data on hubs directly impacts recommendation
              reliability.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {metrics.highRiskHubs.map((hub) => (
                <div
                  key={hub.id}
                  className="border border-border rounded-lg p-4 bg-muted/20 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-sm">{hub.name}</div>
                    <Badge variant="outline" className="text-[10px]">
                      {hub.prefecture}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {hub.id}
                  </div>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {hub.riskReasons.map((r) => (
                      <Badge
                        key={r}
                        variant="destructive"
                        className="text-[9px]"
                      >
                        {r.replace(/_/g, " ")}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Tab 3: Lifecycle Breakdown */}
        <TabsContent value="lifecycle" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-card border border-border rounded-xl p-6 shadow-xs">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-500" />
                Lifecycle Publication Status
              </h3>
              <div className="space-y-3">
                {Object.entries(metrics.lifecycleCounts).map(
                  ([status, count]) => {
                    const pct = Math.round((count / metrics.total) * 100);
                    return (
                      <div key={status} className="space-y-1">
                        <div className="flex justify-between text-xs font-medium">
                          <span className="capitalize">{status}</span>
                          <span>
                            {count} ({pct}%)
                          </span>
                        </div>
                        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-6 shadow-xs">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-500" />
                Editorial Review Method
              </h3>
              <div className="space-y-3">
                {Object.entries(metrics.methodCounts).map(([method, count]) => {
                  const pct = Math.round((count / metrics.total) * 100);
                  return (
                    <div key={method} className="space-y-1">
                      <div className="flex justify-between text-xs font-medium">
                        <span className="capitalize">{method}</span>
                        <span>
                          {count} ({pct}%)
                        </span>
                      </div>
                      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Languages(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 8 6 6" />
      <path d="m4 14 6-6 2-3" />
      <path d="M2 5h12" />
      <path d="M7 2h1" />
      <path d="m22 22-5-10-5 10" />
      <path d="M14 18h6" />
    </svg>
  );
}
