// ============================================================
//  BLOCKIT — INSTRUCTION PAGE SCRIPT
//  Lightbox functionality for screenshots
// ============================================================

(function() {
    'use strict';

    // Получаем элементы
    const modal = document.getElementById('screenshotModal');
    const modalImg = document.getElementById('modalImage');
    const closeBtn = document.querySelector('.modal-close');

    // Проверяем, что элементы существуют
    if (!modal || !modalImg || !closeBtn) {
        console.warn('[BlockIt] Modal elements not found, skipping lightbox init');
        return;
    }

    // Открываем модалку по клику на любой скриншот
    document.querySelectorAll('.screenshot-img').forEach(img => {
        img.addEventListener('click', function(e) {
            e.stopPropagation();
            modal.style.display = 'block';
            modalImg.src = this.src;
            // Добавляем класс для анимации при открытии (опционально)
            modalImg.style.opacity = '0';
            setTimeout(() => { modalImg.style.opacity = '1'; }, 50);
        });
    });

    // Закрываем модалку
    function closeModal() {
        modal.style.display = 'none';
        modalImg.style.opacity = '0';
    }

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', closeModal);

    // Закрываем по клавише Escape
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.style.display === 'block') {
            closeModal();
        }
    });

    console.log('[BlockIt] Lightbox initialized');

})();