import { execSync } from "child_process";

const channel = process.argv[2] || "dev";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

let version = "";
try {
  version = execSync(`bun scripts/resolve-version.ts ${channel}`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
} catch (error) {
  fail(`resolve-version execution failed for channel '${channel}': ${error}`);
}

if (!version) {
  fail(`resolve-version returned empty output for channel '${channel}'`);
}

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  fail(
    `resolve-version returned invalid version '${version}' for channel '${channel}'`,
  );
}

console.log(`Resolved version for ${channel}: ${version}`);
