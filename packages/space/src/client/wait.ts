export async function waitFor<T>(read: () => T | undefined, matches: (value: T) => boolean, timeoutMs = 5000): Promise<T> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const value = read()
    if (value !== undefined && matches(value))
      return value
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error('等待核心工作区列表更新超时')
}
