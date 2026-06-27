import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import type { ResourceDetail } from '@/types';
import ResourceHeader from '@/components/resource/ResourceHeader';
import VersionSelector from '@/components/resource/VersionSelector';
import Loading from '@/components/common/Loading';
import Empty from '@/components/common/Empty';

export default function ResourcePage() {
  const { source, id } = useParams<{ source: string; id: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<ResourceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!source || !id) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await invoke<ResourceDetail>('get_resource_detail', { source, id });
        setDetail(data);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [source, id]);

  if (loading) return <Loading />;
  if (error) return (
    <div className="max-w-5xl mx-auto px-6 py-12 text-center">
      <p className="text-red-400 mb-2">加载失败</p>
      <p className="text-sm text-mc-muted">{error}</p>
    </div>
  );
  if (!detail) return <Empty message="资源不存在" />;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1 text-sm text-mc-muted hover:text-mc-text
                   transition-colors mb-4"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 19l-7-7 7-7" />
        </svg>
        返回
      </button>
      <ResourceHeader resource={detail} />
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-mc-text mb-4">版本列表</h2>
        <VersionSelector
          files={detail.files}
          source={source!}
          modId={id!}
        />
      </div>
    </div>
  );
}
