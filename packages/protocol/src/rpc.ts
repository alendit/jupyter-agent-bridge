export const BRIDGE_METHODS = {
  getSessionInfo: "bridge.get_session_info",
  listOpen: "notebook.list_open",
  open: "notebook.open",
  read: "notebook.read",
  insertCell: "notebook.insert_cell",
  replaceCellSource: "notebook.replace_cell_source",
  deleteCell: "notebook.delete_cell",
  moveCell: "notebook.move_cell",
  executeCells: "notebook.execute_cells",
  readCellOutputs: "notebook.read_cell_outputs",
  getKernelInfo: "notebook.get_kernel_info",
  summarizeState: "notebook.summarize_state",
} as const;

export interface SessionCapabilities {
  execute_cells: boolean;
  interrupt_execution: boolean;
  restart_kernel: boolean;
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

