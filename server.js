const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static('public'));

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
// VALIDACIÓN ONLINE CON DICCIONARIO
// =====================================================

// Función para validar una palabra con la API de Diccionario
async function validateWordWithDictionary(word) {
    if (!word || word.length < 2) {
        return { valid: false, reason: 'Palabra demasiado corta' };
    }

    try {
        // Intentar con la API de Diccionario (inglés)
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`);
        
        if (response.ok) {
            const data = await response.json();
            if (data && data.length > 0 && data[0].word) {
                return { valid: true, reason: 'Palabra encontrada en diccionario' };
            }
        }

        // Si no se encuentra en inglés, probar con Datamuse (español/inglés)
        try {
            const spanishResponse = await fetch(`https://api.datamuse.com/words?sp=${encodeURIComponent(word.toLowerCase())}&max=5`);
            const spanishData = await spanishResponse.json();
            if (spanishData && spanishData.length > 0) {
                // Verificar coincidencia exacta
                const exactMatch = spanishData.some(item => 
                    item.word && item.word.toUpperCase() === word.toUpperCase()
                );
                if (exactMatch) {
                    return { valid: true, reason: 'Palabra encontrada en Datamuse' };
                }
            }
        } catch (e) {
            console.log('Error en Datamuse:', e.message);
        }

        // Verificar si es un nombre propio (primera letra mayúscula)
        if (word[0] === word[0].toUpperCase() && word.length >= 3) {
            return { valid: true, reason: 'Nombre propio aceptado' };
        }

        return { valid: false, reason: 'Palabra no encontrada en diccionario' };
    } catch (error) {
        console.error('Error validando palabra:', error);
        // En caso de error de red, permitir la palabra (para no bloquear el juego)
        return { valid: true, reason: 'Validación falló, se acepta palabra' };
    }
}

// Validación específica por categoría
async function validateAnswerByCategory(answer, category, letter) {
    // 1. Verificar que no esté vacío
    if (!answer || answer.length === 0) {
        return { valid: false, reason: 'Respuesta vacía' };
    }

    // 2. Verificar que comience con la letra correcta
    if (answer[0] !== letter) {
        return { valid: false, reason: `No comienza con la letra ${letter}` };
    }

    // 3. Verificar longitud mínima (evitar respuestas de 1 letra como "V")
    if (answer.length < 2) {
        return { valid: false, reason: 'La palabra es demasiado corta' };
    }

    // 4. Verificar si es un nombre propio (categoría NOMBRE)
    if (category === 'NOMBRE') {
        // Los nombres propios se aceptan si tienen 2+ letras y primera mayúscula
        if (answer[0] === answer[0].toUpperCase() && answer.length >= 2) {
            return { valid: true, reason: 'Nombre propio aceptado' };
        }
        // También verificar en diccionario si no tiene mayúscula
        const dictResult = await validateWordWithDictionary(answer);
        return dictResult;
    }

    // 5. Para APELLIDO: aceptar si tiene 3+ letras y primera mayúscula
    if (category === 'APELLIDO') {
        if (answer[0] === answer[0].toUpperCase() && answer.length >= 3) {
            return { valid: true, reason: 'Apellido aceptado' };
        }
        const dictResult = await validateWordWithDictionary(answer);
        return dictResult;
    }

    // 6. Para PAÍS/CIUDAD: aceptar si tiene 3+ letras y primera mayúscula
    if (category === 'PAÍS/CIUDAD') {
        if (answer[0] === answer[0].toUpperCase() && answer.length >= 3) {
            return { valid: true, reason: 'País/ciudad aceptado' };
        }
        // También buscar en diccionario
        const dictResult = await validateWordWithDictionary(answer);
        return dictResult;
    }

    // 7. Para COLOR, FRUTA, ANIMAL, COSA: validar con diccionario
    if (category === 'COLOR' || category === 'FRUTA' || category === 'ANIMAL' || category === 'COSA') {
        // Verificar en diccionario
        const dictResult = await validateWordWithDictionary(answer);
        if (dictResult.valid) {
            return { valid: true, reason: 'Palabra válida' };
        }
        
        // Si es un nombre propio, aceptarlo
        if (answer[0] === answer[0].toUpperCase() && answer.length >= 3) {
            return { valid: true, reason: 'Nombre propio aceptado' };
        }
        
        // Si tiene 4+ letras, aceptarlo como palabra válida (para evitar falsos negativos)
        if (answer.length >= 4) {
            return { valid: true, reason: 'Palabra aceptada (4+ letras)' };
        }
        
        return { valid: false, reason: 'Palabra no encontrada en diccionario' };
    }

    // Default: validar con diccionario
    return await validateWordWithDictionary(answer);
}

