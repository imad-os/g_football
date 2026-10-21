/* Tactical formations, 7-a-side and 11-a-side. Coordinates are for the home side attacking +x (the away side is
 * mirrored), in metres on the 105 x 68 pitch. These are kick-off positions (everybody in his own half); the AI moves
 * the whole shape up and down with the ball. NS.useTeamSize(n) picks the set the next match plays with. */
(function (NS) {
  'use strict';

  // 7-a-side (drawn for the original 92 x 56 pitch, stretched below)
  var F7 = {
    '4-4-2': [
      { role: 'GK', num: 1, x: -42, z: 0 },
      { role: 'DEF', num: 2, x: -26, z: -13 },
      { role: 'DEF', num: 4, x: -26, z: 13 },
      { role: 'MID', num: 8, x: -8, z: -15 },
      { role: 'MID', num: 6, x: -8, z: 15 },
      { role: 'FWD', num: 9, x: -3, z: -7 },
      { role: 'FWD', num: 10, x: -3, z: 7 }
    ],
    '4-3-3': [
      { role: 'GK', num: 1, x: -42, z: 0 },
      { role: 'DEF', num: 2, x: -26, z: -13 },
      { role: 'DEF', num: 5, x: -26, z: 13 },
      { role: 'MID', num: 6, x: -10, z: 0 },
      { role: 'FWD', num: 7, x: -4, z: -16 },
      { role: 'FWD', num: 9, x: -3, z: 0 },
      { role: 'FWD', num: 11, x: -4, z: 16 }
    ],
    '4-2-3-1': [
      { role: 'GK', num: 1, x: -42, z: 0 },
      { role: 'DEF', num: 3, x: -27, z: -12 },
      { role: 'DEF', num: 4, x: -27, z: 12 },
      { role: 'MID', num: 6, x: -14, z: -6 },
      { role: 'MID', num: 8, x: -14, z: 6 },
      { role: 'MID', num: 10, x: -6, z: 0 },
      { role: 'FWD', num: 9, x: -3, z: 0 }
    ],
    '3-5-2': [
      { role: 'GK', num: 1, x: -42, z: 0 },
      { role: 'DEF', num: 4, x: -28, z: 0 },
      { role: 'MID', num: 2, x: -10, z: -17 },
      { role: 'MID', num: 6, x: -12, z: 0 },
      { role: 'MID', num: 3, x: -10, z: 17 },
      { role: 'FWD', num: 9, x: -3, z: -8 },
      { role: 'FWD', num: 11, x: -3, z: 8 }
    ]
  };
  var kx = 52.5 / 46, kz = 34 / 28; // the spots are given for a 105 x 68 pitch (stretched to the stadium at kick-off)
  for (var f in F7) {
    for (var i = 0; i < F7[f].length; i++) { F7[f][i].x *= kx; F7[f][i].z *= kz; }
  }

  function S(role, num, x, z) { return { role: role, num: num, x: x, z: z }; }

  // 11-a-side, real distances (keeper on his line, a back four about 15 m in front of the box)
  var F11 = {
    '4-4-2': [
      S('GK', 1, -50, 0),
      S('DEF', 2, -35, -22), S('DEF', 5, -37, -8), S('DEF', 4, -37, 8), S('DEF', 3, -35, 22),
      S('MID', 7, -17, -24), S('MID', 8, -19, -8), S('MID', 6, -19, 8), S('MID', 11, -17, 24),
      S('FWD', 9, -3, -7), S('FWD', 10, -3, 7)
    ],
    '4-3-3': [
      S('GK', 1, -50, 0),
      S('DEF', 2, -35, -22), S('DEF', 5, -37, -8), S('DEF', 4, -37, 8), S('DEF', 3, -35, 22),
      S('MID', 8, -19, -12), S('MID', 6, -22, 0), S('MID', 10, -19, 12),
      S('FWD', 7, -5, -24), S('FWD', 9, -3, 0), S('FWD', 11, -5, 24)
    ],
    '4-2-3-1': [
      S('GK', 1, -50, 0),
      S('DEF', 2, -35, -22), S('DEF', 5, -37, -8), S('DEF', 4, -37, 8), S('DEF', 3, -35, 22),
      S('MID', 6, -24, -8), S('MID', 8, -24, 8),
      S('MID', 7, -11, -22), S('MID', 10, -9, 0), S('MID', 11, -11, 22),
      S('FWD', 9, -3, 0)
    ],
    '3-5-2': [
      S('GK', 1, -50, 0),
      S('DEF', 5, -37, -13), S('DEF', 4, -39, 0), S('DEF', 6, -37, 13),
      S('MID', 2, -15, -27), S('MID', 8, -21, -10), S('MID', 14, -25, 0), S('MID', 10, -21, 10), S('MID', 3, -15, 27),
      S('FWD', 9, -3, -7), S('FWD', 11, -3, 7)
    ]
  };

  NS.FORMATIONS_BY = { 7: F7, 11: F11 };
  NS.FORMATION_KEYS = ['4-4-2', '4-3-3', '4-2-3-1', '3-5-2'];
  NS.useTeamSize = function (n) {
    NS.TEAM_SIZE = n === 7 ? 7 : 11;
    NS.FORMATIONS = NS.FORMATIONS_BY[NS.TEAM_SIZE];
  };
  NS.useTeamSize(11);
})(window.RS6 = window.RS6 || {});
