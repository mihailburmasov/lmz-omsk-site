/**
 * Общая логика сайта: меню, мессенджеры, анимации, cookie-баннер, карта, счётчики.
 */
(function () {
  'use strict';

  var SITE = window.SITE || {};

  /* ---------- Подстановка контактных данных из config.js ---------- */
  function applySiteData() {
    document.querySelectorAll('[data-site-phone]').forEach(function (el) {
      el.textContent = SITE.phoneDisplay;
    });
    document.querySelectorAll('[data-site-phone-href]').forEach(function (el) {
      el.setAttribute('href', 'tel:' + SITE.phone);
    });
    document.querySelectorAll('[data-site-email]').forEach(function (el) {
      if (!SITE.email) { el.closest('[data-hide-if-empty]')?.setAttribute('hidden', ''); return; }
      el.textContent = SITE.email;
    });
    document.querySelectorAll('[data-site-email-href]').forEach(function (el) {
      if (!SITE.email) { el.closest('[data-hide-if-empty]')?.setAttribute('hidden', ''); return; }
      el.setAttribute('href', 'mailto:' + SITE.email);
    });
    document.querySelectorAll('[data-site-address]').forEach(function (el) {
      el.textContent = SITE.address;
    });
    document.querySelectorAll('[data-site-schedule]').forEach(function (el) {
      el.textContent = SITE.schedule;
    });
    document.querySelectorAll('[data-site-inn]').forEach(function (el) {
      el.textContent = SITE.inn;
    });
    document.querySelectorAll('[data-site-ogrn]').forEach(function (el) {
      el.textContent = SITE.ogrn;
    });
    document.querySelectorAll('[data-site-kpp]').forEach(function (el) {
      el.textContent = SITE.kpp;
    });
    document.querySelectorAll('[data-site-year]').forEach(function (el) {
      el.textContent = new Date().getFullYear();
    });
    document.querySelectorAll('[data-site-experience]').forEach(function (el) {
      el.textContent = SITE.experienceYears ? SITE.experienceYears() : '';
    });
    document.querySelectorAll('[data-site-founded]').forEach(function (el) {
      el.textContent = SITE.foundedYear;
    });

    wireMessengerLinks();
  }

  function wireMessengerLinks() {
    document.querySelectorAll('[data-messenger]').forEach(function (el) {
      var kind = el.getAttribute('data-messenger');
      var url = SITE[kind];
      var wrapper = el.closest('[data-messenger-wrap]') || el;
      if (!url) {
        wrapper.setAttribute('hidden', '');
        return;
      }
      el.setAttribute('href', url);
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener');
    });
  }

  /* ---------- Мобильное меню ---------- */
  function initMobileMenu() {
    var burger = document.querySelector('.burger');
    var menu = document.querySelector('.mobile-menu');
    if (!burger || !menu) return;

    function close() {
      burger.setAttribute('aria-expanded', 'false');
      menu.classList.remove('is-open');
      document.body.classList.remove('no-scroll');
    }
    function open() {
      burger.setAttribute('aria-expanded', 'true');
      menu.classList.add('is-open');
      document.body.classList.add('no-scroll');
    }

    burger.addEventListener('click', function () {
      var expanded = burger.getAttribute('aria-expanded') === 'true';
      expanded ? close() : open();
    });

    menu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', close);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.classList.contains('is-open')) close();
    });

    document.addEventListener('click', function (e) {
      if (!menu.classList.contains('is-open')) return;
      if (menu.contains(e.target) || burger.contains(e.target)) return;
      close();
    });
  }

  /* ---------- Плавающий виджет мессенджеров ---------- */
  function initMessengerWidget() {
    var widget = document.querySelector('.messenger-widget');
    var toggle = widget && widget.querySelector('.messenger-widget__toggle');
    if (!widget || !toggle) return;

    toggle.addEventListener('click', function () {
      var isOpen = widget.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    document.addEventListener('click', function (e) {
      if (!widget.classList.contains('is-open')) return;
      if (widget.contains(e.target)) return;
      widget.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        widget.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });

    // Если все мессенджеры скрыты (нет ссылок) — прячем весь виджет.
    var items = widget.querySelectorAll('.messenger-widget__item');
    var visible = Array.prototype.some.call(items, function (i) { return !i.hasAttribute('hidden'); });
    if (!visible) widget.setAttribute('hidden', '');
  }

  /* ---------- Анимация появления секций ---------- */
  function initReveal() {
    var items = document.querySelectorAll('.reveal');
    if (!items.length) return;

    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      items.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    items.forEach(function (el) { observer.observe(el); });
  }

  /* ---------- Активный пункт меню ---------- */
  function markActiveNav() {
    var path = window.location.pathname.replace(/\/index\.html$/, '/');
    document.querySelectorAll('.main-nav a, .mobile-menu__nav a').forEach(function (a) {
      var href = a.getAttribute('href');
      if (!href) return;
      if (href === path || (href.length > 1 && path.indexOf(href) === 0)) {
        a.classList.add('is-active');
      }
    });
  }

  /* ---------- Cookie-баннер ---------- */
  function initCookieBanner() {
    var banner = document.querySelector('.cookie-banner');
    if (!banner) return;
    var STORAGE_KEY = 'lmz_cookie_consent';

    var accepted = false;
    try { accepted = localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) { /* приватный режим */ }

    if (!accepted) {
      banner.classList.add('is-visible');
    }

    var btn = banner.querySelector('[data-cookie-accept]');
    if (btn) {
      btn.addEventListener('click', function () {
        try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) { /* игнорируем */ }
        banner.classList.remove('is-visible');
      });
    }
  }

  /* ---------- События для счётчиков (Метрика/GA) ---------- */
  function trackEvent(name, params) {
    try {
      if (window.ym && window.YM_COUNTER_ID) {
        window.ym(window.YM_COUNTER_ID, 'reachGoal', name);
      }
      if (window.dataLayer) {
        window.dataLayer.push(Object.assign({ event: name }, params || {}));
      }
    } catch (e) { /* счётчики не подключены — не мешаем работе сайта */ }
  }
  window.trackEvent = trackEvent;

  document.addEventListener('click', function (e) {
    var telLink = e.target.closest('a[href^="tel:"]');
    if (telLink) trackEvent('click_phone');

    var msgLink = e.target.closest('[data-messenger]');
    if (msgLink) trackEvent('click_messenger', { messenger: msgLink.getAttribute('data-messenger') });
  });

  /* ---------- Инициализация ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    applySiteData();
    initMobileMenu();
    initMessengerWidget();
    initReveal();
    markActiveNav();
    // initCookieBanner(); // временно отключено по просьбе заказчика
  });
})();
