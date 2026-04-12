import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import matter from "gray-matter";

interface ChangelogEntry {
  title: string;
  date: string;
  version: string;
  body: string;
}

/**
 * Resolve the changelog directory relative to the current working directory.
 * In production the container sets WORKDIR=/app so changelog/ sits at /app/changelog.
 * In local dev (bun run dev) the cwd is services/1code-api/ so the path is ./changelog.
 * Override with CHANGELOG_DIR env var if needed.
 */
const CHANGELOG_DIR =
  process.env.CHANGELOG_DIR ?? resolve(process.cwd(), "changelog");

const MAX_PER_PAGE = 50;
const DEFAULT_PER_PAGE = 10;

async function loadEntries(): Promise<ChangelogEntry[]> {
  let files: string[];
  try {
    files = await readdir(CHANGELOG_DIR);
  } catch {
    return [];
  }

  const mdFiles = files.filter((f) => f.endsWith(".md"));
  const entries: ChangelogEntry[] = [];

  for (const file of mdFiles) {
    const raw = await readFile(join(CHANGELOG_DIR, file), "utf-8");
    const { data, content } = matter(raw);

    if (data.title && data.date && data.version) {
      entries.push({
        title: String(data.title),
        date: String(data.date),
        version: String(data.version),
        body: content.trim(),
      });
    }
  }

  // Sort by date descending
  entries.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  return entries;
}

export function registerChangelogRoute(server: FastifyInstance): void {
  server.get("/api/changelog/desktop", async (req, reply) => {
    const query = req.query as { per_page?: string };
    const perPage = Math.min(
      Math.max(
        1,
        Number.parseInt(query.per_page ?? String(DEFAULT_PER_PAGE), 10) ||
          DEFAULT_PER_PAGE,
      ),
      MAX_PER_PAGE,
    );

    const entries = await loadEntries();
    return reply.send(entries.slice(0, perPage));
  });
}
