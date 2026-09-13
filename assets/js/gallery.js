/**
 * Лайтбокс для галереи работ (vanilla JS, без сторонних библиотек).
 */
(function () {
  'use strict';

  function initGallery() {
    var items = Array.prototype.slice.call(document.querySelectorAll('.gallery-item'));
    var lightbox = document.querySelector('.lightbox');
    if (!items.length || !lightbox) return;

    var img = lightbox.querySelector('.lightbox__image');
    var caption = lightbox.querySelector('.lightbox__figure figcaption');
    var closeBtn = lightbox.querySelector('.lightbox__close');
    var prevBtn = lightbox.querySelector('.lightbox__prev');
    var nextBtn = lightbox.querySelector('.lightbox__next');
    var current = 0;
    var lastFocused = null;

    function show(index) {
      current = (index + items.length) % items.length;
      var item = items[current];
      var fullSrc = item.getAttribute('data-full') || item.querySelector('img').src;
      var alt = item.querySelector('img').alt || '';
      img.src = fullSrc;
      img.alt = alt;
      caption.textContent = alt;
    }

    function open(index) {
      lastFocused = document.activeElement;
      show(index);
      lightbox.classList.add('is-open');
      document.body.classList.add('no-scroll');
      closeBtn.focus();
    }

    function close() {
      lightbox.classList.remove('is-open');
      document.body.classList.remove('no-scroll');
      img.removeAttribute('src');
      if (lastFocused) lastFocused.focus();
    }

    items.forEach(function (item, index) {
      item.addEventListener('click', function () { open(index); });
    });

    closeBtn.addEventListener('click', close);
    prevBtn.addEventListener('click', function () { show(current - 1); });
    nextBtn.addEventListener('click', function () { show(current + 1); });

    lightbox.addEventListener('click', function (e) {
      if (e.target === lightbox) close();
    });

    document.addEventListener('keydown', function (e) {
      if (!lightbox.classList.contains('is-open')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') show(current - 1);
      if (e.key === 'ArrowRight') show(current + 1);
    });
  }

  document.addEventListener('DOMContentLoaded', initGallery);
})();
