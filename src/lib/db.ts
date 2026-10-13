import { Prisma, PrismaClient } from "@prisma/client";
import type { ITXClientDenyList } from "@prisma/client/runtime/library";
import { recordWrite } from "@/lib/audit/record";

// Reuse one client across hot reloads in dev.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// The plain client. Only the access log writes through it directly.
export const baseDb = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = baseDb;

// Every change made through `db` by a signed-in user lands in the access log
// (src/lib/audit). A failure to log is reported but doesn't undo the clinical change.
export const db = baseDb.$extends(
  Prisma.defineExtension({
    name: "access-log",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const result = await query(args);
          try {
            await recordWrite(baseDb, model, operation, args as Record<string, unknown>, result);
          } catch (e) {
            console.error(`Access log: couldn't record ${operation} on ${model}`, e);
          }
          return result;
        },
      },
    },
  }),
);

// The client inside db.$transaction(async (tx) => ...), for helpers that take one.
export type Tx = Omit<typeof db, ITXClientDenyList>;
