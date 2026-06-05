export type OpenAthorErrorJson = {
  code: string;
  message: string;
  recoverable: boolean;
  hints: string[];
};

export class OpenAthorError extends Error {
  readonly code: string;
  readonly recoverable: boolean;
  readonly hints: string[];
  readonly exitCode: number;

  constructor(
    code: string,
    message: string,
    options: {
      recoverable?: boolean;
      hints?: string[];
      exitCode?: number;
    } = {},
  ) {
    super(message);
    this.name = "OpenAthorError";
    this.code = code;
    this.recoverable = options.recoverable ?? true;
    this.hints = options.hints ?? [];
    this.exitCode = options.exitCode ?? 1;
  }

  toJSON(): OpenAthorErrorJson {
    return {
      code: this.code,
      message: this.message,
      recoverable: this.recoverable,
      hints: this.hints,
    };
  }
}
