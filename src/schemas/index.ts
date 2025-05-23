import z from "zod"

export const ExtensionInfoSchema = z.object({
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
