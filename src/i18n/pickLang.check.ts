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
import { asLang, asLangs, LANG_CODES, pickLang } from './pickLang.ts'

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

// --- Набор языков региона -------------------------------------------------

// Пустой набор — «ограничения нет», а не «нет языков». Так выглядит и регион,
// где поле не заполняли, и сотрудник без региона (их в проде большинство).
assert.equal(pickLang({ stored: 'zh' }, []), 'zh')
assert.equal(pickLang({ telegram: 'uz' }, []), 'uz')

// Набор фильтрует всю цепочку, включая выбор сотрудника: отозванный язык
// отдаёт очередь дальше, а не показывает интерфейс без единой галочки.
assert.equal(pickLang({ stored: 'zh', telegram: 'ru' }, ['ru', 'en']), 'ru')
assert.equal(pickLang({ stored: 'zh', telegram: 'kk', region: 'en' }, ['ru', 'en']), 'en')

// Никто из цепочки в набор не попал — первый из набора.
assert.equal(pickLang({ stored: 'zh', telegram: 'kk', region: 'az' }, ['en', 'ru']), 'en')
assert.equal(pickLang({}, ['uz', 'ru']), 'uz')

// Язык региона тоже подчиняется набору: он звено цепочки, а не исключение.
assert.equal(pickLang({ region: 'zh' }, ['ru', 'uz']), 'ru')

// Набор из одного языка — ровно он, что бы ни знали про человека.
assert.equal(pickLang({ stored: 'en', telegram: 'ru' }, ['uz']), 'uz')

// `regions.languages` приходит массивом строк, и в нём может лежать что угодно:
// чужие коды отбрасываются, набор от этого не становится пустым.
assert.deepEqual(asLangs(['ru', 'de', 'uz']), ['ru', 'uz'])
assert.deepEqual(asLangs(null), [])
assert.deepEqual(asLangs('ru'), [])
assert.equal(pickLang({ stored: 'en' }, asLangs(['de', 'ru'])), 'ru')

console.log('pickLang: ok')
