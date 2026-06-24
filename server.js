const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const {
    COLORES,
    FRUTAS,
    ANIMALES,
    COSAS,
    NOMBRES,
    APELLIDOS,
    LUGARES,
    BLACKLIST
} = require('./data.js');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const FIXED_CATEGORIES = [
    'NOMBRE',
    'APELLIDO',
    'COSA',
    'COLOR',
    'FRUTA',
    'PAÍS/CIUDAD',
    'ANIMAL'
];

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function validateWordLocal(word, category, letter) {
    if (!word || word.length < 2) return { valid: false, reason: 'Palabra demasiado corta', needsVote: false };
    const normalized = word.toUpperCase().trim();
    if (normalized[0] !== letter) return { valid: false, reason: `No comienza con la letra ${letter}`, needsVote: false };
    if (BLACKLIST.includes(normalized)) return { valid: false, reason: 'Palabra no válida (trampa detectada)', needsVote: false };

    if (category === 'COLOR') {
        if (COLORES.includes(normalized)) return { valid: true, reason: 'Color válido', needsVote: false };
        return { valid: false, reason: 'Color no encontrado en la lista', needsVote: true };
    }
    if (category === 'FRUTA') {
        if (FRUTAS.includes(normalized)) return { valid: true, reason: 'Fruta válida', needsVote: false };
        return { valid: false, reason: 'Fruta no encontrada en la lista', needsVote: true };
    }
    if (category === 'ANIMAL') {
        if (ANIMALES.includes(normalized)) return { valid: true, reason: 'Animal válido', needsVote: false };
        return { valid: false, reason: 'Animal no encontrado en la lista', needsVote: true };
    }
    if (category === 'COSA') {
        if (COSAS.includes(normalized)) return { valid: true, reason: 'Cosa válida', needsVote: false };
        if (normalized.length >= 4) return { valid: false, reason: 'Cosa no encontrada en la lista', needsVote: true };
        return { valid: false, reason: 'Cosa no válida', needsVote: false };
    }
    if (category === 'PAÍS/CIUDAD') {
        if (LUGARES.includes(normalized)) return { valid: true, reason: 'País/Ciudad válido', needsVote: false };
        if (normalized.length >= 3) return { valid: false, reason: 'País/Ciudad no encontrado en la lista', needsVote: true };
        return { valid: false, reason: 'País/Ciudad no válido', needsVote: false };
    }
    if (category === 'NOMBRE') {
        if (NOMBRES.includes(normalized) || normalized.length >= 3) return { valid: true, reason: 'Nombre aceptado', needsVote: false };
        return { valid: false, reason: 'Nombre no válido', needsVote: false };
    }
    if (category === 'APELLIDO') {
        if (APELLIDOS.includes(normalized) || normalized.length >= 3) return { valid: true, reason: 'Apellido aceptado', needsVote: false };
        return { valid: false, reason: 'Apellido no válido', needsVote: false };
    }
    return { valid: false, reason: 'Palabra no válida', needsVote: false };
}

const games = {};

