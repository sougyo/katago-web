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
        this.responseBuffer = '';
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
        this.responseBuffer += output;
        const terminator = '\n\n';
        let terminatorIndex;

        // Process all complete commands in the buffer
        while ((terminatorIndex = this.responseBuffer.indexOf(terminator)) !== -1) {
            const responseBlock = this.responseBuffer.substring(0, terminatorIndex).trim();
            this.responseBuffer = this.responseBuffer.substring(terminatorIndex + terminator.length);

            if (!this.isProcessing) {
                // Received a response when not expecting one, might be initial GTP hello message.
                console.log("Ignoring unsolicited response:", responseBlock);
                continue;
            }

            const { resolve, reject } = this.commandQueue.shift();

            if (responseBlock.startsWith('=')) {
                const content = responseBlock.substring(1).trim();
                resolve(content);
            } else if (responseBlock.startsWith('?')) {
                const error = responseBlock.substring(1).trim();
                reject(new Error(error));
            } else {
                // Should not happen with a compliant GTP engine
                reject(new Error(`Invalid GTP response: ${responseBlock}`));
            }
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

        const columnLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'];
        // 正規表現で行番号で始まる行を抽出
        const boardLineRegex = /^\s*(\d+)\s+/;

        for (const line of lines) {
            const match = line.match(boardLineRegex);
            if (match) {
                const row = parseInt(match[1], 10);
                // 行番号が1から19の範囲にあるか確認
                if (row >= 1 && row <= board.size) {
                    // 各列の文字を固定位置から取得
                    for (let col = 0; col < board.size; col++) {
                        // A列は3文字目から始まり、2文字ごとに各列が配置される
                        const charIndex = col * 2 + 3;
                        if (charIndex < line.length) {
                            const char = line.charAt(charIndex);
                            const columnChar = columnLabels[col];
                            const coord = `${columnChar}${row}`;

                            if (char === 'X') {
                                board.stones[coord] = 'black';
                            } else if (char === 'O') {
                                board.stones[coord] = 'white';
                            }
                        }
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
