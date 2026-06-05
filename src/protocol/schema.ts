import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { AnySchema, ErrorObject } from "ajv";
import { parse as parseYaml } from "yaml";
import { OpenAthorError } from "./errors.js";

const SCHEMA_BY_NAME = {
  openathor: "openathor.schema.json",
  "manuscript-index": "manuscript-index.schema.json",
  chapters: "chapters.schema.json",
  volumes: "volumes.schema.json",
  scenes: "scenes.schema.json",
} as const;

export type SchemaName = keyof typeof SCHEMA_BY_NAME;

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, "../..");

function schemaPath(schemaName: SchemaName): string {
  const filename = SCHEMA_BY_NAME[schemaName];
  return path.join(packageRoot, "schemas", filename);
}

export async function loadSchema(schemaName: SchemaName): Promise<AnySchema> {
  const text = await readFile(schemaPath(schemaName), "utf8");
  return JSON.parse(text) as AnySchema;
}

export async function validateSchema(
  schemaName: SchemaName,
  data: unknown,
  sourcePath?: string,
): Promise<void> {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const schema = await loadSchema(schemaName);
  const validate = ajv.compile(schema);

  if (!validate(data)) {
    const message = validate.errors
      ?.map((error: ErrorObject) => `${error.instancePath || "/"} ${error.message}`)
      .join("; ");

    throw new OpenAthorError(
      "OA_SCHEMA_INVALID",
      `Schema validation failed${sourcePath ? ` in ${sourcePath}` : ""}: ${message}`,
      { exitCode: 3 },
    );
  }
}

export async function readYamlFile(filePath: string): Promise<unknown> {
  let text: string;

  try {
    text = await readFile(filePath, "utf8");
  } catch (error) {
    throw new OpenAthorError(
      "OA_PROJECT_NOT_FOUND",
      `Cannot read ${filePath}: ${String(error)}`,
    );
  }

  try {
    return text.trim() ? parseYaml(text) : {};
  } catch (error) {
    throw new OpenAthorError(
      "OA_SCHEMA_INVALID",
      `Cannot parse YAML file ${filePath}: ${String(error)}`,
      { exitCode: 3 },
    );
  }
}
