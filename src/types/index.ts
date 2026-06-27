// 资源类型
export type ResourceType = 'mod' | 'modpack' | 'shader' | 'resourcepack';

// 来源平台
export type Source = 'curseforge' | 'modrinth';

// 统一的资源条目（来自 API 返回）
export interface ResourceItem {
  id: string;
  source: Source;
  type: ResourceType;
  name: string;
  summary: string;
  iconUrl: string | null;
  downloadCount: number;
  author: string;
  categories: string[];
  gameVersions: string[];
  createdAt: string;
  updatedAt: string;
}

// 依赖声明
export interface Dependency {
  source: Source;
  modId: string;
  relationType: 'required' | 'optional' | 'embedded';
}

// 模组文件/版本（与 Rust types::ModFile 对等）
export interface ModFile {
  id: string;
  fileName: string;
  displayName: string;
  gameVersions: string[];
  modLoaders: string[];
  releaseType: 'release' | 'beta' | 'alpha';
  fileSize: number;
  downloadUrl: string | null;
  downloadCount: number;
  createdAt: string;
}

// 资源详细信息（与 Rust types::ResourceDetail 对等）
export interface ResourceDetail {
  id: string;
  source: Source;
  type: ResourceType;
  name: string;
  summary: string;
  description: string;
  iconUrl: string | null;
  downloadCount: number;
  author: string;
  categories: string[];
  gameVersions: string[];
  createdAt: string;
  updatedAt: string;
  files: ModFile[];
  url: string | null;
}

// 下载进度（与 Rust types::DownloadProgress 对等）
export interface DownloadProgress {
  fileId: string;
  fileName: string;
  downloaded: number;
  total: number;
  finished: boolean;
  error: string | null;
}

// 单个版本文件信息（旧版，可用于向下兼容）
export interface VersionFile {
  id: string;
  fileName: string;
  gameVersions: string[];
  loaders: string[];
  releaseType: 'release' | 'beta' | 'alpha';
  fileSize: number;
  downloadUrl: string | null;
  publishedAt: string;
  dependencies?: string[];
  incompatibilities?: string[];
}

// 收藏夹
export interface Collection {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  collectionType: string;
}

// 收藏夹中的资源条目
export interface CollectionItem {
  id: string;
  collectionId: string;
  resourceId: string;
  source: string;
  name: string;
  summary: string;
  iconUrl: string | null;
  downloadCount: number;
  author: string;
  resourceType: string;
  categories: string;      // JSON string
  gameVersions: string;    // JSON string
  addedAt: string;
}

// 最近浏览记录
export interface RecentlyViewed {
  id: string;
  resourceType: ResourceType;
  resourceId: string;
  resourceName: string;
  source: Source;
  iconUrl: string | null;
  viewedAt: string;
}

// 搜索结果
export interface SearchResult {
  items: ResourceItem[];
  total: number;
}

// 热门内容请求参数
export interface PopularParams {
  type: ResourceType;
  limit?: number;
}

// 搜索参数
export interface SearchParams {
  q: string;
  offset?: number;
  limit?: number;
}

// API 统一响应格式
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