// =====================================================
// RESTO DEL SERVIDOR
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
            waitingForNextRound: false
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

    async function startRound(gameId) {
        const game = games[gameId];
        if (!game) return;

        game.roundNumber++;
        game.phase = 'playing';
        game.roundActive = true;
        game.answers = {};
        game.stopPlayer = null;
        game.timeLeft = game.timeLimit || 60;
        game.waitingForNextRound = false;

        const availableLetters = LETTERS.split('');
        game.currentLetter = availableLetters[Math.floor(Math.random() * availableLetters.length)];

        game.players.forEach(p => {
            game.answers[p.id] = {
                playerName: p.name,
                answers: {},
                stopped: false,
                stoppedAt: null
            };
        });

        io.to(gameId).emit('roundStarted', {
            round: game.roundNumber,
            letter: game.currentLetter,
            categories: game.categories,
            timeLimit: game.timeLimit
        });
        
        io.to(gameId).emit('gameState', getGameState(gameId));
        io.to(gameId).emit('chatMessage', {
            player: 'Sistema',
            message: `🔤 Ronda ${game.roundNumber} - Letra: ${game.currentLetter}`,
            system: true
        });

        game.timer = setInterval(() => {
            game.timeLeft--;
            io.to(gameId).emit('timerUpdate', { timeLeft: game.timeLeft });
            
            if (game.timeLeft <= 0) {
                clearInterval(game.timer);
                finishRound(gameId);
            }
        }, 1000);
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

    socket.on('sayStop', (data) => {
        const { gameId } = data;
        const game = games[gameId];
        if (!game) return;
        if (game.phase !== 'playing' || !game.roundActive) return;

        const player = game.players.find(p => p.id === socket.id);
        if (!player) return;

        const playerAnswers = game.answers[player.id];
        if (playerAnswers.stopped) return;

        const hasAnswers = Object.keys(playerAnswers.answers).length > 0;
        if (!hasAnswers) {
            socket.emit('error', 'Debes tener al menos una respuesta para decir STOP');
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

    async function finishRound(gameId) {
        const game = games[gameId];
        if (!game) return;
        if (game.phase === 'results') return;

        game.phase = 'results';
        game.roundActive = false;
        clearInterval(game.timer);

        // Calcular resultados con validación online
        const results = await calculateRoundResults(game);
        
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

    async function calculateRoundResults(game) {
        const results = [];
        const categories = game.categories;
        const players = game.players.filter(p => p.connected);
        
        const categoryAnswers = {};
        categories.forEach(cat => {
            categoryAnswers[cat] = {};
            players.forEach(p => {
                const playerAnswers = game.answers[p.id];
                if (playerAnswers && playerAnswers.answers[cat]) {
                    const answer = playerAnswers.answers[cat];
                    if (!categoryAnswers[cat][answer]) {
                        categoryAnswers[cat][answer] = [];
                    }
                    categoryAnswers[cat][answer].push(p.id);
                }
            });
        });

        for (let p of players) {
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
                continue;
            }

            let points = 0;
            let answerDetails = {};
            const stopped = playerAnswers.stopped || false;

            for (let cat of categories) {
                const answer = playerAnswers.answers[cat] || '';
                
                // --- VALIDACIÓN ONLINE POR CATEGORÍA ---
                const validation = await validateAnswerByCategory(answer, cat, game.currentLetter);
                const isValid = validation.valid;
                
                const isUnique = categoryAnswers[cat][answer] && categoryAnswers[cat][answer].length === 1;
                
                if (answer && isValid) {
                    if (isUnique) {
                        points += 1;
                        answerDetails[cat] = { 
                            answer, 
                            points: 1, 
                            unique: true,
                            valid: true,
                            validated: validation.reason
                        };
                    } else {
                        answerDetails[cat] = { 
                            answer, 
                            points: 0, 
                            unique: false, 
                            duplicated: true,
                            valid: true,
                            validated: validation.reason
                        };
                    }
                } else if (answer) {
                    // Respuesta inválida o incorrecta
                    answerDetails[cat] = { 
                        answer, 
                        points: 0, 
                        unique: false, 
                        invalid: true,
                        valid: false,
                        reason: validation.reason || 'No válida'
                    };
                } else {
                    answerDetails[cat] = { 
                        answer: '(vacío)', 
                        points: 0, 
                        unique: false,
                        valid: false
                    };
                }
            }

            let hasValidAnswers = false;
            for (let cat of categories) {
                const ans = playerAnswers.answers[cat];
                if (ans) {
                    const validation = await validateAnswerByCategory(ans, cat, game.currentLetter);
                    if (validation.valid) {
                        hasValidAnswers = true;
                        break;
                    }
                }
            }

            if (stopped && hasValidAnswers) {
                points += 2;
            }

            results.push({
                playerId: p.id,
                playerName: p.name,
                answers: answerDetails,
                points: points,
                stopped: stopped,
                totalScore: p.score + points
            });
        }

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
            waitingForNextRound: game.waitingForNextRound
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
