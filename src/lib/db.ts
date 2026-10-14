import { AsyncLocalStorage } from "node:async_hooks";
import { Prisma, PrismaClient } from "@prisma/client";
import type { ITXClientDenyList } from "@prisma/client/runtime/library";
import { recordWrite, type AuditRow } from "@/lib/audit/record";
import { withoutEnteredInError } from "@/lib/entered-in-error";

// Reuse one client across hot reloads in dev.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// The plain client. Only the access log writes through it directly.
export const baseDb = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = baseDb;

// Log rows for changes made inside db.$transaction wait here until it commits, so a
// change that rolls back leaves no entry saying it happened.
const pendingLog = new AsyncLocalStorage<AuditRow[]>();

// Every change made through `db` by a signed-in user lands in the access log
// (src/lib/audit). A failure to log is reported but doesn't undo the clinical change.
const logged = baseDb.$extends(
  Prisma.defineExtension({
    name: "access-log",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const result = await query(withoutEnteredInError(model, operation, args) as typeof args);
          const pending = pendingLog.getStore();
          try {
            await recordWrite(baseDb, model, operation, args as Record<string, unknown>, result, pending && ((row) => void pending.push(row)));
          } catch (e) {
            console.error(`Access log: couldn't record ${operation} on ${model}`, e);
          }
          return result;
        },
      },
    },
  }),
);

async function writeLog(rows: AuditRow[]) {
  for (const data of rows) {
    try {
      await baseDb.auditEvent.create({ data });
    } catch (e) {
      console.error("Access log: couldn't record a change", e);
    }
  }
}

// `logged`, with $transaction holding its log rows until the commit and dropping them on a rollback.
export const db = new Proxy(logged, {
  get(target, prop) {
    if (prop !== "$transaction") {
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    }
    return async (...args: Parameters<typeof logged.$transaction>) => {
      if (pendingLog.getStore()) return (target.$transaction as (...a: unknown[]) => unknown)(...args);
      const rows: AuditRow[] = [];
      const result = await pendingLog.run(rows, () => (target.$transaction as (...a: unknown[]) => Promise<unknown>)(...args));
      await writeLog(rows);
      return result;
    };
  },
});

// The client inside db.$transaction(async (tx) => ...), for helpers that take one.
export type Tx = Omit<typeof db, ITXClientDenyList>;
