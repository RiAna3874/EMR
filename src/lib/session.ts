// Authentication is not wired up yet; every request acts as this physician.
export const currentUser = {
  id: "prac_chen",
  name: "Dana Chen",
  credentials: "MD",
  role: "physician" as const,
};
