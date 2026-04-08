// jest.setup.js — Global mocks for i18n and LanguageContext

// Jest.mock hoisted olduğu için fonksiyonları mock factory içinde tanımlıyoruz.

// Mock i18n module — gerçek çeviri dosyasını kullan
jest.mock('./i18n', () => {
  // require factory içinde çağrılmalı
  const trTranslations = require('./i18n/tr').default;

  function resolveKey(key) {
    const parts = key.split('.');
    let result = trTranslations;
    for (const part of parts) {
      if (result && typeof result === 'object' && part in result) {
        result = result[part];
      } else {
        return key;
      }
    }
    return typeof result === 'string' ? result : key;
  }

  return {
    __esModule: true,
    t: jest.fn((key) => resolveKey(key)),
    default: {
      locale: 'tr',
      t: jest.fn((key) => resolveKey(key)),
    },
    loadSavedLanguage: jest.fn().mockResolvedValue('tr'),
    changeLanguage: jest.fn().mockResolvedValue(undefined),
  };
});

// Mock LanguageContext
jest.mock('./context/LanguageContext', () => {
  const React = require('react');
  return {
    __esModule: true,
    useLanguage: () => ({
      language: 'tr',
      setLanguage: jest.fn(),
    }),
    LanguageProvider: ({ children }) => React.createElement(React.Fragment, null, children),
  };
});
