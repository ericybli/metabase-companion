import { ApiException, type ApiError } from './errors';

describe('ApiException', () => {
  it('carries the structured error on .error', () => {
    const err: ApiError = { kind: 'server', status: 500, message: 'boom' };
    const ex = new ApiException(err);
    expect(ex.error).toBe(err);
  });

  it('is an instance of Error', () => {
    const ex = new ApiException({ kind: 'unauthorized' });
    expect(ex).toBeInstanceOf(Error);
  });

  it('sets .message to the error kind', () => {
    const ex = new ApiException({ kind: 'notFound' });
    expect(ex.message).toBe('notFound');
  });

  it('exposes a network error message', () => {
    const ex = new ApiException({ kind: 'network', message: 'offline' });
    expect(ex.error).toEqual({ kind: 'network', message: 'offline' });
  });
});
