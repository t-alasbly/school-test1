import { pendingMigrations } from "../../scripts/migration-plan.mjs";

export type DbSource = "mysql" | "pglite";

const rawDatabaseUrl =
  typeof process !== "undefined" ? process.env.DATABASE_URL : undefined;
const databaseUrl = rawDatabaseUrl?.trim() || undefined;
export const dbSource: DbSource = databaseUrl ? "mysql" : "pglite";

export interface Sql {
  <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>;
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ): Promise<T[]>;
}

type Run = <T>(text: string, params: unknown[]) => Promise<T[]>;
const OID_INT8 = 20;
const OID_DATE = 1082;
const OID_INTERVAL = 1186;
const identity = (value: string) => value;

const globalRef = globalThis as typeof globalThis & {
  __mysqlSqlPromise__?: Promise<Sql>;
  __pgliteInstance__?: Promise<import("@electric-sql/pglite").PGlite>;
  __pgliteMigrateChain__?: Promise<void>;
};

function toSql(run: Run): Sql {
  const sql = (async <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => {
    let text = strings[0] ?? "";
    for (let i = 0; i < values.length; i += 1)
      text += `$${i + 1}${strings[i + 1] ?? ""}`;
    return run<T>(text, values);
  }) as unknown as Sql;
  sql.query = <T = Record<string, unknown>>(
    text: string,
    params: unknown[] = []
  ) => run<T>(text, params);
  return sql;
}

function translateMysql(text: string, params: unknown[]) {
  const ordered: unknown[] = [];
  let sql = text
    .replace(/::(?:text|date|int|integer|jsonb|boolean)/gi, "")
    .replace(/\bILIKE\b/gi, "LIKE")
    .replace(/"([A-Za-z_][A-Za-z0-9_]*)"/g, "`$1`")
    .replace(/\btrue\b/gi, "1")
    .replace(/\bfalse\b/gi, "0");
  sql = sql.replace(/\$(\d+)/g, (_match, index) => {
    ordered.push(params[Number(index) - 1]);
    return "?";
  });
  sql = sql.replace(
    /on conflict \(school_id, student_id, day\)\s+do update set\s+kind = excluded\.kind, excused = excluded\.excused, details = excluded\.details, recorded_by = excluded\.recorded_by, arrived_at = excluded\.arrived_at/gi,
    "on duplicate key update kind = values(kind), excused = values(excused), details = values(details), recorded_by = values(recorded_by), arrived_at = values(arrived_at)"
  );
  sql = sql.replace(/\s+returning\s+[\w`, ]+/gi, "");
  sql = sql.replace(/\b(now\(\))::date\b/gi, "current_date");
  return { sql, ordered };
}

async function createMysqlSql(): Promise<Sql> {
  globalRef.__mysqlSqlPromise__ ??= (async () => {
    const { createPool } = await import("mysql2/promise");
    const pool = createPool({
      uri: databaseUrl,
      waitForConnections: true,
      connectionLimit: 5,
      multipleStatements: false,
    });
    return toSql(async <T>(text, params) => {
      const translated = translateMysql(text, params);
      const [rows] = await pool.query(translated.sql, translated.ordered);
      return (Array.isArray(rows) ? rows : []) as T[];
    });
  })().catch(error => {
    globalRef.__mysqlSqlPromise__ = undefined;
    throw error;
  });
  return globalRef.__mysqlSqlPromise__;
}

async function createPgliteSql(): Promise<Sql> {
  globalRef.__pgliteInstance__ ??= (async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const pg = new PGlite({
      parsers: {
        [OID_INT8]: Number,
        [OID_DATE]: identity,
        [OID_INTERVAL]: identity,
      },
    });
    await pg.waitReady;
    await pg.exec(
      "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())"
    );
    return pg;
  })().catch(error => {
    globalRef.__pgliteInstance__ = undefined;
    throw error;
  });
  const pg = await globalRef.__pgliteInstance__;
  const migrate = async () => {
    const migrations = import.meta.glob("/migrations/*.sql", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>;
    const doneRows = await pg.query<{ name: string }>(
      "select name from _migrations"
    );
    const done = doneRows.rows.map(row => row.name);
    for (const { name, path } of pendingMigrations(
      Object.keys(migrations),
      done
    )) {
      await pg.transaction(async tx => {
        await tx.exec(migrations[path]);
        await tx.query("insert into _migrations (name) values ($1)", [name]);
      });
    }
  };
  globalRef.__pgliteMigrateChain__ = (
    globalRef.__pgliteMigrateChain__ ?? Promise.resolve()
  )
    .catch(() => undefined)
    .then(migrate);
  await globalRef.__pgliteMigrateChain__;
  return toSql(
    async <T>(text, params) => (await pg.query<T>(text, params)).rows
  );
}

let sqlPromise: Promise<Sql> | null = null;
export function getSql(): Promise<Sql> {
  if (typeof window !== "undefined") throw new Error("@/lib/db is server-only");
  sqlPromise ??= (
    dbSource === "mysql" ? createMysqlSql() : createPgliteSql()
  ).catch(error => {
    sqlPromise = null;
    throw error;
  });
  return sqlPromise;
}

export function ensureDbReady(): Promise<void> {
  return dbSource === "pglite"
    ? getSql().then(() => undefined)
    : Promise.resolve();
}

export async function getPglite(): Promise<
  import("@electric-sql/pglite").PGlite
> {
  if (dbSource !== "pglite")
    throw new Error("getPglite is only available without DATABASE_URL");
  await getSql();
  const pg = await globalRef.__pgliteInstance__;
  if (!pg) throw new Error("PGlite instance failed to initialize");
  return pg;
}

const globalBoot = globalThis as typeof globalThis & {
  __pgBootstrapPromise__?: Promise<void>;
};
if (typeof window === "undefined" && dbSource === "pglite") {
  globalBoot.__pgBootstrapPromise__ ??= ensureDbReady().catch(error => {
    globalBoot.__pgBootstrapPromise__ = undefined;
    console.error("[db] PGLite bootstrap failed:", error);
    throw error;
  });
}
