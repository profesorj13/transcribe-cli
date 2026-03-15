import { homedir } from "os";
import { join } from "path";
import type { TranscriptionProvider } from "../transcription/types.ts";

const CONFIG_DIR = join(homedir(), ".config", "transcribe-cli");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

interface Config {
  apiKey?: string;
  elevenlabsApiKey?: string;
}

async function readConfigFile(): Promise<Config> {
  try {
    const file = Bun.file(CONFIG_FILE);
    if (await file.exists()) {
      return await file.json();
    }
  } catch {
    // Config file doesn't exist or is invalid
  }
  return {};
}

async function writeConfigFile(config: Config): Promise<void> {
  await Bun.$`mkdir -p ${CONFIG_DIR}`;
  await Bun.write(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export async function resolveApiKey(
  provider: TranscriptionProvider,
  flagApiKey?: string
): Promise<string> {
  // 1. Flag --api-key
  if (flagApiKey) {
    return flagApiKey;
  }

  if (provider === "elevenlabs") {
    const envKey = process.env.ELEVENLABS_API_KEY;
    if (envKey) return envKey;

    const config = await readConfigFile();
    if (config.elevenlabsApiKey) return config.elevenlabsApiKey;

    throw new Error(
      "No ElevenLabs API key found. Provide one via:\n" +
        "  1. --api-key flag\n" +
        "  2. ELEVENLABS_API_KEY environment variable\n" +
        "  3. Run: trans config --set-key"
    );
  }

  // whisper
  const envKey = process.env.OPENAI_API_KEY;
  if (envKey) return envKey;

  const config = await readConfigFile();
  if (config.apiKey) return config.apiKey;

  throw new Error(
    "No OpenAI API key found. Provide one via:\n" +
      "  1. --api-key flag\n" +
      "  2. OPENAI_API_KEY environment variable\n" +
      "  3. Run: trans config --set-key --provider whisper"
  );
}

export async function setApiKey(
  provider: TranscriptionProvider,
  apiKey: string
): Promise<void> {
  const config = await readConfigFile();
  if (provider === "elevenlabs") {
    config.elevenlabsApiKey = apiKey;
  } else {
    config.apiKey = apiKey;
  }
  await writeConfigFile(config);
  console.log(`API key (${provider}) saved to ${CONFIG_FILE}`);
}

export async function getStoredApiKey(
  provider: TranscriptionProvider
): Promise<string | undefined> {
  const config = await readConfigFile();
  return provider === "elevenlabs" ? config.elevenlabsApiKey : config.apiKey;
}
