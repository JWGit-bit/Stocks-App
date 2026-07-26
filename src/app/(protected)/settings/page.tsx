import { ApiKeysForm } from "@/components/ApiKeysForm";

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Settings</h1>
      <ApiKeysForm />
    </div>
  );
}
