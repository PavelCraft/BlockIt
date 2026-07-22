## 🇬🇧 English

### Description

**BlockIt** is a lightweight browser extension that allows you to remove unwanted HTML elements from any website. Unlike traditional ad blockers that rely on pre-built filter lists, BlockIt puts the power in your hands:

- **Element-based blocking:** Right-click any element, copy its HTML, paste it into BlockIt, and the extension will suggest a CSS selector to hide it.
- **Manual selector input:** For advanced users, write your own CSS selectors to handle complex or dynamic pages.
- **Real-time preview:** BlockIt checks if the selector matches exactly one element. If it matches multiple elements, you'll get a warning.
- **Permanent blocking:** Once added, the rule will hide the element every time you visit the page.

### How It Works

1. **Find the element:** Right-click on any page element → "Inspect" → find the exact node in the HTML tree.
2. **Copy the element:** Right-click the node in DevTools → "Copy" → "Copy element".
3. **Create a rule:** Click the BlockIt icon → "Add rule" → paste the copied HTML into the input field.
4. **Review selector:** BlockIt will suggest a CSS selector based on the element's attributes. You can edit it if needed.
5. **Confirm or warn:** If the selector matches more than one element, you'll see a warning. Confirm, and the element is blocked forever.

You can also skip steps 1–2 and write a custom CSS selector directly in the rule editor.

### Why BlockIt?

- **Blocks everything:** Advertisements, cookie banners, "Sign up" popups, distracting sidebars, sponsored posts in feeds — you name it.
- **Privacy-friendly:** All rules are stored locally in your browser. No data is sent anywhere.
- **Open source:** Fork it, modify it, contribute back. BSD 3-Clause license.

---

## 🇷🇺 Русский

### Описание

**BlockIt** — это лёгкое расширение для браузера, которое позволяет удалять нежелательные HTML-элементы с любых сайтов. В отличие от классических блокировщиков рекламы, которые используют готовые списки фильтров, BlockIt даёт управление в руки пользователя:

- **Блокировка по элементу:** Кликните правой кнопкой по любому элементу, скопируйте его HTML, вставьте в BlockIt — расширение предложит CSS-селектор для блокировки.
- **Ручной ввод селектора:** Для продвинутых пользователей — напишите свой собственный CSS-селектор, чтобы справиться со сложными или динамическими страницами.
- **Предварительный просмотр:** BlockIt проверяет, соответствует ли селектор ровно одному элементу. Если элементов несколько — вы получите предупреждение.
- **Постоянная блокировка:** После добавления правила элемент будет скрываться при каждом посещении страницы.

### Как это работает

1. **Найдите элемент:** Кликните правой кнопкой по элементу на странице → «Посмотреть код» → найдите нужный узел в дереве HTML.
2. **Скопируйте элемент:** Кликните правой кнопкой по узлу в DevTools → «Copy» → «Copy element».
3. **Создайте правило:** Кликните по иконке BlockIt → «Добавить правило» → вставьте скопированный HTML в поле.
4. **Проверьте селектор:** BlockIt предложит CSS-селектор на основе атрибутов элемента. Вы можете отредактировать его, если какие-то атрибуты слишком узкие или ненадёжные.
5. **Подтвердите или предупредите:** Если селектор находит больше одного элемента, вы увидите предупреждение. После подтверждения элемент будет заблокирован.

Вы также можете пропустить шаги 1–2 и написать селектор вручную прямо в редакторе правил.

### Зачем BlockIt?

- **Блокирует всё:** Рекламу, баннеры о куках, попапы «Зарегистрируйтесь», отвлекающие боковые панели, спонсорские посты в лентах — что угодно.
- **Безопасность:** Все правила хранятся локально в вашем браузере. Никакие данные никуда не отправляются.
- **Открытый исходный код:** Форкайте, изменяйте, вносите свой вклад. Лицензия BSD 3-Clause.
