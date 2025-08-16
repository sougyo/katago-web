class GoGame {
    constructor() {
        this.socket = io();
        this.boardSize = 19;
        this.currentPlayer = 'black';
        this.gameStarted = false;
        this.board = {};
        this.lastMove = null;
        this.resizeTimer = null;

        this.initializeElements();
        this.setupEventListeners();
        this.setupSocketListeners();

        // 初回描画
        // DOMのレンダリングが完了してからボードを作成するために少し遅延させる
        setTimeout(() => {
            this.createBoard();
            this.updateBoard();
        }, 100);
    }

    initializeElements() {
        this.gameBoard = document.getElementById('gameBoard');
        this.statusElement = document.getElementById('status');
        this.currentPlayerElement = document.getElementById('currentPlayer');
        this.startGameBtn = document.getElementById('startGame');
        this.resetGameBtn = document.getElementById('resetGame');
        this.passBtn = document.getElementById('pass');
        this.logContent = document.getElementById('logContent');
        this.analyzeGameBtn = document.getElementById('analyzeGame');
        this.resultContent = document.getElementById('resultContent');
    }

    // 連続するリサイズイベントを効率化するデバウンス関数
    debounce(func, delay) {
        clearTimeout(this.resizeTimer);
        this.resizeTimer = setTimeout(func, delay);
    }

    createBoard() {
        this.gameBoard.innerHTML = '';
        const boardWidth = this.gameBoard.clientWidth;
        const gridSpacing = boardWidth / (this.boardSize + 1);
        const offset = gridSpacing;

        // SVG碁盤を作成
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'board-svg');
        svg.setAttribute('width', boardWidth);
        svg.setAttribute('height', boardWidth);

        // 碁盤の線、星、交点を描画
        this.drawSVGLines(svg, boardWidth, gridSpacing, offset);
        this.drawSVGStars(svg, gridSpacing, offset);
        this.createIntersections(boardWidth, gridSpacing, offset);

        this.gameBoard.appendChild(svg);
    }

    drawSVGLines(svg, boardWidth, gridSpacing, offset) {
        for (let i = 0; i < this.boardSize; i++) {
            const pos = offset + i * gridSpacing;
            // 縦線
            const vLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            vLine.setAttribute('x1', pos);
            vLine.setAttribute('y1', offset);
            vLine.setAttribute('x2', pos);
            vLine.setAttribute('y2', boardWidth - offset);
            vLine.setAttribute('stroke', '#000');
            vLine.setAttribute('stroke-width', '1');
            svg.appendChild(vLine);

            // 横線
            const hLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            hLine.setAttribute('x1', offset);
            hLine.setAttribute('y1', pos);
            hLine.setAttribute('x2', boardWidth - offset);
            hLine.setAttribute('y2', pos);
            hLine.setAttribute('stroke', '#000');
            hLine.setAttribute('stroke-width', '1');
            svg.appendChild(hLine);
        }
    }

    drawSVGStars(svg, gridSpacing, offset) {
        const starPositions = [
            [3, 3], [3, 9], [3, 15],
            [9, 3], [9, 9], [9, 15],
            [15, 3], [15, 9], [15, 15]
        ];
        const starRadius = gridSpacing * 0.1;

        starPositions.forEach(([row, col]) => {
            const x = offset + col * gridSpacing;
            const y = offset + row * gridSpacing;
            const star = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            star.setAttribute('cx', x);
            star.setAttribute('cy', y);
            star.setAttribute('r', starRadius > 1 ? starRadius : 1);
            star.setAttribute('fill', '#000');
            svg.appendChild(star);
        });
    }

    createIntersections(boardWidth, gridSpacing, offset) {
        for (let row = 0; row < this.boardSize; row++) {
            for (let col = 0; col < this.boardSize; col++) {
                const intersection = document.createElement('div');
                intersection.className = 'board-intersection';
                intersection.dataset.row = row;
                intersection.dataset.col = col;
                intersection.dataset.position = this.getPositionString(col, row);

                const x = offset + col * gridSpacing;
                const y = offset + row * gridSpacing;

                intersection.style.width = `${gridSpacing}px`;
                intersection.style.height = `${gridSpacing}px`;
                intersection.style.left = `${x - gridSpacing / 2}px`;
                intersection.style.top = `${y - gridSpacing / 2}px`;

                intersection.addEventListener('click', (e) => this.handleIntersectionClick(e));
                this.gameBoard.appendChild(intersection);
            }
        }
    }

    getPositionString(col, row) {
        const colChar = String.fromCharCode(65 + col + (col >= 8 ? 1 : 0));
        const rowNum = this.boardSize - row;
        return `${colChar}${rowNum}`;
    }

    getIntersectionFromPosition(position) {
        if (position === 'pass' || !position) return null;
        const colChar = position.charAt(0);
        const rowStr = position.substring(1);
        const col = colChar.charCodeAt(0) - 65 - (colChar > 'I' ? 1 : 0);
        const row = this.boardSize - parseInt(rowStr, 10);
        return document.querySelector(`.board-intersection[data-row="${row}"][data-col="${col}"]`);
    }

    handleIntersectionClick(event) {
        if (!this.gameStarted || this.currentPlayer !== 'black') return;
        const intersection = event.currentTarget;
        if (intersection.querySelector('.stone')) return;
        this.socket.emit('playerMove', { position: intersection.dataset.position });
    }

    setupEventListeners() {
        this.startGameBtn.addEventListener('click', () => {
            const handicapStones = document.getElementById('handicap-stones').value;
            this.socket.emit('startGame', { handicap: parseInt(handicapStones, 10) || 0 });
        });

        this.resetGameBtn.addEventListener('click', () => this.socket.emit('resetGame'));
        this.passBtn.addEventListener('click', () => {
            if (this.gameStarted && this.currentPlayer === 'black') {
                this.socket.emit('pass');
            }
        });

        this.analyzeGameBtn.addEventListener('click', () => {
            if (this.gameStarted) {
                this.socket.emit('analyze');
                this.resultContent.textContent = '解析中...';
            }
        });

        window.addEventListener('resize', () => {
            this.debounce(() => {
                this.createBoard();
                this.updateBoard();
            }, 250);
        });
    }

    setupSocketListeners() {
        this.socket.on('connect', () => this.addLogEntry('システム', 'サーバーに接続しました', 'system'));
        this.socket.on('disconnect', () => {
            this.addLogEntry('システム', 'サーバーから切断されました', 'system');
            this.updateStatus('サーバーから切断されました');
        });

        this.socket.on('gameStarted', (gameState) => {
            this.gameStarted = true;
            this.currentPlayer = gameState.currentPlayer;
            this.board = gameState.board.stones || {};
            this.createBoard();
            this.updateBoard();
            this.updateStatus(this.currentPlayer === 'black' ? 'ゲーム開始 - あなたの番です' : 'ゲーム開始 - AIの番です');
            this.updateCurrentPlayer();
            this.addLogEntry('システム', 'ゲームが開始されました', 'system');
        });

        this.socket.on('movePlayed', (data) => this.handleMove(data, 'white', 'AIが考え中...'));
        this.socket.on('aiMove', (data) => this.handleMove(data, 'black', 'あなたの番です'));

        this.socket.on('passPlayed', () => {
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
            this.createBoard();
            this.updateBoard();
            this.updateStatus('ゲームを開始してください');
            this.updateCurrentPlayer();
            this.addLogEntry('システム', 'ゲームがリセットされました', 'system');
        });

        this.socket.on('boardUpdate', (board) => {
            this.board = board.stones || {};
            this.updateBoard();
        });

        this.socket.on('analysisResult', (data) => {
            this.resultContent.textContent = JSON.stringify(data);
        });

        this.socket.on('error', (error) => this.addLogEntry('エラー', error.message, 'error'));
    }

    handleMove(data, nextPlayer, statusMessage) {
        const prevPlayer = nextPlayer === 'black' ? 'white' : 'black';
        this.board = data.board.stones || {};
        this.lastMove = data.position;
        this.updateBoard();
        this.currentPlayer = nextPlayer;
        this.updateStatus(statusMessage);
        this.updateCurrentPlayer();
        this.addLogEntry(prevPlayer === 'black' ? 'プレイヤー' : 'AI', `${prevPlayer}: ${data.position}`, prevPlayer);
    }

    addStone(position, color) {
        if (position === 'pass' || !position) return;
        const intersection = this.getIntersectionFromPosition(position);
        if (!intersection) return;

        // 既存の石をクリア
        const existingStone = intersection.querySelector('.stone');
        if (existingStone) existingStone.remove();

        const stone = document.createElement('div');
        stone.className = `stone ${color}`;
        intersection.appendChild(stone);

        // 最後の一手をマーク
        if (position === this.lastMove) {
            const marker = document.createElement('div');
            marker.className = 'last-move-marker';
            // CSSでスタイルを適用するためクラス名のみ設定
            stone.appendChild(marker);
        }
    }

    clearBoard() {
        const stones = this.gameBoard.querySelectorAll('.stone');
        stones.forEach(stone => stone.remove());
    }

    updateBoard() {
        this.clearBoard();
        if (this.board) {
            for (const [position, color] of Object.entries(this.board)) {
                this.addStone(position, color);
            }
        }
    }

    updateStatus(message) {
        this.statusElement.textContent = message;
    }

    updateCurrentPlayer() {
        if (this.gameStarted) {
            const playerText = this.currentPlayer === 'black' ? 'あなた（黒）' : 'AI（白）';
            this.currentPlayerElement.textContent = `現在の手番: ${playerText}`;
        } else {
            this.currentPlayerElement.textContent = '';
        }
    }

    addLogEntry(sender, message, type) {
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;
        const timestamp = new Date().toLocaleTimeString();
        logEntry.innerHTML = `<strong>[${timestamp}] ${sender}:</strong> ${message}`;
        this.logContent.prepend(logEntry);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new GoGame();
});
