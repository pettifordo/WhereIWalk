import { readFile } from "node:fs/promises";
import { getPool } from "../src/lib/db";

const sql = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
const pool = getPool();
await pool.query(sql);
console.log("Schema applied.");
await pool.end();
