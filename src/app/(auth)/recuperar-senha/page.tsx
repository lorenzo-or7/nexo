import type { Metadata } from "next";
import { ForgotForm } from "../auth-forms";

export const metadata: Metadata = { title: "Recuperar senha" };
export default function Page() {
  return <ForgotForm />;
}
