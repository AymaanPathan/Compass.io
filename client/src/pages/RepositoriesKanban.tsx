import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Nav from "../components/Navbar";
import type { AppDispatch } from "../store/store";
import {
  fetchCachedRecommendations,
  selectRecommendations,
  type MatchedRepository,
} from "../store/recommendationsSlice";
import {
  fetchKanbanItems,
  addToKanban,
  moveKanbanItem,
  removeFromKanban,
  selectKanban,
  selectKanbanUrls,
  KANBAN_COLUMNS,
  type KanbanItem,
  type KanbanStatus,
} from "../store/repoKanbanSlice";

export default function Repositories() {
  const dispatch = useDispatch<AppDispatch>();
  const { data: recommendations, status: recStatus } = useSelector(
    selectRecommendations,
  );
  const { items: kanbanItems, status: kanbanStatus } =
    useSelector(selectKanban);
  const kanbanUrls = useSelector(selectKanbanUrls);

  useEffect(() => {
    dispatch(fetchCachedRecommendations());
    dispatch(fetchKanbanItems());
  }, [dispatch]);

  const forYou = (recommendations ?? []).filter((r) => !kanbanUrls.has(r.url));
  const isLoading =
    (recStatus === "idle" ||
      recStatus === "connecting" ||
      recStatus === "running") &&
    kanbanStatus === "loading";

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#14120B] text-[#EDECEC]">
      <Nav />

      <div className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4">
        <div>
          <p className="text-[11.5px] text-[#EDECEC]/50">Step 2 · Discovery</p>
          <h1 className="mt-1 text-[20px] font-medium text-[#EDECEC]">
            Repositories
          </h1>
        </div>
        <p className="max-w-sm text-right text-[12px] leading-relaxed text-[#EDECEC]/40">
          Pick a repository to start finding issues that fit your skills.
        </p>
      </div>

      <div className="flex flex-1 gap-4 overflow-x-auto px-6 py-6">
        <ForYouColumn repos={forYou} loading={isLoading} />
        {KANBAN_COLUMNS.map((col) => (
          <KanbanBoardColumn
            key={col.value}
            status={col.value}
            label={col.label}
            items={kanbanItems.filter((i) => i.status === col.value)}
            loading={kanbanStatus === "loading" && kanbanItems.length === 0}
          />
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Column shells                                                            */
/* -------------------------------------------------------------------------- */

function ColumnShell({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex w-[320px] shrink-0 flex-col">
      <div className="flex items-center gap-2 px-1 pb-3">
        <p className="text-[12.5px] font-medium text-[#EDECEC]/85">{label}</p>
        <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10.5px] text-[#EDECEC]/40">
          {count}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2.5 rounded-md bg-white/[0.015] p-2.5">
        {children}
      </div>
    </div>
  );
}

function ColumnSkeleton() {
  return (
    <div className="flex flex-col gap-2.5">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-md border border-white/[0.06] p-4">
          <div className="h-2.5 w-2/3 rounded bg-white/[0.06]" />
          <div className="mt-2.5 h-2 w-full rounded bg-white/[0.05]" />
          <div className="mt-1.5 h-2 w-4/5 rounded bg-white/[0.05]" />
        </div>
      ))}
    </div>
  );
}

function ColumnEmpty({ message }: { message: string }) {
  return (
    <p className="px-1.5 py-3 text-[11.5px] leading-relaxed text-[#EDECEC]/35">
      {message}
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/*  "For you" — repos from the recommendation agent, not yet on the board    */
/* -------------------------------------------------------------------------- */

function ForYouColumn({
  repos,
  loading,
}: {
  repos: MatchedRepository[];
  loading: boolean;
}) {
  return (
    <ColumnShell label="For you" count={repos.length}>
      {loading && repos.length === 0 && <ColumnSkeleton />}
      {!loading && repos.length === 0 && (
        <ColumnEmpty message="No new matches right now — run the recommender agent to find more repos." />
      )}
      {repos.map((repo) => (
        <RecommendationCard key={repo.url} repo={repo} />
      ))}
    </ColumnShell>
  );
}

function RecommendationCard({ repo }: { repo: MatchedRepository }) {
  const dispatch = useDispatch<AppDispatch>();
  const { addingUrl } = useSelector(selectKanban);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isAdding = addingUrl === repo.url;

  useEffect(() => {
    if (!menuOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  const handleAdd = (status: KanbanStatus) => {
    dispatch(
      addToKanban({
        name: repo.name,
        url: repo.url,
        description: repo.description,
        repoType: repo.repoType,
        whyItMatches: repo.whyItMatches,
        status,
      }),
    );
    setMenuOpen(false);
  };

  return (
    <div className="group relative rounded-md border border-white/[0.08] bg-[#14120B] p-4 transition-colors hover:border-white/[0.16]">
      <div className="flex items-start justify-between gap-2">
        <a
          href={repo.url}
          target="_blank"
          rel="noreferrer"
          className="truncate text-[13px] font-medium text-[#EDECEC]/95 hover:text-[#D39237] hover:underline"
        >
          {repo.name}
        </a>
        <div ref={menuRef} className="relative shrink-0">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Repo options"
            className="flex h-6 w-6 items-center justify-center rounded-md text-[#EDECEC]/40 opacity-0 transition-opacity hover:bg-white/[0.08] hover:text-[#EDECEC]/80 group-hover:opacity-100 data-[open=true]:opacity-100"
            data-open={menuOpen}
          >
            <DotsIcon />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-7 z-30 w-48 overflow-hidden rounded-md border border-white/[0.1] bg-[#1B1911] shadow-xl">
              <p className="border-b border-white/[0.08] px-3 py-2 text-[10.5px] uppercase tracking-wide text-[#EDECEC]/40">
                Add to board
              </p>
              {KANBAN_COLUMNS.map((col) => (
                <button
                  key={col.value}
                  onClick={() => handleAdd(col.value)}
                  disabled={isAdding}
                  className="flex w-full items-center px-3 py-2.5 text-left text-[12.5px] text-[#EDECEC]/80 hover:bg-white/[0.06] disabled:opacity-50"
                >
                  {col.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="mt-1.5 text-[12px] leading-relaxed text-[#EDECEC]/50">
        {repo.description}
      </p>

      {repo.repoType && (
        <div className="mt-3">
          <span className="rounded-full border border-white/[0.1] px-1.5 py-0.5 text-[10.5px] text-[#EDECEC]/50">
            {repo.repoType}
          </span>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Kanban columns — real board data                                         */
/* -------------------------------------------------------------------------- */

function KanbanBoardColumn({
  status,
  label,
  items,
  loading,
}: {
  status: KanbanStatus;
  label: string;
  items: KanbanItem[];
  loading: boolean;
}) {
  return (
    <ColumnShell label={label} count={items.length}>
      {loading && <ColumnSkeleton />}
      {!loading && items.length === 0 && (
        <ColumnEmpty
          message={
            status === "selected"
              ? "Add a repo from \u201cFor you\u201d to get started."
              : "Nothing here yet."
          }
        />
      )}
      {items.map((item) => (
        <KanbanCard key={item._id} item={item} />
      ))}
    </ColumnShell>
  );
}

function KanbanCard({ item }: { item: KanbanItem }) {
  const dispatch = useDispatch<AppDispatch>();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  const otherColumns = KANBAN_COLUMNS.filter(
    (c) => c.value !== item.status,
  );

  const handleMove = (status: KanbanStatus) => {
    dispatch(moveKanbanItem({ id: item._id, status }));
    setMenuOpen(false);
  };

  const handleRemove = () => {
    dispatch(removeFromKanban(item._id));
    setMenuOpen(false);
  };

  return (
    <div className="group relative rounded-md border border-white/[0.08] bg-[#14120B] p-4 transition-colors hover:border-white/[0.16]">
      <div className="flex items-start justify-between gap-2">
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="truncate text-[13px] font-medium text-[#EDECEC]/95 hover:text-[#D39237] hover:underline"
        >
          {item.name}
        </a>
        <div ref={menuRef} className="relative shrink-0">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Card options"
            className="flex h-6 w-6 items-center justify-center rounded-md text-[#EDECEC]/40 opacity-0 transition-opacity hover:bg-white/[0.08] hover:text-[#EDECEC]/80 group-hover:opacity-100 data-[open=true]:opacity-100"
            data-open={menuOpen}
          >
            <DotsIcon />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-7 z-30 w-48 overflow-hidden rounded-md border border-white/[0.1] bg-[#1B1911] shadow-xl">
              <p className="border-b border-white/[0.08] px-3 py-2 text-[10.5px] uppercase tracking-wide text-[#EDECEC]/40">
                Move to
              </p>
              {otherColumns.map((col) => (
                <button
                  key={col.value}
                  onClick={() => handleMove(col.value)}
                  className="flex w-full items-center px-3 py-2.5 text-left text-[12.5px] text-[#EDECEC]/80 hover:bg-white/[0.06]"
                >
                  {col.label}
                </button>
              ))}
              <button
                onClick={handleRemove}
                className="flex w-full items-center border-t border-white/[0.08] px-3 py-2.5 text-left text-[12.5px] text-red-400/80 hover:bg-white/[0.06]"
              >
                Remove from board
              </button>
            </div>
          )}
        </div>
      </div>

      <p className="mt-1.5 text-[12px] leading-relaxed text-[#EDECEC]/50">
        {item.description}
      </p>

      <div className="mt-3 flex items-center justify-between gap-2">
        {item.repoType && (
          <span className="rounded-full border border-white/[0.1] px-1.5 py-0.5 text-[10.5px] text-[#EDECEC]/50">
            {item.repoType}
          </span>
        )}
        <span className="text-[10.5px] text-[#EDECEC]/35">
          {item.status === "contributed" ? "Contributed" : "Updated"}{" "}
          {formatDate(item.updatedAt)}
        </span>
      </div>
    </div>
  );
}

function DotsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="3" r="1.4" fill="currentColor" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" />
      <circle cx="8" cy="13" r="1.4" fill="currentColor" />
    </svg>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
