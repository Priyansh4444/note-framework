import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = "wrangler.public.jsonc";
const generated = ".wrangler/public-deploy.jsonc";
const databaseName = "note-framework-public-beta";

type Config = {
  main: string;
  assets: { directory: string };
  d1_databases: { database_id: string; migrations_dir: string }[];
};

/** The checked-in ID is a placeholder. Wrangler resolves paths from the config, one level down. */
export function deployConfig<T extends Config>(config: T, databaseId: string): T {
  return {
    ...config,
    main: join("..", config.main),
    assets: { ...config.assets, directory: join("..", config.assets.directory) },
    d1_databases: config.d1_databases.map((database) => ({
      ...database,
      database_id: databaseId,
      migrations_dir: join("..", database.migrations_dir),
    })),
  };
}

async function run(command: string[]) {
  const child = Bun.spawn(command, {
    cwd: root,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await child.exited) !== 0) throw new Error(`Public deploy stopped: ${command.join(" ")}`);
}

/** Looks the database up by name in the logged-in account, so no ID lives in the repository. */
async function databaseId() {
  const child = Bun.spawn(["bunx", "wrangler", "d1", "list", "--json"], {
    cwd: root,
    stdout: "pipe",
    stderr: "inherit",
  });
  const listed = await new Response(child.stdout).text();
  if ((await child.exited) !== 0) throw new Error("Could not list D1 databases.");
  const found = (JSON.parse(listed) as { name: string; uuid: string }[]).find(
    (database) => database.name === databaseName,
  );
  if (!found) throw new Error(`No D1 database named ${databaseName} in this account.`);
  return found.uuid;
}

if (import.meta.main) {
  const configuration = JSON.parse(readFileSync(resolve(root, source), "utf8"));
  if (
    configuration.name !== "note-framework-public" ||
    configuration.d1_databases[0].database_name !== databaseName
  )
    throw new Error("The public deploy command must target the separate public service.");
  await run(["bun", "run", "check:all"]);
  await run(["bun", "run", "test:components:vitest"]);
  await run(["bun", "run", "public:build"]);
  mkdirSync(resolve(root, ".wrangler"), { recursive: true });
  writeFileSync(
    resolve(root, generated),
    JSON.stringify(deployConfig(configuration, await databaseId()), null, 2),
  );
  const wrangler = ["bunx", "wrangler"];
  const d1 = [...wrangler, "d1"];
  const target = [databaseName, "--remote", "--config", generated];
  await run([...d1, "migrations", "apply", ...target]);
  await run([
    ...d1,
    "execute",
    ...target,
    "--command",
    "UPDATE public_settings SET enabled=1 WHERE id=1",
  ]);
  await run([...wrangler, "deploy", "--config", generated]);
}
