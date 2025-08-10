const { spawn } = require('child_process');

class GTPClient {
    constructor(katagoPath, configPath, modelPath) {
        this.katagoPath = katagoPath;
        this.configPath = configPath;
        this.modelPath = modelPath;
        this.process = null;
        this.isReady = false;
        this.commandQueue = [];
        this.isProcessing = false;
    }

    async start() {
        return new Promise((resolve, reject) => {
            console.log(`Starting KataGo: ${this.katagoPath} gtp -config ${this.configPath} -model ${this.modelPath}`);
            
            this.process = spawn(this.katagoPath, ['gtp', '-config', this.configPath, '-model', this.modelPath], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            this.process.stdout.on('data', (data) => {
                const output = data.toString();
                console.log('KataGo output:', output);
                this.handleOutput(output);
            });

            this.process.stderr.on('data', (data) => {
                console.error('KataGo stderr:', data.toString());
            });

            this.process.on('error', (error) => {
                console.error('Failed to start KataGo:', error);
                reject(error);
            });

            this.process.on('close', (code) => {
                console.log(`KataGo process exited with code ${code}`);
                this.isReady = false;
            });

            // GTPプロトコルの初期化を待つ
            setTimeout(() => {
                this.isReady = true;
                resolve();
            }, 2000);
        });
    }

    handleOutput(output) {
        const lines = output.split('\n');
        
        for (const line of lines) {
            if (line.startsWith('=')) {
                // 成功レスポンス
                const response = line.substring(1).trim();
                this.resolveCurrentCommand(response);
            } else if (line.startsWith('?')) {
                // エラーレスポンス
                const error = line.substring(1).trim();
                this.rejectCurrentCommand(new Error(error));
            }
        }
    }

    resolveCurrentCommand(response) {
        if (this.commandQueue.length > 0) {
            const { resolve } = this.commandQueue.shift();
            resolve(response);
            this.isProcessing = false;
            this.processNextCommand();
        }
    }

    rejectCurrentCommand(error) {
        if (this.commandQueue.length > 0) {
            const { reject } = this.commandQueue.shift();
            reject(error);
            this.isProcessing = false;
            this.processNextCommand();
        }
    }

    processNextCommand() {
        if (this.commandQueue.length > 0 && !this.isProcessing) {
            this.isProcessing = true;
            const { command } = this.commandQueue[0];
            this.process.stdin.write(command + '\n');
        }
    }

    async sendCommand(command) {
        return new Promise((resolve, reject) => {
            if (!this.isReady) {
                reject(new Error('GTP client is not ready'));
                return;
            }

            this.commandQueue.push({ command, resolve, reject });
            this.processNextCommand();
        });
    }

    // ゲーム初期化
    async initGame() {
        await this.sendCommand('boardsize 19');
        await this.sendCommand('clear_board');
        await this.sendCommand('komi 6.5');
    }

    // 手を打つ
    async playMove(color, move) {
        const command = `play ${color} ${move}`;
        return await this.sendCommand(command);
    }

    // AIの手を生成
    async genMove(color) {
        const command = `genmove ${color}`;
        return await this.sendCommand(command);
    }

    // 現在の盤面を取得
    async getBoard() {
        const response = await this.sendCommand('showboard');
        return this.parseBoard(response);
    }

    // 盤面の解析
    parseBoard(boardText) {
        const lines = boardText.split('\n');
        const board = {
            size: 19,
            stones: {},
            lastMove: null
        };

        // 盤面の行を解析（動的に行範囲を決定）
        const boardSize = board.size;
        // 通常 showboard の出力は上部に8行のヘッダーがある
        const boardStart = 8;
        const boardEnd = boardStart + boardSize;
        for (let i = boardStart; i < boardEnd; i++) {
            if (i < lines.length) {
                const line = lines[i];
                const row = boardSize - (i - boardStart);
                
                // 座標を解析
                for (let col = 0; col < boardSize; col++) {
                    const char = line.charAt(col * 2 + 3); // 碁盤の文字位置
                    let columnChar;
                    if (col < 8) { // Columns A to H
                        columnChar = String.fromCharCode(65 + col);
                    } else { // Skip I and adjust for J to T
                        columnChar = String.fromCharCode(65 + col + 1);
                    }
                    if (char === 'X') {
                        board.stones[`${columnChar}${row}`] = 'black';
                    } else if (char === 'O') {
                        board.stones[`${columnChar}${row}`] = 'white';
                    }
                }
            }
        }

        return board;
    }

    // 終了
    async quit() {
        if (this.process) {
            await this.sendCommand('quit');
            this.process.kill();
        }
    }
}

module.exports = GTPClient;
