import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Trash2, Filter } from "lucide-react";
import ObjectSearchBar from "@/components/ObjectSearchBar";
import { getHistory, deleteDetection, clearHistory, DetectionEvent } from "@/lib/detectionStore";
import PageTransition from "@/components/PageTransition";

const ITEMS_PER_PAGE = 20;

export default function HistoryPage() {
  const [history, setHistory] = useState<DetectionEvent[]>(getHistory);
  const [search, setSearch] = useState("");
  const [filterObj, setFilterObj] = useState("all");
  const [sortBy, setSortBy] = useState<"latest" | "frequent">("latest");
  const [page, setPage] = useState(1);

  const objectTypes = useMemo(() => {
    const set = new Set(history.map((h) => h.objectName));
    return Array.from(set).sort();
  }, [history]);

  const filtered = useMemo(() => {
    let items = history;
    if (search) items = items.filter((h) => h.objectName.toLowerCase().includes(search.toLowerCase()));
    if (filterObj !== "all") items = items.filter((h) => h.objectName === filterObj);
    if (sortBy === "frequent") {
      const freq: Record<string, number> = {};
      items.forEach((h) => (freq[h.objectName] = (freq[h.objectName] || 0) + 1));
      items = [...items].sort((a, b) => (freq[b.objectName] || 0) - (freq[a.objectName] || 0));
    }
    return items;
  }, [history, search, filterObj, sortBy]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paged = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const handleDelete = (id: string) => {
    deleteDetection(id);
    setHistory(getHistory());
  };

  const handleClear = () => {
    clearHistory();
    setHistory([]);
  };

  return (
    <PageTransition>
    <div className="min-h-screen pt-20 pb-12">
      <div className="container mx-auto px-4 sm:px-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2">
            Detection <span className="text-primary">History</span>
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mb-6 sm:mb-8">Review all past detection events.</p>
        </motion.div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3 mb-6">
          <div className="relative flex-1 min-w-0 sm:max-w-sm">
            <ObjectSearchBar
              value={search}
              onChange={(v) => { setSearch(v); setPage(1); }}
              placeholder="Search objects..."
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <select
                value={filterObj}
                onChange={(e) => { setFilterObj(e.target.value); setPage(1); }}
                className="bg-secondary text-foreground border border-border rounded-lg px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
              >
                <option value="all">All Objects</option>
                {objectTypes.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "latest" | "frequent")}
              className="bg-secondary text-foreground border border-border rounded-lg px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
            >
              <option value="latest">Latest First</option>
              <option value="frequent">Most Frequent</option>
            </select>
            {history.length > 0 && (
              <button
                onClick={handleClear}
                className="btn-glow inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-destructive/10 text-destructive text-sm font-medium hover:bg-destructive/20 transition"
              >
                <Trash2 className="w-4 h-4" />
                Clear All
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        {paged.length === 0 ? (
          <div className="hover-card rounded-xl p-8 sm:p-12 text-center text-muted-foreground">
            No detection history yet. Start detecting objects to see them here.
          </div>
        ) : (
          <div className="hover-card rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full text-sm min-w-[400px]">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-left">
                  <th className="px-4 sm:px-5 py-3 font-medium">Object</th>
                  <th className="px-4 sm:px-5 py-3 font-medium">Confidence</th>
                  <th className="px-4 sm:px-5 py-3 font-medium">Time</th>
                  <th className="px-4 sm:px-5 py-3 font-medium w-16" />
                </tr>
              </thead>
              <tbody>
                {paged.map((h) => (
                  <motion.tr
                    key={h.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="border-b border-border/50 hover:bg-secondary/30 transition"
                  >
                    <td className={`px-4 sm:px-5 py-3 font-medium capitalize ${search && h.objectName.toLowerCase().includes(search.toLowerCase()) ? "text-primary" : "text-foreground"}`}>{h.objectName}</td>
                    <td className="px-4 sm:px-5 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: h.confidence > 0.7 ? "hsl(185, 100%, 50%)" : h.confidence > 0.5 ? "hsl(45, 100%, 50%)" : "hsl(0, 70%, 50%)" }} />
                        <span className="font-mono text-foreground">{(h.confidence * 100).toFixed(1)}%</span>
                      </span>
                    </td>
                    <td className="px-4 sm:px-5 py-3 text-muted-foreground whitespace-nowrap">{new Date(h.timestamp).toLocaleString()}</td>
                    <td className="px-4 sm:px-5 py-3">
                      <button onClick={() => handleDelete(h.id)} className="text-muted-foreground hover:text-destructive transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-9 h-9 rounded-lg text-sm font-medium transition ${
                  p === page ? "gradient-cyan text-primary-foreground" : "glass text-muted-foreground hover:text-foreground"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
    </PageTransition>
  );
}
