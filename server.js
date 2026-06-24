const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

// Importar datos desde archivo separado
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

// =====================================================
// VALIDACIÓN CON DATAMUSE (solo para NOMBRE y APELLIDO)
// =====================================================

async function validateWordWithDatamuse(word) {
    if (!word || word.length < 2) {
        return { valid: false, reason: 'Palabra demasiado corta' };
    }

    try {
        const response = await fetch(
            `https://api.datamuse.com/words?sp=${encodeURIComponent(word.toLowerCase())}&max=3`
        );
        const data = await response.json();
        
        if (data && data.length > 0) {
            const exactMatch = data.some(item => 
                item.word && item.word.toUpperCase() === word.toUpperCase()
            );
            if (exactMatch) {
                return { valid: true, reason: 'Palabra encontrada en Datamuse' };
            }
        }
        
        return { valid: false, reason: 'Palabra no encontrada en Datamuse' };
    } catch (error) {
        console.error('Error en Datamuse:', error);
        return { valid: false, reason: 'Error en Datamuse' };
    }
}

// =====================================================
// VALIDACIÓN LOCAL
// =====================================================

function validateWordLocal(word, category, letter) {
    if (!word || word.length < 2) {
        return { valid: false, reason: 'Palabra demasiado corta', needsVote: false };
    }

    const normalized = word.toUpperCase().trim();

    if (normalized[0] !== letter) {
        return { valid: false, reason: `No comienza con la letra ${letter}`, needsVote: false };
    }

    if (BLACKLIST.includes(normalized)) {
        return { valid: false, reason: 'Palabra no válida (trampa detectada)', needsVote: false };
    }

    // =============================================
    // COLOR → solo lista local (votación si no está)
    // =============================================
    if (category === 'COLOR') {
        if (COLORES.includes(normalized)) {
            return { valid: true, reason: 'Color válido', needsVote: false };
        }
        return { valid: false, reason: 'Color no encontrado en la lista', needsVote: true };
    }

    // =============================================
    // FRUTA → solo lista local (votación si no está)
    // =============================================
    if (category === 'FRUTA') {
        if (FRUTAS.includes(normalized)) {
            return { valid: true, reason: 'Fruta válida', needsVote: false };
        }
        return { valid: false, reason: 'Fruta no encontrada en la lista', needsVote: true };
    }

    // =============================================
    // ANIMAL → solo lista local (votación si no está)
    // =============================================
    if (category === 'ANIMAL') {
        if (ANIMALES.includes(normalized)) {
            return { valid: true, reason: 'Animal válido', needsVote: false };
        }
        return { valid: false, reason: 'Animal no encontrado en la lista', needsVote: true };
    }

    // =============================================
    // COSA → solo lista local (votación si no está)
    // =============================================
    if (category === 'COSA') {
        if (COSAS.includes(normalized)) {
            return { valid: true, reason: 'Cosa válida', needsVote: false };
        }
        if (normalized.length >= 4) {
            return { valid: false, reason: 'Cosa no encontrada en la lista', needsVote: true };
        }
        return { valid: false, reason: 'Cosa no válida', needsVote: false };
    }

    // =============================================
    // PAÍS/CIUDAD → solo lista local (votación si no está)
    // =============================================
    if (category === 'PAÍS/CIUDAD') {
        if (LUGARES.includes(normalized)) {
            return { valid: true, reason: 'País/Ciudad válido', needsVote: false };
        }
        if (normalized.length >= 3) {
            return { valid: false, reason: 'País/Ciudad no encontrado en la lista', needsVote: true };
        }
        return { valid: false, reason: 'País/Ciudad no válido', needsVote: false };
    }

    // =============================================
    // NOMBRE y APELLIDO → validación local básica + Datamuse después
    // =============================================
    if (category === 'NOMBRE') {
        if (NOMBRES.includes(normalized) || normalized.length >= 3) {
            return { valid: true, reason: 'Nombre aceptado (validación local)', needsVote: false };
        }
        return { valid: false, reason: 'Nombre no válido', needsVote: false };
    }

    if (category === 'APELLIDO') {
        if (APELLIDOS.includes(normalized) || normalized.length >= 3) {
            return { valid: true, reason: 'Apellido aceptado (validación local)', needsVote: false };
        }
        return { valid: false, reason: 'Apellido no válido', needsVote: false };
    }

    return { valid: false, reason: 'Palabra no válida', needsVote: false };
}

