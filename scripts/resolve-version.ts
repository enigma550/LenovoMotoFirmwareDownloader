import { execSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";

function getCurrentVersion() {
  const configPath = join(process.cwd(), "electrobun.config.ts");
  try {
    const content = readFileSync(configPath, "utf8");
    const match = content.match(/version:\s*["']([^"']+)["']/);
    return match && match[1] ? match[1] : "0.0.1";
  } catch (e) {
    console.error(`Error reading config: ${e}`);
    return "0.0.1";
  }
}

const channel = process.argv[2] || "dev";
let version = getCurrentVersion();

console.error(
  `Starting version resolution for channel: ${channel}, base version: ${version}`,
);

function incrementVersion(v: string) {
  const parts = v.split(".");
  if (parts.length < 3) {
    return v + ".1";
  }
  const lastPart = parts[parts.length - 1];
  if (lastPart === undefined) {
    return v + ".1";
  }
  const last = parseInt(lastPart, 10);
  if (isNaN(last)) {
    return v + ".1";
  }
  parts[parts.length - 1] = (last + 1).toString();
  return parts.join(".");
}

// Get tags using multiple methods for reliability
let tags: Set<string> = new Set();

// Method 1: git ls-remote (Very reliable for remote tags, ignores shallow clone issues)
try {
  console.error("Fetching tags via git ls-remote --tags origin...");
  const lsRemote = execSync("git ls-remote --tags origin", {
    encoding: "utf8",
  });
  lsRemote.split("\n").forEach((line) => {
    // Format: [hash] refs/tags/[tagname] or refs/tags/[tagname]^{}
    const match = line.match(/refs\/tags\/([^\^ ]+)/);
    if (match && match[1]) {
      tags.add(match[1]);
    }
  });
  console.error(`Found ${tags.size} tags via git ls-remote`);
} catch (e) {
  console.error(`git ls-remote failed: ${e}`);
}

// Method 2: GitHub API (Fallback/Extra check)
try {
  const repo = process.env.GITHUB_REPOSITORY;
  if (repo) {
    console.error(`Fetching tags from GH API for repo: ${repo}`);
    const tagsJson = execSync(
      `gh api "repos/${repo}/tags?per_page=100" --jq '.[].name'`,
      { encoding: "utf8" },
    );
    tagsJson.split("\n").forEach((t) => {
      const trimmed = t.trim();
      if (trimmed) tags.add(trimmed);
    });
  }
} catch (e) {
  console.error(`gh api failed: ${e}`);
}

const tagList = Array.from(tags);
console.error(`Total unique tags found: ${tagList.length}`);
if (tagList.length > 0) {
  console.error(`Sample tags: ${tagList.slice(0, 5).join(", ")}`);
}

while (true) {
  const tagPrefix =
    channel === "stable" ? `v${version}` : `v${version}-${channel}`;

  // Check for exact match or prefix match with a dot (e.g. v0.0.1-canary.hash)
  const conflict = tagList.some((t) => {
    const isExact = t === tagPrefix;
    const isPrefix = t.startsWith(`${tagPrefix}.`);
    return isExact || isPrefix;
  });

  if (conflict) {
    const oldVersion = version;
    version = incrementVersion(version);
    console.error(
      `COLLISION DETECTED: A tag starting with ${tagPrefix} already exists. Incrementing ${oldVersion} -> ${version}`,
    );
  } else {
    console.error(
      `No conflict found for ${tagPrefix}. Using version ${version}`,
    );
    break;
  }
}

// Ensure ONLY the version is on stdout
process.stdout.write(version.trim());
