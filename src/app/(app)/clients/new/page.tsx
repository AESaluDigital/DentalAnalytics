import { requireAdmin } from "@/lib/auth";
import ClientForm from "@/components/ClientForm";

export default async function NewClientPage() {
  await requireAdmin();
  return (
    <div className="stack">
      <h1>Novo cliente</h1>
      <ClientForm />
    </div>
  );
}
