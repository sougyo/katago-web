class GoGame {
    constructor() {
        this.socket = io();
        this.boardSize = 19;
        this.currentPlayer = 'black';
        this.gameStarted = false;
        this.board = {};
        this.lastMove = null;
        
        this.initializeElements();
        this.createBoard();
        this.setupEventListeners();
        this.setupSocketListeners();
    }

    initializeElements() {
        this.gameBoard = document.getElementById('gameBoard');
        this.statusElement = document.getElementById('status');
        this.currentPlayerElement = document.getElementById('currentPlayer');
        this.startGameBtn = document.getElementById('startGame');
        this.resetGameBtn = document.getElementById('resetGame');
        this.passBtn = document.getElementById('pass');
        this.logContent = document.getElementById('logContent');
    }

    createBoard() {
        this.gameBoard.innerHTML = '';
        
        for (let row = 0; row < this.boardSize; row++) {
            for (let col = 0; col < this.boardSize; col++) {
                const intersection = document.createElement('div');
                intersection.className = 'board-intersection';
                intersection.dataset.row = row;
                intersection.dataset.col = col;
                intersection.dataset.position = this.getPositionString(col, row);
                
                intersection.addEventListener('click', (e) => {
                    this.handleIntersectionClick(e);
                });
                
                this.gameBoard.appendChild(intersection);
            }
        }
    }

    getPositionString(col, row) {
        const colChar = String.fromCharCode(65 + col);
        const rowNum = this.boardSize - row;
        return `${colChar}${rowNum}`;
    }

    getIntersectionFromPosition(position) {
        if (position === 'pass') return null;
        
        const colChar = position.charAt(0);
        const rowStr = position.substring(1);
        
        const col = colChar.charCodeAt(0) - 65;
        const row = this.boardSize - parseInt(rowStr);
        
        return document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    }

    handleIntersectionClick(event) {
        if (!this.gameStarted || this.currentPlayer !== 'black') {
            return;
        }

        const intersection = event.currentTarget;
        const position = intersection.dataset.position;
        
        // 既に石がある場合は無視
        if (intersection.querySelector('.stone')) {
            return;
        }

        this.socket.emit('playerMove', { position });
    }

    setupEventListeners() {
        this.startGameBtn.addEventListener('click', () => {
            this.socket.emit('startGame');
        });

        this.resetGameBtn.addEventListener('click', () => {
            this.socket.emit('resetGame');
        });

        this.passBtn.addEventListener('click', () => {
            if (this.gameStarted && this.currentPlayer === 'black') {
                this.socket.emit('pass');
            }
        });
    }

    setupSocketListeners() {
        this.socket.on('connect', () => {
            this.addLogEntry('システム', 'サーバーに接続しました', 'system');
        });

        this.socket.on('disconnect', () => {
            this.addLogEntry('システム', 'サーバーから切断されました', 'system');
            this.updateStatus('サーバーから切断されました');
        });

        this.socket.on('gameStarted', (gameState) => {
            this.gameStarted = true;
            this.currentPlayer = gameState.currentPlayer;
            this.board = gameState.board.stones || {};
            this.updateBoard();
            this.updateStatus('ゲーム開始 - あなたの番です');
            this.updateCurrentPlayer();
            this.addLogEntry('システム', 'ゲームが開始されました', 'system');
        });

        this.socket.on('movePlayed', (data) => {
            this.addStone(data.position, data.color);
            this.board = data.board.stones || {};
            this.lastMove = data.position;
            this.currentPlayer = 'white';
            this.updateStatus('AIが考え中...');
            this.updateCurrentPlayer();
            this.addLogEntry('プレイヤー', `黒: ${data.position}`, 'player');
        });

        this.socket.on('aiMove', (data) => {
            this.addStone(data.position, data.color);
            this.board = data.board.stones || {};
            this.lastMove = data.position;
            this.currentPlayer = 'black';
            this.updateStatus('あなたの番です');
            this.updateCurrentPlayer();
            this.addLogEntry('AI', `白: ${data.position}`, 'ai');
        });

        this.socket.on('passPlayed', (data) => {
            this.currentPlayer = 'white';
            this.updateStatus('AIが考え中...');
            this.updateCurrentPlayer();
            this.addLogEntry('プレイヤー', '黒: パス', 'player');
        });

        this.socket.on('gameReset', (gameState) => {
            this.gameStarted = false;
            this.currentPlayer = gameState.currentPlayer;
            this.board = gameState.board.stones || {};
            this.lastMove = null;
            this.clearBoard();
            this.updateStatus('ゲームを開始してください');
            this.updateCurrentPlayer();
            this.addLogEntry('システム', 'ゲームがリセットされました', 'system');
        });

        this.socket.on('boardUpdate', (board) => {
            this.board = board.stones || {};
            this.updateBoard();
        });

        this.socket.on('error', (error) => {
            this.addLogEntry('エラー', error.message, 'error');
        });
    }

    addStone(position, color) {
        if (position === 'pass') return;
        
        const intersection = this.getIntersectionFromPosition(position);
        if (!intersection) return;

        // 既存の石を削除
        const existingStone = intersection.querySelector('.stone');
        if (existingStone) {
            existingStone.remove();
        }

        // 新しい石を追加
        const stone = document.createElement('div');
        stone.className = `stone ${color}`;
        
        // 最後の手の場合はハイライト
        if (position === this.lastMove) {
            stone.classList.add('last-move');
        }
        
        intersection.appendChild(stone);
    }

    clearBoard() {
        const stones = this.gameBoard.querySelectorAll('.stone');
        stones.forEach(stone => stone.remove());
    }

    updateBoard() {
        this.clearBoard();
        
        for (const [position, color] of Object.entries(this.board)) {
            this.addStone(position, color);
        }
    }

    updateStatus(message) {
        this.statusElement.textContent = message;
    }

    updateCurrentPlayer() {
        if (this.gameStarted) {
            const playerText = this.currentPlayer === 'black' ? 'あなた（黒）' : 'AI（白）';
            this.currentPlayerElement.textContent = `現在: ${playerText}`;
        } else {
            this.currentPlayerElement.textContent = '';
        }
    }

    addLogEntry(sender, message, type) {
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;
        
        const timestamp = new Date().toLocaleTimeString();
        logEntry.textContent = `[${timestamp}] ${sender}: ${message}`;
        
        this.logContent.appendChild(logEntry);
        this.logContent.scrollTop = this.logContent.scrollHeight;
    }
}

// ページ読み込み時にゲームを初期化
document.addEventListener('DOMContentLoaded', () => {
    new GoGame();
});
