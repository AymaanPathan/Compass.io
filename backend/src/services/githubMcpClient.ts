import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

let client: Client | null = null;

export async function getGithubMcpClient(): Promise<Client> {
  if (client) return client;

  const url = process.env.GITHUB_MCP_URL;
  const token = process.env.TFY_API_KEY;

  if (!url || !token) {
    throw new Error("GITHUB_MCP_URL or TFY_API_KEY is not set");
  }

  const c = new Client({ name: "compass-github-mcp-client", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });

  await c.connect(transport);
  client = c;
  return c;
}

export async function listGithubMcpTools() {
  const c = await getGithubMcpClient();
  return c.listTools();
}

export async function callGithubMcpTool(
  name: string,
  args: Record<string, unknown>,
) {
  const c = await getGithubMcpClient();
  return c.callTool({ name, arguments: args });
}
