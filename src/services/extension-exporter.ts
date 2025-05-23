import { intro, select, spinner, isCancel, cancel, log } from "@clack/prompts"
import archiver from "archiver"
import chalk from "chalk"
import { glob } from "glob"
import { createWriteStream } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"

import type { BrowserConfig, ExtensionInfo, ManifestV2, ManifestV3 } from "../types"

import { BROWSER_CONFIGS } from "../config/browsers"
import { ExtensionInfoSchema } from "../schemas"
import { pathExists, isDirectory, copyDirectory } from "../utils/fs"

export class ExtensionExporter {
  private getCurrentPlatform(): "windows" | "mac" | "linux" {
    const platform = process.platform
    if (platform === "win32") return "windows"
    if (platform === "darwin") return "mac"
    return "linux"
  }

  async getBrowserProfiles(browser: string): Promise<string[]> {
    const config = BROWSER_CONFIGS[browser]
    if (!config) {
      throw new Error(`Unsupported browser: ${browser}`)
    }

    const platform = this.getCurrentPlatform()
    const basePath = config.paths[platform]
    if (!basePath) {
      throw new Error(`Browser ${browser} is not supported on ${platform}`)
    }

    if (!(await pathExists(basePath))) {
      return []
    }

    const profiles: string[] = []
    for (const pattern of config.profilePatterns) {
      const matches = await glob(pattern, { cwd: basePath })
      for (const match of matches) {
        const profilePath = path.join(basePath, match)
        if (await isDirectory(profilePath)) {
          profiles.push(profilePath)
        }
      }
    }

    return profiles
  }

  private async getSupportedBrowsers(): Promise<[browser: string, config: BrowserConfig][]> {
    const supportedBrowsers = Object.keys(BROWSER_CONFIGS)
    const installedBrowsers: string[] = []

    for (const browser of supportedBrowsers) {
      const profiles = await this.getBrowserProfiles(browser)
      if (profiles.length > 0) {
        installedBrowsers.push(browser)
      }
    }

    if (installedBrowsers.length === 0) {
      throw new Error("No supported browsers installed")
    }

    return installedBrowsers.map((browser) => [browser, BROWSER_CONFIGS[browser]!])
  }

  private async getExtensionName(
    manifest: ManifestV2 | ManifestV3,
    extId: string,
  ): Promise<string> {
    let name = manifest.name

    // Clean up the name
    name = name.replace(/[<>:"/\\|?*]/g, "_").trim()
    if (!name) {
      name = extId
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

    if (!(await pathExists(extPath))) {
      log.warn(`Extensions path '${extPath}' does not exist.`)
      return extensions
    }

    const items = await fs.readdir(extPath)

    // Use Promise.all with pLimit for concurrent extension processing
    const results = await Promise.all(
      items.map(async (item) => {
        const itemPath = path.join(extPath, item)

        if (!(await isDirectory(itemPath))) return null

        try {
          let manifestPath: string
          let extensionDir: string

          if (["chrome", "edge", "brave", "opera", "vivaldi"].includes(browser)) {
            const versions = await fs.readdir(itemPath)
            const versionDirs = []

            for (const version of versions) {
              const versionPath = path.join(itemPath, version)
              if (await isDirectory(versionPath)) {
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

          if (await pathExists(manifestPath)) {
            const manifestData = await fs.readFile(manifestPath, "utf-8")
            const manifest = JSON.parse(manifestData)
            const extName = await this.getExtensionName(manifest, item)

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
    )

    return results.filter((result) => result !== null)
  }

  private async createZipArchive(sourceDir: string, outputPath: string): Promise<void> {
    const output = createWriteStream(outputPath)
    const archive = archiver("zip", { zlib: { level: 9 } })

    return new Promise((resolve, reject) => {
      output.on("close", resolve)
      archive.on("error", reject)

      archive.pipe(output)
      archive.directory(sourceDir, false)
      archive.finalize()
    })
  }

  async exportExtension(extension: ExtensionInfo, sourceBrowser: string): Promise<void> {
    const s = spinner()
    s.start(`Exporting ${extension.name}...`)

    try {
      const exportDir = path.join(process.cwd(), "exports", sourceBrowser)
      await fs.mkdir(exportDir, { recursive: true })

      const tempDir = path.join(exportDir, extension.id)
      await fs.mkdir(tempDir, { recursive: true })

      await copyDirectory(extension.folderPath, tempDir)

      const zipPath = path.join(exportDir, `${extension.name}-${extension.version}.zip`)
      await this.createZipArchive(tempDir, zipPath)

      await fs.rm(tempDir, { recursive: true, force: true })

      s.stop(`Exported ${extension.name} to ${zipPath}`)
    } catch (error) {
      s.stop(`Failed to export ${extension.name}: ${error}`)
      throw error
    }
  }

  async run(): Promise<void> {
    intro(chalk.blue("Browser Extension Exporter"))

    const browsers = await this.getSupportedBrowsers()

    const browser = await select({
      message: "Select a browser:",
      options: browsers.map(([id, config]) => ({
        value: id,
        label: config.name,
      })),
    })

    if (isCancel(browser)) {
      cancel("Operation cancelled")
      return
    }

    const s = spinner()
    s.start("Scanning for browser profiles...")

    const profiles = await this.getBrowserProfiles(browser)
    s.stop(`Found ${profiles.length} profiles`)

    if (profiles.length === 0) {
      log.error("No browser profiles found")
      return
    }

    const profile = await select({
      message: "Select a profile:",
      options: profiles.map((p) => ({
        value: p,
        label: path.basename(p),
      })),
    })

    if (isCancel(profile)) {
      cancel("Operation cancelled")
      return
    }

    s.start("Scanning for extensions...")
    const extensions = await this.getExtensionsFromProfile(profile, browser)
    s.stop(`Found ${extensions.length} extensions`)

    if (extensions.length === 0) {
      log.error("No extensions found")
      return
    }

    const selectedExtensions = await select({
      message: "Select extensions to export:",
      options: extensions.map((ext) => ({
        value: ext,
        label: `${ext.name} (${ext.version})`,
      })),
    })

    if (isCancel(selectedExtensions)) {
      cancel("Operation cancelled")
      return
    }

    const extensionsToExport = Array.isArray(selectedExtensions)
      ? selectedExtensions
      : [selectedExtensions]

    for (const extension of extensionsToExport) {
      await this.exportExtension(extension, browser)
    }

    log.success("Export completed successfully!")
  }
}
