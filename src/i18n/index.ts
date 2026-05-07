import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ar from './ar.json';
import en from './en.json';

const savedLang = (localStorage.getItem('app_lang') as 'ar' | 'en') || 'ar';
if (savedLang === 'en') {
  document.documentElement.lang = 'en';
  document.documentElement.dir = 'ltr';
}

i18n.use(initReactI18next).init({
  resources: {
    ar: { translation: ar },
    en: { translation: en },
  },
  lng: savedLang,
  fallbackLng: 'ar',
  interpolation: { escapeValue: false },
});

export default i18n;
