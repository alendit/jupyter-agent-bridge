import { randomUUID } from "node:crypto";
import * as vscode from "vscode";
import { BRIDGE_METHODS, BridgeSessionInfo } from "../../packages/protocol/src";
import { BridgeRuntimeController } from "./BridgeRuntimeController";
import { BearerTokenAuth } from "./bridge/Auth";
import { BridgeHttpServer } from "./bridge/BridgeHttpServer";
import { JsonRpcRouter } from "./bridge/JsonRpcRouter";
import { ProjectPortFileStore } from "./bridge/ProjectPortFileStore";
import { RendezvousStore } from "./bridge/RendezvousStore";
import { NotebookCommandAdapter } from "./commands/NotebookCommandAdapter";
import { CursorMcpRegistrar } from "./cursor/CursorMcpRegistrar";
import { buildBundledMcpServerConfig } from "./mcp/BundledMcpServer";
import {
  getMcpConfigTarget,
  MCP_CONFIG_TARGETS,
  renderClipboardMcpDefinitionSnippet,
  writeProjectMcpConfig,
} from "./mcp/ProjectMcpConfig";
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
import { normalizeCellNavigationRequest, OPEN_CELL_NAVIGATION_COMMAND, toRevealCellNavigationRequest } from "./notebook/cellNavigation";
import { registerCellNavigationUriHandler } from "./notebook/registerCellNavigationUriHandler";
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
const CREATE_MCP_CONFIG_COMMAND = "jupyterAgentBridge.createMcpConfig";

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

