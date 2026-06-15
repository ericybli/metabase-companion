import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

export const resources = {
  en: {
    translation: {
      common: {
        cancel: 'Cancel',
        retry: 'Retry',
        save: 'Save',
        email: 'Email',
        password: 'Password',
      },
      setup: {
        title: 'Connect to Metabase',
        urlLabel: 'Instance URL',
        urlPlaceholder: 'https://metabase.example.com',
        connect: 'Connect',
        connecting: 'Connecting…',
      },
      login: {
        title: 'Sign in',
        signIn: 'Sign in',
        signingIn: 'Signing in…',
        google: 'Sign in with Google',
        rememberMe: 'Remember me',
      },
      unlock: {
        title: 'Unlock',
        prompt: 'Unlock Metabase Companion',
        retry: 'Try again',
        logout: 'Log out',
      },
      settings: {
        title: 'Settings',
        theme: 'Theme',
        language: 'Language',
        themeSystem: 'System',
        themeLight: 'Light',
        themeDark: 'Dark',
        langSystem: 'System',
        logout: 'Log out',
      },
      home: {
        signedInAs: 'Signed in as {{email}}',
        title: 'Dashboards',
        empty: 'No dashboards yet.',
      },
      tabs: { home: 'Home' },
      dashboard: {
        back: 'Back',
        empty: 'This dashboard has no cards.',
        filters: 'Filters',
        apply: 'Apply',
        rotate: 'Rotate',
        resetZoom: 'Reset zoom',
        select: 'Select…',
        clear: 'Clear',
      },
      chart: {
        noData: 'No data',
        showingNofM: 'Showing {{shown}} of {{total}}',
        unsupported: 'Shown as a table ({{display}} not yet supported)',
        queryFailed: 'Query failed',
        legendHide: 'Hide {{name}} series',
        legendShow: 'Show {{name}} series',
      },
      errors: {
        invalidUrl: 'That URL doesn’t look right.',
        unreachable: 'Couldn’t reach that instance. Check the URL and your connection.',
        unauthorized: 'Wrong email or password.',
        generic: 'Something went wrong. Please try again.',
      },
    },
  },
  zh: {
    translation: {
      common: {
        cancel: '取消',
        retry: '重试',
        save: '保存',
        email: '邮箱',
        password: '密码',
      },
      setup: {
        title: '连接到 Metabase',
        urlLabel: '实例地址',
        urlPlaceholder: 'https://metabase.example.com',
        connect: '连接',
        connecting: '连接中…',
      },
      login: {
        title: '登录',
        signIn: '登录',
        signingIn: '登录中…',
        google: '使用 Google 登录',
        rememberMe: '记住我',
      },
      unlock: {
        title: '解锁',
        prompt: '解锁 Metabase Companion',
        retry: '重试',
        logout: '退出登录',
      },
      settings: {
        title: '设置',
        theme: '主题',
        language: '语言',
        themeSystem: '跟随系统',
        themeLight: '浅色',
        themeDark: '深色',
        langSystem: '跟随系统',
        logout: '退出登录',
      },
      home: {
        signedInAs: '已登录：{{email}}',
        title: '仪表盘',
        empty: '还没有仪表盘。',
      },
      tabs: { home: '首页' },
      dashboard: {
        back: '返回',
        empty: '该仪表盘没有卡片。',
        filters: '筛选',
        apply: '应用',
        rotate: '旋转',
        resetZoom: '重置缩放',
        select: '请选择…',
        clear: '清除',
      },
      chart: {
        noData: '暂无数据',
        showingNofM: '显示 {{shown}} / {{total}}',
        unsupported: '以表格显示（{{display}} 暂不支持）',
        queryFailed: '查询失败',
        legendHide: '隐藏{{name}}系列',
        legendShow: '显示{{name}}系列',
      },
      errors: {
        invalidUrl: '该地址格式不正确。',
        unreachable: '无法连接到该实例。请检查地址和网络连接。',
        unauthorized: '邮箱或密码错误。',
        generic: '出错了，请重试。',
      },
    },
  },
} as const;

function deviceLanguage(): 'en' | 'zh' {
  const code = getLocales()[0]?.languageCode ?? 'en';
  return code.startsWith('zh') ? 'zh' : 'en';
}

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: deviceLanguage(),
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

/**
 * Apply a locale preference. 'system' resolves to the device language.
 */
export function changeLanguage(locale: 'system' | 'en' | 'zh'): Promise<unknown> {
  const target = locale === 'system' ? deviceLanguage() : locale;
  return i18n.changeLanguage(target);
}

export default i18n;
