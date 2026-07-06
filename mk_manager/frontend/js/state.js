// Responsabilidade: estado global da aplicação

export const st = {
  files: [],
  searchResults: null,
  activeId: null,
  activeTags: [],
  activeFolder: "",
  activeStatus: "",
  filter: "all",
  search: "",
  view: "edit",
  isDirty: false,
  splitRatio: 0.5,
  tagFilters: [],
  tagSearch: "",
  expandedFolders: new Set(),
  expandedTags: new Set(),
  // Tela grande ativa no painel principal: 'editor' | 'kanban' | 'tags' | 'search'.
  // Substitui o antigo kanbanMode — generaliza pra qualquer view em tela cheia.
  mainView: "editor",
  sidebarOpen: true,
  saveTimer: null,
  searchTimer: null,
  pendingDelete: null,
  renamingId: null,
  renamingFolderPath: null,
  emptyFolders: new Set(),
  draggingFileId: null,
  creatingFolder: false,
  kanbanColumns: null,
  addingKanbanCol: false,
};
