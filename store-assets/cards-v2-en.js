const CARDS = {
  remove: {
    kicker: "PRECISE CONTROL",
    title: "Remove only what gets in your way",
    body: "Select an unwanted element right on the page. BlockIt remembers your choice and applies the rule on that site.",
    pills: ["You choose the element", "See the result instantly"]
  },
  mode: {
    kicker: "YOUR CHOICE",
    title: "Block it your way",
    body: "Remove the element and reclaim its space, or simply hide it while keeping the page layout intact.",
    pills: ["For a specific site", "No preset lists"]
  },
  build: {
    kicker: "RULE BUILDER",
    title: "Describe the element. BlockIt builds the rule.",
    body: "Choose only meaningful features: tag, classes, attributes, text, position, or surrounding elements. No syntax to memorize.",
    pills: ["Plain-language conditions", "CSS and BlockIt rules"]
  },
  preview: {
    kicker: "CHECK BEFORE SAVING",
    title: "Know what the rule will find",
    body: "BlockIt shows matches on the page and explains every condition in plain language. Check the result before saving.",
    pills: ["Live checking", "Human-readable preview"]
  },
  manage: {
    kicker: "STAY IN CONTROL",
    title: "All your rules in one place",
    body: "Disable or delete rules, and edit those created in the builder. Export and import them when moving to another device.",
    pills: ["Review rules anytime", "Export and import"]
  }
};

const query = new URLSearchParams(location.search);
const order = ["remove", "mode", "build", "preview", "manage"];
const card = order.includes(query.get("card")) ? query.get("card") : "remove";
const data = CARDS[card];
const artboard = document.querySelector("#artboard");

artboard.dataset.card = card;
artboard.dataset.locale = "en";
document.querySelector("#number").textContent = `${String(order.indexOf(card) + 1).padStart(2, "0")} / 05`;
document.querySelector("#kicker").textContent = data.kicker;
document.querySelector("#title").textContent = data.title;
document.querySelector("#body").textContent = data.body;
document.querySelector("#pills").innerHTML = data.pills.map((pill) => `<span><i>✓</i>${pill}</span>`).join("");

const VISUALS = {
  remove: `
    <div class="compare-stack">
      <figure class="page-shot page-before">
        <figcaption><b>BEFORE</b><span>An unwanted block takes up space</span></figcaption>
        <div class="shot-viewport"><img src="source/before.png" alt="Page with a selected advertising block"></div>
      </figure>
      <div class="result-arrow" aria-hidden="true"><span>↓</span><b>BlockIt applied the rule</b></div>
      <figure class="page-shot page-after">
        <figcaption><b>AFTER</b><span>Only what you need remains</span></figcaption>
        <div class="shot-viewport"><img src="source/after.png" alt="The same page after removing the block"></div>
      </figure>
    </div>`,
  mode: `
    <div class="mode-layout">
      <section class="mode-choices" aria-label="Blocking modes">
        <p>BLOCKING MODE</p>
        <article class="mode-option selected">
          <span class="radio"></span><i class="mode-icon">×</i>
          <div><b>Remove element</b><small>Element disappears,<br>space is reclaimed</small></div>
        </article>
        <article class="mode-option">
          <span class="radio"></span><i class="mode-icon ghost">○</i>
          <div><b>Hide element</b><small>Element is hidden,<br>space stays</small></div>
        </article>
        <div class="site-scope"><span>●</span><div><b>For this site</b><small>The rule works where you created it</small></div></div>
      </section>
      <figure class="popup-frame"><img src="source/advanced-en.png" alt="BlockIt advanced mode with blocking options"></figure>
    </div>`,
  build: `
    <section class="builder-card">
      <header><div><span class="tiny-logo">BI</span><b>Meaningful features</b></div><em>3 conditions</em></header>
      <div class="condition">
        <span class="toggle on"></span><div><small>TAG NAME</small><b>div</b></div><em>exact</em>
      </div>
      <div class="condition">
        <span class="toggle on"></span><div><small>CLASS</small><b>letter-list</b></div><em>starts with</em>
      </div>
      <div class="condition">
        <span class="toggle on"></span><div><small>TEXT INSIDE</small><b>advert</b></div><em>contains</em>
      </div>
      <div class="builder-more"><span>＋</span> Add a feature or related element</div>
      <footer><span class="wand">✦</span><div><small>BLOCKIT BUILDS THE RESULT</small><b>Rule ready to check</b></div><span class="arrow">→</span></footer>
    </section>`,
  preview: `
    <div class="preview-layout">
      <section class="matches-card">
        <small>MATCHES ON THE PAGE</small>
        <div><strong>1</strong><span><b>Exactly one element found</b><em>The rule is precise enough</em></span></div>
        <footer><i></i> Live checking</footer>
      </section>
      <section class="rule-preview">
        <header><b>Rule preview</b><span>BlockIt rule</span></header>
        <div class="tree">
          <h3>Blocked element <code>div</code></h3>
          <ul>
            <li>Number of classes: <b>exactly 3</b></li>
            <li>Class: <b>starts with “letter-list”</b></li>
            <li>Any text inside: <b>contains “advert”</b>, case-insensitive</li>
          </ul>
        </div>
        <div class="rule-code"><code>div:class-name(/^letter-list/):class-count(=3):text-contains("advert")</code><button aria-label="Copy">▣</button></div>
      </section>
    </div>`,
  manage: `
    <section class="rules-panel">
      <header><div><span class="tiny-logo">BI</span><b>Active rules</b></div><button>Check rules</button></header>
      <p class="rules-scope">For this site: <b>example.com</b> <span>3</span></p>
      <article class="rule-row"><i>×</i><div><b>Sponsored recommendation</b><small>BlockIt rule · 1 element found</small></div><button>Edit</button><button>Disable</button></article>
      <article class="rule-row"><i>×</i><div><b>Pop-up notification</b><small>CSS selector · 1 element found</small></div><button class="remove">Delete</button><button>Disable</button></article>
      <article class="rule-row muted"><i>×</i><div><b>Sidebar recommendation</b><small>Disabled</small></div><button class="remove">Delete</button><button class="enable">Enable</button></article>
      <footer><button><span>↓</span> Export rules</button><button><span>↑</span> Import rules</button></footer>
    </section>`
};

document.querySelector("#visual").innerHTML = VISUALS[card];
