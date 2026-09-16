// Shared behavior for every localized instruction page.
(() => {
  const language = document.documentElement.lang || 'en';
  const translations = {
    ru: { step: 'Перейти к шагу', expand: 'Развернуть описание', collapse: 'Свернуть описание', menu: 'Меню элемента', openImage: 'Открыть изображение' },
    en: { step: 'Go to step', expand: 'Expand description', collapse: 'Collapse description', menu: 'Element menu', openImage: 'Open image' },
    de: { step: 'Zu Schritt', expand: 'Beschreibung erweitern', collapse: 'Beschreibung einklappen', menu: 'Elementmenü', openImage: 'Bild öffnen' },
    es: { step: 'Ir al paso', expand: 'Expandir descripción', collapse: 'Contraer descripción', menu: 'Menú del elemento', openImage: 'Abrir imagen' },
    fr: { step: 'Aller à l’étape', expand: 'Développer la description', collapse: 'Réduire la description', menu: 'Menu de l’élément', openImage: 'Ouvrir l’image' },
    pt: { step: 'Ir para a etapa', expand: 'Expandir descrição', collapse: 'Recolher descrição', menu: 'Menu do elemento', openImage: 'Abrir imagem' },
    ja: { step: 'ステップへ移動', expand: '説明を展開', collapse: '説明を折りたたむ', menu: '要素メニュー', openImage: '画像を開く' },
    'zh-CN': { step: '转到步骤', expand: '展开说明', collapse: '收起说明', menu: '元素菜单', openImage: '打开图片' }
  };
  const ui = translations[language] || translations.en;
  // Screenshot narratives are shared by galleries that reuse the same image.
  // Keep the English DevTools command beside its localized name.
  const galleryNarratives = {
    pt: {
      1: ['Abrir o DevTools', 'Clique com o botão direito junto do elemento e escolha «Inspecionar» / “Inspect”.'],
      2: ['Selecionar o elemento', 'Encontre o contentor exterior no HTML. Ao passar sobre uma linha, o DevTools realça a área correspondente.'],
      3: ['Copiar o seletor CSS', 'Clique com o botão direito na linha e escolha «Copiar» / “Copy” → «Copiar selector» / “Copy selector”.'],
      4: ['Colar e adicionar', 'Cole o seletor no campo principal do BlockIt, observe «Elementos encontrados», escolha o modo e clique em «Adicionar regra».'],
      5: ['Verificar o resultado', 'Confirme a mensagem de sucesso, a regra na lista e o desaparecimento do elemento indesejado.'],
      6: ['Copiar o HTML', 'No DevTools, escolha «Copiar» / “Copy” → «Copiar elemento» / “Copy element”.'],
      7: ['Analisar o HTML', 'Cole o elemento em «Criar regra a partir de HTML», clique em «Analisar HTML» e mantenha apenas atributos estáveis.'],
      8: ['Verificar e adicionar', 'Confira o seletor gerado e as correspondências, adicione a regra e confirme que o elemento desapareceu.'],
      9: ['Abrir a importação', 'Clique em «Importar regras» e depois em «Escolher ficheiro».'],
      10: ['Escolher o ficheiro', 'Abra o ficheiro JSON que contém as regras guardadas.'],
      11: ['Escolher o método', '«Substituir tudo» remove as regras atuais; «Adicionar» mantém-nas e acrescenta as do ficheiro.'],
      12: ['Verificar a importação', 'Após importar, confira quantas regras foram adicionadas e o total guardado.'],
      13: ['Copiar XPath', 'No DevTools, escolha «Copiar» / “Copy” → «Copiar XPath» / “Copy XPath”. «Copiar XPath completo» / “Copy full XPath” depende mais da estrutura total.'],
      14: ['Colar XPath', 'Cole a expressão no BlockIt, confirme que foi reconhecida como XPath e veja «Elementos encontrados».'],
      15: ['Adicionar a regra', 'Escolha o modo, clique em «Adicionar regra» e confirme que o elemento desapareceu.'],
      16: ['Copiar o HTML', 'Selecione o contentor exterior no DevTools e escolha «Copiar» / “Copy” → «Copiar elemento» / “Copy element”.'],
      17: ['Abrir o construtor', 'Cole o HTML em «Criar regra a partir de HTML» e clique em «Abrir construtor de regras».'],
      18: ['Examinar o resultado inicial', 'O construtor preenche o cartão a partir do HTML e mostra logo o número de correspondências.'],
      19: ['Encontrar a primeira posição', 'Se necessário, examine o DevTools. Aqui o primeiro anúncio é o segundo filho do mesmo pai.'],
      20: ['Encontrar a segunda posição', 'Outro anúncio com as mesmas classes é o terceiro filho do mesmo pai.'],
      21: ['Encontrar a terceira posição', 'O último anúncio com as mesmas classes é o quinto filho do mesmo pai.'],
      22: ['Configurar e verificar', 'Uma regra bloqueia os três anúncios nas posições 2, 3 e 5. Os números da imagem correspondem aos passos acima.'],
      23: ['Confirmar a regra', 'Clique em «Criar regra». Se forem encontrados vários elementos, confirme a quantidade antes de guardar.'],
      24: ['Verificar a página', 'Confirme que os blocos escolhidos desapareceram e o conteúdo útil permaneceu.'],
      25: ['Analisar a página', 'Escolha a quantidade de carregamentos no StableHTMLFinder e clique em «Analisar página». Mais carregamentos aumentam a fiabilidade, mas demoram mais.'],
      26: ['Copiar o elemento', 'O mapa abre noutra aba. No DevTools, escolha «Copiar» / “Copy” → «Copiar elemento» / “Copy element”.'],
      27: ['Encontrar no mapa', 'Abra o mapa, cole o HTML na pesquisa e confirme o elemento. Clique no menu {{map-menu}} e leia a descrição das características do seletor.'],
      28: ['Verificar as características', 'Confirme que o seletor ou a regra usa características estáveis relevantes e copie o resultado.'],
      29: ['Adicionar ao BlockIt', 'Cole o seletor ou a regra no BlockIt, confira a quantidade encontrada e clique em «Adicionar regra».'],
      30: ['Verificar a página', 'Confirme que a regra funcionou e o elemento indesejado desapareceu.'],
      31: ['Alterar a língua do DevTools', 'Abra «Definições» / “Settings” → «Preferências» / “Preferences” → «Idioma» / “Language”, escolha a língua e reinicie o DevTools.'],
      32: ['Escolher a posição', 'No menu «Lado da ancoragem» / “Dock side”, escolha direita, baixo, esquerda ou janela separada.'],
      33: ['Abrir o modo avançado', 'Abra o BlockIt e clique em «Modo avançado». Surgem as ferramentas de criação e importação de regras.'],
      selector: ['Verificar o seletor', 'No separador «Elementos» / “Elements”, prima Ctrl + F, cole o seletor e confira as correspondências.']
    },
    ja: {
      1: ['開発者ツールを開く', '対象の近くを右クリックし、「検証」 / “Inspect” を選びます。'],
      2: ['要素を選択', 'HTML ツリーでブロックの外側のコンテナーを探します。行にカーソルを合わせると、ページ上の対応部分が強調されます。'],
      3: ['CSS セレクターをコピー', '行を右クリックし、「コピー」 / “Copy” → 「selector をコピー」 / “Copy selector” を選びます。'],
      4: ['貼り付けて追加', 'BlockIt のメイン欄に貼り付け、「見つかった要素数」を確認し、モードを選んで「ルールを追加」を押します。'],
      5: ['結果を確認', '成功の通知とルール一覧を確認し、不要な要素が消えたことを確かめます。'],
      6: ['HTML をコピー', '開発者ツールで「コピー」 / “Copy” → 「要素をコピー」 / “Copy element” を選びます。'],
      7: ['HTML を解析', '「HTML からルールを作成」に貼り付けて「HTML を解析」を押し、必要な安定属性だけを残します。'],
      8: ['確認して追加', '生成されたセレクターと一致数を確認し、ルールを追加して要素が消えたことを確かめます。'],
      9: ['インポートを開く', '「ルールをインポート」を押し、ダイアログでファイルを選びます。'],
      10: ['ファイルを選択', '保存したルールを含む JSON ファイルを開きます。'],
      11: ['方法を選択', '「すべて置換」は既存ルールを削除し、「追加」は残したままファイルのルールを加えます。'],
      12: ['結果を確認', '追加されたルール数と保存済みの合計数を確認します。'],
      13: ['XPath をコピー', '開発者ツールで「コピー」 / “Copy” → 「XPath をコピー」 / “Copy XPath” を選びます。「完全な XPath をコピー」 / “Copy full XPath” はページ全体の構造により依存します。'],
      14: ['XPath を貼り付け', 'BlockIt に貼り付け、XPath と認識されたことと「見つかった要素数」を確認します。'],
      15: ['ルールを追加', 'モードを選び、「ルールを追加」を押して不要な要素が消えたことを確かめます。'],
      16: ['HTML をコピー', '外側のコンテナーを選び、「コピー」 / “Copy” → 「要素をコピー」 / “Copy element” を使います。'],
      17: ['ビルダーを開く', '「HTML からルールを作成」に貼り付け、「ルールビルダーを開く」を押します。'],
      18: ['初期結果を確認', 'ビルダーは HTML からカードを埋め、一致数をすぐ表示します。'],
      19: ['最初の位置を確認', '必要なら開発者ツールで条件を探します。この広告は同じ親の子要素の２番目です。'],
      20: ['次の位置を確認', '同じクラスの別の広告は３番目の子要素です。'],
      21: ['最後の位置を確認', '同じクラスの最後の広告は５番目の子要素です。'],
      22: ['ルールを設定して確認', '位置 2、3、5 を指定し、１つのルールで３つの広告をブロックします。画像の番号は上の手順に対応します。'],
      23: ['作成を確認', '「ルールを作成」を押します。複数見つかった場合は数を再確認して保存します。'],
      24: ['ページを確認', '選んだ広告だけが消え、有用な内容が残っていることを確かめます。'],
      25: ['ページを解析', 'StableHTMLFinder で読み込み回数を選び「ページを解析」を押します。回数を増やすと判定が確かになりますが、時間もかかります。'],
      26: ['要素をコピー', 'マップは別タブに開きます。開発者ツールで「コピー」 / “Copy” → 「要素をコピー」 / “Copy element” を選びます。'],
      27: ['マップで探す', 'マップのタブで HTML を検索し、対象か確かめます。メニュー {{map-menu}} からセレクターカードを開き、使用した特徴の説明を読みます。'],
      28: ['特徴を確認', 'セレクターやルールが重要な安定特徴を使っているか確認してコピーします。'],
      29: ['BlockIt に追加', 'メイン欄に貼り付け、一致数を確認して「ルールを追加」を押します。'],
      30: ['ページを確認', 'ルールが働き、不要な要素が消えたことを確かめます。'],
      31: ['開発者ツールの言語', '「設定」 / “Settings” → 「設定」 / “Preferences” → 「言語」 / “Language” で選び、開発者ツールを開き直します。'],
      32: ['パネルの位置', '「固定サイド」 / “Dock side” から右、下、左、別ウィンドウを選びます。'],
      33: ['詳細モードを開く', 'BlockIt で「詳細モード」を押します。ルール作成やインポートの機能が表示されます。'],
      selector: ['セレクターを確認', '「要素」 / “Elements” タブで Ctrl + F を押し、セレクターを貼り付けて一致数を確認します。']
    },
    'zh-CN': {
      1: ['打开开发者工具', '在目标元素附近右键单击，选择“检查” / “Inspect”。'],
      2: ['选择元素', '在 HTML 树中找到区块最外层容器。将鼠标移到一行上，页面会高亮对应区域。'],
      3: ['复制 CSS 选择器', '右键单击该行，选择“复制” / “Copy” → “复制 selector” / “Copy selector”。'],
      4: ['粘贴并添加规则', '粘贴到 BlockIt 主输入框，查看“找到的元素”数量，选择模式并单击“添加规则”。'],
      5: ['检查结果', '确认成功提示、活动规则列表，以及不需要的元素已从页面消失。'],
      6: ['复制 HTML', '在开发者工具中选择“复制” / “Copy” → “复制元素” / “Copy element”。'],
      7: ['解析 HTML', '粘贴到“从 HTML 创建规则”，单击“解析 HTML”，只保留需要的稳定属性。'],
      8: ['检查并添加', '检查生成的选择器和匹配数量，添加规则并确认目标元素消失。'],
      9: ['打开导入', '单击“导入规则”，然后在对话框中选择文件。'],
      10: ['选择文件', '打开包含已保存规则的 JSON 文件。'],
      11: ['选择导入方式', '“全部替换”会删除当前规则；“添加”会保留当前规则并加入文件中的规则。'],
      12: ['检查导入结果', '确认新增规则数量和保存的规则总数。'],
      13: ['复制 XPath', '在开发者工具中选择“复制” / “Copy” → “复制 XPath” / “Copy XPath”。“复制完整 XPath” / “Copy full XPath” 更依赖整个页面结构。'],
      14: ['粘贴 XPath', '粘贴到 BlockIt，确认已识别为 XPath，并查看“找到的元素”数量。'],
      15: ['添加规则', '选择模式，单击“添加规则”，确认目标元素已消失。'],
      16: ['复制 HTML', '选择最外层容器，使用“复制” / “Copy” → “复制元素” / “Copy element”。'],
      17: ['打开构建器', '将 HTML 粘贴到“从 HTML 创建规则”，单击“打开规则构建器”。'],
      18: ['检查初始结果', '构建器根据 HTML 填充卡片，并立即显示匹配数量。'],
      19: ['确认第一个位置', '必要时返回开发者工具查找限定条件。这里的广告是同一父元素下的第二个子元素。'],
      20: ['确认第二个位置', '另一个具有相同类的广告是第三个子元素。'],
      21: ['确认第三个位置', '最后一个具有相同类的广告是第五个子元素。'],
      22: ['配置并检查规则', '指定位置 2、3、5，用一条规则屏蔽三个广告。图中编号对应上方步骤。'],
      23: ['确认创建规则', '单击“创建规则”。若找到多个元素，再次检查数量后确认保存。'],
      24: ['检查页面', '确认选中的广告已消失，其他有用内容仍保留。'],
      25: ['分析页面', '在 StableHTMLFinder 中选择加载次数并单击“分析页面”。次数越多，稳定特征越可靠，但耗时更长。'],
      26: ['复制元素', '地图会在新标签页中打开。在开发者工具中选择“复制” / “Copy” → “复制元素” / “Copy element”。'],
      27: ['在地图中查找', '切换到地图，粘贴 HTML 搜索并确认目标。单击菜单 {{map-menu}}，打开选择器卡片并阅读特征说明。'],
      28: ['检查特征', '确认选择器或规则使用了真正重要的稳定特征，然后复制结果。'],
      29: ['添加到 BlockIt', '粘贴到 BlockIt 主输入框，检查匹配数量并单击“添加规则”。'],
      30: ['检查页面', '确认规则生效，不需要的元素已消失。'],
      31: ['更改开发者工具语言', '打开“设置” / “Settings” → “偏好设置” / “Preferences” → “语言” / “Language”，选择语言并重新打开开发者工具。'],
      32: ['选择面板位置', '在“停靠侧” / “Dock side”菜单中选择右侧、底部、左侧或独立窗口。'],
      33: ['打开高级模式', '打开 BlockIt 并单击“高级模式”，显示规则创建和导入工具。'],
      selector: ['检查选择器', '在“元素” / “Elements”标签页按 Ctrl + F，粘贴选择器并检查匹配数量。']
    }
  };
  if (galleryNarratives[language]) {
    document.querySelectorAll('.gallery-slide').forEach(slide => {
      const source = slide.querySelector('img')?.getAttribute('src') || '';
      const number = source.endsWith('/selector-check.png') ? 'selector' : Number(source.match(/\/(\d+)\.png$/)?.[1]);
      const narrative = galleryNarratives[language][number];
      if (!narrative) return;
      slide.dataset.title = narrative[0];
      slide.dataset.caption = narrative[1];
      slide.querySelector('img').alt = narrative[0];
    });
    const labels = {
      pt: { 'Previous step': 'Etapa anterior', 'Next step': 'Etapa seguinte', 'Previous screenshot': 'Captura anterior', 'Next screenshot': 'Captura seguinte', 'DevTools settings': 'Definições do DevTools', 'Quick-start steps': 'Passos do início rápido', 'Rule import steps': 'Passos da importação', 'Checking a selector in DevTools': 'Verificar um seletor no DevTools' },
      ja: { 'Previous step': '前の手順', 'Next step': '次の手順', 'Previous screenshot': '前の画像', 'Next screenshot': '次の画像', 'DevTools settings': '開発者ツールの設定', 'Quick-start steps': 'クイックスタートの手順', 'Rule import steps': 'インポートの手順', 'Checking a selector in DevTools': '開発者ツールでセレクターを確認' },
      'zh-CN': { 'Previous step': '上一步', 'Next step': '下一步', 'Previous screenshot': '上一张截图', 'Next screenshot': '下一张截图', 'DevTools settings': '开发者工具设置', 'Quick-start steps': '快速入门步骤', 'Rule import steps': '导入步骤', 'Checking a selector in DevTools': '在开发者工具中检查选择器' }
    }[language];
    document.querySelectorAll('[aria-label]').forEach(element => {
      const original = element.getAttribute('aria-label');
      if (labels[original]) element.setAttribute('aria-label', labels[original]);
    });
  }
  const bindHorizontalSwipe = (target, onPrevious, onNext, onSwipe) => {
    if (!target) return;
    let startX = 0;
    let startY = 0;
    let tracking = false;
    target.addEventListener('touchstart', event => {
      if (event.touches.length !== 1) return;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      tracking = true;
    }, { passive: true });
    target.addEventListener('touchend', event => {
      if (!tracking || !event.changedTouches.length) return;
      tracking = false;
      const offsetX = event.changedTouches[0].clientX - startX;
      const offsetY = event.changedTouches[0].clientY - startY;
      const threshold = Math.max(42, Math.min(64, target.clientWidth * .12));
      if (Math.abs(offsetX) < threshold || Math.abs(offsetX) <= Math.abs(offsetY) * 1.15) return;
      onSwipe?.();
      if (offsetX < 0) onNext();
      else onPrevious();
    }, { passive: true });
    target.addEventListener('touchcancel', () => { tracking = false; }, { passive: true });
  };

  const galleryStates = new Map();
  document.querySelectorAll('[data-gallery]').forEach(gallery => {
    const slides = [...gallery.querySelectorAll('.gallery-slide')];
    const title = gallery.querySelector('.gallery-caption b');
    const caption = gallery.querySelector('.gallery-caption > div > span');
    const number = gallery.querySelector('.gallery-caption-number');
    const dots = gallery.querySelector('.gallery-dots');
    let index = 0;
    const show = next => {
      index = (next + slides.length) % slides.length;
      slides.forEach((slide, position) => slide.classList.toggle('active', position === index));
      title.textContent = slides[index].dataset.title;
      renderCaption(caption, slides[index]);
      number.textContent = index + 1;
      [...dots.children].forEach((dot, position) => dot.classList.toggle('active', position === index));
    };
    galleryStates.set(gallery, { slides, show, getIndex: () => index });
    slides.forEach((slide, position) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'gallery-dot';
      dot.setAttribute('aria-label', `${ui.step} ${position + 1}`);
      dot.addEventListener('click', () => show(position));
      dots.append(dot);
    });
    gallery.querySelector('.prev')?.addEventListener('click', () => show(index - 1));
    gallery.querySelector('.next')?.addEventListener('click', () => show(index + 1));
    bindHorizontalSwipe(
      gallery.querySelector('.gallery-stage'),
      () => show(index - 1),
      () => show(index + 1),
      () => { gallery.dataset.suppressOpenUntil = String(Date.now() + 450); }
    );
    show(0);
  });

  const unstable = document.getElementById('unstableTraits');
  const unstablePath = document.getElementById('unstablePath');
  const methodsFailed = document.getElementById('methodsFailed');
  const updateAdvisor = () => {
    document.querySelectorAll('[data-method]').forEach(method => method.classList.remove('recommended'));
    if (methodsFailed.checked || (unstable.checked && unstablePath.checked)) {
      document.querySelector('[data-method="stable"]')?.classList.add('recommended');
      document.querySelector('[data-method="builder"]')?.classList.add('recommended');
    } else if (unstable.checked) {
      document.querySelector('[data-method="xpath"]')?.classList.add('recommended');
      document.querySelector('[data-method="stable"]')?.classList.add('recommended');
    } else {
      document.querySelector('[data-method="css"]')?.classList.add('recommended');
      document.querySelector('[data-method="html"]')?.classList.add('recommended');
    }
  };
  const closeMethodsAndUpdate = () => {
    document.querySelectorAll('.method-list details[open]').forEach(method => { method.open = false; });
    updateAdvisor();
  };
  [unstable, unstablePath, methodsFailed].forEach(input => input?.addEventListener('change', closeMethodsAndUpdate));
  updateAdvisor();

  const syntaxGrid = document.querySelector('.syntax-grid');
  const syntaxCards = syntaxGrid ? [...syntaxGrid.querySelectorAll('.syntax-example')] : [];
  if (syntaxCards.length) {
    const firstCard = syntaxCards[0];
    const updateSyntaxHeight = () => {
      firstCard.classList.add('syntax-measuring');
      const collapsedHeight = Math.ceil(firstCard.getBoundingClientRect().height);
      firstCard.classList.remove('syntax-measuring');
      syntaxGrid.style.setProperty('--syntax-collapsed-height', `${collapsedHeight}px`);
    };

    updateSyntaxHeight();
    const collapsedHeight = Math.ceil(firstCard.getBoundingClientRect().height);
    syntaxCards.forEach(card => {
      const needsToggle = card !== firstCard && card.scrollHeight > collapsedHeight + 2;
      card.classList.add('syntax-fixed');
      if (!needsToggle) return;
      card.classList.add('syntax-collapsible');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'syntax-toggle';
      button.textContent = '＋';
      button.setAttribute('aria-label', ui.expand);
      button.title = ui.expand;
      button.setAttribute('aria-expanded', 'false');
      button.addEventListener('click', () => {
        const expanded = card.classList.toggle('expanded');
        button.textContent = expanded ? '−' : '＋';
        button.setAttribute('aria-label', expanded ? ui.collapse : ui.expand);
        button.title = expanded ? ui.collapse : ui.expand;
        button.setAttribute('aria-expanded', String(expanded));
      });
      card.append(button);
    });

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(updateSyntaxHeight, 120);
    });
  }

  const lightbox = document.getElementById('imageLightbox');
  const lightboxImage = lightbox?.querySelector('img');
  const lightboxTitle = lightbox?.querySelector('.lightbox-caption b');
  const lightboxCaption = lightbox?.querySelector('.lightbox-caption span');
  const lightboxPrevious = lightbox?.querySelector('.lightbox-prev');
  const lightboxNext = lightbox?.querySelector('.lightbox-next');
  let activeGallery = null;
  let lightboxOpener = null;
  function renderCaption(target, slide) {
    if (!target || !slide) return;
    target.textContent = '';
    const caption = slide.dataset.caption || '';
    const marker = '{{map-menu}}';
    const markerIndex = caption.indexOf(marker);
    if (markerIndex !== -1) {
      target.append(document.createTextNode(caption.slice(0, markerIndex)));
      const icon = document.createElement('span');
      icon.className = 'map-menu-icon';
      icon.setAttribute('aria-label', ui.menu);
      icon.textContent = '⋮';
      target.append(icon, document.createTextNode(caption.slice(markerIndex + marker.length)));
      return;
    }
    target.append(document.createTextNode(caption));
  }
  const updateLightbox = () => {
    const state = activeGallery && galleryStates.get(activeGallery);
    if (!state || !lightboxImage) return;
    const slide = state.slides[state.getIndex()];
    const image = slide.querySelector('img');
    lightboxImage.src = image.currentSrc || image.src;
    lightboxImage.alt = image.alt;
    lightboxTitle.textContent = slide.dataset.title || image.alt;
    renderCaption(lightboxCaption, slide);
  };
  const moveLightbox = offset => {
    const state = activeGallery && galleryStates.get(activeGallery);
    if (!state) return;
    state.show(state.getIndex() + offset);
    updateLightbox();
  };
  const closeLightbox = () => {
    if (!lightbox || lightbox.hidden) return;
    lightbox.hidden = true;
    document.documentElement.classList.remove('lightbox-open');
    lightboxOpener?.focus();
  };
  const openLightbox = image => {
    if (!lightbox || !lightboxImage) return;
    const gallery = image.closest('[data-gallery]');
    if (Number(gallery?.dataset.suppressOpenUntil || 0) > Date.now()) return;
    activeGallery = gallery;
    lightboxOpener = image;
    updateLightbox();
    const hasSeveralSlides = (galleryStates.get(activeGallery)?.slides.length || 0) > 1;
    if (lightboxPrevious) lightboxPrevious.hidden = !hasSeveralSlides;
    if (lightboxNext) lightboxNext.hidden = !hasSeveralSlides;
    document.documentElement.classList.add('lightbox-open');
    lightbox.hidden = false;
    lightbox.querySelector('.lightbox-close')?.focus();
  };
  document.querySelectorAll('.gallery-slide img').forEach(image => {
    image.tabIndex = 0;
    image.setAttribute('role', 'button');
    image.setAttribute('aria-label', `${image.alt}. ${ui.openImage}`);
    image.addEventListener('click', () => openLightbox(image));
    image.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openLightbox(image);
    });
  });
  lightbox?.querySelector('.lightbox-close')?.addEventListener('click', closeLightbox);
  lightboxPrevious?.addEventListener('click', () => moveLightbox(-1));
  lightboxNext?.addEventListener('click', () => moveLightbox(1));
  bindHorizontalSwipe(lightbox?.querySelector('.lightbox-content'), () => moveLightbox(-1), () => moveLightbox(1));
  lightbox?.addEventListener('click', event => { if (event.target === lightbox) closeLightbox(); });
  window.addEventListener('keydown', event => {
    if (lightbox?.hidden) return;
    if (event.key === 'Escape') closeLightbox();
    if (event.key === 'ArrowLeft') moveLightbox(-1);
    if (event.key === 'ArrowRight') moveLightbox(1);
  });

  const openHashTarget = () => {
    if (!location.hash) return;
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (!target?.matches('details')) return;
    target.open = true;
    requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
  };
  window.addEventListener('hashchange', openHashTarget);
  openHashTarget();
})();
