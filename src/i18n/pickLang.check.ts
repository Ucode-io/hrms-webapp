/**
 * Проверка цепочки выбора языка (ADR-0006).
 *
 * Запуск: `yarn check:lang`. Руками, а не из `build`: образ сборки —
 * `node:20-alpine`, а `--experimental-strip-types` появился в Node 22.6, и
 * проверка валит прод-сборку с `bad option` (проверено деплоем 21.09.2026).
 *
 * Половину того, что она стережёт, сборка проверяет и так: `DICTS` объявлен
 * `Record<Lang, …>`, поэтому язык без словаря не проходит `tsc -b`. Здесь
 * остаётся поведение цепочки, которое типами не выражается.
 *
 * Без vitest и без jsdom: цепочка — чистая функция, а тестовый раннер ради
 * полутора десятков утверждений был бы дороже проверяемого кода.
 */

import assert from 'node:assert/strict'
import { asLang, LANG_CODES, pickLang } from './pickLang.ts'

// Выбор сотрудника сильнее всего: он и есть знание о человеке.
assert.equal(pickLang({ stored: 'en', telegram: 'zh', region: 'az' }), 'en')

// Telegram знает про человека, регион — только про место. Русскоязычный
// программист в китайском филиале получает русский, а не китайский.
assert.equal(pickLang({ telegram: 'ru', region: 'zh' }), 'ru')

// Про человека не известно ничего — отвечает регион.
assert.equal(pickLang({ region: 'zh' }), 'zh')

// Молчат все — русский.
assert.equal(pickLang({}), 'ru')

// Неподдерживаемое значение равносильно молчанию: очередь идёт дальше, а не
// обрывается в русский. Иначе `de` в Telegram погасил бы язык региона.
assert.equal(pickLang({ telegram: 'de', region: 'az' }), 'az')
assert.equal(pickLang({ stored: 'sv', telegram: 'uz' }), 'uz')

// Telegram шлёт `zh-hans`, админка — слаг `az`; оба должны опознаваться.
assert.equal(asLang('zh-Hans'), 'zh')
assert.equal(asLang('ru-RU'), 'ru')
assert.equal(asLang('AZ'), 'az')
assert.equal(asLang(''), null)
assert.equal(asLang(undefined), null)

// Пустой словарь — не повод отказать языку: az заведён пустым намеренно,
// `translate()` откатывается в ru по каждому ключу.
assert.equal(pickLang({ stored: 'az' }), 'az')

// Все шесть языков приложения опознаются: список в pickLang и словари в DICTS
// обязаны сходиться, иначе язык выбирается и ничего не меняет.
for (const code of LANG_CODES) assert.equal(asLang(code), code)

console.log('pickLang: ok')