io.on('connection', (socket) => {
    console.log(`🟢 Usuario conectado: ${socket.id}`);

    socket.on('createGame', (data) => {
        const { gameId, playerName, maxPlayers } = data;
        if (games[gameId]) {
            socket.emit('error', 'Ya existe una sala con ese código');
            return;
        }

        games[gameId] = {
            players: [],
            maxPlayers: maxPlayers || 8,
            categories: [...FIXED_CATEGORIES],
            currentLetter: '',
            round: 0,
            maxRounds: 26,
            phase: 'waiting',
            answers: {},
            stopPlayer: null,
            roundActive: false,
            timer: null,
            timeLimit: 60,
            timeLeft: 60,
            host: socket.id,
            gameStarted: false,
            roundNumber: 0,
            pendingVotes: {},
            usedLetters: [],
            alphabetComplete: false,
            processing: false,
            letterPickerIndex: 0,
            choosingLetter: false,
            letterChoiceTimeout: null,
            roundFinished: false,
            votesProcessed: false,
            resultsCalculated: false,
            waitingForVotes: false
        };

        const game = games[gameId];
        game.players.push({
            id: socket.id,
            name: playerName || 'Jugador',
            score: 0,
            isHost: true,
            connected: true
        });

        socket.join(gameId);
        socket.emit('gameCreated', { gameId });
        io.to(gameId).emit('gameState', getGameState(gameId));
        io.to(gameId).emit('playersUpdate', getPlayersInfo(gameId));
        console.log(`🏠 Sala ${gameId} creada por ${playerName}`);
    });

    socket.on('joinGame', (data) => {
        const { gameId, playerName } = data;
        const game = games[gameId];
        if (!game) { socket.emit('error', 'La sala no existe'); return; }
        if (game.players.length >= game.maxPlayers) { socket.emit('error', 'La sala está llena'); return; }
        if (game.gameStarted) { socket.emit('error', 'La partida ya ha comenzado'); return; }

        const existingPlayer = game.players.find(p => p.id === socket.id);
        if (existingPlayer) {
            existingPlayer.connected = true;
            existingPlayer.name = playerName || existingPlayer.name;
        } else {
            game.players.push({
                id: socket.id,
                name: playerName || 'Jugador',
                score: 0,
                isHost: false,
                connected: true
            });
        }

        socket.join(gameId);
        io.to(gameId).emit('gameState', getGameState(gameId));
        io.to(gameId).emit('playersUpdate', getPlayersInfo(gameId));
        io.to(gameId).emit('chatMessage', {
            player: 'Sistema',
            message: `${playerName || 'Jugador'} se ha unido a la sala`,
            system: true
        });
    });

    socket.on('startGame', (data) => {
        const { gameId } = data;
        const game = games[gameId];
        if (!game) {
            socket.emit('error', 'La sala no existe');
            return;
        }

        const player = game.players.find(p => p.id === socket.id);
        if (!player || !player.isHost) {
            socket.emit('error', 'Solo el anfitrión puede iniciar la partida');
            return;
        }

        if (game.players.length < 2) {
            socket.emit('error', 'Se necesitan al menos 2 jugadores');
            return;
        }

        game.gameStarted = true;
        game.roundNumber = 0;
        game.players.forEach(p => p.score = 0);
        game.usedLetters = [];
        game.alphabetComplete = false;
        game.processing = false;
        game.letterPickerIndex = 0;
        game.choosingLetter = false;
        game.answers = {};
        game.stopPlayer = null;
        game.roundActive = false;
        game.currentLetter = '';
        game.pendingVotes = {};
        game.roundFinished = false;
        game.votesProcessed = false;
        game.resultsCalculated = false;
        game.waitingForVotes = false;
        
        if (game.letterChoiceTimeout) {
            clearTimeout(game.letterChoiceTimeout);
            game.letterChoiceTimeout = null;
        }
        if (game.timer) {
            clearInterval(game.timer);
            game.timer = null;
        }

        io.to(gameId).emit('gameState', getGameState(gameId));
        io.to(gameId).emit('chatMessage', {
            player: 'Sistema',
            message: `🎮 ¡La partida ha comenzado!`,
            system: true
        });

        setTimeout(() => {
            startRound(gameId);
        }, 1500);
    });

    socket.on('chooseLetter', (data) => {
        const { gameId, letter } = data;
        const game = games[gameId];
        if (!game) { socket.emit('error', 'La sala no existe'); return; }

        console.log(`📩 Elección de letra: ${letter} en sala ${gameId}, fase: ${game.phase}`);

        if (game.phase !== 'choosing_letter') {
            socket.emit('error', 'No es momento de elegir letra');
            return;
        }

        const activePlayers = game.players.filter(p => p.connected);
        if (activePlayers.length === 0) return;
        if (game.letterPickerIndex >= activePlayers.length) game.letterPickerIndex = 0;
        const currentPicker = activePlayers[game.letterPickerIndex];
        if (!currentPicker || currentPicker.id !== socket.id) {
            socket.emit('error', 'No es tu turno para elegir la letra');
            return;
        }

        const cleanLetter = letter.toUpperCase().trim();
        if (cleanLetter.length !== 1 || !LETTERS.includes(cleanLetter)) {
            socket.emit('error', 'Debes elegir una letra válida (A-Z)');
            return;
        }
        if (game.usedLetters.includes(cleanLetter)) {
            socket.emit('error', `❌ La letra ${cleanLetter} ya fue usada`);
            return;
        }

        if (game.letterChoiceTimeout) {
            clearTimeout(game.letterChoiceTimeout);
            game.letterChoiceTimeout = null;
        }

        game.usedLetters.push(cleanLetter);
        game.currentLetter = cleanLetter;
        game.choosingLetter = false;
        game.phase = 'playing';
        game.roundActive = true;
        game.timeLeft = game.timeLimit || 60;
        game.answers = {};
        game.stopPlayer = null;
        game.processing = false;
        game.roundFinished = false;
        game.resultsCalculated = false;
        game.waitingForVotes = false;

        game.players.forEach(p => {
            game.answers[p.id] = {
                playerName: p.name,
                answers: {},
                stopped: false,
                stoppedAt: null
            };
        });

        game.letterPickerIndex = (game.letterPickerIndex + 1) % activePlayers.length;

        io.to(gameId).emit('letterChosen', {
            letter: cleanLetter,
            chosenBy: currentPicker.name,
            round: game.roundNumber,
            usedLetters: game.usedLetters
        });

        io.to(gameId).emit('roundStarted', {
            round: game.roundNumber,
            letter: cleanLetter,
            categories: game.categories,
            timeLimit: game.timeLimit,
            usedLetters: game.usedLetters
        });

        io.to(gameId).emit('gameState', getGameState(gameId));

        game.timer = setInterval(() => {
            game.timeLeft--;
            io.to(gameId).emit('timerUpdate', { timeLeft: game.timeLeft });
            if (game.timeLeft <= 0) {
                clearInterval(game.timer);
                console.log(`⏰ Tiempo agotado en sala ${gameId}, ronda ${game.roundNumber}`);
                finalizarRonda(gameId);
            }
        }, 1000);
    });

    function startRound(gameId) {
        const game = games[gameId];
        if (!game) return;

        console.log(`🔄 Iniciando ronda ${game.roundNumber + 1} en sala ${gameId}`);

        if (game.usedLetters.length >= 26) {
            game.alphabetComplete = true;
            game.phase = 'finished';
            game.gameStarted = false;
            const winner = game.players.reduce((a, b) => a.score > b.score ? a : b);
            io.to(gameId).emit('gameFinished', {
                winner: winner,
                players: game.players.map(p => ({ name: p.name, score: p.score })),
                alphabetComplete: true
            });
            io.to(gameId).emit('gameState', getGameState(gameId));
            return;
        }

        game.roundNumber++;
        game.phase = 'choosing_letter';
        game.choosingLetter = true;
        game.roundActive = false;
        game.answers = {};
        game.stopPlayer = null;
        game.processing = false;
        game.roundFinished = false;
        game.pendingVotes = {};
        game.resultsCalculated = false;
        game.waitingForVotes = false;

        if (game.letterChoiceTimeout) {
            clearTimeout(game.letterChoiceTimeout);
            game.letterChoiceTimeout = null;
        }

        const activePlayers = game.players.filter(p => p.connected);
        if (activePlayers.length === 0) return;
        if (game.letterPickerIndex >= activePlayers.length) game.letterPickerIndex = 0;
        const currentPicker = activePlayers[game.letterPickerIndex];
        const availableLetters = LETTERS.split('').filter(l => !game.usedLetters.includes(l));

        console.log(`🎯 Ronda ${game.roundNumber}: ${currentPicker.name} debe elegir letra. Disponibles: ${availableLetters.length}`);

        io.to(gameId).emit('chooseLetter', {
            round: game.roundNumber,
            pickerName: currentPicker.name,
            pickerId: currentPicker.id,
            availableLetters: availableLetters,
            usedLetters: game.usedLetters
        });

        io.to(gameId).emit('gameState', getGameState(gameId));

        game.letterChoiceTimeout = setTimeout(() => {
            if (game.phase === 'choosing_letter' && game.choosingLetter) {
                console.log(`⏰ Tiempo agotado en sala ${gameId}, asignando letra aleatoria`);
                
                const available = LETTERS.split('').filter(l => !game.usedLetters.includes(l));
                if (available.length === 0) {
                    game.alphabetComplete = true;
                    game.phase = 'finished';
                    game.gameStarted = false;
                    const winner = game.players.reduce((a, b) => a.score > b.score ? a : b);
                    io.to(gameId).emit('gameFinished', {
                        winner: winner,
                        players: game.players.map(p => ({ name: p.name, score: p.score })),
                        alphabetComplete: true
                    });
                    io.to(gameId).emit('gameState', getGameState(gameId));
                    return;
                }

                const randomLetter = available[Math.floor(Math.random() * available.length)];
                game.usedLetters.push(randomLetter);
                game.currentLetter = randomLetter;
                game.choosingLetter = false;
                game.phase = 'playing';
                game.roundActive = true;
                game.timeLeft = game.timeLimit || 60;
                game.answers = {};
                game.stopPlayer = null;
                game.processing = false;
                game.roundFinished = false;
                game.resultsCalculated = false;
                game.waitingForVotes = false;

                game.players.forEach(p => {
                    game.answers[p.id] = {
                        playerName: p.name,
                        answers: {},
                        stopped: false,
                        stoppedAt: null
                    };
                });

                const currentActive = game.players.filter(p => p.connected);
                game.letterPickerIndex = (game.letterPickerIndex + 1) % currentActive.length;

                io.to(gameId).emit('letterChosen', {
                    letter: randomLetter,
                    chosenBy: 'Sistema (tiempo agotado)',
                    round: game.roundNumber,
                    usedLetters: game.usedLetters
                });

                io.to(gameId).emit('roundStarted', {
                    round: game.roundNumber,
                    letter: randomLetter,
                    categories: game.categories,
                    timeLimit: game.timeLimit,
                    usedLetters: game.usedLetters
                });

                io.to(gameId).emit('gameState', getGameState(gameId));

                game.timer = setInterval(() => {
                    game.timeLeft--;
                    io.to(gameId).emit('timerUpdate', { timeLeft: game.timeLeft });
                    if (game.timeLeft <= 0) {
                        clearInterval(game.timer);
                        finalizarRonda(gameId);
                    }
                }, 1000);
            }
        }, 30000);
    }

    socket.on('sendAnswer', (data) => {
        const { gameId, category, answer } = data;
        const game = games[gameId];
        if (!game) return;
        if (game.phase !== 'playing' || !game.roundActive) return;
        if (game.processing || game.waitingForVotes) return;

        const player = game.players.find(p => p.id === socket.id);
        if (!player) return;

        const playerAnswers = game.answers[player.id];
        if (!playerAnswers || playerAnswers.stopped) return;

        playerAnswers.answers[category] = answer.trim().toUpperCase();
        socket.emit('answerSaved', { category, answer });
        
        const allAnswered = checkAllAnswered(game);
        if (allAnswered) {
            clearInterval(game.timer);
            finalizarRonda(gameId);
        }
    });

    socket.on('sayStop', (data) => {
        const { gameId } = data;
        const game = games[gameId];
        if (!game) return;
        if (game.phase !== 'playing' || !game.roundActive) return;
        if (game.processing || game.waitingForVotes) return;

        const player = game.players.find(p => p.id === socket.id);
        if (!player) return;

        const playerAnswers = game.answers[player.id];
        if (playerAnswers.stopped) return;

        const categories = game.categories;
        let allFilled = true;
        let emptyCategories = [];

        for (let cat of categories) {
            if (!playerAnswers.answers[cat] || playerAnswers.answers[cat].trim().length === 0) {
                allFilled = false;
                emptyCategories.push(cat);
            }
        }

        if (!allFilled) {
            socket.emit('error', `❌ Debes llenar todas las casillas. Faltan: ${emptyCategories.join(', ')}`);
            return;
        }

        playerAnswers.stopped = true;
        game.stopPlayer = player.id;

        io.to(gameId).emit('playerStopped', {
            playerName: player.name,
            playerId: player.id
        });
        
        io.to(gameId).emit('chatMessage', {
            player: 'Sistema',
            message: `🛑 ${player.name} ha dicho STOP!`,
            system: true
        });

        clearInterval(game.timer);
        
        console.log(`🛑 STOP en sala ${gameId} por ${player.name}, ronda ${game.roundNumber}`);
        
        setTimeout(() => {
            finalizarRonda(gameId);
        }, 1500);
    });

    socket.on('voteWord', (data) => {
        const { gameId, playerId, word, category, vote } = data;
        const game = games[gameId];
        if (!game) return;
        if (!game.pendingVotes[word]) {
            game.pendingVotes[word] = {
                category: category,
                votes: {},
                total: 0,
                approved: false,
                resolved: false,
                voters: []
            };
        }

        const voteData = game.pendingVotes[word];
        if (voteData.resolved) return;

        if (!voteData.votes[playerId]) {
            voteData.votes[playerId] = vote;
            voteData.total++;
            if (!voteData.voters.includes(playerId)) voteData.voters.push(playerId);
        } else {
            voteData.votes[playerId] = vote;
        }

        const votesFor = Object.values(voteData.votes).filter(v => v === true).length;
        const votesAgainst = Object.values(voteData.votes).filter(v => v === false).length;
        const totalVotes = Object.keys(voteData.votes).length;
        const activePlayers = game.players.filter(p => p.connected).length;

        io.to(gameId).emit('voteProgress', {
            word: word,
            votesFor: votesFor,
            votesAgainst: votesAgainst,
            total: totalVotes,
            remaining: activePlayers - totalVotes,
            voters: voteData.voters
        });

        if (totalVotes >= activePlayers) {
            voteData.resolved = true;
            voteData.approved = votesFor > votesAgainst;
            
            io.to(gameId).emit('voteResult', {
                word: word,
                category: category,
                approved: voteData.approved,
                votesFor: votesFor,
                votesAgainst: votesAgainst,
                voters: voteData.voters
            });
            
            io.to(gameId).emit('chatMessage', {
                player: 'Sistema',
                message: `📊 Votación para "${word}": ${votesFor} a favor, ${votesAgainst} en contra - ${voteData.approved ? '✅ APROBADA' : '❌ RECHAZADA'}`,
                system: true
            });

            checkAllVotesResolved(gameId);
        }
    });

    function checkAllVotesResolved(gameId) {
        const game = games[gameId];
        if (!game) return;

        const pendingWords = Object.keys(game.pendingVotes);
        if (pendingWords.length === 0) return;

        const allResolved = pendingWords.every(word => game.pendingVotes[word].resolved === true);
        
        if (allResolved && !game.votesProcessed) {
            game.votesProcessed = true;
            game.waitingForVotes = false;
            
            io.to(gameId).emit('allVotesResolved', { success: true });
            io.to(gameId).emit('chatMessage', {
                player: 'Sistema',
                message: '✅ Todas las votaciones han sido resueltas.',
                system: true
            });
            
            console.log(`✅ Votaciones resueltas en sala ${gameId}`);
            
            // Volver a llamar a finalizarRonda para procesar los resultados
            setTimeout(() => {
                finalizarRonda(gameId);
            }, 1000);
        }
    }

    // =====================================================
    // FUNCIÓN PRINCIPAL PARA FINALIZAR RONDA
    // =====================================================
    function finalizarRonda(gameId) {
        const game = games[gameId];
        if (!game) {
            console.log(`❌ Sala ${gameId} no encontrada`);
            return;
        }

        console.log(`📌 [1] finalizarRonda llamada para ronda ${game.roundNumber} en sala ${gameId}`);

        // Si ya terminó, salir
        if (game.roundFinished || game.resultsCalculated) {
            console.log(`⚠️ Ronda ${game.roundNumber} ya terminó`);
            return;
        }

        // Si ya está procesando, salir
        if (game.processing) {
            console.log(`⚠️ Ronda ${game.roundNumber} ya está siendo procesada`);
            return;
        }

        // Si está esperando votos, no hacer nada
        if (game.waitingForVotes) {
            console.log(`⏳ Ronda ${game.roundNumber} está esperando votaciones`);
            return;
        }

        // Marcar como procesando
        game.processing = true;
        console.log(`📌 [2] Marcado como processing=true`);

        try {
            console.log(`📌 [3] Validando respuestas...`);
            const validationResults = validateAllAnswersLocal(game);
            console.log(`📌 [4] Validación completada: ${Object.keys(validationResults).length} respuestas`);

            const wordsToVote = Object.values(validationResults).filter(r => r.needsVote && r.word && r.word.length > 0);
            console.log(`📌 [5] Palabras que necesitan votación: ${wordsToVote.length}`);

            if (wordsToVote.length > 0) {
                console.log(`📌 [6] Iniciando votación para ${wordsToVote.length} palabras`);
                game.pendingVotes = {};
                game.votesProcessed = false;
                game.processing = false;
                game.resultsCalculated = false;
                game.waitingForVotes = true;
                
                wordsToVote.forEach(item => {
                    game.pendingVotes[item.word] = {
                        category: item.category,
                        votes: {},
                        total: 0,
                        approved: false,
                        resolved: false,
                        voters: []
                    };
                });
                
                io.to(gameId).emit('startVoting', {
                    words: wordsToVote,
                    message: '📋 Algunas palabras no se encontraron. ¡Voten si son válidas!'
                });
                
                io.to(gameId).emit('chatMessage', {
                    player: 'Sistema',
                    message: `📋 Iniciando votación para ${wordsToVote.length} palabras no encontradas`,
                    system: true
                });
                console.log(`📌 [7] Votación iniciada, saliendo (waitingForVotes=true)`);
                return;
            }

            console.log(`📌 [8] No hay votaciones, calculando resultados...`);
            game.resultsCalculated = true;
            game.roundFinished = true;
            game.phase = 'results';
            game.roundActive = false;
            game.processing = false;
            clearInterval(game.timer);

            const results = calculateRoundResults(game, validationResults);
            console.log(`📌 [9] Resultados calculados: ${results.length} jugadores`);

            for (let result of results) {
                const player = game.players.find(p => p.id === result.playerId);
                if (player) {
                    player.score += result.points;
                    result.totalScore = player.score;
                }
            }

            console.log(`📌 [10] Emitiendo roundResults...`);
            io.to(gameId).emit('roundResults', {
                results: results,
                letter: game.currentLetter,
                categories: game.categories,
                stopPlayer: game.stopPlayer,
                stopPlayerName: game.players.find(p => p.id === game.stopPlayer)?.name || 'Nadie',
                roundNumber: game.roundNumber,
                maxRounds: game.maxRounds,
                usedLetters: game.usedLetters
            });

            io.to(gameId).emit('chatMessage', {
                player: 'Sistema',
                message: `📊 ¡Ronda ${game.roundNumber} finalizada!`,
                system: true
            });

            io.to(gameId).emit('gameState', getGameState(gameId));
            console.log(`✅ [11] Ronda ${game.roundNumber} finalizada con éxito en sala ${gameId}`);

        } catch (error) {
            console.error(`❌ Error en finalizarRonda:`, error);
            game.processing = false;
            
            try {
                console.log(`📌 [12] Intentando finalización de emergencia...`);
                game.resultsCalculated = true;
                game.roundFinished = true;
                game.phase = 'results';
                game.roundActive = false;
                game.waitingForVotes = false;
                clearInterval(game.timer);
                
                const emptyResults = game.players.filter(p => p.connected).map(p => ({
                    playerId: p.id,
                    playerName: p.name,
                    answers: {},
                    points: 0,
                    stopped: false,
                    totalScore: p.score
                }));

                io.to(gameId).emit('roundResults', {
                    results: emptyResults,
                    letter: game.currentLetter || '?',
                    categories: game.categories,
                    stopPlayer: null,
                    stopPlayerName: 'Nadie',
                    roundNumber: game.roundNumber,
                    maxRounds: game.maxRounds,
                    usedLetters: game.usedLetters || []
                });

                io.to(gameId).emit('chatMessage', {
                    player: 'Sistema',
                    message: `⚠️ Ronda ${game.roundNumber} finalizada en modo de emergencia.`,
                    system: true
                });

                io.to(gameId).emit('gameState', getGameState(gameId));
                console.log(`✅ Ronda ${game.roundNumber} finalizada en modo de emergencia`);
            } catch (e2) {
                console.error(`❌ Error en finalización de emergencia:`, e2);
            }
        }
    }

    function validateAllAnswersLocal(game) {
        const results = {};
        const players = game.players.filter(p => p.connected);
        
        for (let player of players) {
            const playerAnswers = game.answers[player.id];
            if (!playerAnswers) continue;
            for (let cat of game.categories) {
                const answer = playerAnswers.answers[cat] || '';
                if (answer.length === 0) {
                    results[`${player.id}_${cat}`] = {
                        playerId: player.id,
                        category: cat,
                        word: answer,
                        valid: false,
                        needsVote: false
                    };
                    continue;
                }
                
                const validation = validateWordLocal(answer, cat, game.currentLetter);
                results[`${player.id}_${cat}`] = {
                    playerId: player.id,
                    category: cat,
                    word: answer,
                    valid: validation.valid,
                    needsVote: validation.needsVote || false,
                    reason: validation.reason || ''
                };
            }
        }
        return results;
    }

    function calculateRoundResults(game, validationResults) {
        const results = [];
        const players = game.players.filter(p => p.connected);
        const categories = game.categories;
        
        const categoryAnswers = {};
        categories.forEach(cat => {
            categoryAnswers[cat] = {};
            players.forEach(p => {
                const playerAnswers = game.answers[p.id];
                if (playerAnswers && playerAnswers.answers[cat]) {
                    const answer = playerAnswers.answers[cat];
                    const key = `${p.id}_${cat}`;
                    const validation = validationResults ? validationResults[key] : null;
                    const isValid = validation ? validation.valid : false;
                    if (answer && answer.length > 0 && answer[0] === game.currentLetter && isValid) {
                        if (!categoryAnswers[cat][answer]) categoryAnswers[cat][answer] = [];
                        categoryAnswers[cat][answer].push(p.id);
                    }
                }
            });
        });

        players.forEach(p => {
            const playerAnswers = game.answers[p.id];
            if (!playerAnswers) {
                results.push({
                    playerId: p.id,
                    playerName: p.name,
                    answers: {},
                    points: 0,
                    stopped: false,
                    totalScore: p.score
                });
                return;
            }

            let points = 0;
            let answerDetails = {};
            const stopped = playerAnswers.stopped || false;

            categories.forEach(cat => {
                const answer = playerAnswers.answers[cat] || '';
                const key = `${p.id}_${cat}`;
                const validation = validationResults ? validationResults[key] : null;
                const isValid = validation ? validation.valid : false;
                const startsWithLetter = answer.length > 0 && answer[0] === game.currentLetter;
                const isUnique = categoryAnswers[cat][answer] && categoryAnswers[cat][answer].length === 1;
                const isDuplicated = categoryAnswers[cat][answer] && categoryAnswers[cat][answer].length > 1;
                
                if (answer && isValid && startsWithLetter) {
                    let pts = isUnique ? 100 : 50;
                    points += pts;
                    answerDetails[cat] = { 
                        answer, 
                        points: pts, 
                        unique: isUnique,
                        duplicated: isDuplicated,
                        valid: true,
                        voted: validation?.voted || false
                    };
                } else if (answer) {
                    answerDetails[cat] = { 
                        answer, 
                        points: 0, 
                        unique: false, 
                        invalid: true,
                        valid: false,
                        reason: validation?.reason || 'No válida'
                    };
                } else {
                    answerDetails[cat] = { 
                        answer: '(vacío)', 
                        points: 0, 
                        unique: false,
                        valid: false
                    };
                }
            });

            let hasValidAnswers = false;
            for (let cat of categories) {
                const ans = playerAnswers.answers[cat];
                if (ans) {
                    const key = `${p.id}_${cat}`;
                    const validation = validationResults ? validationResults[key] : null;
                    if (validation ? validation.valid : (ans.length > 0 && ans[0] === game.currentLetter)) {
                        hasValidAnswers = true;
                        break;
                    }
                }
            }

            if (stopped && hasValidAnswers) points += 50;

            results.push({
                playerId: p.id,
                playerName: p.name,
                answers: answerDetails,
                points: points,
                stopped: stopped,
                totalScore: p.score + points
            });
        });

        return results;
    }

    function checkAllAnswered(game) {
        const categories = game.categories;
        const activePlayers = game.players.filter(p => p.connected);
        for (let player of activePlayers) {
            const playerAnswers = game.answers[player.id];
            if (!playerAnswers || playerAnswers.stopped) continue;
            const answeredCount = Object.keys(playerAnswers.answers).length;
            if (answeredCount < categories.length) return false;
        }
        return true;
    }

    socket.on('nextRound', (data) => {
        const { gameId } = data;
        const game = games[gameId];
        if (!game) return;

        const player = game.players.find(p => p.id === socket.id);
        if (!player || !player.isHost) {
            socket.emit('error', 'Solo el anfitrión puede avanzar');
            return;
        }

        if (game.phase !== 'results') {
            socket.emit('error', 'No hay resultados para avanzar');
            return;
        }

        game.processing = false;
        game.roundFinished = false;
        game.resultsCalculated = false;
        game.pendingVotes = {};
        game.votesProcessed = false;
        game.waitingForVotes = false;
        
        console.log(`▶️ Anfitrión avanza a siguiente ronda en sala ${gameId}`);
        startRound(gameId);
    });

    socket.on('finishGame', (data) => {
        const { gameId } = data;
        const game = games[gameId];
        if (!game) return;

        const player = game.players.find(p => p.id === socket.id);
        if (!player || !player.isHost) {
            socket.emit('error', 'Solo el anfitrión puede finalizar');
            return;
        }

        finishGame(gameId);
    });

    function finishGame(gameId) {
        const game = games[gameId];
        if (!game) return;

        clearInterval(game.timer);
        game.phase = 'finished';
        game.gameStarted = false;
        game.roundActive = false;
        game.processing = false;
        game.waitingForVotes = false;

        const winner = game.players.reduce((a, b) => a.score > b.score ? a : b);
        
        io.to(gameId).emit('gameFinished', {
            winner: winner,
            players: game.players.map(p => ({ name: p.name, score: p.score })),
            alphabetComplete: false
        });
        
        io.to(gameId).emit('chatMessage', {
            player: 'Sistema',
            message: `🏆 ¡${winner.name} ha ganado la partida con ${winner.score} puntos!`,
            system: true
        });
        
        io.to(gameId).emit('gameState', getGameState(gameId));
    }

    socket.on('resetGame', (data) => {
        const { gameId } = data;
        const game = games[gameId];
        if (!game) return;

        const player = game.players.find(p => p.id === socket.id);
        if (!player || !player.isHost) {
            socket.emit('error', 'Solo el anfitrión puede reiniciar');
            return;
        }

        game.gameStarted = false;
        game.phase = 'waiting';
        game.roundNumber = 0;
        game.players.forEach(p => p.score = 0);
        game.answers = {};
        game.stopPlayer = null;
        game.roundActive = false;
        game.pendingVotes = {};
        game.usedLetters = [];
        game.alphabetComplete = false;
        game.processing = false;
        game.letterPickerIndex = 0;
        game.choosingLetter = false;
        game.currentLetter = '';
        game.roundFinished = false;
        game.resultsCalculated = false;
        game.votesProcessed = false;
        game.waitingForVotes = false;
        if (game.letterChoiceTimeout) {
            clearTimeout(game.letterChoiceTimeout);
            game.letterChoiceTimeout = null;
        }
        if (game.timer) {
            clearInterval(game.timer);
            game.timer = null;
        }

        io.to(gameId).emit('gameState', getGameState(gameId));
        io.to(gameId).emit('gameReset', { success: true });
        io.to(gameId).emit('chatMessage', {
            player: 'Sistema',
            message: `🔄 Partida reiniciada por el anfitrión`,
            system: true
        });
    });

    socket.on('configGame', (data) => {
        const { gameId, maxRounds, timeLimit } = data;
        const game = games[gameId];
        if (!game) return;

        const player = game.players.find(p => p.id === socket.id);
        if (!player || !player.isHost) {
            socket.emit('error', 'Solo el anfitrión puede configurar');
            return;
        }

        if (game.gameStarted) {
            socket.emit('error', 'No se puede configurar después de comenzar');
            return;
        }

        if (maxRounds && maxRounds >= 1 && maxRounds <= 26) {
            game.maxRounds = maxRounds;
        }
        if (timeLimit && timeLimit >= 20 && timeLimit <= 180) {
            game.timeLimit = timeLimit;
        }

        io.to(gameId).emit('gameState', getGameState(gameId));
        io.to(gameId).emit('chatMessage', {
            player: 'Sistema',
            message: `⚙️ Configuración: ${game.maxRounds} rondas, ${game.timeLimit}s`,
            system: true
        });
    });

    socket.on('chatMessage', (data) => {
        const { gameId, message } = data;
        const game = games[gameId];
        if (!game) return;

        const player = game.players.find(p => p.id === socket.id);
        if (!player) return;

        io.to(gameId).emit('chatMessage', {
            player: player.name,
            message: message,
            system: false,
            timestamp: Date.now()
        });
    });

    socket.on('disconnect', () => {
        console.log(`🔴 Usuario desconectado: ${socket.id}`);
        for (const [gameId, game] of Object.entries(games)) {
            const playerIndex = game.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                const player = game.players[playerIndex];
                game.players[playerIndex].connected = false;
                io.to(gameId).emit('playersUpdate', getPlayersInfo(gameId));
                io.to(gameId).emit('chatMessage', {
                    player: 'Sistema',
                    message: `⚠️ ${player.name} se ha desconectado`,
                    system: true
                });

                if (player.isHost) {
                    const newHost = game.players.find(p => p.id !== socket.id && p.connected);
                    if (newHost) {
                        newHost.isHost = true;
                        game.host = newHost.id;
                        io.to(gameId).emit('chatMessage', {
                            player: 'Sistema',
                            message: `👑 ${newHost.name} es ahora el anfitrión`,
                            system: true
                        });
                    } else {
                        delete games[gameId];
                        console.log(`🗑️ Sala ${gameId} eliminada`);
                        continue;
                    }
                }

                const activePlayers = game.players.filter(p => p.connected);
                if (activePlayers.length === 0) {
                    delete games[gameId];
                    console.log(`🗑️ Sala ${gameId} eliminada`);
                }
            }
        }
    });

    function getGameState(gameId) {
        const game = games[gameId];
        if (!game) return null;
        return {
            gameId: gameId,
            players: game.players.map(p => ({
                id: p.id,
                name: p.name,
                score: p.score,
                isHost: p.isHost,
                connected: p.connected
            })),
            maxPlayers: game.maxPlayers,
            categories: game.categories,
            currentLetter: game.currentLetter,
            round: game.roundNumber,
            maxRounds: game.maxRounds,
            phase: game.phase,
            gameStarted: game.gameStarted,
            roundActive: game.roundActive,
            timeLeft: game.timeLeft,
            timeLimit: game.timeLimit,
            stopPlayer: game.stopPlayer,
            totalPlayers: game.players.length,
            usedLetters: game.usedLetters || [],
            alphabetComplete: game.alphabetComplete || false,
            processing: game.processing || false,
            roundFinished: game.roundFinished || false,
            resultsCalculated: game.resultsCalculated || false,
            waitingForVotes: game.waitingForVotes || false
        };
    }

    function getPlayersInfo(gameId) {
        const game = games[gameId];
        if (!game) return [];
        return game.players.map(p => ({
            id: p.id,
            name: p.name,
            isHost: p.isHost,
            connected: p.connected
        }));
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor STOP Online corriendo en http://localhost:${PORT}`);
});
