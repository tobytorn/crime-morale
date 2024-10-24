// ==UserScript==
// @name        Crime Morale
// @namespace   https://github.com/tobytorn
// @description tobytorn 自用 Crime 2.0 助手
// @author      tobytorn [1617955]
// @match       https://www.torn.com/loader.php?sid=crimes*
// @version     1.4.2
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
    try {
      return JSON.parse(value) ?? defaultValue;
    } catch (err) {
      return defaultValue;
    }
  }

  function setLocalStorage(key, value) {
    window.localStorage.setItem(LOCAL_STORAGE_PREFIX + key, JSON.stringify(value));
  }

  const isPda = window.GM_info?.scriptHandler?.toLowerCase().includes('tornpda');
  const [getValue, setValue] =
    isPda || typeof window.GM_getValue !== 'function' || typeof window.GM_setValue !== 'function'
      ? [getLocalStorage, setLocalStorage]
      : [window.GM_getValue, window.GM_setValue];

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

  function formatLifetime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const text =
      hours >= 72
        ? `${Math.floor(hours / 24)}d`
        : hours > 0
        ? `${hours}h`
        : seconds >= 0
        ? `${Math.floor(seconds / 60)}m`
        : '';
    const color = hours >= 24 ? 't-gray-c' : hours >= 12 ? 't-yellow' : hours >= 0 ? 't-red' : '';
    return { seconds, hours, text, color };
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

  async function checkCardSkimming(params, data) {
    if (params.get('typeID') !== '6') {
      return;
    }
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
      const lifetime = formatLifetime(property.expire - now);
      const $title = $option.find('[class*=crimeOptionSection___]').first();
      $title.find('.cm-lifetime').remove();
      if (lifetime.hours >= 0 && lifetime.hours <= 48) {
        $title.css('position', 'relative');
        $title.append(`<div class="cm-lifetime ${lifetime.color}" style="
          position: absolute;
          top: 0;
          right: 0;
          padding: 2px;
          background: var(--default-bg-panel-color);
          border: 1px solid darkgray;
        ">${lifetime.text}</div>`);
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

  const PP_CYCLING = 0;
  const PP_DISTRACTED = 34; // eslint-disable-line no-unused-vars
  const PP_MUSIC = 102;
  const PP_LOITERING = 136;
  const PP_PHONE = 170;
  const PP_RUNNING = 204;
  const PP_SOLICITING = 238; // eslint-disable-line no-unused-vars
  const PP_STUMBLING = 272;
  const PP_WALKING = 306;
  const PP_BEGGING = 340;

  const PP_SKINNY = 'Skinny';
  const PP_AVERAGE = 'Average';
  const PP_ATHLETIC = 'Athletic';
  const PP_MUSCULAR = 'Muscular';
  const PP_HEAVYSET = 'Heavyset';
  const PP_ANY_BUILD = [PP_SKINNY, PP_AVERAGE, PP_ATHLETIC, PP_MUSCULAR, PP_HEAVYSET];

  const PP_MARKS = {
    'Drunk Man': { level: 1, status: [PP_STUMBLING], build: PP_ANY_BUILD },
    'Drunk Woman': { level: 1, status: [PP_STUMBLING], build: PP_ANY_BUILD },
    'Homeless Person': { level: 1, status: [PP_BEGGING], build: [PP_AVERAGE] },
    Junkie: { level: 1, status: [PP_STUMBLING], build: PP_ANY_BUILD },
    'Elderly Man': { level: 1, status: [PP_WALKING], build: [PP_SKINNY, PP_AVERAGE, PP_ATHLETIC, PP_HEAVYSET] },
    'Elderly Woman': { level: 1, status: [PP_WALKING], build: [PP_SKINNY, PP_AVERAGE, PP_ATHLETIC, PP_HEAVYSET] },

    'Young Man': { level: 2, status: [PP_MUSIC], build: [PP_SKINNY, PP_AVERAGE, PP_ATHLETIC] },
    'Young Woman': { level: 2, status: [PP_PHONE], build: [PP_SKINNY, PP_AVERAGE, PP_HEAVYSET] },
    Student: { level: 2, status: [PP_PHONE], build: [PP_SKINNY, PP_AVERAGE] },
    'Classy Lady': {
      level: 2,
      status: [PP_PHONE, PP_WALKING],
      build: [PP_SKINNY, PP_HEAVYSET],
      bestBuild: [PP_HEAVYSET],
    },
    Laborer: { level: 2, status: [PP_PHONE], build: PP_ANY_BUILD },
    'Postal Worker': { level: 2, status: [PP_WALKING], build: [PP_AVERAGE] },

    'Rich Kid': {
      level: 3,
      status: [PP_WALKING, PP_PHONE],
      build: [PP_SKINNY, PP_ATHLETIC, PP_HEAVYSET],
      bestBuild: [PP_ATHLETIC],
    },
    'Sex Worker': { level: 3, status: [PP_PHONE], build: [PP_SKINNY, PP_AVERAGE], bestBuild: [PP_AVERAGE] },
    Thug: { level: 3, status: [PP_RUNNING], build: [PP_SKINNY, PP_AVERAGE, PP_ATHLETIC], bestBuild: [PP_SKINNY] },

    Businessman: {
      level: 4,
      status: [PP_PHONE],
      build: [PP_AVERAGE, PP_MUSCULAR, PP_HEAVYSET],
      bestBuild: [PP_MUSCULAR, PP_HEAVYSET],
    },
    Businesswoman: {
      level: 4,
      status: [PP_PHONE],
      build: [PP_SKINNY, PP_AVERAGE, PP_ATHLETIC],
      bestBuild: [PP_ATHLETIC],
    },
    'Gang Member': {
      level: 4,
      status: [PP_LOITERING],
      build: [PP_AVERAGE, PP_ATHLETIC, PP_MUSCULAR],
      bestBuild: [PP_AVERAGE],
    },
    Jogger: { level: 4, status: [PP_WALKING], build: [PP_ATHLETIC, PP_MUSCULAR], bestBuild: [PP_MUSCULAR] },
    Mobster: { level: 4, status: [PP_WALKING], build: [PP_SKINNY] },

    Cyclist: { level: 5, status: [PP_CYCLING], build: ['1.52 m', `5'0"`, '1.62 m', `5'4"`] },
    'Police Officer': {
      level: 6,
      status: [PP_RUNNING],
      build: PP_ANY_BUILD,
      bestBuild: [PP_SKINNY, '1.52 m', `5'0"`, '1.62 m', `5'4"`],
    },
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
        const markAndTime = $this.find('[class*=titleAndProps___] > *:first-child').text().trim().toLowerCase();
        const iconPosStr = $this.find('[class*=timerCircle___] [class*=icon___]').css('background-position-y');
        const iconPosMatch = iconPosStr?.match(/(-?\d+)px/);
        const iconPos = -parseInt(iconPosMatch?.[1] ?? '');
        const build = $this.find('[class*=physicalPropsButton___]').text().trim().toLowerCase();
        for (const [mark, markInfo] of Object.entries(PP_MARKS)) {
          if (markAndTime.startsWith(mark.toLowerCase())) {
            if (markInfo.status.includes(iconPos) && markInfo.build.some((b) => build.includes(b.toLowerCase()))) {
              $this.addClass(`cm-pp-level-${markInfo.level}`);
              if (markInfo.bestBuild?.some((b) => build.includes(b.toLowerCase()))) {
                $this.addClass(`cm-pp-best-build`);
              }
            }
            break;
          }
        }
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

  // Maximize extra exp (capitalization exp - total cost)
  class ScammingSolver {
    get BASE_ACTION_COST() {
      return 0.02;
    }
    get FAILURE_COST_MAP() {
      return {
        1: 1,
        20: 1,
        40: 1,
        60: 0.5,
        80: 0.33,
      };
    }
    get CONCERN_SUCCESS_RATE() {
      return 0.5;
    }
    get CELL_VALUE_MAP() {
      return {
        low: 1.5,
        medium: 2.5,
        high: 3.5,
        fail: -20, // The penalty should be -10. I add a bit to it for demoralization and chain bonus lost.
      };
    }
    get SAFE_CELL() {
      return new Set(['neutral', 'low', 'medium', 'high', 'temptation']);
    }
    get DISPLACEMENT() {
      // prettier-ignore
      return {
        1: {
          strong: [[10, 19], [15, 29], [18, 35], [21, 39], [22, 42], [23, 44]],
          soft: [[3, 7], [5, 11], [6, 13], [6, 14], [7, 15], [7, 16]],
          back: [[-4, -2], [-6, -3], [-7, -4], [-8, -4], [-9, -4], [-9, -5]],
        },
        20: {
          strong: [[8, 15], [12, 23], [15, 28], [16, 31], [18, 33], [18, 35]],
          soft: [[3, 7], [5, 11], [6, 13], [6, 14], [7, 15], [7, 16]],
          back: [[-4, -2], [-6, -3], [-7, -4], [-8, -4], [-9, -4], [-9, -5]],
        },
        40: {
          strong: [[7, 13], [11, 20], [13, 24], [14, 27], [15, 29], [16, 30]],
          soft: [[3, 6], [5, 9], [6, 11], [6, 12], [7, 13], [7, 14]],
          back: [[-4, -2], [-6, -3], [-7, -4], [-8, -4], [-9, -4], [-9, -5]],
        },
        60: {
          strong: [[6, 11], [9, 17], [11, 20], [12, 23], [13, 24], [14, 25]],
          soft: [[2, 4], [3, 6], [4, 7], [4, 8], [4, 9], [5, 9]],
          back: [[-4, -2], [-6, -3], [-7, -4], [-8, -4], [-9, -4], [-9, -5]],
        },
        80: {
          strong: [[5, 9], [8, 14], [9, 17], [10, 19], [11, 20], [12, 21]],
          soft: [[2, 3], [3, 5], [4, 6], [4, 6], [4, 7], [5, 7]],
          back: [[-3, -2], [-5, -3], [-6, -4], [-6, -4], [-7, -4], [-7, -5]],
        },
      };
    }

    constructor(bar, targetLevel, round, suspicion) {
      this.bar = bar;
      this.targetLevel = targetLevel;
      this.failureCost = this.FAILURE_COST_MAP[this.targetLevel];
      this.initialRound = round;
      this.initialSuspicion = suspicion;

      this.driftArrayMap = new Map(); // (resolvingBitmap) => number[50]
      this.dp = new Map(); // (resolvingBitmap | round) => {value: number, action: string, multi: number}[50]

      this.resolving = new Array(50);
      for (let pip = 0; pip < 50; pip++) {
        if (this.resolving[pip]) {
          continue;
        }
        if (this.bar[pip] !== 'hesitation' && this.bar[pip] !== 'concern') {
          this.resolving[pip] = 0n;
          continue;
        }
        let mask = 0n;
        for (let endPip = pip; endPip < 50 && this.bar[endPip] === this.bar[pip]; endPip++) {
          mask += 1n << BigInt(endPip);
        }
        for (let endPip = pip; endPip < 50 && this.bar[endPip] === this.bar[pip]; endPip++) {
          this.resolving[endPip] = mask;
        }
      }
    }

    solve(round, pip, resolvingBitmap, multiplierUsed) {
      const result = this.visit(round - multiplierUsed, resolvingBitmap, multiplierUsed, pip);
      return result[pip];
    }

    /**
     * @param {number} round
     * @param {bigint} resolvingBitmap
     * @param {number} minMulti
     * @param {number | undefined} singlePip
     */
    visit(round, resolvingBitmap, minMulti, singlePip = undefined) {
      const dpKey = BigInt(round) | (resolvingBitmap << 6n);
      const visited = this.dp.get(dpKey);
      if (visited) {
        return visited;
      }
      const result = new Array(50);
      this.dp.set(dpKey, result);
      if (this._estimateSuspicion(round) >= 50) {
        for (let pip = 0; pip < 50; pip++) {
          if (this.bar[pip] === 'fail') {
            result[pip] = {
              value: this.CELL_VALUE_MAP.fail,
              action: 'fail',
              multi: 0,
            };
            continue;
          }
          const value = (this.CELL_VALUE_MAP[this.bar[pip]] ?? 0) - 1;
          result[pip] = {
            value: Math.max(0, value),
            action: value > 0 ? 'capitalize' : 'abandon',
            multi: 0,
          };
        }
        return result;
      }
      const driftArray = this._getDriftArray(resolvingBitmap);
      const [pipBegin, pipEnd] = singlePip !== undefined ? [singlePip, singlePip + 1] : [0, 50];
      for (let pip = pipBegin; pip < pipEnd; pip++) {
        if (this.bar[pip] === 'fail') {
          result[pip] = {
            value: this.CELL_VALUE_MAP.fail,
            action: 'fail',
            multi: 0,
          };
          continue;
        }
        if (!this._isResolved(pip, resolvingBitmap)) {
          if (this.bar[pip] === 'hesitation') {
            const resolvedResult = this.visit(round, resolvingBitmap | this.resolving[pip], 0);
            result[pip] = resolvedResult[pip];
            continue;
          }
          if (this.bar[pip] === 'concern') {
            const resolvedResult = this.visit(round + 1, resolvingBitmap | this.resolving[pip], 0);
            const unresolvedResult = this.visit(round + 1, resolvingBitmap, 0);
            const value =
              resolvedResult[pip].value * this.CONCERN_SUCCESS_RATE +
              (unresolvedResult[pip].value - this.failureCost) * (1 - this.CONCERN_SUCCESS_RATE) -
              this.BASE_ACTION_COST;
            result[pip] = {
              value: Math.max(0, value),
              action: value > 0 ? 'resolve' : 'abandon',
              multi: 0,
            };
            continue;
          }
        }
        const best = {
          value: 0,
          action: 'abandon',
          multi: 0,
        };
        const capValue = this.CELL_VALUE_MAP[this.bar[pip]] ?? 0;
        if (capValue > 1) {
          best.value = capValue - 1;
          best.action = 'capitalize';
        }
        for (let multi = minMulti; multi <= 5; multi++) {
          const suspicionAfterMulti = this._estimateSuspicion(round + multi);
          const nextRoundResult = this.visit(round + multi + 1, resolvingBitmap, 0);
          for (const action of ['strong', 'soft', 'back']) {
            const displacementArray = this.DISPLACEMENT[this.targetLevel.toString()]?.[action]?.[multi];
            if (!displacementArray) {
              continue;
            }
            const [minDisplacement, maxDisplacement] = displacementArray;
            let totalValue = 0;
            for (let disp = minDisplacement; disp <= maxDisplacement; disp++) {
              const landingPip = Math.min(pip + disp, 49);
              const newPip = driftArray[landingPip];
              if (landingPip < suspicionAfterMulti || newPip < suspicionAfterMulti) {
                totalValue += this.CELL_VALUE_MAP.fail;
              } else {
                if (!this.SAFE_CELL.has(this.bar[landingPip]) && !this._isResolved(landingPip, resolvingBitmap)) {
                  totalValue -= this.failureCost;
                }
                totalValue -= this.BASE_ACTION_COST;
                totalValue += nextRoundResult[newPip].value;
              }
            }
            const avgValue = totalValue / (maxDisplacement - minDisplacement + 1) - this.BASE_ACTION_COST * multi;
            if (avgValue > best.value) {
              best.value = avgValue;
              best.action = action;
              best.multi = multi;
            }
          }
        }
        result[pip] = best;
      }
      return result;
    }

    _getDriftArray(resolvingBitmap) {
      const cached = this.driftArrayMap.get(resolvingBitmap);
      if (cached) {
        return cached;
      }
      const driftArray = new Array(50);
      this.driftArrayMap.set(resolvingBitmap, driftArray);
      for (let pip = 0; pip < 50; pip++) {
        let newPip = pip;
        switch (this.bar[pip]) {
          case 'temptation':
            while (
              newPip + 1 < 50 &&
              (!this.SAFE_CELL.has(this.bar[newPip]) || this.bar[newPip] === 'temptation') &&
              !this._isResolved(newPip, resolvingBitmap)
            ) {
              newPip++;
            }
            break;
          case 'sensitivity':
            while (newPip > 0 && this.bar[newPip] !== 'neutral' && !this._isResolved(newPip, resolvingBitmap)) {
              newPip--;
            }
            break;
        }
        driftArray[pip] = newPip;
      }
      return driftArray;
    }

    _estimateSuspicion(round) {
      if (round <= this.initialRound) {
        return this.initialSuspicion;
      }
      const predefined = [0, 0, 0, 0, 2, 5, 8, 11, 16, 23, 34, 50][round] ?? 50;
      const current = Math.floor(this.initialSuspicion * 1.5 ** (round - this.initialRound));
      return Math.max(predefined, current);
    }

    _isResolved(pip, resolvingBitmap) {
      return ((1n << BigInt(pip)) & resolvingBitmap) !== 0n;
    }
  }

  class ScammingStore {
    get TARGET_LEVEL_MAP() {
      return {
        'delivery scam': 1,
        'family scam': 1,
        'prize scam': 1,
        'charity scam': 20,
        'tech support scam': 20,
        'vacation scam': 40,
        'tax scam': 40,
        'advance-fee scam': 60,
        'job scam': 60,
        'romance scam': 80,
        'investment scam': 80,
      };
    }
    get SPAM_ID_MAP() {
      return {
        295: 'delivery',
        293: 'family',
        291: 'prize',
        297: 'charity',
        299: 'tech support',
        301: 'vacation',
        303: 'tax',
        305: 'advance-fee',
        307: 'job',
        309: 'romance',
        311: 'investment',
      };
    }
    constructor() {
      this.data = getValue('scamming', {});
      this.data.targets = this.data.targets ?? {};
      this.data.farms = this.data.farms ?? {};
      this.data.spams = this.data.spams ?? {};
      this.unsyncedSet = new Set(Object.keys(this.data.targets));
      this.solvers = {};
      this.lastSolutions = {};
    }

    update(data) {
      this._updateTargets(data.DB?.crimesByType?.targets);
      this._updateFarms(data.DB?.additionalInfo?.currentOngoing);
      this._updateSpams(data.DB?.currentUserStats?.crimesByIDAttempts);
      this._save();
    }

    _save() {
      setValue('scamming', this.data);
    }

    _updateTargets(targets) {
      if (!targets) {
        return;
      }
      for (const target of targets) {
        const stored = this.data.targets[target.subID];
        if (stored && !target.new && target.bar) {
          let updated = false;
          if (stored.multiplierUsed !== target.multiplierUsed || stored.pip !== target.pip) {
            stored.multiplierUsed = target.multiplierUsed;
            stored.pip = target.pip;
            stored.expire = target.expire;
            updated = true;
          }
          if (updated && this.unsyncedSet.has(stored.id)) {
            stored.unsynced = true; // replied on another device
          }
          this.unsyncedSet.delete(stored.id);
          if (stored.bar) {
            for (let pip = 0; pip < 50; pip++) {
              if (target.bar[pip] === stored.bar[pip]) {
                continue;
              }
              if (target.bar[pip] === 'fail' && stored.suspicion <= pip) {
                stored.suspicion = pip + 1;
                updated = true;
              }
              if (target.bar[pip] === 'neutral' && (BigInt(stored.resolvingBitmap) & (1n << BigInt(pip))) === 0n) {
                stored.resolvingBitmap = (BigInt(stored.resolvingBitmap) | (1n << BigInt(pip))).toString();
                updated = true;
              }
            }
          }
          if (updated) {
            // Round is not accurate for concern and hesitation.
            stored.round++;
          }
          if (!stored.bar) {
            stored.bar = target.bar;
            updated = true;
          }
          if (updated || !stored.solution) {
            this._solve(stored);
          }
        } else {
          const multiplierUsed = target.multiplierUsed ?? 0;
          const pip = target.pip ?? 0;
          const round = multiplierUsed === 0 && pip === 0 ? 0 : Math.max(1, multiplierUsed);
          const stored = {
            id: target.subID,
            email: target.email,
            level: this.TARGET_LEVEL_MAP[target.scamMethod.toLowerCase()] ?? 999,
            round,
            multiplierUsed,
            pip,
            expire: target.expire,
            bar: target.bar ?? null,
            suspicion: 0,
            resolvingBitmap: '0',
            solution: null,
            unsynced: round > 0,
          };
          this.data.targets[target.subID] = stored;
          this._solve(stored);
        }
      }
      const now = Math.floor(Date.now() / 1000);
      for (const target of Object.values(this.data.targets)) {
        if (target.expire < now) {
          delete this.data.targets[target.id];
        }
      }
    }

    _updateFarms(currentOngoing) {
      if (typeof currentOngoing !== 'object' || !(currentOngoing.length > 0)) {
        return;
      }
      for (const item of currentOngoing) {
        if (!item.type) {
          continue;
        }
        this.data.farms[item.type] = { expire: item.timeEnded };
      }
    }

    _updateSpams(crimesByIDAttempts) {
      if (!crimesByIDAttempts) {
        return;
      }
      const now = Math.floor(Date.now() / 1000);
      for (const [id, count] of Object.entries(crimesByIDAttempts)) {
        const type = this.SPAM_ID_MAP[id];
        if (!type) {
          continue;
        }
        const stored = this.data.spams[id];
        if (stored) {
          if (count !== stored.count) {
            stored.count = count;
            stored.accurate = now - stored.ts < 3600;
            stored.since = now;
          }
          stored.ts = now;
        } else {
          this.data.spams[id] = {
            count,
            accurate: false,
            since: null,
            ts: now,
          };
        }
      }
    }

    _solve(target) {
      if (!target.bar) {
        return;
      }
      this.lastSolutions[target.id] = target.solution;
      let solver = this.solvers[target.id];
      if (!solver || target.suspicion > 0) {
        solver = new ScammingSolver(target.bar, target.level, target.round, target.suspicion);
        this.solvers[target.id] = solver;
      }
      target.solution = solver.solve(target.round, target.pip, BigInt(target.resolvingBitmap), target.multiplierUsed);
    }
  }

  class ScammingObserver {
    constructor() {
      this.store = new ScammingStore();
      this.crimeOptions = null;
      this.farmIcons = null;
      this.observer = new MutationObserver((mutations) => {
        const isAdd = mutations.some((mutation) => {
          for (const added of mutation.addedNodes) {
            if (added instanceof HTMLElement) {
              return true;
            }
          }
          return false;
        });
        if (!isAdd) {
          return;
        }
        for (const element of this.crimeOptions) {
          if (!element.classList.contains('cm-sc-seen')) {
            element.classList.add('cm-sc-seen');
            this._refreshTarget(element);
          }
        }
        for (const element of this.farmIcons) {
          if (!element.classList.contains('cm-sc-seen')) {
            element.classList.add('cm-sc-seen');
            this._refreshFarm(element);
          }
        }
        for (const element of this.spamOptions) {
          if (!element.classList.contains('cm-sc-seen')) {
            element.classList.add('cm-sc-seen');
            this._refreshSpam(element);
          }
        }
      });
    }

    start() {
      if (this.crimeOptions) {
        return;
      }
      this.crimeOptions = document.body.getElementsByClassName('crime-option');
      this.farmIcons = document.body.getElementsByClassName('scraperPhisher___oy1Wn');
      this.spamOptions = document.body.getElementsByClassName('optionWithLevelRequirement___cHH35');
      this.observer.observe($('.scamming-root')[0], { subtree: true, childList: true });
    }

    stop() {
      this.crimeOptions = null;
      this.observer.disconnect();
    }

    onNewData() {
      this.start();
      for (const element of this.crimeOptions) {
        this._refreshTarget(element);
      }
      for (const element of this.farmIcons) {
        this._refreshFarm(element);
      }
      for (const element of this.spamOptions) {
        this._refreshSpam(element);
      }
    }

    _buildHintHtml(target, solution, lastSolution) {
      const actionText =
        {
          strong: 'Fast Fwd',
          soft: 'Soft Fwd',
          back: 'Back',
          capitalize: '$$$',
          abandon: 'Abandon',
          resolve: 'Resolve',
        }[solution.action] ?? 'N/A';
      const score = Math.floor(solution.value * 100);
      const scoreColor = score < 30 ? 't-red' : score < 100 ? 't-yellow' : 't-green';
      const scoreDiff = lastSolution ? score - Math.floor(lastSolution.value * 100) : 0;
      const scoreDiffColor = scoreDiff > 0 ? 't-green' : 't-red';
      const scoreDiffText = scoreDiff !== 0 ? `(${scoreDiff > 0 ? '+' : ''}${scoreDiff})` : '';
      let rspText = solution.multi > target.multiplierUsed ? 'Accel' : actionText;
      let rspColor = '';
      let fullRspText = solution.multi > 0 ? `(${target.multiplierUsed}/${solution.multi} + ${actionText})` : '';
      if (target.unsynced) {
        rspText = 'Unsynced';
        rspColor = 't-gray-c';
        fullRspText = fullRspText !== '' ? fullRspText : `(${actionText})`;
      }
      return `<span class="cm-sc-info cm-sc-hint cm-sc-hint-content">
        <span>Score: <span class="${scoreColor}">${score}</span><span class="${scoreDiffColor}">${scoreDiffText}</span></span>
        <span class="cm-sc-hint-action"><span class="${rspColor}">${rspText}</span> <span class="t-gray-c">${fullRspText}</span></span>
        <span class="cm-sc-hint-button t-blue">Lv${target.level}</span>
      </span>`;
    }

    _refreshTarget(element) {
      const $crimeOption = $(element);
      const $email = $crimeOption.find('span.email___gVRXx');
      const email = $email.text();
      const target = Object.values(this.store.data.targets).find((x) => x.email === email);
      if (!target) {
        return;
      }
      // clear old info elements
      const hasHint = $crimeOption.find('.cm-sc-hint-content').length > 0;
      $crimeOption.find('.cm-sc-info').remove();
      $email.parent().addClass('cm-sc-info-wrapper');
      $email.parent().children().addClass('cm-sc-orig-info');
      // hint
      const solution = target.solution;
      if (solution) {
        if (!hasHint) {
          $email.parent().removeClass('cm-sc-hint-hidden');
        }
        $crimeOption.attr('data-cm-action', solution.multi > target.multiplierUsed ? 'accelerate' : solution.action);
        $crimeOption.toggleClass('cm-sc-unsynced', target.unsynced ?? false);
        const lastSolution = this.store.lastSolutions[target.id];
        $email.parent().append(this._buildHintHtml(target, solution, lastSolution));
        $email.parent().append(`<span class="cm-sc-info cm-sc-orig-info cm-sc-hint-button t-blue">Hint</div>`);
        $crimeOption.find('.cm-sc-hint-button').on('click', () => {
          $email.parent().toggleClass('cm-sc-hint-hidden');
        });
      } else {
        $email.parent().addClass('cm-sc-hint-hidden');
      }
      // lifetime
      const now = Math.floor(Date.now() / 1000);
      const lifetime = formatLifetime(target.expire - now);
      $email.before(`<span class="cm-sc-info ${lifetime.color}">${lifetime.text}</div>`);
      // scale
      const $cells = $crimeOption.find('.cell___AfwZm');
      if ($cells.length >= 50) {
        $cells.find('.cm-sc-scale').remove();
        // Ignore cells after the first 50, which are faded out soon
        for (let i = 0; i < 50; i++) {
          const dist = i - target.pip;
          const label = dist % 5 !== 0 || dist === 0 || dist < -5 ? '' : dist % 10 === 0 ? (dist / 10).toString() : "'";
          let $scale = $cells.eq(i).children('.cm-sc-scale');
          if ($scale.length === 0) {
            $scale = $('<div class="cm-sc-scale"></div>');
            $cells.eq(i).append($scale);
          }
          $scale.text(label);
        }
      }
      // multiplier
      const $accButton = $crimeOption.find('.response-type-button').eq(3);
      $accButton.find('.cm-sc-multiplier').remove();
      if (target.multiplierUsed > 0) {
        $accButton.append(`<div class="cm-sc-multiplier">${target.multiplierUsed}</div>`);
      }
    }

    _refreshFarm(element) {
      const $element = $(element);
      const label = $element.attr('aria-label') ?? '';
      const farm = Object.entries(this.store.data.farms).find(([type]) => label.toLowerCase().includes(type))?.[1];
      if (!farm) {
        return;
      }
      const now = Math.floor(Date.now() / 1000);
      const lifetime = formatLifetime(farm.expire - now);
      $element.find('.cm-sc-farm-lifetime').remove();
      $element.append(`<div class="cm-sc-farm-lifetime ${lifetime.color}">${lifetime.text}</div>`);
    }

    _refreshSpam(element) {
      const $spamOption = $(element);
      if ($spamOption.closest('.dropdownList').length === 0) {
        return;
      }
      const label = $spamOption
        .contents()
        .filter((_, x) => x.nodeType === Node.TEXT_NODE)
        .text();
      const spam = Object.entries(this.store.data.spams).find(([id]) =>
        label.toLowerCase().includes(this.store.SPAM_ID_MAP[id]),
      )?.[1];
      $spamOption.addClass('cm-sc-spam-option');
      if (!spam || !spam.since) {
        return;
      }
      if ($spamOption.find('.diminishedIconWrapper___ntun9').length > 0) {
        return;
      }
      const now = Math.floor(Date.now() / 1000);
      const elapsed = formatLifetime(now - spam.since);
      if (!spam.accurate) {
        elapsed.text = '> ' + elapsed.text;
      }
      if (elapsed.hours >= 24 * 8) {
        elapsed.text = '> 7d';
      }
      $spamOption.find('.cm-sc-spam-elapsed').remove();
      $spamOption.append(`<div class="cm-sc-spam-elapsed ${elapsed.color}">${elapsed.text}</div>`);
    }
  }
  const scammingObserver = new ScammingObserver();

  async function checkScamming(params, data) {
    if (params.get('typeID') !== '12') {
      scammingObserver.stop();
      return;
    }
    scammingObserver.store.update(data);
    scammingObserver.onNewData();
  }

  async function onCrimeData(params, data) {
    await checkDemoralization(data);
    await checkCardSkimming(params, data);
    await checkBurglary(params, data);
    await checkPickpocketing(params);
    await checkScamming(params, data);
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
      const $container = $('.crimes-app-header');
      if ($container.length === 0) {
        return;
      }
      clearInterval(interval);
      $container.append(`<span>Morale: <span id="crime-morale-value">-</span>%</span>`);
      const morale = parseInt(await getValue(STORAGE_MORALE));
      if (!isNaN(morale)) {
        updateMorale(morale);
      }
      // Show hidden debug button on double-click
      let lastClick = 0; // dblclick event doesn't work well on mobile
      $('#crime-morale-value')
        .parent()
        .on('click', function () {
          if (Date.now() - lastClick > 1000) {
            lastClick = Date.now();
            return;
          }
          const data = {
            morale: getValue(STORAGE_MORALE),
            scamming: getValue('scamming'),
          };
          const export_uri = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data))}`;
          $(this).replaceWith(`<a download="crime-morale-debug.json" href="${export_uri}"
            class="torn-btn" style="display:inline-block;">Export Debug Data</a>`);
        });
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
        --cm-pp-level-3: #f4cc00;
        --cm-pp-level-4: #fa9201;
        --cm-pp-level-5: #e01111;
        --cm-pp-level-6: #a016eb;
        --cm-pp-filter-level-1: brightness(0) saturate(100%) invert(61%) sepia(11%) saturate(2432%) hue-rotate(79deg) brightness(91%) contrast(96%);
        --cm-pp-filter-level-2: brightness(0) saturate(100%) invert(62%) sepia(80%) saturate(2102%) hue-rotate(32deg) brightness(99%) contrast(84%);
        --cm-pp-filter-level-3: brightness(0) saturate(100%) invert(71%) sepia(53%) saturate(1820%) hue-rotate(9deg) brightness(107%) contrast(102%);
        --cm-pp-filter-level-4: brightness(0) saturate(100%) invert(61%) sepia(62%) saturate(1582%) hue-rotate(356deg) brightness(94%) contrast(108%);
        --cm-pp-filter-level-5: brightness(0) saturate(100%) invert(12%) sepia(72%) saturate(5597%) hue-rotate(354deg) brightness(105%) contrast(101%);
        --cm-pp-filter-level-6: brightness(0) saturate(100%) invert(26%) sepia(84%) saturate(4389%) hue-rotate(271deg) brightness(86%) contrast(119%);
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
      .cm-pp-level-4 {
        color: var(--cm-pp-level-4);
      }
      .cm-pp-level-5 {
        color: var(--cm-pp-level-5);
      }
      .cm-pp-level-6 {
        color: var(--cm-pp-level-6);
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
      .cm-pp-level-4 [class*=timerCircle___] [class*=icon___] {
        filter: var(--cm-pp-filter-level-4);
      }
      .cm-pp-level-5 [class*=timerCircle___] [class*=icon___] {
        filter: var(--cm-pp-filter-level-5);
      }
      .cm-pp-level-6 [class*=timerCircle___] [class*=icon___] {
        filter: var(--cm-pp-filter-level-6);
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
      .cm-pp-level-4 [class*=timerCircle___] .CircularProgressbar-path {
        stroke: var(--cm-pp-level-4) !important;
      }
      .cm-pp-level-5 [class*=timerCircle___] .CircularProgressbar-path {
        stroke: var(--cm-pp-level-5) !important;
      }
      .cm-pp-level-6 [class*=timerCircle___] .CircularProgressbar-path {
        stroke: var(--cm-pp-level-6) !important;
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
      .cm-pp-level-4 [class*=commitButton___] {
        border: 2px solid var(--cm-pp-level-4);
      }
      .cm-pp-level-5 [class*=commitButton___] {
        border: 2px solid var(--cm-pp-level-5);
      }
      .cm-pp-best-build:not(.crime-option-locked) [class*=physicalPropsButton___]:before {
        content: '\u2713 ';
        font-weight: bold;
        color: var(--cm-pp-level-2);
      }

      .cm-sc-info {
        transform: translateY(1px);
      }
      .cm-sc-hint-button {
        cursor: pointer;
      }
      .cm-sc-info-wrapper.cm-sc-hint-hidden > .cm-sc-hint,
      .cm-sc-info-wrapper:not(.cm-sc-hint-hidden) > .cm-sc-orig-info {
        display: none;
      }
      .cm-sc-hint-content {
        display: flex;
        justify-content: space-between;
        flex-grow: 1;
        gap: 5px;
        white-space: nowrap;
        overflow: hidden;
      }
      .cm-sc-hint-action {
        flex-shrink: 1;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .cm-sc-seen[data-cm-action=strong] .response-type-button:nth-child(1):after,
      .cm-sc-seen[data-cm-action=soft] .response-type-button:nth-child(2):after,
      .cm-sc-seen[data-cm-action=back] .response-type-button:nth-child(3):after,
      .cm-sc-seen[data-cm-action=accelerate] .response-type-button:nth-child(4):after,
      .cm-sc-seen[data-cm-action=capitalize] .response-type-button:nth-child(5):after {
        content: '\u2713';
        color: var(--crimes-green-color);
        position: absolute;
        top: 0;
        right: 0;
        font-size: 12px;
        font-weight: bolder;
        line-height: 1;
        z-index: 999;
      }
      .cm-sc-seen.cm-sc-unsynced[data-cm-action=strong] .response-type-button:nth-child(1):after,
      .cm-sc-seen.cm-sc-unsynced[data-cm-action=soft] .response-type-button:nth-child(2):after,
      .cm-sc-seen.cm-sc-unsynced[data-cm-action=back] .response-type-button:nth-child(3):after,
      .cm-sc-seen.cm-sc-unsynced[data-cm-action=accelerate] .response-type-button:nth-child(4):after,
      .cm-sc-seen.cm-sc-unsynced[data-cm-action=capitalize] .response-type-button:nth-child(5):after {
        content: '?';
      }
      .cm-sc-seen[data-cm-action=abandon] .response-type-button:after {
        content: '\u2715';
        color: var(--crimes-stats-criticalFails-color);
        position: absolute;
        top: 0;
        right: 0;
        font-size: 12px;
        font-weight: bolder;
        line-height: 1;
        z-index: 999;
      }
      .cm-sc-scale {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: calc(100% + 10px);
        line-height: 1;
        font-size: 8px;
        display: flex;
        align-items: flex-end;
        justify-content: center;
      }
      .cm-sc-multiplier {
        position: absolute;
        bottom: 0;
        right: 0;
        text-align: right;
        font-size: 10px;
        line-height: 1;
      }
      .cm-sc-farm-lifetime {
        padding-top: 2px;
        text-align: center;
      }
      .cm-sc-spam-option .levelLabel___LNbg8,
      .cm-sc-spam-option .separator___C2skk {
        display: none;
      }
      .cm-sc-spam-elapsed {
        position: absolute;
        right: -5px;
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
