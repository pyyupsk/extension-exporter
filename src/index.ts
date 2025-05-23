import { ExtensionExporter } from "./services/extension-exporter"

async function main() {
  const exporter = new ExtensionExporter()
  await exporter.run()
}

main().catch((error) => {
  console.error("Error:", error)
  process.exit(1)
})
