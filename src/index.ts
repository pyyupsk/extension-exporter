import archiver from "archiver"
import { createWriteStream } from "fs"
import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import * as readline from "readline/promises"

// Types
type BrowserConfig = {
  name: string
  paths: {
    windows?: string
    mac?: string
    linux?: string
  }
  extensionPath: string
  profilePatterns: string[]
}

type ExtensionInfo = {
  id: string
  name: string
  version: string
  description?: string
  manifest: ManifestV2 | ManifestV3
  folderPath: string
}

type ContentScript = {
  matches?: string[]
  exclude_matches?: string[]
  css?: string[]
  js?: string[]
  run_at?: string
}

type BrowserAction = {
  default_title?: string
  default_icon?: string | Record<string, string>
  default_popup?: string
}

type PageAction = {
  default_title?: string
  default_icon?: string | Record<string, string>
  default_popup?: string
}

type Action = {
  default_title?: string
  default_icon?: string | Record<string, string>
  default_popup?: string
}

type ManifestV2 = {
  manifest_version: 2
  name: string
  version: string
  description?: string
  permissions?: string[]
  content_scripts?: ContentScript[]
  background?: {
    scripts?: string[]
    page?: string
    persistent?: boolean
  }
  browser_action?: BrowserAction
  page_action?: PageAction
  options_page?: string
  web_accessible_resources?: string[]
  [key: string]: unknown
}

type ManifestV3 = {
  manifest_version: 3
  name: string
  version: string
  description?: string
  permissions?: string[]
  host_permissions?: string[]
  content_scripts?: ContentScript[]
  background?: {
    service_worker?: string
    scripts?: string[]
  }
  action?: Action
  options_page?: string
  web_accessible_resources?: Array<{
    resources: string[]
    matches: string[]
  }>
  [key: string]: unknown
}

