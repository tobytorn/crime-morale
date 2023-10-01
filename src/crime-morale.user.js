// ==UserScript==
// @name        Crime Morale
// @namespace   https://github.com/tobytorn
// @description Show the demoralization effect in Crime 2.0
// @author      tobytorn [1617955]
// @match       https://www.torn.com/loader.php?sid=crimes*
// @version     1.2.0
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       unsafeWindow
// @run-at      document-start
// @supportURL  https://github.com/tobytorn/crime-morale
// @license     MIT
// @require     https://unpkg.com/jquery@3.7.0/dist/jquery.min.js
// ==/UserScript==

(function () {
  'use strict';

  // Avoid duplicate injection in TornPDA
  if (window.CRIME_MORALE_INJECTED) {
    return;
  }
  window.CRIME_MORALE_INJECTED = true;
  console.log('Userscript Crime Morale starts');

  const LOCAL_STORAGE_PREFIX = 'CRIME_MORALE_';
  const STORAGE_MORALE = 'morale';

  function getLocalStorage(key, defaultValue) {
    const value = window.localStorage.getItem(LOCAL_STORAGE_PREFIX + key);
    return value !== null ? value : defaultValue;
  }

  function setLocalStorage(key, value) {
    window.localStorage.setItem(LOCAL_STORAGE_PREFIX + key, value);
  }

  const getValue = window.GM_getValue || getLocalStorage;
  const setValue = window.GM_setValue || setLocalStorage;

  async function checkDemoralization(data) {
    const demMod = (data.DB || {}).demMod;
    if (typeof demMod !== 'number') {
      return;
    }
    const morale = 100 - demMod;
    updateMorale(morale);
    await setValue(STORAGE_MORALE, morale);
  }

  const cardSkimmingDelays = [];
  let cardSkimmingUpdateInterval = 0;

  const burglaryData = [];
  let burglaryUpdateInterval = 0;

  function updateCardSkimmingDelay($texts, delays) {
    delays.forEach((delay, index) => {
      if (delay < 0) {
        return;
      }
      const minutes = Math.floor(delay / 60);
      const color = minutes < 10 ? 't-red' : minutes < 30 ? 't-yellow' : minutes < 60 ? 't-green' : 't-gray-c';
      $texts.eq(index).html(`<span class="${color}">${minutes}'</span>`);
    });
  }

  async function checkCardSkimming(data) {
    const now = Math.floor(Date.now() / 1000);
    const subCrimes = data.DB?.crimesByType?.subCrimes;
    if (!subCrimes?.length) {
      return;
    }
    cardSkimmingDelays.length = 0;
    for (let i = 0; i < subCrimes.length; i++) {
      const delay = subCrimes[i]?.crimeInfo?.timeWhenUpdated - now;
      if (isNaN(delay)) {
        cardSkimmingDelays.length = 0;
        return;
      }
      cardSkimmingDelays.push(subCrimes[i]?.crimeInfo?.timeWhenUpdated - now);
    }

    const $texts = $('[class*=crimeOption___] span[class*=statusText___]');
    if ($texts.length === 0) {
      if (cardSkimmingUpdateInterval === 0) {
        // This is the first fetch.
        cardSkimmingUpdateInterval = setInterval(() => {
          const $textsInInterval = $('[class*=crimeOption___] span[class*=statusText___]');
          if ($textsInInterval.length !== cardSkimmingDelays.length) {
            return;
          }
          clearInterval(cardSkimmingUpdateInterval);
          updateCardSkimmingDelay($textsInInterval, cardSkimmingDelays);
          cardSkimmingDelays.length = 0;
        }, 1000);
      }
      return;
    }
    if ($texts.length === cardSkimmingDelays.length) {
      updateCardSkimmingDelay($texts, cardSkimmingDelays);
    }
    cardSkimmingDelays.length = 0;
    clearInterval(cardSkimmingUpdateInterval);
  }

  function updateBurglary($options, data) {
    const now = Math.floor(Date.now() / 1000);
    data.forEach((property, index) => {
      const $option = $options.eq(index);
      const confidence = property.confidence;
      const $icon = $option.find('[class*=propertyIcon___]');
      $icon.find('.cm-confidence').remove();
      if (confidence >= 50) {
        $icon.css('position', 'relative');
        $icon.append(`<div class="cm-confidence t-green" style="
          position: absolute;
          bottom: 0;
          width: 100%;
          text-align: center;
          padding: 2px;
          box-sizing: border-box;
          background: var(--default-bg-panel-color);
        ">${property.confidence}%</div>`);
      }
      const lifetime = Math.floor((property.expire - now) / 3600);
      const $title = $option.find('[class*=crimeOptionSection___]').first();
      $title.find('.cm-lifetime').remove();
      if (lifetime > 0 && lifetime <= 48) {
        const color = lifetime >= 24 ? 't-gray-c' : lifetime >= 12 ? 't-yellow' : 't-red';
        $title.css('position', 'relative');
        $title.append(`<div class="cm-lifetime ${color}" style="
          position: absolute;
          top: 0;
          right: 0;
          padding: 2px;
          background: var(--default-bg-panel-color);
          border: 1px solid darkgray;
        ">${lifetime}h</div>`);
      }
    });
  }

  async function checkBurglary(params, data) {
    if (params.get('typeID') !== '7') {
      return;
    }
    const props = data.DB?.crimesByType?.properties;
    if (!props?.length) {
      return;
    }
    burglaryData.length = 0;
    burglaryData.push(...props);

    const $options = $('[class*=crimeOptionGroup___]').last().find('[class*=crimeOption___]');
    if ($options.length === 0) {
      if (burglaryUpdateInterval === 0) {
        // This is the first fetch.
        burglaryUpdateInterval = setInterval(() => {
          const $optionsInInterval = $('[class*=crimeOptionGroup___]').last().find('[class*=crimeOption___]');
          if ($optionsInInterval.length !== burglaryData.length) {
            return;
          }
          clearInterval(burglaryUpdateInterval);
          updateBurglary($optionsInInterval, burglaryData);
          burglaryData.length = 0;
        }, 1000);
      }
      return;
    }
    if ($options.length === burglaryData.length) {
      updateBurglary($options, burglaryData);
    }
    burglaryData.length = 0;
    clearInterval(burglaryUpdateInterval);
  }

  async function onCrimeData(params, data) {
    await checkDemoralization(data);
    await checkCardSkimming(data);
    await checkBurglary(params, data);
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
          await onCrimeData(params, await clonedRsp.json());
        }
      } catch {
        // ignore
      }

      return rsp;
    };
  }

  function renderMorale() {
    const interval = setInterval(async function () {
      if (!$) {
        return; // JQuery is not loaded in TornPDA yet
      }
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
