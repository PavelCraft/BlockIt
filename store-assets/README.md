# BlockIt promo cards

## Новый единый комплект для магазина и сайта

Пять русских и пять английских карточек 1280×800 собираются отдельным генератором:

```bash
node store-assets/export-v2.mjs
```

Готовые изображения сохраняются в `store-assets/output/cards-ru/` и `store-assets/output/cards-en/`. Для предварительного просмотра используются `index-v2.html` и `index-v2-en.html`; прежний комплект сохранён рядом для сравнения.

Универсальные изображения Chrome Web Store сохраняются в `store-assets/output/store-promo/`:

- `promo-small.png` — 440×280;
- `promo-marquee.png` — 1400×560.

## Предыдущий комплект

Русские материалы Chrome Web Store:

- пять карточек 1280×800;
- малая промокарточка 440×280;
- большая промокарточка 1400×560.

```bash
node store-assets/export.mjs
```

Готовые PNG сохраняются в `store-assets/output/store/`.

Для просмотра отдельной карточки запустите `node store-assets/server.mjs` и откройте, например:

`http://127.0.0.1:8788/?card=syntax`
