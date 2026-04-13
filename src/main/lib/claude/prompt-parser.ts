/**
 * Parse @[agent:name], @[skill:name], and @[tool:servername] mentions from prompt text
 * Returns the cleaned prompt and lists of mentioned agents/skills/MCP servers
 *
 * File mention formats:
 * - @[file:local:relative/path] - file inside project (relative path)
 * - @[file:external:/absolute/path] - file outside project (absolute path)
 * - @[file:owner/repo:path] - legacy web format (repo:path)
 * - @[folder:local:path] or @[folder:external:path] - folder mentions
 */
export function parseMentions(prompt: string): {
  cleanedPrompt: string;
  agentMentions: string[];
  skillMentions: string[];
  fileMentions: string[];
  folderMentions: string[];
  toolMentions: string[];
} {
  const agentMentions: string[] = [];
  const skillMentions: string[] = [];
  const fileMentions: string[] = [];
  const folderMentions: string[] = [];
  const toolMentions: string[] = [];

  // Match @[prefix:name] pattern
  const mentionRegex = /@\[(file|folder|skill|agent|tool):([^\]]+)\]/g;
  let match;

  while ((match = mentionRegex.exec(prompt)) !== null) {
    const [, type, name] = match;
    switch (type) {
      case "agent":
        agentMentions.push(name);
        break;
      case "skill":
        skillMentions.push(name);
        break;
      case "file":
        fileMentions.push(name);
        break;
      case "folder":
        folderMentions.push(name);
        break;
      case "tool":
        // Validate: server name (alphanumeric, underscore, hyphen) or full tool id (mcp__server__tool)
        if (
          /^[a-zA-Z0-9_-]+$/.test(name) ||
          /^mcp__[a-zA-Z0-9_-]+__[a-zA-Z0-9_-]+$/.test(name)
        ) {
          toolMentions.push(name);
        }
        break;
    }
  }

  // Clean agent/skill/tool mentions from prompt (they will be added as context or hints)
  // Keep file/folder mentions as they are useful context
  let cleanedPrompt = prompt
    .replace(/@\[agent:[^\]]+\]/g, "")
    .replace(/@\[skill:[^\]]+\]/g, "")
    .replace(/@\[tool:[^\]]+\]/g, "")
    .trim();

  // Transform file mentions to readable paths for the agent
  // @[file:local:path] -> path (relative to project)
  // @[file:external:/abs/path] -> /abs/path (absolute)
  cleanedPrompt = cleanedPrompt
    .replace(/@\[file:local:([^\]]+)\]/g, "$1")
    .replace(/@\[file:external:([^\]]+)\]/g, "$1")
    .replace(/@\[folder:local:([^\]]+)\]/g, "$1")
    .replace(/@\[folder:external:([^\]]+)\]/g, "$1");

  // Add usage hints for mentioned MCP servers or individual tools
  // Names are already validated to contain only safe characters
  if (toolMentions.length > 0) {
    const toolHints = toolMentions
      .map((t) => {
        if (t.startsWith("mcp__")) {
          // Individual tool mention (from MCP widget): "Use the mcp__server__tool tool"
          return `Use the ${t} tool for this request.`;
        }
        // Server mention (from @ dropdown): "Use tools from the X MCP server"
        return `Use tools from the ${t} MCP server for this request.`;
      })
      .join(" ");
    cleanedPrompt = `${toolHints}\n\n${cleanedPrompt}`;
  }

  return {
    cleanedPrompt,
    agentMentions,
    skillMentions,
    fileMentions,
    folderMentions,
    toolMentions,
  };
}
