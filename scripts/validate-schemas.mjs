import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";

const schemaDir = path.resolve("schemas");
const files = (await readdir(schemaDir))
  .filter((file) => file.endsWith(".schema.json"))
  .sort();
const ajv = new Ajv2020({ allErrors: true, strict: true });

for (const file of files) {
  const filePath = path.join(schemaDir, file);
  const schema = JSON.parse(await readFile(filePath, "utf8"));
  ajv.compile(schema);
  process.stdout.write(`valid ${path.relative(process.cwd(), filePath)}\n`);
}
