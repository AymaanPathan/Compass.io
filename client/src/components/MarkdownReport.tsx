/* eslint-disable @typescript-eslint/no-explicit-any */
// client/src/components/MarkdownReport.tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace";

export default function MarkdownReport({ content }: { content: string }) {
  return (
    <div className="text-[13.5px] leading-relaxed text-[#EDECEC]/85">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h1 className="mb-3 mt-6 text-[19px] font-semibold text-[#EDECEC] first:mt-0" {...p} />,
          h2: (p) => <h2 className="mb-2.5 mt-6 text-[15px] font-semibold text-[#EDECEC]/95 first:mt-0" {...p} />,
          h3: (p) => <h3 className="mb-2 mt-4 text-[13.5px] font-semibold text-[#EDECEC]/90" {...p} />,
          p: (p) => <p className="mb-3 last:mb-0" {...p} />,
          ul: (p) => <ul className="mb-3 ml-4 list-disc space-y-1" {...p} />,
          ol: (p) => <ol className="mb-3 ml-4 list-decimal space-y-1" {...p} />,
          li: (p) => <li className="text-[#EDECEC]/80" {...p} />,
          strong: (p) => <strong className="font-semibold text-[#EDECEC]" {...p} />,
          a: (p) => (
            <a
              className="text-[#D39237] underline underline-offset-2 hover:text-[#D39237]/80"
              target="_blank"
              rel="noreferrer"
              {...p}
            />
          ),
          code: ({ inline, className, children, ...rest }: any) =>
            inline ? (
              <code className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[12px]" style={{ fontFamily: MONO }} {...rest}>
                {children}
              </code>
            ) : (
              <code className={className} style={{ fontFamily: MONO }} {...rest}>
                {children}
              </code>
            ),
          pre: (p) => (
            <pre
              className="mb-3 overflow-x-auto rounded-md border border-white/[0.08] bg-black/30 p-3.5 text-[12px] leading-relaxed"
              style={{ fontFamily: MONO }}
              {...p}
            />
          ),
          blockquote: (p) => (
            <blockquote className="mb-3 border-l-2 border-[#D39237]/40 pl-3 text-[#EDECEC]/60" {...p} />
          ),
          hr: () => <hr className="my-5 border-white/[0.08]" />,
          table: (p) => (
            <div className="mb-3 overflow-x-auto">
              <table className="w-full border-collapse text-[12.5px]" {...p} />
            </div>
          ),
          th: (p) => (
            <th className="border border-white/[0.1] bg-white/[0.04] px-2.5 py-1.5 text-left font-medium" {...p} />
          ),
          td: (p) => <td className="border border-white/[0.08] px-2.5 py-1.5 text-[#EDECEC]/75" {...p} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}