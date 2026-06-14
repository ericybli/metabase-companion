export type ApiError =
  | { kind: 'network'; message: string }
  | { kind: 'unauthorized' } // HTTP 401
  | { kind: 'forbidden' } // HTTP 403
  | { kind: 'notFound' } // HTTP 404
  | { kind: 'server'; status: number; message: string }
  | { kind: 'parse'; message: string };

export class ApiException extends Error {
  constructor(public readonly error: ApiError) {
    super(error.kind);
    this.name = 'ApiException';
    // Restore the prototype chain (TS target downlevels `extends Error`).
    Object.setPrototypeOf(this, ApiException.prototype);
  }
}
