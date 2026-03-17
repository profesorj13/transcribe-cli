import { AnimatePresence, motion } from "framer-motion";
import { Component, type ReactNode } from "react";
import { useAppStore } from "./stores/app";
import { Window } from "./components/layout/Window";
import { ErrorBanner } from "./components/layout/ErrorBanner";
import { HomeView } from "./components/home/HomeView";
import { RecordingView } from "./components/recording/RecordingView";
import { TranscribeView } from "./components/transcribe/TranscribeView";
import { SettingsSheet } from "./components/settings/SettingsSheet";

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(err: Error) {
    return { error: err.message };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
          <p className="text-[14px] font-semibold text-red-600">
            Algo salió mal
          </p>
          <p className="text-[12px] text-neutral-500 text-center max-w-[300px]">
            {this.state.error}
          </p>
          <button
            onClick={() => {
              this.setState({ error: null });
              useAppStore.getState().navigate("home");
            }}
            className="px-4 py-2 text-[13px] rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
          >
            Volver al inicio
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const currentView = useAppStore((s) => s.currentView);

  const renderView = () => {
    switch (currentView) {
      case "home":
        return <HomeView />;
      case "recording":
        return <RecordingView />;
      case "transcribe":
        return <TranscribeView />;
      case "settings":
        return <SettingsSheet />;
    }
  };

  return (
    <Window>
      <ErrorBanner />
      <ErrorBoundary>
        <AnimatePresence mode="wait">
          <motion.div
            key={currentView}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="h-full"
          >
            {renderView()}
          </motion.div>
        </AnimatePresence>
      </ErrorBoundary>
    </Window>
  );
}

export default App;
