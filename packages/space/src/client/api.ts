import type { RegistryPayload } from './types.ts'

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  const value = await response.json() as Record<string, unknown>
  if (!response.ok || value.ok === false)
    throw new Error(typeof value.error === 'string' ? value.error : '操作失败')
  return value
}

export async function fetchRegistry(signal?: AbortSignal): Promise<RegistryPayload> {
  return await responseJson(await fetch('/api/dsh-space/registry', { signal })) as unknown as RegistryPayload
}

export async function runOperation(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  return await responseJson(await fetch('/api/dsh-space/ops', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }))
}
