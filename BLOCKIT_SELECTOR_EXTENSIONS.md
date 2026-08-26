# Расширения CSS-селекторов BlockIt

BlockIt сначала применяет обычную CSS-часть правила, а затем проверяет условия
ниже. Поэтому стандартные CSS-селекторы и XPath продолжают работать без
изменений. Расширения нужны только там, где обычный CSS не умеет описать
устойчивый признак.

## Динамические атрибуты

```css
div[data-*]
div[data-*^="id"]
div:attr-name(/^az-.*-huy$/)
div:attr(/^data-/, /^id/)
div:attrs([class, id, /^data-/])
div:class-name(/^(csr-uniq|ya-)/)
div:class-count(=3)
div:attribute-count(>=2)
```

- `[data-*]` — существует атрибут, имя которого начинается с `data-`.
- Поддерживаются те же операции со значением, что и в CSS: `=`, `^=`, `$=`,
  `*=`, `~=` и `|=`.
- `:attr-name(/regex/)` — regex для имени любого атрибута.
- `:attr(/name-regex/, /value-regex/)` — имя и значение одного атрибута.
- `:attrs([...])` — у элемента есть все перечисленные точные имена или regex
  имён атрибутов.
- `:class-name(/regex/)` — regex применяется к каждому отдельному классу.
- `:class-count(=3)` и `:attribute-count(>=2)` — число отдельных классов или
  HTML-атрибутов; операторы: `=`, `>=`, `<=`, `<`, `>`.

## Текст и HTML

```css
*:text(/реклама|advertisement/i)
span:own-text(/^Реклама$/i)
div:html(/data-r-i-[\w-]+/)
```

- `:text(/regex/)` проверяет нормализованный полный текст элемента, включая
  потомков.
- `:own-text(/regex/)` проверяет только непосредственные текстовые узлы.
- `:html(/regex/)` проверяет `outerHTML`; это экспертный и более хрупкий
  вариант, зависящий от разметки и порядка атрибутов.

## Структура

```css
div:within(section[role="dialog"])
div:near(iframe[height="36"])
div:children(iframe, >=1)
div:has(> iframe[scrolling="no"][height="36"])
```

- `:within(selector)` — элемент расположен внутри подходящего предка; границу
  Shadow Root при поиске предка BlockIt также проходит.
- `:near(selector)` — у элемента есть sibling, совпадающий с условием.
- `:children(selector, условие)` — число непосредственных детей, например
  `>=1`, `=2` или `<4`.
- Нативный `:has(...)` тоже поддерживается и обычно предпочтительнее, если
  достаточно обычной DOM-структуры.

## Живое состояние

```css
div:visible()
div:size(height>80, width>=300)
div:style(position, fixed)
video:property(autoplay, true)
button:accessible(role="button", name=/закрыть|скрыть/i)
```

- `:visible()` исключает `display:none`, невидимые, прозрачные и нулевого
  размера элементы.
- `:size(...)` сравнивает фактический прямоугольник элемента в пикселях.
- `:style(name, value)` проверяет вычисленный CSS-стиль.
- `:property(name, value)` проверяет DOM-свойство.
- `:accessible(...)` поддерживает `role="..."` и `name=/.../`; имя берётся из
  `aria-label`, `aria-labelledby` или текста.

Эти признаки зависят от текущего состояния страницы и размера окна, поэтому
они менее устойчивы, чем атрибуты и структура.

## iframe и Shadow DOM

```css
iframe:frame-has(*:own-text(/^Реклама$/i))
div:has-frame(> iframe, *:own-text(/^Реклама$/i))
:in-frame(url=/docviewer\.yandex\.ru/) div:attr-name(/^data-/)
*:in-shadow(.widget-host):text(/Реклама/i)
```

- `:frame-has(selector)` выбирает iframe, если в его документе есть
  совпадение. BlockIt обменивается сигналом между родительским и дочерним
  фреймами, поэтому это рассчитано и на кросс-доменные iframe, доступные
  расширению.
- `:has-frame(iframe-selector, selector-внутри-iframe)` выбирает внешний
  контейнер, если подходящий iframe среди его потомков содержит совпадение.
- `:in-frame(url=/regex/)` ограничивает правило документами iframe, URL которых
  совпадает с regex. Вместо `url` можно использовать `title`.
- `:in-shadow(selector)` оставляет только элементы внутри Shadow Root, чей host
  совпадает с селектором.

Обычный CSS не пересекает границы iframe и Shadow Root. BlockIt обходит каждый
доступный iframe и все открытые либо перехваченные закрытые Shadow Root.

## Пример для динамической рекламной обёртки

```css
div[class][id^="id"][data-*]:has(> iframe[scrolling="no"][allowfullscreen][height="36"][width="100%"]) 
```

Такое правило не зависит от полных динамических значений `class`, `id` и
`data-...`, но требует характерную структуру iframe. Перед сохранением всегда
проверяйте счётчик найденных элементов.
