import Nav from "../components/Navbar";

interface IssueCard {
  id: string;
  title: string;
  repo: string;
  complexity: "Easy" | "Medium" | "Hard";
  labels: string[];
  updatedAgo: string;
}

interface Column {
  key: string;
  label: string;
  count: number;
  issues: IssueCard[];
}

const COMPLEXITY_STYLES: Record<IssueCard["complexity"], string> = {
  Easy: "bg-emerald-500/10 text-emerald-400",
  Medium: "bg-[#D39237]/15 text-[#D39237]",
  Hard: "bg-red-500/10 text-red-400",
};

const COLUMNS: Column[] = [
  {
    key: "understanding",
    label: "Understanding",
    count: 2,
    issues: [
      {
        id: "i1",
        title: "Support custom retry policy in SDK client",
        repo: "truefoundry/truefoundry-sdk",
        complexity: "Medium",
        labels: ["good first issue", "sdk"],
        updatedAgo: "2h ago",
      },
      {
        id: "i2",
        title: "Fix flaky test in useRouter hook",
        repo: "vercel/next.js",
        complexity: "Easy",
        labels: ["bug", "tests"],
        updatedAgo: "5h ago",
      },
    ],
  },
  {
    key: "solving",
    label: "Solving",
    count: 1,
    issues: [
      {
        id: "i3",
        title: "Zod: improve error message for union type mismatches",
        repo: "colinhacks/zod",
        complexity: "Medium",
        labels: ["dx", "error-messages"],
        updatedAgo: "1d ago",
      },
    ],
  },
  {
    key: "testing",
    label: "Testing",
    count: 1,
    issues: [
      {
        id: "i4",
        title: "Prisma: relation query fails silently on composite keys",
        repo: "prisma/prisma",
        complexity: "Hard",
        labels: ["bug", "query-engine"],
        updatedAgo: "3h ago",
      },
    ],
  },
  {
    key: "awaiting_approval",
    label: "Awaiting approval",
    count: 1,
    issues: [
      {
        id: "i5",
        title: "trpc: add support for output validation middleware",
        repo: "trpc/trpc",
        complexity: "Medium",
        labels: ["feature", "middleware"],
        updatedAgo: "6h ago",
      },
    ],
  },
  {
    key: "pr_open",
    label: "PR open",
    count: 1,
    issues: [
      {
        id: "i6",
        title:
          "shadcn-ui: dropdown menu doesn't close on outside click in Safari",
        repo: "shadcn-ui/ui",
        complexity: "Easy",
        labels: ["bug", "safari"],
        updatedAgo: "12h ago",
      },
    ],
  },
  {
    key: "merged",
    label: "Merged",
    count: 1,
    issues: [
      {
        id: "i7",
        title: "supabase: typo in CLI help output for `db push`",
        repo: "supabase/supabase",
        complexity: "Easy",
        labels: ["good first issue", "docs"],
        updatedAgo: "2d ago",
      },
    ],
  },
];

export default function Issues() {
  return (
    <div className="flex min-h-screen w-full flex-col bg-[#14120B] text-[#EDECEC]">
      <Nav />

      <div className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4">
        <div>
          <p className="text-[11.5px] text-[#EDECEC]/50">
            Step 3–5 · Deep dive → Solving → Review
          </p>
          <h1 className="mt-1 text-[20px] font-medium text-[#EDECEC]">
            Issues
          </h1>
        </div>
        <p className="max-w-sm text-right text-[12px] leading-relaxed text-[#EDECEC]/40">
          Every card is one persistent session, tracked from first read to
          merge.
        </p>
      </div>

      <div className="flex flex-1 gap-4 overflow-x-auto px-6 py-6">
        {COLUMNS.map((col) => (
          <KanbanColumn key={col.key} column={col} />
        ))}
      </div>
    </div>
  );
}

function KanbanColumn({ column }: { column: Column }) {
  return (
    <div className="flex w-[300px] shrink-0 flex-col">
      <div className="flex items-center gap-2 px-1 pb-3">
        <p className="text-[12.5px] font-medium text-[#EDECEC]/85">
          {column.label}
        </p>
        <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10.5px] text-[#EDECEC]/40">
          {column.count}
        </span>
      </div>
      <div className="flex min-h-[120px] flex-1 flex-col gap-2.5 rounded-md bg-white/[0.015] p-2.5">
        {column.issues.map((issue) => (
          <IssueCardItem key={issue.id} issue={issue} />
        ))}
      </div>
    </div>
  );
}

function IssueCardItem({ issue }: { issue: IssueCard }) {
  return (
    <div className="cursor-pointer rounded-md border border-white/[0.08] bg-[#14120B] p-4 transition-colors hover:border-white/[0.16]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12.5px] font-medium leading-snug text-[#EDECEC]/95">
          {issue.title}
        </p>
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${COMPLEXITY_STYLES[issue.complexity]}`}
        >
          {issue.complexity}
        </span>
      </div>
      <p className="mt-2 text-[11px] text-[#EDECEC]/40">{issue.repo}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {issue.labels.map((label) => (
          <span
            key={label}
            className="rounded-full border border-white/[0.1] px-2 py-0.5 text-[10px] text-[#EDECEC]/50"
          >
            {label}
          </span>
        ))}
      </div>

      <p className="mt-3 border-t border-white/[0.06] pt-2 text-[10.5px] text-[#EDECEC]/35">
        Updated {issue.updatedAgo}
      </p>
    </div>
  );
}
