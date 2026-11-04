import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { deployConfig } from "./public-deploy";

test("the generated deploy config swaps the placeholder ID and rebases every path", () => {
  const source = JSON.parse(readFileSync("wrangler.public.jsonc", "utf8"));
  const config = deployConfig(source, "real-id");
  expect(source.d1_databases[0].database_id).toMatch(/^0+-/);
  expect(config.d1_databases[0].database_id).toBe("real-id");
  expect(config.main).toBe("../sharing/public-worker.ts");
  expect(config.assets.directory).toBe("../dist-framework-public");
  expect(config.d1_databases[0].migrations_dir).toBe("../sharing/migrations");
  expect(config.name).toBe("note-framework-public");
  expect(config.vars).toEqual(source.vars);
  expect(config.triggers).toEqual(source.triggers);
});
