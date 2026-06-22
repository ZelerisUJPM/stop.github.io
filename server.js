const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

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

async function validateWordWithDatamuse(word) {
    if (!word || word.length < 2) {
        return { valid: false, reason: 'Palabra demasiado corta' };
    }

    try {
        const response = await fetch(`https://api.datamuse.com/words?sp=${encodeURIComponent(word.toLowerCase())}&max=3`);
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
        return { valid: false, reason: 'Error de conexión con Datamuse' };
    }
}

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
            resultsCalculated: false
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
        game.pendingVotes = {};
        game.voteResolved = false;
        game.validationResults = null;
        game.votesStarted = false;
        game.roundFinished = false;
        game.votesProcessed = false;
        game.resultsCalculated = false;

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

    // =====================================================
    // VOTACIÓN
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
                resolved: false
            };
        }

        const voteData = game.pendingVotes[word];
        if (voteData.resolved) return;

        if (!voteData.votes[playerId]) {
            voteData.votes[playerId] = vote;
            voteData.total++;
        } else {
            voteData.votes[playerId] = vote;
        }

        const votesFor = Object.values(voteData.votes).filter(v => v === true).length;
        const votesAgainst = Object.values(voteData.votes).filter(v => v === false).length;
        const totalVotes = Object.keys(voteData.votes).length;
        const activePlayers = game.players.filter(p => p.connected).length;

        const allVoted = totalVotes >= activePlayers;
        const majorityReached = votesFor >= Math.ceil(activePlayers * 2 / 3);
        
        if (allVoted || majorityReached) {
            voteData.resolved = true;
            voteData.approved = votesFor > votesAgainst;
            
            io.to(gameId).emit('voteResult', {
                word: word,
                category: category,
                approved: voteData.approved,
                votesFor: votesFor,
                votesAgainst: votesAgainst
            });
            
            io.to(gameId).emit('chatMessage', {
                player: 'Sistema',
                message: `📊 Votación para "${word}": ${votesFor} a favor, ${votesAgainst} en contra - ${voteData.approved ? '✅ APROBADA' : '❌ RECHAZADA'}`,
                system: true
            });

            checkAllVotesResolved(gameId);
        } else {
            io.to(gameId).emit('voteProgress', {
                word: word,
                votesFor: votesFor,
                votesAgainst: votesAgainst,
                total: totalVotes,
                remaining: activePlayers - totalVotes
            });
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
            
            console.log(`✅ Votaciones completadas en sala ${gameId}, calculando resultados...`);
            
            // Forzar la finalización de la ronda después de las votaciones
            setTimeout(() => {
                forceFinishRound(gameId);
            }, 1000);
        }
    }

    // =====================================================
    // FUNCIÓN PARA FORZAR LA FINALIZACIÓN DE LA RONDA
    // =====================================================
    function forceFinishRound(gameId) {
        const game = games[gameId];
        if (!game) {
            console.log(`❌ Juego ${gameId} no encontrado`);
            return;
        }

        if (game.resultsCalculated) {
            console.log(`⚠️ Resultados ya calculados para sala ${gameId}`);
            return;
        }

        console.log(`📊 Forzando finalización de ronda ${game.roundNumber} en sala ${gameId}`);
        
        game.resultsCalculated = true;
        game.roundFinished = true;
        game.phase = 'results';
        game.roundActive = false;
        clearInterval(game.timer);

        // Aplicar resultados de votación
        const validationResults = applyVoteResults(game);
        
        // Calcular resultados finales
        const results = calculateRoundResults(game, validationResults);
        
        for (let result of results) {
            const player = game.players.find(p => p.id === result.playerId);
            if (player) {
                player.score += result.points;
                result.totalScore = player.score;
            }
        }

        // Emitir resultados
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
        console.log(`✅ Ronda ${game.roundNumber} finalizada correctamente en sala ${gameId}`);
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
        if (game.phase === 'results' || game.roundFinished) return;

        console.log(`📊 Finalizando ronda ${game.roundNumber} en sala ${gameId}`);
        
        game.phase = 'results';
        game.roundActive = false;
        clearInterval(game.timer);

        const validationResults = await validateAllAnswers(game);
        game.validationResults = validationResults;
        
        const wordsToVote = Object.values(validationResults).filter(r => r.needsVote && r.word && r.word.length > 0);
        
        if (wordsToVote.length > 0) {
            console.log(`📋 Iniciando votación para ${wordsToVote.length} palabras en sala ${gameId}`);
            game.pendingVotes = {};
            game.voteResolved = false;
            game.votesStarted = true;
            game.roundFinished = false;
            game.votesProcessed = false;
            game.resultsCalculated = false;
            
            wordsToVote.forEach(item => {
                game.pendingVotes[item.word] = {
                    category: item.category,
                    votes: {},
                    total: 0,
                    approved: false,
                    resolved: false
                };
            });
            
            io.to(gameId).emit('startVoting', {
                words: wordsToVote,
                message: '📋 Algunas palabras no se encontraron en Datamuse. ¡Voten si son válidas!'
            });
            
            io.to(gameId).emit('chatMessage', {
                player: 'Sistema',
                message: `📋 Iniciando votación para ${wordsToVote.length} palabras no encontradas en Datamuse`,
                system: true
            });
            
            return;
        }

        // Sin votaciones, calcular resultados directamente
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
        console.log(`✅ Ronda ${game.roundNumber} finalizada correctamente`);
    }

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
                
                const validation = await validateWordWithDatamuse(answer);
                results[`${player.id}_${cat}`] = {
                    playerId: player.id,
                    category: cat,
                    word: answer,
                    valid: validation.valid,
                    needsVote: !validation.valid,
                    reason: validation.reason || ''
                };
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
                    results[key] = {
                        playerId: player.id,
                        category: cat,
                        word: answer,
                        valid: true,
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
                    if (!categoryAnswers[cat][answer]) {
                        categoryAnswers[cat][answer] = [];
                    }
                    categoryAnswers[cat][answer].push(p.id);
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
                const isValid = validation ? validation.valid : (answer.length > 0);
                
                const isUnique = categoryAnswers[cat][answer] && categoryAnswers[cat][answer].length === 1;
                const startsWithLetter = answer.length > 0 && answer[0] === game.currentLetter;
                
                if (answer && isValid && startsWithLetter) {
                    if (isUnique) {
                        points += 1;
                        answerDetails[cat] = { 
                            answer, 
                            points: 1, 
                            unique: true,
                            valid: true,
                            voted: validation?.voted || false
                        };
                    } else {
                        answerDetails[cat] = { 
                            answer, 
                            points: 0, 
                            unique: false, 
                            duplicated: true,
                            valid: true
                        };
                    }
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
            resultsCalculated: game.resultsCalculated
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
