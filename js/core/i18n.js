/* Texts in en / fr / es / ar. The language comes from My PC (info.lang); anything missing falls back to English. */
(function (NS) {
  'use strict';

  var D = {};

  D.en = {
    'app.sub': 'My PC Smart TV Edition',
    'stat.wins': 'WINS', 'stat.cups': 'CUPS', 'stat.goals': 'GOALS',
    'step.main': 'MAIN MENU', 'step.sides': 'CONTROLLER SIDES', 'step.teams': 'SELECT TEAMS', 'step.gameplan': 'GAME PLAN & SUBS',
    'step.pause': 'PAUSED', 'step.settings': 'SETTINGS', 'step.help': 'CONTROLS',
    'mode.EXHIBITION': 'EXHIBITION', 'mode.EXHIBITION.tag': 'Quick kickoff',
    'mode.EXHIBITION.d': 'Play 1P vs CPU, 2P local derby, co-op or watch the CPUs on 100+ clubs and national sides.',
    'mode.CONTINENTAL_CUP': 'CONTINENTAL CUPS', 'mode.CONTINENTAL_CUP.tag': 'Knockout glory',
    'mode.CONTINENTAL_CUP.d': 'Pick top continental clubs from Europe, Africa, South America, Asia and North America.',
    'mode.DOMESTIC_LEAGUE': 'LEAGUE SEASON', 'mode.DOMESTIC_LEAGUE.tag': '4 major leagues',
    'mode.DOMESTIC_LEAGUE.d': 'Botola Pro (Morocco), La Liga, Premier League and Bundesliga clubs.',
    'mode.WORLD_NATIONALS': 'WORLD NATIONS', 'mode.WORLD_NATIONALS.tag': '50 national teams',
    'mode.WORLD_NATIONALS.d': 'Ten top national squads from Africa, Europe, the Americas and Asia.',
    'mode.settings': 'SETTINGS', 'mode.settings.tag': 'Configuration',
    'mode.settings.d': 'Difficulty, match length, pace, camera, player switching, graphics, sound and HUD.',
    'mode.help': 'CONTROLS', 'mode.help.tag': 'How to play',
    'mode.help.d': 'Pass, through ball, long ball, shot, dribble, tackle, press and player switch.',
    'sides.title': 'Select controller sides', 'sides.sub': 'Assign player 1 and player 2 (same screen) to Home, Away or the CPU',
    'sides.home': 'HOME SIDE', 'sides.away': 'AWAY SIDE', 'sides.team1': 'TEAM 1', 'sides.team2': 'TEAM 2',
    'sides.presets': 'CONTROLLER PRESETS',
    'preset.1P_CPU': 'P1 (Home) vs CPU (Away)', 'preset.1P_2P': 'P1 (Home) vs P2 (Away)',
    'preset.COOP_CPU': 'P1 + P2 co-op (Home) vs CPU', 'preset.CPU_CPU': 'CPU vs CPU (watch)',
    'slot.empty': 'Empty slot', 'slot.p1': 'P1 CONTROLLER', 'slot.p2local': 'P2 CONTROLLER', 'slot.p1cap': 'P1 CAPTAIN',
    'slot.p2coop': 'P2 CO-OP PARTNER', 'slot.cpu': 'CPU AI', 'slot.cpuhome': 'CPU AI (HOME)', 'slot.cpuaway': 'CPU AI (AWAY)',
    'nav.back': '← Back', 'nav.back_sides': '← Back to sides', 'nav.next_teams': 'Next: select teams →',
    'nav.next_plan': 'Next: game plan →', 'nav.apply_sides': '✓ Apply and return to pause',
    'nav.kickoff': 'Kick off!', 'nav.resume': 'Resume match',
    'teams.home': 'HOME TEAM', 'teams.away': 'AWAY TEAM',
    'gp.editing': 'SQUAD:', 'gp.home': 'HOME', 'gp.away': 'AWAY', 'gp.formation': 'FORMATION:',
    'gp.hint': 'Select a starter, then a substitute to swap them.',
    'gp.starters': 'STARTING LINE-UP', 'gp.bench': 'BENCH', 'gp.sub': 'SUB', 'gp.swap': 'SWAP', 'gp.ready': 'READY',
    'pause.tag': 'MATCH PAUSED',
    'pause.resume': 'Resume match', 'pause.resume.d': 'Back to the pitch',
    'pause.plan': 'Game plan / subs', 'pause.plan.d': 'Formation and substitutions',
    'pause.settings': 'Settings', 'pause.settings.d': 'Difficulty, camera, player switch, sound',
    'pause.sides': 'Controller sides', 'pause.sides.d': '1P, 2P or CPU',
    'pause.controls': 'Controls', 'pause.controls.d': 'How to pass, shoot, tackle and press',
    'pause.restart': 'Restart kickoff', 'pause.restart.d': 'Reset score and clock',
    'pause.quit': 'Abandon match', 'pause.quit.d': 'Back to the main menu',
    'set.difficulty': 'AI difficulty', 'set.difficulty.h': 'CPU speed, tackling and goalkeeper',
    'set.duration': 'Match length', 'set.duration.h': 'Real minutes per match',
    'set.pace': 'Game pace', 'set.pace.h': 'Overall speed of play',
    'set.switch': 'Player switch', 'set.switch.h': 'AUTO picks the player nearest the ball, MANUAL only with the switch button',
    'set.camera': 'Camera angle', 'set.camera.h': 'Dynamic, wide TV or blimp view',
    'set.quality': 'Graphics quality', 'set.quality.h': 'AUTO keeps the frame rate smooth on the TV',
    'set.sound': 'Sound effects', 'set.sound.h': 'Kick, whistle and goal cheer',
    'set.radar': 'Pitch radar', 'set.radar.h': 'Mini map at the bottom',
    'set.ball': 'Ball', 'set.ball.h': 'Design of the match ball',
    'opt.ball.classic': 'CLASSIC', 'opt.ball.pro': 'PRO', 'opt.ball.night': 'NIGHT', 'opt.ball.retro': 'RETRO', 'opt.ball.gold': 'GOLD',
    'set.fps': 'FPS overlay', 'set.fps.h': 'Frame rate and quality badge',
    'set.reset': 'Reset defaults', 'set.done': '✓ Save and return',
    'opt.easy': 'EASY', 'opt.normal': 'NORMAL', 'opt.hard': 'PRO', 'opt.legend': 'LEGEND',
    'opt.min3': '3 MIN', 'opt.min5': '5 MIN', 'opt.min10': '10 MIN', 'opt.slow': 'SLOW', 'opt.fast': 'FAST',
    'opt.auto': 'AUTO', 'opt.manual': 'MANUAL', 'opt.dynamic': 'DYNAMIC', 'opt.wide': 'WIDE TV', 'opt.blimp': 'BLIMP',
    'opt.low': 'LOW', 'opt.med': 'MED', 'opt.high': 'HIGH', 'opt.on': 'ON', 'opt.off': 'OFF', 'opt.show': 'SHOW', 'opt.hide': 'HIDE',
    'hud.goal': 'GOAL!', 'hud.fulltime': 'FULL TIME', 'hud.halftime': 'HALF TIME', 'hud.p1': 'PLAYER 1', 'hud.p2': 'PLAYER 2', 'hud.cpu': 'CPU',
    'hud.hint': 'OK: pass • hold: through / long / shot • no ball: OK tackle or switch, hold OK press',
    'act.pass': 'PASS', 'act.through': 'THROUGH', 'act.long': 'LONG BALL', 'act.shoot': 'SHOT',
    'comp.EXHIBITION': 'EXHIBITION', 'comp.CONTINENTAL_CUP': 'CONT. CUP', 'comp.DOMESTIC_LEAGUE': 'LEAGUE', 'comp.WORLD_NATIONALS': 'NATIONS',
    'help.attack': 'WITH THE BALL',
    'help.a1': 'Move: arrows / stick. The ball stays at your feet: that is your dribble.',
    'help.a2': 'OK (tap): short pass to the team-mate in the direction you hold.',
    'help.a3': 'OK (hold a little): through ball into space.',
    'help.a4': 'OK (hold longer): long lobbed ball.',
    'help.a5': 'OK (hold longest): shot, the power bar fills; steer up / down to aim.',
    'help.a6': 'RUN + OK: instant shot. RUN alone: dribble sprint with tight ball control.',
    'help.a7': 'Double-tap a direction: sprint burst.',
    'help.defense': 'WITHOUT THE BALL',
    'help.d1': 'OK (tap): tackle the ball carrier when close, otherwise switch to the player nearest the ball.',
    'help.d2': 'OK (hold): press the ball carrier, team-mates close in too.',
    'help.d3': 'RUN: sprint. CANCEL: switch player.',
    'help.d4': 'Settings > Player switch: AUTO follows the ball, MANUAL changes only with the switch button.',
    'help.general': 'GENERAL',
    'help.g1': 'TV remote Back opens the My PC menu (game plan, settings, restart). Hold CANCEL or press Start to open the game menu.',
    'help.g2': 'Player 2: second keyboard (W A S D + F G) or a second gamepad.',
    'help.g3': 'Keyboard: arrows, Enter / Space / Z = OK, Shift / X = RUN, Backspace = CANCEL, Esc / P = pause.',
    'mypc.plan': 'Game plan / subs', 'mypc.settings': 'Settings', 'mypc.sides': 'Controller sides', 'mypc.controls': 'Controls',
    'mypc.restart': 'Restart kickoff', 'mypc.abandon': 'Abandon match'
  };

  D.fr = {
    'app.sub': 'Edition My PC Smart TV',
    'stat.wins': 'VICTOIRES', 'stat.cups': 'COUPES', 'stat.goals': 'BUTS',
    'step.main': 'MENU PRINCIPAL', 'step.sides': 'MANETTES', 'step.teams': 'CHOIX DES EQUIPES', 'step.gameplan': 'TACTIQUE ET REMPLACEMENTS',
    'step.pause': 'PAUSE', 'step.settings': 'REGLAGES', 'step.help': 'COMMANDES',
    'mode.EXHIBITION': 'MATCH AMICAL', 'mode.EXHIBITION.tag': 'Coup d’envoi rapide',
    'mode.EXHIBITION.d': 'J1 contre CPU, derby a 2, coop ou regardez les CPU avec plus de 100 clubs et selections.',
    'mode.CONTINENTAL_CUP': 'COUPES CONTINENTALES', 'mode.CONTINENTAL_CUP.tag': 'Gloire a elimination',
    'mode.CONTINENTAL_CUP.d': 'Choisissez de grands clubs d’Europe, d’Afrique, d’Amerique et d’Asie.',
    'mode.DOMESTIC_LEAGUE': 'SAISON DE LIGUE', 'mode.DOMESTIC_LEAGUE.tag': '4 grands championnats',
    'mode.DOMESTIC_LEAGUE.d': 'Botola Pro (Maroc), Liga, Premier League et Bundesliga.',
    'mode.WORLD_NATIONALS': 'SELECTIONS DU MONDE', 'mode.WORLD_NATIONALS.tag': '50 selections',
    'mode.WORLD_NATIONALS.d': 'Dix grandes selections d’Afrique, d’Europe, des Ameriques et d’Asie.',
    'mode.settings': 'REGLAGES', 'mode.settings.tag': 'Configuration',
    'mode.settings.d': 'Difficulte, duree, rythme, camera, changement de joueur, graphismes, son et affichage.',
    'mode.help': 'COMMANDES', 'mode.help.tag': 'Comment jouer',
    'mode.help.d': 'Passe, passe en profondeur, long ballon, tir, dribble, tacle, pressing et changement de joueur.',
    'sides.title': 'Choix des manettes', 'sides.sub': 'Attribuez le joueur 1 et le joueur 2 (meme ecran) a Domicile, Exterieur ou au CPU',
    'sides.home': 'DOMICILE', 'sides.away': 'EXTERIEUR', 'sides.team1': 'EQUIPE 1', 'sides.team2': 'EQUIPE 2',
    'sides.presets': 'PRESETS',
    'preset.1P_CPU': 'J1 (Dom.) contre CPU (Ext.)', 'preset.1P_2P': 'J1 (Dom.) contre J2 (Ext.)',
    'preset.COOP_CPU': 'J1 + J2 coop (Dom.) contre CPU', 'preset.CPU_CPU': 'CPU contre CPU (spectateur)',
    'slot.empty': 'Place libre', 'slot.p1': 'MANETTE J1', 'slot.p2local': 'MANETTE J2', 'slot.p1cap': 'CAPITAINE J1',
    'slot.p2coop': 'PARTENAIRE J2', 'slot.cpu': 'IA CPU', 'slot.cpuhome': 'IA CPU (DOM.)', 'slot.cpuaway': 'IA CPU (EXT.)',
    'nav.back': '← Retour', 'nav.back_sides': '← Retour aux manettes', 'nav.next_teams': 'Suite : equipes →',
    'nav.next_plan': 'Suite : tactique →', 'nav.apply_sides': '✓ Valider et revenir a la pause',
    'nav.kickoff': 'Coup d’envoi !', 'nav.resume': 'Reprendre le match',
    'teams.home': 'EQUIPE DOMICILE', 'teams.away': 'EQUIPE EXTERIEUR',
    'gp.editing': 'EFFECTIF :', 'gp.home': 'DOMICILE', 'gp.away': 'EXTERIEUR', 'gp.formation': 'SYSTEME :',
    'gp.hint': 'Choisissez un titulaire, puis un remplacant pour les echanger.',
    'gp.starters': 'TITULAIRES', 'gp.bench': 'REMPLACANTS', 'gp.sub': 'REMP', 'gp.swap': 'ECHANGER', 'gp.ready': 'PRET',
    'pause.tag': 'MATCH EN PAUSE',
    'pause.resume': 'Reprendre', 'pause.resume.d': 'Retour sur le terrain',
    'pause.plan': 'Tactique / remplacements', 'pause.plan.d': 'Systeme et remplacements',
    'pause.settings': 'Reglages', 'pause.settings.d': 'Difficulte, camera, changement de joueur, son',
    'pause.sides': 'Manettes', 'pause.sides.d': '1J, 2J ou CPU',
    'pause.controls': 'Commandes', 'pause.controls.d': 'Passer, tirer, tacler et presser',
    'pause.restart': 'Recommencer', 'pause.restart.d': 'Score et chrono a zero',
    'pause.quit': 'Abandonner', 'pause.quit.d': 'Retour au menu principal',
    'set.difficulty': 'Difficulte de l’IA', 'set.difficulty.h': 'Vitesse du CPU, tacles et gardien',
    'set.duration': 'Duree du match', 'set.duration.h': 'Minutes reelles par match',
    'set.pace': 'Rythme de jeu', 'set.pace.h': 'Vitesse generale du jeu',
    'set.switch': 'Changement de joueur', 'set.switch.h': 'AUTO choisit le joueur le plus proche du ballon, MANUEL uniquement avec le bouton',
    'set.camera': 'Angle de camera', 'set.camera.h': 'Dynamique, TV large ou dirigeable',
    'set.quality': 'Qualite graphique', 'set.quality.h': 'AUTO garde une image fluide sur la TV',
    'set.sound': 'Effets sonores', 'set.sound.h': 'Frappe, sifflet et cri de but',
    'set.radar': 'Radar du terrain', 'set.radar.h': 'Mini carte en bas',
    'set.ball': 'Ballon', 'set.ball.h': 'Design du ballon du match',
    'opt.ball.classic': 'CLASSIQUE', 'opt.ball.pro': 'PRO', 'opt.ball.night': 'NUIT', 'opt.ball.retro': 'RETRO', 'opt.ball.gold': 'OR',
    'set.fps': 'Affichage FPS', 'set.fps.h': 'Images par seconde et qualite',
    'set.reset': 'Valeurs par defaut', 'set.done': '✓ Enregistrer et revenir',
    'opt.easy': 'FACILE', 'opt.normal': 'NORMAL', 'opt.hard': 'PRO', 'opt.legend': 'LEGENDE',
    'opt.min3': '3 MIN', 'opt.min5': '5 MIN', 'opt.min10': '10 MIN', 'opt.slow': 'LENT', 'opt.fast': 'RAPIDE',
    'opt.auto': 'AUTO', 'opt.manual': 'MANUEL', 'opt.dynamic': 'DYNAMIQUE', 'opt.wide': 'TV LARGE', 'opt.blimp': 'DIRIGEABLE',
    'opt.low': 'BAS', 'opt.med': 'MOY', 'opt.high': 'HAUT', 'opt.on': 'OUI', 'opt.off': 'NON', 'opt.show': 'AFFICHER', 'opt.hide': 'MASQUER',
    'hud.goal': 'BUT !', 'hud.fulltime': 'FIN DU MATCH', 'hud.halftime': 'MI-TEMPS', 'hud.p1': 'JOUEUR 1', 'hud.p2': 'JOUEUR 2', 'hud.cpu': 'CPU',
    'hud.hint': 'OK : passe • maintenir : profondeur / long / tir • sans ballon : OK tacle ou change, maintenir OK presse',
    'act.pass': 'PASSE', 'act.through': 'PROFONDEUR', 'act.long': 'LONG BALLON', 'act.shoot': 'TIR',
    'comp.EXHIBITION': 'AMICAL', 'comp.CONTINENTAL_CUP': 'COUPE CONT.', 'comp.DOMESTIC_LEAGUE': 'CHAMPIONNAT', 'comp.WORLD_NATIONALS': 'SELECTIONS',
    'help.attack': 'AVEC LE BALLON',
    'help.a1': 'Deplacement : fleches / stick. Le ballon reste au pied : c’est votre dribble.',
    'help.a2': 'OK (appui court) : passe courte vers le coequipier dans la direction tenue.',
    'help.a3': 'OK (maintenir un peu) : passe en profondeur dans l’espace.',
    'help.a4': 'OK (maintenir plus) : long ballon lobe.',
    'help.a5': 'OK (maintenir longtemps) : tir, la jauge se remplit ; haut / bas pour viser.',
    'help.a6': 'COURSE + OK : tir immediat. COURSE seul : dribble en vitesse avec ballon colle.',
    'help.a7': 'Double appui sur une direction : acceleration.',
    'help.defense': 'SANS LE BALLON',
    'help.d1': 'OK (appui court) : tacle du porteur s’il est proche, sinon change de joueur.',
    'help.d2': 'OK (maintenir) : pressing sur le porteur, les coequipiers viennent aider.',
    'help.d3': 'COURSE : sprint. ANNULER : changer de joueur.',
    'help.d4': 'Reglages > Changement de joueur : AUTO suit le ballon, MANUEL uniquement avec le bouton.',
    'help.general': 'GENERAL',
    'help.g1': 'Retour de la telecommande : menu My PC (tactique, reglages, recommencer). Maintenir ANNULER ou Start : menu du jeu.',
    'help.g2': 'Joueur 2 : second clavier (W A S D + F G) ou seconde manette.',
    'help.g3': 'Clavier : fleches, Entree / Espace / Z = OK, Maj / X = COURSE, Retour arriere = ANNULER, Echap / P = pause.',
    'mypc.plan': 'Tactique / remplacements', 'mypc.settings': 'Reglages', 'mypc.sides': 'Manettes', 'mypc.controls': 'Commandes',
    'mypc.restart': 'Recommencer', 'mypc.abandon': 'Abandonner'
  };

  D.es = {
    'app.sub': 'Edicion My PC Smart TV',
    'stat.wins': 'VICTORIAS', 'stat.cups': 'COPAS', 'stat.goals': 'GOLES',
    'step.main': 'MENU PRINCIPAL', 'step.sides': 'MANDOS', 'step.teams': 'ELEGIR EQUIPOS', 'step.gameplan': 'TACTICA Y CAMBIOS',
    'step.pause': 'PAUSA', 'step.settings': 'AJUSTES', 'step.help': 'CONTROLES',
    'mode.EXHIBITION': 'AMISTOSO', 'mode.EXHIBITION.tag': 'Saque rapido',
    'mode.EXHIBITION.d': 'J1 contra CPU, derbi para 2, cooperativo o mira a la CPU con mas de 100 clubes y selecciones.',
    'mode.CONTINENTAL_CUP': 'COPAS CONTINENTALES', 'mode.CONTINENTAL_CUP.tag': 'Gloria eliminatoria',
    'mode.CONTINENTAL_CUP.d': 'Elige grandes clubes de Europa, Africa, America y Asia.',
    'mode.DOMESTIC_LEAGUE': 'TEMPORADA DE LIGA', 'mode.DOMESTIC_LEAGUE.tag': '4 grandes ligas',
    'mode.DOMESTIC_LEAGUE.d': 'Botola Pro (Marruecos), La Liga, Premier League y Bundesliga.',
    'mode.WORLD_NATIONALS': 'SELECCIONES DEL MUNDO', 'mode.WORLD_NATIONALS.tag': '50 selecciones',
    'mode.WORLD_NATIONALS.d': 'Diez grandes selecciones de Africa, Europa, America y Asia.',
    'mode.settings': 'AJUSTES', 'mode.settings.tag': 'Configuracion',
    'mode.settings.d': 'Dificultad, duracion, ritmo, camara, cambio de jugador, graficos, sonido e interfaz.',
    'mode.help': 'CONTROLES', 'mode.help.tag': 'Como jugar',
    'mode.help.d': 'Pase, pase al hueco, balon largo, tiro, regate, entrada, presion y cambio de jugador.',
    'sides.title': 'Elegir mandos', 'sides.sub': 'Asigna al jugador 1 y 2 (misma pantalla) a Local, Visitante o CPU',
    'sides.home': 'LOCAL', 'sides.away': 'VISITANTE', 'sides.team1': 'EQUIPO 1', 'sides.team2': 'EQUIPO 2',
    'sides.presets': 'PRESETS',
    'preset.1P_CPU': 'J1 (Local) contra CPU (Visit.)', 'preset.1P_2P': 'J1 (Local) contra J2 (Visit.)',
    'preset.COOP_CPU': 'J1 + J2 coop (Local) contra CPU', 'preset.CPU_CPU': 'CPU contra CPU (espectador)',
    'slot.empty': 'Hueco libre', 'slot.p1': 'MANDO J1', 'slot.p2local': 'MANDO J2', 'slot.p1cap': 'CAPITAN J1',
    'slot.p2coop': 'COMPANERO J2', 'slot.cpu': 'IA CPU', 'slot.cpuhome': 'IA CPU (LOCAL)', 'slot.cpuaway': 'IA CPU (VISIT.)',
    'nav.back': '← Atras', 'nav.back_sides': '← Volver a mandos', 'nav.next_teams': 'Siguiente: equipos →',
    'nav.next_plan': 'Siguiente: tactica →', 'nav.apply_sides': '✓ Aplicar y volver a pausa',
    'nav.kickoff': '¡Saque inicial!', 'nav.resume': 'Reanudar partido',
    'teams.home': 'EQUIPO LOCAL', 'teams.away': 'EQUIPO VISITANTE',
    'gp.editing': 'PLANTILLA:', 'gp.home': 'LOCAL', 'gp.away': 'VISITANTE', 'gp.formation': 'SISTEMA:',
    'gp.hint': 'Elige un titular y luego un suplente para cambiarlos.',
    'gp.starters': 'ONCE INICIAL', 'gp.bench': 'BANQUILLO', 'gp.sub': 'SUP', 'gp.swap': 'CAMBIAR', 'gp.ready': 'LISTO',
    'pause.tag': 'PARTIDO EN PAUSA',
    'pause.resume': 'Reanudar', 'pause.resume.d': 'Volver al campo',
    'pause.plan': 'Tactica / cambios', 'pause.plan.d': 'Sistema y sustituciones',
    'pause.settings': 'Ajustes', 'pause.settings.d': 'Dificultad, camara, cambio de jugador, sonido',
    'pause.sides': 'Mandos', 'pause.sides.d': '1J, 2J o CPU',
    'pause.controls': 'Controles', 'pause.controls.d': 'Pasar, tirar, entrar y presionar',
    'pause.restart': 'Reiniciar saque', 'pause.restart.d': 'Marcador y reloj a cero',
    'pause.quit': 'Abandonar', 'pause.quit.d': 'Volver al menu principal',
    'set.difficulty': 'Dificultad de la IA', 'set.difficulty.h': 'Velocidad de la CPU, entradas y portero',
    'set.duration': 'Duracion del partido', 'set.duration.h': 'Minutos reales por partido',
    'set.pace': 'Ritmo de juego', 'set.pace.h': 'Velocidad general',
    'set.switch': 'Cambio de jugador', 'set.switch.h': 'AUTO elige al mas cercano al balon, MANUAL solo con el boton',
    'set.camera': 'Angulo de camara', 'set.camera.h': 'Dinamica, TV amplia o dirigible',
    'set.quality': 'Calidad grafica', 'set.quality.h': 'AUTO mantiene la imagen fluida en la TV',
    'set.sound': 'Efectos de sonido', 'set.sound.h': 'Golpeo, silbato y gol',
    'set.radar': 'Radar del campo', 'set.radar.h': 'Minimapa inferior',
    'set.ball': 'Balón', 'set.ball.h': 'Diseño del balón del partido',
    'opt.ball.classic': 'CLÁSICO', 'opt.ball.pro': 'PRO', 'opt.ball.night': 'NOCHE', 'opt.ball.retro': 'RETRO', 'opt.ball.gold': 'ORO',
    'set.fps': 'Indicador FPS', 'set.fps.h': 'Fotogramas y calidad',
    'set.reset': 'Valores por defecto', 'set.done': '✓ Guardar y volver',
    'opt.easy': 'FACIL', 'opt.normal': 'NORMAL', 'opt.hard': 'PRO', 'opt.legend': 'LEYENDA',
    'opt.min3': '3 MIN', 'opt.min5': '5 MIN', 'opt.min10': '10 MIN', 'opt.slow': 'LENTO', 'opt.fast': 'RAPIDO',
    'opt.auto': 'AUTO', 'opt.manual': 'MANUAL', 'opt.dynamic': 'DINAMICA', 'opt.wide': 'TV AMPLIA', 'opt.blimp': 'DIRIGIBLE',
    'opt.low': 'BAJA', 'opt.med': 'MEDIA', 'opt.high': 'ALTA', 'opt.on': 'SI', 'opt.off': 'NO', 'opt.show': 'VER', 'opt.hide': 'OCULTAR',
    'hud.goal': '¡GOL!', 'hud.fulltime': 'FINAL', 'hud.halftime': 'DESCANSO', 'hud.p1': 'JUGADOR 1', 'hud.p2': 'JUGADOR 2', 'hud.cpu': 'CPU',
    'hud.hint': 'OK: pase • mantener: al hueco / largo / tiro • sin balon: OK entrada o cambio, mantener OK presion',
    'act.pass': 'PASE', 'act.through': 'AL HUECO', 'act.long': 'BALON LARGO', 'act.shoot': 'TIRO',
    'comp.EXHIBITION': 'AMISTOSO', 'comp.CONTINENTAL_CUP': 'COPA CONT.', 'comp.DOMESTIC_LEAGUE': 'LIGA', 'comp.WORLD_NATIONALS': 'SELECCIONES',
    'help.attack': 'CON EL BALON',
    'help.a1': 'Mover: flechas / stick. El balon va pegado al pie: ese es tu regate.',
    'help.a2': 'OK (toque): pase corto al companero en la direccion que mantienes.',
    'help.a3': 'OK (mantener poco): pase al hueco.',
    'help.a4': 'OK (mantener mas): balon largo por alto.',
    'help.a5': 'OK (mantener mucho): tiro, la barra se llena; arriba / abajo para apuntar.',
    'help.a6': 'CORRER + OK: tiro inmediato. CORRER solo: regate en carrera con balon pegado.',
    'help.a7': 'Doble toque en una direccion: arrancada de velocidad.',
    'help.defense': 'SIN EL BALON',
    'help.d1': 'OK (toque): entrada al que lleva el balon si esta cerca, si no cambia de jugador.',
    'help.d2': 'OK (mantener): presiona al que lleva el balon, los companeros ayudan.',
    'help.d3': 'CORRER: sprint. CANCELAR: cambiar de jugador.',
    'help.d4': 'Ajustes > Cambio de jugador: AUTO sigue el balon, MANUAL solo con el boton.',
    'help.general': 'GENERAL',
    'help.g1': 'Atras del mando de la TV abre el menu My PC (tactica, ajustes, reiniciar). Mantener CANCELAR o pulsar Start: menu del juego.',
    'help.g2': 'Jugador 2: segundo teclado (W A S D + F G) o segundo mando.',
    'help.g3': 'Teclado: flechas, Intro / Espacio / Z = OK, Mayus / X = CORRER, Retroceso = CANCELAR, Esc / P = pausa.',
    'mypc.plan': 'Tactica / cambios', 'mypc.settings': 'Ajustes', 'mypc.sides': 'Mandos', 'mypc.controls': 'Controles',
    'mypc.restart': 'Reiniciar saque', 'mypc.abandon': 'Abandonar'
  };

  D.ar = {
    'app.sub': 'نسخة My PC للتلفاز الذكي',
    'stat.wins': 'انتصارات', 'stat.cups': 'كأس', 'stat.goals': 'أهداف',
    'step.main': 'القائمة الرئيسية', 'step.sides': 'الأذرع', 'step.teams': 'اختيار الفرق',
    'step.gameplan': 'الخطة والتبديلات', 'step.pause': 'إيقاف مؤقت', 'step.settings': 'الإعدادات', 'step.help': 'التحكم',
    'mode.EXHIBITION': 'مباراة ودية', 'mode.EXHIBITION.tag': 'بداية سريعة',
    'mode.EXHIBITION.d': 'لاعب ضد الكمبيوتر أو لاعبان معًا أو شاهد أكثر من 100 نادٍ ومنتخب.',
    'mode.CONTINENTAL_CUP': 'الكأس القارية', 'mode.CONTINENTAL_CUP.tag': 'مجد الإقصاء',
    'mode.CONTINENTAL_CUP.d': 'اختر أبرز الأندية من أوروبا وأفريقيا والأمريكتين وآسيا.',
    'mode.DOMESTIC_LEAGUE': 'موسم الدوري', 'mode.DOMESTIC_LEAGUE.tag': '4 دوريات كبرى',
    'mode.DOMESTIC_LEAGUE.d': 'البطولة المغربية ولا ليغا والدوري الإنجليزي والبوندسليغا.',
    'mode.WORLD_NATIONALS': 'منتخبات العالم', 'mode.WORLD_NATIONALS.tag': '50 منتخبًا',
    'mode.WORLD_NATIONALS.d': 'عشرة منتخبات كبرى من أفريقيا وأوروبا والأمريكتين وآسيا.',
    'mode.settings': 'الإعدادات', 'mode.settings.tag': 'التهيئة',
    'mode.settings.d': 'الصعوبة ومدة المباراة والإيقاع والكاميرا وتبديل اللاعب والصوت.',
    'mode.help': 'التحكم', 'mode.help.tag': 'كيف تلعب',
    'mode.help.d': 'تمريرة وتمريرة بينية وكرة طويلة وتسديدة ومراوغة وتدخل وضغط.',
    'sides.title': 'اختيار الأذرع', 'sides.sub': 'وزّع اللاعب 1 واللاعب 2 على صاحب الأرض أو الضيف أو الكمبيوتر',
    'sides.home': 'صاحب الأرض', 'sides.away': 'الضيف', 'sides.team1': 'الفريق 1', 'sides.team2': 'الفريق 2',
    'sides.presets': 'خيارات جاهزة',
    'preset.1P_CPU': 'لاعب 1 ضد الكمبيوتر', 'preset.1P_2P': 'لاعب 1 ضد لاعب 2',
    'preset.COOP_CPU': 'لاعبان معًا ضد الكمبيوتر', 'preset.CPU_CPU': 'كمبيوتر ضد كمبيوتر (مشاهدة)',
    'slot.empty': 'مكان فارغ', 'slot.p1': 'ذراع اللاعب 1', 'slot.p2local': 'ذراع اللاعب 2', 'slot.p1cap': 'قائد اللاعب 1',
    'slot.p2coop': 'شريك اللاعب 2', 'slot.cpu': 'ذكاء الكمبيوتر', 'slot.cpuhome': 'الكمبيوتر (صاحب الأرض)', 'slot.cpuaway': 'الكمبيوتر (الضيف)',
    'nav.back': 'رجوع →', 'nav.back_sides': 'رجوع إلى الأذرع →', 'nav.next_teams': '← التالي: الفرق',
    'nav.next_plan': '← التالي: الخطة', 'nav.apply_sides': '✓ تطبيق والعودة للإيقاف',
    'nav.kickoff': 'ابدأ المباراة!', 'nav.resume': 'متابعة المباراة',
    'teams.home': 'صاحب الأرض', 'teams.away': 'الضيف',
    'gp.editing': 'التشكيلة:', 'gp.home': 'صاحب الأرض', 'gp.away': 'الضيف', 'gp.formation': 'الخطة:',
    'gp.hint': 'اختر أساسيًا ثم بديلًا لتبديلهما.',
    'gp.starters': 'التشكيلة الأساسية', 'gp.bench': 'الاحتياط', 'gp.sub': 'بديل', 'gp.swap': 'تبديل', 'gp.ready': 'جاهز',
    'pause.tag': 'المباراة متوقفة',
    'pause.resume': 'متابعة', 'pause.resume.d': 'العودة إلى الملعب',
    'pause.plan': 'الخطة والتبديلات', 'pause.plan.d': 'التشكيل والتغييرات',
    'pause.settings': 'الإعدادات', 'pause.settings.d': 'الصعوبة والكاميرا وتبديل اللاعب والصوت',
    'pause.sides': 'الأذرع', 'pause.sides.d': 'لاعب أو لاعبان أو كمبيوتر',
    'pause.controls': 'التحكم', 'pause.controls.d': 'التمرير والتسديد والتدخل والضغط',
    'pause.restart': 'إعادة البداية', 'pause.restart.d': 'تصفير النتيجة والوقت',
    'pause.quit': 'انسحاب', 'pause.quit.d': 'العودة إلى القائمة الرئيسية',
    'set.difficulty': 'صعوبة الذكاء', 'set.difficulty.h': 'سرعة الكمبيوتر والتدخل والحارس',
    'set.duration': 'مدة المباراة', 'set.duration.h': 'دقائق حقيقية لكل مباراة',
    'set.pace': 'إيقاع اللعب', 'set.pace.h': 'السرعة العامة',
    'set.switch': 'تبديل اللاعب', 'set.switch.h': 'تلقائي يختار الأقرب للكرة، يدوي بالزر فقط',
    'set.camera': 'زاوية الكاميرا', 'set.camera.h': 'ديناميكية أو تلفزيونية أو مناظيرية',
    'set.quality': 'جودة الرسوم', 'set.quality.h': 'تلقائي يحافظ على سلاسة الصورة',
    'set.sound': 'المؤثرات الصوتية', 'set.sound.h': 'الركلة والصافرة والهدف',
    'set.radar': 'رادار الملعب', 'set.radar.h': 'خريطة صغيرة أسفل الشاشة',
    'set.ball': 'الكرة', 'set.ball.h': 'تصميم كرة المباراة',
    'opt.ball.classic': 'كلاسيكية', 'opt.ball.pro': 'احترافية', 'opt.ball.night': 'ليلية', 'opt.ball.retro': 'قديمة', 'opt.ball.gold': 'ذهبية',
    'set.fps': 'عرض FPS', 'set.fps.h': 'معدل الإطارات والجودة',
    'set.reset': 'القيم الافتراضية', 'set.done': '✓ حفظ ورجوع',
    'opt.easy': 'سهل', 'opt.normal': 'عادي', 'opt.hard': 'محترف', 'opt.legend': 'أسطورة',
    'opt.min3': '3 د', 'opt.min5': '5 د', 'opt.min10': '10 د', 'opt.slow': 'بطيء', 'opt.fast': 'سريع',
    'opt.auto': 'تلقائي', 'opt.manual': 'يدوي', 'opt.dynamic': 'ديناميكي', 'opt.wide': 'تلفزيوني', 'opt.blimp': 'مناظيري',
    'opt.low': 'منخفض', 'opt.med': 'متوسط', 'opt.high': 'عالٍ', 'opt.on': 'تشغيل', 'opt.off': 'إيقاف', 'opt.show': 'إظهار', 'opt.hide': 'إخفاء',
    'hud.goal': 'هدف!', 'hud.fulltime': 'نهاية المباراة', 'hud.halftime': 'استراحة الشوطين', 'hud.p1': 'اللاعب 1', 'hud.p2': 'اللاعب 2', 'hud.cpu': 'كمبيوتر',
    'hud.hint': 'OK: تمريرة • اضغط مطولًا: بينية / طويلة / تسديدة • بدون كرة: OK تدخل أو تبديل، اضغط مطولًا ضغط',
    'act.pass': 'تمريرة', 'act.through': 'بينية', 'act.long': 'كرة طويلة', 'act.shoot': 'تسديدة',
    'comp.EXHIBITION': 'ودية', 'comp.CONTINENTAL_CUP': 'كأس قارية', 'comp.DOMESTIC_LEAGUE': 'دوري', 'comp.WORLD_NATIONALS': 'منتخبات',
    'help.attack': 'مع الكرة',
    'help.a1': 'الحركة: الأسهم / العصا. الكرة تبقى عند قدمك: هذه مراوغتك.',
    'help.a2': 'OK (ضغطة قصيرة): تمريرة قصيرة لزميل في الاتجاه المحدد.',
    'help.a3': 'OK (اضغط قليلًا): تمريرة بينية إلى المساحة.',
    'help.a4': 'OK (اضغط أكثر): كرة طويلة مرتفعة.',
    'help.a5': 'OK (اضغط طويلًا): تسديدة، شريط القوة يمتلئ؛ أعلى / أسفل للتصويب.',
    'help.a6': 'الركض + OK: تسديدة فورية. الركض وحده: مراوغة بسرعة مع تحكم محكم بالكرة.',
    'help.a7': 'ضغطتان سريعتان على اتجاه: انطلاقة سريعة.',
    'help.defense': 'بدون كرة',
    'help.d1': 'OK (ضغطة قصيرة): تدخل على حامل الكرة إن كان قريبًا، وإلا تبديل اللاعب.',
    'help.d2': 'OK (اضغط مطولًا): ضغط على حامل الكرة والزملاء يقتربون.',
    'help.d3': 'الركض: انطلاق. إلغاء: تبديل اللاعب.',
    'help.d4': 'الإعدادات > تبديل اللاعب: تلقائي يتبع الكرة، يدوي بالزر فقط.',
    'help.general': 'عام',
    'help.g1': 'زر الرجوع في ريموت التلفاز يفتح قائمة My PC. اضغط إلغاء مطولًا أو Start لفتح قائمة اللعبة.',
    'help.g2': 'اللاعب 2: لوحة مفاتيح ثانية (W A S D + F G) أو ذراع ثانية.',
    'help.g3': 'لوحة المفاتيح: الأسهم، Enter / Space / Z = OK، Shift / X = ركض، Backspace = إلغاء، Esc / P = إيقاف.',
    'mypc.plan': 'الخطة والتبديلات', 'mypc.settings': 'الإعدادات', 'mypc.sides': 'الأذرع', 'mypc.controls': 'التحكم',
    'mypc.restart': 'إعادة البداية', 'mypc.abandon': 'انسحاب'
  };


  // ---- button mapping ----
  Object.assign(D.en, {
    'mv.lowpass': 'Low pass', 'mv.through': 'Through pass', 'mv.long': 'Long pass', 'mv.shoot': 'Shoot', 'mv.curve': 'Curve shot',
    'mv.chip': 'Chip shot', 'mv.onetwo': 'One-two', 'mv.tackle': 'Tackle', 'mv.slide': 'Slide tackle', 'mv.press': 'Press',
    'mv.teampress': 'Team press', 'mv.switch': 'Switch player', 'mv.sprint': 'Sprint / dribble',
    'tier.0': 'tap', 'tier.1': 'hold', 'tier.2': 'hold+', 'tier.3': 'long hold', 'tier.hold': 'hold',
    'btn.jump': 'OK', 'btn.run': 'RUN', 'btn.cancel': 'CANCEL', 'btn.b': 'B',
    'map.unbound': 'not set', 'map.title': 'Button mapping',
    'map.sub': 'Pick an action, then press the real button on your controller or keyboard. Press two buttons together for a combination, hold longer for hold actions.',
    'map.group.move': 'MOVEMENT', 'map.group.att': 'WITH THE BALL', 'map.group.def': 'WITHOUT THE BALL',
    'map.prompt': 'Press the button (or two together) now. Tap it, or hold it for a hold / long-hold action.',
    'map.prompt.sprint': 'Press and hold the button you want for sprint / dribble.',
    'map.waiting': 'Waiting for a button...', 'map.detected': 'Detected:', 'map.conflict': 'unbound, same button',
    'map.reset': 'Reset buttons', 'map.reset.done': 'Default buttons restored.', 'map.clear': 'Unbind selected', 'map.cleared': 'Action unbound.',
    'map.timeout': 'No button detected.',
    'map.note': 'My PC sends OK (A / Enter / Space), RUN (X / Y / Shift) and CANCEL (Backspace). Gamepad B = RUN + CANCEL together.',
    'set.buttons': 'Button mapping', 'step.buttons': 'BUTTON MAPPING',
    'hud.hint': 'OK: pass \u2022 hold OK: through / long / shot \u2022 more moves and your own buttons: Settings > Button mapping'
  });
  Object.assign(D.fr, {
    'mv.lowpass': 'Passe rasante', 'mv.through': 'Passe en profondeur', 'mv.long': 'Longue passe', 'mv.shoot': 'Tir', 'mv.curve': 'Tir enroule',
    'mv.chip': 'Lob', 'mv.onetwo': 'Une-deux', 'mv.tackle': 'Tacle', 'mv.slide': 'Tacle glisse', 'mv.press': 'Pressing',
    'mv.teampress': 'Pressing collectif', 'mv.switch': 'Changer de joueur', 'mv.sprint': 'Sprint / dribble',
    'tier.0': 'appui court', 'tier.1': 'maintenir', 'tier.2': 'maintenir +', 'tier.3': 'maintenir longtemps', 'tier.hold': 'maintenir',
    'btn.jump': 'OK', 'btn.run': 'COURSE', 'btn.cancel': 'ANNULER', 'btn.b': 'B',
    'map.unbound': 'non defini', 'map.title': 'Configuration des boutons',
    'map.sub': 'Choisissez une action, puis appuyez sur le vrai bouton de la manette ou du clavier. Deux boutons ensemble = combinaison, maintenir plus longtemps pour les actions longues.',
    'map.group.move': 'DEPLACEMENT', 'map.group.att': 'AVEC LE BALLON', 'map.group.def': 'SANS LE BALLON',
    'map.prompt': 'Appuyez maintenant sur le bouton (ou deux ensemble). Appui court, ou maintenu pour une action longue.',
    'map.prompt.sprint': 'Appuyez et maintenez le bouton voulu pour le sprint / dribble.',
    'map.waiting': 'En attente d\u2019un bouton...', 'map.detected': 'Detecte :', 'map.conflict': 'retire, meme bouton',
    'map.reset': 'Boutons par defaut', 'map.reset.done': 'Boutons par defaut restaures.', 'map.clear': 'Retirer la selection', 'map.cleared': 'Action retiree.',
    'map.timeout': 'Aucun bouton detecte.',
    'map.note': 'My PC envoie OK (A / Entree / Espace), COURSE (X / Y / Maj) et ANNULER (Retour arriere). Manette B = COURSE + ANNULER ensemble.',
    'set.buttons': 'Configuration des boutons', 'step.buttons': 'BOUTONS',
    'hud.hint': 'OK : passe \u2022 maintenir OK : profondeur / long / tir \u2022 autres actions et boutons : Reglages > Configuration des boutons'
  });
  Object.assign(D.es, {
    'mv.lowpass': 'Pase raso', 'mv.through': 'Pase al hueco', 'mv.long': 'Pase largo', 'mv.shoot': 'Disparo', 'mv.curve': 'Disparo con efecto',
    'mv.chip': 'Vaselina', 'mv.onetwo': 'Pared', 'mv.tackle': 'Entrada', 'mv.slide': 'Entrada deslizante', 'mv.press': 'Presion',
    'mv.teampress': 'Presion del equipo', 'mv.switch': 'Cambiar de jugador', 'mv.sprint': 'Sprint / regate',
    'tier.0': 'toque', 'tier.1': 'mantener', 'tier.2': 'mantener +', 'tier.3': 'mantener mucho', 'tier.hold': 'mantener',
    'btn.jump': 'OK', 'btn.run': 'CORRER', 'btn.cancel': 'CANCELAR', 'btn.b': 'B',
    'map.unbound': 'sin asignar', 'map.title': 'Asignacion de botones',
    'map.sub': 'Elige una accion y pulsa el boton real del mando o teclado. Dos botones juntos = combinacion, mantener mas tiempo para acciones largas.',
    'map.group.move': 'MOVIMIENTO', 'map.group.att': 'CON EL BALON', 'map.group.def': 'SIN EL BALON',
    'map.prompt': 'Pulsa ahora el boton (o dos juntos). Toque, o mantenlo para una accion larga.',
    'map.prompt.sprint': 'Pulsa y mantén el boton que quieres para sprint / regate.',
    'map.waiting': 'Esperando un boton...', 'map.detected': 'Detectado:', 'map.conflict': 'desasignada, mismo boton',
    'map.reset': 'Botones por defecto', 'map.reset.done': 'Botones por defecto restaurados.', 'map.clear': 'Quitar seleccion', 'map.cleared': 'Accion quitada.',
    'map.timeout': 'No se detecto ningun boton.',
    'map.note': 'My PC envia OK (A / Intro / Espacio), CORRER (X / Y / Mayus) y CANCELAR (Retroceso). Mando B = CORRER + CANCELAR juntos.',
    'set.buttons': 'Asignacion de botones', 'step.buttons': 'BOTONES',
    'hud.hint': 'OK: pase \u2022 mantener OK: al hueco / largo / tiro \u2022 mas acciones y tus botones: Ajustes > Asignacion de botones'
  });
  Object.assign(D.ar, {
    'mv.lowpass': 'تمريرة أرضية', 'mv.through': 'تمريرة بينية', 'mv.long': 'تمريرة طويلة', 'mv.shoot': 'تسديد', 'mv.curve': 'تسديدة ملتفة',
    'mv.chip': 'تسديدة ساقطة', 'mv.onetwo': 'تمريرة حائط', 'mv.tackle': 'تدخل', 'mv.slide': 'تدخل انزلاقي', 'mv.press': 'ضغط',
    'mv.teampress': 'ضغط الفريق', 'mv.switch': 'تبديل اللاعب', 'mv.sprint': 'ركض / مراوغة',
    'tier.0': 'ضغطة', 'tier.1': 'إبقاء', 'tier.2': 'إبقاء +', 'tier.3': 'إبقاء طويل', 'tier.hold': 'إبقاء',
    'btn.jump': 'OK', 'btn.run': 'ركض', 'btn.cancel': 'إلغاء', 'btn.b': 'B',
    'map.unbound': 'غير محدد', 'map.title': 'تخصيص الأزرار',
    'map.sub': 'اختر حركة ثم اضغط الزر الحقيقي في ذراع اللعب أو لوحة المفاتيح. زران معًا = تركيبة، والإبقاء أطول للحركات الطويلة.',
    'map.group.move': 'الحركة', 'map.group.att': 'مع الكرة', 'map.group.def': 'بدون كرة',
    'map.prompt': 'اضغط الزر الآن (أو زرين معًا). ضغطة سريعة أو إبقاء للحركة الطويلة.',
    'map.prompt.sprint': 'اضغط مطولًا على الزر المطلوب للركض / المراوغة.',
    'map.waiting': 'بانتظار زر...', 'map.detected': 'تم اكتشاف:', 'map.conflict': 'أُلغيت، نفس الزر',
    'map.reset': 'الأزرار الافتراضية', 'map.reset.done': 'تمت استعادة الأزرار الافتراضية.', 'map.clear': 'إلغاء تحديد الحركة', 'map.cleared': 'تم إلغاء الحركة.',
    'map.timeout': 'لم يتم اكتشاف أي زر.',
    'map.note': 'يرسل My PC الأزرار OK (A / Enter / Space) وركض (X / Y / Shift) وإلغاء (Backspace). الزر B = ركض + إلغاء معًا.',
    'set.buttons': 'تخصيص الأزرار', 'step.buttons': 'الأزرار',
    'hud.hint': 'OK: تمريرة \u2022 إبقاء OK: بينية / طويلة / تسديدة \u2022 المزيد وأزرارك: الإعدادات > تخصيص الأزرار'
  });

  // ---- button mapping v2: remote / keyboard and gamepad sides, every gamepad button, 5 s detection ----
  Object.assign(D.en, {
    'map.kb': 'TV / KB', 'map.pad': 'PAD',
    'map.sub': 'Pick an action, then press the real button. A gamepad button (A B X Y, L R, ZL ZR, L3 R3) sets the PAD side, the remote or keyboard sets the TV / KB side. Two buttons together = a combination, hold longer for hold actions.',
    'map.prompt': 'Press the button (or two together) now. Tap it, or hold it for a hold / long-hold action.',
    'map.countdown': 'Cancels by itself in %s s if nothing is pressed',
    'map.timeout': 'No button detected in 5 seconds: nothing changed.',
    'map.note': 'Buttons are shown with your controller’s own names (Nintendo L R ZL ZR, Xbox LB RB LT RT, PlayStation L1 R1 L2 R2).',
    'map.noraw': 'Press any button on your gamepad once: then every button (A B X Y, L R, ZL ZR, L3 R3) can be mapped on the PAD side.'
  });
  Object.assign(D.fr, {
    'map.kb': 'TV / CLAV', 'map.pad': 'MANETTE',
    'map.sub': 'Choisissez une action puis appuyez sur le vrai bouton. Un bouton de manette (A B X Y, L R, ZL ZR, L3 R3) regle le cote MANETTE, la telecommande ou le clavier le cote TV / CLAV. Deux boutons ensemble = combinaison, maintenir plus longtemps pour les actions longues.',
    'map.prompt': 'Appuyez maintenant sur le bouton (ou deux ensemble). Appui court, ou maintenu pour une action longue.',
    'map.countdown': 'Annulation automatique dans %s s sans appui',
    'map.timeout': 'Aucun bouton detecte en 5 secondes : rien n\u2019a change.',
    'map.note': 'Les boutons portent les noms de votre manette (Nintendo L R ZL ZR, Xbox LB RB LT RT, PlayStation L1 R1 L2 R2).',
    'map.noraw': 'Appuyez une fois sur un bouton de la manette : chaque bouton (A B X Y, L R, ZL ZR, L3 R3) pourra alors etre configure cote MANETTE.'
  });
  Object.assign(D.es, {
    'map.kb': 'TV / TECL', 'map.pad': 'MANDO',
    'map.sub': 'Elige una accion y pulsa el boton real. Un boton del mando (A B X Y, L R, ZL ZR, L3 R3) ajusta el lado MANDO, el mando de la TV o el teclado el lado TV / TECL. Dos botones juntos = combinacion, mantener mas tiempo para acciones largas.',
    'map.prompt': 'Pulsa ahora el boton (o dos juntos). Toque, o mantenlo para una accion larga.',
    'map.countdown': 'Se cancela solo en %s s si no pulsas nada',
    'map.timeout': 'Ningun boton detectado en 5 segundos: no ha cambiado nada.',
    'map.note': 'Los botones llevan los nombres de tu mando (Nintendo L R ZL ZR, Xbox LB RB LT RT, PlayStation L1 R1 L2 R2).',
    'map.noraw': 'Pulsa una vez cualquier boton del mando: despues podras asignar cada boton (A B X Y, L R, ZL ZR, L3 R3) en el lado MANDO.'
  });
  Object.assign(D.ar, {
    'map.kb': 'تلفاز / لوحة', 'map.pad': 'ذراع',
    'map.sub': 'اختر حركة ثم اضغط الزر الحقيقي. زر ذراع اللعب (A B X Y، L R، ZL ZR، L3 R3) يضبط جانب الذراع، والريموت أو لوحة المفاتيح يضبطان جانب التلفاز / اللوحة. زران معًا = تركيبة، والإبقاء أطول للحركات الطويلة.',
    'map.prompt': 'اضغط الزر الآن (أو زرين معًا). ضغطة سريعة أو إبقاء للحركة الطويلة.',
    'map.countdown': 'يُلغى تلقائيًا بعد %s ث إن لم تضغط شيئًا',
    'map.timeout': 'لم يُكتشف أي زر خلال 5 ثوانٍ: لم يتغير شيء.',
    'map.note': 'تظهر الأزرار بأسمائها في ذراعك (Nintendo L R ZL ZR، Xbox LB RB LT RT، PlayStation L1 R1 L2 R2).',
    'map.noraw': 'اضغط أي زر في ذراع اللعب مرة واحدة: بعدها يمكن تخصيص كل زر (A B X Y، L R، ZL ZR، L3 R3).'
  });

  // v1.7: competitions, celebrations, crowd
  Object.assign(D.en, {
    'hud.goalword': 'GOOOAL!', 'hud.owngoal': 'OWN GOAL', 'hud.gk5': 'Keeper: release the ball (%s)',
    'set.chants': 'Crowd chants', 'set.chants.h': 'Songs, claps and drums in the stands',
    'step.comppick': 'PICK YOUR TEAM', 'step.comphub': 'COMPETITION',
    'mode.continue': 'CONTINUE', 'mode.continue.tag': 'Saved competition',
    'mode.CONTINENTAL_CUP': 'CONTINENTAL CUP', 'mode.CONTINENTAL_CUP.tag': '16 clubs, knockout',
    'mode.CONTINENTAL_CUP.d': 'Pick your club: 15 opponents are drawn, then round of 16, quarters, semis and the final.',
    'mode.DOMESTIC_LEAGUE': 'LEAGUE SEASON', 'mode.DOMESTIC_LEAGUE.tag': 'Full season',
    'mode.DOMESTIC_LEAGUE.d': 'Pick your club and play every team of its league once. Top of the table wins the title.',
    'mode.WORLD_NATIONALS': 'WORLD CUP', 'mode.WORLD_NATIONALS.tag': '16 nations',
    'mode.WORLD_NATIONALS.d': 'Pick your nation: four groups of four, the top two go through to the knockout rounds.',
    'cp.team': 'Your team', 'cp.players': 'Players', 'cp.1p': '1 player vs CPU', 'cp.coop': '2 players, same team (co-op)',
    'cp.replace': 'Starting replaces your saved competition.', 'cp.start': 'Start',
    'cp.sub.DOMESTIC_LEAGUE': 'Pick a club: its whole league is your season.',
    'cp.sub.CONTINENTAL_CUP': 'Pick any club: the other 15 are drawn at random.',
    'cp.sub.WORLD_NATIONALS': 'Pick a nation: the other 15 and the groups are drawn at random.',
    'comp.r16': 'ROUND OF 16', 'comp.qf': 'QUARTER-FINAL', 'comp.sf': 'SEMI-FINAL', 'comp.final': 'FINAL',
    'comp.pens': 'pens', 'comp.over': 'FINISHED', 'comp.matchday': 'Matchday', 'comp.group': 'Group',
    'comp.won': 'Victory!', 'comp.lost': 'Defeat.', 'comp.drew': 'Draw.', 'comp.out_groups': 'Out in the group stage.',
    'comp.through': 'Through to the next round!', 'comp.knocked': 'Knocked out.', 'comp.champion': 'CHAMPIONS!',
    'comp.menu': '← Main menu', 'comp.abandon': 'Abandon', 'comp.abandon2': 'Press again to abandon',
    'comp.play': 'Play match', 'comp.new': 'New competition', 'comp.t.team': 'Team', 'comp.t.gd': 'GD',
    'comp.table': 'Table', 'comp.groups': 'Groups', 'comp.bracket': 'Knockout', 'comp.champ_is': 'Winner:',
    'comp.final_word': 'Final result', 'comp.next': 'Next match', 'comp.home': 'Home', 'comp.away': 'Away',
    'comp.results': 'Latest results'
  });
  Object.assign(D.fr, {
    'hud.goalword': 'BUUUT !', 'hud.owngoal': 'CSC', 'hud.gk5': 'Gardien : relâchez le ballon (%s)',
    'set.chants': 'Chants du public', 'set.chants.h': 'Chants, applaudissements et tambours',
    'step.comppick': 'CHOISISSEZ VOTRE EQUIPE', 'step.comphub': 'COMPETITION',
    'mode.continue': 'CONTINUER', 'mode.continue.tag': 'Competition sauvegardee',
    'mode.CONTINENTAL_CUP': 'COUPE CONTINENTALE', 'mode.CONTINENTAL_CUP.tag': '16 clubs, elimination',
    'mode.CONTINENTAL_CUP.d': 'Choisissez votre club : 15 adversaires tires au sort, huitiemes, quarts, demies et finale.',
    'mode.DOMESTIC_LEAGUE': 'SAISON DE LIGUE', 'mode.DOMESTIC_LEAGUE.tag': 'Saison complete',
    'mode.DOMESTIC_LEAGUE.d': 'Choisissez votre club et affrontez chaque equipe de sa ligue. Le premier est champion.',
    'mode.WORLD_NATIONALS': 'COUPE DU MONDE', 'mode.WORLD_NATIONALS.tag': '16 selections',
    'mode.WORLD_NATIONALS.d': 'Choisissez votre selection : quatre groupes de quatre, les deux premiers se qualifient.',
    'cp.team': 'Votre equipe', 'cp.players': 'Joueurs', 'cp.1p': '1 joueur contre CPU', 'cp.coop': '2 joueurs, meme equipe (coop)',
    'cp.replace': 'Commencer remplace votre competition sauvegardee.', 'cp.start': 'Commencer',
    'cp.sub.DOMESTIC_LEAGUE': 'Choisissez un club : toute sa ligue est votre saison.',
    'cp.sub.CONTINENTAL_CUP': 'Choisissez un club : les 15 autres sont tires au sort.',
    'cp.sub.WORLD_NATIONALS': 'Choisissez une selection : les 15 autres et les groupes sont tires au sort.',
    'comp.r16': 'HUITIEME DE FINALE', 'comp.qf': 'QUART DE FINALE', 'comp.sf': 'DEMI-FINALE', 'comp.final': 'FINALE',
    'comp.pens': 'tab', 'comp.over': 'TERMINE', 'comp.matchday': 'Journee', 'comp.group': 'Groupe',
    'comp.won': 'Victoire !', 'comp.lost': 'Defaite.', 'comp.drew': 'Match nul.', 'comp.out_groups': 'Elimine en phase de groupes.',
    'comp.through': 'Qualifie pour le tour suivant !', 'comp.knocked': 'Elimine.', 'comp.champion': 'CHAMPIONS !',
    'comp.menu': '← Menu principal', 'comp.abandon': 'Abandonner', 'comp.abandon2': 'Appuyez encore pour abandonner',
    'comp.play': 'Jouer le match', 'comp.new': 'Nouvelle competition', 'comp.t.team': 'Equipe', 'comp.t.gd': 'Diff',
    'comp.table': 'Classement', 'comp.groups': 'Groupes', 'comp.bracket': 'Phase finale', 'comp.champ_is': 'Vainqueur :',
    'comp.final_word': 'Resultat final', 'comp.next': 'Prochain match', 'comp.home': 'Domicile', 'comp.away': 'Exterieur',
    'comp.results': 'Derniers resultats'
  });
  Object.assign(D.es, {
    'hud.goalword': '¡GOOOL!', 'hud.owngoal': 'EN PROPIA', 'hud.gk5': 'Portero: suelta el balon (%s)',
    'set.chants': 'Canticos', 'set.chants.h': 'Canciones, palmas y bombos en la grada',
    'step.comppick': 'ELIGE TU EQUIPO', 'step.comphub': 'COMPETICION',
    'mode.continue': 'CONTINUAR', 'mode.continue.tag': 'Competicion guardada',
    'mode.CONTINENTAL_CUP': 'COPA CONTINENTAL', 'mode.CONTINENTAL_CUP.tag': '16 clubes, eliminatoria',
    'mode.CONTINENTAL_CUP.d': 'Elige tu club: se sortean 15 rivales, octavos, cuartos, semifinales y final.',
    'mode.DOMESTIC_LEAGUE': 'TEMPORADA DE LIGA', 'mode.DOMESTIC_LEAGUE.tag': 'Temporada completa',
    'mode.DOMESTIC_LEAGUE.d': 'Elige tu club y juega contra cada equipo de su liga. El primero es campeon.',
    'mode.WORLD_NATIONALS': 'COPA DEL MUNDO', 'mode.WORLD_NATIONALS.tag': '16 selecciones',
    'mode.WORLD_NATIONALS.d': 'Elige tu seleccion: cuatro grupos de cuatro, los dos primeros pasan a eliminatorias.',
    'cp.team': 'Tu equipo', 'cp.players': 'Jugadores', 'cp.1p': '1 jugador contra CPU', 'cp.coop': '2 jugadores, mismo equipo (coop)',
    'cp.replace': 'Empezar reemplaza tu competicion guardada.', 'cp.start': 'Empezar',
    'cp.sub.DOMESTIC_LEAGUE': 'Elige un club: toda su liga es tu temporada.',
    'cp.sub.CONTINENTAL_CUP': 'Elige un club: los otros 15 se sortean.',
    'cp.sub.WORLD_NATIONALS': 'Elige una seleccion: las otras 15 y los grupos se sortean.',
    'comp.r16': 'OCTAVOS', 'comp.qf': 'CUARTOS', 'comp.sf': 'SEMIFINAL', 'comp.final': 'FINAL',
    'comp.pens': 'pen', 'comp.over': 'TERMINADA', 'comp.matchday': 'Jornada', 'comp.group': 'Grupo',
    'comp.won': '¡Victoria!', 'comp.lost': 'Derrota.', 'comp.drew': 'Empate.', 'comp.out_groups': 'Eliminado en la fase de grupos.',
    'comp.through': '¡Pasas a la siguiente ronda!', 'comp.knocked': 'Eliminado.', 'comp.champion': '¡CAMPEONES!',
    'comp.menu': '← Menu principal', 'comp.abandon': 'Abandonar', 'comp.abandon2': 'Pulsa otra vez para abandonar',
    'comp.play': 'Jugar partido', 'comp.new': 'Nueva competicion', 'comp.t.team': 'Equipo', 'comp.t.gd': 'DG',
    'comp.table': 'Clasificacion', 'comp.groups': 'Grupos', 'comp.bracket': 'Eliminatorias', 'comp.champ_is': 'Ganador:',
    'comp.final_word': 'Resultado final', 'comp.next': 'Proximo partido', 'comp.home': 'Local', 'comp.away': 'Visitante',
    'comp.results': 'Ultimos resultados'
  });
  Object.assign(D.ar, {
    'hud.goalword': 'هـــدف!', 'hud.owngoal': 'هدف عكسي', 'hud.gk5': 'الحارس: مرر الكرة (%s)',
    'set.chants': 'أهازيج الجمهور', 'set.chants.h': 'أغانٍ وتصفيق وطبول في المدرجات',
    'step.comppick': 'اختر فريقك', 'step.comphub': 'المسابقة',
    'mode.continue': 'متابعة', 'mode.continue.tag': 'مسابقة محفوظة',
    'mode.CONTINENTAL_CUP': 'الكأس القارية', 'mode.CONTINENTAL_CUP.tag': '16 ناديًا، خروج المغلوب',
    'mode.CONTINENTAL_CUP.d': 'اختر ناديك: تُسحب 15 فرق منافسة، ثم ثمن النهائي وربع ونصف النهائي والنهائي.',
    'mode.DOMESTIC_LEAGUE': 'موسم الدوري', 'mode.DOMESTIC_LEAGUE.tag': 'موسم كامل',
    'mode.DOMESTIC_LEAGUE.d': 'اختر ناديك والعب ضد كل فرق دوريه. صاحب الصدارة يفوز باللقب.',
    'mode.WORLD_NATIONALS': 'كأس العالم', 'mode.WORLD_NATIONALS.tag': '16 منتخبًا',
    'mode.WORLD_NATIONALS.d': 'اختر منتخبك: أربع مجموعات من أربعة، ويتأهل الأول والثاني إلى الأدوار الإقصائية.',
    'cp.team': 'فريقك', 'cp.players': 'اللاعبون', 'cp.1p': 'لاعب واحد ضد الحاسوب', 'cp.coop': 'لاعبان في نفس الفريق',
    'cp.replace': 'البدء يستبدل مسابقتك المحفوظة.', 'cp.start': 'ابدأ',
    'cp.sub.DOMESTIC_LEAGUE': 'اختر ناديًا: دوريه بالكامل هو موسمك.',
    'cp.sub.CONTINENTAL_CUP': 'اختر أي نادٍ: تُسحب الفرق الـ15 الأخرى عشوائيًا.',
    'cp.sub.WORLD_NATIONALS': 'اختر منتخبًا: تُسحب المنتخبات الأخرى والمجموعات عشوائيًا.',
    'comp.r16': 'ثمن النهائي', 'comp.qf': 'ربع النهائي', 'comp.sf': 'نصف النهائي', 'comp.final': 'النهائي',
    'comp.pens': 'ركلات ترجيح', 'comp.over': 'انتهت', 'comp.matchday': 'الجولة', 'comp.group': 'المجموعة',
    'comp.won': 'فوز!', 'comp.lost': 'خسارة.', 'comp.drew': 'تعادل.', 'comp.out_groups': 'الخروج من دور المجموعات.',
    'comp.through': 'التأهل إلى الدور التالي!', 'comp.knocked': 'الإقصاء.', 'comp.champion': 'الأبطال!',
    'comp.menu': '← القائمة الرئيسية', 'comp.abandon': 'انسحاب', 'comp.abandon2': 'اضغط مجددًا للانسحاب',
    'comp.play': 'العب المباراة', 'comp.new': 'مسابقة جديدة', 'comp.t.team': 'الفريق', 'comp.t.gd': 'الفارق',
    'comp.table': 'الترتيب', 'comp.groups': 'المجموعات', 'comp.bracket': 'الأدوار الإقصائية', 'comp.champ_is': 'البطل:',
    'comp.final_word': 'النتيجة النهائية', 'comp.next': 'المباراة القادمة', 'comp.home': 'على أرضه', 'comp.away': 'خارج أرضه',
    'comp.results': 'آخر النتائج'
  });


  // v1.7.1: one button per move, holding = power
  Object.assign(D.en, {
    'hud.hint': 'OK: pass / tackle • CANCEL: shoot / switch • hold a pass or shot button for more power • your buttons: Settings > Button mapping',
    'help.hold': 'Every move has its own button. Hold a pass or shot button longer for more power; press and team press last while held.',
    'map.sub': 'Pick an action, then press the real button. A gamepad button (A B X Y, L R, ZL ZR, L3 R3) sets the PAD side, the remote or keyboard sets the TV / KB side. Two buttons together = a combination. Holding does not matter here: in the game it gives power to passes and shots.',
    'map.prompt': 'Press the button (or two together) now.'
  });
  Object.assign(D.fr, {
    'hud.hint': 'OK : passe / tacle • CANCEL : tir / changer • maintenez un bouton de passe ou de tir pour plus de puissance • vos boutons : Reglages > Boutons',
    'help.hold': 'Chaque action a son bouton. Maintenez un bouton de passe ou de tir pour plus de puissance ; le pressing dure tant que le bouton est maintenu.',
    'map.sub': 'Choisissez une action puis appuyez sur le vrai bouton. Un bouton de manette (A B X Y, L R, ZL ZR, L3 R3) regle le cote MANETTE, la telecommande ou le clavier le cote TV / CLAVIER. Deux boutons ensemble = combinaison. La duree ne compte pas ici : en jeu elle donne la puissance.',
    'map.prompt': 'Appuyez sur le bouton (ou deux ensemble) maintenant.'
  });
  Object.assign(D.es, {
    'hud.hint': 'OK: pase / entrada • CANCEL: tiro / cambiar • mantén un boton de pase o tiro para mas potencia • tus botones: Ajustes > Botones',
    'help.hold': 'Cada accion tiene su boton. Mantén un boton de pase o tiro para mas potencia; la presion dura mientras lo mantienes.',
    'map.sub': 'Elige una accion y pulsa el boton real. Un boton del mando (A B X Y, L R, ZL ZR, L3 R3) ajusta el lado MANDO, el mando de la TV o el teclado el lado TV / TECL. Dos botones juntos = combinacion. Mantener no importa aqui: en el juego da potencia.',
    'map.prompt': 'Pulsa el boton (o dos juntos) ahora.'
  });
  Object.assign(D.ar, {
    'hud.hint': 'OK: تمريرة / تدخل • CANCEL: تسديدة / تبديل • أبقِ زر التمرير أو التسديد للمزيد من القوة • أزرارك: الإعدادات > الأزرار',
    'help.hold': 'لكل حركة زرها. أبقِ زر التمرير أو التسديد مدة أطول لقوة أكبر؛ والضغط يستمر ما دام الزر مضغوطًا.',
    'map.sub': 'اختر حركة ثم اضغط الزر الحقيقي. زر ذراع اللعب يضبط جانب الذراع، والريموت أو لوحة المفاتيح يضبطان جانب التلفاز. زران معًا = تركيبة. مدة الضغط لا تهم هنا: في اللعب تعطي القوة.',
    'map.prompt': 'اضغط الزر (أو زرين معًا) الآن.'
  });


  // v1.8: game controllers and phone controllers only, one shared button map
  Object.assign(D.en, {
    'hud.hint': 'A pass • Y through • B long • X shoot (hold = power) • R sprint • L switch • Start: menu • your buttons: Settings > Button mapping',
    'map.sub': 'Pick an action, then press the button (or two together) on your game controller or phone controller. One map for all controllers. Holding does not matter here: in the game it gives power to passes and shots.',
    'map.noraw': 'No controller connected: connect a game controller, or a phone controller (Buttons mode), to play and to map the buttons.',
    'help.g4': 'Matches are played with a game controller or a phone controller (Buttons mode); the TV remote and the keyboard work in the menus.'
  });
  Object.assign(D.fr, {
    'hud.hint': 'A passe • Y profondeur • B longue • X tir (maintenir = puissance) • R sprint • L changer • Start : menu • vos boutons : Reglages > Boutons',
    'map.sub': 'Choisissez une action puis appuyez sur le bouton (ou deux ensemble) de votre manette ou manette telephone. Une seule configuration pour toutes les manettes. La duree ne compte pas ici : en jeu elle donne la puissance.',
    'map.noraw': 'Aucune manette : branchez une manette ou une manette telephone (mode Boutons) pour jouer et configurer les boutons.',
    'help.g4': 'Les matchs se jouent a la manette ou a la manette telephone (mode Boutons) ; la telecommande et le clavier servent aux menus.'
  });
  Object.assign(D.es, {
    'hud.hint': 'A pase • Y al hueco • B largo • X tiro (mantener = potencia) • R sprint • L cambiar • Start: menu • tus botones: Ajustes > Botones',
    'map.sub': 'Elige una accion y pulsa el boton (o dos juntos) de tu mando o mando de telefono. Una sola asignacion para todos los mandos. Mantener no importa aqui: en el juego da potencia.',
    'map.noraw': 'Ningun mando conectado: conecta un mando o un mando de telefono (modo Botones) para jugar y asignar botones.',
    'help.g4': 'Los partidos se juegan con mando o mando de telefono (modo Botones); el mando de la TV y el teclado sirven en los menus.'
  });
  Object.assign(D.ar, {
    'hud.hint': 'A تمريرة • Y بينية • B طويلة • X تسديدة (الإبقاء = قوة) • R ركض • L تبديل • Start: القائمة • أزرارك: الإعدادات > الأزرار',
    'map.sub': 'اختر حركة ثم اضغط الزر (أو زرين معًا) في ذراع اللعب أو ذراع الهاتف. تخصيص واحد لكل الأذرع. مدة الضغط لا تهم هنا: في اللعب تعطي القوة.',
    'map.noraw': 'لا يوجد ذراع متصل: صل ذراع لعب أو ذراع الهاتف (وضع الأزرار) للعب وتخصيص الأزرار.',
    'help.g4': 'تُلعب المباريات بذراع اللعب أو ذراع الهاتف (وضع الأزرار)؛ الريموت ولوحة المفاتيح للقوائم فقط.'
  });

  Object.assign(D.en, { 'help.g2': 'Player 2: a second game controller or phone controller (the second one connected).' });
  Object.assign(D.fr, { 'help.g2': 'Joueur 2 : une seconde manette ou manette telephone (la deuxieme connectee).' });
  Object.assign(D.es, { 'help.g2': 'Jugador 2: un segundo mando o mando de telefono (el segundo conectado).' });
  Object.assign(D.ar, { 'help.g2': 'اللاعب 2: ذراع لعب ثانية أو ذراع هاتف (الثانية المتصلة).' });


  // v1.9: fouls, free kicks, penalties
  Object.assign(D.en, { 'hud.foul': 'FOUL!', 'hud.freekick': 'Free kick', 'hud.penalty': 'PENALTY!', 'hud.penalty.sub': 'Foul in the box' });
  Object.assign(D.fr, { 'hud.foul': 'FAUTE !', 'hud.freekick': 'Coup franc', 'hud.penalty': 'PENALTY !', 'hud.penalty.sub': 'Faute dans la surface' });
  Object.assign(D.es, { 'hud.foul': '¡FALTA!', 'hud.freekick': 'Tiro libre', 'hud.penalty': '¡PENALTI!', 'hud.penalty.sub': 'Falta en el area' });
  Object.assign(D.ar, { 'hud.foul': 'خطأ!', 'hud.freekick': 'ركلة حرة', 'hud.penalty': 'ضربة جزاء!', 'hud.penalty.sub': 'خطأ داخل منطقة الجزاء' });


  // v1.10: settings tabs, power bar speed
  Object.assign(D.en, { 'set.g.game': 'GAMEPLAY', 'set.g.video': 'GRAPHICS', 'set.g.audio': 'AUDIO',
    'set.gauge': 'Power bar speed', 'set.gauge.h': 'How fast the shot / pass power bar fills', 'opt.vfast': 'VERY FAST' });
  Object.assign(D.fr, { 'set.g.game': 'JEU', 'set.g.video': 'GRAPHISMES', 'set.g.audio': 'SON',
    'set.gauge': 'Vitesse de la jauge', 'set.gauge.h': 'Vitesse de remplissage de la jauge de tir / passe', 'opt.vfast': 'TRES RAPIDE' });
  Object.assign(D.es, { 'set.g.game': 'JUEGO', 'set.g.video': 'GRAFICOS', 'set.g.audio': 'SONIDO',
    'set.gauge': 'Velocidad de la barra', 'set.gauge.h': 'Rapidez con la que se llena la barra de tiro / pase', 'opt.vfast': 'MUY RAPIDO' });
  Object.assign(D.ar, { 'set.g.game': 'اللعب', 'set.g.video': 'الرسومات', 'set.g.audio': 'الصوت',
    'set.gauge': 'سرعة شريط القوة', 'set.gauge.h': 'سرعة امتلاء شريط قوة التسديد / التمرير', 'opt.vfast': 'سريع جدًا' });


  // v1.11: bookings (warning shown as a green card for now, yellow, red)
  Object.assign(D.en, { 'card.warn': 'WARNING: next foul is a yellow card', 'card.yellow': 'YELLOW CARD', 'card.red': 'SECOND YELLOW: RED CARD' });
  Object.assign(D.fr, { 'card.warn': 'AVERTISSEMENT : prochaine faute = jaune', 'card.yellow': 'CARTON JAUNE', 'card.red': 'DEUXIEME JAUNE : CARTON ROUGE' });
  Object.assign(D.es, { 'card.warn': 'AVISO: la próxima falta es amarilla', 'card.yellow': 'TARJETA AMARILLA', 'card.red': 'SEGUNDA AMARILLA: ROJA' });
  Object.assign(D.ar, { 'card.warn': 'تحذير شفهي: الخطأ القادم بطاقة صفراء', 'card.yellow': 'بطاقة صفراء', 'card.red': 'إنذار ثانٍ: بطاقة حمراء' });


  // v1.12: player ratings
  Object.assign(D.en, { 'st.spd': 'Speed', 'st.drb': 'Dribble', 'st.sht': 'Shoot', 'st.sta': 'Stamina', 'st.hdr': 'Header', 'st.def': 'Defense' });
  Object.assign(D.fr, { 'st.spd': 'Vitesse', 'st.drb': 'Dribble', 'st.sht': 'Tir', 'st.sta': 'Endurance', 'st.hdr': 'Jeu de tete', 'st.def': 'Defense' });
  Object.assign(D.es, { 'st.spd': 'Velocidad', 'st.drb': 'Regate', 'st.sht': 'Tiro', 'st.sta': 'Resistencia', 'st.hdr': 'Cabezazo', 'st.def': 'Defensa' });
  Object.assign(D.ar, { 'st.spd': 'السرعة', 'st.drb': 'المراوغة', 'st.sht': 'التسديد', 'st.sta': 'التحمل', 'st.hdr': 'الرأسيات', 'st.def': 'الدفاع' });


  // v1.14: 11 a side, restarts, offside
  Object.assign(D.en, { 'set.teamsize': 'Players per team', 'set.teamsize.h': '11-a-side on a full pitch, or 7-a-side (from the next match)',
    'opt.t11': '11 v 11', 'opt.t7': '7 v 7', 'hud.offside': 'OFFSIDE', 'hud.corner': 'CORNER', 'hud.goalkick': 'GOAL KICK', 'hud.throwin': 'THROW-IN' });
  Object.assign(D.fr, { 'set.teamsize': 'Joueurs par equipe', 'set.teamsize.h': 'A 11 sur un grand terrain, ou a 7 (des le prochain match)',
    'opt.t11': '11 c. 11', 'opt.t7': '7 c. 7', 'hud.offside': 'HORS-JEU', 'hud.corner': 'CORNER', 'hud.goalkick': 'SIX METRES', 'hud.throwin': 'TOUCHE' });
  Object.assign(D.es, { 'set.teamsize': 'Jugadores por equipo', 'set.teamsize.h': 'Fútbol 11 en campo completo, o fútbol 7 (desde el próximo partido)',
    'opt.t11': '11 c. 11', 'opt.t7': '7 c. 7', 'hud.offside': 'FUERA DE JUEGO', 'hud.corner': 'CÓRNER', 'hud.goalkick': 'SAQUE DE PUERTA', 'hud.throwin': 'SAQUE DE BANDA' });
  Object.assign(D.ar, { 'set.teamsize': 'عدد اللاعبين', 'set.teamsize.h': '11 لاعبًا في ملعب كامل، أو 7 (من المباراة القادمة)',
    'opt.t11': '11 ضد 11', 'opt.t7': '7 ضد 7', 'hud.offside': 'تسلل', 'hud.corner': 'ركنية', 'hud.goalkick': 'ركلة مرمى', 'hud.throwin': 'رمية تماس' });


  // v1.15: stadiums, tactics, referee warning
  Object.assign(D.en, { 'set.stadium': 'Stadium', 'set.stadium.h': 'Pitch size (from the next match)',
    'opt.st.compact': 'Compact 100x64', 'opt.st.classic': 'Classic 110x72', 'opt.st.grand': 'Grand 120x78', 'opt.st.mega': 'Mega 130x86',
    'tac.title': 'Tactics', 'tac.b0': 'Defence', 'tac.b1': 'Midfield', 'tac.b2': 'Attack',
    'tac.m0': 'Defensive', 'tac.m1': 'Balanced', 'tac.m2': 'Attacking' });
  Object.assign(D.fr, { 'set.stadium': 'Stade', 'set.stadium.h': 'Taille du terrain (des le prochain match)',
    'opt.st.compact': 'Compact 100x64', 'opt.st.classic': 'Classique 110x72', 'opt.st.grand': 'Grand 120x78', 'opt.st.mega': 'Mega 130x86',
    'tac.title': 'Tactique', 'tac.b0': 'Defense', 'tac.b1': 'Milieu', 'tac.b2': 'Attaque',
    'tac.m0': 'Defensif', 'tac.m1': 'Equilibre', 'tac.m2': 'Offensif' });
  Object.assign(D.es, { 'set.stadium': 'Estadio', 'set.stadium.h': 'Tamaño del campo (desde el próximo partido)',
    'opt.st.compact': 'Compacto 100x64', 'opt.st.classic': 'Clásico 110x72', 'opt.st.grand': 'Grande 120x78', 'opt.st.mega': 'Mega 130x86',
    'tac.title': 'Táctica', 'tac.b0': 'Defensa', 'tac.b1': 'Medio', 'tac.b2': 'Ataque',
    'tac.m0': 'Defensivo', 'tac.m1': 'Equilibrado', 'tac.m2': 'Ofensivo' });
  Object.assign(D.ar, { 'set.stadium': 'الملعب', 'set.stadium.h': 'حجم أرضية الملعب (من المباراة القادمة)',
    'opt.st.compact': 'صغير 100x64', 'opt.st.classic': 'كلاسيكي 110x72', 'opt.st.grand': 'كبير 120x78', 'opt.st.mega': 'ضخم 130x86',
    'tac.title': 'الخطة', 'tac.b0': 'الدفاع', 'tac.b1': 'الوسط', 'tac.b2': 'الهجوم',
    'tac.m0': 'دفاعي', 'tac.m1': 'متوازن', 'tac.m2': 'هجومي' });


  // debug matches (a developer tool: the report itself is in English)
  Object.assign(D.en, { 'step.debug': 'DEBUG MATCHES', 'dbg.open': 'Debug matches', 'dbg.run': 'Run', 'dbg.stop': 'Stop', 'dbg.copy': 'Copy report',
    'dbg.matches': 'Matches', 'dbg.home': 'Home CPU', 'dbg.away': 'Away CPU', 'dbg.teams': 'Teams', 'dbg.size': 'Players', 'dbg.stadium': 'Stadium',
    'dbg.length': 'Minutes', 'dbg.hint': 'CPU v CPU at full speed. Teams SELECTED = the Teams screen pair (with their tactics). Press Run, then Copy report.',
    'dbg.running': 'Playing match %d of %t...', 'dbg.done': 'Done. Copy the report below.', 'dbg.copied': 'Report copied.' });
  Object.assign(D.fr, { 'step.debug': 'MATCHS DE TEST', 'dbg.open': 'Matchs de test', 'dbg.run': 'Lancer', 'dbg.stop': 'Arreter', 'dbg.copy': 'Copier le rapport',
    'dbg.matches': 'Matchs', 'dbg.home': 'CPU domicile', 'dbg.away': 'CPU exterieur', 'dbg.teams': 'Equipes', 'dbg.size': 'Joueurs', 'dbg.stadium': 'Stade',
    'dbg.length': 'Minutes', 'dbg.hint': 'CPU contre CPU a pleine vitesse. Lancer, puis Copier le rapport.',
    'dbg.running': 'Match %d sur %t...', 'dbg.done': 'Termine. Copiez le rapport.', 'dbg.copied': 'Rapport copie.' });
  Object.assign(D.es, { 'step.debug': 'PARTIDOS DE PRUEBA', 'dbg.open': 'Partidos de prueba', 'dbg.run': 'Iniciar', 'dbg.stop': 'Parar', 'dbg.copy': 'Copiar informe',
    'dbg.matches': 'Partidos', 'dbg.home': 'CPU local', 'dbg.away': 'CPU visitante', 'dbg.teams': 'Equipos', 'dbg.size': 'Jugadores', 'dbg.stadium': 'Estadio',
    'dbg.length': 'Minutos', 'dbg.hint': 'CPU contra CPU a toda velocidad. Iniciar y luego Copiar informe.',
    'dbg.running': 'Partido %d de %t...', 'dbg.done': 'Hecho. Copia el informe.', 'dbg.copied': 'Informe copiado.' });
  Object.assign(D.ar, { 'step.debug': 'مباريات الاختبار', 'dbg.open': 'مباريات الاختبار', 'dbg.run': 'تشغيل', 'dbg.stop': 'إيقاف', 'dbg.copy': 'نسخ التقرير',
    'dbg.matches': 'المباريات', 'dbg.home': 'مستوى المضيف', 'dbg.away': 'مستوى الضيف', 'dbg.teams': 'الفرق', 'dbg.size': 'اللاعبون', 'dbg.stadium': 'الملعب',
    'dbg.length': 'الدقائق', 'dbg.hint': 'الكمبيوتر ضد الكمبيوتر بأقصى سرعة. اضغط تشغيل ثم نسخ التقرير.',
    'dbg.running': 'المباراة %d من %t...', 'dbg.done': 'انتهى. انسخ التقرير.', 'dbg.copied': 'تم نسخ التقرير.' });

  // checkoAI (the learning player, js/game/aima.js)
  Object.assign(D.en, {
    'opt.aima': 'checkoAI', 'set.g.aima': 'checkoAI', 'mv.clap': 'Clap checkoAI: that was good (hold = stronger)',
    'map.clapbusy': 'That button already plays a move: pick a free one for the clap.',
    'aima.t.watch': 'Watching Legend play', 'aima.t.happy': 'Thanks coach!', 'aima.t.shoot': 'Going for goal!', 'aima.t.through': 'Through ball!',
    'aima.t.long': 'Switching play', 'aima.t.pass': 'Keeping the ball', 'aima.t.switch': 'Changing player', 'aima.t.win': 'Win it back!',
    'aima.t.losing': 'Losing - must score!', 'aima.t.lead': 'Keep the lead', 'aima.t.run': 'Running at them', 'aima.t.look': 'Looking for a pass',
    'aima.t.runbehind': 'Making a run', 'aima.t.option': 'Offering an option', 'aima.t.close': 'Closing down', 'aima.t.chase': 'Chasing the ball',
    'aima.role.trainer': 'Your learning player. Choose CPU level checkoAI: he controls the selected player (violet arrow), the Legend CPU the others.',
    'aima.role.viewer': "Plays imad's latest model (a fresh copy each time). Only imad trains him.",
    'aima.c.stats': 'HIS STATS', 'aima.c.model': 'THE MODEL', 'aima.c.style': 'HIS STYLE',
    'aima.k.matches': 'Matches (W-D-L)', 'aima.k.minutes': 'Minutes', 'aima.k.goals': 'Goals', 'aima.k.team': 'team', 'aima.k.shots': 'Shots',
    'aima.k.ontarget': 'on target', 'aima.k.passes': 'Passes', 'aima.k.fwd': 'forward', 'aima.k.tackles': 'Tackles', 'aima.k.wonlost': 'Ball won / lost',
    'aima.k.fouls': 'Fouls', 'aima.k.claps': 'Claps', 'aima.k.avg': 'avg', 'aima.k.reward': 'Total reward', 'aima.k.trend': 'Reward per match',
    'aima.k.alg': 'Algorithm', 'aima.k.brain': 'Brain (layers)', 'aima.k.params': 'Values (size)', 'aima.k.inputs': 'Inputs',
    'aima.inputs': '91: play around him, his ratings and position, which end his team attacks, the last seconds, the match (time left, score, cards, players, possession, shots)',
    'aima.k.decisions': 'Decisions', 'aima.k.own': 'his own', 'aima.k.updates': 'Learning steps', 'aima.k.copy': 'copy',
    'aima.k.samples': 'Copied moves', 'aima.k.you': 'you', 'aima.k.help': 'Legend help now', 'aima.k.from': 'Started from',
    'aima.k.created': 'Created', 'aima.k.saved': 'Last saved', 'aima.k.cloud': 'Cloud',
    'aima.from.new': 'a new brain', 'aima.from.seed': 'the published model', 'aima.from.trainer': "imad's model", 'aima.from.save': 'his save',
    'aima.y.pass': 'Passing', 'aima.y.shoot': 'Shooting', 'aima.y.fwd': 'Forward passes', 'aima.y.sprint': 'Sprinting', 'aima.y.carry': 'On the ball',
    'aima.y.pos': 'Position (back - up)',
    'aima.o.learn': 'Learning', 'aima.o.learn.h': 'He keeps learning while he plays (off: he plays as he is)',
    'aima.o.mine': 'Learn from my play', 'aima.o.mine.h': 'He copies what you do when you play (this is what gives him your style)',
    'aima.o.style': 'Style goal', 'aima.o.style.h': 'What the rewards push him towards',
    'aima.o.lr': 'Learning speed', 'aima.o.lr.h': 'High learns faster but forgets faster too',
    'aima.o.explore': 'Trying new moves', 'aima.o.explore.h': 'High tries more new things (and makes more mistakes)',
    'aima.o.clap': 'Clap strength', 'aima.o.clap.h': 'How much one clap counts (the hold gauge sets each clap)',
    'aima.o.help': 'Legend help', 'aima.o.help.h': 'Share of spells the Legend CPU plays for him (he copies them). Auto: less and less as he learns',
    'aima.o.size': 'Brain size', 'aima.o.size.h': 'Bigger can learn more but trains slower. Changing it starts a new brain',
    'aima.st.BALANCED': 'Balanced', 'aima.st.ATTACKER': 'Attacker', 'aima.st.PLAYMAKER': 'Playmaker', 'aima.st.DEFENDER': 'Defender',
    'aima.h0': 'None', 'aima.h30': '30%', 'aima.h60': '60%',
    'aima.sz.SMALL': 'Small', 'aima.sz.LARGE': 'Large', 'aima.sz.HUGE': 'Huge (PC)',
    'aima.needcloud': 'A bigger brain needs the cloud (sign in with Google first).',
    'aima.confirm.size': 'Press again to confirm: a new brain of that size replaces the current one.', 'aima.done.size': 'New brain ready.',
    'aima.signin': 'Sign in with Google', 'aima.signout': 'Sign out', 'aima.signing': 'Signing in...', 'aima.signed': 'Signed in:',
    'aima.signfail': 'Sign-in failed:', 'aima.code': 'or paste the code from aima-login.html', 'aima.usecode': 'Use code',
    'aima.save': 'Save now', 'aima.saved': 'Saved.', 'aima.reset': 'New brain',
    'aima.confirm.reset': 'Press again to confirm: his brain and stats start from zero.', 'aima.done.reset': 'Started again from zero.',
    'aima.note.trainer': 'Clap: hold the clap button (Buttons screen) during a match - a quick tap is a small clap, a full hold 100%.',
    'aima.note.signin': 'Sign in with your Google account (once, on a computer) to train him and save him to the cloud for all your devices.',
    'aima.note.viewer': 'Choose CPU level checkoAI to play against him.'
  });
  Object.assign(D.fr, {
    'opt.aima': 'checkoAI', 'set.g.aima': 'checkoAI', 'mv.clap': 'Applaudir checkoAI (maintenir = plus fort)',
    'map.clapbusy': 'Ce bouton joue deja une action : choisissez un bouton libre.',
    'aima.t.watch': 'Regarde jouer Legend', 'aima.t.happy': 'Merci coach !', 'aima.t.shoot': 'Il va tirer !', 'aima.t.through': 'Passe en profondeur !',
    'aima.t.long': 'Change de cote', 'aima.t.pass': 'Garde le ballon', 'aima.t.switch': 'Change de joueur', 'aima.t.win': 'Recuperer le ballon !',
    'aima.t.losing': 'Mene - il faut marquer !', 'aima.t.lead': 'Garder l’avance', 'aima.t.run': 'Elimine en vitesse', 'aima.t.look': 'Cherche une passe',
    'aima.t.runbehind': 'Fait un appel', 'aima.t.option': 'Se demarque', 'aima.t.close': 'Presse le porteur', 'aima.t.chase': 'Court au ballon',
    'aima.role.trainer': 'Votre joueur qui apprend. Niveau CPU checkoAI : il controle le joueur selectionne (fleche violette), le CPU Legend les autres.',
    'aima.role.viewer': 'Joue le dernier modele d’imad (copie neuve a chaque fois). Seul imad l’entraine.',
    'aima.c.stats': 'SES STATS', 'aima.c.model': 'LE MODELE', 'aima.c.style': 'SON STYLE',
    'aima.o.learn': 'Apprentissage', 'aima.o.mine': 'Apprendre de mon jeu', 'aima.o.style': 'Objectif de style', 'aima.o.lr': 'Vitesse d’apprentissage',
    'aima.o.explore': 'Essayer de nouveaux gestes', 'aima.o.clap': 'Force des applaudissements', 'aima.o.help': 'Aide Legend', 'aima.o.size': 'Taille du cerveau',
    'aima.signin': 'Connexion Google', 'aima.signout': 'Deconnexion', 'aima.save': 'Enregistrer', 'aima.reset': 'Nouveau cerveau',
    'aima.note.viewer': 'Choisissez le niveau CPU checkoAI pour jouer contre lui.'
  });
  Object.assign(D.es, {
    'opt.aima': 'checkoAI', 'set.g.aima': 'checkoAI', 'mv.clap': 'Aplaudir a checkoAI (mantener = mas fuerte)',
    'map.clapbusy': 'Ese boton ya hace una jugada: elige uno libre.',
    'aima.t.watch': 'Mira jugar a Legend', 'aima.t.happy': 'Gracias, mister!', 'aima.t.shoot': 'Va a tirar!', 'aima.t.through': 'Pase al hueco!',
    'aima.t.long': 'Cambia de banda', 'aima.t.pass': 'Mantiene el balon', 'aima.t.switch': 'Cambia de jugador', 'aima.t.win': 'A recuperarla!',
    'aima.t.losing': 'Perdiendo - hay que marcar!', 'aima.t.lead': 'Defender la ventaja', 'aima.t.run': 'Encara en velocidad', 'aima.t.look': 'Busca un pase',
    'aima.t.runbehind': 'Hace un desmarque', 'aima.t.option': 'Se ofrece', 'aima.t.close': 'Presiona', 'aima.t.chase': 'Va por el balon',
    'aima.role.trainer': 'Tu jugador que aprende. Nivel CPU checkoAI: controla al jugador seleccionado (flecha violeta), el CPU Legend al resto.',
    'aima.role.viewer': 'Juega el ultimo modelo de imad (copia nueva cada vez). Solo imad lo entrena.',
    'aima.c.stats': 'SUS ESTADISTICAS', 'aima.c.model': 'EL MODELO', 'aima.c.style': 'SU ESTILO',
    'aima.o.learn': 'Aprendizaje', 'aima.o.mine': 'Aprender de mi juego', 'aima.o.style': 'Objetivo de estilo', 'aima.o.lr': 'Velocidad de aprendizaje',
    'aima.o.explore': 'Probar jugadas nuevas', 'aima.o.clap': 'Fuerza del aplauso', 'aima.o.help': 'Ayuda Legend', 'aima.o.size': 'Tamano del cerebro',
    'aima.signin': 'Entrar con Google', 'aima.signout': 'Salir', 'aima.save': 'Guardar', 'aima.reset': 'Cerebro nuevo',
    'aima.note.viewer': 'Elige el nivel CPU checkoAI para jugar contra el.'
  });
  Object.assign(D.ar, {
    'opt.aima': 'checkoAI', 'set.g.aima': 'checkoAI', 'mv.clap': 'تصفيق لـ checkoAI (الضغط المطول = أقوى)',
    'map.clapbusy': 'هذا الزر مستخدم لحركة أخرى: اختر زرا حرا.',
    'aima.t.watch': 'يشاهد Legend يلعب', 'aima.t.happy': 'شكرا يا مدرب!', 'aima.t.shoot': 'سيسدد!', 'aima.t.through': 'تمريرة بينية!',
    'aima.t.long': 'يغير اللعب', 'aima.t.pass': 'يحتفظ بالكرة', 'aima.t.switch': 'يغير اللاعب', 'aima.t.win': 'استرجع الكرة!',
    'aima.t.losing': 'متأخر - يجب التسجيل!', 'aima.t.lead': 'يحافظ على التقدم', 'aima.t.run': 'ينطلق نحوهم', 'aima.t.look': 'يبحث عن تمريرة',
    'aima.t.runbehind': 'ينطلق خلف الدفاع', 'aima.t.option': 'يقدم حلا', 'aima.t.close': 'يضغط على حامل الكرة', 'aima.t.chase': 'يطارد الكرة',
    'aima.role.trainer': 'لاعبك الذي يتعلم. اختر مستوى checkoAI: يتحكم في اللاعب المحدد (السهم البنفسجي) و Legend في الباقين.',
    'aima.role.viewer': 'يلعب بآخر نموذج لـ imad (نسخة جديدة كل مرة). فقط imad يدربه.',
    'aima.c.stats': 'إحصائياته', 'aima.c.model': 'النموذج', 'aima.c.style': 'أسلوبه',
    'aima.o.learn': 'التعلم', 'aima.o.mine': 'التعلم من لعبي', 'aima.o.style': 'هدف الأسلوب', 'aima.o.lr': 'سرعة التعلم',
    'aima.o.explore': 'تجربة حركات جديدة', 'aima.o.clap': 'قوة التصفيق', 'aima.o.help': 'مساعدة Legend', 'aima.o.size': 'حجم الدماغ',
    'aima.signin': 'الدخول بحساب Google', 'aima.signout': 'خروج', 'aima.save': 'حفظ الآن', 'aima.reset': 'دماغ جديد',
    'aima.note.viewer': 'اختر مستوى checkoAI للعب ضده.'
  });

  // checkoAI: sub-tabs, brains, training
  Object.assign(D.en, {
    'aima.sub.stats': 'Stats', 'aima.sub.settings': 'Settings', 'aima.sub.brains': 'Brains', 'aima.sub.train': 'Training',
    'aima.settingsof': 'Settings of the active brain:', 'aima.k.name': 'Name', 'aima.k.trained': 'in training',
    'aima.c.brains': 'BRAINS (★ = active: plays your matches, and everyone else gets it)', 'aima.c.history': 'HISTORY',
    'aima.loading': 'Loading...', 'aima.newname': 'name (for clone / rename / new)', 'aima.use': 'Use this brain', 'aima.used': 'Active brain:',
    'aima.clone': 'Clone', 'aima.cloned': 'Cloned:', 'aima.rename': 'Rename', 'aima.renamed': 'Renamed.', 'aima.needname': 'Type a name first.',
    'aima.newbrain': 'New brain', 'aima.created': 'Created:', 'aima.delete': 'Delete', 'aima.deleted': 'Deleted.',
    'aima.confirm.del': 'Press again to delete this brain for good.',
    'aima.h.created': 'created', 'aima.h.cloned': 'cloned from', 'aima.h.renamed': 'renamed', 'aima.h.set': 'setting', 'aima.h.size': 'new brain size',
    'aima.h.reset': 'started again from zero', 'aima.h.match': 'match', 'aima.h.vshuman': 'v a player', 'aima.h.vscpu': 'v the CPU', 'aima.h.train': 'training',
    'aima.tr.brain': 'Brain', 'aima.tr.opp': 'Opponent', 'aima.tr.run': 'Train',
    'aima.tr.hint': 'He plays full-speed matches and learns. The opponent may be the CPU at any level, or a brain (that one does not learn).',
    'aima.tr.starting': 'Starting...', 'aima.tr.done': 'Done. Summary or full stats below.', 'aima.tr.busy': 'Not now: finish the match in progress first.',
    'aima.tr.summary': 'Summary', 'aima.tr.full': 'Full stats', 'aima.tr.title': 'training', 'aima.tr.matches': 'matches', 'aima.tr.aside': 'a side',
    'aima.tr.results': 'Results (W-D-L)', 'aima.tr.goals': 'goals', 'aima.tr.permatch': 'per match', 'aima.tr.hisplay': 'His play',
    'aima.tr.shots': 'shots', 'aima.tr.goalsby': 'his goals', 'aima.tr.passes': 'passes', 'aima.tr.tackles': 'tackles', 'aima.tr.fouls': 'fouls',
    'aima.tr.learning': 'Learning', 'aima.tr.reward': 'Reward (first half of the run -> second half)',
    'aima.tr.better': 'improving', 'aima.tr.worse': 'getting worse', 'aima.tr.flat': 'about the same',
    'aima.tr.brainstats': 'BRAIN COUNTERS (this run)', 'aima.tr.rewards': 'Reward per match'
  });
  Object.assign(D.fr, {
    'aima.sub.stats': 'Stats', 'aima.sub.settings': 'Reglages', 'aima.sub.brains': 'Cerveaux', 'aima.sub.train': 'Entrainement',
    'aima.c.history': 'HISTORIQUE', 'aima.use': 'Utiliser ce cerveau', 'aima.clone': 'Cloner', 'aima.rename': 'Renommer', 'aima.newbrain': 'Nouveau cerveau',
    'aima.delete': 'Supprimer', 'aima.tr.brain': 'Cerveau', 'aima.tr.opp': 'Adversaire', 'aima.tr.run': 'Entrainer', 'aima.tr.summary': 'Resume',
    'aima.tr.full': 'Stats completes'
  });
  Object.assign(D.es, {
    'aima.sub.stats': 'Estadisticas', 'aima.sub.settings': 'Ajustes', 'aima.sub.brains': 'Cerebros', 'aima.sub.train': 'Entrenamiento',
    'aima.c.history': 'HISTORIAL', 'aima.use': 'Usar este cerebro', 'aima.clone': 'Clonar', 'aima.rename': 'Renombrar', 'aima.newbrain': 'Cerebro nuevo',
    'aima.delete': 'Borrar', 'aima.tr.brain': 'Cerebro', 'aima.tr.opp': 'Rival', 'aima.tr.run': 'Entrenar', 'aima.tr.summary': 'Resumen',
    'aima.tr.full': 'Estadisticas completas'
  });
  Object.assign(D.ar, {
    'aima.sub.stats': 'الإحصائيات', 'aima.sub.settings': 'الإعدادات', 'aima.sub.brains': 'الأدمغة', 'aima.sub.train': 'التدريب',
    'aima.c.history': 'السجل', 'aima.use': 'استخدم هذا الدماغ', 'aima.clone': 'نسخ', 'aima.rename': 'إعادة تسمية', 'aima.newbrain': 'دماغ جديد',
    'aima.delete': 'حذف', 'aima.tr.brain': 'الدماغ', 'aima.tr.opp': 'الخصم', 'aima.tr.run': 'تدريب', 'aima.tr.summary': 'ملخص',
    'aima.tr.full': 'إحصائيات كاملة'
  });

  // checkoAI: per-brain options, sizes, training progress
  Object.assign(D.en, {
    'aima.o.tick': 'Decision speed', 'aima.o.tick.h': 'How often he decides (fast reacts sooner, slow is steadier)',
    'aima.o.look': 'Foresight', 'aima.o.look.h': 'How far ahead rewards count (long: he plays for later, not only now)',
    'aima.o.mineW': 'Weight of my play', 'aima.o.mineW.h': 'How much your own play counts when he copies (against the Legend CPU)',
    'aima.o.mem': 'Memory', 'aima.o.mem.h': 'Copied moves he keeps to learn from (changing it empties it)',
    'aima.fast': 'Fast', 'aima.slow': 'Slow', 'aima.short': 'Short', 'aima.long': 'Long',
    'aima.sz.TINY': 'Tiny', 'aima.sz.MEDIUM': 'Medium', 'aima.sz.LARGE': 'Large', 'aima.sz.HUGE': 'Huge (PC)',
    'aima.o.size.h': 'Tiny 32-24, Medium 64-48, Large 256-128, Huge 512-256. Bigger learns more but slower; changing it starts a new brain',
    'aima.settingsof': 'Settings of:', 'aima.tr.saved': 'saved after every match'
  });
  Object.assign(D.fr, { 'aima.o.tick': 'Vitesse de decision', 'aima.o.look': 'Anticipation', 'aima.o.mineW': 'Poids de mon jeu', 'aima.o.mem': 'Memoire',
    'aima.fast': 'Rapide', 'aima.slow': 'Lent', 'aima.short': 'Courte', 'aima.long': 'Longue',
    'aima.sz.TINY': 'Mini', 'aima.sz.MEDIUM': 'Moyen', 'aima.sz.LARGE': 'Grand', 'aima.sz.HUGE': 'Enorme (PC)', 'aima.settingsof': 'Reglages de :' });
  Object.assign(D.es, { 'aima.o.tick': 'Velocidad de decision', 'aima.o.look': 'Prevision', 'aima.o.mineW': 'Peso de mi juego', 'aima.o.mem': 'Memoria',
    'aima.fast': 'Rapida', 'aima.slow': 'Lenta', 'aima.short': 'Corta', 'aima.long': 'Larga',
    'aima.sz.TINY': 'Mini', 'aima.sz.MEDIUM': 'Medio', 'aima.sz.LARGE': 'Grande', 'aima.sz.HUGE': 'Enorme (PC)', 'aima.settingsof': 'Ajustes de:' });
  Object.assign(D.ar, { 'aima.o.tick': 'سرعة القرار', 'aima.o.look': 'التوقع',
    'aima.o.mineW': 'وزن لعبي', 'aima.o.mem': 'الذاكرة',
    'aima.sz.TINY': 'صغير جدا', 'aima.sz.MEDIUM': 'متوسط', 'aima.sz.LARGE': 'كبير',
    'aima.sz.HUGE': 'ضخم (PC)', 'aima.settingsof': 'إعدادات:' });

  Object.assign(D.en, { 'aima.loadfail': 'That brain could not be loaded (cloud). Showing the active one.' });
  Object.assign(D.fr, { 'aima.tr.brain': 'Cerveau' });

  // checkoAI: work (operations), the same on every device
  Object.assign(D.en, {
    'aima.w.title': 'WORK', 'aima.w.sub': 'operations, the same on every device', 'aima.w.persec': 'ops / s of play',
    'aima.w.measured': 'Measured', 'aima.w.none': 'not played yet', 'aima.w.split': 'of which', 'aima.w.play': 'playing', 'aima.w.learn': 'learning',
    'aima.w.expected': 'Expected now', 'aima.w.lon': 'learning on', 'aima.w.loff': 'off',
    'aima.w.decision': 'One decision', 'aima.w.step': 'one learning step', 'aima.w.total': 'Total so far', 'aima.w.memory': 'Memory it holds',
    'aima.w.hint': 'How heavy this brain is, counted in arithmetic operations: the same number on any TV or PC. How much of the CPU it takes then depends on the device. Fast training runs many seconds of play per real second.'
  });
  Object.assign(D.fr, { 'aima.w.title': 'TRAVAIL', 'aima.w.sub': 'operations, identique sur tous les appareils', 'aima.w.persec': 'ops / s de jeu',
    'aima.w.measured': 'Mesure', 'aima.w.expected': 'Prevu', 'aima.w.play': 'jeu', 'aima.w.learn': 'apprentissage', 'aima.w.memory': 'Memoire' });
  Object.assign(D.es, { 'aima.w.title': 'TRABAJO', 'aima.w.sub': 'operaciones, igual en todos los aparatos', 'aima.w.persec': 'ops / s de juego',
    'aima.w.measured': 'Medido', 'aima.w.expected': 'Previsto', 'aima.w.play': 'juego', 'aima.w.learn': 'aprendizaje', 'aima.w.memory': 'Memoria' });
  Object.assign(D.ar, { 'aima.w.title': '\u0627\u0644\u0639\u0645\u0644', 'aima.w.persec': 'ops / s' });

  // checkoAI: several brains in one training
  Object.assign(D.en, { 'aima.tr.which': 'Brains to train:', 'aima.tr.each': 'Each other', 'aima.tr.perbrain': 'Matches per brain',
    'aima.tr.brains': 'brains',
    'aima.tr.hint': 'Tick the brains to train: their matches take turns, so they all progress together. Opponent: the CPU at any level, the ticked brains against each other, or one brain. Every brain that plays learns and is saved after each of its matches.' });
  Object.assign(D.fr, { 'aima.tr.which': 'Cerveaux a entrainer :', 'aima.tr.each': 'Entre eux', 'aima.tr.perbrain': 'Matchs par cerveau', 'aima.tr.brains': 'cerveaux' });
  Object.assign(D.es, { 'aima.tr.which': 'Cerebros a entrenar:', 'aima.tr.each': 'Entre ellos', 'aima.tr.perbrain': 'Partidos por cerebro', 'aima.tr.brains': 'cerebros' });

  // checkoAI: training sessions
  Object.assign(D.en, {
    'aima.ss.new': 'New training for', 'aima.ss.start': 'Start training', 'aima.ss.stopall': 'Stop all', 'aima.ss.remove': 'Remove',
    'aima.ss.hint': 'Each training is its own session: its brain (the one picked at the top), opponent, matches and pitch, with its own progress. Start as many as you like: the running ones take turns, one match each. The opponent brain learns too. Every brain is saved after each of its matches.',
    'aima.ss.loading': 'loading', 'aima.ss.running': 'running', 'aima.ss.done': 'done', 'aima.ss.stopped': 'stopped', 'aima.ss.error': 'error',
    'aima.ss.now': 'playing now', 'aima.tr.log': 'MATCHES', 'aima.tr.forever': 'Continuous'
  });
  Object.assign(D.fr, { 'aima.ss.new': 'Nouvel entrainement pour', 'aima.tr.forever': 'Continu', 'aima.ss.start': 'Lancer', 'aima.ss.stopall': 'Tout arreter', 'aima.ss.remove': 'Retirer',
    'aima.ss.running': 'en cours', 'aima.ss.done': 'termine', 'aima.ss.stopped': 'arrete' });
  Object.assign(D.es, { 'aima.ss.new': 'Nuevo entrenamiento para', 'aima.tr.forever': 'Continuo', 'aima.ss.start': 'Empezar', 'aima.ss.stopall': 'Parar todo', 'aima.ss.remove': 'Quitar',
    'aima.ss.running': 'en curso', 'aima.ss.done': 'terminado', 'aima.ss.stopped': 'parado' });

  // checkoAI v1.20: more inputs
  Object.assign(D.en, {
    'aima.o.past': 'Memory of the last seconds', 'aima.o.past.h': 'He also sees what just happened: who had the ball a second ago, his last pass / shot / tackle and how it went, recent shots, where the play is going',
    'aima.h.inputs': 'new inputs',
    'aima.pick.model': 'checkoAI model', 'aima.pick.model.h': 'Which of his models plays (all matches use it). Models are made and trained in the checkoAI tab'
  });
  Object.assign(D.fr, { 'aima.o.past': 'Memoire des dernieres secondes', 'aima.h.inputs': 'nouvelles entrees' });
  Object.assign(D.es, { 'aima.o.past': 'Memoria de los ultimos segundos', 'aima.h.inputs': 'nuevas entradas' });

  // the sides screen (FIFA / PES style)
  Object.assign(D.en, { 'sides.how': 'Push your stick left for the home team, right for the away team, middle to watch. A team with no player is played by the CPU.', 'sides.ctrl': 'CONTROLLERS' });
  Object.assign(D.fr, { 'sides.how': 'Poussez le stick a gauche pour domicile, a droite pour exterieur, au milieu pour regarder. Une equipe sans joueur est jouee par le CPU.', 'sides.ctrl': 'MANETTES' });
  Object.assign(D.es, { 'sides.how': 'Mueve el stick a la izquierda para local, a la derecha para visitante, al centro para mirar. Un equipo sin jugador lo juega la CPU.', 'sides.ctrl': 'MANDOS' });

  // checkoAI: the punishment, the D-pad
  Object.assign(D.en, { 'mv.punish': 'Punish checkoAI: that was bad (hold = stronger)', 'aima.t.sorry': 'Sorry coach!',
    'map.dpad': 'The D-pad moves the player: it can only be the clap or the punishment.' });
  Object.assign(D.fr, { 'mv.punish': 'Punir checkoAI : c\'etait mauvais (maintenir = plus fort)', 'aima.t.sorry': 'Pardon coach !',
    'map.dpad': 'La croix deplace le joueur : seulement pour applaudir ou punir.' });
  Object.assign(D.es, { 'mv.punish': 'Castigar a checkoAI: eso estuvo mal (mantener = mas fuerte)', 'aima.t.sorry': 'Perdon, mister!',
    'map.dpad': 'La cruceta mueve al jugador: solo para aplaudir o castigar.' });

  // ends of the pitch
  Object.assign(D.en, { 'set.ends': 'Ends', 'set.ends.h': 'First half: home team on the left, or drawn at random. The teams change ends at half time.',
    'opt.ends.home': 'HOME LEFT', 'opt.ends.random': 'RANDOM', 'aima.k.punish': 'Punishments' });
  Object.assign(D.fr, { 'set.ends': 'Cotes du terrain', 'set.ends.h': '1re mi-temps : domicile a gauche, ou au hasard. Les equipes changent de cote a la mi-temps.',
    'opt.ends.home': 'DOMICILE A GAUCHE', 'opt.ends.random': 'AU HASARD', 'aima.k.punish': 'Punitions' });
  Object.assign(D.es, { 'set.ends': 'Campos', 'set.ends.h': '1a parte: local a la izquierda, o al azar. Los equipos cambian de campo en el descanso.',
    'opt.ends.home': 'LOCAL IZQUIERDA', 'opt.ends.random': 'AL AZAR', 'aima.k.punish': 'Castigos' });

  // the biggest stadium
  Object.assign(D.en, { 'opt.st.ultra': 'Ultra 200x130' });
  Object.assign(D.fr, { 'opt.st.ultra': 'Ultra 200x130' });
  Object.assign(D.es, { 'opt.st.ultra': 'Ultra 200x130' });

  Object.assign(D.en, { 'aima.k.agree': 'Same direction as Legend' });
  Object.assign(D.fr, { 'aima.k.agree': 'Meme direction que Legend' });
  Object.assign(D.es, { 'aima.k.agree': 'Misma direccion que Legend' });

  // checkoAI plays the whole team: Legend's passes / shots / tackles and his odds of the same button
  Object.assign(D.en, { 'aima.k.presssame': 'Same button as Legend at his passes / shots', 'aima.k.pressodds': 'his odds of it', 'aima.h100': 'Legend 100% (copy only)' });
  Object.assign(D.fr, { 'aima.k.presssame': 'Meme bouton que Legend a ses passes / tirs', 'aima.k.pressodds': 'ses chances', 'aima.h100': 'Legend 100% (copie seule)' });
  Object.assign(D.es, { 'aima.k.presssame': 'Mismo boton que Legend en sus pases / tiros', 'aima.k.pressodds': 'sus probabilidades', 'aima.h100': 'Legend 100% (solo copia)' });

  // a training's time limit
  Object.assign(D.en, { 'dbg.hours': 'Stop after (hours)', 'aima.tr.nolimit': 'No limit' });
  // what each tactics choice makes the CPU do (Game plan)
  Object.assign(D.en, { 'tac.h00': 'Defence: low block, protects the box', 'tac.h01': 'Defence: mid block around halfway', 'tac.h02': 'Defence: high press in their half',
    'tac.h10': 'Midfield: only the nearest presses', 'tac.h11': 'Midfield: presses on triggers, counter-presses a lost ball', 'tac.h12': 'Midfield: an extra presser',
    'tac.h20': 'Attack: one more stays behind the ball, fewer runs', 'tac.h21': 'Attack: runs in behind and into the box', 'tac.h22': 'Attack: one more goes forward, more runs' });
  Object.assign(D.fr, { 'tac.h00': 'Defense : bloc bas, protege la surface', 'tac.h01': 'Defense : bloc median vers le milieu', 'tac.h02': 'Defense : pressing haut chez eux',
    'tac.h10': 'Milieu : seul le plus proche presse', 'tac.h11': 'Milieu : presse sur les declencheurs, contre-pressing', 'tac.h12': 'Milieu : un presseur de plus',
    'tac.h20': 'Attaque : un de plus reste derriere, moins de courses', 'tac.h21': 'Attaque : appels dans le dos et dans la surface', 'tac.h22': 'Attaque : un de plus monte, plus de courses' });
  Object.assign(D.es, { 'tac.h00': 'Defensa: bloque bajo, protege el area', 'tac.h01': 'Defensa: bloque medio hacia el centro', 'tac.h02': 'Defensa: presion alta en su campo',
    'tac.h10': 'Medio: solo presiona el mas cercano', 'tac.h11': 'Medio: presiona en los momentos clave, contrapresion', 'tac.h12': 'Medio: un presionador mas',
    'tac.h20': 'Ataque: uno mas se queda atras, menos desmarques', 'tac.h21': 'Ataque: desmarques a la espalda y al area', 'tac.h22': 'Ataque: uno mas sube, mas desmarques' });
  Object.assign(D.en, { 'aima.c.all': 'ALL BRAINS', 'aima.inuse': 'in use (training / learning)', 'aima.sel': 'Show' });
  Object.assign(D.en, { 'aima.d.cont': 'Going on', 'aima.d.before': 'already learnt', 'aima.d.newdec': 'new decisions to catch up', 'aima.d.chunks': 'chunks learnt',
    'aima.d.newchunks': 'new chunks', 'aima.d.never': 'nothing learnt from this set yet' });
  Object.assign(D.fr, { 'aima.d.cont': 'On continue', 'aima.d.before': 'deja appris', 'aima.d.newdec': 'nouvelles decisions a rattraper', 'aima.d.chunks': 'blocs appris', 'aima.d.newchunks': 'nouveaux blocs', 'aima.d.never': 'rien appris de ce jeu' });
  Object.assign(D.es, { 'aima.d.cont': 'Sigue', 'aima.d.before': 'ya aprendidas', 'aima.d.newdec': 'decisiones nuevas por igualar', 'aima.d.chunks': 'bloques aprendidos', 'aima.d.newchunks': 'bloques nuevos', 'aima.d.never': 'nada aprendido de este conjunto' });
  Object.assign(D.fr, { 'aima.c.all': 'TOUS LES CERVEAUX', 'aima.inuse': 'utilise (entrainement)', 'aima.sel': 'Voir' });
  Object.assign(D.es, { 'aima.c.all': 'TODOS LOS CEREBROS', 'aima.inuse': 'en uso (entrenamiento)', 'aima.sel': 'Ver' });
  Object.assign(D.fr, { 'dbg.hours': 'Arret apres (heures)', 'aima.tr.nolimit': 'Sans limite' });
  Object.assign(D.es, { 'dbg.hours': 'Parar tras (horas)', 'aima.tr.nolimit': 'Sin limite' });

  // checkoAI: recorded data (Legend v Legend) and learning from it
  Object.assign(D.en, { 'aima.d.title': 'Recorded data (Legend v Legend)', 'aima.d.none': 'no data set yet', 'aima.d.samples': 'decisions',
    'aima.d.presses': 'passes / shots / tackles', 'aima.d.set': 'Data set', 'aima.d.new': 'new', 'aima.d.passes': 'Passes over the data',
    'aima.d.name': 'name of the new data set', 'aima.d.record': 'Record Legend v Legend', 'aima.d.learnbtn': 'Learn from data',
    'aima.d.needname': 'Give the new data set a name.', 'aima.d.pickset': 'Pick a data set first.', 'aima.d.cant': 'Cannot start now (a match is on, or the set has other inputs).',
    'aima.d.hint': 'Record: Legend plays both teams with the options above (players, stadium, minutes, matches, stop after); every player\'s decisions go into the data set, in the cloud. Learn from data: the brain picked at the top learns from the set without playing (the training matches keep working as before).',
    'aima.d.del': 'Delete data set', 'aima.d.confirmdel': 'Press again to delete this data set (in the cloud too).', 'aima.d.deleted': 'Data set deleted.',
    'aima.d.inuse': 'A job is using this data set.', 'aima.d.rec': 'Recording', 'aima.d.learn': 'Learning from data', 'aima.d.saved': 'chunks saved',
    'aima.d.sending': 'sending', 'aima.d.loading': 'Loading from the cloud', 'aima.d.steps': 'Steps', 'aima.d.learnt': 'learnt (not skipped)',
    'aima.d.sets': 'data', 'aima.d.check': 'kept to check', 'aima.d.score': 'Score on unseen data', 'aima.d.extra': 'presses where Legend pressed nothing',
    'aima.d.skipped': 'chunks skipped (other inputs or missing)', 'aima.d.cloud': 'Cloud', 'aima.d.local': 'not saved to the cloud (not signed in): only in this session',
    'aima.d.nolearn': 'learning is off for this brain (Settings)', 'aima.d.empty': 'the data set is empty', 'aima.d.oldF': 'other inputs: record again',
    'aima.h.data': 'learnt from data', 'aima.d.unsaved': 'not in the cloud yet', 'aima.d.resend': 'Resend unsaved chunks', 'aima.d.resending': 'Sending again...', 'aima.d.signfirst': 'Nothing to send (sign in first, or the app was restarted: record again).' });
  Object.assign(D.fr, { 'aima.d.title': 'Donnees enregistrees (Legend v Legend)', 'aima.d.none': 'aucun jeu de donnees', 'aima.d.samples': 'decisions',
    'aima.d.presses': 'passes / tirs / tacles', 'aima.d.set': 'Jeu de donnees', 'aima.d.new': 'nouveau', 'aima.d.passes': 'Passages sur les donnees',
    'aima.d.name': 'nom du nouveau jeu', 'aima.d.record': 'Enregistrer Legend v Legend', 'aima.d.learnbtn': 'Apprendre des donnees',
    'aima.d.needname': 'Donnez un nom au nouveau jeu.', 'aima.d.pickset': 'Choisissez d\'abord un jeu de donnees.', 'aima.d.cant': 'Impossible maintenant (un match est en cours, ou autres entrees).',
    'aima.d.hint': 'Enregistrer : Legend joue les deux equipes avec les options ci-dessus ; les decisions de chaque joueur vont dans le jeu de donnees, dans le cloud. Apprendre des donnees : le cerveau choisi en haut apprend sans jouer.',
    'aima.d.del': 'Supprimer le jeu', 'aima.d.confirmdel': 'Appuyez encore pour supprimer ce jeu (cloud aussi).', 'aima.d.deleted': 'Jeu supprime.',
    'aima.d.inuse': 'Une tache utilise ce jeu.', 'aima.d.rec': 'Enregistrement', 'aima.d.learn': 'Apprentissage', 'aima.d.saved': 'morceaux enregistres',
    'aima.d.sending': 'en envoi', 'aima.d.loading': 'Chargement du cloud', 'aima.d.steps': 'Pas', 'aima.d.learnt': 'appris (non sautes)',
    'aima.d.sets': 'donnees', 'aima.d.check': 'gardees pour verifier', 'aima.d.score': 'Score sur donnees inconnues', 'aima.d.extra': 'appuis la ou Legend n\'appuie pas',
    'aima.d.skipped': 'morceaux sautes', 'aima.d.cloud': 'Cloud', 'aima.d.local': 'non enregistre dans le cloud (non connecte)',
    'aima.d.nolearn': 'apprentissage desactive pour ce cerveau', 'aima.d.empty': 'jeu de donnees vide', 'aima.d.oldF': 'autres entrees : reenregistrer',
    'aima.h.data': 'appris des donnees', 'aima.d.unsaved': 'pas encore dans le cloud', 'aima.d.resend': 'Renvoyer les morceaux', 'aima.d.resending': 'Nouvel envoi...', 'aima.d.signfirst': 'Rien a envoyer (connectez-vous, ou relancez un enregistrement).' });
  Object.assign(D.es, { 'aima.d.title': 'Datos grabados (Legend v Legend)', 'aima.d.none': 'aun no hay datos', 'aima.d.samples': 'decisiones',
    'aima.d.presses': 'pases / tiros / entradas', 'aima.d.set': 'Conjunto de datos', 'aima.d.new': 'nuevo', 'aima.d.passes': 'Pasadas por los datos',
    'aima.d.name': 'nombre del nuevo conjunto', 'aima.d.record': 'Grabar Legend v Legend', 'aima.d.learnbtn': 'Aprender de los datos',
    'aima.d.needname': 'Ponle nombre al nuevo conjunto.', 'aima.d.pickset': 'Elige primero un conjunto.', 'aima.d.cant': 'No se puede ahora (hay un partido, u otras entradas).',
    'aima.d.hint': 'Grabar: Legend juega con los dos equipos con las opciones de arriba; las decisiones de cada jugador van al conjunto, en la nube. Aprender de los datos: el cerebro elegido arriba aprende sin jugar.',
    'aima.d.del': 'Borrar conjunto', 'aima.d.confirmdel': 'Pulsa otra vez para borrarlo (tambien en la nube).', 'aima.d.deleted': 'Conjunto borrado.',
    'aima.d.inuse': 'Una tarea usa este conjunto.', 'aima.d.rec': 'Grabando', 'aima.d.learn': 'Aprendiendo de datos', 'aima.d.saved': 'trozos guardados',
    'aima.d.sending': 'enviando', 'aima.d.loading': 'Cargando de la nube', 'aima.d.steps': 'Pasos', 'aima.d.learnt': 'aprendidos (no saltados)',
    'aima.d.sets': 'datos', 'aima.d.check': 'para comprobar', 'aima.d.score': 'Puntuacion con datos no vistos', 'aima.d.extra': 'pulsaciones donde Legend no pulso',
    'aima.d.skipped': 'trozos saltados', 'aima.d.cloud': 'Nube', 'aima.d.local': 'no guardado en la nube (sin sesion)',
    'aima.d.nolearn': 'el aprendizaje esta desactivado para este cerebro', 'aima.d.empty': 'el conjunto esta vacio', 'aima.d.oldF': 'otras entradas: grabar de nuevo',
    'aima.h.data': 'aprendio de datos', 'aima.d.unsaved': 'aun no en la nube', 'aima.d.resend': 'Reenviar trozos', 'aima.d.resending': 'Enviando de nuevo...', 'aima.d.signfirst': 'Nada que enviar (inicia sesion, o graba de nuevo).' });

  var lang = 'en';

  NS.I18n = {
    setLang: function (l) { lang = D[l] ? l : 'en'; },
    lang: function () { return lang; },
    t: function (key) {
      var v = D[lang][key];
      if (v === undefined) v = D.en[key];
      return v === undefined ? key : v;
    },
    // Fills every [data-i18n] element (static HTML) and the document title.
    applyDom: function () {
      var nodes = document.querySelectorAll('[data-i18n]');
      for (var i = 0; i < nodes.length; i++) nodes[i].textContent = this.t(nodes[i].getAttribute('data-i18n'));
    }
  };
})(window.RS6 = window.RS6 || {});
