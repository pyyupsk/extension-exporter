import { intro, select, spinner, isCancel, cancel, log } from "@clack/prompts"
import archiver from "archiver"
import chalk from "chalk"
import { glob } from "glob"
import { createWriteStream } from "node:fs"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import pLimit from "p-limit"
import { z } from "zod"

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

const ExtensionInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  manifest: z.union([
    z.object({
      manifest_version: z.literal(2),
      name: z.string(),
      version: z.string(),
      description: z.string().optional(),
      permissions: z.array(z.string()).optional(),
      content_scripts: z
        .array(
          z.object({
            matches: z.array(z.string()).optional(),
            exclude_matches: z.array(z.string()).optional(),
            css: z.array(z.string()).optional(),
            js: z.array(z.string()).optional(),
            run_at: z.string().optional(),
          }),
        )
        .optional(),
      background: z
        .object({
          scripts: z.array(z.string()).optional(),
          page: z.string().optional(),
          persistent: z.boolean().optional(),
        })
        .optional(),
      browser_action: z
        .object({
          default_title: z.string().optional(),
          default_icon: z.union([z.string(), z.record(z.string())]).optional(),
          default_popup: z.string().optional(),
        })
        .optional(),
      page_action: z
        .object({
          default_title: z.string().optional(),
          default_icon: z.union([z.string(), z.record(z.string())]).optional(),
          default_popup: z.string().optional(),
        })
        .optional(),
      options_page: z.string().optional(),
      web_accessible_resources: z.array(z.string()).optional(),
    }),
    z.object({
      manifest_version: z.literal(3),
      name: z.string(),
      version: z.string(),
      description: z.string().optional(),
      permissions: z.array(z.string()).optional(),
      host_permissions: z.array(z.string()).optional(),
      content_scripts: z
        .array(
          z.object({
            matches: z.array(z.string()).optional(),
            exclude_matches: z.array(z.string()).optional(),
            css: z.array(z.string()).optional(),
            js: z.array(z.string()).optional(),
            run_at: z.string().optional(),
          }),
        )
        .optional(),
      background: z
        .object({
          service_worker: z.string().optional(),
          scripts: z.array(z.string()).optional(),
        })
        .optional(),
      action: z
        .object({
          default_title: z.string().optional(),
          default_icon: z.union([z.string(), z.record(z.string())]).optional(),
          default_popup: z.string().optional(),
        })
        .optional(),
      options_page: z.string().optional(),
      web_accessible_resources: z
        .array(
          z.object({
            resources: z.array(z.string()),
            matches: z.array(z.string()),
          }),
        )
        .optional(),
    }),
  ]),
  folderPath: z.string(),
})

class ExtensionExporter {
  private limit = pLimit(5) // Limit concurrent operations

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

    // Use Promise.all with pLimit for concurrent processing
    await Promise.all(
      items.map((item) =>
        this.limit(async () => {
          const itemPath = path.join(basePath, item)
          if (await this.isDirectory(itemPath)) {
            // Use glob for pattern matching
            const matches = config.profilePatterns.some((pattern) => {
              return glob.sync(pattern, { cwd: basePath }).includes(item)
            })

            if (matches) {
              profiles.push(itemPath)
            }
          }
        }),
      ),
    )

