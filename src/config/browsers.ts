import os from "node:os"
import path from "node:path"

import type { BrowserConfig } from "../types"

export const BROWSER_CONFIGS: Record<string, BrowserConfig> = {
  chrome: {
    name: "Google Chrome",
    paths: {
      windows: path.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "User Data"),
      mac: path.join(os.homedir(), "Library", "Application Support", "Google", "Chrome"),
      linux: path.join(os.homedir(), ".config", "google-chrome"),
    },
    extensionPath: "Extensions",
    profilePatterns: ["Default", "Profile *"],
  },
  edge: {
    name: "Microsoft Edge",
    paths: {
      windows: path.join(os.homedir(), "AppData", "Local", "Microsoft", "Edge", "User Data"),
      mac: path.join(os.homedir(), "Library", "Application Support", "Microsoft Edge"),
      linux: path.join(os.homedir(), ".config", "microsoft-edge"),
    },
    extensionPath: "Extensions",
    profilePatterns: ["Default", "Profile *"],
  },
  firefox: {
    name: "Mozilla Firefox",
    paths: {
      windows: path.join(os.homedir(), "AppData", "Roaming", "Mozilla", "Firefox", "Profiles"),
      mac: path.join(os.homedir(), "Library", "Application Support", "Firefox", "Profiles"),
      linux: path.join(os.homedir(), ".mozilla", "firefox"),
    },
    extensionPath: "extensions",
    profilePatterns: ["*.default*", "default-*"],
  },
  brave: {
    name: "Brave Browser",
    paths: {
      windows: path.join(
        os.homedir(),
        "AppData",
        "Local",
        "BraveSoftware",
        "Brave-Browser",
        "User Data",
      ),
      mac: path.join(
        os.homedir(),
        "Library",
        "Application Support",
        "BraveSoftware",
        "Brave-Browser",
      ),
      linux: path.join(os.homedir(), ".config", "BraveSoftware", "Brave-Browser"),
    },
    extensionPath: "Extensions",
    profilePatterns: ["Default", "Profile *"],
  },
  opera: {
    name: "Opera",
    paths: {
      windows: path.join(os.homedir(), "AppData", "Roaming", "Opera Software", "Opera Stable"),
      mac: path.join(os.homedir(), "Library", "Application Support", "com.operasoftware.Opera"),
      linux: path.join(os.homedir(), ".config", "opera"),
    },
    extensionPath: "Extensions",
    profilePatterns: ["Default"],
  },
  vivaldi: {
    name: "Vivaldi",
    paths: {
      windows: path.join(os.homedir(), "AppData", "Local", "Vivaldi", "User Data"),
      mac: path.join(os.homedir(), "Library", "Application Support", "Vivaldi"),
      linux: path.join(os.homedir(), ".config", "vivaldi"),
    },
    extensionPath: "Extensions",
    profilePatterns: ["Default", "Profile *"],
  },
}
