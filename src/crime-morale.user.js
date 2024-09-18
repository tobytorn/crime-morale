// ==UserScript==
// @name        Crime Morale
// @namespace   https://github.com/tobytorn
// @description tobytorn 自用 Crime 2.0 助手
// @author      tobytorn [1617955]
// @match       https://www.torn.com/loader.php?sid=crimes*
// @version     1.3.9-alpha.1
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

  // Maximize extra exp (total exp - round * EXPECTED_VALUE_PER_ACTION)
  class ScammingSolver {
    get EXPECTED_VALUE_PER_ACTION() {
      return 1.02;
    }
    get CONCERN_SUCCESS_RATE() {
      return 0.6;
    }
    get CELL_VALUE() {
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
        // TODO 60
      };
    }

    constructor(bar, targetLevel, round, suspicion) {
      this.bar = bar;
      this.targetLevel = targetLevel;
      this.initialRound = round;
      this.initialSuspicion = suspicion;

      this.dp = new Map(); // (resolvingBitmap | round) => {value: number, action: string, multi: number}[50]

      this.drift = new Array(50);
      for (let pip = 0; pip < 50; pip++) {
        let newPip = pip;
        switch (this.bar[pip]) {
          case 'temptation':
            while (newPip + 1 < 50 && (!this.SAFE_CELL.has(this.bar[newPip]) || this.bar[newPip] === 'temptation')) {
              newPip++;
            }
            break;
          case 'sensitivity':
            while (newPip > 0 && this.bar[newPip] !== 'neutral') {
              newPip--;
            }
            break;
        }
        this.drift[pip] = newPip;
      }

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
      const result = this.visit(round - multiplierUsed, resolvingBitmap, multiplierUsed);
      return result[pip];
    }

    /**
     * @param {number} round
     * @param {bigint} resolvingBitmap
     * @returns
     */
    visit(round, resolvingBitmap, minMulti) {
      const dpKey = BigInt(round) | (resolvingBitmap << 6n);
      const visited = this.dp.get(dpKey);
      if (visited) {
        return visited;
      }
      const result = new Array(50);
      this.dp.set(dpKey, result);
      if (this._getSuspicion(round) >= 50) {
        for (let pip = 0; pip < 50; pip++) {
          const value = (this.CELL_VALUE[this.bar[pip]] ?? 0) - this.EXPECTED_VALUE_PER_ACTION;
          result[pip] = {
            value: Math.max(0, value),
            action: value > 0 ? 'capitalize' : 'abandon',
            multi: 0,
          };
        }
        return result;
      }
      for (let pip = 0; pip < 50; pip++) {
        if (this.bar[pip] === 'fail') {
          result[pip] = {
            value: this.CELL_VALUE.fail,
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
              (resolvedResult[pip].value + 1) * this.CONCERN_SUCCESS_RATE +
              unresolvedResult[pip].value * (1 - this.CONCERN_SUCCESS_RATE) -
              this.EXPECTED_VALUE_PER_ACTION;
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
        const capValue = this.CELL_VALUE[this.bar[pip]] ?? 0;
        if (capValue > 0) {
          best.value = capValue - this.EXPECTED_VALUE_PER_ACTION;
          best.action = 'capitalize';
        }
        for (let multi = minMulti; multi <= 5; multi++) {
          const suspicionAfterMulti = this._getSuspicion(round + multi);
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
              const newPip = this.drift[landingPip];
              if (landingPip < suspicionAfterMulti || newPip < suspicionAfterMulti) {
                totalValue += this.CELL_VALUE.fail;
              } else {
                if (this.SAFE_CELL.has(this.bar[landingPip]) || this._isResolved(pip, resolvingBitmap)) {
                  totalValue += 1;
                }
                totalValue += nextRoundResult[newPip].value;
              }
            }
            const avgValue =
              totalValue / (maxDisplacement - minDisplacement + 1) +
              multi -
              this.EXPECTED_VALUE_PER_ACTION * (multi + 1);
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

    _getSuspicion(round) {
      const predefined = [0, 0, 0, 0, 2, 5, 8, 11, 16, 23, 34, 50][round] ?? 50;
      const current = Math.floor(this.initialSuspicion * 1.5 ** (round - this.initialRound));
      return Math.max(predefined, current);
    }

    _isResolved(pip, resolvingBitmap) {
      return ((1n << BigInt(pip)) & resolvingBitmap) !== 0n;
    }
  }

  class ScammingStore {
    get TARGET_LEVEL() {
      return {
        'Delivery scam': 1,
        'Family scam': 1,
        'Prize Scam': 1,
        'Charity scam': 20,
        'Tech support scam': 20,
        'Vacation scam': 40,
        'Tax scam': 40,
        'Advance-fee scam': 60,
        'Job scam': 60,
        'Romance scam': 80,
        'Investment scam': 80,
      };
    }
    constructor() {
      this.data = getValue('scamming', { targets: {} });
      this.solutions = {};
      this.lastSolutions = {};
      for (const target of Object.values(this.data.targets)) {
        this._solve(target);
      }
    }

    save() {
      setValue('scamming', this.data);
    }

    updateTargets(targets) {
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
            stored.round++;
          }
          if (!stored.bar) {
            stored.bar = target.bar;
            updated = true;
          }
          if (updated) {
            this._solve(stored);
          }
        } else {
          const multiplierUsed = target.multiplierUsed ?? 0;
          const pip = target.pip ?? 0;
          const round = multiplierUsed === 0 && pip === 0 ? 0 : Math.max(1, multiplierUsed);
          const stored = {
            id: target.subID,
            email: target.email,
            level: this.TARGET_LEVEL[target.scamMethod] ?? 999,
            round,
            multiplierUsed,
            pip,
            expire: target.expire,
            bar: target.bar ?? null,
            suspicion: 0,
            resolvingBitmap: '0',
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
      this.save();
    }

    _solve(target) {
      if (!target.bar) {
        return;
      }
      this.lastSolutions[target.id] = this.solutions[target.id];
      const solver = new ScammingSolver(target.bar, target.level, target.round, target.suspicion);
      this.solutions[target.id] = solver.solve(
        target.round,
        target.pip,
        BigInt(target.resolvingBitmap),
        target.multiplierUsed,
      );
    }
  }

  const scammingStore = new ScammingStore();

  class ScammingObserver {
    constructor() {
      this.crimeOptions = null;
      this.observer = new MutationObserver((mutations) => {
        if (!mutations.some((mutation) => mutation.addedNodes.values().some((added) => added instanceof HTMLElement))) {
          return;
        }
        for (const element of this.crimeOptions) {
          if (!element.classList.contains('cm-sc-seen')) {
            this._refresh(element);
          }
        }
      });
    }

    start() {
      if (this.crimeOptions) {
        return;
      }
      this.crimeOptions = document.body.getElementsByClassName('crime-option');
      this.observer.observe($('.scamming-root')[0], { subtree: true, childList: true });
    }

    stop() {
      this.crimeOptions = null;
      this.observer.disconnect();
    }

    onNewData() {
      this.start();
      for (const element of this.crimeOptions) {
        this._refresh(element);
      }
    }

    _buildHintHtml(target, solution, lastSolution) {
      const actionText =
        {
          strong: 'Strong Fwd',
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
      const rspText = solution.multi > target.multiplierUsed ? 'Accelerate' : actionText;
      const fullRspText = solution.multi > 0 ? `(Acc ${target.multiplierUsed}/${solution.multi} + ${actionText})` : '';
      return `<span class="cm-sc-hint cm-sc-hint-content">
        <span>Score: <span class="${scoreColor}">${score}</span><span class="${scoreDiffColor}">${scoreDiffText}</span></span>
        <span>Rsp: ${rspText} ${fullRspText}</span>
        <span>Lv${target.level}</span>
      </span>`;
    }

    _refresh(element) {
      element.classList.add('cm-sc-seen');
      const $crimeOption = $(element);
      const $email = $crimeOption.find('span.email___gVRXx');
      const email = $email.text();
      const target = Object.values(scammingStore.data.targets).find((x) => x.email === email);
      if (!target) {
        return;
      }
      // hint button
      $crimeOption.find('.cm-sc-hint').remove();
      if (target.bar) {
        const solution = scammingStore.solutions[target.id];
        const lastSolution = scammingStore.lastSolutions[target.id];
        $email.parent().append(this._buildHintHtml(target, solution, lastSolution));
        const $hintButton = $(`<span class="cm-sc-hint cm-sc-hint-button t-blue">Hint</div>`);
        $email.parent().append($hintButton);
        $hintButton.on('click', () => {
          $hintButton.parent().toggleClass('cm-sc-hint-shown');
        });
      }
      // lifetime
      const now = Math.floor(Date.now() / 1000);
      const lifetime = Math.floor((target.expire - now) / 3600);
      $crimeOption.find('.cm-sc-lifetime').remove();
      if (lifetime > 0) {
        const color = lifetime >= 24 ? 't-gray-c' : lifetime >= 12 ? 't-yellow' : 't-red';
        $email.before(`<span class="cm-sc-lifetime ${color}">${lifetime}h</div>`);
      }
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
  }
  const scammingObserver = new ScammingObserver();

  async function checkScamming(params, data) {
    if (params.get('typeID') !== '12') {
      scammingObserver.stop();
      return;
    }
    scammingStore.updateTargets(data.DB?.crimesByType?.targets);
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

      .cm-sc-lifetime, .cm-sc-hint-button {
        transform: translateY(1px);
      }
      .cm-sc-hint-button {
        cursor: pointer;
      }
      .cm-sc-hint-shown > * {
        display: none;
      }
      .cm-sc-hint-shown > .cm-sc-lifetime {
        display: block;
      }
      .cm-sc-hint-content {
        display: none;
        flex-grow: 1;
      }
      .cm-sc-hint-shown > .cm-sc-hint-content {
        display: flex;
        justify-content: space-between;
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