    return profiles
  }

  private async getExtensionName(
    manifest: ManifestV2 | ManifestV3,
    extId: string,
    extDir: string,
  ): Promise<string> {
    const name = manifest.name || extId

    if (typeof name === "string" && name.startsWith("__MSG_") && name.endsWith("__")) {
      const msgKey = name.slice(6, -2)
      const localesDir = path.join(extDir, "_locales")

      if (await this.pathExists(localesDir)) {
        const locales = await fs.readdir(localesDir)

        // Use Promise.all with pLimit for concurrent locale checking
        const results = await Promise.all(
          locales.map((locale) =>
            this.limit(async () => {
              const messagesPath = path.join(localesDir, locale, "messages.json")
              if (await this.pathExists(messagesPath)) {
                try {
                  const messagesData = await fs.readFile(messagesPath, "utf-8")
                  const messages = JSON.parse(messagesData)
                  return messages[msgKey]?.message
                } catch (error) {
                  log.warn(`Error reading locale file ${messagesPath}: ${error}`)
                }
              }
              return null
            }),
          ),
        )

        const foundName = results.find(Boolean)
        if (foundName) return foundName

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
          log.warn(`Error reading available locales: ${error}`)
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

    if (!(await this.pathExists(extPath))) {
      log.warn(`Extensions path '${extPath}' does not exist.`)
      return extensions
    }

    const items = await fs.readdir(extPath)

    // Use Promise.all with pLimit for concurrent extension processing
    const results = await Promise.all(
      items.map((item) =>
        this.limit(async () => {
          const itemPath = path.join(extPath, item)

          if (!(await this.isDirectory(itemPath))) return null

          try {
            let manifestPath: string
            let extensionDir: string

            if (["chrome", "edge", "brave", "opera", "vivaldi"].includes(browser)) {
              const versions = await fs.readdir(itemPath)
              const versionDirs = []

              for (const version of versions) {
                const versionPath = path.join(itemPath, version)
                if (await this.isDirectory(versionPath)) {
                  versionDirs.push(version)
                }
              }

              if (versionDirs.length === 0) return null

              const latestVersion = versionDirs.sort((a, b) => {
                const aNum = a.split(".").map((n) => parseInt(n) || 0)
                const bNum = b.split(".").map((n) => parseInt(n) || 0)
                for (let i = 0; i < Math.max(aNum.length, bNum.length); i++) {
                  const diff = (bNum[i] || 0) - (aNum[i] || 0)
                  if (diff !== 0) return diff
                }
                return 0
              })[0]

              if (!latestVersion) return null
              extensionDir = path.join(itemPath, latestVersion)
              manifestPath = path.join(extensionDir, "manifest.json")
            } else if (browser === "firefox") {
              extensionDir = itemPath
              manifestPath = path.join(itemPath, "manifest.json")
            } else {
              return null
            }

            if (await this.pathExists(manifestPath)) {
              const manifestData = await fs.readFile(manifestPath, "utf-8")
              const manifest = JSON.parse(manifestData)
              const extName = await this.getExtensionName(manifest, item, extensionDir)

              const extensionInfo: ExtensionInfo = {
                id: item,
                name: extName,
                version: manifest.version || "1.0.0",
                description: manifest.description,
                manifest,
                folderPath: extensionDir,
              }

              // Validate extension info
              try {
                ExtensionInfoSchema.parse(extensionInfo)
                return extensionInfo
              } catch (error) {
                log.warn(`Invalid extension info for ${item}: ${error}`)
                return null
              }
            }
          } catch (error) {
            log.warn(`Error processing extension ${item}: ${error}`)
          }
          return null
        }),
      ),
    )

    return results.filter((ext): ext is ExtensionInfo => ext !== null)
  }

  private async copyDirectory(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true })
    const items = await fs.readdir(src)

    // Use Promise.all with pLimit for concurrent file copying
    await Promise.all(
      items.map((item) =>
        this.limit(async () => {
          const srcPath = path.join(src, item)
          const destPath = path.join(dest, item)
          const stats = await fs.stat(srcPath)

          if (stats.isDirectory()) {
            await this.copyDirectory(srcPath, destPath)
          } else {
            await fs.copyFile(srcPath, destPath)
          }
        }),
      ),
    )
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

        log.info(`Successfully converted '${extension.name}' to Firefox format.`)
        log.info(`XPI file: ${xpiPath}`)
        log.info(`Unpacked: ${unpackedDir}`)
      } else {
        const outputDir = path.join(browserOutputDir, safeName)
        await fs.mkdir(outputDir, { recursive: true })

        await this.copyDirectory(extension.folderPath, outputDir)

        await fs.writeFile(
          path.join(outputDir, "manifest.json"),
          JSON.stringify(convertedManifest, null, 2),
          "utf-8",
        )

        log.info(`Successfully converted '${extension.name}' to ${targetConfig.name} format.`)
        log.info(`Output: ${outputDir}`)
      }
    } catch (error) {
      log.error(`Error converting '${extension.name}': ${error}`)
      throw error
    }
  }

  async run(): Promise<void> {
    try {
      intro(chalk.inverse("Extension Exporter"))

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
        log.error("No supported browsers found installed on your system.")
        return
      }

      // Select source browser
      const sourceBrowser = (await select({
        message: "Select browser to export extensions from",
        options: installedBrowsers.map((browser) => {
          const config = BROWSER_CONFIGS[browser]
          if (!config) throw new Error(`Unsupported browser: ${browser}`)
          return {
            label: config.name,
            value: browser,
          }
        }),
      })) as string

      if (isCancel(sourceBrowser)) {
        cancel("Operation cancelled by user")
        return
      }

      // Get profiles for source browser
      const profiles = await this.getBrowserProfiles(sourceBrowser)
      const sourceConfig = BROWSER_CONFIGS[sourceBrowser]
      if (!sourceConfig) throw new Error(`Unsupported browser: ${sourceBrowser}`)

      if (profiles.length === 0) {
        log.error(`No ${sourceConfig.name} profiles found.`)
        return
      }

      // Select profile
      const selectedProfile = (await select({
        message: "Select profile to export extensions from",
        options: profiles.map((profile) => {
          return {
            label: path.basename(profile),
            value: profile,
          }
        }),
      })) as string

      if (isCancel(selectedProfile)) {
        cancel("Operation cancelled by user")
        return
      }

      // Get extensions from profile
      const extensionsScanner = spinner()
      extensionsScanner.start("Scanning for installed extensions...")

      const extensions = await this.getExtensionsFromProfile(selectedProfile, sourceBrowser)

      extensionsScanner.stop()

      if (extensions.length === 0) {
        log.error(`No extensions found in the selected ${sourceConfig.name} profile.`)
        return
      }

      // Select extensions to export
      const selectedExtensions = await select({
        message: "Select extensions to export",
        options: extensions.map((ext) => {
          return {
            label: `${ext.name} (v${ext.version})`,
            value: ext,
          }
        }),
      })

      if (isCancel(selectedExtensions)) {
        cancel("Operation cancelled by user")
        return
      }

      const extensionsArray = Array.isArray(selectedExtensions)
        ? selectedExtensions
        : [selectedExtensions]

      // Use Promise.all with pLimit for concurrent extension export
      await Promise.all(
        extensionsArray.map((extension) =>
          this.limit(async () => {
            try {
              await this.exportExtension(extension, sourceBrowser)
            } catch (error) {
              log.error(`Failed to convert ${extension.name}: ${error}`)
            }
          }),
        ),
      )

      log.info("All extensions have been exported successfully.")
    } catch (error) {
      log.error(`An error occurred: ${error}`)
    }
  }
}

// Main execution
async function main() {
  const exporter = new ExtensionExporter()

  try {
    await exporter.run()
  } catch (error) {
    log.error(`Fatal error: ${error}`)
    process.exit(1)
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main()
}

export { ExtensionExporter, BROWSER_CONFIGS }
