export type BrowserConfig = {
  name: string
  paths: {
    windows?: string
    mac?: string
    linux?: string
  }
  extensionPath: string
  profilePatterns: string[]
}

export type ExtensionInfo = {
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

export type ManifestV2 = {
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

export type ManifestV3 = {
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
