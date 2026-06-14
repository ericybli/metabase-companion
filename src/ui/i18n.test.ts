import i18n, { changeLanguage } from './i18n';

describe('i18n', () => {
  it('login.title differs between en and zh', async () => {
    await changeLanguage('en');
    const en = i18n.t('login.title');
    await changeLanguage('zh');
    const zh = i18n.t('login.title');
    expect(en).toBe('Sign in');
    expect(zh).toBe('登录');
    expect(en).not.toBe(zh);
  });

  it('exposes setup, unlock and error namespaces', async () => {
    await changeLanguage('en');
    expect(i18n.t('setup.title')).toBe('Connect to Metabase');
    expect(i18n.t('unlock.title')).toBe('Unlock');
    expect(i18n.t('errors.unreachable')).toMatch(/reach/i);
  });
});
