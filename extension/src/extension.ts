import { randomUUID } from "node:crypto";
import * as vscode from "vscode";
import { BRIDGE_METHODS, BridgeSessionInfo } from "../../packages/protocol/src";
import { BearerTokenAuth } from "./bridge/Auth";
import { BridgeHttpServer } from "./bridge/BridgeHttpServer";
import { JsonRpcRouter } from "./bridge/JsonRpcRouter";
import { ProjectPortFileStore } from "./bridge/ProjectPortFileStore";
import { RendezvousStore } from "./bridge/RendezvousStore";
import { NotebookCommandAdapter } from "./commands/NotebookCommandAdapter";
import { CursorMcpRegistrar } from "./cursor/CursorMcpRegistrar";
import { buildBundledMcpServerConfig, renderMcpDefinitionSnippet } from "./mcp/BundledMcpServer";
import { HostKernelObservationService } from "./notebook/HostKernelObservationService";
import { KernelInspectionService } from "./notebook/KernelInspectionService";
import { NotebookBridgeService } from "./notebook/NotebookBridgeService";
import { CellPatchService } from "./notebook/CellPatchService";
import { NotebookDocumentService } from "./notebook/NotebookDocumentService";
import { NotebookEditApplicationService } from "./notebook/NotebookEditApplicationService";
import { NotebookAsyncExecutionService } from "./notebook/NotebookAsyncExecutionService";
import { NotebookExecutionService } from "./notebook/NotebookExecutionService";
import { NotebookKernelCommandService } from "./notebook/NotebookKernelCommandService";
import { NotebookLanguageService } from "./notebook/NotebookLanguageService";
import { NotebookMutationService } from "./notebook/NotebookMutationService";
import { NotebookQueryApplicationService } from "./notebook/NotebookQueryApplicationService";
import { NotebookReadService } from "./notebook/NotebookReadService";
import { NotebookRegistry } from "./notebook/NotebookRegistry";
import { NotebookRuntimeApplicationService } from "./notebook/NotebookRuntimeApplicationService";
import { NotebookSearchService } from "./notebook/NotebookSearchService";
import { NotebookVariableService } from "./notebook/NotebookVariableService";
import { OutputNormalizationService } from "./notebook/OutputNormalizationService";

const EXTENSION_VERSION = "0.1.0";
const PRODUCT_NAME = "Jupyter Agentic Bridge";
const START_BRIDGE_COMMAND = "jupyterAgentBridge.startBridge";
const STOP_BRIDGE_COMMAND = "jupyterAgentBridge.stopBridge";
const SHOW_STATUS_COMMAND = "jupyterAgentBridge.showStatus";
const COPY_MCP_DEFINITION_COMMAND = "jupyterAgentBridge.copyMcpDefinition";

interface RuntimeState {
  bridgeUrl: string;
  authToken: string;
  sessionId: string;
  portFilePaths: string[];
  httpServer: BridgeHttpServer;
  projectPortFileStore: ProjectPortFileStore;
  rendezvousStore: RendezvousStore;
  cursorRegistrar: CursorMcpRegistrar;
}

