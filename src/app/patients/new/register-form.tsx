"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, startTransition } from "react";
import { checkDuplicates, registerPatient, updatePatient, type DuplicateRow, type RegisterState } from "./actions";
import { DEFAULT_LANGUAGE, LANGUAGES, RELATIONSHIPS, SUBSCRIBER_RELATIONSHIPS } from "@/lib/registration/registration";
import { Button, inputCls } from "@/components/form";
import { Panel } from "@/components/panel";

type Option = { id: string; label: string };

const fmtIsoDob = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const strengthStyle = {
  exact: "bg-crit text-white",
  likely: "bg-crit-soft text-crit",
  possible: "bg-warn-soft text-warn",
};

// Registers a new patient, or, with patientId, corrects an existing patient's details.
export function RegisterForm({
  initial,
  pcps,
  pharmacies,
  returnTo,
  patientId,
}: {
  initial: Record<string, string>;
  pcps: Option[];
  pharmacies: Option[];
  returnTo?: string;
  patientId?: string;
}) {
  const editing = !!patientId;
  const [state, action, pending] = useActionState<RegisterState, FormData>(editing ? updatePatient.bind(null, patientId) : registerPatient, undefined);
  const [who, setWho] = useState({ firstName: initial.firstName ?? "", lastName: initial.lastName ?? "", dob: initial.dob ?? "" });
  const [live, setLive] = useState<DuplicateRow[] | null>(null);
  const [payer, setPayer] = useState(initial.insurancePayer ?? "");
  const [subscriber, setSubscriber] = useState(initial.subscriberRelation || "Self");

  // Check for existing patients as soon as name and date of birth are filled in.
  useEffect(() => {
    if (editing || !who.firstName.trim() || !who.lastName.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(who.dob)) {
      setLive(null);
      return;
    }
    let stale = false;
    const t = setTimeout(() => checkDuplicates(who.firstName, who.lastName, who.dob).then((rows) => !stale && setLive(rows)), 300);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [who, editing]);

  // What the save found wins over the live check until the name or DOB changes again.
  const [savedFor, setSavedFor] = useState("");
  const key = `${who.firstName}|${who.lastName}|${who.dob}`;
  const duplicates = state?.duplicates && savedFor === key ? state.duplicates : live;
  const err = state?.errors ?? {};

  const field = (name: string, label: string, input: React.ReactNode, className = "") => (
    <label className={`flex flex-col gap-0.5 ${className}`}>
      <span className="text-[11px] font-medium text-ink-3">{label}</span>
      {input}
      {err[name] && <span className="text-[11.5px] text-crit">{err[name]}</span>}
    </label>
  );
  const cls = (name: string, extra = "") => `${inputCls} ${err[name] ? "border-crit" : ""} ${extra}`;
  const text = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, className = "") =>
    field(name, label, <input name={name} defaultValue={initial[name]} {...props} className={cls(name, props.className)} />, className);

  return (
    <form
      onSubmit={(e) => {
        // Submitted by hand so React doesn't clear the form when the server sends it back with errors.
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        setSavedFor(key);
        startTransition(() => action(data));
      }}
      className={`grid grid-cols-1 items-start gap-4 ${editing ? "max-w-4xl" : "lg:grid-cols-[1fr_340px]"}`}
    >
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
      <input type="hidden" name="seenDuplicates" value={(duplicates ?? []).map((d) => d.id).join(",")} />
      <div className="space-y-3">
        <Panel title="Patient">
          <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-3">
            {field(
              "lastName",
              "Legal last name *",
              <input name="lastName" defaultValue={initial.lastName} autoFocus={!initial.lastName} className={cls("lastName")} onChange={(e) => setWho((w) => ({ ...w, lastName: e.target.value }))} />,
            )}
            {field(
              "firstName",
              "Legal first name *",
              <input name="firstName" defaultValue={initial.firstName} autoFocus={!!initial.lastName && !initial.firstName} className={cls("firstName")} onChange={(e) => setWho((w) => ({ ...w, firstName: e.target.value }))} />,
            )}
            {text("middleName", "Middle name")}
            {text("preferredName", "Preferred name", { placeholder: "If different" })}
            {field(
              "dob",
              "Date of birth *",
              <input type="date" name="dob" defaultValue={initial.dob} className={cls("dob")} onChange={(e) => setWho((w) => ({ ...w, dob: e.target.value }))} />,
            )}
            {field(
              "sex",
              "Legal sex *",
              <select name="sex" defaultValue={initial.sex ?? ""} className={cls("sex")}>
                <option value="" disabled>
                  Choose
                </option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">X / other</option>
                <option value="unknown">Unknown</option>
              </select>,
            )}
          </div>
        </Panel>

        <Panel title="Contact">
          <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-6">
            {text("phone", "Mobile or phone", { type: "tel", placeholder: "01712-345678" }, "sm:col-span-2")}
            {text("email", "Email", { type: "email" }, "sm:col-span-2")}
            {field(
              "preferredLanguage",
              "Preferred language",
              <select name="preferredLanguage" defaultValue={initial.preferredLanguage || DEFAULT_LANGUAGE} className={cls("preferredLanguage")}>
                {LANGUAGES.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>,
              "sm:col-span-2",
            )}
            {text("street", "Address (house, road, area or village)", { placeholder: "House 12, Road 5, Dhanmondi" }, "sm:col-span-6")}
            {text("city", "District / city", { placeholder: "Dhaka" }, "sm:col-span-3")}
            {text("postcode", "Postcode", { inputMode: "numeric", maxLength: 4, placeholder: "1205" }, "sm:col-span-1")}
          </div>
        </Panel>

        <Panel title="Emergency contact">
          <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-3">
            {text("emergencyContactName", "Name")}
            {field(
              "emergencyContactRelation",
              "Relationship",
              <select name="emergencyContactRelation" defaultValue={initial.emergencyContactRelation ?? ""} className={cls("emergencyContactRelation")}>
                <option value="">—</option>
                {RELATIONSHIPS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>,
            )}
            {text("emergencyContactPhone", "Phone", { type: "tel", placeholder: "01712-345678" })}
          </div>
        </Panel>

        <Panel title="Care team">
          <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2">
            {field(
              "pcpId",
              "Primary care physician",
              <select name="pcpId" defaultValue={initial.pcpId ?? ""} className={cls("pcpId")}>
                <option value="">None yet</option>
                {pcps.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>,
            )}
            {field(
              "preferredPharmacyId",
              "Preferred pharmacy",
              <select name="preferredPharmacyId" defaultValue={initial.preferredPharmacyId ?? ""} className={cls("preferredPharmacyId")}>
                <option value="">None yet</option>
                {pharmacies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>,
            )}
          </div>
        </Panel>

        <Panel title="Coverage">
          <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-3">
            {text("insurancePayer", "Insurance plan (blank for self-pay)", { onChange: (e) => setPayer(e.target.value.trim()) })}
            {text("insuranceMemberId", "Member ID", { className: "font-mono uppercase" })}
            {text("insuranceGroup", "Group number", { className: "font-mono uppercase" })}
            {payer && (
              <>
                {field(
                  "subscriberRelation",
                  "Policy holder is",
                  <select name="subscriberRelation" value={subscriber} onChange={(e) => setSubscriber(e.target.value)} className={cls("subscriberRelation")}>
                    {SUBSCRIBER_RELATIONSHIPS.map((r) => (
                      <option key={r} value={r}>
                        {r === "Self" ? "The patient" : `Patient's ${r.toLowerCase()}`}
                      </option>
                    ))}
                  </select>,
                )}
                {subscriber !== "Self" && text("subscriberName", "Policy holder's name", {}, "sm:col-span-2")}
              </>
            )}
          </div>
        </Panel>
      </div>

      <div className="space-y-3 lg:sticky lg:top-0">
        {!editing && (
          <Panel title="Duplicate check">
            {duplicates === null ? (
              <p className="px-3 py-3 text-ink-3">Enter the legal name and date of birth to check for an existing record.</p>
            ) : duplicates.length === 0 ? (
              <p className="px-3 py-3 text-ok">No existing patient matches this name and date of birth.</p>
            ) : (
              <>
                <p className="border-b border-line px-3 py-2 text-ink-2">
                  {duplicates.length === 1 ? "This patient may already be registered:" : `${duplicates.length} existing patients may be the same person:`}
                </p>
                <ul>
                  {duplicates.map((d) => (
                    <li key={d.id} className="border-t border-line px-3 py-2 first:border-t-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold">{d.name}</div>
                          <div className="tabular text-ink-2">
                            {fmtIsoDob(d.dob)} · <span className="capitalize">{d.sex}</span> · <span className="font-mono">{d.mrn}</span>
                          </div>
                          {(d.phone || d.address) && <div className="text-[12px] text-ink-3">{[d.phone, d.address].filter(Boolean).join(" · ")}</div>}
                        </div>
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium capitalize ${strengthStyle[d.strength]}`}>{d.strength}</span>
                      </div>
                      <div className="mt-0.5 text-[12px] text-ink-2">{d.reason}</div>
                      <div className="mt-1 flex gap-3 text-[12px]">
                        <Link href={`/patients/${d.id}`} className="text-accent hover:underline">
                          Open chart
                        </Link>
                        <Link href={`/schedule/book?patient=${d.id}`} className="text-accent hover:underline">
                          Make appointment
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
                <label className="flex items-start gap-2 border-t border-line bg-warn-soft px-3 py-2 text-warn">
                  <input type="checkbox" name="notDuplicate" className="mt-0.5" />
                  <span>I checked these records. None of them is this patient; create a new record.</span>
                </label>
              </>
            )}
          </Panel>
        )}

        <div className="rounded-md border border-line bg-panel p-3">
          <p className="mb-2 text-[12px] text-ink-3">
            {editing
              ? "Changes are recorded in the access log with who made them. The medical record number stays the same."
              : "A new medical record number is assigned when you register. Allergies, medications and history are taken at the first visit."}
          </p>
          {state?.error && (
            <p role="alert" className="mb-2 text-crit">
              {state.error}
            </p>
          )}
          <Button type="submit" disabled={pending} className="w-full py-1.5">
            {editing ? (pending ? "Saving…" : "Save changes") : pending ? "Registering…" : returnTo === "book" ? "Register and make appointment" : "Register patient"}
          </Button>
        </div>
      </div>
    </form>
  );
}
