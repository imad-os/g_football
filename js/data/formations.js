/* Tactical formations (7-a-side). Coordinates are for the home side attacking +x; the away side is mirrored. */
(function (NS) {
  'use strict';

  NS.FORMATIONS = {
    '4-4-2': [
      { role: 'GK', num: 1, x: -42, z: 0 },
      { role: 'DEF', num: 2, x: -26, z: -13 },
      { role: 'DEF', num: 4, x: -26, z: 13 },
      { role: 'MID', num: 8, x: -8, z: -15 },
      { role: 'MID', num: 6, x: -8, z: 15 },
      { role: 'FWD', num: 9, x: 11, z: -7 },
      { role: 'FWD', num: 10, x: 11, z: 7 }
    ],
    '4-3-3': [
      { role: 'GK', num: 1, x: -42, z: 0 },
      { role: 'DEF', num: 2, x: -26, z: -13 },
      { role: 'DEF', num: 5, x: -26, z: 13 },
      { role: 'MID', num: 6, x: -10, z: 0 },
      { role: 'FWD', num: 7, x: 12, z: -16 },
      { role: 'FWD', num: 9, x: 15, z: 0 },
      { role: 'FWD', num: 11, x: 12, z: 16 }
    ],
    '4-2-3-1': [
      { role: 'GK', num: 1, x: -42, z: 0 },
      { role: 'DEF', num: 3, x: -27, z: -12 },
      { role: 'DEF', num: 4, x: -27, z: 12 },
      { role: 'MID', num: 6, x: -14, z: -6 },
      { role: 'MID', num: 8, x: -14, z: 6 },
      { role: 'MID', num: 10, x: 3, z: 0 },
      { role: 'FWD', num: 9, x: 16, z: 0 }
    ],
    '3-5-2': [
      { role: 'GK', num: 1, x: -42, z: 0 },
      { role: 'DEF', num: 4, x: -28, z: 0 },
      { role: 'MID', num: 2, x: -10, z: -17 },
      { role: 'MID', num: 6, x: -12, z: 0 },
      { role: 'MID', num: 3, x: -10, z: 17 },
      { role: 'FWD', num: 9, x: 12, z: -8 },
      { role: 'FWD', num: 11, x: 12, z: 8 }
    ]
  };
  NS.FORMATION_KEYS = ['4-4-2', '4-3-3', '4-2-3-1', '3-5-2'];
})(window.RS6 = window.RS6 || {});
