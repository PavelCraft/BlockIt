(() => {
  const galleryStates = new Map();
  document.querySelectorAll('[data-gallery]').forEach(gallery => {
    const slides = [...gallery.querySelectorAll('.gallery-slide')];
    const title = gallery.querySelector('.gallery-caption b');
    const caption = gallery.querySelector('.gallery-caption span');
    const number = gallery.querySelector('.gallery-caption-number');
    const dots = gallery.querySelector('.gallery-dots');
    let index = 0;
    const show = next => {
      index = (next + slides.length) % slides.length;
      slides.forEach((slide, position) => slide.classList.toggle('active', position === index));
      title.textContent = slides[index].dataset.title;
      caption.textContent = slides[index].dataset.caption;
      number.textContent = index + 1;
      [...dots.children].forEach((dot, position) => dot.classList.toggle('active', position === index));
    };
    galleryStates.set(gallery, { slides, show, getIndex: () => index });
    slides.forEach((slide, position) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'gallery-dot';
      dot.setAttribute('aria-label', `Перейти к шагу ${position + 1}`);
      dot.addEventListener('click', () => show(position));
      dots.append(dot);
    });
    gallery.querySelector('.prev').addEventListener('click', () => show(index - 1));
    gallery.querySelector('.next').addEventListener('click', () => show(index + 1));
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
      button.setAttribute('aria-label', 'Развернуть описание');
      button.title = 'Развернуть';
      button.setAttribute('aria-expanded', 'false');
      button.addEventListener('click', () => {
        const expanded = card.classList.toggle('expanded');
        button.textContent = expanded ? '−' : '＋';
        button.setAttribute('aria-label', expanded ? 'Свернуть описание' : 'Развернуть описание');
        button.title = expanded ? 'Свернуть' : 'Развернуть';
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
  let activeGallery = null;
  const updateLightbox = () => {
    const state = activeGallery && galleryStates.get(activeGallery);
    if (!state || !lightboxImage) return;
    const slide = state.slides[state.getIndex()];
    const image = slide.querySelector('img');
    lightboxImage.src = image.currentSrc || image.src;
    lightboxImage.alt = image.alt;
    lightboxTitle.textContent = slide.dataset.title || image.alt;
    lightboxCaption.textContent = slide.dataset.caption || '';
  };
  const moveLightbox = offset => {
    const state = activeGallery && galleryStates.get(activeGallery);
    if (!state) return;
    state.show(state.getIndex() + offset);
    updateLightbox();
  };
  const closeLightbox = () => { if (lightbox) lightbox.hidden = true; };
  document.querySelectorAll('.gallery-slide img').forEach(image => {
    image.addEventListener('click', () => {
      if (!lightbox || !lightboxImage) return;
      activeGallery = image.closest('[data-gallery]');
      updateLightbox();
      lightbox.hidden = false;
      lightbox.querySelector('.lightbox-close')?.focus();
    });
  });
  lightbox?.querySelector('.lightbox-close')?.addEventListener('click', closeLightbox);
  lightbox?.querySelector('.lightbox-prev')?.addEventListener('click', () => moveLightbox(-1));
  lightbox?.querySelector('.lightbox-next')?.addEventListener('click', () => moveLightbox(1));
  lightbox?.addEventListener('click', event => { if (event.target === lightbox) closeLightbox(); });
  window.addEventListener('keydown', event => {
    if (lightbox?.hidden) return;
    if (event.key === 'Escape') closeLightbox();
    if (event.key === 'ArrowLeft') moveLightbox(-1);
    if (event.key === 'ArrowRight') moveLightbox(1);
  });
})();
