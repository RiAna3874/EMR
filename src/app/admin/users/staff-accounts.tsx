"use client";

import { useActionState, useState } from "react";
import type { Role } from "@prisma/client";
import { Button, Field, inputCls } from "@/components/form";
import { roleLabel } from "@/lib/roles";
import { addAccount, manageAccount, type AdminState } from "./actions";

type Account = { id: string; name: string; credentials: string | null; registrationNumber: string | null; role: Role; username: string; isAdmin: boolean; active: boolean; mustChangePassword: boolean; twoStep: boolean };

const roles = Object.entries(roleLabel) as [Role, string][];

export function StaffAccounts({ accounts, meId }: { accounts: Account[]; meId: string }) {
  const [added, add, adding] = useActionState(addAccount, undefined);
  const [managed, manage, managing] = useActionState(manageAccount, undefined);
  const [editing, setEditing] = useState<string | null>(null);
  // Show whichever action ran last.
  const [last, setLast] = useState<"add" | "manage">("add");
  const result = last === "add" ? added : managed;

  return (
    <div className="space-y-4">
      <Result state={result} />

      <form action={(f) => (setLast("add"), add(f))} className="rounded-md border border-line bg-panel p-4">
        <h2 className="mb-2 text-[13.5px] font-semibold">Add a staff member</h2>
        <div className="grid grid-cols-[1fr_6rem_8rem_9rem_10rem_auto] items-end gap-2">
          <Field label="Full name">
            <input name="name" required className={inputCls} />
          </Field>
          <Field label="Credentials">
            <input name="credentials" placeholder="MD, RN…" className={inputCls} />
          </Field>
          <Field label="Registration no.">
            <input name="registrationNumber" placeholder="BMDC A-12345" className={inputCls} />
          </Field>
          <Field label="Role">
            <select name="role" defaultValue="nurse" className={inputCls}>
              {roles.map(([r, label]) => (
                <option key={r} value={r}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Username">
            <input name="username" required autoComplete="off" placeholder="e.g. jsmith" className={inputCls} />
          </Field>
          <Button type="submit" disabled={adding}>
            {adding ? "Adding…" : "Add"}
          </Button>
        </div>
        <label className="mt-2 flex items-center gap-1.5 text-[12.5px] text-ink-2">
          <input type="checkbox" name="isAdmin" /> Administrator (can manage staff accounts)
        </label>
      </form>

      <table className="w-full overflow-hidden rounded-md border border-line bg-panel text-[13px]">
        <thead className="bg-panel-muted text-left text-[11.5px] text-ink-3">
          <tr>
            <th className="px-3 py-1.5 font-medium">Name</th>
            <th className="px-3 py-1.5 font-medium">Username</th>
            <th className="px-3 py-1.5 font-medium">Role</th>
            <th className="px-3 py-1.5 font-medium">Status</th>
            <th className="px-3 py-1.5 font-medium">Two-step</th>
            <th className="px-3 py-1.5" />
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => {
            const self = a.id === meId;
            const op = (name: string, label: string, variant: "secondary" | "danger" = "secondary") => (
              <form action={(f) => (setLast("manage"), manage(f))} className="inline">
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="op" value={name} />
                <Button type="submit" variant={variant} disabled={managing} className="ml-1">
                  {label}
                </Button>
              </form>
            );
            return editing === a.id ? (
              <tr key={a.id} className="border-t border-line bg-accent-soft/40">
                <td colSpan={6} className="px-3 py-2">
                  <form
                    action={(f) => {
                      setLast("manage");
                      setEditing(null);
                      manage(f);
                    }}
                    className="flex items-end gap-2"
                  >
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="op" value="edit" />
                    <Field label="Full name" className="flex-1">
                      <input name="name" defaultValue={a.name} required className={inputCls} />
                    </Field>
                    <Field label="Credentials" className="w-24">
                      <input name="credentials" defaultValue={a.credentials ?? ""} className={inputCls} />
                    </Field>
                    <Field label="Registration no." className="w-36">
                      <input name="registrationNumber" defaultValue={a.registrationNumber ?? ""} className={inputCls} />
                    </Field>
                    <Field label="Role">
                      <select name="role" defaultValue={a.role} className={inputCls}>
                        {roles.map(([r, label]) => (
                          <option key={r} value={r}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Button type="submit">Save</Button>
                    <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={a.id} className={`border-t border-line ${a.active ? "" : "text-ink-3"}`}>
                <td className="px-3 py-1.5">
                  {a.credentials ? `${a.name}, ${a.credentials}` : a.name}
                  {self && <span className="ml-1 text-[11.5px] text-ink-3">(you)</span>}
                </td>
                <td className="px-3 py-1.5 font-mono text-[12.5px]">{a.username}</td>
                <td className="px-3 py-1.5">
                  {roleLabel[a.role]}
                  {a.isAdmin && <span className="ml-1.5 rounded bg-accent-soft px-1.5 text-[11px] font-medium text-accent">Admin</span>}
                </td>
                <td className="px-3 py-1.5 text-[12px]">
                  {!a.active ? "Deactivated" : a.mustChangePassword ? <span className="text-warn">Temporary password</span> : "Active"}
                </td>
                <td className="px-3 py-1.5 text-[12px]">{a.twoStep ? "On" : <span className="text-ink-3">Not set up</span>}</td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right">
                  <Button type="button" variant="ghost" onClick={() => setEditing(a.id)}>
                    Edit
                  </Button>
                  {a.active && op("resetPassword", "Reset password")}
                  {a.active && a.twoStep && !self && op("resetTwoStep", "Reset two-step")}
                  {!self && a.active && op(a.isAdmin ? "removeAdmin" : "makeAdmin", a.isAdmin ? "Remove admin" : "Make admin")}
                  {!self && (a.active ? op("deactivate", "Deactivate", "danger") : op("reactivate", "Reactivate"))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Result({ state }: { state: AdminState }) {
  if (!state) return null;
  if (state.error)
    return (
      <p role="alert" className="rounded-md bg-crit-soft px-3 py-2 text-crit">
        {state.error}
      </p>
    );
  return (
    <div role="status" className="rounded-md border border-accent/30 bg-accent-soft px-3 py-2 text-accent">
      <p>{state.ok}</p>
      {state.temp && (
        <p className="mt-1 text-ink">
          Temporary password for <span className="font-mono">{state.temp.username}</span>:{" "}
          <span className="select-all rounded bg-panel px-1.5 py-0.5 font-mono font-semibold">{state.temp.password}</span>
          <span className="ml-2 text-[12px] text-ink-2">Give it to them in person or by phone. It is shown only once; they choose their own at first sign-in.</span>
        </p>
      )}
    </div>
  );
}
