// Responsabilidade: estado global da aplicação

export const st = {
  files: [],
  searchResults: null,
  activeId: null,
  activeTags: [],
  activeFolder: '',
  activeStatus: '',
  filter: 'all',
  search: '',
  view: 'split',
  isDirty: false,
  splitRatio: 0.5,
  mainView: 'notes',
  folderFilter: null,
  tagFilter: null,
  folderSectionOpen: true,
  expandedFolders: new Set(),
  saveTimer: null,
  searchTimer: null,
  pendingDelete: null,
  renamingId: null,
};