let runtimeState: RuntimeState | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel(PRODUCT_NAME, { log: true });
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  const log = (message: string): void => {
    outputChannel.appendLine(message);
  };
  const registry = new NotebookRegistry();
  const hostKernelObservationService = new HostKernelObservationService(log);
  const outputNormalizationService = new OutputNormalizationService();
  const kernelInspectionService = new KernelInspectionService(registry, hostKernelObservationService);
  const readService = new NotebookReadService(registry, outputNormalizationService, kernelInspectionService);
  const mutationService = new NotebookMutationService();
  const documentService = new NotebookDocumentService(registry, mutationService);
  const searchService = new NotebookSearchService(registry, readService);
  const variableService = new NotebookVariableService(registry);
  const cellPatchService = new CellPatchService();
  const commandAdapter = new NotebookCommandAdapter(log);
  const executionService = new NotebookExecutionService(registry, readService, commandAdapter, log);
  const asyncExecutionService = new NotebookAsyncExecutionService(
    registry,
    documentService,
    mutationService,
    executionService,
    readService,
    log,
  );
  const kernelCommandService = new NotebookKernelCommandService(
    registry,
    readService,
    commandAdapter,
    hostKernelObservationService,
    log,
  );
  const languageService = new NotebookLanguageService(registry, readService, mutationService);
  const queryApplicationService = new NotebookQueryApplicationService(
    registry,
    documentService,
    readService,
    searchService,
    languageService,
    variableService,
    hostKernelObservationService,
    commandAdapter,
  );
  const editApplicationService = new NotebookEditApplicationService(
    registry,
    documentService,
    readService,
    mutationService,
    cellPatchService,
    languageService,
  );
  const runtimeApplicationService = new NotebookRuntimeApplicationService(
    registry,
    documentService,
    mutationService,
    asyncExecutionService,
    executionService,
    kernelCommandService,
  );
  const notebookBridgeService = new NotebookBridgeService(
    queryApplicationService,
    editApplicationService,
    runtimeApplicationService,
  );

  const renderTooltip = (): vscode.MarkdownString => {
    const tooltip = new vscode.MarkdownString(undefined, true);
    tooltip.isTrusted = true;

    if (!runtimeState) {
      tooltip.appendMarkdown(`**${PRODUCT_NAME}**\n\n`);
      tooltip.appendMarkdown("- Status: stopped\n");
      tooltip.appendMarkdown(`- JSON-RPC method: \`${BRIDGE_METHODS.getSessionInfo}\`\n\n`);
      tooltip.appendMarkdown(
        `[Start Bridge](command:${START_BRIDGE_COMMAND}) | [Copy MCP Definition](command:${COPY_MCP_DEFINITION_COMMAND})`,
      );
      return tooltip;
    }

    tooltip.appendMarkdown(`**${PRODUCT_NAME}**\n\n`);
    tooltip.appendMarkdown("- Status: running\n");
    tooltip.appendMarkdown(`- Session ID: \`${runtimeState.sessionId}\`\n`);
    tooltip.appendMarkdown(`- Bridge URL: \`${runtimeState.bridgeUrl}\`\n`);
    if (runtimeState.portFilePaths.length > 0) {
      tooltip.appendMarkdown(`- Port file: \`${runtimeState.portFilePaths[0]}\`\n`);
    }
    tooltip.appendMarkdown(`- JSON-RPC method: \`${BRIDGE_METHODS.getSessionInfo}\`\n\n`);
    tooltip.appendMarkdown(
      `[Copy MCP Definition](command:${COPY_MCP_DEFINITION_COMMAND}) | [Stop Bridge](command:${STOP_BRIDGE_COMMAND}) | [Show Status](command:${SHOW_STATUS_COMMAND})`,
    );
    return tooltip;
  };

  const updateStatusBar = (): void => {
    statusBarItem.command = SHOW_STATUS_COMMAND;
    statusBarItem.text = runtimeState ? `$(plug) ${PRODUCT_NAME}` : `$(debug-disconnect) ${PRODUCT_NAME}`;
    statusBarItem.color = runtimeState ? new vscode.ThemeColor("charts.blue") : undefined;
    statusBarItem.tooltip = renderTooltip();
    statusBarItem.show();
  };

  const getStatusSummary = (): string => {
    if (!runtimeState) {
      return `${PRODUCT_NAME} is stopped.`;
    }

    return `${PRODUCT_NAME} is running.
Session ID: ${runtimeState.sessionId}
Bridge URL: ${runtimeState.bridgeUrl}
Port file: ${runtimeState.portFilePaths[0] ?? "not available"}
JSON-RPC method: ${BRIDGE_METHODS.getSessionInfo}`;
  };

  const startRuntime = async (): Promise<RuntimeState> => {
    if (runtimeState) {
      return runtimeState;
    }

    const sessionId = randomUUID();
    const authToken = randomUUID();
    let bridgeUrl = "";

    const getSessionInfo = (): BridgeSessionInfo => ({
      session_id: sessionId,
      workspace_id: vscode.workspace.workspaceFolders?.[0]?.uri.toString() ?? null,
      workspace_folders: (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.toString()),
      bridge_url: bridgeUrl,
      extension_version: EXTENSION_VERSION,
      capabilities: {
        execute_cells: true,
        execute_cells_async: true,
        get_execution_status: true,
        wait_for_execution: true,
        interrupt_execution: true,
        restart_kernel: true,
        list_variables: true,
        wait_for_kernel_ready: true,
        select_kernel: true,
        select_jupyter_interpreter: true,
        reveal_cells: true,
      },
    });

    const router = new JsonRpcRouter(notebookBridgeService, getSessionInfo);
    const auth = new BearerTokenAuth(authToken);
    const httpServer = new BridgeHttpServer(auth, router, log);
    bridgeUrl = await httpServer.start();
    const bridgePort = Number.parseInt(new URL(bridgeUrl).port, 10);

    const rendezvousStore = new RendezvousStore(sessionId, authToken, getSessionInfo);
    await rendezvousStore.start();

    const projectPortFileStore = new ProjectPortFileStore();
    const portFilePaths = await projectPortFileStore.write(bridgePort);
    const cursorRegistrar = new CursorMcpRegistrar(
      context.extensionPath,
      () => projectPortFileStore.getPreferredPortFilePath(),
    );
    cursorRegistrar.registerIfAvailable();

    runtimeState = {
      bridgeUrl,
      authToken,
      sessionId,
      portFilePaths,
      httpServer,
      projectPortFileStore,
      rendezvousStore,
      cursorRegistrar,
    };

    log(
      `Bridge started at ${bridgeUrl} for session ${sessionId}. Port files: ${
        portFilePaths.length > 0 ? portFilePaths.join(", ") : "none"
      }.`,
    );
    updateStatusBar();
    return runtimeState;
  };

  const stopRuntime = async (): Promise<void> => {
    if (!runtimeState) {
      log("Stop requested while the bridge was already stopped.");
      return;
    }

    const current = runtimeState;
    runtimeState = undefined;
    current.projectPortFileStore.dispose();
    current.rendezvousStore.dispose();
    current.cursorRegistrar.dispose();
    await current.httpServer.stop();
    log(`Bridge stopped for session ${current.sessionId}.`);
    updateStatusBar();
  };

  const copyMcpDefinition = async (): Promise<void> => {
    const current = runtimeState ?? (await startRuntime());
    const portFilePath = current.projectPortFileStore.getPreferredPortFilePath();
    if (!portFilePath) {
      log("Failed to copy MCP definition because no workspace folder is available for a project port file.");
      await vscode.window.showErrorMessage(
        `${PRODUCT_NAME} needs an open workspace folder to generate a project-local MCP definition.`,
      );
      return;
    }

    const config = buildBundledMcpServerConfig(context.extensionPath, portFilePath);
    if (!config) {
      log("Failed to copy MCP definition because the bundled MCP server entrypoint was not found.");
      updateStatusBar();
      await vscode.window.showErrorMessage(
        `${PRODUCT_NAME} could not find the bundled MCP server entrypoint. Build the workspace first.`,
      );
      return;
    }

    const snippet = renderMcpDefinitionSnippet(config);
    await vscode.env.clipboard.writeText(snippet);
    log(`Copied a port-file MCP definition for session ${current.sessionId} using ${portFilePath}.`);
    updateStatusBar();
    await vscode.window.showInformationMessage(
      "Copied a session-pinned MCP definition to the clipboard.",
    );
  };

  const startBridgeCommand = vscode.commands.registerCommand(START_BRIDGE_COMMAND, async () => {
    const current = runtimeState ?? (await startRuntime());
    const action = await vscode.window.showInformationMessage(
      `${PRODUCT_NAME} is running at ${current.bridgeUrl}. Session method: ${BRIDGE_METHODS.getSessionInfo}`,
      "Copy MCP Definition",
      "Show Status",
      "Show Output",
    );

    if (action === "Copy MCP Definition") {
      await copyMcpDefinition();
      return;
    }

    if (action === "Show Status") {
      await vscode.window.showInformationMessage(getStatusSummary());
      return;
    }

    if (action === "Show Output") {
      outputChannel.show(true);
    }
  });

  const stopBridgeCommand = vscode.commands.registerCommand(STOP_BRIDGE_COMMAND, async () => {
    const wasRunning = runtimeState !== undefined;
    await stopRuntime();
    await vscode.window.showInformationMessage(
      wasRunning ? `${PRODUCT_NAME} stopped.` : `${PRODUCT_NAME} is already stopped.`,
    );
  });

  const showStatusCommand = vscode.commands.registerCommand(SHOW_STATUS_COMMAND, async () => {
    const message = getStatusSummary();
    log(`Status requested. ${message.replace(/\n/g, " | ")}`);
    updateStatusBar();
    const action = await vscode.window.showInformationMessage(
      message,
      runtimeState ? "Copy MCP Definition" : "Start Bridge",
      "Show Output",
    );
    if (action === "Copy MCP Definition") {
      await copyMcpDefinition();
      return;
    }
    if (action === "Start Bridge") {
      await startRuntime();
      return;
    }
    if (action === "Show Output") {
      outputChannel.show(true);
    }
  });

  const copyMcpDefinitionCommand = vscode.commands.registerCommand(
    COPY_MCP_DEFINITION_COMMAND,
    copyMcpDefinition,
  );

  await startRuntime();
  updateStatusBar();

  context.subscriptions.push(
    outputChannel,
    statusBarItem,
    registry,
    startBridgeCommand,
    stopBridgeCommand,
    showStatusCommand,
    copyMcpDefinitionCommand,
  );
}

export async function deactivate(): Promise<void> {
  if (runtimeState) {
    const current = runtimeState;
    runtimeState = undefined;
    current.projectPortFileStore.dispose();
    current.rendezvousStore.dispose();
    current.cursorRegistrar.dispose();
    await current.httpServer.stop();
  }
}
