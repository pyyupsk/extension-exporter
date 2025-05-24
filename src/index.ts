import { ExtensionExporter } from "./services/extension-exporter"
import { handleError } from "./utils/error-handler"

async function main() {
  const exporter = new ExtensionExporter()
  await exporter.run()
}

main().catch(handleError)
