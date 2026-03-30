import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { exec } from "node:child_process";
import { z } from "zod";
import { readToken, writeToken } from "./token";

const API_BASE = process.env.RECRUITER_API_URL ?? "http://localhost:3000";
const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

const server = new McpServer({
  name: "recruiter-mcp",
  version: "0.1.0",
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd);
}

async function authedFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const token = readToken();
  if (!token) {
    throw new Error("Not authenticated. Run the recruiter_auth tool first.");
  }

  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${token}`,
    },
  });
}

server.tool(
  "recruiter_auth",
  "Authenticate with GitHub to connect your identity",
  {},
  async () => {
    const initRes = await fetch(`${API_BASE}/auth/mcp/init`, {
      method: "POST",
    });

    if (!initRes.ok) {
      const error = await initRes.text();
      return {
        content: [{ type: "text" as const, text: `Auth init failed: ${error}` }],
      };
    }

    const { code, authUrl } = (await initRes.json()) as {
      code: string;
      authUrl: string;
    };

    openBrowser(authUrl);

    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);

      const pollRes = await fetch(
        `${API_BASE}/auth/mcp/poll?code=${code}`
      );
      const result = (await pollRes.json()) as {
        status: string;
        token?: string;
        username?: string;
      };

      if (result.status === "complete" && result.token) {
        writeToken(result.token);
        return {
          content: [
            {
              type: "text" as const,
              text: `Authenticated as ${result.username}`,
            },
          ],
        };
      }

      if (result.status === "expired") {
        return {
          content: [
            {
              type: "text" as const,
              text: "Auth code expired. Please try again.",
            },
          ],
        };
      }
    }

    return {
      content: [
        {
          type: "text" as const,
          text: "Authentication timed out. Please try again.",
        },
      ],
    };
  }
);

server.tool(
  "record_footprint",
  "Record a work footprint from local context",
  {
    summary: z.string().describe("Summary of the work performed"),
    tags: z.array(z.string()).optional().describe("Technology tags"),
    metadata: z
      .record(z.unknown())
      .optional()
      .describe("Context like repo name, branch, file paths"),
  },
  async ({ summary, tags, metadata }) => {
    const payload = {
      summary,
      tags: tags ?? [],
      source: "mcp" as const,
      metadata,
    };

    let response: Response;
    try {
      response = await authedFetch("/footprints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: "text" as const, text: msg }] };
    }

    if (!response.ok) {
      const error = await response.text();
      return {
        content: [{ type: "text" as const, text: `Failed: ${error}` }],
      };
    }

    const result = await response.json();
    return {
      content: [
        {
          type: "text" as const,
          text: `Footprint recorded: ${JSON.stringify(result, null, 2)}`,
        },
      ],
    };
  }
);

server.tool(
  "find_candidates",
  "Find developer candidates matching a project need. Describe the skills, technologies, or experience required and get ranked matches from recorded footprints.",
  {
    query: z
      .string()
      .describe(
        "Natural-language description of the project need or required skills"
      ),
    topK: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Number of candidates to return (default 10)"),
  },
  async ({ query, topK }) => {
    let response: Response;
    try {
      response = await authedFetch("/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, topK: topK ?? 10 }),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: "text" as const, text: msg }] };
    }

    if (!response.ok) {
      const error = await response.text();
      return {
        content: [{ type: "text" as const, text: `Failed: ${error}` }],
      };
    }

    const { results } = (await response.json()) as {
      results: Array<{
        userId: string;
        username: string;
        displayName: string | null;
        avatarUrl: string | null;
        githubUrl: string;
        score: number;
        footprints: Array<{
          summary: string;
          tags: string[];
          score: number;
        }>;
      }>;
    };

    if (results.length === 0) {
      return {
        content: [{ type: "text" as const, text: "No matching candidates found." }],
      };
    }

    const formatted = results
      .map((r, i) => {
        const header = `${i + 1}. ${r.displayName ?? r.username} (@${r.username}) [best score: ${r.score.toFixed(3)}]\n   ${r.githubUrl}`;
        const footprints = r.footprints
          .map(
            (f, j) =>
              `   ${j + 1}) [${f.score.toFixed(3)}] ${f.summary}\n      tags: ${f.tags.join(", ") || "none"}`
          )
          .join("\n");
        return `${header}\n${footprints}`;
      })
      .join("\n\n");

    return {
      content: [{ type: "text" as const, text: formatted }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
