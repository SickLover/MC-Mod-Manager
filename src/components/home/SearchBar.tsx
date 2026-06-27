import { useState, type FormEvent } from 'react';

interface SearchBarProps {
  onSearch?: (query: string) => void;
  onClear?: () => void;
}

export default function SearchBar({ onSearch, onClear }: SearchBarProps) {
  const [query, setQuery] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (query.trim() && onSearch) {
      onSearch(query.trim());
    }
  };

  const handleClear = () => {
    setQuery('');
    onClear?.();
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索 Mod、整合包、材质包..."
            className="w-full h-12 px-4 pr-10 bg-mc-card border border-white/10 rounded-mc
                       text-mc-text placeholder-mc-muted
                       focus:outline-none focus:border-mc-green/50 focus:ring-1 focus:ring-mc-green/30
                       transition-colors duration-200"
          />
          {/* 搜索图标 */}
          <svg
            className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-mc-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        <button
          type="submit"
          className="h-12 px-6 bg-mc-green hover:bg-mc-green-light text-white font-medium
                     rounded-mc transition-colors duration-200"
        >
          搜索
        </button>
        {/* 清除按钮（有搜索历史时显示） */}
        {onClear && (
          <button
            type="button"
            onClick={handleClear}
            className="h-12 px-4 bg-mc-card border border-white/10 text-mc-muted hover:text-mc-text
                       rounded-mc transition-colors duration-200 text-sm"
          >
            清除
          </button>
        )}
      </div>
    </form>
  );
}
