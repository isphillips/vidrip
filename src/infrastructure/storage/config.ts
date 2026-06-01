// Storage mode for reaction videos.
// 'local'  — video stays on device; cloud is a relay only (downloaded by recipients)
// 'cloud'  — video uploads automatically and streams from Supabase Storage
export type StorageMode = 'local' | 'cloud';

export const STORAGE_MODE: StorageMode = 'local';