let runtimeController: BridgeRuntimeController<RuntimeState> | undefined;

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
  const mutationService = new NotebookMutationService((notebookUri) => registry.getVersion(notebookUri));
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

  const cellNavigationUriHandler = registerCellNavigationUriHandler(context, queryApplicationService, log);
  const formatRunningStatus = (current: RuntimeState): string => `${PRODUCT_NAME} is running.
Session ID: ${current.sessionId}
Bridge URL: ${current.bridgeUrl}
Port file: ${current.portFilePaths[0] ?? "not available"}
JSON-RPC method: ${BRIDGE_METHODS.getSessionInfo}`;

  const renderTooltip = (): vscode.MarkdownString => {
    const tooltip = new vscode.MarkdownString(undefined, true);
    tooltip.isTrusted = true;
    const current = runtimeController?.getState();

    if (!current) {
      tooltip.appendMarkdown(`**${PRODUCT_NAME}**\n\n`);
      tooltip.appendMarkdown("- Status: stopped\n");
      tooltip.appendMarkdown(`- JSON-RPC method: \`${BRIDGE_METHODS.getSessionInfo}\`\n\n`);
      tooltip.appendMarkdown(
        `[Start Bridge](command:${START_BRIDGE_COMMAND}) | [Create MCP Config](command:${CREATE_MCP_CONFIG_COMMAND})`,
      );
      return tooltip;
    }

    tooltip.appendMarkdown(`**${PRODUCT_NAME}**\n\n`);
    tooltip.appendMarkdown("- Status: running\n");
    tooltip.appendMarkdown(`- Session ID: \`${current.sessionId}\`\n`);
    tooltip.appendMarkdown(`- Bridge URL: \`${current.bridgeUrl}\`\n`);
    if (current.portFilePaths.length > 0) {
      tooltip.appendMarkdown(`- Port file: \`${current.portFilePaths[0]}\`\n`);
    }
    tooltip.appendMarkdown(`- JSON-RPC method: \`${BRIDGE_METHODS.getSessionInfo}\`\n\n`);
    tooltip.appendMarkdown(
      `[Create MCP Config](command:${CREATE_MCP_CONFIG_COMMAND}) | [Stop Bridge](command:${STOP_BRIDGE_COMMAND}) | [Show Status](command:${SHOW_STATUS_COMMAND})`,
    );
    return tooltip;
  };

  const updateStatusBar = (): void => {
    statusBarItem.command = SHOW_STATUS_COMMAND;
    statusBarItem.text = runtimeController?.getState() ? `$(plug) ${PRODUCT_NAME}` : `$(debug-disconnect) ${PRODUCT_NAME}`;
    statusBarItem.color = runtimeController?.getState() ? new vscode.ThemeColor("charts.blue") : undefined;
    statusBarItem.tooltip = renderTooltip();
    statusBarItem.show();
  };

  const controller = new BridgeRuntimeController<RuntimeState>({
    start: async (): Promise<RuntimeState> => {
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
          set_cell_input_visibility: true,
          preview_cell_edit: true,
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

      const current = {
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
      return current;
    },
    stop: async (current): Promise<void> => {
      current.projectPortFileStore.dispose();
      current.rendezvousStore.dispose();
      current.cursorRegistrar.dispose();
      await current.httpServer.stop();
      log(`Bridge stopped for session ${current.sessionId}.`);
    },
    formatRunningSummary: formatRunningStatus,
    stoppedSummary: `${PRODUCT_NAME} is stopped.`,
    onStateChanged: () => {
      updateStatusBar();
    },
  });
  runtimeController = controller;

  const createMcpConfig = async (): Promise<void> => {
    const current = await controller.ensureStarted();
    const portFilePath = current.projectPortFileStore.getPreferredPortFilePath();
    const workspaceFolderPath = current.projectPortFileStore.getPreferredWorkspaceFolderPath();
    if (!portFilePath) {
      log("Failed to create MCP config because no workspace folder is available for a project port file.");
      await vscode.window.showErrorMessage(
        `${PRODUCT_NAME} needs an open workspace folder to generate a project-local MCP config.`,
      );
      return;
    }
    if (!workspaceFolderPath) {
      log("Failed to create MCP config because no preferred workspace folder could be resolved.");
      await vscode.window.showErrorMessage(
        `${PRODUCT_NAME} could not resolve the workspace folder that should receive the project-local MCP config.`,
      );
      return;
    }

    const config = buildBundledMcpServerConfig(context.extensionPath, portFilePath);
    if (!config) {
      log("Failed to create MCP config because the bundled MCP server entrypoint was not found.");
      await vscode.window.showErrorMessage(
        `${PRODUCT_NAME} could not find the bundled MCP server entrypoint. Build the workspace first.`,
      );
      return;
    }

    const selection = await vscode.window.showQuickPick(
      [
        ...MCP_CONFIG_TARGETS.filter((target) => target.id !== "copy-to-clipboard").map((target) => ({
          label: target.label,
          targetId: target.id,
          description: target.relativePath ?? "generic snippet",
        })),
        {
          label: "Copy to Clipboard",
          targetId: "copy-to-clipboard" as const,
          description: "generic snippet",
          kind: vscode.QuickPickItemKind.Separator,
        },
        {
          label: "Copy to Clipboard",
          targetId: "copy-to-clipboard" as const,
          description: "generic snippet",
        },
      ],
      {
        title: "Create MCP Config",
        placeHolder: "Choose where to create the MCP config",
      },
    );
    if (!selection) {
      return;
    }

    if (selection.targetId === "copy-to-clipboard") {
      const snippet = renderClipboardMcpDefinitionSnippet(config);
      await vscode.env.clipboard.writeText(snippet);
      log(`Copied a generic MCP definition snippet for session ${current.sessionId} using ${portFilePath}.`);
      await vscode.window.showInformationMessage("Copied an MCP definition snippet to the clipboard.");
      return;
    }

    try {
      const target = getMcpConfigTarget(selection.targetId);
      const result = await writeProjectMcpConfig(selection.targetId, workspaceFolderPath, config);
      log(`Wrote ${target.label} MCP config for session ${current.sessionId} to ${result.filePath}.`);
      const action = await vscode.window.showInformationMessage(
        `Created ${target.label} MCP config at ${result.filePath}.`,
        "Open File",
      );
      if (action === "Open File") {
        await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(result.filePath));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`create_mcp_config.failed ${message}`);
      await vscode.window.showErrorMessage(`Could not create MCP config: ${message}`);
    }
  };

  const startBridgeCommand = vscode.commands.registerCommand(START_BRIDGE_COMMAND, async () => {
    const current = await controller.ensureStarted();
    const action = await vscode.window.showInformationMessage(
      `${PRODUCT_NAME} is running at ${current.bridgeUrl}. Session method: ${BRIDGE_METHODS.getSessionInfo}`,
      "Create MCP Config",
      "Show Status",
      "Show Output",
    );

    if (action === "Create MCP Config") {
      await createMcpConfig();
      return;
    }

    if (action === "Show Status") {
      await vscode.window.showInformationMessage(controller.getStatusSummary());
      return;
    }

    if (action === "Show Output") {
      outputChannel.show(true);
    }
  });

  const stopBridgeCommand = vscode.commands.registerCommand(STOP_BRIDGE_COMMAND, async () => {
    const wasRunning = await controller.stop();
    await vscode.window.showInformationMessage(
      wasRunning ? `${PRODUCT_NAME} stopped.` : `${PRODUCT_NAME} is already stopped.`,
    );
  });

  const showStatusCommand = vscode.commands.registerCommand(SHOW_STATUS_COMMAND, async () => {
    const message = controller.getStatusSummary();
    log(`Status requested. ${message.replace(/\n/g, " | ")}`);
    updateStatusBar();
    const action = await vscode.window.showInformationMessage(
      message,
      controller.getState() ? "Create MCP Config" : "Start Bridge",
      "Show Output",
    );
    if (action === "Create MCP Config") {
      await createMcpConfig();
      return;
    }
    if (action === "Start Bridge") {
      await controller.ensureStarted();
      return;
    }
    if (action === "Show Output") {
      outputChannel.show(true);
    }
  });

  const createMcpConfigCommand = vscode.commands.registerCommand(CREATE_MCP_CONFIG_COMMAND, createMcpConfig);

  const openCellNavigationCommand = vscode.commands.registerCommand(OPEN_CELL_NAVIGATION_COMMAND, async (request?: unknown) => {
      const parsed = normalizeCellNavigationRequest(request);
      if (!parsed) {
        void vscode.window.showErrorMessage("Expected { notebook_uri, cell_id, kind } with kind set to 'code' or 'output'.");
        return;
      }
      try {
        await queryApplicationService.revealCells(toRevealCellNavigationRequest(parsed));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log(`open_cell_navigation.failed ${message}`);
        void vscode.window.showErrorMessage(`Could not open notebook cell: ${message}`);
      }
    });

  await controller.ensureStarted();
  updateStatusBar();

  context.subscriptions.push(
    outputChannel,
    statusBarItem,
    registry,
    cellNavigationUriHandler,
    startBridgeCommand,
    stopBridgeCommand,
    showStatusCommand,
    createMcpConfigCommand,
    openCellNavigationCommand,
  );
}

export async function deactivate(): Promise<void> {
  await runtimeController?.stop();
  runtimeController = undefined;
}
