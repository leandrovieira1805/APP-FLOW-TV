import { ChevronRight } from "lucide-react";
import type { Category } from "../lib/xtream";

interface CategoryPanelProps {
  categories: Category[];
  counts: Map<string, number>;
  total: number;
  value: string;
  onSelect: (id: string) => void;
  loading?: boolean;
  allLabel?: string;
}

export function CategoryPanel({
  categories,
  counts,
  total,
  value,
  onSelect,
  loading,
  allLabel = "Todos",
}: CategoryPanelProps) {
  const all = [{ category_id: "all", category_name: allLabel }, ...categories];

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-11 animate-pulse rounded-lg bg-card" />
        ))}
      </div>
    );
  }

  return (
    <ul className="max-h-[60vh] space-y-1 overflow-y-auto pr-1 lg:max-h-[calc(100vh-220px)]">
      {all.map((c) => (
        <li key={c.category_id}>
          <button
            onClick={() => onSelect(c.category_id)}
            className={`focusable flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors ${
              value === c.category_id
                ? "border-primary bg-primary/10 text-primary"
                : "border-transparent bg-card hover:border-primary/40"
            }`}
          >
            <span className="line-clamp-1">{c.category_name}</span>
            <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
              {c.category_id === "all" ? total : counts.get(c.category_id) ?? 0}
              <ChevronRight className="h-4 w-4" />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
