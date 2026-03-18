// migrate-testdb-auto.js
import mysql from "mysql2/promise";
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

// --- MySQL connection ---
// const mysqlConfig = {
//   host: process.env.MYSQL_HOST,
//   user: process.env.MYSQL_USER,
//   password: process.env.MYSQL_PASSWORD,
//   database: process.env.MYSQL_DB,
// };

const mysqlConfig = process.env.MYSQL_URL;

const mysqlUrl = new URL(process.env.MYSQL_URL);

const dbName = mysqlUrl.pathname.replace("/", "");

// --- PostgreSQL connection ---
const pgPool = new Pool({ connectionString: process.env.POSTGRES_URL });

// --- Get all tables ---
async function getTables(mysqlConn) {
  const [rows] = await mysqlConn.query("SHOW TABLES");
  const key = Object.keys(rows[0])[0];
  return rows.map((r) => r[key]);
}

// --- Get foreign key dependencies ---
async function getDependencies(mysqlConn) {
  const query = `
    SELECT TABLE_NAME, REFERENCED_TABLE_NAME
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE CONSTRAINT_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL
  `;
  // const [rows] = await mysqlConn.execute(query, [mysqlConfig.database]);
  const [rows] = await mysqlConn.execute(query, [dbName]);

  // Build dependency map: table -> set of tables it depends on
  const deps = {};
  for (const row of rows) {
    if (!deps[row.TABLE_NAME]) deps[row.TABLE_NAME] = new Set();
    deps[row.TABLE_NAME].add(row.REFERENCED_TABLE_NAME);
  }
  return deps;
}

// --- Topological sort to resolve FK order ---
function sortTables(tables, deps) {
  const sorted = [];
  const visited = new Set();

  function visit(table) {
    if (visited.has(table)) return;
    visited.add(table);

    const dependencies = deps[table] || new Set();
    for (const dep of dependencies) {
      visit(dep);
    }
    sorted.push(table);
  }

  for (const table of tables) {
    visit(table);
  }

  // Remove duplicates while preserving order
  return [...new Set(sorted)];
}

// --- Migrate a single table ---
async function migrateTable(mysqlConn, tableName) {
  console.log(`Migrating table: ${tableName}`);

  const [rows] = await mysqlConn.execute(`SELECT * FROM \`${tableName}\``);

  if (!rows.length) {
    console.log(`  No rows to migrate in ${tableName}`);
    return;
  }

  const columns = Object.keys(rows[0]);
  const colNames = columns.join(", ");
  const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(", ");

  const queryText = `INSERT INTO ${tableName}(${colNames}) VALUES(${placeholders})`;

  for (const row of rows) {
    const values = columns.map((col) => {
      let val = row[col];
      // Convert tinyint(1) to boolean if column starts with 'is_'
      if (
        typeof val === "number" &&
        (val === 0 || val === 1) &&
        col.toLowerCase().startsWith("is_")
      ) {
        return val === 1;
      }
      return val;
    });

    try {
      await pgPool.query(queryText, values);
    } catch (err) {
      console.error(`  ❌ Error inserting into ${tableName}:`, err.message);
    }
  }

  console.log(`  ✅ Migrated ${rows.length} rows from ${tableName}`);
}

// --- Main migration ---
async function migrateTestDB() {
  const mysqlConn = await mysql.createConnection(mysqlConfig);

  try {
    const tables = await getTables(mysqlConn);
    const deps = await getDependencies(mysqlConn);
    const sortedTables = sortTables(tables, deps);

    console.log("Tables will be migrated in this order:", sortedTables);

    for (const table of sortedTables) {
      await migrateTable(mysqlConn, table);
    }
  } catch (err) {
    console.error("Migration error:", err);
  } finally {
    await mysqlConn.end();
    await pgPool.end();
    console.log("Migration finished!");
  }
}

migrateTestDB();
