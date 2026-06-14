import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { loginWithGoogle, GoogleAuthCancelledError } from './googleAuth';

const BASE = 'https://demo.metabase.test';
const CLIENT_ID = 'gclient.apps.googleusercontent.com';
const server = setupServer();

const configure = GoogleSignin.configure as jest.Mock;
const signIn = GoogleSignin.signIn as jest.Mock;
const hasPlayServices = GoogleSignin.hasPlayServices as jest.Mock;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  configure.mockClear();
  signIn.mockReset();
  hasPlayServices.mockClear();
});
afterAll(() => server.close());

describe('loginWithGoogle', () => {
  it('configures webClientId, gets an idToken, exchanges it, and returns the session id', async () => {
    signIn.mockResolvedValue({ type: 'success', data: { idToken: 'g-id-token-xyz' } });
    server.use(
      http.post(`${BASE}/api/session/google_auth`, async ({ request }) => {
        const body = (await request.json()) as { token: string };
        expect(body).toEqual({ token: 'g-id-token-xyz' });
        return HttpResponse.json({ id: 'mb-session-789' });
      }),
    );

    await expect(loginWithGoogle(BASE, CLIENT_ID)).resolves.toBe('mb-session-789');
    expect(configure).toHaveBeenCalledWith(expect.objectContaining({ webClientId: CLIENT_ID }));
  });

  it('throws GoogleAuthCancelledError when the user cancels', async () => {
    const err = Object.assign(new Error('cancelled'), {
      code: statusCodes.SIGN_IN_CANCELLED,
    });
    signIn.mockRejectedValue(err);

    await expect(loginWithGoogle(BASE, CLIENT_ID)).rejects.toBeInstanceOf(GoogleAuthCancelledError);
  });

  it('throws when the response has no idToken', async () => {
    signIn.mockResolvedValue({ type: 'success', data: { idToken: null } });
    await expect(loginWithGoogle(BASE, CLIENT_ID)).rejects.toThrow(/idToken/i);
  });

  it('re-throws non-cancellation sign-in errors as-is', async () => {
    signIn.mockRejectedValue(
      Object.assign(new Error('play services'), {
        code: statusCodes.PLAY_SERVICES_NOT_AVAILABLE,
      }),
    );
    await expect(loginWithGoogle(BASE, CLIENT_ID)).rejects.toThrow('play services');
  });
});
