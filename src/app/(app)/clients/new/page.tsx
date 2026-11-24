import { requirePermission } from "@/lib/auth";
import ClientForm from "@/components/ClientForm";
import { accountSuggestions } from "@/lib/suggestions";

export default async function NewClientPage() {
  await requirePermission("manage_clients");
  const suggestions = await accountSuggestions();
  return (
    <div className="stack">
      <h1>Novo cliente</h1>
      <ClientForm suggestions={suggestions} />
    </div>
  );
}
