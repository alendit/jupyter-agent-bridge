const PRODUCT_NAME = "Jupyter Agentic Bridge";

export interface BridgeStatusBarPresentation {
  text: string;
  colorThemeKey?: string;
}

export function getBridgeStatusBarPresentation(isRunning: boolean): BridgeStatusBarPresentation {
  return {
    text: isRunning ? `$(plug) ${PRODUCT_NAME}` : `$(debug-disconnect) ${PRODUCT_NAME}`,
  };
}
