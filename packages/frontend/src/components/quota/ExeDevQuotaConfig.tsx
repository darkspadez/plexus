import React from "react";
import { Input } from "../ui/Input";

export interface ExeDevQuotaConfigProps {
  options: Record<string, unknown>;
  onChange: (options: Record<string, unknown>) => void;
}

export const ExeDevQuotaConfig: React.FC<ExeDevQuotaConfigProps> = ({
  options,
  onChange,
}) => {
  const handleChange = (key: string, value: string) => {
    onChange({ ...options, [key]: value });
  };

  return (
    <div className="space-y-3">
      <Input
        label="API Key"
        value={(options.apiKey as string) ?? ""}
        onChange={(e) => handleChange("apiKey", e.target.value)}
        placeholder="Bearer token from exe.dev"
        hint={`Generate with: ssh exe.dev ssh-key generate-api-key --cmds "'billing credits'" --label "'Plexus Quota Checker'"`}
      />

      <Input
        label="Endpoint (optional)"
        value={(options.endpoint as string) ?? ""}
        onChange={(e) => handleChange("endpoint", e.target.value)}
        placeholder="https://exe.dev/exec"
      />
    </div>
  );
};
