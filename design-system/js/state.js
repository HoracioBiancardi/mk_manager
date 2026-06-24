export const st = {
  masterKey: sessionStorage.getItem('pm_key') || null,
  credentials: [],
  filtered: [],
  activeKey: null,   // string composta "nome::email"
  activeCred: null,
  editing: false,
  isNew: false,
  searchQuery: '',
  pendingDelete: null,
};
