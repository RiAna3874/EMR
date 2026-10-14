// Who may change a signed note's text. Pended notes are the author's to edit
// freely (see saveNote); these rules are for notes that already carry a signature.
// Pure: shared by the notes page, the edit action and tests.

type EditableNote = { status: string; authorId: string; cosignerId: string | null; cosignedAt: Date | null };

// The author can edit their own signed note, including one still waiting on a cosign.
// The cosigning attending can edit it once they have cosigned.
export function canEditSigned(note: EditableNote, userId: string): boolean {
  if (note.status === "draft") return false;
  if (note.authorId === userId) return true;
  return note.cosignerId === userId && !!note.cosignedAt;
}

// The current version's signature: the last edit, or the original signing.
export function currentSignature(note: { authorId: string; signedAt: Date | null; createdAt: Date; editedById: string | null; editedAt: Date | null }) {
  return note.editedById && note.editedAt
    ? { signedById: note.editedById, signedAt: note.editedAt }
    : { signedById: note.authorId, signedAt: note.signedAt ?? note.createdAt };
}
