import { ResourceDetail } from '@/types';
import { formatDownloads } from '@/lib/format';

interface ResourceHeaderProps {
  resource: ResourceDetail;
}

export default function ResourceHeader({ resource }: ResourceHeaderProps) {
  const sourceLabel = resource.source === 'curseforge' ? 'CurseForge' : 'Modrinth';
  const sourceColor = resource.source === 'curseforge'
    ? 'bg-orange-500/20 text-orange-400'
    : 'bg-blue-500/20 text-blue-400';

  return (
    <div className="flex flex-col md:flex-row gap-6 mb-8">
      {/* 图标 */}
      <div className="w-24 h-24 md:w-32 md:h-32 rounded-mc overflow-hidden bg-mc-bg border border-white/5 flex-shrink-0">
        {resource.iconUrl ? (
          <img
            src={resource.iconUrl}
            alt={resource.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-mc-muted text-sm">
            无图标
          </div>
        )}
      </div>

      {/* 信息 */}
      <div className="flex-1 min-w-0">
        <h1 className="text-2xl md:text-3xl font-bold text-mc-text mb-2 break-words">
          {resource.name}
        </h1>
        <p className="text-sm text-mc-muted mb-3">
          作者: {resource.author}
        </p>

        {/* 分类标签 + 来源标签 */}
        <div className="flex flex-wrap gap-2 mb-3">
          {resource.categories.slice(0, 6).map((cat) => (
            <span
              key={cat}
              className="px-2.5 py-0.5 text-xs rounded-full bg-mc-green/15 text-mc-green-light border border-mc-green/20"
            >
              {cat}
            </span>
          ))}
          <span className={`px-2.5 py-0.5 text-xs rounded ${sourceColor}`}>
            {sourceLabel}
          </span>
        </div>

        {/* 原始链接 */}
        {resource.url && (
          <a
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-mc-muted hover:text-mc-green-light transition-colors duration-200"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
            在 {sourceLabel} 查看
          </a>
        )}

        {/* 下载量 */}
        <p className="text-xs text-mc-muted mt-2">
          {formatDownloads(resource.downloadCount)} 次下载
        </p>

        {/* 描述 */}
        {resource.description && (
          <div
            className="mt-4 text-sm text-mc-muted leading-relaxed prose prose-invert max-w-none
              [&_a]:text-mc-green-light [&_a]:underline
              [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5
              [&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-mc-text [&_h1]:mt-4 [&_h1]:mb-2
              [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-mc-text [&_h2]:mt-3 [&_h2]:mb-2
              [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-mc-text [&_h3]:mt-2 [&_h3]:mb-1
              [&_img]:rounded-mc [&_img]:max-w-full [&_img]:my-3
              [&_code]:bg-mc-bg [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs
              [&_pre]:bg-mc-bg [&_pre]:p-3 [&_pre]:rounded-mc [&_pre]:overflow-x-auto [&_pre]:my-3
              [&_blockquote]:border-l-2 [&_blockquote]:border-mc-green/30 [&_blockquote]:pl-4 [&_blockquote]:italic
              [&_hr]:border-white/5 [&_hr]:my-4"
            dangerouslySetInnerHTML={{ __html: resource.description }}
          />
        )}
      </div>
    </div>
  );
}
