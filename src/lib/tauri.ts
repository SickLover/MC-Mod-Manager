import { invoke } from '@tauri-apps/api/core';

// 统一封装 invoke，加类型安全
export async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(command, args);
}
