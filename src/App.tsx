import { Routes, Route } from 'react-router-dom';
import { ToastProvider } from '@/components/common/ToastProvider';
import Navbar from '@/components/layout/Navbar';
import HomePage from '@/pages/HomePage';
import ResourcePage from '@/pages/ResourcePage';
import CategoryPage from '@/pages/CategoryPage';
import CollectionsPage from '@/pages/CollectionsPage';
import CollectionDetailPage from '@/pages/CollectionDetailPage';
import UpdatesPage from '@/pages/UpdatesPage';
import SettingsPage from '@/pages/SettingsPage';

export default function App() {
  return (
    <ToastProvider>
      <div className="min-h-screen bg-mc-bg text-mc-text">
        <Navbar />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/resource/:source/:id" element={<ResourcePage />} />
          <Route path="/category/:type" element={<CategoryPage />} />
          <Route path="/collections" element={<CollectionsPage />} />
          <Route path="/collections/:id" element={<CollectionDetailPage />} />
          <Route path="/updates" element={<UpdatesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </div>
    </ToastProvider>
  );
}
