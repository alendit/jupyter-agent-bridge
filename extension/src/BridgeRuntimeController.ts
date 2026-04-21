export interface BridgeRuntimeControllerOptions<TState> {
  start: () => Promise<TState>;
  stop: (state: TState) => Promise<void>;
  formatRunningSummary: (state: TState) => string;
  stoppedSummary: string;
  onStateChanged?: (state: TState | undefined) => void;
}

export class BridgeRuntimeController<TState> {
  private state: TState | undefined;

  public constructor(private readonly options: BridgeRuntimeControllerOptions<TState>) {}

  public getState(): TState | undefined {
    return this.state;
  }

  public getStatusSummary(): string {
    if (!this.state) {
      return this.options.stoppedSummary;
    }

    return this.options.formatRunningSummary(this.state);
  }

  public async ensureStarted(): Promise<TState> {
    if (this.state) {
      return this.state;
    }

    const nextState = await this.options.start();
    this.state = nextState;
    this.options.onStateChanged?.(nextState);
    return nextState;
  }

  public async stop(): Promise<boolean> {
    if (!this.state) {
      return false;
    }

    const current = this.state;
    this.state = undefined;
    this.options.onStateChanged?.(undefined);
    await this.options.stop(current);
    return true;
  }
}