// =====================================================
// SERVIDOR
// =====================================================

const games = {};
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

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
            maxRounds: 5,
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
            waitingForNextRound: false,
            pendingVotes: {},
            voteResolved: false,
            validationResults: null,
            votesStarted: false,
            roundFinished: false,
            votesProcessed: false,
            resultsCalculated: false,
            votingPlayers: [],
            letterPickerIndex: 0,
            choosingLetter: false,
            chosenLetter: null,
            letterChoiceTimeout: null
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
        
        if (!game) {
            socket.emit('error', 'La sala no existe');
            return;
        }

        if (game.players.length >= game.maxPlayers) {
            socket.emit('error', 'La sala está llena');
            return;
        }

        if (game.gameStarted) {
            socket.emit('error', 'La partida ya ha comenzado');
            return;
        }

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
        if (!game) return;

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
        game.waitingForNextRound = false;
        game.pendingVotes = {};
        game.voteResolved = false;
        game.validationResults = null;
        game.votesStarted = false;
        game.roundFinished = false;
        game.votesProcessed = false;
        game.resultsCalculated = false;
        game.votingPlayers = [];
        game.letterPickerIndex = 0;
        game.choosingLetter = false;
        game.chosenLetter = null;
        
        io.to(gameId).emit('gameState', getGameState(gameId));
        io.to(gameId).emit('chatMessage', {
            player: 'Sistema',
            message: `🎮 ¡La partida ha comenzado!`,
            system: true
        });

        setTimeout(() => {
            startRound(gameId);
        }, 2000);
    });

    // =====================================================
    // JUGADOR ELIGE LA LETRA
    // =====================================================
    socket.on('chooseLetter', (data) => {
        const { gameId, letter } = data;
        const game = games[gameId];
        if (!game) {
            socket.emit('error', 'La sala no existe');
            return;
        }

        console.log(`📩 Recibida elección de letra: ${letter} en sala ${gameId}, fase: ${game.phase}`);

        // Verificar que el juego esté en fase de elegir letra
        if (game.phase !== 'choosing_letter') {
            socket.emit('error', 'No es momento de elegir letra (fase: ' + game.phase + ')');
            return;
        }

        // Verificar que el jugador que elige sea el que le toca
        const activePlayers = game.players.filter(p => p.connected);
        if (activePlayers.length === 0) return;
        
        if (game.letterPickerIndex >= activePlayers.length) {
            game.letterPickerIndex = 0;
        }
        const currentPicker = activePlayers[game.letterPickerIndex];
        if (!currentPicker) return;
        
        if (currentPicker.id !== socket.id) {
            socket.emit('error', 'No es tu turno para elegir la letra');
            return;
        }

        // Validar que la letra sea válida (A-Z)
        const cleanLetter = letter.toUpperCase().trim();
        if (cleanLetter.length !== 1 || !LETTERS.includes(cleanLetter)) {
            socket.emit('error', 'Debes elegir una letra válida (A-Z)');
            return;
        }

        // Limpiar timeout de elección
        if (game.letterChoiceTimeout) {
            clearTimeout(game.letterChoiceTimeout);
            game.letterChoiceTimeout = null;
        }

        // Establecer la letra
        game.currentLetter = cleanLetter;
        game.chosenLetter = cleanLetter;
        game.choosingLetter = false;
        game.phase = 'playing';
        game.roundActive = true;
        game.timeLeft = game.timeLimit || 60;
        game.answers = {};
        game.stopPlayer = null;

        // Inicializar respuestas de los jugadores
        game.players.forEach(p => {
            game.answers[p.id] = {
                playerName: p.name,
                answers: {},
                stopped: false,
                stoppedAt: null
            };
        });

        // Avanzar el índice para la próxima ronda
        game.letterPickerIndex = (game.letterPickerIndex + 1) % activePlayers.length;

        io.to(gameId).emit('letterChosen', {
            letter: cleanLetter,
            chosenBy: currentPicker.name,
            round: game.roundNumber
        });

        io.to(gameId).emit('chatMessage', {
            player: 'Sistema',
            message: `🔤 ${currentPicker.name} eligió la letra: ${cleanLetter} - Ronda ${game.roundNumber}`,
            system: true
        });

        io.to(gameId).emit('roundStarted', {
            round: game.roundNumber,
            letter: cleanLetter,
            categories: game.categories,
            timeLimit: game.timeLimit
        });

        io.to(gameId).emit('gameState', getGameState(gameId));

        // Iniciar temporizador
        game.timer = setInterval(() => {
            game.timeLeft--;
            io.to(gameId).emit('timerUpdate', { timeLeft: game.timeLeft });
            
            if (game.timeLeft <= 0) {
                clearInterval(game.timer);
                finishRound(gameId);
            }
        }, 1000);
    });

    // =====================================================
    // FUNCIÓN PARA INICIAR RONDA (con elección de letra)
    // =====================================================
    function startRound(gameId) {
        const game = games[gameId];
        if (!game) return;

        game.roundNumber++;
        game.phase = 'choosing_letter';
        game.choosingLetter = true;
        game.chosenLetter = null;
        game.roundActive = false;
        game.answers = {};
        game.stopPlayer = null;
        game.timeLeft = game.timeLimit || 60;

        // Limpiar timeout anterior si existe
        if (game.letterChoiceTimeout) {
            clearTimeout(game.letterChoiceTimeout);
            game.letterChoiceTimeout = null;
        }

        // Determinar quién elige la letra (turno rotativo)
        const activePlayers = game.players.filter(p => p.connected);
        if (activePlayers.length === 0) return;
        
        if (game.letterPickerIndex >= activePlayers.length) {
            game.letterPickerIndex = 0;
        }
        const currentPicker = activePlayers[game.letterPickerIndex];

        console.log(`🎯 Ronda ${game.roundNumber}: ${currentPicker.name} debe elegir letra`);

        io.to(gameId).emit('chooseLetter', {
            round: game.roundNumber,
            pickerName: currentPicker.name,
            pickerId: currentPicker.id,
            message: `🎯 ${currentPicker.name}, elige la letra para la ronda ${game.roundNumber}`
        });

        io.to(gameId).emit('chatMessage', {
            player: 'Sistema',
            message: `🎯 ${currentPicker.name}, elige la letra para la ronda ${game.roundNumber}`,
            system: true
        });

        io.to(gameId).emit('gameState', getGameState(gameId));

        // Dar 30 segundos para elegir letra, si no se elige, se asigna aleatoria
        game.letterChoiceTimeout = setTimeout(() => {
            if (game.phase === 'choosing_letter' && game.choosingLetter) {
                console.log(`⏰ Tiempo agotado en sala ${gameId}, asignando letra aleatoria`);
                
                const availableLetters = LETTERS.split('');
                const randomLetter = availableLetters[Math.floor(Math.random() * availableLetters.length)];
                game.currentLetter = randomLetter;
                game.chosenLetter = randomLetter;
                game.choosingLetter = false;
                game.phase = 'playing';
                game.roundActive = true;
                game.timeLeft = game.timeLimit || 60;
                game.answers = {};
                game.stopPlayer = null;

                game.players.forEach(p => {
                    game.answers[p.id] = {
                        playerName: p.name,
                        answers: {},
                        stopped: false,
                        stoppedAt: null
                    };
                });

                // Avanzar el índice
                const currentActive = game.players.filter(p => p.connected);
                game.letterPickerIndex = (game.letterPickerIndex + 1) % currentActive.length;

                io.to(gameId).emit('letterChosen', {
                    letter: randomLetter,
                    chosenBy: 'Sistema (tiempo agotado)',
                    round: game.roundNumber
                });

                io.to(gameId).emit('chatMessage', {
                    player: 'Sistema',
                    message: `⏰ Tiempo agotado. Letra asignada automáticamente: ${randomLetter}`,
                    system: true
                });

                io.to(gameId).emit('roundStarted', {
                    round: game.roundNumber,
                    letter: randomLetter,
                    categories: game.categories,
                    timeLimit: game.timeLimit
                });

                io.to(gameId).emit('gameState', getGameState(gameId));

                game.timer = setInterval(() => {
                    game.timeLeft--;
                    io.to(gameId).emit('timerUpdate', { timeLeft: game.timeLeft });
                    
                    if (game.timeLeft <= 0) {
                        clearInterval(game.timer);
                        finishRound(gameId);
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

        const player = game.players.find(p => p.id === socket.id);
        if (!player) return;

        const playerAnswers = game.answers[player.id];
        if (!playerAnswers || playerAnswers.stopped) return;

        playerAnswers.answers[category] = answer.trim().toUpperCase();
        socket.emit('answerSaved', { category, answer });
        
        const allAnswered = checkAllAnswered(game);
        if (allAnswered) {
            clearInterval(game.timer);
            finishRound(gameId);
        }
    });

    // =====================================================
    // STOP: todas las casillas llenas
    // =====================================================
    socket.on('sayStop', (data) => {
        const { gameId } = data;
        const game = games[gameId];
        if (!game) return;
        if (game.phase !== 'playing' || !game.roundActive) return;

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
            socket.emit('error', `❌ Debes llenar todas las casillas antes de decir STOP. Faltan: ${emptyCategories.join(', ')}`);
            return;
        }

        playerAnswers.stopped = true;
        playerAnswers.stoppedAt = Date.now();
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
        
        setTimeout(() => {
            finishRound(gameId);
        }, 1500);
    });

    // =====================================================
    // VOTACIÓN (jugador por jugador)
    // =====================================================

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
            if (!voteData.voters.includes(playerId)) {
                voteData.voters.push(playerId);
            }
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
            game.voteResolved = true;
            game.votesProcessed = true;
            
            io.to(gameId).emit('allVotesResolved', { success: true });
            io.to(gameId).emit('chatMessage', {
                player: 'Sistema',
                message: '✅ Todas las votaciones han sido resueltas. Calculando resultados...',
                system: true
            });
            
            setTimeout(() => {
                forceFinishRound(gameId);
            }, 1000);
        }
    }

    function forceFinishRound(gameId) {
        const game = games[gameId];
        if (!game) return;
        if (game.resultsCalculated) return;

        game.resultsCalculated = true;
        game.roundFinished = true;
        game.phase = 'results';
        game.roundActive = false;
        clearInterval(game.timer);

        const validationResults = applyVoteResults(game);
        const results = calculateRoundResults(game, validationResults);
        
        for (let result of results) {
            const player = game.players.find(p => p.id === result.playerId);
            if (player) {
                player.score += result.points;
                result.totalScore = player.score;
            }
        }

        io.to(gameId).emit('roundResults', {
            results: results,
            letter: game.currentLetter,
            categories: game.categories,
            stopPlayer: game.stopPlayer,
            stopPlayerName: game.players.find(p => p.id === game.stopPlayer)?.name || 'Nadie',
            roundNumber: game.roundNumber,
            maxRounds: game.maxRounds,
            votesApplied: true
        });

        io.to(gameId).emit('chatMessage', {
            player: 'Sistema',
            message: `📊 ¡Ronda ${game.roundNumber} finalizada con votaciones!`,
            system: true
        });

        io.to(gameId).emit('gameState', getGameState(gameId));
    }

    // =====================================================
    // FUNCIONES AUXILIARES
    // =====================================================

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

        game.waitingForNextRound = false;
        
        if (game.roundNumber >= game.maxRounds) {
            finishGame(gameId);
        } else {
            io.to(gameId).emit('chatMessage', {
                player: 'Sistema',
                message: `⏳ Preparando siguiente ronda...`,
                system: true
            });
            setTimeout(() => {
                startRound(gameId);
            }, 1500);
        }
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
        game.choosingLetter = false;
        game.phase = 'waiting';

        const winner = game.players.reduce((a, b) => a.score > b.score ? a : b);
        
        io.to(gameId).emit('gameFinished', {
            winner: winner,
            players: game.players.map(p => ({
                name: p.name,
                score: p.score
            }))
        });
        
        io.to(gameId).emit('chatMessage', {
            player: 'Sistema',
            message: `🏆 ¡${winner.name} ha ganado la partida con ${winner.score} puntos!`,
            system: true
        });
        
        io.to(gameId).emit('gameState', getGameState(gameId));
    }

    function checkAllAnswered(game) {
        const categories = game.categories;
        const activePlayers = game.players.filter(p => p.connected);
        
        for (let player of activePlayers) {
            const playerAnswers = game.answers[player.id];
            if (!playerAnswers || playerAnswers.stopped) continue;
            
            const answeredCount = Object.keys(playerAnswers.answers).length;
            if (answeredCount < categories.length) {
                return false;
            }
        }
        return true;
    }

    // =====================================================
    // FINISH ROUND CON VALIDACIÓN MIXTA
    // =====================================================
    async function finishRound(gameId) {
        const game = games[gameId];
        if (!game) return;
        if (game.phase === 'results' || game.roundFinished) return;

        game.phase = 'results';
        game.roundActive = false;
        clearInterval(game.timer);

        const validationResults = await validateAllAnswers(game);
        game.validationResults = validationResults;
        
        const wordsToVote = Object.values(validationResults).filter(r => r.needsVote && r.word && r.word.length > 0);
        
        if (wordsToVote.length > 0) {
            game.pendingVotes = {};
            game.voteResolved = false;
            game.votesStarted = true;
            game.roundFinished = false;
            game.votesProcessed = false;
            game.resultsCalculated = false;
            game.votingPlayers = [];
            
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
            
            return;
        }

        game.resultsCalculated = true;
        game.roundFinished = true;
        const results = calculateRoundResults(game, validationResults);
        
        for (let result of results) {
            const player = game.players.find(p => p.id === result.playerId);
            if (player) {
                player.score += result.points;
                result.totalScore = player.score;
            }
        }

        io.to(gameId).emit('roundResults', {
            results: results,
            letter: game.currentLetter,
            categories: game.categories,
            stopPlayer: game.stopPlayer,
            stopPlayerName: game.players.find(p => p.id === game.stopPlayer)?.name || 'Nadie',
            roundNumber: game.roundNumber,
            maxRounds: game.maxRounds
        });

        io.to(gameId).emit('chatMessage', {
            player: 'Sistema',
            message: `📊 ¡Ronda ${game.roundNumber} finalizada!`,
            system: true
        });

        io.to(gameId).emit('gameState', getGameState(gameId));
    }

    // =====================================================
    // VALIDACIÓN DE TODAS LAS RESPUESTAS
    // =====================================================
    async function validateAllAnswers(game) {
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
                
                if (cat === 'COLOR' || cat === 'FRUTA' || cat === 'ANIMAL' || cat === 'COSA' || cat === 'PAÍS/CIUDAD') {
                    const validation = validateWordLocal(answer, cat, game.currentLetter);
                    results[`${player.id}_${cat}`] = {
                        playerId: player.id,
                        category: cat,
                        word: answer,
                        valid: validation.valid,
                        needsVote: validation.needsVote || false,
                        reason: validation.reason || ''
                    };
                    continue;
                }
                
                if (cat === 'NOMBRE' || cat === 'APELLIDO') {
                    const validation = validateWordLocal(answer, cat, game.currentLetter);
                    if (validation.valid) {
                        const datamuseResult = await validateWordWithDatamuse(answer);
                        results[`${player.id}_${cat}`] = {
                            playerId: player.id,
                            category: cat,
                            word: answer,
                            valid: datamuseResult.valid,
                            needsVote: !datamuseResult.valid && answer.length >= 3,
                            reason: datamuseResult.reason || ''
                        };
                    } else {
                        results[`${player.id}_${cat}`] = {
                            playerId: player.id,
                            category: cat,
                            word: answer,
                            valid: false,
                            needsVote: false,
                            reason: validation.reason || ''
                        };
                    }
                    continue;
                }
            }
        }
        
        return results;
    }

    function applyVoteResults(game) {
        const results = {};
        const players = game.players.filter(p => p.connected);
        
        for (let player of players) {
            const playerAnswers = game.answers[player.id];
            if (!playerAnswers) continue;
            
            for (let cat of game.categories) {
                const answer = playerAnswers.answers[cat] || '';
                const key = `${player.id}_${cat}`;
                
                const voteData = game.pendingVotes[answer];
                if (voteData && voteData.resolved) {
                    results[key] = {
                        playerId: player.id,
                        category: cat,
                        word: answer,
                        valid: voteData.approved,
                        needsVote: false,
                        voted: true,
                        approved: voteData.approved
                    };
                } else if (answer.length > 0) {
                    const validation = validateWordLocal(answer, cat, game.currentLetter);
                    results[key] = {
                        playerId: player.id,
                        category: cat,
                        word: answer,
                        valid: validation.valid,
                        needsVote: false
                    };
                } else {
                    results[key] = {
                        playerId: player.id,
                        category: cat,
                        word: answer,
                        valid: false,
                        needsVote: false
                    };
                }
            }
        }
        
        return results;
    }

    // =====================================================
    // CÁLCULO DE PUNTUACIÓN: 100 pts únicas, 50 pts repetidas
    // =====================================================
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
                        if (!categoryAnswers[cat][answer]) {
                            categoryAnswers[cat][answer] = [];
                        }
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
                    let pts = 0;
                    if (isUnique) {
                        pts = 100;
                    } else if (isDuplicated) {
                        pts = 50;
                    }
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

            if (stopped && hasValidAnswers) {
                points += 50;
            }

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
        game.waitingForNextRound = false;
        game.pendingVotes = {};
        game.voteResolved = false;
        game.validationResults = null;
        game.votesStarted = false;
        game.roundFinished = false;
        game.votesProcessed = false;
        game.resultsCalculated = false;
        game.votingPlayers = [];
        game.letterPickerIndex = 0;
        game.choosingLetter = false;
        game.chosenLetter = null;
        if (game.letterChoiceTimeout) {
            clearTimeout(game.letterChoiceTimeout);
            game.letterChoiceTimeout = null;
        }
        clearInterval(game.timer);

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

        if (maxRounds && maxRounds >= 1 && maxRounds <= 20) {
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
            waitingForNextRound: game.waitingForNextRound,
            pendingVotes: game.pendingVotes ? Object.keys(game.pendingVotes).length : 0,
            voteResolved: game.voteResolved,
            votesStarted: game.votesStarted,
            roundFinished: game.roundFinished,
            votesProcessed: game.votesProcessed,
            resultsCalculated: game.resultsCalculated,
            choosingLetter: game.choosingLetter,
            chosenLetter: game.chosenLetter,
            letterPickerIndex: game.letterPickerIndex
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
