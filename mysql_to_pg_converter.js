import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const mysqlSchemaPath = path.join(__dirname, "prisma", "schema.prisma");
const pgSchemaPath = path.join(__dirname, "prisma", "schema.postgres.prisma");

// 1️⃣ Read MySQL schema
let schema = fs.readFileSync(mysqlSchemaPath, "utf-8");

// 2️⃣ Convert datasource to PostgreSQL
schema = schema
  .replace(/provider\s*=\s*"mysql"/, 'provider = "postgresql"')
  .replace(/url\s*=\s*env\("DATABASE_URL"\)/, 'url = env("POSTGRES_URL")');

// 3️⃣ Convert incompatible MySQL types to PostgreSQL
schema = schema
  .replace(/@db\.Blob/g, "@db.ByteA")
  .replace(/@db\.TinyInt/g, "@db.SmallInt")
  .replace(/@db\.MediumInt/g, "@db.Integer")
  .replace(/@db\.DateTime\(\d+\)/g, "")
  .replace(/@db\.Timestamp/g, "")
  .replace(/@db\.Double/g, "@db.Float8")
  .replace(/@db\.Decimal/g, "@db.Decimal")
  .replace(/@db\.LongText/g, "@db.Text")
  .replace(/@db\.MediumText/g, "@db.Text")
  .replace(/@db\.TinyText/g, "@db.VarChar(255)")
  .replace(/@db\.Char\((\d+)\)/g, "@db.Char($1)")
  .replace(/@db\.VarChar\((\d+)\)/g, "@db.VarChar($1)");

// 3.1️⃣ Fix MySQL unsigned types (PostgreSQL does not support them)
schema = schema
  .replace(/@db\.UnsignedInt/g, "")
  .replace(/@db\.UnsignedSmallInt/g, "@db.SmallInt");

// 4️⃣ Fix default boolean values
schema = schema.replace(/@default\((\d)\)/g, (m, p1) => {
  return p1 === "1" ? "@default(true)" : "@default(false)";
});

// 5️⃣ Fix enum default values (quote them) – skip Boolean fields
schema = schema.replace(/@default\(([^)]+)\)/g, (m, val, offset, string) => {
  const lineStart = string.lastIndexOf("\n", offset);
  const lineEnd = string.indexOf("\n", offset);
  const line = string.substring(lineStart, lineEnd > -1 ? lineEnd : undefined);

  if (/\bBoolean\b/.test(line)) return m;

  if (/^[A-Z0-9_]+$/i.test(val) && !val.includes('"') && !val.includes("'")) {
    return `@default("${val}")`;
  }

  return m;
});

// 6️⃣ Rename duplicate constraint names
let uniqueCounter = 1;
schema = schema.replace(/@unique\(map: "([^"]+)"\)/g, (_, name) => {
  return `@unique(map: "${name}_uniq_pg_${uniqueCounter++}")`;
});

let indexCounter = 1;
schema = schema.replace(
  /@@index\(\[([^\]]+)\], map: "([^"]+)"\)/g,
  (_, cols, name) => {
    return `@@index([${cols}], map: "${name}_idx_pg_${indexCounter++}")`;
  },
);

// 7️⃣ Remove MySQL-specific attributes
schema = schema.replace(/unsigned/g, "").replace(/zerofill/g, "");

// Fix MySQL timestamp precision artifacts
schema = schema
  .replace(/@default\(now\(\)\)\s*\(0\)/g, "@default(now())")
  .replace(/@default\(current_timestamp\(\)\)\s*\(0\)/g, "@default(now())");

// 7.1️⃣ Fix PostgreSQL constraint name length (max 63 chars)
schema = schema.replace(/map:\s*"([^"]+)"/g, (match, name) => {
  if (name.length > 63) {
    const short =
      name.substring(0, 40) + "_" + Math.random().toString(36).substring(2, 8);
    return `map: "${short}"`;
  }
  return match;
});

// 8️⃣ Save PostgreSQL schema
fs.writeFileSync(pgSchemaPath, schema, "utf-8");
console.log("✅ PostgreSQL schema generated: schema.postgres.prisma");

// 9️⃣ Push schema to PostgreSQL
try {
  execSync(`npx prisma db push --schema=${pgSchemaPath}`, { stdio: "inherit" });
  console.log("✅ PostgreSQL schema pushed successfully!");
} catch (err) {
  console.error("❌ Error pushing schema to PostgreSQL", err);
}
