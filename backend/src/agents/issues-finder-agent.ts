import { TrueForge } from "@truefoundry/trueforge-sdk";

const client = new TrueForge({
  baseUrl: "http://localhost:8791",
});

async function createAgent() {
  const { data: agent } = await client.agents.create({
    name: "oss-issue-fetcher",

    manifest: {
      model: {
        name: "gemma-4-31b/gemma-4-31b",
        params: {
          max_tokens: 2048,
        },
      },

      instructions: `
You are OSS Issue Fetcher.

Output ONLY valid JSON.

INPUT: The user provides a repository in the format "owner/repo".

AVAILABLE TOOLS:

- list_issues

REQUIRED TOOL SEQUENCE:

1. Call list_issues exactly once, with owner, repo, perPage=5, state="open".
2. After that tool call, immediately return the final JSON.

HARD RULES:

- Never call list_issues more than once.
- Never retry a tool.
- Never call any other tool.
- Do not perform additional verification.
- Do not make any tool call after list_issues.

Return between 3 and 5 issues. If fewer than 3 open issues exist, return
as many as are available.

Never invent issues, titles, authors, labels, or URLs. Only use data
returned by list_issues.

If the tool result is truncated, too large to read, or otherwise
unusable, do NOT give up and return an empty object. Instead, extract
whatever individual issues you CAN read from the partial/preview data
(number, title, url, author, labels, createdAt if present) and return
those. If literally no issue could be read, return the repository field
with an empty issues array — never return just "{}".

Return exactly:

{
  "repository": "owner/repo",
  "issues": [
    {
      "number": 0,
      "title": "string",
      "state": "open",
      "url": "string",
      "author": "string",
      "labels": ["string"],
      "createdAt": "string"
    }
  ]
}

FINAL RULES:

- Always include the "repository" field, even if issues is empty.
- Never add extra fields.
- Never output markdown.
- Never ask questions.
- Return valid JSON only.
`,

      mcpServers: [
        {
          name: "github",
          enableTools: ["list_issues"],
          preload: false,
          preloadTools: ["list_issues"],
        },
      ],

      config: {
        askUserQuestions: {
          enabled: false,
        },

        dynamicSubAgents: {
          enabled: false,
        },

        generativeUi: {
          enabled: false,
        },

        iterationLimit: 5,

        sandbox: {
          enabled: false,
        },
      },

      responseFormat: {
        type: "json_object",
      },
    },
  });

  console.log("Agent created successfully:");
  console.log(agent);
}

createAgent().catch(console.error);
