const CARDS = {
  remove: {
    kicker: "ТОЧНЫЙ ВЫБОР",
    title: "Уберите только то, что мешает",
    body: "Выберите ненужный элемент прямо на странице. BlockIt запомнит ваш выбор и будет применять правило на этом сайте.",
    pills: ["Вы выбираете элемент", "Результат виден сразу"]
  },
  mode: {
    kicker: "ВАШИ РЕШЕНИЯ",
    title: "Блокируйте так, как нужно вам",
    body: "Удалите элемент вместе с занимаемым местом или только скройте его, сохранив вёрстку страницы.",
    pills: ["Для конкретного сайта", "Без готовых списков"]
  },
  build: {
    kicker: "КОНСТРУКТОР ПРАВИЛА",
    title: "Опишите элемент. Правило соберётся само.",
    body: "Выберите только значимые признаки: тег, классы, атрибуты, текст, положение или окружение. Синтаксис помнить не нужно.",
    pills: ["Понятные условия", "CSS и правила BlockIt"]
  },
  preview: {
    kicker: "ПРОВЕРКА ДО СОХРАНЕНИЯ",
    title: "Понятно, что найдёт правило",
    body: "BlockIt показывает совпадения на странице и объясняет каждое условие обычными словами. Результат можно проверить заранее.",
    pills: ["Проверка в реальном времени", "Человекочитаемый предпросмотр"]
  },
  manage: {
    kicker: "ВСЁ ПОД КОНТРОЛЕМ",
    title: "Все правила — в одном месте",
    body: "Отключайте и удаляйте правила, а созданные в конструкторе — редактируйте. Экспорт и импорт помогут перенести их на другое устройство.",
    pills: ["Правила можно пересмотреть", "Экспорт и импорт"]
  }
};

const query = new URLSearchParams(location.search);
const order = ["remove", "mode", "build", "preview", "manage"];
const card = order.includes(query.get("card")) ? query.get("card") : "remove";
const data = CARDS[card];
const artboard = document.querySelector("#artboard");

artboard.dataset.card = card;
document.querySelector("#number").textContent = `${String(order.indexOf(card) + 1).padStart(2, "0")} / 05`;
document.querySelector("#kicker").textContent = data.kicker;
document.querySelector("#title").textContent = data.title;
document.querySelector("#body").textContent = data.body;
document.querySelector("#pills").innerHTML = data.pills.map((pill) => `<span><i>✓</i>${pill}</span>`).join("");

const VISUALS = {
  remove: `
    <div class="compare-stack">
      <figure class="page-shot page-before">
        <figcaption><b>ДО</b><span>Ненужный блок занимает место</span></figcaption>
        <div class="shot-viewport"><img src="source/before.png" alt="Страница с выбранным рекламным блоком"></div>
      </figure>
      <div class="result-arrow" aria-hidden="true"><span>↓</span><b>BlockIt применил правило</b></div>
      <figure class="page-shot page-after">
        <figcaption><b>ПОСЛЕ</b><span>Осталось только нужное</span></figcaption>
        <div class="shot-viewport"><img src="source/after.png" alt="Та же страница после удаления блока"></div>
      </figure>
    </div>`,
  mode: `
    <div class="mode-layout">
      <section class="mode-choices" aria-label="Способы блокировки">
        <p>СПОСОБ БЛОКИРОВКИ</p>
        <article class="mode-option selected">
          <span class="radio"></span><i class="mode-icon">×</i>
          <div><b>Удалить элемент</b><small>Элемент исчезнет,<br>место освободится</small></div>
        </article>
        <article class="mode-option">
          <span class="radio"></span><i class="mode-icon ghost">○</i>
          <div><b>Скрыть элемент</b><small>Элемент не виден,<br>место сохраняется</small></div>
        </article>
        <div class="site-scope"><span>●</span><div><b>Для этого сайта</b><small>Правило действует там, где вы его создали</small></div></div>
      </section>
      <figure class="popup-frame"><img src="source/advanced-ru.png" alt="Продвинутый режим BlockIt с выбором способа блокировки"></figure>
    </div>`,
  build: `
    <section class="builder-card">
      <header><div><span class="tiny-logo">BI</span><b>Значимые признаки</b></div><em>3 условия</em></header>
      <div class="condition">
        <span class="toggle on"></span><div><small>ИМЯ ТЕГА</small><b>div</b></div><em>точно</em>
      </div>
      <div class="condition">
        <span class="toggle on"></span><div><small>КЛАСС</small><b>letter-list</b></div><em>начинается с</em>
      </div>
      <div class="condition">
        <span class="toggle on"></span><div><small>ТЕКСТ ВНУТРИ</small><b>реклам</b></div><em>содержит</em>
      </div>
      <div class="builder-more"><span>＋</span> Добавить признак или связанный элемент</div>
      <footer><span class="wand">✦</span><div><small>BLOCKIT СОБИРАЕТ РЕЗУЛЬТАТ</small><b>Правило готово к проверке</b></div><span class="arrow">→</span></footer>
    </section>`,
  preview: `
    <div class="preview-layout">
      <section class="matches-card">
        <small>СОВПАДЕНИЯ НА СТРАНИЦЕ</small>
        <div><strong>1</strong><span><b>Найден ровно один элемент</b><em>Правило достаточно точное</em></span></div>
        <footer><i></i> Проверка в реальном времени</footer>
      </section>
      <section class="rule-preview">
        <header><b>Предпросмотр правила</b><span>Правило BlockIt</span></header>
        <div class="tree">
          <h3>Блокируемый элемент <code>div</code></h3>
          <ul>
            <li>Количество классов: <b>ровно 3</b></li>
            <li>Класс: <b>начинается с «letter-list»</b></li>
            <li>Любой текст внутри: <b>содержит «реклам»</b>, без учёта регистра</li>
          </ul>
        </div>
        <div class="rule-code"><code>div:class-name(/^letter-list/):class-count(=3):text-contains("реклам")</code><button aria-label="Копировать">▣</button></div>
      </section>
    </div>`,
  manage: `
    <section class="rules-panel">
      <header><div><span class="tiny-logo">BI</span><b>Активные правила</b></div><button>Проверить правила</button></header>
      <p class="rules-scope">Для этого сайта: <b>example.com</b> <span>3</span></p>
      <article class="rule-row"><i>×</i><div><b>Блок с рекламной рекомендацией</b><small>Правило BlockIt · найден 1 элемент</small></div><button>Изменить</button><button>Отключить</button></article>
      <article class="rule-row"><i>×</i><div><b>Всплывающее уведомление</b><small>CSS-селектор · найден 1 элемент</small></div><button class="remove">Удалить</button><button>Отключить</button></article>
      <article class="rule-row muted"><i>×</i><div><b>Боковая рекомендация</b><small>Отключено</small></div><button class="remove">Удалить</button><button class="enable">Включить</button></article>
      <footer><button><span>↓</span> Экспорт правил</button><button><span>↑</span> Импорт правил</button></footer>
    </section>`
};

document.querySelector("#visual").innerHTML = VISUALS[card];
