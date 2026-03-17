import { useEffect, useState } from "react";
import { X, FolderOpen } from "lucide-react";
import { motion } from "framer-motion";
import { useAppStore } from "../../stores/app";
import { S } from "../../lib/strings";
import { ApiKeyField } from "./ApiKeyField";
import { DependencyCheck } from "./DependencyCheck";
import { Select } from "../shared/Select";
import { Toggle } from "../shared/Toggle";
import type { AppConfig, DependencyStatus } from "../../types";
import * as tauri from "../../lib/tauri";

export function SettingsSheet() {
  const navigate = useAppStore((s) => s.navigate);
  const [config, setConfig] = useState<AppConfig>({});
  const [deps, setDeps] = useState<DependencyStatus[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([tauri.getConfig(), tauri.checkDependencies()])
      .then(([cfg, d]) => {
        setConfig(cfg);
        setDeps(d);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const saveField = (field: keyof AppConfig, value: unknown) => {
    const updated = { ...config, [field]: value };
    setConfig(updated);
    tauri.saveConfig(updated).catch(() => {});
  };

  if (!loaded) return null;

  const providerOptions = [
    { value: "elevenlabs", label: "ElevenLabs" },
    { value: "whisper", label: "Whisper (OpenAI)" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col gap-6 h-full"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-semibold text-neutral-900 dark:text-neutral-100">
          {S.settings}
        </h2>
        <button
          onClick={() => navigate("home")}
          className="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
        >
          <X size={16} className="text-neutral-500" />
        </button>
      </div>

      {/* API Keys */}
      <section>
        <h3 className="text-[11px] font-medium text-neutral-400 dark:text-neutral-600 uppercase tracking-wider mb-3">
          {S.apiKeys}
        </h3>
        <div className="space-y-3">
          <ApiKeyField
            label="ElevenLabs"
            value={config.elevenlabsApiKey}
            onChange={(v) => setConfig({ ...config, elevenlabsApiKey: v })}
            onSave={() => saveField("elevenlabsApiKey", config.elevenlabsApiKey)}
          />
          <ApiKeyField
            label="OpenAI (Whisper)"
            value={config.apiKey}
            onChange={(v) => setConfig({ ...config, apiKey: v })}
            onSave={() => saveField("apiKey", config.apiKey)}
          />
        </div>
      </section>

      {/* Preferences */}
      <section>
        <h3 className="text-[11px] font-medium text-neutral-400 dark:text-neutral-600 uppercase tracking-wider mb-3">
          {S.preferences}
        </h3>
        <div className="space-y-3">
          <Select
            label={S.defaultProvider}
            options={providerOptions}
            value={config.defaultProvider || "elevenlabs"}
            onChange={(v) => saveField("defaultProvider", v)}
          />
          <Select
            label={S.defaultLanguage}
            options={S.languages}
            value={config.defaultLanguage || "es"}
            onChange={(v) => saveField("defaultLanguage", v)}
          />
          <Toggle
            label={S.alwaysTimestamps}
            checked={config.includeTimestamps || false}
            onChange={(v) => saveField("includeTimestamps", v)}
          />
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[13px] text-neutral-700 dark:text-neutral-300">
                {S.outputFolder}
              </span>
              <p className="text-[11px] text-neutral-400 dark:text-neutral-600 mt-0.5">
                {config.outputDirectory || "~/Desktop"}
              </p>
            </div>
            <button
              onClick={async () => {
                const dir = await tauri.chooseDirectory();
                if (dir) saveField("outputDirectory", dir);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors cursor-pointer text-neutral-600 dark:text-neutral-400"
            >
              <FolderOpen size={14} />
              {S.change}
            </button>
          </div>
        </div>
      </section>

      {/* System */}
      <section>
        <h3 className="text-[11px] font-medium text-neutral-400 dark:text-neutral-600 uppercase tracking-wider mb-3">
          {S.system}
        </h3>
        <div className="space-y-1">
          {deps.map((dep) => (
            <DependencyCheck key={dep.name} dep={dep} />
          ))}
        </div>
      </section>
    </motion.div>
  );
}
