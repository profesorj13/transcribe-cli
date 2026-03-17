import { Mic, FileAudio, Settings } from "lucide-react";
import { useAppStore } from "../../stores/app";
import { S } from "../../lib/strings";
import { ActionCard } from "./ActionCard";
import { RecentList } from "./RecentList";

export function HomeView() {
  const navigate = useAppStore((s) => s.navigate);

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Action cards */}
      <div className="flex gap-3 pt-2">
        <ActionCard
          icon={<Mic size={32} />}
          title={S.record}
          description={S.recordDesc}
          onClick={() => navigate("recording")}
        />
        <ActionCard
          icon={<FileAudio size={32} />}
          title={S.transcribe}
          description={S.transcribeDesc}
          onClick={() => navigate("transcribe")}
        />
      </div>

      {/* Recent files */}
      <RecentList />

      {/* Settings button at bottom */}
      <div className="mt-auto flex justify-end">
        <button
          onClick={() => navigate("settings")}
          className="
            p-2 rounded-lg
            text-neutral-400 dark:text-neutral-600
            hover:text-neutral-600 dark:hover:text-neutral-400
            hover:bg-neutral-100 dark:hover:bg-neutral-800
            transition-colors duration-150
            cursor-pointer
          "
        >
          <Settings size={18} />
        </button>
      </div>
    </div>
  );
}
