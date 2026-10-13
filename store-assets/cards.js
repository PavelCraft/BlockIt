const CARDS = {
  remove: {
    kicker: "ТОЧЕЧНОЕ УПРАВЛЕНИЕ",
    title: "Убирайте именно то, что мешает",
    body: "Выберите элемент на странице — BlockIt удалит или скроет его и сохранит правило для этого сайта.",
    pills: ["Выбор за вами", "Удалить или скрыть"]
  },
  own: {
    kicker: "ВАШ ВЫБОР",
    title: "Не готовые списки. Ваши правила.",
    body: "Решайте сами, какие элементы должны исчезнуть. Каждое правило можно увидеть, отключить или удалить.",
    pills: ["Для каждого сайта", "Без чужих списков"]
  },
  syntax: {
    kicker: "КОНСТРУКТОР ПРАВИЛА",
    title: "Не нужно помнить синтаксис селекторов",
    body: "Укажите понятные признаки элемента — BlockIt сформирует правило и покажет готовый селектор.",
    pills: ["Классы и текст", "Селектор формируется сам"]
  },
  check: {
    kicker: "ПРОВЕРКА ДО СОХРАНЕНИЯ",
    title: "Сразу видно, как сработает правило",
    body: "BlockIt покажет количество совпадений и объяснит, по каким признакам найден элемент.",
    pills: ["Проверка в реальном времени", "Понятный предпросмотр"]
  },
  manage: {
    kicker: "ПОЛНЫЙ КОНТРОЛЬ",
    title: "Все правила остаются под вашим контролем",
    body: "Просматривайте, отключайте и удаляйте правила. Экспортируйте их, чтобы перенести на другое устройство.",
    pills: ["Включить или отключить", "Экспорт и импорт"]
  },
  promo: {
    kicker: "BLOCKIT",
    title: "Ваши страницы. Ваши правила.",
    body: "Убирайте только то, что выбрали сами.",
    pills: []
  },
  marquee: {
    kicker: "УПРАВЛЯЙТЕ СТРАНИЦАМИ САМИ",
    title: "Ваши страницы. Ваши правила.",
    body: "Выбирайте элементы, понимайте условия и сохраняйте собственные правила.",
    pills: []
  }
};

const query = new URLSearchParams(location.search);
const card = CARDS[query.get("card")] ? query.get("card") : "remove";
const data = CARDS[card];
const artboard = document.querySelector("#artboard");
artboard.dataset.card = card;
document.querySelector("#number").textContent = `${Object.keys(CARDS).indexOf(card) + 1} / 5`;
document.querySelector("#kicker").textContent = data.kicker;
document.querySelector("#title").textContent = data.title;
document.querySelector("#body").textContent = data.body;
document.querySelector("#pills").innerHTML = data.pills.map((pill) => `<span><i></i>${pill}</span>`).join("");

const VISUALS = {
  remove: `
    <div class="compare">
      <figure class="browser before"><figcaption><b>ДО</b><span>Элемент мешает</span></figcaption><div class="browser-bar"><i></i><i></i><i></i></div><img src="source/before.png" alt="Страница до применения правила"></figure>
      <div class="compare-arrow" aria-hidden="true">→</div>
      <figure class="browser after"><figcaption><b>ПОСЛЕ</b><span>Элемент удалён</span></figcaption><div class="browser-bar"><i></i><i></i><i></i></div><img src="source/after.png" alt="Страница после применения правила"></figure>
    </div>`,
  own: `
    <div class="popup-stage">
      <div class="choice-note"><span>✓</span><div><b>Вы решаете сами</b><small>что убрать с этой страницы</small></div></div>
      <figure class="crop crop-rules"><img src="source/rules.png" alt="Правила BlockIt для текущего сайта"></figure>
      <div class="control-chips"><span>Отключить</span><span>Удалить</span></div>
    </div>`,
  syntax: `
    <div class="builder-composition">
      <div class="step-label first"><span>1</span>Укажите признаки</div>
      <figure class="crop builder-fields"><img src="source/rule-builder.png" alt="Условия в конструкторе правила"></figure>
      <div class="flow-arrow"><span>BlockIt формирует правило</span>→</div>
      <div class="step-label second"><span>2</span>Получите селектор</div>
      <figure class="crop builder-preview"><img src="source/rule-builder.png" alt="Предпросмотр и готовый селектор"></figure>
    </div>`,
  check: `
    <div class="check-stage">
      <div class="match-badge"><b>1</b><span>точное<br>совпадение</span></div>
      <figure class="crop check-panel"><img src="source/rule-builder.png" alt="Проверка совпадений и предпросмотр правила"></figure>
      <div class="explain-card"><i></i><span>Класс начинается с <b>letter-list</b></span><i></i><span>Внутри есть текст <b>«реклам»</b></span></div>
    </div>`,
  manage: `
    <div class="manage-stage">
      <figure class="crop manage-rules"><img src="source/rules.png" alt="Список активных правил BlockIt"></figure>
      <figure class="crop manage-tools"><img src="source/tools.png" alt="Экспорт и импорт правил BlockIt"></figure>
      <div class="manage-label"><span>Ваши правила</span><b>всегда можно изменить</b></div>
    </div>`,
  promo: `
    <div class="promo-mark">
      <span class="selection-corners"><i></i><i></i><i></i><i></i></span>
      <img src="source/icon.png" alt="">
      <b>Выбрано вами</b>
    </div>`,
  marquee: `
    <div class="marquee-stage">
      <figure class="crop marquee-before"><img src="source/before.png" alt="Выбранный элемент страницы"></figure>
      <div class="marquee-flow"><span>выбрать</span><i>→</i><span>проверить</span><i>→</i><span>применить</span></div>
      <figure class="crop marquee-preview"><img src="source/rule-builder.png" alt="Понятный предпросмотр правила"></figure>
    </div>`
};

document.querySelector("#visual").innerHTML = VISUALS[card];
