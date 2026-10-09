import type { Metadata } from "next";
import { ResetForm } from "../../auth-forms";

export const metadata: Metadata = { title: "Nova senha" };
export default function Page() {
  return <ResetForm />;
}
