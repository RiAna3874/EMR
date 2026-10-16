import { PhoneIn } from "@/components/phone/skeleton";

// Re-created on every navigation here, so each screen fades in as it opens.
export default function Template({ children }: { children: React.ReactNode }) {
  return <PhoneIn>{children}</PhoneIn>;
}
