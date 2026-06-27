import { Link, useLocation } from 'react-router-dom';

const NAV_ITEMS = [
  { path: '/', label: '首页' },
  { path: '/collections', label: '收藏夹' },
  { path: '/updates', label: '更新提醒' },
  { path: '/settings', label: '设置' },
];

export default function Navbar() {
  const location = useLocation();

  return (
    <nav className="sticky top-0 z-50 bg-mc-bg/95 backdrop-blur border-b border-mc-border">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center gap-1">
        <Link
          to="/"
          className="text-mc-green font-bold text-lg mr-4 tracking-wide
            hover:text-mc-green-light transition-colors duration-200"
        >
          MC Mod Hub
        </Link>
        <div className="flex items-center gap-0.5 ml-2">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`px-3 py-1.5 rounded-md text-sm transition-all duration-200
                ${
                  location.pathname === item.path
                    ? 'bg-mc-green/15 text-mc-green-light'
                    : 'text-mc-muted hover:text-mc-text hover:bg-mc-card'
                }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
