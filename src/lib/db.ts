import pg from "pg";

// One pool per server instance. On Vercel, DATABASE_URL should be Neon's pooled
// connection string so many short-lived functions share a few connections.
declare global {
  // eslint-disable-next-line no-var
  var __wiwPool: pg.Pool | undefined;
}

export function getPool(): pg.Pool {
  if (!globalThis.__wiwPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);
    globalThis.__wiwPool = new pg.Pool({
      connectionString,
      max: 5,
      ssl: isLocal ? undefined : { rejectUnauthorized: true },
    });
  }
  return globalThis.__wiwPool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await getPool().query<T>(text, params);
  return res.rows;
}
