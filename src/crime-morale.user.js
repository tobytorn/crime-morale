// ==UserScript==
// @name        Crime Morale
// @namespace   https://github.com/tobytorn
// @description tobytorn 自用 Crime 2.0 助手
// @author      tobytorn [1617955]
// @match       https://www.torn.com/loader.php?sid=crimes*
// @version     1.3.3
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

  // const PP_STATUS_CYCLING = 0;
  const PP_STATUS_DISTRACTED = 34;
  const PP_STATUS_MUSIC = 102;
  // const PP_STATUS_LOITERING = 136;
  const PP_STATUS_PHONE = 170;
  const PP_STATUS_RUNNING = 204;
  // const PP_STATUS_SOLICITING = 238;
  const PP_STATUS_STUMBLING = 272;
  const PP_STATUS_WALKING = 306;
  // const PP_STATUS_BEGGING = 340;
  const PP_MARKS = {
    'Drunk Man': { level: 1, bestActivity: PP_STATUS_STUMBLING },
    'Drunk Woman': { level: 1, bestActivity: PP_STATUS_STUMBLING },
    'Homeless Person': { level: 1, bestActivity: '' },
    Junkie: { level: 1, bestActivity: PP_STATUS_STUMBLING },
    'Elderly Man': { level: 1, bestActivity: PP_STATUS_WALKING },
    'Elderly Woman': { level: 1, bestActivity: PP_STATUS_WALKING },
    'Classy Lady': { level: 2, bestActivity: PP_STATUS_PHONE },
    Laborer: { level: 2, bestActivity: PP_STATUS_DISTRACTED },
    'Postal Worker': { level: 2, bestActivity: PP_STATUS_DISTRACTED }, // not sure
    'Young Man': { level: 2, bestActivity: PP_STATUS_MUSIC },
    'Young Woman': { level: 2, bestActivity: PP_STATUS_DISTRACTED },
    Student: { level: 2, bestActivity: PP_STATUS_MUSIC },
    'Rich Kid': { level: 3, bestActivity: PP_STATUS_MUSIC },
    'Sex Worker': { level: 3, bestActivity: PP_STATUS_DISTRACTED },
    Thug: { level: 3, bestActivity: PP_STATUS_RUNNING },
    Jogger: { level: 4, bestActivity: PP_STATUS_WALKING },
    Businessman: { level: 4, bestActivity: PP_STATUS_PHONE },
    Businesswoman: { level: 4, bestActivity: PP_STATUS_PHONE },
    'Gang Member': { level: 4, bestActivity: '' },
    Mobster: { level: 4, bestActivity: '' },
    Cyclist: { level: 5, bestActivity: '' },
    'Police Officer': { level: 6, bestActivity: PP_STATUS_RUNNING },
  };
  let pickpocketingOb = null;
  let pickpocketingExitOb = null;
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

  function refreshPickpocketing() {
    const $wrapper = $('.pickpocketing-root [class*=crimeOptionGroup___]');
    const now = Date.now();
    // Releasing reference to removed elements to avoid memory leak
    pickpocketingExitOb.disconnect();
    let isBelowExiting = false;
    $wrapper.find('.crime-option').each(function () {
      const $this = $(this);
      const top = Math.floor($this.position().top);
      const oldTop = parseInt($this.attr('data-cm-top'));
      if (top !== oldTop) {
        $this.attr('data-cm-top', top.toString());
        $this.attr('data-cm-timestamp', now.toString());
      }
      const timestamp = parseInt($this.attr('data-cm-timestamp')) || now;
      const isLocked = $this.is('[class*=locked___]');
      const isExiting = $this.is('[class*=exitActive___]');
      const isRecentlyMoved = now - timestamp <= 1000;
      $this
        .find('[class*=commitButtonSection___]')
        .toggleClass('cm-overlay', !isLocked && (isBelowExiting || isRecentlyMoved))
        .toggleClass('cm-overlay-fade', !isLocked && !isBelowExiting && isRecentlyMoved);
      isBelowExiting = isBelowExiting || isExiting;

      if (!$this.is('[class*=cm-pp-level-]')) {
        const markAndTime = $this.find('[class*=titleAndProps___] > *:first-child').text().toLowerCase();
        const iconPosStr = $this.find('[class*=timerCircle___] [class*=icon___]').css('background-position-y');
        const iconPosMatch = iconPosStr?.match(/(-\d+)px/);
        const iconPos = -parseInt(iconPosMatch?.[1] ?? '');
        let level = 'na';
        for (const [mark, markInfo] of Object.entries(PP_MARKS)) {
          if (markAndTime.startsWith(mark.toLowerCase())) {
            if (iconPos === markInfo.bestActivity) {
              level = markInfo.level.toString();
            }
            break;
          }
        }
        $this.addClass(`cm-pp-level-${level}`);
      }

      pickpocketingExitOb.observe(this, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
    });
  }

  function startPickpocketing($wrapper) {
    if (!pickpocketingOb) {
      pickpocketingOb = new MutationObserver(refreshPickpocketing);
      pickpocketingExitOb = new MutationObserver(function (mutations) {
        for (const mutation of mutations) {
          if (
            mutation.oldValue.indexOf('exitActive___') < 0 &&
            mutation.target.className.indexOf('exitActive___') >= 0
          ) {
            refreshPickpocketing();
            return;
          }
        }
      });
    }
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
    pickpocketingExitOb.disconnect();
    pickpocketingExitOb = null;
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
      :root {
        --cm-pp-level-1: #37b24d;
        --cm-pp-level-2: #95af14;
        --cm-pp-level-3: #f59f00;
        --cm-pp-level-4: #f76707;
        --cm-pp-level-5: #f03e3e;
        --cm-pp-filter-level-1: brightness(0) saturate(100%) invert(61%) sepia(11%) saturate(2432%) hue-rotate(79deg) brightness(91%) contrast(96%);
        --cm-pp-filter-level-2: brightness(0) saturate(100%) invert(62%) sepia(80%) saturate(2102%) hue-rotate(32deg) brightness(99%) contrast(84%);
        --cm-pp-filter-level-3: brightness(0) saturate(100%) invert(59%) sepia(59%) saturate(950%) hue-rotate(2deg) brightness(98%) contrast(103%);
        --cm-pp-filter-level-4: brightness(0) saturate(100%) invert(53%) sepia(67%) saturate(3848%) hue-rotate(355deg) brightness(96%) contrast(102%);
        --cm-pp-filter-level-5: brightness(0) saturate(100%) invert(73%) sepia(74%) saturate(7466%) hue-rotate(335deg) brightness(93%) contrast(104%);
      }
      @keyframes cm-fade-out {
        from {
          opacity: 1;
        }
        to {
          opacity: 0;
          visibility: hidden;
        }
      }
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
      .cm-overlay-fade:after {
        animation-name: cm-fade-out;
        animation-duration: 0.2s;
        animation-timing-function: ease-in;
        animation-fill-mode: forwards;
        animation-delay: 0.4s
      }
      .cm-pp-level-1 {
        color: var(--cm-pp-level-1);
      }
      .cm-pp-level-2 {
        color: var(--cm-pp-level-2);
      }
      .cm-pp-level-3 {
        color: var(--cm-pp-level-3);
      }
      .cm-pp-level-1 [class*=timerCircle___] [class*=icon___] {
        filter: var(--cm-pp-filter-level-1);
      }
      .cm-pp-level-2 [class*=timerCircle___] [class*=icon___] {
        filter: var(--cm-pp-filter-level-2);
      }
      .cm-pp-level-3 [class*=timerCircle___] [class*=icon___] {
        filter: var(--cm-pp-filter-level-3);
      }
      .cm-pp-level-1 [class*=timerCircle___] .CircularProgressbar-path {
        stroke: var(--cm-pp-level-1) !important;
      }
      .cm-pp-level-2 [class*=timerCircle___] .CircularProgressbar-path {
        stroke: var(--cm-pp-level-2) !important;
      }
      .cm-pp-level-3 [class*=timerCircle___] .CircularProgressbar-path {
        stroke: var(--cm-pp-level-3) !important;
      }
      .cm-pp-level-1 [class*=commitButton___] {
        border: 2px solid var(--cm-pp-level-1);
      }
      .cm-pp-level-2 [class*=commitButton___] {
        border: 2px solid var(--cm-pp-level-2);
      }
      .cm-pp-level-3 [class*=commitButton___] {
        border: 2px solid var(--cm-pp-level-3);
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
