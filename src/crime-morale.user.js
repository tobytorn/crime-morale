// ==UserScript==
// @name        Crime Morale
// @namespace   https://github.com/tobytorn
// @description Show the demoralization effect in Crime 2.0
// @author      tobytorn [1617955]
// @match       https://www.torn.com/loader.php?sid=crimes*
// @version     1.0.0
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       unsafeWindow
// @supportURL  https://github.com/tobytorn/crime-morale
// @license     MIT
// @require     https://unpkg.com/jquery@3.7.0/dist/jquery.min.js
// ==/UserScript==

(function () {
  'use strict';

  const LOCAL_STORAGE_PREFIX = 'CRIME_MORALE_';
  const STORAGE_MORALE = 'morale';

  function getLocalStorage(key, defaultValue) {
    const value = window.localStorage.getItem(LOCAL_STORAGE_PREFIX + key);
    return value !== null ? value : defaultValue;
  }

  function setLocalStorage(key, value) {
    window.localStorage.setItem(LOCAL_STORAGE_PREFIX + key, value);
  }

  const $ = window.jQuery;
  const getValue = window.GM_getValue || getLocalStorage;
  const setValue = window.GM_setValue || setLocalStorage;

  async function onCrimeData(data) {
    const demMod = (data.DB || {}).demMod;
    if (typeof demMod !== 'number') {
      return;
    }
    const morale = 100 - demMod;
    updateMorale(morale);
    await setValue(STORAGE_MORALE, morale);
  }

  function interceptFetch() {
    const targetWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const origFetch = targetWindow.fetch;
    targetWindow.fetch = async (...args) => {
      const rsp = await origFetch(...args);

      try {
        const url = new URL(args[0], location.origin);
        const params = new URLSearchParams(url.search);
        if (url.pathname === '/loader.php' && params.get('sid') === 'crimesData') {
          const clonedRsp = rsp.clone();
          await onCrimeData(await clonedRsp.json());
        }
      } catch {
        // ignore
      }

      return rsp;
    };
  }

  function renderMorale() {
    const interval = setInterval(async function () {
      const $container = $('.crimes-app div[class*=titleContainer___]');
      if ($container.length === 0) {
        return;
      }
      clearInterval(interval);
      $container.append(`<span>Morale: <span id="crime-morale-value">-</span>%</span>`);
      const morale = parseInt(await getValue(STORAGE_MORALE));
      if (!isNaN(morale)) {
        updateMorale(morale);
      }
    }, 500);
  }

  function updateMorale(morale) {
    $('#crime-morale-value').text(morale.toString());
  }

  interceptFetch();
  renderMorale();
})();
