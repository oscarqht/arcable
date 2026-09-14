// Re-export cloudSync functions for backward compatibility
export * from './cloudSync';

// Legacy compatibility aliases
export {
  syncOperationsWithServer as syncWithSupabase,
  syncWorkspaceWithCloudServer as syncWorkspaceWithSupabase,
  syncWorkspaceWithCloudServer as performSupabaseSync,
  fetchCloudDevices as fetchSupabaseDevices,
  renameCloudDevice as renameSupabaseDevice,
  deleteCloudDevice as deleteSupabaseDevice,
} from './cloudSync';
