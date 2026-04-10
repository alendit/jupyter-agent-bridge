export const BRIDGE_METHODS = {
  getSessionInfo: "bridge.get_session_info",
  listOpen: "notebook.list_open",
  open: "notebook.open",
  getOutline: "notebook.get_outline",
  listCells: "notebook.list_cells",
  search: "notebook.search",
  getDiagnostics: "notebook.get_diagnostics",
  findSymbols: "notebook.find_symbols",
  goToDefinition: "notebook.go_to_definition",
  read: "notebook.read",
  insertCell: "notebook.insert_cell",
  replaceCellSource: "notebook.replace_cell_source",
  patchCellSource: "notebook.patch_cell_source",
  formatCell: "notebook.format_cell",
  deleteCell: "notebook.delete_cell",
  moveCell: "notebook.move_cell",
  executeCells: "notebook.execute_cells",
  interruptExecution: "notebook.interrupt_execution",
  restartKernel: "notebook.restart_kernel",
  waitForKernelReady: "notebook.wait_for_kernel_ready",
  readCellOutputs: "notebook.read_cell_outputs",
  getKernelInfo: "notebook.get_kernel_info",
  selectKernel: "notebook.select_kernel",
  selectJupyterInterpreter: "notebook.select_jupyter_interpreter",
  summarizeState: "notebook.summarize_state",
} as const;

export interface SessionCapabilities {
  execute_cells: boolean;
  interrupt_execution: boolean;
  restart_kernel: boolean;
  wait_for_kernel_ready: boolean;
  select_kernel: boolean;
  select_jupyter_interpreter: boolean;
}

export interface BridgeSessionInfo {
  session_id: string;
  workspace_id: string | null;
  workspace_folders: string[];
  bridge_url: string;
  extension_version: string;
  capabilities: SessionCapabilities;
}

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
}

export interface JsonRpcSuccessResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result: unknown;
}

export interface JsonRpcErrorObject {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcErrorResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  error: JsonRpcErrorObject;
}

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

export const JSON_RPC_ERRORS = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
  domainError: -32000,
} as const;
