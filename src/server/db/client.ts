import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

// One typed client per request; D1 itself pools connections.
export function database(binding: D1Database) {
  return drizzle(binding, { schema });
}
export type Database = ReturnType<typeof database>;
export { schema };
