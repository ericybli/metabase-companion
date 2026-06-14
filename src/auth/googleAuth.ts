import {
  GoogleSignin,
  isSuccessResponse,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { MetabaseClient } from '../api/client';
import { SessionTokenSchema } from '../api/schemas';

/** Thrown when the user dismisses the native Google sign-in sheet. */
export class GoogleAuthCancelledError extends Error {
  constructor() {
    super('Google sign-in was cancelled');
    this.name = 'GoogleAuthCancelledError';
  }
}

/**
 * Native Google sign-in -> idToken -> POST /api/session/google_auth -> token id.
 *
 * AUDIENCE CAVEAT: Metabase validates the idToken's `aud` claim against its
 * configured Google client id. We pass that exact id as `webClientId` so the
 * Google SDK mints an idToken whose audience == googleAuthClientId. This is the
 * only way the exchange can succeed; an Android OAuth client id would produce a
 * token with the wrong audience. Acceptance by a given instance must still be
 * validated live (some configs reject native-SDK tokens) — on failure callers
 * should fall back to password login. See spec §4.2.
 */
export async function loginWithGoogle(
  baseUrl: string,
  googleAuthClientId: string,
): Promise<string> {
  GoogleSignin.configure({ webClientId: googleAuthClientId });

  let idToken: string | null;
  try {
    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) {
      // type === 'cancelled' (user dismissed without picking an account)
      throw new GoogleAuthCancelledError();
    }
    idToken = response.data.idToken;
  } catch (e) {
    if (e instanceof GoogleAuthCancelledError) throw e;
    if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) {
      throw new GoogleAuthCancelledError();
    }
    throw e;
  }

  if (idToken == null || idToken === '') {
    throw new Error('Google sign-in returned no idToken (check webClientId / OAuth config)');
  }

  const client = new MetabaseClient({ baseUrl, getToken: () => null });
  const token = await client.post(
    '/api/session/google_auth',
    { token: idToken },
    SessionTokenSchema,
  );
  return token.id;
}
