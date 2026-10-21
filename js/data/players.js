/* Player ratings: Speed, Dribble, Shoot, Stamina, Header, Defense (0..99; for a goalkeeper Defense is his keeping).
 *
 * Every player of every squad has his own numbers:
 *   - known players: estimated by hand from their real level (DB below, by name, or "TEAM:NAME" when two different
 *     players share a name);
 *   - everybody else: from his club / nation level (stars, league), his position (from the squad order: keeper, two
 *     defenders, two midfielders, two forwards, then the bench) and a fixed personal variation from his name.
 * Computed once per player when the teams are built, not in the game loop.
 */
(function (NS) {
  'use strict';

  // [position, speed, dribble, shoot, stamina, header, defense]
  var DB = {
    // ---- goalkeepers (defense = keeping)
    'COURTOIS': ['GK', 48, 30, 25, 70, 45, 90], 'TER STEGEN': ['GK', 52, 45, 25, 70, 40, 87], 'OBLAK': ['GK', 48, 30, 22, 70, 42, 88],
    'EDERSON': ['GK', 58, 55, 30, 70, 40, 86], 'ALISSON': ['GK', 55, 45, 25, 70, 45, 89], 'RAYA': ['GK', 55, 45, 25, 70, 40, 84],
    'CHE:SANCHEZ': ['GK', 50, 30, 20, 70, 40, 77], 'MUN:ONANA': ['GK', 55, 45, 25, 70, 40, 82], 'CMR:ONANA': ['GK', 55, 45, 25, 70, 40, 81],
    'VICARIO': ['GK', 50, 30, 22, 70, 40, 82], 'POPE': ['GK', 45, 25, 20, 70, 45, 83], 'E. MARTINEZ': ['GK', 50, 35, 25, 72, 45, 87],
    'AREOLA': ['GK', 48, 30, 20, 70, 40, 78], 'VERBRUGGEN': ['GK', 52, 40, 22, 70, 40, 79], 'NEUER': ['GK', 50, 45, 30, 68, 45, 86],
    'HRADECKY': ['GK', 46, 30, 22, 70, 42, 80], 'KOBEL': ['GK', 52, 35, 22, 70, 42, 85], 'GULACSI': ['GK', 45, 30, 20, 70, 40, 80],
    'NUBEL': ['GK', 50, 30, 20, 70, 40, 79], 'TRAPP': ['GK', 48, 30, 20, 70, 40, 80], 'BONO': ['GK', 50, 40, 22, 70, 42, 86],
    'EL SHENAWY': ['GK', 46, 25, 20, 68, 40, 77], 'SEN:MENDY': ['GK', 48, 25, 20, 70, 45, 79], 'MAIGNAN': ['GK', 55, 35, 22, 72, 42, 87],
    'PICKFORD': ['GK', 52, 40, 25, 72, 38, 82], 'DIOGO COSTA': ['GK', 54, 40, 22, 72, 42, 84], 'DONNARUMMA': ['GK', 50, 30, 20, 70, 45, 88],
    'UNAI SIMON': ['GK', 50, 35, 20, 70, 40, 84], 'SOMMER': ['GK', 50, 35, 20, 70, 35, 84], 'LIVAKOVIC': ['GK', 48, 30, 20, 70, 40, 79],
    'SUZUKI': ['GK', 50, 30, 20, 70, 42, 73], 'DI GREGORIO': ['GK', 48, 30, 20, 70, 40, 82], 'TRUBIN': ['GK', 48, 30, 20, 70, 45, 79],
    'FLA:ROSSI': ['GK', 46, 30, 20, 70, 40, 76], 'WEVERTON': ['GK', 46, 30, 20, 68, 40, 78], 'ARMANI': ['GK', 44, 25, 20, 66, 40, 76],
    'BENTO': ['GK', 48, 30, 20, 70, 42, 79], 'REMIRO': ['GK', 48, 30, 20, 70, 40, 81], 'MAMARDASHVILI': ['GK', 48, 30, 20, 70, 45, 84],
    'CASTEELS': ['GK', 46, 30, 20, 70, 40, 80], 'ROCHET': ['GK', 46, 30, 20, 70, 40, 76], 'NWABALI': ['GK', 46, 25, 20, 68, 40, 72],
    'MANDREA': ['GK', 46, 25, 20, 68, 40, 70], 'BEN SAID': ['GK', 46, 25, 20, 68, 40, 70], 'ATI-ZIGI': ['GK', 46, 25, 20, 68, 40, 70],
    'USA:TURNER': ['GK', 46, 25, 20, 68, 40, 74], 'AME:MALAGON': ['GK', 48, 25, 20, 68, 40, 73], 'MEX:MALAGON': ['GK', 48, 25, 20, 68, 40, 73],
    'CREPEAU': ['GK', 48, 25, 20, 68, 40, 72], 'BEIRANVAND': ['GK', 46, 25, 25, 68, 40, 73], 'AL-OWAIS': ['GK', 46, 25, 20, 68, 40, 72],
    'BARSHAM': ['GK', 46, 25, 20, 68, 40, 70], 'JO HYEON-WOO': ['GK', 46, 25, 20, 68, 40, 75], 'AUS:RYAN': ['GK', 46, 25, 20, 68, 40, 74],
    'OMLIN': ['GK', 48, 30, 20, 70, 40, 78], 'GRABARA': ['GK', 48, 30, 20, 70, 40, 77], 'CONDE': ['GK', 46, 25, 20, 68, 40, 74],
    'RUI SILVA': ['GK', 46, 30, 20, 68, 40, 78], 'NYLAND': ['GK', 46, 25, 20, 68, 40, 74], 'GAZZANIGA': ['GK', 46, 25, 20, 68, 40, 76],
    'BOC:ROMERO': ['GK', 44, 25, 20, 66, 42, 76], 'CALLENDER': ['GK', 46, 25, 20, 68, 40, 70], 'NISHIKAWA': ['GK', 46, 25, 20, 68, 38, 73],

    // ---- forwards
    'MBAPPE': ['FWD', 97, 92, 91, 84, 75, 36], 'VINICIUS JR': ['FWD', 95, 92, 84, 82, 60, 29], 'HAALAND': ['FWD', 89, 79, 94, 80, 88, 45],
    'MO SALAH': ['FWD', 89, 89, 88, 84, 70, 45], 'HARRY KANE': ['FWD', 70, 83, 94, 80, 88, 47], 'LEWANDOWSKI': ['FWD', 75, 85, 90, 78, 87, 44],
    'LAMINE YAMAL': ['FWD', 86, 91, 81, 76, 50, 35], 'LEO MESSI': ['FWD', 78, 94, 89, 62, 65, 34], 'CRISTIANO RONALDO': ['FWD', 79, 82, 91, 70, 89, 35],
    'NEYMAR JR': ['FWD', 80, 91, 84, 60, 60, 33], 'SAKA': ['FWD', 88, 87, 82, 85, 60, 59], 'RAPHINHA': ['FWD', 89, 86, 83, 85, 60, 50],
    'RODRYGO': ['FWD', 89, 87, 81, 80, 55, 40], 'DEMBELE': ['FWD', 93, 89, 83, 78, 50, 38], 'GRIEZMANN': ['FWD', 75, 86, 86, 90, 70, 55],
    'J. ALVAREZ': ['FWD', 84, 84, 85, 90, 70, 48], 'LAUTARO': ['FWD', 82, 84, 89, 85, 80, 48], 'OSIMHEN': ['FWD', 89, 79, 87, 80, 88, 40],
    'ISAK': ['FWD', 86, 86, 87, 78, 75, 42], 'SON HEUNG-MIN': ['FWD', 85, 85, 87, 80, 65, 42], 'NICO WILLIAMS': ['FWD', 92, 87, 77, 82, 50, 35],
    'RAFAEL LEAO': ['FWD', 92, 87, 80, 76, 70, 30], 'BARCOLA': ['FWD', 92, 85, 77, 78, 50, 35], 'LUIS DIAZ': ['FWD', 90, 86, 80, 82, 60, 45],
    'DARWIN NUNEZ': ['FWD', 89, 76, 82, 82, 82, 45], 'JOTA': ['FWD', 82, 82, 84, 80, 82, 45], 'GAKPO': ['FWD', 84, 84, 82, 80, 72, 40],
    'DOKU': ['FWD', 94, 90, 70, 78, 45, 30], 'SAVINHO': ['FWD', 90, 85, 72, 78, 45, 30], 'MARTINELLI': ['FWD', 90, 84, 78, 84, 60, 40],
    'HAVERTZ': ['FWD', 74, 80, 80, 80, 83, 50], 'TROSSARD': ['FWD', 80, 84, 82, 75, 55, 40], 'KULUSEVSKI': ['FWD', 78, 84, 78, 84, 60, 50],
    'SOLANKE': ['FWD', 80, 76, 80, 85, 78, 45], 'GORDON': ['FWD', 90, 84, 77, 85, 50, 45], 'WATKINS': ['FWD', 86, 78, 82, 88, 78, 45],
    'BOWEN': ['FWD', 86, 84, 80, 85, 60, 50], 'MITOMA': ['FWD', 86, 87, 74, 75, 50, 40], 'SANE': ['FWD', 88, 86, 82, 75, 55, 35],
    'GNABRY': ['FWD', 84, 85, 82, 75, 60, 40], 'OLISE': ['FWD', 82, 89, 81, 80, 50, 45], 'BONIFACE': ['FWD', 82, 78, 82, 80, 82, 40],
    'SCHICK': ['FWD', 70, 75, 84, 75, 85, 40], 'GUIRASSY': ['FWD', 80, 76, 86, 80, 85, 40], 'ADEYEMI': ['FWD', 95, 80, 74, 78, 50, 30],
    'OPENDA': ['FWD', 94, 80, 82, 82, 65, 35], 'SESKO': ['FWD', 86, 78, 83, 82, 85, 35], 'EKITIKE': ['FWD', 86, 83, 82, 78, 70, 35],
    'MARMOUSH': ['FWD', 86, 84, 82, 82, 60, 40], 'AMOURA': ['FWD', 92, 80, 78, 80, 60, 35], 'OYARZABAL': ['FWD', 76, 82, 82, 80, 70, 45],
    'SORLOTH': ['FWD', 76, 72, 80, 80, 86, 40], 'INAKI WILLIAMS': ['FWD', 92, 78, 76, 86, 70, 40], 'KUBO': ['FWD', 84, 86, 76, 78, 45, 40],
    'ABDE EZZALZAOUI': ['FWD', 93, 87, 74, 78, 45, 32], 'EZZALZAOUI': ['FWD', 93, 87, 74, 78, 45, 32], 'VITOR ROQUE': ['FWD', 86, 80, 78, 78, 65, 35],
    'LUKEBAKIO': ['FWD', 86, 82, 78, 78, 55, 35], 'EN-NESYRI': ['FWD', 84, 72, 81, 80, 89, 40], 'MAHREZ': ['FWD', 76, 88, 82, 68, 50, 35],
    'SADIO MANE': ['FWD', 86, 84, 82, 80, 72, 42], 'N. JACKSON': ['FWD', 88, 78, 78, 82, 75, 35], 'LOOKMAN': ['FWD', 88, 86, 82, 80, 60, 40],
    'HALLER': ['FWD', 66, 72, 80, 75, 85, 40], 'MBEUMO': ['FWD', 84, 84, 82, 85, 55, 45], 'ABOUBAKAR': ['FWD', 70, 75, 82, 70, 80, 35],
    'DEPAY': ['FWD', 78, 84, 84, 72, 65, 35], 'LUKAKU': ['FWD', 76, 72, 86, 76, 85, 35], 'KRAMARIC': ['FWD', 70, 82, 82, 75, 65, 40],
    'PERISIC': ['FWD', 76, 80, 78, 80, 76, 55], 'EMBOLO': ['FWD', 82, 76, 76, 76, 75, 40], 'NDOYE': ['FWD', 90, 82, 72, 80, 55, 40],
    'JHON DURAN': ['FWD', 82, 76, 80, 78, 82, 35], 'DURAN': ['FWD', 82, 76, 80, 78, 82, 35], 'ALEXIS SANCHEZ': ['FWD', 72, 82, 78, 70, 65, 40],
    'PULISIC': ['FWD', 84, 86, 80, 82, 55, 40], 'WEAH': ['FWD', 88, 80, 72, 82, 55, 50], 'SANTI GIMENEZ': ['FWD', 78, 76, 84, 80, 82, 40],
    'RAUL JIMENEZ': ['FWD', 66, 72, 80, 75, 84, 40], 'JONATHAN DAVID': ['FWD', 86, 82, 84, 82, 65, 35], 'CAN:LARIN': ['FWD', 78, 74, 78, 80, 75, 35],
    'DOAN': ['FWD', 78, 82, 76, 82, 50, 50], 'UEDA': ['FWD', 78, 72, 80, 78, 80, 35], 'HWANG HEE-CHAN': ['FWD', 86, 78, 78, 82, 65, 40],
    'TAREMI': ['FWD', 72, 78, 82, 78, 82, 40], 'AZMOUN': ['FWD', 80, 78, 80, 75, 82, 35], 'JAHANBAKHSH': ['FWD', 78, 80, 76, 75, 50, 40],
    'SALEM AL-DAWSARI': ['FWD', 80, 82, 76, 75, 45, 35], 'AKRAM AFIF': ['FWD', 82, 84, 78, 78, 50, 35], 'ALMOEZ ALI': ['FWD', 80, 75, 80, 78, 70, 30],
    'MUSA AL-TAAMARI': ['FWD', 88, 84, 74, 80, 45, 35], 'AYMEN HUSSEIN': ['FWD', 72, 68, 80, 75, 85, 30], 'CHRIS WOOD': ['FWD', 62, 70, 82, 75, 87, 35],
    'THURAM': ['FWD', 88, 80, 80, 80, 75, 40], 'RETEGUI': ['FWD', 74, 72, 82, 78, 82, 35], 'CHIESA': ['FWD', 85, 84, 78, 70, 55, 40],
    'VLAHOVIC': ['FWD', 76, 76, 85, 75, 84, 35], 'YILDIZ': ['FWD', 80, 87, 80, 78, 50, 35], 'MORATA': ['FWD', 74, 76, 80, 78, 80, 40],
    'ABRAHAM': ['FWD', 74, 72, 78, 78, 80, 35], 'DI MARIA': ['FWD', 72, 86, 80, 62, 50, 35], 'PAVLIDIS': ['FWD', 74, 74, 80, 78, 78, 35],
    'AKTURKOGLU': ['FWD', 84, 82, 76, 78, 50, 35], 'FLA:PEDRO': ['FWD', 72, 74, 82, 72, 80, 30], 'GABIGOL': ['FWD', 74, 76, 80, 72, 70, 30],
    'ESTEVAO': ['FWD', 86, 87, 76, 75, 45, 30], 'FLACO LOPEZ': ['FWD', 72, 70, 78, 78, 82, 30], 'CAVANI': ['FWD', 66, 72, 82, 72, 82, 40],
    'MALCOM': ['FWD', 84, 84, 80, 78, 50, 35], 'MITROVIC': ['FWD', 66, 72, 86, 75, 88, 35], 'LUIS SUAREZ': ['FWD', 56, 76, 84, 60, 75, 30],
    'HENRY MARTIN': ['FWD', 74, 72, 78, 78, 80, 35], 'GALENO': ['FWD', 88, 82, 76, 78, 50, 35], 'SAMU OMORODION': ['FWD', 82, 72, 76, 80, 84, 35],
    'NKUNKU': ['FWD', 82, 86, 82, 72, 55, 40], 'MADUEKE': ['FWD', 88, 84, 74, 75, 45, 30], 'SANCHO': ['FWD', 80, 86, 74, 72, 40, 30],
    'CHE:NETO': ['FWD', 88, 82, 72, 78, 45, 30], 'RASHFORD': ['FWD', 88, 82, 80, 78, 60, 35], 'HOJLUND': ['FWD', 84, 72, 78, 80, 78, 35],
    'GARNACHO': ['FWD', 88, 84, 76, 80, 50, 35], 'AMAD': ['FWD', 82, 85, 74, 75, 45, 35], 'ZIRKZEE': ['FWD', 70, 80, 74, 75, 72, 35],
    'BARNES': ['FWD', 80, 78, 76, 80, 55, 40], 'BAILEY': ['FWD', 90, 82, 76, 75, 45, 30], 'LEON BAILEY': ['FWD', 90, 82, 76, 75, 45, 30],
    'FULLKRUG': ['FWD', 60, 68, 82, 75, 88, 35], 'SUMMERVILLE': ['FWD', 86, 84, 74, 75, 40, 30], 'WHU:ANTONIO': ['FWD', 78, 72, 74, 72, 82, 40],
    'JAM:ANTONIO': ['FWD', 78, 72, 74, 72, 82, 40], 'JOAO PEDRO': ['FWD', 80, 82, 80, 80, 65, 40], 'MINTEH': ['FWD', 88, 80, 72, 78, 45, 30],
    'WELBECK': ['FWD', 70, 76, 76, 70, 72, 35], 'GITTENS': ['FWD', 88, 84, 74, 78, 40, 30], 'MALEN': ['FWD', 88, 80, 78, 78, 55, 30],
    'NUSA': ['FWD', 90, 86, 70, 75, 40, 30], 'UNDAV': ['FWD', 74, 80, 82, 80, 70, 40], 'DEMIROVIC': ['FWD', 70, 76, 80, 80, 75, 40],
    'WIND': ['FWD', 76, 76, 80, 78, 80, 40], 'KLEINDIENST': ['FWD', 66, 70, 80, 75, 85, 35], 'PLEA': ['FWD', 76, 82, 78, 75, 60, 35],
    'RIOJA': ['FWD', 86, 82, 72, 82, 50, 40], 'HUGO DURO': ['FWD', 76, 74, 78, 80, 78, 35], 'DIEGO LOPEZ': ['FWD', 84, 82, 74, 78, 50, 35],
    'TSYGANKOV': ['FWD', 82, 84, 78, 78, 45, 40], 'DANJUMA': ['FWD', 88, 82, 78, 72, 50, 30], 'STUANI': ['FWD', 54, 68, 82, 62, 82, 35],
    'ABEL RUIZ': ['FWD', 74, 76, 76, 78, 70, 35], 'AYOZE PEREZ': ['FWD', 74, 80, 82, 78, 65, 35], 'GERARD MORENO': ['FWD', 68, 80, 82, 72, 70, 35],
    'YEREMY PINO': ['FWD', 84, 84, 74, 78, 45, 35], 'AKHOMACH': ['FWD', 84, 82, 70, 75, 45, 30], 'BAKAMBU': ['FWD', 82, 74, 78, 75, 70, 30],
    'GURUZETA': ['FWD', 70, 72, 80, 78, 82, 35], 'BERENGUER': ['FWD', 76, 80, 76, 78, 55, 40], 'BARRENETXEA': ['FWD', 86, 84, 74, 78, 50, 35],
    'BECKER': ['FWD', 86, 78, 76, 80, 60, 35], 'PEPE': ['FWD', 85, 82, 76, 75, 50, 35], 'ADINGRA': ['FWD', 88, 84, 72, 80, 50, 35],
    'SEMENYO': ['FWD', 86, 80, 76, 85, 65, 40], 'JORDAN AYEW': ['FWD', 72, 76, 72, 82, 65, 45], 'MSAKNI': ['FWD', 70, 80, 74, 70, 55, 35],
    'TREZEGUET': ['FWD', 80, 80, 76, 78, 55, 35], 'MOSTAFA MOHAMED': ['FWD', 72, 70, 78, 78, 80, 35], 'CHUKWUEZE': ['FWD', 88, 84, 74, 75, 45, 35],
    'GOUIRI': ['FWD', 82, 84, 80, 78, 60, 35], 'BENRAHMA': ['FWD', 78, 84, 78, 72, 45, 30], 'ISMAILA SARR': ['FWD', 92, 80, 76, 78, 55, 35],
    'SOUFIANE RAHIMI': ['FWD', 85, 82, 80, 80, 60, 40], 'MAR:RAHIMI': ['FWD', 85, 82, 80, 80, 60, 40],

    // ---- midfielders
    'BELLINGHAM': ['MID', 80, 87, 84, 92, 80, 76], 'VALVERDE': ['MID', 88, 82, 83, 96, 72, 78], 'RODRI': ['MID', 62, 82, 79, 90, 82, 87],
    'DE BRUYNE': ['MID', 70, 86, 87, 74, 66, 63], 'FODEN': ['MID', 80, 90, 84, 82, 50, 58], 'ODEGAARD': ['MID', 74, 88, 82, 85, 55, 62],
    'PEDRI': ['MID', 77, 89, 72, 88, 50, 67], 'MODRIC': ['MID', 72, 87, 76, 72, 60, 70], 'CAMAVINGA': ['MID', 82, 82, 68, 92, 70, 80],
    'TCHOUAMENI': ['MID', 72, 76, 70, 88, 80, 84], 'KIMMICH': ['MID', 70, 82, 72, 88, 66, 80], 'MUSIALA': ['MID', 82, 92, 80, 80, 55, 55],
    'FLORI WIRTZ': ['MID', 80, 91, 83, 85, 55, 55], 'XAVI SIMONS': ['MID', 85, 87, 78, 84, 50, 50], 'COLE PALMER': ['MID', 74, 88, 86, 80, 55, 55],
    'BRUNO FERNANDES': ['MID', 70, 84, 85, 90, 66, 65], 'DECLAN RICE': ['MID', 74, 78, 74, 92, 78, 85], 'CAICEDO': ['MID', 76, 76, 64, 92, 70, 85],
    'ENZO': ['MID', 70, 80, 76, 88, 65, 75], 'MAC ALLISTER': ['MID', 72, 82, 80, 88, 65, 75], 'DE JONG': ['MID', 76, 88, 70, 85, 60, 76],
    'GAVI': ['MID', 80, 84, 70, 90, 50, 70], 'OLMO': ['MID', 78, 86, 81, 78, 55, 50], 'VITINHA': ['MID', 75, 87, 76, 88, 50, 70],
    'JOAO NEVES': ['MID', 78, 84, 70, 92, 55, 74], 'BERNARDO': ['MID', 72, 89, 76, 90, 50, 65], 'KOVACIC': ['MID', 70, 85, 70, 85, 55, 72],
    'MADDISON': ['MID', 70, 84, 82, 80, 50, 50], 'BRUNO GUIMARAES': ['MID', 72, 82, 74, 90, 68, 80], 'TONALI': ['MID', 76, 80, 74, 90, 70, 80],
    'ROGERS': ['MID', 80, 85, 74, 85, 60, 50], 'TIELEMANS': ['MID', 66, 82, 78, 84, 55, 68], 'PAQUETA': ['MID', 72, 86, 77, 84, 70, 70],
    'KUDUS': ['MID', 84, 88, 78, 82, 55, 50], 'PALHINHA': ['MID', 60, 72, 68, 88, 82, 87], 'XHAKA': ['MID', 55, 78, 78, 82, 70, 76],
    'BRANDT': ['MID', 70, 85, 78, 80, 50, 50], 'ZUBIMENDI': ['MID', 66, 80, 68, 90, 70, 82], 'KOKE': ['MID', 62, 80, 72, 84, 55, 72],
    'DE PAUL': ['MID', 74, 82, 74, 92, 60, 74], 'ISCO': ['MID', 60, 87, 76, 68, 55, 55], 'LO CELSO': ['MID', 68, 84, 78, 75, 55, 60],
    'ZIYECH': ['MID', 68, 85, 80, 68, 50, 45], 'AMRABAT': ['MID', 72, 74, 64, 92, 65, 80], 'OUNAHI': ['MID', 75, 86, 70, 82, 50, 60],
    'BRAHIM DIAZ': ['MID', 82, 88, 77, 78, 45, 40], 'BENNACER': ['MID', 70, 82, 72, 85, 55, 74], 'NDIDI': ['MID', 70, 72, 60, 88, 75, 82],
    'KESSIE': ['MID', 74, 75, 74, 88, 75, 78], 'ANGUISSA': ['MID', 72, 80, 72, 88, 75, 78], 'PARTEY': ['MID', 66, 78, 72, 85, 70, 80],
    'BISSOUMA': ['MID', 72, 82, 64, 84, 55, 78], 'REIJNDERS': ['MID', 78, 84, 80, 86, 60, 70], 'GRAVENBERCH': ['MID', 76, 84, 70, 85, 65, 75],
    'AVL:ONANA': ['MID', 66, 72, 64, 88, 80, 82], 'BEL:ONANA': ['MID', 66, 72, 64, 88, 80, 82], 'DE KETELAERE': ['MID', 72, 82, 78, 80, 60, 50],
    'SUCIC': ['MID', 70, 82, 70, 84, 55, 65], 'UGARTE': ['MID', 74, 72, 60, 92, 65, 82], 'BENTANCUR': ['MID', 70, 80, 68, 85, 65, 76],
    'JAMES RODRIGUEZ': ['MID', 58, 84, 82, 62, 55, 40], 'LERMA': ['MID', 72, 74, 65, 88, 70, 80], 'MCKENNIE': ['MID', 72, 76, 70, 88, 75, 72],
    'USA:REYNA': ['MID', 74, 82, 74, 75, 50, 45], 'EDSON ALVAREZ': ['MID', 66, 68, 62, 85, 82, 82], 'WHU:ALVAREZ': ['MID', 66, 68, 62, 85, 82, 82],
    'EUSTAQUIO': ['MID', 66, 80, 72, 84, 55, 68], 'ENDO': ['MID', 60, 70, 62, 88, 75, 80], 'MINAMINO': ['MID', 76, 82, 76, 82, 55, 45],
    'KAMADA': ['MID', 66, 82, 76, 78, 55, 55], 'LEE KANG-IN': ['MID', 74, 86, 78, 78, 45, 45], 'HWANG IN-BEOM': ['MID', 70, 80, 72, 85, 55, 70],
    'CALHANOGLU': ['MID', 64, 82, 84, 82, 55, 70], 'BARELLA': ['MID', 76, 84, 76, 92, 60, 76], 'MKHITARYAN': ['MID', 70, 82, 76, 80, 60, 60],
    'FRATTESI': ['MID', 74, 78, 76, 88, 55, 62], 'KOOPMEINERS': ['MID', 66, 80, 80, 85, 70, 72], 'LOCATELLI': ['MID', 60, 76, 70, 85, 65, 78],
    'DOUGLAS LUIZ': ['MID', 66, 80, 74, 85, 60, 72], 'KOKCU': ['MID', 70, 84, 80, 82, 55, 60], 'ARRASCAETA': ['MID', 70, 86, 80, 75, 55, 45],
    'MASTANTUONO': ['MID', 80, 86, 76, 78, 45, 35], 'MILINKOVIC-SAVIC': ['MID', 60, 80, 80, 82, 84, 72], 'RUBEN NEVES': ['MID', 58, 78, 78, 82, 60, 72],
    'BROZOVIC': ['MID', 62, 80, 70, 85, 60, 74], 'TALISCA': ['MID', 70, 78, 82, 72, 75, 40], 'OTAVIO': ['MID', 70, 82, 72, 82, 50, 60],
    'BUSQUETS': ['MID', 40, 76, 60, 66, 65, 74], 'ANDRICH': ['MID', 66, 74, 72, 85, 72, 78], 'FABIAN RUIZ': ['MID', 66, 84, 78, 80, 60, 66],
    'ADLI': ['MID', 74, 82, 74, 75, 50, 45], 'MAINOO': ['MID', 72, 82, 70, 85, 60, 72], 'CASEMIRO': ['MID', 50, 70, 72, 72, 82, 82],
    'MERINO': ['MID', 64, 78, 74, 86, 78, 74], 'SZOBOSZLAI': ['MID', 76, 82, 82, 90, 62, 66], 'JOELINTON': ['MID', 72, 76, 72, 88, 78, 74],
    'MCGINN': ['MID', 70, 78, 76, 88, 60, 70], 'SOUCEK': ['MID', 58, 66, 72, 85, 85, 76], 'BALEBA': ['MID', 74, 74, 62, 86, 72, 76],
    'SABITZER': ['MID', 70, 78, 76, 88, 65, 72], 'GROSS': ['MID', 58, 80, 76, 82, 55, 66], 'HAIDARA': ['MID', 74, 74, 66, 86, 60, 74],
    'BAUMGARTNER': ['MID', 74, 82, 76, 80, 55, 55], 'MILLOT': ['MID', 80, 82, 74, 85, 50, 55], 'LARSSON': ['MID', 68, 80, 72, 84, 60, 66],
    'GOTZE': ['MID', 62, 84, 74, 70, 50, 50], 'SKHIRI': ['MID', 66, 70, 62, 88, 72, 80], 'REITZ': ['MID', 72, 76, 68, 88, 62, 74],
    'SAUL': ['MID', 66, 76, 72, 82, 68, 74], 'PEPELU': ['MID', 60, 76, 72, 84, 60, 74], 'PAREJO': ['MID', 50, 82, 76, 72, 55, 66],
    'BAENA': ['MID', 74, 82, 74, 82, 55, 60], 'FORNALS': ['MID', 68, 84, 76, 80, 50, 55], 'SANCET': ['MID', 72, 84, 80, 80, 65, 50],
    'BRAIS MENDEZ': ['MID', 70, 82, 80, 85, 60, 60], 'GUEYE': ['MID', 66, 72, 64, 88, 70, 80], 'PAPE SARR': ['MID', 76, 80, 72, 88, 60, 72],
    'ELNENY': ['MID', 62, 74, 60, 82, 60, 74], 'IWOBI': ['MID', 76, 82, 72, 82, 50, 55], 'AOUAR': ['MID', 70, 84, 76, 78, 55, 55],
    'GALLAGHER': ['MID', 76, 78, 72, 94, 65, 74], 'DE LA CRUZ': ['MID', 72, 84, 76, 82, 50, 60],

    // ---- defenders
    'RUDIGER': ['DEF', 83, 66, 52, 85, 85, 88], 'VAN DIJK': ['DEF', 74, 70, 60, 80, 90, 90], 'SALIBA': ['DEF', 81, 72, 45, 82, 82, 89],
    'RUBEN DIAS': ['DEF', 65, 68, 42, 85, 87, 89], 'MARQUINHOS': ['DEF', 76, 74, 50, 82, 82, 87], 'HAKIMI': ['DEF', 92, 82, 73, 88, 66, 77],
    'ALEXANDER-ARNOLD': ['DEF', 76, 82, 72, 82, 60, 74], 'TRENT A-A': ['DEF', 76, 82, 72, 82, 60, 74], 'GVARDIOL': ['DEF', 80, 76, 62, 85, 80, 86],
    'THEO H.': ['DEF', 92, 82, 70, 85, 70, 77], 'NUNO MENDES': ['DEF', 90, 82, 62, 85, 62, 78], 'GABRIEL': ['DEF', 70, 62, 50, 82, 88, 85],
    'VAN DE VEN': ['DEF', 93, 65, 45, 82, 75, 84], 'TOT:ROMERO': ['DEF', 76, 64, 50, 84, 82, 87], 'ARG:ROMERO': ['DEF', 76, 64, 50, 84, 82, 87],
    'KIM MIN-JAE': ['DEF', 82, 64, 40, 82, 84, 87], 'UPAMECANO': ['DEF', 84, 66, 45, 82, 80, 84], 'DAVIES': ['DEF', 96, 84, 62, 85, 50, 74],
    'ALPHONSO DAVIES': ['DEF', 96, 84, 62, 85, 50, 74], 'GRIMALDO': ['DEF', 78, 82, 75, 82, 50, 72], 'FRIMPONG': ['DEF', 95, 85, 68, 85, 45, 66],
    'TAH': ['DEF', 70, 60, 45, 82, 85, 86], 'SCHLOTTERBECK': ['DEF', 78, 70, 58, 82, 82, 85], 'ATM:GIMENEZ': ['DEF', 66, 58, 48, 80, 85, 85],
    'URU:GIMENEZ': ['DEF', 66, 58, 48, 80, 85, 85], 'AGUERD': ['DEF', 70, 62, 45, 82, 84, 84], 'MAZRAOUI': ['DEF', 82, 80, 64, 85, 60, 78],
    'AIT-NOURI': ['DEF', 84, 82, 62, 82, 55, 72], 'KOULIBALY': ['DEF', 72, 62, 40, 80, 84, 85], 'DUMFRIES': ['DEF', 86, 72, 70, 85, 82, 76],
    'AKANJI': ['DEF', 74, 68, 45, 82, 80, 84], 'LI. MARTINEZ': ['DEF', 72, 72, 48, 85, 70, 86], 'BAR:ARAUJO': ['DEF', 86, 64, 45, 82, 85, 85],
    'URU:ARAUJO': ['DEF', 86, 64, 45, 82, 85, 85], 'MUNOZ': ['DEF', 86, 74, 62, 85, 65, 75], 'HINCAPIE': ['DEF', 80, 68, 50, 82, 76, 84],
    'PACHO': ['DEF', 78, 62, 40, 82, 80, 83], 'ESTUPINAN': ['DEF', 84, 74, 62, 84, 55, 74], 'BASTONI': ['DEF', 70, 72, 55, 82, 78, 86],
    'DIMARCO': ['DEF', 80, 80, 76, 82, 55, 72], 'PAVARD': ['DEF', 70, 66, 58, 80, 75, 82], 'CALAFIORI': ['DEF', 74, 76, 55, 82, 75, 82],
    'DI LORENZO': ['DEF', 75, 72, 60, 85, 72, 80], 'CAMBIASO': ['DEF', 80, 80, 66, 85, 62, 76], 'BREMER': ['DEF', 74, 60, 40, 82, 84, 86],
    'TOMORI': ['DEF', 82, 60, 40, 82, 76, 82], 'OTAMENDI': ['DEF', 58, 60, 50, 72, 80, 82], 'CANCELO': ['DEF', 82, 84, 72, 82, 55, 74],
    'LAPORTE': ['DEF', 60, 70, 50, 78, 80, 84], 'ALBA': ['DEF', 72, 78, 64, 68, 50, 70], 'CARVAJAL': ['DEF', 80, 76, 60, 82, 65, 82],
    'KOUNDE': ['DEF', 82, 72, 48, 82, 76, 85], 'CUBARSI': ['DEF', 74, 70, 40, 82, 74, 82], 'LE NORMAND': ['DEF', 64, 62, 40, 80, 80, 82],
    'STONES': ['DEF', 66, 74, 52, 78, 78, 84], 'GUEHI': ['DEF', 76, 64, 40, 82, 78, 82], 'MITTELSTADT': ['DEF', 82, 74, 60, 82, 55, 72],
    'COLWILL': ['DEF', 76, 66, 42, 80, 76, 80], 'CUCURELLA': ['DEF', 78, 74, 52, 85, 60, 77], 'DE LIGT': ['DEF', 66, 62, 50, 80, 85, 84],
    'TIMBER': ['DEF', 78, 76, 50, 85, 70, 80], 'SCHAR': ['DEF', 60, 64, 62, 80, 82, 80], 'TRIPPIER': ['DEF', 64, 74, 66, 80, 60, 76],
    'PAU TORRES': ['DEF', 64, 70, 50, 80, 76, 82], 'DIGNE': ['DEF', 72, 76, 66, 80, 60, 75], 'KONSA': ['DEF', 74, 62, 40, 80, 78, 80],
    'WAN-BISSAKA': ['DEF', 80, 72, 45, 82, 60, 80], 'KILMAN': ['DEF', 70, 62, 40, 80, 78, 79], 'DUNK': ['DEF', 54, 64, 45, 78, 84, 80],
    'KADIOGLU': ['DEF', 80, 78, 55, 84, 55, 72], 'SULE': ['DEF', 60, 62, 50, 78, 82, 82], 'RAUM': ['DEF', 84, 76, 62, 82, 50, 72],
    'ORBAN': ['DEF', 72, 60, 50, 80, 82, 82], 'KOCH': ['DEF', 62, 62, 45, 78, 84, 80], 'MAEHLE': ['DEF', 80, 74, 60, 82, 60, 74],
    'ITAKURA': ['DEF', 66, 64, 45, 80, 80, 80], 'ELVEDI': ['DEF', 72, 64, 45, 80, 78, 80], 'NAVAS': ['DEF', 76, 72, 55, 72, 60, 74],
    'GAYA': ['DEF', 82, 78, 60, 82, 55, 75], 'BLIND': ['DEF', 54, 74, 58, 70, 70, 80], 'FOYTH': ['DEF', 74, 66, 45, 78, 76, 80],
    'ALBIOL': ['DEF', 50, 64, 40, 68, 78, 80], 'BARTRA': ['DEF', 66, 62, 45, 75, 78, 78], 'VIVIAN': ['DEF', 76, 62, 40, 80, 80, 80],
    'YURI': ['DEF', 74, 72, 50, 82, 60, 74], 'DE MARCOS': ['DEF', 74, 72, 55, 80, 62, 74], 'ZUBELDIA': ['DEF', 70, 62, 40, 80, 78, 80],
    'TAPSOBA': ['DEF', 72, 66, 45, 80, 78, 80], 'NIAKHATE': ['DEF', 72, 60, 40, 80, 80, 80], 'EKONG': ['DEF', 66, 58, 40, 78, 80, 80],
    'BASSEY': ['DEF', 74, 60, 40, 80, 78, 78], 'BENSEBAINI': ['DEF', 72, 70, 62, 80, 76, 78], 'KOSSOUNOU': ['DEF', 80, 60, 40, 82, 76, 80],
    'NDICKA': ['DEF', 78, 64, 40, 80, 78, 80], 'TOMIYASU': ['DEF', 76, 68, 45, 80, 76, 82]
  };

  // squad order -> natural position (keeper, 2 defenders, 2 midfielders, 2 forwards, bench: forward, midfielder, defender, forward)
  var ORDER = ['GK', 'DEF', 'DEF', 'MID', 'MID', 'FWD', 'FWD', 'FWD', 'MID', 'DEF', 'FWD'];
  // position profile: offsets to [speed, dribble, shoot, stamina, header, defense]
  var PROFILE = {
    GK: [-22, -32, -40, -6, -18, 6],
    DEF: [-2, -12, -20, 2, 6, 12],
    MID: [2, 5, -2, 7, -6, 0],
    FWD: [6, 6, 10, -2, 0, -24]
  };
  // level of the competition / club, added to the stars
  var CAT_LEVEL = { LEAGUE_MAR: -9, LEAGUE_GER: -1 };
  var CLUB_LEVEL = { AHL: -5, EST: -6, SUN: -7, TPM: -8, FLA: -4, PAL: -4, RIV: -4, BOC: -5, HIL: -2, NAS: -2, AIN: -6,
    URA: -7, MIA: -6, AME: -6, POR_FC: -1, BEN: -1 };

  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function clampStat(v) { return v < 25 ? 25 : (v > 97 ? 97 : Math.round(v)); }

  // overall (shown in the game plan): weighted by what matters in his position
  function overall(pos, s) {
    if (pos === 'GK') return clampStat(s.def * 0.9 + s.spd * 0.1);
    if (pos === 'DEF') return clampStat(s.def * 0.45 + s.hdr * 0.17 + s.spd * 0.15 + s.sta * 0.13 + s.drb * 0.1);
    if (pos === 'MID') return clampStat(s.drb * 0.3 + s.sta * 0.18 + s.sht * 0.17 + s.def * 0.17 + s.spd * 0.18);
    return clampStat(s.sht * 0.35 + s.spd * 0.25 + s.drb * 0.25 + s.hdr * 0.1 + s.sta * 0.05);
  }

  function make(pos, a) {
    var s = { pos: pos, spd: clampStat(a[0]), drb: clampStat(a[1]), sht: clampStat(a[2]), sta: clampStat(a[3]), hdr: clampStat(a[4]), def: clampStat(a[5]) };
    s.ovr = overall(pos, s);
    return s;
  }

  NS.Players = {
    // Ratings of the player called `name` in team `t` (a NS.Teams entry).
    statsFor: function (t, name) {
      var d = DB[t.id + ':' + name] || DB[name];
      if (d) return make(d[0], d.slice(1));
      var idx = t.players.indexOf(name);
      var pos = ORDER[idx >= 0 && idx < ORDER.length ? idx : 8];
      var base = 50 + t.stars * 5 + (CLUB_LEVEL[t.id] !== undefined ? CLUB_LEVEL[t.id] : (CAT_LEVEL[t.cat] || 0));
      var prof = PROFILE[pos];
      var h = hash(t.id + '/' + name);
      var v = [];
      for (var k = 0; k < 6; k++) {
        var jitter = ((h >>> (k * 5)) & 31) / 31 * 12 - 6; // -6..+6, fixed per player and stat
        v.push(base + prof[k] + jitter);
      }
      return make(pos, v);
    }
  };
})(window.RS6 = window.RS6 || {});
