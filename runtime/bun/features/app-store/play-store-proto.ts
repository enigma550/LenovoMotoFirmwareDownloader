import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import protobuf from 'protobufjs';

const requireFromRuntime = createRequire(import.meta.url);

type ProtoRootName = 'googleplay' | 'checkin';

const PROTO_RELATIVE_PATHS: Record<ProtoRootName, string> = {
  checkin: 'checkin/checkin_merged.proto',
  googleplay: 'googleplay.proto',
};

const rootPromises = new Map<ProtoRootName, Promise<protobuf.Root>>();

function uniquePaths(paths: string[]) {
  return [...new Set(paths.map((candidate) => resolve(candidate)))];
}

function resolveWithRequire(relativePath: string) {
  try {
    return requireFromRuntime.resolve(`google-play-proto/${relativePath}`);
  } catch {
    return '';
  }
}

function getPackagedAppRootCandidates() {
  const execPath = process.execPath;
  const argv0 = process.argv[0] || execPath;

  return uniquePaths([
    process.cwd(),
    join(process.cwd(), '..', 'Resources', 'app'),
    join(dirname(execPath), '..', 'Resources', 'app'),
    join(dirname(argv0), '..', 'Resources', 'app'),
  ]);
}

function resolveProtoPath(rootName: ProtoRootName) {
  const relativePath = PROTO_RELATIVE_PATHS[rootName];
  const requireHit = resolveWithRequire(relativePath);
  if (requireHit && existsSync(requireHit)) {
    return requireHit;
  }

  const candidates = getPackagedAppRootCandidates().map((root) =>
    join(root, 'node_modules', 'google-play-proto', relativePath),
  );

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Could not locate google-play-proto/${relativePath}. Run bun install and rebuild the app.`,
  );
}

async function loadRoot(rootName: ProtoRootName) {
  let promise = rootPromises.get(rootName);
  if (!promise) {
    promise = protobuf.load(resolveProtoPath(rootName));
    rootPromises.set(rootName, promise);
  }
  return promise;
}

export async function getGooglePlayProtoType(typeName: string) {
  const root = await loadRoot('googleplay');
  return root.lookupType(typeName);
}

export async function getCheckinProtoType(typeName: string) {
  const root = await loadRoot('checkin');
  return root.lookupType(typeName);
}

export function toPlainObject(type: protobuf.Type, message: protobuf.Message<object>) {
  return type.toObject(message, {
    bytes: String,
    defaults: false,
    enums: String,
    longs: String,
  }) as Record<string, unknown>;
}
