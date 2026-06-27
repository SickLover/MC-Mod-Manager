import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '@/components/common/ToastProvider';

interface Settings {
  curseforge_api_key: string;
  default_download_dir: string;
  check_updates_on_startup: boolean;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    curseforge_api_key: '',
    default_download_dir: '',
    check_updates_on_startup: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const toast = useToast();

  useEffect(() => {
    invoke<Settings>('get_settings')
      .then(setSettings)
      .catch(err => toast?.error?.(`加载设置失败: ${String(err)}`))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await invoke('save_settings_command', { settings });
      toast?.success?.('设置已保存');
    } catch (err) {
      toast?.error?.(`保存失败: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="max-w-2xl mx-auto px-6 py-8 text-mc-muted">加载中...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-mc-text mb-8">设置</h1>

      <div className="space-y-8">
        {/* CurseForge API Key */}
        <section>
          <h2 className="text-lg font-semibold text-mc-text mb-3">CurseForge API Key</h2>
          <p className="text-sm text-mc-muted mb-2">
            用于访问 CurseForge API。在{' '}
            <a href="https://console.curseforge.com" target="_blank" rel="noreferrer"
               className="text-mc-green hover:text-mc-green-light underline">
              CurseForge Developer Console
            </a>{' '}
            获取。
          </p>
          <div className="flex gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              value={settings.curseforge_api_key}
              onChange={e => setSettings(s => ({ ...s, curseforge_api_key: e.target.value }))}
              placeholder="粘贴 API Key..."
              className="flex-1 px-3 py-2 rounded-md bg-mc-card border border-mc-border
                         text-mc-text text-sm placeholder:text-mc-muted/50
                         focus:outline-none focus:border-mc-green transition-colors"
            />
            <button
              onClick={() => setShowKey(v => !v)}
              className="px-3 py-2 rounded-md bg-mc-card border border-mc-border
                         text-mc-muted hover:text-mc-text text-sm transition-colors"
            >
              {showKey ? '隐藏' : '显示'}
            </button>
          </div>
        </section>

        {/* 下载目录 */}
        <section>
          <h2 className="text-lg font-semibold text-mc-text mb-3">默认下载目录</h2>
          <p className="text-sm text-mc-muted mb-2">
            下载的 Mod 文件将保存到此目录。留空则默认保存到「下载/mc-mod-hub」。
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={settings.default_download_dir}
              onChange={e => setSettings(s => ({ ...s, default_download_dir: e.target.value }))}
              placeholder="例如: D:\Minecraft\mods"
              className="flex-1 px-3 py-2 rounded-md bg-mc-card border border-mc-border
                         text-mc-text text-sm placeholder:text-mc-muted/50
                         focus:outline-none focus:border-mc-green transition-colors"
            />
            <button
              onClick={async () => {
                try {
                  const dir = await invoke<string>('select_directory');
                  setSettings(s => ({ ...s, default_download_dir: dir }));
                } catch {
                  // 用户取消或目录选择器不可用，不做处理
                }
              }}
              className="px-3 py-2 rounded-md bg-mc-card border border-mc-border
                         text-mc-muted hover:text-mc-text text-sm transition-colors"
            >
              浏览...
            </button>
          </div>
        </section>

        {/* 偏好设置 */}
        <section>
          <h2 className="text-lg font-semibold text-mc-text mb-3">偏好设置</h2>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.check_updates_on_startup}
              onChange={e => setSettings(s => ({ ...s, check_updates_on_startup: e.target.checked }))}
              className="w-4 h-4 rounded accent-mc-green"
            />
            <span className="text-sm text-mc-text">启动时检查更新提醒</span>
          </label>
        </section>

        {/* 保存按钮 */}
        <div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-mc-green text-white rounded-md text-sm font-medium
                       hover:bg-mc-green-light transition-colors disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存设置'}
          </button>
        </div>
      </div>
    </div>
  );
}
