import { isCancel, cancel } from "@clack/prompts"

export function handleErrorOrCancel<T>(value: T | symbol, message = "Operation cancelled"): T {
  if (isCancel(value)) {
    cancel(message)
    process.exit(0)
  }
  return value
}

export function handleError(error: unknown): never {
  console.error("Error:", error)
  process.exit(1)
}
