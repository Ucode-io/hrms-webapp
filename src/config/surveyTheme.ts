import type { ITheme } from 'survey-core'

/**
 * SurveyJS theme matched to the webview look: Inter, цвет компании как primary,
 * soft rounded corners, panelless (questions flow inside our own white
 * rounded-2xl card instead of drawing their own boxes).
 */
export const surveyTheme: ITheme = {
  themeName: 'default',
  colorPalette: 'light',
  isPanelless: true,
  backgroundOpacity: 1,
  cssVariables: {
    '--sjs-font-family': "'Inter', system-ui, -apple-system, sans-serif",
    '--sjs-font-size': '15px',
    '--sjs-corner-radius': '12px',
    '--sjs-base-unit': '7px',

    // Heading hierarchy (survey 24px > page 19px > question 15px), app colors.
    // The survey header h3 is additionally styled in index.css — this markup
    // variant ignores the surveytitle variables.
    '--sjs-font-surveytitle-color': 'rgba(17, 24, 39, 1)',
    '--sjs-font-surveytitle-size': '24px',
    '--sjs-font-surveytitle-weight': '700',
    '--sjs-font-surveydescription-color': 'rgba(107, 114, 128, 1)',
    '--sjs-font-surveydescription-size': '14px',
    '--sjs-font-pagetitle-color': 'rgba(17, 24, 39, 1)',
    '--sjs-font-pagetitle-size': '19px',
    '--sjs-font-pagetitle-weight': '600',
    '--sjs-font-pagedescription-color': 'rgba(107, 114, 128, 1)',
    '--sjs-font-pagedescription-size': '14px',

    // Page/card backgrounds: blend into our own white card.
    '--sjs-general-backcolor': 'rgba(255, 255, 255, 1)',
    '--sjs-general-backcolor-dim': 'rgba(255, 255, 255, 1)',
    '--sjs-general-backcolor-dim-light': 'rgba(249, 250, 251, 1)', // gray-50
    '--sjs-general-backcolor-dim-dark': 'rgba(243, 244, 246, 1)', // gray-100

    // Text: gray-900 / gray-500.
    '--sjs-general-forecolor': 'rgba(17, 24, 39, 1)',
    '--sjs-general-forecolor-light': 'rgba(107, 114, 128, 1)',
    '--sjs-general-dim-forecolor': 'rgba(17, 24, 39, 1)',
    '--sjs-general-dim-forecolor-light': 'rgba(107, 114, 128, 1)',

    // Primary: цвет компании (--accent, выставляется CompanyProvider).
    '--sjs-primary-backcolor': 'var(--accent)',
    '--sjs-primary-backcolor-light': 'var(--accent-soft)',
    '--sjs-primary-backcolor-dark': 'var(--accent-dark)',
    '--sjs-primary-forecolor': 'rgba(255, 255, 255, 1)',
    '--sjs-primary-forecolor-light': 'rgba(255, 255, 255, 0.25)',

    // Borders: gray-200 / gray-100.
    '--sjs-border-default': 'rgba(229, 231, 235, 1)',
    '--sjs-border-light': 'rgba(243, 244, 246, 1)',
    '--sjs-border-inside': 'rgba(229, 231, 235, 1)',

    // Soft shadows like the app cards.
    '--sjs-shadow-small': '0px 1px 2px 0px rgba(0, 0, 0, 0.06)',
    '--sjs-shadow-medium': '0px 2px 6px 0px rgba(0, 0, 0, 0.06)',
    '--sjs-shadow-large': '0px 8px 16px 0px rgba(0, 0, 0, 0.08)',
    '--sjs-shadow-inner': 'inset 0px 1px 2px 0px rgba(0, 0, 0, 0.08)',
    '--sjs-shadow-small-reset': '0px 0px 0px 0px rgba(0, 0, 0, 0)',
    '--sjs-shadow-inner-reset': 'inset 0px 0px 0px 0px rgba(0, 0, 0, 0)',

    // Status colors: green-500 / red-500 tuned to the app.
    '--sjs-special-green': 'rgba(34, 197, 94, 1)',
    '--sjs-special-green-light': 'rgba(34, 197, 94, 0.1)',
    '--sjs-special-red': 'rgba(239, 68, 68, 1)',
    '--sjs-special-red-light': 'rgba(239, 68, 68, 0.1)',
    '--sjs-special-blue': 'var(--accent)',
    '--sjs-special-blue-light': 'var(--accent-soft)',
  },
}
