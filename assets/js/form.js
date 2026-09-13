/**
 * Маска телефона, валидация и AJAX-отправка форм заявки (расчёт / обратный звонок).
 * Формы также работают без JS — через обычный POST на mail/send.php (прогрессивное улучшение).
 */
(function () {
  'use strict';

  var ENDPOINT = '/mail/send.php';

  /* ---------- Маска телефона ---------- */
  function formatPhone(value) {
    var digits = value.replace(/\D/g, '');
    if (digits.charAt(0) === '8') digits = '7' + digits.slice(1);
    if (digits.charAt(0) !== '7') digits = '7' + digits;
    digits = digits.slice(0, 11);

    var d = digits.slice(1); // 10 цифр после кода страны
    var out = '+7';
    if (d.length > 0) out += ' (' + d.slice(0, 3);
    if (d.length >= 3) out += ')';
    if (d.length > 3) out += ' ' + d.slice(3, 6);
    if (d.length > 6) out += '-' + d.slice(6, 8);
    if (d.length > 8) out += '-' + d.slice(8, 10);
    return out;
  }

  function initPhoneMasks() {
    document.querySelectorAll('input[type="tel"]').forEach(function (input) {
      input.addEventListener('focus', function () {
        if (!input.value) input.value = '+7 (';
      });
      input.addEventListener('input', function () {
        var caretAtEnd = input.selectionStart === input.value.length;
        input.value = formatPhone(input.value);
        if (caretAtEnd) input.setSelectionRange(input.value.length, input.value.length);
      });
      input.addEventListener('blur', function () {
        if (input.value === '+7 (') input.value = '';
      });
    });
  }

  /* ---------- Метка времени показа формы (антиспам) ---------- */
  function stampForms() {
    document.querySelectorAll('form[data-ajax-form]').forEach(function (form) {
      var ts = form.querySelector('input[name="form_ts"]');
      if (ts) ts.value = Math.floor(Date.now() / 1000);
    });
  }

  /* ---------- Отображение выбранного файла ---------- */
  function initFileDrop() {
    document.querySelectorAll('.file-drop input[type="file"]').forEach(function (input) {
      input.addEventListener('change', function () {
        var label = input.closest('.file-drop').querySelector('.file-name');
        if (!label) return;
        if (input.files && input.files[0]) {
          var file = input.files[0];
          if (file.size > 10 * 1024 * 1024) {
            label.textContent = 'Файл больше 10 МБ — выберите другой';
            input.value = '';
            return;
          }
          label.textContent = file.name;
        } else {
          label.textContent = '';
        }
      });
    });
  }

  /* ---------- Валидация ---------- */
  function validateForm(form) {
    var valid = true;
    form.querySelectorAll('[required]').forEach(function (field) {
      var wrap = field.closest('.field') || field.closest('.checkbox-field');
      var isValid = field.checkValidity();

      if (field.type === 'tel' && field.value) {
        var digits = field.value.replace(/\D/g, '');
        isValid = digits.length === 11;
      }

      if (!isValid) {
        valid = false;
        if (wrap) wrap.classList.add('has-error');
      } else if (wrap) {
        wrap.classList.remove('has-error');
      }
    });
    return valid;
  }

  function clearErrorsOnInput(form) {
    form.querySelectorAll('.field, .checkbox-field').forEach(function (wrap) {
      var field = wrap.querySelector('input, textarea');
      if (!field) return;
      field.addEventListener('input', function () { wrap.classList.remove('has-error'); });
      field.addEventListener('change', function () { wrap.classList.remove('has-error'); });
    });
  }

  /* ---------- Отправка ---------- */
  function initAjaxForms() {
    document.querySelectorAll('form[data-ajax-form]').forEach(function (form) {
      clearErrorsOnInput(form);

      form.addEventListener('submit', function (e) {
        e.preventDefault();

        var status = form.querySelector('.form-status');
        var submitBtn = form.querySelector('[type="submit"]');

        if (!validateForm(form)) {
          if (status) {
            status.textContent = 'Проверьте, пожалуйста, поля, отмеченные красным.';
            status.className = 'form-status is-error';
          }
          return;
        }

        var originalLabel = submitBtn ? submitBtn.textContent : '';
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Отправляем…';
        }
        if (status) status.className = 'form-status';

        var formData = new FormData(form);
        // UTM-метки, если пользователь пришёл по рекламной ссылке
        try {
          var params = new URLSearchParams(window.location.search);
          ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(function (k) {
            if (params.get(k)) formData.append(k, params.get(k));
          });
          formData.append('page_url', window.location.href);
        } catch (err) { /* URLSearchParams недоступен — пропускаем UTM */ }

        fetch(ENDPOINT, { method: 'POST', body: formData, headers: { 'X-Requested-With': 'fetch' } })
          .then(function (res) { return res.json(); })
          .then(function (data) {
            if (data && data.success) {
              if (status) {
                status.textContent = data.message || 'Заявка отправлена. Мы свяжемся с вами в ближайшее время.';
                status.className = 'form-status is-success';
              }
              form.reset();
              if (window.trackEvent) window.trackEvent('form_submit', { form: form.getAttribute('data-form-type') || 'unknown' });
              stampForms();
              var modal = form.closest('.modal');
              if (modal) setTimeout(function () { closeModal(modal); }, 1800);
            } else {
              if (status) {
                status.textContent = (data && data.message) || 'Не удалось отправить заявку. Позвоните нам, пожалуйста.';
                status.className = 'form-status is-error';
              }
            }
          })
          .catch(function () {
            if (status) {
              status.textContent = 'Ошибка сети. Попробуйте ещё раз или позвоните нам.';
              status.className = 'form-status is-error';
            }
          })
          .finally(function () {
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = originalLabel;
            }
          });
      });
    });
  }

  /* ---------- Модальное окно «Заказать звонок» ---------- */
  function openModal(modal) {
    modal.classList.add('is-open');
    document.body.classList.add('no-scroll');
    var first = modal.querySelector('input, textarea, button');
    if (first) first.focus();
  }
  function closeModal(modal) {
    modal.classList.remove('is-open');
    document.body.classList.remove('no-scroll');
  }
  function initModals() {
    document.querySelectorAll('[data-open-modal]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var modal = document.getElementById(btn.getAttribute('data-open-modal'));
        if (modal) openModal(modal);
      });
    });
    document.querySelectorAll('.modal').forEach(function (modal) {
      modal.querySelectorAll('[data-close-modal]').forEach(function (btn) {
        btn.addEventListener('click', function () { closeModal(modal); });
      });
      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeModal(modal);
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      document.querySelectorAll('.modal.is-open').forEach(closeModal);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initPhoneMasks();
    stampForms();
    initFileDrop();
    initAjaxForms();
    initModals();
  });
})();