// Browser configurations
const BROWSER_CONFIGS: Record<string, BrowserConfig> = {
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

class ExtensionExporter {
  private rl: readline.Interface

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })
  }

  async cleanup(): Promise<void> {
    this.rl.close()
  }

  private getCurrentPlatform(): "windows" | "mac" | "linux" {
    const platform = os.platform()
    switch (platform) {
      case "win32":
        return "windows"
      case "darwin":
        return "mac"
      case "linux":
        return "linux"
      default:
        throw new Error(`Unsupported platform: ${platform}`)
    }
  }

  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  private async isDirectory(filePath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(filePath)
      return stats.isDirectory()
    } catch {
      return false
    }
  }

  async getBrowserProfiles(browser: string): Promise<string[]> {
    const config = BROWSER_CONFIGS[browser]
    if (!config) {
      throw new Error(`Unsupported browser: ${browser}`)
    }

    const platform = this.getCurrentPlatform()
    const basePath = config.paths[platform]

    if (!basePath || !(await this.pathExists(basePath))) {
      return []
    }

    const profiles: string[] = []
    const items = await fs.readdir(basePath)

    for (const item of items) {
      const itemPath = path.join(basePath, item)
      if (await this.isDirectory(itemPath)) {
        // Check if item matches any profile pattern
        const matches = config.profilePatterns.some((pattern) => {
          if (pattern.includes("*")) {
            const regex = new RegExp(pattern.replace(/\*/g, ".*"))
            return regex.test(item)
          }
          return item === pattern
        })

        if (matches) {
          profiles.push(itemPath)
        }
      }
    }

    return profiles
  }

  private async getExtensionName(
    manifest: ManifestV2 | ManifestV3,
    extId: string,
    extDir: string,
  ): Promise<string> {
    const name = manifest.name || extId

    // Handle localized names
    if (typeof name === "string" && name.startsWith("__MSG_") && name.endsWith("__")) {
      const msgKey = name.slice(6, -2) // Remove __MSG_ and __
      const localesDir = path.join(extDir, "_locales")

      if (await this.pathExists(localesDir)) {
        // Try common locales
        const locales = ["en", "en_US", "en_GB"]

        for (const locale of locales) {
          const messagesPath = path.join(localesDir, locale, "messages.json")
          if (await this.pathExists(messagesPath)) {
            try {
              const messagesData = await fs.readFile(messagesPath, "utf-8")
              const messages = JSON.parse(messagesData)
              if (messages[msgKey]?.message) {
                return messages[msgKey].message
              }
            } catch (error) {
              console.warn(`Error reading locale file ${messagesPath}:`, error)
            }
          }
        }

        // Try any available locale
        try {
          const availableLocales = await fs.readdir(localesDir)
          if (availableLocales.length > 0 && availableLocales[0]) {
            const messagesPath = path.join(localesDir, availableLocales[0], "messages.json")
            if (await this.pathExists(messagesPath)) {
              const messagesData = await fs.readFile(messagesPath, "utf-8")
              const messages = JSON.parse(messagesData)
              if (messages[msgKey]?.message) {
                return messages[msgKey].message
              }
            }
          }
        } catch (error) {
          console.warn("Error reading available locales:", error)
        }
      }

      return `Unknown Extension (${extId})`
    }

    return name
  }

  async getExtensionsFromProfile(profilePath: string, browser: string): Promise<ExtensionInfo[]> {
    const config = BROWSER_CONFIGS[browser]
    if (!config) {
      throw new Error(`Unsupported browser: ${browser}`)
    }
    const extPath = path.join(profilePath, config.extensionPath)
    const extensions: ExtensionInfo[] = []

    console.log(`Looking for extensions in: ${extPath}`)

    if (!(await this.pathExists(extPath))) {
      console.log(`Extensions path '${extPath}' does not exist.`)
      return extensions
    }

    const items = await fs.readdir(extPath)

    for (const item of items) {
      const itemPath = path.join(extPath, item)

      if (!(await this.isDirectory(itemPath))) continue

      try {
        let manifestPath: string
        let extensionDir: string

        if (["chrome", "edge", "brave", "opera", "vivaldi"].includes(browser)) {
          // Chromium-based browsers store extensions as ext_id/version/manifest.json
          const versions = await fs.readdir(itemPath)
          const versionDirs = []

          for (const version of versions) {
            const versionPath = path.join(itemPath, version)
            if (await this.isDirectory(versionPath)) {
              versionDirs.push(version)
            }
          }

          if (versionDirs.length === 0) continue

          // Get the latest version (highest version number)
          const latestVersion = versionDirs.sort((a, b) => {
            const aNum = a.split(".").map((n) => parseInt(n) || 0)
            const bNum = b.split(".").map((n) => parseInt(n) || 0)
            for (let i = 0; i < Math.max(aNum.length, bNum.length); i++) {
              const diff = (bNum[i] || 0) - (aNum[i] || 0)
              if (diff !== 0) return diff
            }
            return 0
          })[0]

          if (!latestVersion) continue
          extensionDir = path.join(itemPath, latestVersion)
          manifestPath = path.join(extensionDir, "manifest.json")
        } else if (browser === "firefox") {
          // Firefox stores extensions directly in folders
          extensionDir = itemPath
          manifestPath = path.join(itemPath, "manifest.json")
        } else {
          continue
        }

        if (await this.pathExists(manifestPath)) {
          const manifestData = await fs.readFile(manifestPath, "utf-8")
          const manifest = JSON.parse(manifestData)
          const extName = await this.getExtensionName(manifest, item, extensionDir)

          extensions.push({
            id: item,
            name: extName,
            version: manifest.version || "1.0.0",
            description: manifest.description,
            manifest,
            folderPath: extensionDir,
          })
        }
      } catch (error) {
        console.warn(`Error processing extension ${item}:`, error)
      }
    }

    return extensions
  }

  private async copyDirectory(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true })
    const items = await fs.readdir(src)

    for (const item of items) {
      const srcPath = path.join(src, item)
      const destPath = path.join(dest, item)
      const stats = await fs.stat(srcPath)

      if (stats.isDirectory()) {
        await this.copyDirectory(srcPath, destPath)
      } else {
        await fs.copyFile(srcPath, destPath)
      }
    }
  }

  private async createZipArchive(sourceDir: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = createWriteStream(outputPath)
      const archive = archiver("zip", { zlib: { level: 9 } })

      output.on("close", resolve)
      archive.on("error", reject)

      archive.pipe(output)
      archive.directory(sourceDir, false)
      archive.finalize()
    })
  }

  async exportExtension(extension: ExtensionInfo, sourceBrowser: string): Promise<void> {
    const targetConfig = BROWSER_CONFIGS[sourceBrowser]
    if (!targetConfig) {
      throw new Error(`Unsupported target browser: ${sourceBrowser}`)
    }

    const safeName = extension.name.replace(/[^a-zA-Z0-9._\-\s]/g, "_").trim()
    const scriptDir = process.cwd()
    const browserOutputDir = path.join(scriptDir, "exported_extensions", sourceBrowser)

    await fs.mkdir(browserOutputDir, { recursive: true })

    try {
      const convertedManifest = extension.manifest

      if (sourceBrowser === "firefox") {
        const tempDir = path.join(browserOutputDir, `${safeName}_temp`)
        await fs.mkdir(tempDir, { recursive: true })

        await this.copyDirectory(extension.folderPath, tempDir)

        await fs.writeFile(
          path.join(tempDir, "manifest.json"),
          JSON.stringify(convertedManifest, null, 2),
          "utf-8",
        )

        const xpiPath = path.join(browserOutputDir, `${safeName}.xpi`)
        await this.createZipArchive(tempDir, xpiPath)

        const unpackedDir = path.join(browserOutputDir, `${safeName}_unpacked`)
        await this.copyDirectory(tempDir, unpackedDir)

        await fs.rm(tempDir, { recursive: true, force: true })

        console.log(`✅ Successfully converted '${extension.name}' to Firefox format.`)
        console.log(`📦 XPI file: ${xpiPath}`)
        console.log(`📁 Unpacked: ${unpackedDir}`)
      } else {
        const outputDir = path.join(browserOutputDir, safeName)
        await fs.mkdir(outputDir, { recursive: true })

        await this.copyDirectory(extension.folderPath, outputDir)

        await fs.writeFile(
          path.join(outputDir, "manifest.json"),
          JSON.stringify(convertedManifest, null, 2),
          "utf-8",
        )

        console.log(`✅ Successfully converted '${extension.name}' to ${targetConfig.name} format.`)
        console.log(`📁 Output: ${outputDir}`)
      }
    } catch (error) {
      console.error(`❌ Error converting '${extension.name}':`, error)
      throw error
    }
  }

  private async promptUser(question: string): Promise<string> {
    return await this.rl.question(question)
  }

  private async selectFromList<T>(
    items: T[],
    displayFn: (_item: T, _index: number) => string,
    prompt: string,
  ): Promise<T | T[]> {
    if (items.length === 0) {
      throw new Error("No items to select from")
    }

    console.log("=".repeat(50))
    items.forEach((item, index) => {
      console.log(`${index + 1}. ${displayFn(item, index)}`)
    })
    console.log("=".repeat(50))

    const response = await this.promptUser(
      `${prompt} (number, comma-separated numbers, or 'all'): `,
    )

    if (response.toLowerCase().trim() === "all") {
      return items
    }

    const selections = response
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s)
    const selectedItems: T[] = []

    for (const selection of selections) {
      const index = parseInt(selection) - 1
      if (index >= 0 && index < items.length) {
        const item = items[index]
        if (item !== undefined) {
          selectedItems.push(item)
        }
      } else {
        console.warn(`⚠️  Invalid selection: ${selection}`)
      }
    }

    if (selectedItems.length === 0) {
      throw new Error("No valid selections made")
    }

    return selectedItems.length === 1 ? (selectedItems[0] as T) : selectedItems
  }

  async run(): Promise<void> {
    try {
      console.log("=====================================")
      console.log("📦 Browser Extension Export Tool")
      console.log("=====================================")

      const supportedBrowsers = Object.keys(BROWSER_CONFIGS)
      const installedBrowsers = []

      // Check which browsers are installed
      for (const browser of supportedBrowsers) {
        const profiles = await this.getBrowserProfiles(browser)
        if (profiles.length > 0) {
          installedBrowsers.push(browser)
        }
      }

      if (installedBrowsers.length === 0) {
        console.log("❌ No supported browsers found installed on your system.")
        return
      }

      console.log("🌐 Installed browsers:", installedBrowsers.join(", "))

      // Select source browser
      const sourceBrowser = (await this.selectFromList(
        installedBrowsers,
        (browser) => {
          const config = BROWSER_CONFIGS[browser]
          if (!config) throw new Error(`Unsupported browser: ${browser}`)
          return config.name
        },
        "Select browser to export extensions from",
      )) as string

      // Get profiles for source browser
      const profiles = await this.getBrowserProfiles(sourceBrowser)
      const sourceConfig = BROWSER_CONFIGS[sourceBrowser]
      if (!sourceConfig) throw new Error(`Unsupported browser: ${sourceBrowser}`)

      if (profiles.length === 0) {
        console.log(`❌ No ${sourceConfig.name} profiles found.`)
        return
      }

      // Select profile
      const selectedProfile = (await this.selectFromList(
        profiles,
        (profile) => path.basename(profile),
        "Select profile to export extensions from",
      )) as string

      // Get extensions from profile
      console.log("🔍 Scanning for installed extensions...")
      const extensions = await this.getExtensionsFromProfile(selectedProfile, sourceBrowser)

      if (extensions.length === 0) {
        console.log(`❌ No extensions found in the selected ${sourceConfig.name} profile.`)
        return
      }

      // Select extensions to export
      const selectedExtensions = (await this.selectFromList(
        extensions,
        (ext) => `${ext.name} (v${ext.version})`,
        "Select extensions to export",
      )) as ExtensionInfo[]

      const extensionsArray = Array.isArray(selectedExtensions)
        ? selectedExtensions
        : [selectedExtensions]

      for (const extension of extensionsArray) {
        try {
          await this.exportExtension(extension, sourceBrowser)
        } catch (error) {
          console.error(`❌ Failed to convert ${extension.name}:`, error)
        }
      }

      console.log("✅ Extensions exported successfully!")
    } catch (error) {
      console.error("❌ An error occurred:", error)
    }
  }
}

// Main execution
async function main() {
  const exporter = new ExtensionExporter()

  try {
    await exporter.run()
  } catch (error) {
    console.error("Fatal error:", error)
    process.exit(1)
  } finally {
    await exporter.cleanup()
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main()
}

export { ExtensionExporter, BROWSER_CONFIGS }
