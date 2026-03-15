import { homedir } from "os";
import { join } from "path";

const CONFIG_DIR = join(homedir(), ".config", "transcribe-cli");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

interface Config {
  apiKey?: string;
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

export async function resolveApiKey(flagApiKey?: string): Promise<string> {
  // 1. Flag --api-key
  if (flagApiKey) {
    return flagApiKey;
  }

  // 2. Environment variable
  const envKey = process.env.OPENAI_API_KEY;
  if (envKey) {
    return envKey;
  }

  // 3. Config file
  const config = await readConfigFile();
  if (config.apiKey) {
    return config.apiKey;
  }

  throw new Error(
    "No API key found. Provide one via:\n" +
      "  1. --api-key flag\n" +
      "  2. OPENAI_API_KEY environment variable\n" +
      "  3. Run: transcribe config --set-key"
  );
}

export async function setApiKey(apiKey: string): Promise<void> {
  const config = await readConfigFile();
  config.apiKey = apiKey;
  await writeConfigFile(config);
  console.log(`API key saved to ${CONFIG_FILE}`);
}

export async function getStoredApiKey(): Promise<string | undefined> {
  const config = await readConfigFile();
  return config.apiKey;
}
