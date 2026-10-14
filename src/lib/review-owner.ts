// Who must acknowledge a result or an outside document in their Inbox: whoever
// ordered it, or, with no order (an imported outside report), the patient's PCP.
// When that person has left, or the patient has no PCP, the item goes to every
// clinician who reviews results, so nothing is filed without anyone seeing it.
export function reviewOwnerWhere(userId: string) {
  return [
    { order: { orderedById: userId } },
    { orderId: null, patient: { pcpId: userId } },
    { order: { orderedBy: { active: false } } },
    { orderId: null, patient: { OR: [{ pcpId: null }, { pcp: { active: false } }] } },
  ];
}

// The responsible clinician is someone else; shown to everyone because there's nobody else.
export const isUnassigned = (
  item: { order: { orderedById: string } | null; patient: { pcpId: string | null } },
  userId: string,
) => (item.order ? item.order.orderedById !== userId : item.patient.pcpId !== userId);
