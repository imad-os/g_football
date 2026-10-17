/* World football database: categories, teams, kits and squads (11 names per team; first 7 start). */
(function (NS) {
  'use strict';
  function team(id, name, code, cat, stars, pattern, c1, c2, shorts, players) {
    return { id, name, code, cat, stars, pattern, c1, c2, shorts, players };
  }

  const CATEGORIES = [
    { id: 'LEAGUE_MAR', label: '🇲🇦 Botola Pro (Morocco)', type: 'LEAGUE' },
    { id: 'LEAGUE_ESP', label: '🇪🇸 La Liga (Spain)', type: 'LEAGUE' },
    { id: 'LEAGUE_ENG', label: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League (England)', type: 'LEAGUE' },
    { id: 'LEAGUE_GER', label: '🇩🇪 Bundesliga (Germany)', type: 'LEAGUE' },
    { id: 'NAT_AFRICA', label: '🌍 Africa Nations (10)', type: 'NATIONAL' },
    { id: 'NAT_EUROPE', label: '🌍 Europe Nations (10)', type: 'NATIONAL' },
    { id: 'NAT_SAMERICA', label: '🌎 S. America Nations (10)', type: 'NATIONAL' },
    { id: 'NAT_NAMERICA', label: '🌎 N. America Nations (10)', type: 'NATIONAL' },
    { id: 'NAT_ASIA', label: '🌏 Asia & Oceania (10)', type: 'NATIONAL' },
    { id: 'CLUBS_WORLD', label: '⭐ Top Continental Clubs (40)', type: 'CLUB' }
  ];

  const TEAMS = [
    // ================= MOROCCAN BOTOLA PRO INWI (12 CLUBS) =================
    team('WAC', 'Wydad AC', 'WAC', 'LEAGUE_MAR', 5, 'SOLID', 0xdc2626, 0xffffff, 0xffffff,
      ['MOTIE', 'HARKASS', 'BOUCHTA', 'MOUFI', 'ZEMRAOUI', 'MOUTARAJJI', 'BOUNAAMAR', 'RAYHI', 'MAHTI', 'SAKHI', 'BENKTIB']),
    team('RCA', 'Raja CA', 'RCA', 'LEAGUE_MAR', 5, 'STRIPES', 0x16a34a, 0xffffff, 0xffffff,
      ['ZNITI', 'KHAFIFI', 'BELAMMARI', 'BOULACSOUT', 'SABER', 'ZILA', 'BOUGRINE', 'ENNAFATI', 'ZERHOUNI', 'RAHIMI', 'BANOUH']),
    team('FAR', 'AS FAR Rabat', 'FAR', 'LEAGUE_MAR', 5, 'STRIPES', 0x111827, 0xdc2626, 0x16a34a,
      ['BENABID', 'INONGA', 'CARNEIRO', 'CHIBI', 'HRIMAT', 'AIT OURKHANE', 'HADRAF', 'ZOUHZOUH', 'BEYA', 'EL BOURAOUI', 'AJARAY']),
    team('RSB', 'RS Berkane', 'RSB', 'LEAGUE_MAR', 5, 'SOLID', 0xf97316, 0x111827, 0x111827,
      ['MUNIR', 'DAYO', 'TAHIF', 'MOUSAOUI', 'CAMARA', 'KHAIRI', 'LABHIRI', 'MEHRI', 'BASSENE', 'LAMLIOUI', 'ZGHIOUDI']),
    team('IRT', 'IR Tangier', 'IRT', 'LEAGUE_MAR', 4, 'STRIPES', 0x2563eb, 0xffffff, 0x2563eb,
      ['MERBAH', 'KIANI', 'SAOUD', 'EL OUAHABI', 'MOUTAOUALI', 'JAADI', 'EL BAKKALI', 'MAALI', 'HARRAK', 'GHABRA', 'BENALI']),
    team('FUS', 'FUS Rabat', 'FUS', 'LEAGUE_MAR', 4, 'SOLID', 0xdc2626, 0xffffff, 0xdc2626,
      ['GHANIMI', 'EL BASRI', 'LAALAOUI', 'BAHRI', 'MAOUHOUB', 'NANAH', 'QASMI', 'EL AZRAQ', 'KAROUMI', 'TOUHAMI', 'OUJADDOU']),
    team('MAS', 'MAS Fes', 'MAS', 'LEAGUE_MAR', 4, 'STRIPES', 0xfacc15, 0x111827, 0x111827,
      ['CHIHAB', 'TARGAOUI', 'AGUERD M.', 'JBIRA', 'BADRANE', 'BOURIGA', 'AHADAD', 'JANATI', 'DIARRA', 'HARIMAT', 'KANTARI']),
    team('OCS', 'Olympic Safi', 'OCS', 'LEAGUE_MAR', 4, 'STRIPES', 0x1e3a8a, 0xdc2626, 0x1e3a8a,
      ['MAJID', 'NAJI', 'LAMIRAT', 'SAMMAKE', 'BELAABI', 'DIARRA', 'KHABBA', 'EL MOURABIT', 'HAFIDI', 'CHAMLAL', 'QASSIMI']),
    team('HUSA', 'Hassania Agadir', 'HUSA', 'LEAGUE_MAR', 4, 'SOLID', 0xdc2626, 0xffffff, 0xffffff,
      ['JOURAOUI', 'KALAI', 'RAMI', 'AFSAL', 'MBELE', 'BAADI', 'KATI', 'CHAOUI', 'BENCHARKI', 'MEHDI', 'TACHFINE']),
    team('MAT', 'Moghreb Tetouan', 'MAT', 'LEAGUE_MAR', 4, 'STRIPES', 0xdc2626, 0xffffff, 0x1e3a8a,
      ['EL FILALI', 'CHAKHCHOUKH', 'GHOULAM', 'KARMOUNE', 'LAKHAL', 'BADJI', 'FERKANE', 'MADKOUR', 'GATTOUSSI', 'OUADGHIRI', 'AMZIL']),
    team('UTS', 'Union Touarga', 'UTS', 'LEAGUE_MAR', 4, 'SOLID', 0xfacc15, 0x16a34a, 0x16a34a,
      ['KHOUYA', 'EL KHOMSSI', 'BOUSSAFI', 'ZOUHIR', 'DIEDHIOU', 'AKIL', 'DAHMANI', 'RHOLI', 'CHAHIR', 'ZRAIDI', 'ESSABBAR']),
    team('RCAZ', 'Renaissance Zemamra', 'RCZ', 'LEAGUE_MAR', 4, 'SOLID', 0x0284c7, 0xffffff, 0x0284c7,
      ['FAKHR', 'BAJJA', 'ZAHRAOUI', 'KHAMMAS', 'BENNANI', 'EL BAHRI', 'GAMRANI', 'TINE', 'MABROUK', 'SOUFIANE', 'BOUJDAA']),

    // ================= SPANISH LA LIGA (10 CLUBS) =================
    team('RMA', 'Real Madrid', 'RMA', 'LEAGUE_ESP', 5, 'SOLID', 0xffffff, 0xf59e0b, 0xffffff,
      ['COURTOIS', 'CARVAJAL', 'RUDIGER', 'VALVERDE', 'BELLINGHAM', 'VINICIUS JR', 'MBAPPE', 'RODRYGO', 'MODRIC', 'CAMAVINGA', 'BRAHIM DIAZ']),
    team('BAR', 'FC Barcelona', 'BAR', 'LEAGUE_ESP', 5, 'STRIPES', 0x1d4ed8, 0xb91c1c, 0x1e3a8a,
      ['TER STEGEN', 'KOUNDE', 'ARAUJO', 'PEDRI', 'DE JONG', 'LAMINE YAMAL', 'LEWANDOWSKI', 'RAPHINHA', 'GAVI', 'OLMO', 'CUBARSI']),
    team('ATM', 'Atletico Madrid', 'ATM', 'LEAGUE_ESP', 5, 'STRIPES', 0xdc2626, 0xffffff, 0x1d4ed8,
      ['OBLAK', 'GIMENEZ', 'LE NORMAND', 'KOKE', 'DE PAUL', 'GRIEZMANN', 'J. ALVAREZ', 'SORLOTH', 'LLORENTE', 'GALLAGHER', 'CORREA']),
    team('ATH', 'Athletic Club', 'ATH', 'LEAGUE_ESP', 4, 'STRIPES', 0xdc2626, 0xffffff, 0x111827,
      ['UNAI SIMON', 'VIVIAN', 'YURI', 'SANCET', 'PRADOS', 'NICO WILLIAMS', 'INAKI WILLIAMS', 'GURUZETA', 'BERENGUER', 'DE MARCOS', 'HERRERA']),
    team('RSO', 'Real Sociedad', 'RSO', 'LEAGUE_ESP', 4, 'STRIPES', 0x2563eb, 0xffffff, 0xffffff,
      ['REMIRO', 'ZUBELDIA', 'AGUERD', 'ZUBIMENDI', 'BRAIS MENDEZ', 'KUBO', 'OYARZABAL', 'BARRENETXEA', 'BECKER', 'TURRIENTES', 'SUCIC']),
    team('VIL', 'Villarreal CF', 'VIL', 'LEAGUE_ESP', 4, 'SOLID', 0xfacc15, 0x1d4ed8, 0xfacc15,
      ['CONDE', 'ALBIOL', 'FOYTH', 'PAREJO', 'BAENA', 'YEREMY PINO', 'AYOZE PEREZ', 'GERARD MORENO', 'PEPE', 'COMESANA', 'AKHOMACH']),
    team('BET', 'Real Betis', 'BET', 'LEAGUE_ESP', 4, 'STRIPES', 0x16a34a, 0xffffff, 0xffffff,
      ['RUI SILVA', 'LLORENTE', 'BARTRA', 'ISCO', 'LO CELSO', 'ABDE EZZALZAOUI', 'VITOR ROQUE', 'FORNALS', 'BAKAMBU', 'CHIMY AVILA', 'ROCA']),
    team('SEV', 'Sevilla FC', 'SEV', 'LEAGUE_ESP', 4, 'SOLID', 0xffffff, 0xdc2626, 0xffffff,
      ['NYLAND', 'BADE', 'NAVAS', 'SAUL', 'GUDELJ', 'LUKEBAKIO', 'ISAAC ROMERO', 'EJUKE', 'SOW', 'PEDROSA', 'SUSO']),
    team('VAL', 'Valencia CF', 'VAL', 'LEAGUE_ESP', 4, 'SOLID', 0xffffff, 0x111827, 0x111827,
      ['MAMARDASHVILI', 'MOSQUERA', 'GAYA', 'PEPELU', 'GUERRA', 'DIEGO LOPEZ', 'HUGO DURO', 'RIOJA', 'ALMEIDA', 'TARREGA', 'MIR']),
    team('GIR', 'Girona FC', 'GIR', 'LEAGUE_ESP', 4, 'STRIPES', 0xdc2626, 0xffffff, 0xdc2626,
      ['GAZZANIGA', 'BLIND', 'GUTIERREZ', 'HERRERA', 'IVAN MARTIN', 'TSYGANKOV', 'ABEL RUIZ', 'DANJUMA', 'ASPRILLA', 'STUANI', 'GIL']),

    // ================= ENGLISH PREMIER LEAGUE (10 CLUBS) =================
    team('MCI', 'Manchester City', 'MCI', 'LEAGUE_ENG', 5, 'SOLID', 0x38bdf8, 0xffffff, 0xffffff,
      ['EDERSON', 'RUBEN DIAS', 'GVARDIOL', 'RODRI', 'DE BRUYNE', 'FODEN', 'HAALAND', 'BERNARDO', 'DOKU', 'SAVINHO', 'KOVACIC']),
    team('ARS', 'Arsenal FC', 'ARS', 'LEAGUE_ENG', 5, 'SOLID', 0xdc2626, 0xffffff, 0xffffff,
      ['RAYA', 'SALIBA', 'GABRIEL', 'DECLAN RICE', 'ODEGAARD', 'SAKA', 'HAVERTZ', 'MARTINELLI', 'TROSSARD', 'TIMBER', 'MERINO']),
    team('LIV', 'Liverpool FC', 'LIV', 'LEAGUE_ENG', 5, 'SOLID', 0xb91c1c, 0xfacc15, 0xb91c1c,
      ['ALISSON', 'VAN DIJK', 'ALEXANDER-ARNOLD', 'MAC ALLISTER', 'GRAVENBERCH', 'MO SALAH', 'LUIS DIAZ', 'JOTA', 'DARWIN NUNEZ', 'SZOBOSZLAI', 'GAKPO']),
    team('CHE', 'Chelsea FC', 'CHE', 'LEAGUE_ENG', 5, 'SOLID', 0x1d4ed8, 0xffffff, 0x1d4ed8,
      ['SANCHEZ', 'COLWILL', 'CUCURELLA', 'CAICEDO', 'ENZO', 'COLE PALMER', 'N. JACKSON', 'NETO', 'MADUEKE', 'NKUNKU', 'SANCHO']),
    team('MUN', 'Manchester United', 'MUN', 'LEAGUE_ENG', 5, 'SOLID', 0xdc2626, 0x111827, 0xffffff,
      ['ONANA', 'MAZRAOUI', 'DE LIGT', 'MAINOO', 'BRUNO FERNANDES', 'RASHFORD', 'HOJLUND', 'GARNACHO', 'AMAD', 'CASEMIRO', 'ZIRKZEE']),
    team('TOT', 'Tottenham Hotspur', 'TOT', 'LEAGUE_ENG', 4, 'SOLID', 0xffffff, 0x1e293b, 0x1e293b,
      ['VICARIO', 'ROMERO', 'VAN DE VEN', 'MADDISON', 'KULUSEVSKI', 'SON HEUNG-MIN', 'SOLANKE', 'JOHNSON', 'BISSOUMA', 'PORRO', 'SARR']),
    team('NEW', 'Newcastle United', 'NEW', 'LEAGUE_ENG', 4, 'STRIPES', 0x111827, 0xffffff, 0x111827,
      ['POPE', 'SCHAR', 'HALL', 'BRUNO GUIMARAES', 'JOELINTON', 'GORDON', 'ISAK', 'TONALI', 'BARNES', 'TRIPPIER', 'MURPHY']),
    team('AVL', 'Aston Villa', 'AVL', 'LEAGUE_ENG', 4, 'SOLID', 0x7f1d1d, 0x38bdf8, 0xffffff,
      ['E. MARTINEZ', 'PAU TORRES', 'KONSA', 'TIELEMANS', 'MCGINN', 'ROGERS', 'WATKINS', 'DURAN', 'BAILEY', 'ONANA', 'DIGNE']),
    team('WHU', 'West Ham United', 'WHU', 'LEAGUE_ENG', 4, 'SOLID', 0x881337, 0x38bdf8, 0xffffff,
      ['AREOLA', 'KILMAN', 'WAN-BISSAKA', 'PAQUETA', 'ALVAREZ', 'BOWEN', 'KUDUS', 'ANTONIO', 'SOUCEK', 'SUMMERVILLE', 'FULLKRUG']),
    team('BHA', 'Brighton & Hove', 'BHA', 'LEAGUE_ENG', 4, 'STRIPES', 0x2563eb, 0xffffff, 0x2563eb,
      ['VERBRUGGEN', 'DUNK', 'ESTUPINAN', 'BALEBA', 'MITOMA', 'JOAO PEDRO', 'WELBECK', 'MINTEH', 'RUTTER', 'ADINGRA', 'KADIOGLU']),

    // ================= GERMAN BUNDESLIGA (8 CLUBS) =================
    team('BAY', 'Bayern Munich', 'BAY', 'LEAGUE_GER', 5, 'SOLID', 0xdc2626, 0xffffff, 0xdc2626,
      ['NEUER', 'UPAMECANO', 'KIM MIN-JAE', 'KIMMICH', 'MUSIALA', 'OLISE', 'HARRY KANE', 'SANE', 'GNABRY', 'DAVIES', 'PALHINHA']),
    team('B04', 'Bayer Leverkusen', 'B04', 'LEAGUE_GER', 5, 'SOLID', 0xb91c1c, 0x111827, 0x111827,
      ['HRADECKY', 'TAH', 'TAPSOBA', 'XHAKA', 'GRIMALDO', 'FRIMPONG', 'FLORI WIRTZ', 'BONIFACE', 'SCHICK', 'ADLI', 'TERRIER']),
    team('BVB', 'Borussia Dortmund', 'BVB', 'LEAGUE_GER', 5, 'SOLID', 0xfacc15, 0x111827, 0x111827,
      ['KOBEL', 'SCHLOTTERBECK', 'SULE', 'BRANDT', 'SABITZER', 'ADEYEMI', 'GUIRASSY', 'GITTENS', 'MALEN', 'GROSS', 'BEIER']),
    team('RBL', 'RB Leipzig', 'RBL', 'LEAGUE_GER', 4, 'SOLID', 0xffffff, 0xdc2626, 0xdc2626,
      ['GULACSI', 'ORBAN', 'LUKEBA', 'XAVI SIMONS', 'HAIDARA', 'OPENDA', 'SESKO', 'BAUMGARTNER', 'RAUM', 'NUSA', 'HENRICHS']),
    team('VFB', 'VfB Stuttgart', 'VFB', 'LEAGUE_GER', 4, 'SASH', 0xffffff, 0xdc2626, 0xffffff,
      ['NUBEL', 'CHABOT', 'MITTELSTADT', 'STILLER', 'KARAZOR', 'MILLOT', 'UNDAV', 'DEMIROVIC', 'LEWELING', 'FUHRICH', 'VAGNOMAN']),
    team('SGE', 'Eintracht Frankfurt', 'SGE', 'LEAGUE_GER', 4, 'STRIPES', 0x111827, 0xdc2626, 0x111827,
      ['TRAPP', 'KOCH', 'THEATE', 'LARSSON', 'CHAIBI', 'MARMOUSH', 'EKITIKE', 'GOTZE', 'KNAUFF', 'SKHIRI', 'EBIMBE']),
    team('WOB', 'VfL Wolfsburg', 'WOB', 'LEAGUE_GER', 4, 'SOLID', 0x22c55e, 0xffffff, 0x22c55e,
      ['GRABARA', 'BORNAUW', 'MAEHLE', 'ARNOLD', 'MAJER', 'AMOURA', 'WIND', 'BAKU', 'WIMMER', 'TIAGO TOMAS', 'KOULIERAKIS']),
    team('BMG', 'Borussia M.gladbach', 'BMG', 'LEAGUE_GER', 4, 'SOLID', 0xffffff, 0x16a34a, 0xffffff,
      ['OMLIN', 'ITAKURA', 'ELVEDI', 'WEIGL', 'REITZ', 'HONORAT', 'KLEINDIENST', 'PLEA', 'HACK', 'SCALLY', 'STOGER']),

    // ================= 10 AFRICAN NATIONAL TEAMS =================
    team('MAR', 'Morocco', 'MAR', 'NAT_AFRICA', 5, 'SOLID', 0xdc2626, 0x16a34a, 0x16a34a,
      ['BONO', 'HAKIMI', 'AGUERD', 'MAZRAOUI', 'AMRABAT', 'BRAHIM DIAZ', 'EN-NESYRI', 'ZIYECH', 'OUNAHI', 'RAHIMI', 'EZZALZAOUI']),
    team('EGY', 'Egypt', 'EGY', 'NAT_AFRICA', 5, 'SOLID', 0xb91c1c, 0xffffff, 0xffffff,
      ['EL SHENAWY', 'HEGAZI', 'ABDELMONEM', 'ELNENY', 'ASHOUR', 'MO SALAH', 'MARMOUSH', 'TREZEGUET', 'MOSTAFA MOHAMED', 'ZIZO', 'FATHI']),
    team('SEN', 'Senegal', 'SEN', 'NAT_AFRICA', 5, 'SOLID', 0xffffff, 0x16a34a, 0xffffff,
      ['MENDY', 'KOULIBALY', 'NIAKHATE', 'GUEYE', 'PAPE SARR', 'SADIO MANE', 'N. JACKSON', 'ISMAILA SARR', 'NDIAYE', 'CAMARA', 'DIALLO']),
    team('NGA', 'Nigeria', 'NGA', 'NAT_AFRICA', 5, 'SOLID', 0x16a34a, 0xffffff, 0x16a34a,
      ['NWABALI', 'EKONG', 'BASSEY', 'NDIDI', 'IWOBI', 'LOOKMAN', 'OSIMHEN', 'BONIFACE', 'CHUKWUEZE', 'AINA', 'SIMON']),
    team('CIV', 'Ivory Coast', 'CIV', 'NAT_AFRICA', 5, 'SOLID', 0xf97316, 0x16a34a, 0xffffff,
      ['FOFANA', 'NDICKA', 'KOSSOUNOU', 'KESSIE', 'SEKO FOFANA', 'ADINGRA', 'HALLER', 'PEPE', 'DIAKITE', 'SINGO', 'KRASSO']),
    team('ALG', 'Algeria', 'ALG', 'NAT_AFRICA', 5, 'SOLID', 0xffffff, 0x16a34a, 0xffffff,
      ['MANDREA', 'MANDI', 'BENSEBAINI', 'AIT-NOURI', 'BENNACER', 'AOUAR', 'MAHREZ', 'AMOURA', 'GOUIRI', 'BOUNEDJAH', 'BENRAHMA']),
    team('TUN', 'Tunisia', 'TUN', 'NAT_AFRICA', 4, 'SOLID', 0xdc2626, 0xffffff, 0xdc2626,
      ['BEN SAID', 'TALBI', 'MERIAH', 'ABDI', 'SKHIRI', 'LAIDOUNI', 'MSAKNI', 'ACHOURI', 'RAFIA', 'MEJBRI', 'JAZIRI']),
    team('CMR', 'Cameroon', 'CMR', 'NAT_AFRICA', 4, 'SOLID', 0x16a34a, 0xdc2626, 0xdc2626,
      ['ONANA', 'WOOH', 'CASTELLETTO', 'ANGUISSA', 'BALEBA', 'MBEUMO', 'ABOUBAKAR', 'NKOUDOU', 'TCHATCHOUA', 'HONGLA', 'MAGRI']),
    team('GHA', 'Ghana', 'GHA', 'NAT_AFRICA', 4, 'SOLID', 0xffffff, 0xfacc15, 0xffffff,
      ['ATI-ZIGI', 'SALISU', 'DJIKU', 'PARTEY', 'KUDUS', 'SEMENYO', 'JORDAN AYEW', 'INAKI WILLIAMS', 'LAMPTEY', 'FATAWU', 'NUAMAH']),
    team('MLI', 'Mali', 'MLI', 'NAT_AFRICA', 4, 'SOLID', 0xfacc15, 0x16a34a, 0x16a34a,
      ['DIARRA', 'KOUYATE', 'TRAORE', 'BISSOUMA', 'HAIDARA', 'CAMARA', 'SINAYOKO', 'EL BILAL TOURE', 'DOUMBIA', 'KOITA', 'SANGARE']),

    // ================= 10 EUROPEAN NATIONAL TEAMS =================
    team('ESP', 'Spain', 'ESP', 'NAT_EUROPE', 5, 'SOLID', 0xdc2626, 0xfacc15, 0x1e3a8a,
      ['UNAI SIMON', 'CARVAJAL', 'LAPORTE', 'RODRI', 'PEDRI', 'LAMINE YAMAL', 'NICO WILLIAMS', 'MORATA', 'OLMO', 'FABIAN RUIZ', 'CUCURELLA']),
    team('FRA', 'France', 'FRA', 'NAT_EUROPE', 5, 'SOLID', 0x1e3a8a, 0xffffff, 0xffffff,
      ['MAIGNAN', 'SALIBA', 'KOUNDE', 'TCHOUAMENI', 'CAMAVINGA', 'GRIEZMANN', 'MBAPPE', 'DEMBELE', 'OLISE', 'BARCOLA', 'THEO H.']),
    team('ENG', 'England', 'ENG', 'NAT_EUROPE', 5, 'SOLID', 0xffffff, 0x1e3a8a, 0x1e3a8a,
      ['PICKFORD', 'STONES', 'GUEHI', 'DECLAN RICE', 'BELLINGHAM', 'SAKA', 'HARRY KANE', 'FODEN', 'COLE PALMER', 'TRENT A-A', 'GORDON']),
    team('GER', 'Germany', 'GER', 'NAT_EUROPE', 5, 'SOLID', 0xffffff, 0x111827, 0x111827,
      ['TER STEGEN', 'RUDIGER', 'TAH', 'KIMMICH', 'ANDRICH', 'MUSIALA', 'FLORI WIRTZ', 'HAVERTZ', 'FULLKRUG', 'SANE', 'MITTELSTADT']),
    team('POR', 'Portugal', 'POR', 'NAT_EUROPE', 5, 'SOLID', 0xb91c1c, 0x16a34a, 0x16a34a,
      ['DIOGO COSTA', 'RUBEN DIAS', 'NUNO MENDES', 'VITINHA', 'BRUNO FERNANDES', 'BERNARDO', 'CRISTIANO RONALDO', 'RAFAEL LEAO', 'JOAO NEVES', 'CANCELO', 'JOTA']),
    team('ITA', 'Italy', 'ITA', 'NAT_EUROPE', 5, 'SOLID', 0x2563eb, 0xffffff, 0xffffff,
      ['DONNARUMMA', 'BASTONI', 'CALAFIORI', 'DI LORENZO', 'BARELLA', 'TONALI', 'DIMARCO', 'RETEGUI', 'CHIESA', 'FRATTESI', 'CAMBIASO']),
    team('NED', 'Netherlands', 'NED', 'NAT_EUROPE', 5, 'SOLID', 0xf97316, 0x111827, 0xf97316,
      ['VERBRUGGEN', 'VAN DIJK', 'AKE', 'FRIMPONG', 'DE JONG', 'REIJNDERS', 'XAVI SIMONS', 'GAKPO', 'DEPAY', 'GRAVENBERCH', 'DUMFRIES']),
    team('BEL', 'Belgium', 'BEL', 'NAT_EUROPE', 5, 'SOLID', 0xb91c1c, 0x111827, 0x111827,
      ['CASTEELS', 'FAES', 'THEATE', 'ONANA', 'DE BRUYNE', 'TIELEMANS', 'DOKU', 'LUKAKU', 'OPENDA', 'TROSSARD', 'DE KETELAERE']),
    team('CRO', 'Croatia', 'CRO', 'NAT_EUROPE', 4, 'STRIPES', 0xdc2626, 0xffffff, 0xffffff,
      ['LIVAKOVIC', 'GVARDIOL', 'SUTALO', 'MODRIC', 'KOVACIC', 'SUCIC', 'KRAMARIC', 'PERISIC', 'BATURINA', 'PASALIC', 'BUDIMIR']),
    team('SUI', 'Switzerland', 'SUI', 'NAT_EUROPE', 4, 'SOLID', 0xdc2626, 0xffffff, 0xdc2626,
      ['SOMMER', 'AKANJI', 'SCHAR', 'XHAKA', 'FREULER', 'NDOYE', 'EMBOLO', 'VARGAS', 'AEBISCHER', 'RODRIGUEZ', 'AMDOUNI']),

    // ================= 10 SOUTH AMERICAN NATIONAL TEAMS =================
    team('ARG', 'Argentina', 'ARG', 'NAT_SAMERICA', 5, 'STRIPES', 0x38bdf8, 0xffffff, 0x111827,
      ['E. MARTINEZ', 'ROMERO', 'LI. MARTINEZ', 'DE PAUL', 'ENZO', 'MAC ALLISTER', 'LEO MESSI', 'LAUTARO', 'J. ALVAREZ', 'N. GONZALEZ', 'MOLINA']),
    team('BRA', 'Brazil', 'BRA', 'NAT_SAMERICA', 5, 'SOLID', 0xfacc15, 0x16a34a, 0x2563eb,
      ['ALISSON', 'MARQUINHOS', 'GABRIEL', 'BRUNO GUIMARAES', 'PAQUETA', 'VINICIUS JR', 'RODRYGO', 'RAPHINHA', 'ENDRICK', 'SAVINHO', 'DANILO']),
    team('URU', 'Uruguay', 'URU', 'NAT_SAMERICA', 5, 'SOLID', 0x38bdf8, 0x111827, 0x111827,
      ['ROCHET', 'ARAUJO', 'GIMENEZ', 'VALVERDE', 'UGARTE', 'BENTANCUR', 'DARWIN NUNEZ', 'PELLISTRI', 'MAXI ARAUJO', 'DE LA CRUZ', 'OLIVERA']),
    team('COL', 'Colombia', 'COL', 'NAT_SAMERICA', 5, 'SOLID', 0xfacc15, 0x1e3a8a, 0x1e3a8a,
      ['VARGAS', 'SANCHEZ', 'LUCUMI', 'MUNOZ', 'RIOS', 'LERMA', 'JAMES RODRIGUEZ', 'LUIS DIAZ', 'JHON DURAN', 'CORDOBA', 'ARIAS']),
    team('ECU', 'Ecuador', 'ECU', 'NAT_SAMERICA', 4, 'SOLID', 0xfacc15, 0x1e3a8a, 0x1e3a8a,
      ['GALINDEZ', 'HINCAPIE', 'PACHO', 'ESTUPINAN', 'CAICEDO', 'PAEZ', 'PLATA', 'ENER VALENCIA', 'SARMIENTO', 'FRANCO', 'PRECIADO']),
    team('CHI', 'Chile', 'CHI', 'NAT_SAMERICA', 4, 'SOLID', 0xdc2626, 0x1e3a8a, 0x1e3a8a,
      ['CORTES', 'DIAZ', 'MARIPAN', 'SUAZO', 'PULGAR', 'OSORIO', 'ALEXIS SANCHEZ', 'VARGAS', 'BRERETON', 'DAVILA', 'NUNEZ']),
    team('PAR', 'Paraguay', 'PAR', 'NAT_SAMERICA', 4, 'STRIPES', 0xdc2626, 0xffffff, 0x1e3a8a,
      ['FERNANDEZ', 'GOMEZ', 'ALDERETE', 'CUBAS', 'BOBADILLA', 'ALMIRON', 'ENCISO', 'SANABRIA', 'SOSA', 'BALBUENA', 'PITTON']),
    team('PER', 'Peru', 'PER', 'NAT_SAMERICA', 4, 'SASH', 0xffffff, 0xdc2626, 0xffffff,
      ['GALLESE', 'CALLENS', 'ZAMBRANO', 'ADVINCULA', 'TAPIA', 'PENA', 'LAPADULA', 'REYNA', 'FLORES', 'GRIMALDO', 'LOPEZ']),
    team('VEN', 'Venezuela', 'VEN', 'NAT_SAMERICA', 4, 'SOLID', 0x7f1d1d, 0xfacc15, 0x7f1d1d,
      ['ROMO', 'FERRARESI', 'OSORIO', 'ARAMBURU', 'HERRERA', 'MARTINEZ', 'SOTELDO', 'RONDON', 'SAVARINO', 'MACHIS', 'BELLO']),
    team('BOL', 'Bolivia', 'BOL', 'NAT_SAMERICA', 3, 'SOLID', 0x16a34a, 0xffffff, 0xffffff,
      ['VISCARRA', 'HAQUIN', 'SAGREDO', 'MEDINA', 'VACA', 'TERRAZAS', 'MIGUELITO', 'ALGARANAZ', 'MONTEIRO', 'VILLAMIL', 'FERNANDEZ']),

    // ================= 10 NORTH AMERICAN NATIONAL TEAMS =================
    team('USA', 'USA', 'USA', 'NAT_NAMERICA', 4, 'SOLID', 0xffffff, 0x1e3a8a, 0x1e3a8a,
      ['TURNER', 'REIM', 'ROBINSON', 'MCKENNIE', 'MUSAH', 'REYNA', 'PULISIC', 'BALOGUN', 'WEAH', 'DEST', 'PEPI']),
    team('MEX', 'Mexico', 'MEX', 'NAT_NAMERICA', 4, 'SOLID', 0x16a34a, 0xdc2626, 0xffffff,
      ['MALAGON', 'MONTES', 'VASQUEZ', 'EDSON ALVAREZ', 'CHAVEZ', 'ROMO', 'SANTI GIMENEZ', 'RAUL JIMENEZ', 'HUERTA', 'QUINONES', 'ORBELIN']),
    team('CAN', 'Canada', 'CAN', 'NAT_NAMERICA', 4, 'SOLID', 0xdc2626, 0xffffff, 0xdc2626,
      ['CREPEAU', 'BOMBITO', 'JOHNSTON', 'ALPHONSO DAVIES', 'EUSTAQUIO', 'KONE', 'JONATHAN DAVID', 'LARIN', 'SHAFFELBURG', 'BUCHANAN', 'MILLAR']),
    team('CRC', 'Costa Rica', 'CRC', 'NAT_NAMERICA', 4, 'SOLID', 0xdc2626, 0x1e3a8a, 0x1e3a8a,
      ['SEQUEIRA', 'CALVO', 'MITCHELL', 'AGUILERA', 'BRENES', 'CAMPBELL', 'UGALDE', 'MORA', 'LASSITER', 'ZAMORA', 'VARGAS']),
    team('PAN', 'Panama', 'PAN', 'NAT_NAMERICA', 4, 'SOLID', 0xdc2626, 0xffffff, 0xdc2626,
      ['MOSQUERA', 'CORDOBA', 'MURILLO', 'CARRASQUILLA', 'MARTINEZ', 'BARCENAS', 'FAJARDO', 'DIAZ', 'BLACKMAN', 'GUERRERO', 'DAVIS']),
    team('JAM', 'Jamaica', 'JAM', 'NAT_NAMERICA', 4, 'SOLID', 0xfacc15, 0x16a34a, 0x111827,
      ['BLAKE', 'PINNOCK', 'LEIGH', 'PALMER', 'DE CORDOVA-REID', 'LEON BAILEY', 'ANTONIO', 'GRAY', 'NICHOLSON', 'LATIBEAUDIERE', 'LOWE']),
    team('HON', 'Honduras', 'HON', 'NAT_NAMERICA', 3, 'SOLID', 0xffffff, 0x2563eb, 0xffffff,
      ['MENJIVAR', 'MALDONADO', 'VEGA', 'FLORES', 'RODRIGUEZ', 'PALMA', 'LOZANO', 'RIVAS', 'ROSALES', 'ACOSTA', 'RUIZ']),
    team('GTM', 'Guatemala', 'GTM', 'NAT_NAMERICA', 3, 'SASH', 0xffffff, 0x38bdf8, 0xffffff,
      ['HAGEN', 'PINTO', 'HERRERA', 'CASTELLANOS', 'SARAVIA', 'MENDEZ-LAING', 'RUBIN', 'SANTIS', 'GALINDO', 'ARDON', 'LOM']),
    team('SLV', 'El Salvador', 'SLV', 'NAT_NAMERICA', 3, 'SOLID', 0x2563eb, 0xffffff, 0x2563eb,
      ['GONZALEZ', 'CLAVEL', 'LARIN', 'MARTINEZ', 'ORELLANA', 'CEREN', 'BONILLA', 'TEJADA', 'FLORES', 'HENRIQUEZ', 'RIVAS']),
    team('TRI', 'Trinidad & Tobago', 'TRI', 'NAT_NAMERICA', 3, 'SOLID', 0xdc2626, 0x111827, 0x111827,
      ['SMITH', 'JONES', 'BATEAU', 'RAMPERSAD', 'PHILLIPS', 'GARCIA', 'MOORE', 'TELFER', 'JAMES', 'POWDER', 'SHAW']),

    // ================= 10 ASIAN & OCEANIAN NATIONAL TEAMS =================
    team('JPN', 'Japan', 'JPN', 'NAT_ASIA', 5, 'SOLID', 0x1d4ed8, 0xffffff, 0xffffff,
      ['SUZUKI', 'ITAKURA', 'TOMIYASU', 'ENDO', 'MORITA', 'KUBO', 'MITOMA', 'MINAMINO', 'DOAN', 'KAMADA', 'UEDA']),
    team('KOR', 'South Korea', 'KOR', 'NAT_ASIA', 5, 'SOLID', 0xe11d48, 0x111827, 0x111827,
      ['JO HYEON-WOO', 'KIM MIN-JAE', 'SEOL', 'HWANG IN-BEOM', 'LEE KANG-IN', 'SON HEUNG-MIN', 'HWANG HEE-CHAN', 'JUNG', 'LEE JAE-SUNG', 'OH', 'BAE']),
    team('AUS', 'Australia', 'AUS', 'NAT_ASIA', 4, 'SOLID', 0xfacc15, 0x16a34a, 0x16a34a,
      ['RYAN', 'SOUTTAR', 'ROWLES', 'IRVINE', 'METCALFE', 'HRUSTIC', 'GOODWIN', 'DUKE', 'IRANKUNDA', 'BEHICH', 'BOYLE']),
    team('IRN', 'Iran', 'IRN', 'NAT_ASIA', 4, 'SOLID', 0xffffff, 0x16a34a, 0xffffff,
      ['BEIRANVAND', 'KANAANI', 'KHALILZADEH', 'EZATOLAHI', 'GHODDOS', 'JAHANBAKHSH', 'TAREMI', 'AZMOUN', 'GHAYEDI', 'MOHAMMADI', 'MOHEBI']),
    team('KSA', 'Saudi Arabia', 'KSA', 'NAT_ASIA', 4, 'SOLID', 0x16a34a, 0xffffff, 0x16a34a,
      ['AL-OWAIS', 'AL-BULAYHI', 'TAMBAKTI', 'ABULHAMID', 'KANNO', 'AL-JUWAYR', 'SALEM AL-DAWSARI', 'AL-BURAIKAN', 'GHAREEB', 'LAJAMI', 'RADIF']),
    team('QAT', 'Qatar', 'QAT', 'NAT_ASIA', 4, 'SOLID', 0x881337, 0xffffff, 0x881337,
      ['BARSHAM', 'MENDES', 'SALMAN', 'FATHI', 'HATEM', 'AKRAM AFIF', 'ALMOEZ ALI', 'AL-HAYDOS', 'WAAD', 'ABDULRAZZAQ', 'MUNTARI']),
    team('IRQ', 'Iraq', 'IRQ', 'NAT_ASIA', 4, 'SOLID', 0x16a34a, 0xffffff, 0x16a34a,
      ['HASSAN', 'NATIQ', 'SULAKA', 'AL-AMMARI', 'BAYESH', 'IQBAL', 'AYMEN HUSSEIN', 'ALI JASIM', 'RESAN', 'DOSKI', 'ALI']),
    team('UZB', 'Uzbekistan', 'UZB', 'NAT_ASIA', 4, 'SOLID', 0x2563eb, 0xffffff, 0x2563eb,
      ['YUSUPOV', 'KHUSANOV', 'ASHURMATOV', 'SHUKUROV', 'ODILOV', 'FAYZULLAEV', 'SHOMURODOV', 'MASHARIPOV', 'URUNOV', 'SAYFIEV', 'NASRULLAEV']),
    team('JOR', 'Jordan', 'JOR', 'NAT_ASIA', 4, 'SOLID', 0xdc2626, 0x111827, 0xffffff,
      ['ABULAILA', 'AL-ARAB', 'NASIB', 'AL-RASHIDAN', 'HADDAD', 'MUSA AL-TAAMARI', 'AL-NAIMAT', 'OLWAN', 'AL-MARDI', 'RATEB', 'AYED']),
    team('NZL', 'New Zealand', 'NZL', 'NAT_ASIA', 3, 'SOLID', 0xffffff, 0x111827, 0xffffff,
      ['CROCOMBE', 'BINDON', 'CACACE', 'BELL', 'STAMENIC', 'GARBETT', 'CHRIS WOOD', 'WAINE', 'OLD', 'SINGH', 'BARBAROUSES']),

    // ================= TOP CONTINENTAL CLUBS =================
    team('INT', 'Inter Milan', 'INT', 'CLUBS_WORLD', 5, 'STRIPES', 0x1d4ed8, 0x111827, 0x111827,
      ['SOMMER', 'BASTONI', 'PAVARD', 'BARELLA', 'CALHANOGLU', 'DIMARCO', 'LAUTARO', 'THURAM', 'MKHITARYAN', 'TAREMI', 'DUMFRIES']),
    team('MIL', 'AC Milan', 'MIL', 'CLUBS_WORLD', 5, 'STRIPES', 0xdc2626, 0x111827, 0x111827,
      ['MAIGNAN', 'TOMORI', 'THEO H.', 'REIJNDERS', 'FOFANA', 'PULISIC', 'RAFAEL LEAO', 'MORATA', 'ABRAHAM', 'CHUKWUEZE', 'LOFTUS-CHEEK']),
    team('JUV', 'Juventus', 'JUV', 'CLUBS_WORLD', 5, 'STRIPES', 0xffffff, 0x111827, 0xffffff,
      ['DI GREGORIO', 'BREMER', 'CAMBIASO', 'LOCATELLI', 'KOOPMEINERS', 'YILDIZ', 'VLAHOVIC', 'CONCEICAO', 'DOUGLAS LUIZ', 'THURAM K.', 'WEAH']),
    team('PSG', 'Paris Saint-Germain', 'PSG', 'CLUBS_WORLD', 5, 'SOLID', 0x1e3a8a, 0xdc2626, 0x1e3a8a,
      ['DONNARUMMA', 'MARQUINHOS', 'HAKIMI', 'NUNO MENDES', 'VITINHA', 'JOAO NEVES', 'DEMBELE', 'BARCOLA', 'ZAIRE-EMERY', 'ASENSIO', 'LEE KANG-IN']),
    team('POR_FC', 'FC Porto', 'FCP', 'CLUBS_WORLD', 4, 'STRIPES', 0x2563eb, 0xffffff, 0x2563eb,
      ['DIOGO COSTA', 'PEREZ', 'VARELA', 'NICO', 'PEPE', 'GALENO', 'SAMU OMORODION', 'JAIME', 'MOURA', 'EUSTAQUIO', 'BORGES']),
    team('BEN', 'SL Benfica', 'BEN', 'CLUBS_WORLD', 4, 'SOLID', 0xdc2626, 0xffffff, 0xffffff,
      ['TRUBIN', 'OTAMENDI', 'CARRERAS', 'FLORENTINO', 'KOKCU', 'DI MARIA', 'PAVLIDIS', 'AKTURKOGLU', 'AURSNES', 'BAH', 'CABRAL']),
    team('AHL', 'Al Ahly SC (Egypt)', 'AHL', 'CLUBS_WORLD', 5, 'SOLID', 0xdc2626, 0xffffff, 0xffffff,
      ['EL SHENAWY', 'DARI', 'RABIA', 'ATIA', 'ASHOUR', 'TAWFIK', 'WESSAM ABOU ALI', 'SHAHAT', 'TAHER', 'AFSHA', 'KAHRABA']),
    team('EST', 'Esperance Tunis', 'EST', 'CLUBS_WORLD', 4, 'STRIPES', 0xdc2626, 0xfacc15, 0x111827,
      ['MEMMICHE', 'MERIAH', 'TOUGAI', 'AHOLOU', 'TKA', 'BELAILI', 'RODRIGUES', 'SASSE', 'MOKWANA', 'BEN HAMIDA', 'BOUGUERRA']),
    team('SUN', 'Mamelodi Sundowns', 'SUN', 'CLUBS_WORLD', 4, 'SOLID', 0xfacc15, 0x16a34a, 0x2563eb,
      ['WILLIAMS', 'MVALA', 'MODIBA', 'MOKOENA', 'ALLENDE', 'ZWANE', 'RIBEIRO', 'SHALULILE', 'MATTHEWS', 'MUDAU', 'SIRINO']),
    team('TPM', 'TP Mazembe', 'TPM', 'CLUBS_WORLD', 4, 'STRIPES', 0x111827, 0xffffff, 0x111827,
      ['FATY', 'MUNDOKO', 'LUZOLO', 'ZEMANGA', 'NGIMBI', 'FOFANA', 'TRAORE', 'KEITA', 'KINZUMBI', 'MWAMBA', 'NTAMBWE']),
    team('FLA', 'CR Flamengo', 'FLA', 'CLUBS_WORLD', 5, 'HOOPS', 0xdc2626, 0x111827, 0xffffff,
      ['ROSSI', 'ORTIZ', 'SANDRO', 'GERSON', 'DE LA CRUZ', 'ARRASCAETA', 'PEDRO', 'GABIGOL', 'BRUNO HENRIQUE', 'PLATA', 'PULGAR']),
    team('PAL', 'SE Palmeiras', 'PAL', 'CLUBS_WORLD', 5, 'SOLID', 0x16a34a, 0xffffff, 0xffffff,
      ['WEVERTON', 'GOMEZ', 'MURILO', 'RIOS', 'VEIGA', 'ESTEVAO', 'FLACO LOPEZ', 'FELIPE ANDERSON', 'DUDU', 'ROCHA', 'ZE RAFAEL']),
    team('RIV', 'River Plate', 'RIV', 'CLUBS_WORLD', 5, 'SASH', 0xffffff, 0xdc2626, 0x111827,
      ['ARMANI', 'PEZZELLA', 'ACUNA', 'KRANEVITTER', 'MASTANTUONO', 'MEZA', 'BORJA', 'COLIDIO', 'LANZINI', 'BUSTOS', 'SIMON']),
    team('BOC', 'Boca Juniors', 'BOC', 'CLUBS_WORLD', 5, 'HOOPS', 0x1e3a8a, 0xfacc15, 0x1e3a8a,
      ['ROMERO', 'ROJO', 'ADVINCULA', 'BLANCO', 'MIRAMON', 'ZENON', 'CAVANI', 'MERENTIEL', 'ZEBALLOS', 'MEDINA', 'GIMENEZ']),
    team('HIL', 'Al Hilal SFC', 'HIL', 'CLUBS_WORLD', 5, 'SOLID', 0x2563eb, 0xffffff, 0x2563eb,
      ['BONO', 'KOULIBALY', 'CANCELO', 'LODI', 'RUBEN NEVES', 'MILINKOVIC-SAVIC', 'MALCOM', 'SALEM AL-DAWSARI', 'MITROVIC', 'NEYMAR JR', 'LEONARDO']),
    team('NAS', 'Al Nassr FC', 'NAS', 'CLUBS_WORLD', 5, 'SOLID', 0xfacc15, 0x1d4ed8, 0x1d4ed8,
      ['BENTO', 'LAPORTE', 'SIMAKAN', 'BROZOVIC', 'OTAVIO', 'SADIO MANE', 'CRISTIANO RONALDO', 'TALISCA', 'ANGELO', 'AL-GHANNAM', 'GHAREEB']),
    team('AIN', 'Al Ain FC (UAE)', 'AIN', 'CLUBS_WORLD', 4, 'SOLID', 0x581c87, 0xfacc15, 0xffffff,
      ['EISA', 'KOUAME', 'ERIK', 'PARK YONG-WOO', 'PALACIOS', 'KAKU', 'SOUFIANE RAHIMI', 'LABA', 'SANABRIA', 'AL-AHBABI', 'TRAORE']),
    team('URA', 'Urawa Red Diamonds', 'URA', 'CLUBS_WORLD', 4, 'SOLID', 0xdc2626, 0xffffff, 0x111827,
      ['NISHIKAWA', 'HOIBRAATEN', 'INOUE', 'GUSTAFSON', 'WATANABE', 'NAKAJIMA', 'SANTANA', 'SEKINE', 'MATSUO', 'HARAGUCHI', 'OKUBO']),
    team('MIA', 'Inter Miami CF', 'MIA', 'CLUBS_WORLD', 4, 'SOLID', 0xf472b6, 0x111827, 0xf472b6,
      ['CALLENDER', 'ALBA', 'AVILES', 'BUSQUETS', 'REDONDO', 'ROJAS', 'LEO MESSI', 'LUIS SUAREZ', 'CAMPANA', 'GOMEZ', 'TAYLOR']),
    team('AME', 'Club America (MEX)', 'AME', 'CLUBS_WORLD', 4, 'SOLID', 0xfacc15, 0x1e3a8a, 0x1e3a8a,
      ['MALAGON', 'CACERES', 'REYES', 'FIDALGO', 'DOS SANTOS', 'VALDES', 'HENRY MARTIN', 'ZENDEJAS', 'BRIAN RODRIGUEZ', 'AGUIRRE', 'DILROSUN'])
  ];

  // ---- kits: every team gets an away kit, and a third one is built when both still clash ----
  function rgb(c) { return [(c >> 16) & 255, (c >> 8) & 255, c & 255]; }
  function colorDist(a, b) {
    var x = rgb(a), y = rgb(b);
    var dr = x[0] - y[0], dg = x[1] - y[1], db = x[2] - y[2];
    return Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11) * 1.7; // weighted by how the eye sees it
  }
  function light(c) { var x = rgb(c); return (x[0] * 0.3 + x[1] * 0.59 + x[2] * 0.11) / 255; }

  for (var ti = 0; ti < TEAMS.length; ti++) {
    var tm = TEAMS[ti];
    // away kit: white with the club colour as trim (dark navy for teams that already play in a light colour)
    tm.alt = light(tm.c1) > 0.62
      ? { pattern: 'SOLID', c1: 0x1e293b, c2: tm.c1, shorts: 0x0f172a }
      : { pattern: 'SOLID', c1: 0xf8fafc, c2: tm.c1, shorts: 0xf8fafc };
  }

  var THIRD = [0xfacc15, 0x0f172a, 0x7c3aed, 0x06b6d4, 0xf97316, 0xec4899, 0x84cc16];
  var GK_KITS = [0x10b981, 0xf59e0b, 0xa855f7, 0x22d3ee, 0xf472b6, 0x111827, 0xfacc15, 0x84cc16];

  function kitOf(tm) { return { pattern: tm.pattern, c1: tm.c1, c2: tm.c2, shorts: tm.shorts }; }
  // shirts decide (that is what you see from the camera); shorts only break ties
  function kitScore(a, b) { return colorDist(a.c1, b.c1) + 0.1 * colorDist(a.shorts, b.shorts); }

  // Kits for a match: home in its first kit, away in the kit that differs most from it, keepers apart from both.
  function matchKits(home, away) {
    var h = kitOf(home);
    var a = kitOf(away);
    if (kitScore(a, h) < 150) {
      var alt = away.alt;
      if (kitScore(alt, h) > kitScore(a, h)) a = { pattern: alt.pattern, c1: alt.c1, c2: alt.c2, shorts: alt.shorts };
      if (kitScore(a, h) < 150) {
        var best = THIRD[0], bs = -1;
        for (var i = 0; i < THIRD.length; i++) {
          var sc = colorDist(THIRD[i], h.c1) + 0.4 * colorDist(THIRD[i], h.shorts);
          if (sc > bs) { bs = sc; best = THIRD[i]; }
        }
        a = { pattern: 'SOLID', c1: best, c2: light(best) > 0.6 ? 0x0f172a : 0xffffff, shorts: light(best) > 0.6 ? 0x0f172a : best };
      }
    }
    var gk = [0, 0];
    for (var g = 0; g < 2; g++) {
      var bestG = GK_KITS[g], bg = -1;
      for (var j = 0; j < GK_KITS.length; j++) {
        var c = GK_KITS[j];
        var s = Math.min(colorDist(c, h.c1), colorDist(c, a.c1));
        if (g === 1) s = Math.min(s, colorDist(c, gk[0]));
        if (s > bg) { bg = s; bestG = c; }
      }
      gk[g] = bestG;
    }
    return { home: h, away: a, gk: gk };
  }

  NS.Teams = {
    matchKits: matchKits,
    CATEGORIES: CATEGORIES,
    TEAMS: TEAMS,
    byCategory: function (catId) {
      var out = [];
      for (var i = 0; i < TEAMS.length; i++) if (TEAMS[i].cat === catId) out.push(TEAMS[i]);
      return out;
    },
    byId: function (id) {
      for (var i = 0; i < TEAMS.length; i++) if (TEAMS[i].id === id) return TEAMS[i];
      return TEAMS[0];
    }
  };
})(window.RS6 = window.RS6 || {});
