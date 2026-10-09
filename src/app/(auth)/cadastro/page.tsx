import type { Metadata } from "next";
import { SignUpForm } from "../auth-forms";

export const metadata: Metadata = { title: "Criar conta" };
export default function Page() {
  return <SignUpForm />;
}
