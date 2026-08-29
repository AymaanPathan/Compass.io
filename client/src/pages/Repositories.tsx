import Nav from "../components/Navbar";

const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace";

interface RepoCard {
  id: string;
  name: string;
  owner: string;
  description: string;
  language: string;
  stars: string;
  matchScore?: number;
  openIssues?: number;
  contributedOn?: string;
}

interface Column {
  key: string;
  label: string;
  count: number;
  repos: RepoCard[];
}

const COLUMNS: Column[] = [
  {
    key: "for_you",
    label: "For you",
    count: 4,
    repos: [
      {
        id: "r1",
        name: "truefoundry/truefoundry-sdk",
        owner: "truefoundry",
        description:
          "Python SDK for deploying and managing ML workloads on TrueFoundry.",
        language: "Python",
        stars: "1.2k",
        matchScore: 92,
        openIssues: 14,
      },
      {
        id: "r2",
        name: "vercel/next.js",
        owner: "vercel",
        description:
          "The React framework for production — hybrid static & server rendering.",
        language: "TypeScript",
        stars: "128k",
        matchScore: 87,
        openIssues: 412,
      },
      {
        id: "r3",
        name: "prisma/prisma",
        owner: "prisma",
        description: "Next-generation ORM for Node.js and TypeScript.",
        language: "TypeScript",
        stars: "39k",
        matchScore: 81,
        openIssues: 186,
      },
      {
        id: "r4",
        name: "langchain-ai/langgraph",
        owner: "langchain-ai",
        description: "Build resilient language agents as graphs.",
        language: "Python",
        stars: "8.9k",
        matchScore: 78,
        openIssues: 63,
      },
    ],
  },
  {
    key: "selected",
    label: "Selected",
    count: 2,
    repos: [
      {
        id: "r5",
        name: "trpc/trpc",
        owner: "trpc",
        description:
          "Move fast and break nothing. End-to-end typesafe APIs made easy.",
        language: "TypeScript",
        stars: "34k",
        matchScore: 85,
        openIssues: 97,
      },
      {
        id: "r6",
        name: "shadcn-ui/ui",
        owner: "shadcn-ui",
        description:
          "Beautifully designed components built with Radix UI and Tailwind CSS.",
        language: "TypeScript",
        stars: "76k",
        matchScore: 83,
        openIssues: 210,
      },
    ],
  },
  {
    key: "contributed",
    label: "Contributed",
    count: 3,
    repos: [
      {
        id: "r7",
        name: "supabase/supabase",
        owner: "supabase",
        description: "The open source Firebase alternative.",
        language: "TypeScript",
        stars: "72k",
        contributedOn: "Aug 12, 2026",
      },
      {
        id: "r8",
        name: "remix-run/remix",
        owner: "remix-run",
        description: "Build better websites with Remix.",
        language: "TypeScript",
        stars: "29k",
        contributedOn: "Jul 28, 2026",
      },
      {
        id: "r9",
        name: "colinhacks/zod",
        owner: "colinhacks",
        description:
          "TypeScript-first schema validation with static type inference.",
        language: "TypeScript",
        stars: "34k",
        contributedOn: "Jun 03, 2026",
      },
    ],
  },
];

export default function Repositories() {
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
        {COLUMNS.map((col) => (
          <KanbanColumn key={col.key} column={col} />
        ))}
      </div>
    </div>
  );
}

function KanbanColumn({ column }: { column: Column }) {
  return (
    <div className="flex w-[320px] shrink-0 flex-col">
      <div className="flex items-center gap-2 px-1 pb-3">
        <p className="text-[12.5px] font-medium text-[#EDECEC]/85">
          {column.label}
        </p>
        <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10.5px] text-[#EDECEC]/40">
          {column.count}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2.5 rounded-md bg-white/[0.015] p-2.5">
        {column.repos.map((repo) => (
          <RepoCardItem key={repo.id} repo={repo} />
        ))}
      </div>
    </div>
  );
}

function RepoCardItem({ repo }: { repo: RepoCard }) {
  return (
    <div className="cursor-pointer rounded-md border border-white/[0.08] bg-[#14120B] p-4 transition-colors hover:border-white/[0.16]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium text-[#EDECEC]/95">{repo.name}</p>
        {repo.matchScore !== undefined && (
          <span className="shrink-0 rounded-full bg-[#D39237]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#D39237]">
            {repo.matchScore}% match
          </span>
        )}
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-[#EDECEC]/50">
        {repo.description}
      </p>

      <div className="mt-3 flex items-center gap-3 text-[11px] text-[#EDECEC]/40">
        <span className="flex items-center gap-1">
          <span
            className="h-2 w-2 rounded-full bg-[#D39237]/60"
            style={{ fontFamily: MONO }}
          />
          {repo.language}
        </span>
        <span>★ {repo.stars}</span>
        {repo.openIssues !== undefined && (
          <span>{repo.openIssues} open issues</span>
        )}
      </div>

      {repo.contributedOn && (
        <p className="mt-2.5 border-t border-white/[0.06] pt-2 text-[10.5px] text-[#EDECEC]/35">
          Contributed on {repo.contributedOn}
        </p>
      )}
    </div>
  );
}
