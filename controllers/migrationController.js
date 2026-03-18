import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let migrationStatus = "idle";
let migrationLogs = [];

const prismaSchema = path.join(__dirname, "../prisma/schema.prisma");
const prismaConfig = path.join(__dirname, "../prisma.config.ts");

const schemaBackup = path.join(__dirname, "../prisma/schema.backup.prisma");
const configBackup = path.join(__dirname, "../prisma.config.backup.ts");

function buildMysqlUrl(src) {
  if (src.port) {
    return `mysql://${src.user}:${src.password}@${src.host}:${src.port}/${src.database}`;
  } else {
    return `mysql://${src.user}:${src.password}@${src.host}/${src.database}`;
  }
}

function buildPgUrl(dest) {
  if (dest.port) {
    return `postgresql://${dest.user}:${dest.password}@${dest.host}:${dest.port}/${dest.database}`;
  } else {
    return `postgresql://${dest.user}:${dest.password}@${dest.host}/${dest.database}`;
  }
}

function updatePrismaConfig(url) {
  if (!fs.existsSync(prismaConfig)) return;

  let config = fs.readFileSync(prismaConfig, "utf8");

  config = config.replace(/url:\s*.*,/, `url: "${url}",`);

  fs.writeFileSync(prismaConfig, config);

  return config;
}

function runCommand(cmd, env = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, { shell: true, env: { ...process.env, ...env } });

    proc.stdout.on("data", (d) => {
      const log = d.toString();
      migrationLogs.push(log);
      console.log(log);
    });

    proc.stderr.on("data", (d) => {
      const log = d.toString();
      migrationLogs.push(log);
      console.error(log);
    });

    proc.on("close", (code) => {
      code === 0 ? resolve() : reject(new Error(`Command failed: ${cmd}`));
    });
  });
}

function backupFiles() {
  if (!fs.existsSync(schemaBackup)) fs.copyFileSync(prismaSchema, schemaBackup);

  if (!fs.existsSync(configBackup)) fs.copyFileSync(prismaConfig, configBackup);
}

function resetPrisma() {
  if (fs.existsSync(schemaBackup)) fs.copyFileSync(schemaBackup, prismaSchema);

  if (fs.existsSync(configBackup)) fs.copyFileSync(configBackup, prismaConfig);
}

export const startMigration = async (req, res) => {
  try {
    if (migrationStatus === "running") {
      return res.json({ message: "Migration already running" });
    }

    const { source, target } = req.body;

    const MYSQL_URL = buildMysqlUrl(source);
    const POSTGRES_URL = buildPgUrl(target);

    migrationStatus = "running";
    migrationLogs = [];

    backupFiles();

    (async () => {
      try {
        await runCommand("npx prisma db pull", { DATABASE_URL: MYSQL_URL });

        await runCommand("npx prisma generate", { DATABASE_URL: MYSQL_URL });

        // switch config to postgres BEFORE conversion
        const newConfig = updatePrismaConfig(POSTGRES_URL);

        console.log(
          fs.readFileSync(prismaConfig, "utf8"),
          "Updated prisma.config.ts",
        );

        await runCommand("node mysql_to_pg_converter.js", {
          POSTGRES_URL,
        });

        await runCommand("node migrate.js", {
          MYSQL_URL,
          POSTGRES_URL,
        });

        resetPrisma();

        migrationStatus = "completed";
      } catch (err) {
        migrationStatus = "failed";
        migrationLogs.push(err.message);
        console.error(err);
      }
    })();

    res.json({ message: "Migration started" });
  } catch (err) {
    migrationStatus = "failed";
    res.status(500).json({ message: "Migration failed" });
  }
};

export const getMigrationStatus = (req, res) => {
  res.json({
    status: migrationStatus,
    logs: migrationLogs.slice(-50),
  });
};

export const resetMigration = (req, res) => {
  try {
    resetPrisma();
    migrationStatus = "idle";
    migrationLogs = [];
    res.json({ message: "Prisma reset complete" });
  } catch (err) {
    res.status(500).json({ message: "Reset failed" });
  }
};
