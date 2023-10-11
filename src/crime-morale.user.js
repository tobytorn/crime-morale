// ==UserScript==
// @name        Crime Morale
// @namespace   https://github.com/tobytorn
// @description Show the demoralization effect in Crime 2.0
// @author      tobytorn [1617955]
// @match       https://www.torn.com/loader.php?sid=crimes*
// @version     1.3.1
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
  const STYLE_ELEMENT_ID = 'CRIME-MORALE-STYLE';

  function getLocalStorage(key, defaultValue) {
    const value = window.localStorage.getItem(LOCAL_STORAGE_PREFIX + key);
    return value !== null ? value : defaultValue;
  }

  function setLocalStorage(key, value) {
    window.localStorage.setItem(LOCAL_STORAGE_PREFIX + key, value);
  }

  const getValue = window.GM_getValue || getLocalStorage;
  const setValue = window.GM_setValue || setLocalStorage;

  function addStyle(css) {
    const style =
      document.getElementById(STYLE_ELEMENT_ID) ??
      (function () {
        const style = document.createElement('style');
        style.id = STYLE_ELEMENT_ID;
        document.head.appendChild(style);
        return style;
      })();
    style.appendChild(document.createTextNode(css));
  }

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

  let pickpocketingOb = null;
  let pickpocketingInterval = 0;

  async function checkPickpocketing(params) {
    if (params.get('typeID') !== '5') {
      if (params.get('typeID') !== null) {
        stopPickpocketing();
      }
      return;
    }
    const $wrapper = $('.pickpocketing-root [class*=crimeOptionGroup___]');
    if ($wrapper.length === 0) {
      if (pickpocketingInterval === 0) {
        // This is the first fetch.
        pickpocketingInterval = setInterval(() => {
          const $wrapperInInterval = $('.pickpocketing-root [class*=crimeOptionGroup___]');
          if ($wrapperInInterval.length === 0) {
            return;
          }
          clearInterval(pickpocketingInterval);
          pickpocketingInterval = 0;
          startPickpocketing($wrapperInInterval);
        }, 1000);
      }
    } else {
      startPickpocketing($wrapper);
    }
  }

  function startPickpocketing($wrapper) {
    if (pickpocketingOb) {
      return;
    }
    pickpocketingOb = new MutationObserver(function () {
      const now = Math.floor(Date.now() / 1000);
      let isMovingSoon = false;
      $wrapper.find('.crime-option').each(function () {
        const top = Math.floor($(this).position().top);
        const oldTop = parseInt($(this).attr('data-cm-top'));
        if (top !== oldTop) {
          $(this).attr('data-cm-top', top.toString());
          $(this).attr('data-cm-timestamp', now.toString());
        }
        const timestamp = parseInt($(this).attr('data-cm-timestamp')) || now;
        const isLocked = $(this).is('[class*=locked___]');
        isMovingSoon = isMovingSoon || isLocked || now - timestamp <= 1;
        $(this)
          .find('[class*=commitButtonSection___]')
          .toggleClass('cm-overlay', isMovingSoon && !isLocked);

        const iconPosStr = $(this).find('[class*=timerCircle___] [class*=icon___]').css('background-position-y');
        const iconPosMatch = iconPosStr?.match(/(-\d+)px/);
        const iconPos = parseInt(iconPosMatch?.[1] ?? '');
        let isEasy = false;
        let isMedium = false;
        if ([-34, -272].includes(iconPos)) {
          // -34: Distracted
          // -272: Stumbling
          isEasy = true;
        } else if (iconPos === -102) {
          // -102: Listening to music
          isMedium = true;
        }
        $(this).toggleClass('cm-pickpocketing-easy', isEasy);
        $(this).toggleClass('cm-pickpocketing-medium', isMedium);
      });
    });
    pickpocketingOb.observe($wrapper[0], {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  function stopPickpocketing() {
    if (!pickpocketingOb) {
      return;
    }
    pickpocketingOb.disconnect();
    pickpocketingOb = null;
  }

  async function onCrimeData(params, data) {
    await checkDemoralization(data);
    await checkCardSkimming(data);
    await checkBurglary(params, data);
    await checkPickpocketing(params);
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

  function renderStyle() {
    addStyle(`
      .cm-overlay {
        position: relative;
      }
      .cm-overlay:after {
        content: '';
        position: absolute;
        background: repeating-linear-gradient(135deg, #2223, #2223 70px, #0003 70px, #0003 80px);
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 900000;
      }
      .cm-pickpocketing-easy [class*=timerCircle___] [class*=icon___] {
        filter: invert(45%) sepia(20%) saturate(1416%) hue-rotate(80deg);
      }
      .cm-pickpocketing-easy [class*=timerCircle___] .CircularProgressbar-path {
        stroke: #2cac46 !important;
      }
      .cm-pickpocketing-easy [class*=commitButton___] {
        border: 2px solid #2cac46;
      }
      .cm-pickpocketing-medium [class*=timerCircle___] [class*=icon___] {
        filter: invert(25%) sepia(30%) saturate(1000%) hue-rotate(30deg);
      }
      .cm-pickpocketing-medium [class*=timerCircle___] .CircularProgressbar-path {
        stroke: #95af14 !important;
      }
      .cm-pickpocketing-medium [class*=commitButton___] {
        border: 2px solid #95af14;
      }
    `);
  }

  interceptFetch();
  renderMorale();

  if (document.readyState === 'loading') {
    document.addEventListener('readystatechange', () => {
      if (document.readyState === 'interactive') {
        renderStyle();
      }
    });
  } else {
    renderStyle();
  }
})();
