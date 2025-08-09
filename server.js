const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const GTPClient = require('./gtp-client');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// 環境変数からKataGoの設定を取得
const KATAGO_HOME = process.env.KATAGO_HOME || '/path/to/katago';
const KATAGO_PATH = `${KATAGO_HOME}/katago`;
const CONFIG_PATH = `${KATAGO_HOME}/default_gtp.cfg`;
const MODEL_PATH = `${KATAGO_HOME}/a.bin.gz`;

// CORS設定
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// GTPクライアントのインスタンス
let gtpClient = null;

// ゲーム状態
let gameState = {
    currentPlayer: 'black', // 'black' or 'white'
    gameStarted: false,
    board: {
        size: 19,
        stones: {},
        lastMove: null
    }
};

// Socket.IO接続管理
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // ゲーム開始
    socket.on('startGame', async () => {
        try {
            if (!gtpClient) {
                gtpClient = new GTPClient(KATAGO_PATH, CONFIG_PATH, MODEL_PATH);
                await gtpClient.start();
                await gtpClient.initGame();
            }
            
            gameState.gameStarted = true;
            gameState.currentPlayer = 'black';
            gameState.board = await gtpClient.getBoard();
            
            socket.emit('gameStarted', gameState);
            console.log('Game started');
        } catch (error) {
            console.error('Failed to start game:', error);
            socket.emit('error', { message: 'ゲームの開始に失敗しました: ' + error.message });
        }
    });

    // プレイヤーの手
    socket.on('playerMove', async (data) => {
        try {
            const { position } = data;
            
            if (!gameState.gameStarted) {
                socket.emit('error', { message: 'ゲームが開始されていません' });
                return;
            }

            if (gameState.currentPlayer !== 'black') {
                socket.emit('error', { message: 'あなたの番ではありません' });
                return;
            }

            // プレイヤーの手を実行
            await gtpClient.playMove('black', position);
            gameState.board = await gtpClient.getBoard();
            gameState.board.lastMove = position;
            gameState.currentPlayer = 'white';

            socket.emit('movePlayed', {
                position,
                color: 'black',
                board: gameState.board
            });

            // AIの手を生成
            setTimeout(async () => {
                try {
                    const aiMove = await gtpClient.genMove('white');
                    gameState.board = await gtpClient.getBoard();
                    gameState.board.lastMove = aiMove;
                    gameState.currentPlayer = 'black';

                    socket.emit('aiMove', {
                        position: aiMove,
                        color: 'white',
                        board: gameState.board
                    });
                } catch (error) {
                    console.error('AI move error:', error);
                    socket.emit('error', { message: 'AIの手の生成に失敗しました' });
                }
            }, 1000);

        } catch (error) {
            console.error('Player move error:', error);
            socket.emit('error', { message: '手の実行に失敗しました: ' + error.message });
        }
    });

    // パス
    socket.on('pass', async () => {
        try {
            if (!gameState.gameStarted) {
                socket.emit('error', { message: 'ゲームが開始されていません' });
                return;
            }

            if (gameState.currentPlayer !== 'black') {
                socket.emit('error', { message: 'あなたの番ではありません' });
                return;
            }

            // プレイヤーがパス
            await gtpClient.playMove('black', 'pass');
            gameState.currentPlayer = 'white';

            socket.emit('passPlayed', {
                color: 'black',
                board: gameState.board
            });

            // AIの手を生成
            setTimeout(async () => {
                try {
                    const aiMove = await gtpClient.genMove('white');
                    gameState.board = await gtpClient.getBoard();
                    gameState.board.lastMove = aiMove;
                    gameState.currentPlayer = 'black';

                    socket.emit('aiMove', {
                        position: aiMove,
                        color: 'white',
                        board: gameState.board
                    });
                } catch (error) {
                    console.error('AI move error:', error);
                    socket.emit('error', { message: 'AIの手の生成に失敗しました' });
                }
            }, 1000);

        } catch (error) {
            console.error('Pass error:', error);
            socket.emit('error', { message: 'パスの実行に失敗しました' });
        }
    });

    // ゲームリセット
    socket.on('resetGame', async () => {
        try {
            if (gtpClient) {
                await gtpClient.initGame();
                gameState.board = await gtpClient.getBoard();
                gameState.currentPlayer = 'black';
                gameState.gameStarted = false;
                
                socket.emit('gameReset', gameState);
            }
        } catch (error) {
            console.error('Reset error:', error);
            socket.emit('error', { message: 'ゲームのリセットに失敗しました' });
        }
    });

    // 現在の盤面を取得
    socket.on('getBoard', async () => {
        try {
            if (gtpClient) {
                gameState.board = await gtpClient.getBoard();
                socket.emit('boardUpdate', gameState.board);
            }
        } catch (error) {
            console.error('Get board error:', error);
            socket.emit('error', { message: '盤面の取得に失敗しました' });
        }
    });

    // 切断時の処理
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// プロセス終了時の処理
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    if (gtpClient) {
        await gtpClient.quit();
    }
    process.exit(0);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`KataGo path: ${KATAGO_PATH}`);
    console.log(`Config path: ${CONFIG_PATH}`);
    console.log(`Model path: ${MODEL_PATH}`);
});
