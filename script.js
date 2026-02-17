// SQL Concentration Game
class SQLConcentrationGame {
    constructor() {
        this.cards = [];
        this.gameCards = [];
        this.flippedCards = [];
        this.matchedPairs = [];
        this.currentRound = 1;
        this.attempts = 0;
        this.score = 1000;
        this.isRestricted = false;
        this.activeCardIndices = [];
        this.settings = {
            matchedPairBehavior: 'stay',
            autoAdvance: false,
            timerDuration: 60,
            openaiApiKey: '',
            listenSpeakExplanation: true,
            listenSpeakExample: true
        };
        this.preGameTimer = null;
        this.isGameActive = false;
        this.currentAudio = null;
        this.audioCache = {};
        this.isCommandHidden = false;
        this.isExplanationHidden = false;
        
        this.init();
    }

    async init() {
        this.loadSettings();
        await this.loadOpenAIKey();
        await this.loadLibrary();
        this.setupEventListeners();
        this.showModeSelection();
    }

    async loadOpenAIKey() {
        try {
            const response = await fetch('/api/openai-key');
            const data = await response.json();
            if (data.key) {
                this.settings.openaiApiKey = data.key;
            }
        } catch (e) {
            console.log('Could not load OpenAI key');
        }
    }

    loadSettings() {
        const saved = localStorage.getItem('sqlGameSettings');
        if (saved) {
            this.settings = { ...this.settings, ...JSON.parse(saved) };
        }
        this.updateSettingsUI();
    }

    saveSettings() {
        localStorage.setItem('sqlGameSettings', JSON.stringify(this.settings));
    }

    updateSettingsUI() {
        const els = ['matchedPairBehavior', 'autoAdvance', 'timerDuration', 'openaiApiKey', 'listenSpeakExplanation', 'listenSpeakExample'];
        els.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            if (el.type === 'checkbox') {
                el.checked = this.settings[id];
            } else {
                el.value = this.settings[id];
            }
        });
    }

    async loadLibrary() {
        try {
            const response = await fetch('decks/index.json');
            const data = await response.json();
            this.library = data;
            
            // Load default deck
            if (data.decks && data.decks.length > 0) {
                await this.loadDeck(data.decks[0].filename);
            }
        } catch (e) {
            console.error('Failed to load library:', e);
            this.useDefaultCards();
        }
    }

    async loadDeck(filename) {
        try {
            const response = await fetch(`decks/${filename}`);
            const data = await response.json();
            this.cards = data.cards || [];
            this.displayPreGameCards();
        } catch (e) {
            console.error('Failed to load deck:', e);
            this.useDefaultCards();
        }
    }

    useDefaultCards() {
        this.cards = [
            { id: "1_1", command: "SELECT", description: "Retrieves data", syntax: "SELECT col FROM table;", example: "SELECT name FROM users;", explanation: "SELECT retrieves data from tables." }
        ];
    }

    displayPreGameCards() {
        const container = document.getElementById('cardPairsDisplay');
        if (!container) return;
        container.innerHTML = '';

        this.cards.forEach(card => {
            const pair = document.createElement('div');
            pair.className = 'card-pair';
            pair.innerHTML = `
                <div class="playing-card sql-card ${this.isCommandHidden ? 'flipped-back' : ''}">
                    <div class="card-face card-front">
                        <div class="card-category">${card.category || 'SQL'}</div>
                        <div class="card-command">${card.command}</div>
                        <div class="card-syntax">${card.syntax || ''}</div>
                    </div>
                    <div class="card-face card-back"><div>?</div></div>
                </div>
                <div class="playing-card explanation-card ${this.isExplanationHidden ? 'flipped-back' : ''}">
                    <div class="card-face card-front">
                        <div class="card-description">${card.description}</div>
                        <div class="card-example">${card.example || ''}</div>
                    </div>
                    <div class="card-face card-back"><div>?</div></div>
                </div>
            `;
            container.appendChild(pair);
        });
    }

    showModeSelection() {
        this.hideAllScreens();
        document.getElementById('gameModeScreen').classList.add('active');
    }

    hideAllScreens() {
        ['gameModeScreen', 'preGameScreen', 'gameScreen', 'dragDropScreen', 'listenScreen', 'practiceScreen', 'timedScreen'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('active');
        });
    }

    showPreGame() {
        this.hideAllScreens();
        document.getElementById('preGameScreen').classList.add('active');
        this.displayPreGameCards();
        if (this.settings.autoAdvance) {
            this.startPreGameTimer();
        }
    }

    startPreGameTimer() {
        let timeLeft = this.settings.timerDuration;
        const display = document.getElementById('preGameTimer');
        
        this.preGameTimer = setInterval(() => {
            if (display) display.textContent = `Auto-start in: ${Math.floor(timeLeft/60)}:${(timeLeft%60).toString().padStart(2,'0')}`;
            if (--timeLeft <= 0) {
                this.stopPreGameTimer();
                this.startGame();
            }
        }, 1000);
    }

    stopPreGameTimer() {
        if (this.preGameTimer) {
            clearInterval(this.preGameTimer);
            this.preGameTimer = null;
        }
    }

    startGame() {
        this.stopPreGameTimer();
        this.isGameActive = true;
        this.attempts = 0;
        this.score = 1000;
        this.matchedPairs = [];
        this.flippedCards = [];

        this.createGameCards();
        this.hideAllScreens();
        document.getElementById('gameScreen').classList.add('active');
        this.updateGameUI();
    }

    createGameCards() {
        this.gameCards = [];
        this.cards.forEach(card => {
            // Command card
            this.gameCards.push({
                ...card,
                type: 'command',
                pairId: card.id
            });
            // Explanation card
            this.gameCards.push({
                ...card,
                type: 'explanation',
                pairId: card.id
            });
        });
        this.shuffleArray(this.gameCards);
        this.displayGameBoard();
    }

    displayGameBoard() {
        const board = document.getElementById('gameBoard');
        if (!board) return;
        board.innerHTML = '';

        this.gameCards.forEach((card, index) => {
            const cardEl = document.createElement('div');
            cardEl.className = 'game-card';
            cardEl.dataset.index = index;
            
            if (card.type === 'command') {
                cardEl.innerHTML = `
                    <div class="card-inner">
                        <div class="card-front">
                            <div class="card-category-tag">${card.category || 'SQL'}</div>
                            <div class="card-command-text">${card.command}</div>
                        </div>
                        <div class="card-back"><span>SQL</span></div>
                    </div>
                `;
            } else {
                cardEl.innerHTML = `
                    <div class="card-inner">
                        <div class="card-front">
                            <div class="card-desc-text">${card.description}</div>
                        </div>
                        <div class="card-back"><span>📝</span></div>
                    </div>
                `;
            }
            
            cardEl.addEventListener('click', () => this.flipCard(index));
            board.appendChild(cardEl);
        });
    }

    flipCard(index) {
        if (!this.isGameActive) return;
        if (this.flippedCards.length >= 2) return;
        if (this.flippedCards.includes(index)) return;
        if (this.gameCards[index].matched) return;

        const cardEl = document.querySelector(`.game-card[data-index="${index}"]`);
        if (cardEl) cardEl.classList.add('flipped');
        this.flippedCards.push(index);

        if (this.flippedCards.length === 2) {
            this.attempts++;
            this.checkMatch();
        }
    }

    checkMatch() {
        const [idx1, idx2] = this.flippedCards;
        const card1 = this.gameCards[idx1];
        const card2 = this.gameCards[idx2];

        if (card1.pairId === card2.pairId && card1.type !== card2.type) {
            // Match!
            this.score += 50;
            this.matchedPairs.push(card1.pairId);
            card1.matched = true;
            card2.matched = true;
            
            setTimeout(() => {
                const el1 = document.querySelector(`.game-card[data-index="${idx1}"]`);
                const el2 = document.querySelector(`.game-card[data-index="${idx2}"]`);
                if (el1) el1.classList.add('matched');
                if (el2) el2.classList.add('matched');
                this.flippedCards = [];
                this.updateGameUI();
                
                if (this.matchedPairs.length === this.cards.length) {
                    this.roundComplete();
                }
            }, 500);
        } else {
            // No match
            this.score = Math.max(0, this.score - 10);
            setTimeout(() => {
                const el1 = document.querySelector(`.game-card[data-index="${idx1}"]`);
                const el2 = document.querySelector(`.game-card[data-index="${idx2}"]`);
                if (el1) el1.classList.remove('flipped');
                if (el2) el2.classList.remove('flipped');
                this.flippedCards = [];
                this.updateGameUI();
            }, 1000);
        }
    }

    updateGameUI() {
        document.getElementById('attempts').textContent = this.attempts;
        document.getElementById('score').textContent = this.score;
        document.getElementById('matches').textContent = `${this.matchedPairs.length}/${this.cards.length}`;
    }

    roundComplete() {
        document.getElementById('celebrationMessage').textContent = 
            `Round ${this.currentRound} complete!\nScore: ${this.score}\nAttempts: ${this.attempts}`;
        document.getElementById('celebrationModal').style.display = 'flex';
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    setupEventListeners() {
        // Mode selection
        document.getElementById('memorizeMode')?.addEventListener('click', () => this.showPreGame());
        document.getElementById('concentrationMode')?.addEventListener('click', () => this.showPreGame());
        document.getElementById('listenMode')?.addEventListener('click', () => this.showListenMode());

        // Controls
        document.getElementById('startGameBtn')?.addEventListener('click', () => this.startGame());
        document.getElementById('chooseModeBtn')?.addEventListener('click', () => this.showModeSelection());
        document.getElementById('backToMemorizeBtn')?.addEventListener('click', () => this.showPreGame());
        document.getElementById('restartRoundBtn')?.addEventListener('click', () => this.startGame());
        document.getElementById('exitListenBtn')?.addEventListener('click', () => this.showModeSelection());
        document.getElementById('exitDragDropBtn')?.addEventListener('click', () => this.showModeSelection());
        document.getElementById('exitPracticeBtn')?.addEventListener('click', () => this.showModeSelection());
        document.getElementById('exitTimedBtn')?.addEventListener('click', () => this.showModeSelection());

        // Flip controls
        document.getElementById('flipCommandBtn')?.addEventListener('click', () => {
            this.isCommandHidden = !this.isCommandHidden;
            document.querySelectorAll('.sql-card').forEach(c => c.classList.toggle('flipped-back', this.isCommandHidden));
            document.getElementById('flipCommandBtn').textContent = this.isCommandHidden ? '👀 Show Commands' : '🙈 Hide Commands';
        });

        document.getElementById('flipExplanationBtn')?.addEventListener('click', () => {
            this.isExplanationHidden = !this.isExplanationHidden;
            document.querySelectorAll('.explanation-card').forEach(c => c.classList.toggle('flipped-back', this.isExplanationHidden));
            document.getElementById('flipExplanationBtn').textContent = this.isExplanationHidden ? '👀 Show Explanations' : '🙈 Hide Explanations';
        });

        // Settings
        document.getElementById('settingsBtn')?.addEventListener('click', () => {
            document.getElementById('settingsModal').style.display = 'flex';
        });

        document.getElementById('settingsClose')?.addEventListener('click', () => {
            document.getElementById('settingsModal').style.display = 'none';
        });

        document.getElementById('saveSettings')?.addEventListener('click', () => {
            ['matchedPairBehavior', 'autoAdvance', 'timerDuration', 'openaiApiKey', 'listenSpeakExplanation', 'listenSpeakExample'].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    this.settings[id] = el.type === 'checkbox' ? el.checked : el.value;
                }
            });
            this.saveSettings();
            document.getElementById('settingsModal').style.display = 'none';
        });

        // Library
        document.getElementById('libraryBtn')?.addEventListener('click', () => this.showLibrary());
        document.getElementById('libraryClose')?.addEventListener('click', () => {
            document.getElementById('libraryModal').style.display = 'none';
        });

        // Celebration
        document.getElementById('playAgainBtn')?.addEventListener('click', () => {
            document.getElementById('celebrationModal').style.display = 'none';
            this.startGame();
        });

        document.getElementById('nextRoundBtn')?.addEventListener('click', () => {
            document.getElementById('celebrationModal').style.display = 'none';
            this.currentRound++;
            this.startGame();
        });

        // Listen mode toggles
        document.getElementById('toggleListenExplanation')?.addEventListener('click', (e) => {
            this.settings.listenSpeakExplanation = !this.settings.listenSpeakExplanation;
            e.target.classList.toggle('active', this.settings.listenSpeakExplanation);
        });

        document.getElementById('toggleListenExample')?.addEventListener('click', (e) => {
            this.settings.listenSpeakExample = !this.settings.listenSpeakExample;
            e.target.classList.toggle('active', this.settings.listenSpeakExample);
        });

        document.getElementById('playAllBtn')?.addEventListener('click', () => this.playAllListen());
        document.getElementById('stopPlaybackBtn')?.addEventListener('click', () => this.stopPlayback());
        document.getElementById('clearCacheBtn')?.addEventListener('click', () => {
            this.audioCache = {};
            alert('Cache cleared!');
        });
    }

    showLibrary() {
        const grid = document.getElementById('libraryGrid');
        if (!grid || !this.library) return;
        
        grid.innerHTML = '';
        this.library.decks.forEach(deck => {
            const item = document.createElement('div');
            item.className = 'library-item';
            item.innerHTML = `
                <div class="library-item-name">${deck.name}</div>
                <div class="library-item-desc">${deck.description || ''}</div>
                <div class="library-item-count">${deck.cardCount} commands</div>
            `;
            item.addEventListener('click', () => {
                this.loadDeck(deck.filename);
                document.getElementById('libraryModal').style.display = 'none';
            });
            grid.appendChild(item);
        });
        
        document.getElementById('libraryModal').style.display = 'flex';
    }

    showListenMode() {
        this.hideAllScreens();
        document.getElementById('listenScreen').classList.add('active');
        this.displayListenList();
    }

    displayListenList() {
        const list = document.getElementById('listenList');
        if (!list) return;
        list.innerHTML = '';

        this.cards.forEach((card, index) => {
            const item = document.createElement('div');
            item.className = 'listen-item';
            item.innerHTML = `
                <div class="listen-item-header">
                    <span class="listen-number">${index + 1}</span>
                    <div class="listen-command">${card.command}</div>
                    <div class="listen-category">${card.category || 'SQL'}</div>
                    <div class="listen-buttons">
                        <button class="listen-play-btn" data-index="${index}">▶️</button>
                        <button class="listen-ai-btn" data-index="${index}">🤖</button>
                    </div>
                </div>
                <div class="listen-item-content">
                    <div class="listen-syntax">${card.syntax || ''}</div>
                    <div class="listen-description">${card.description}</div>
                    <div class="listen-example">${card.example || ''}</div>
                </div>
            `;
            list.appendChild(item);
        });

        // Play button handlers
        list.querySelectorAll('.listen-play-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.index);
                this.playCard(this.cards[idx]);
            });
        });

        // AI button handlers
        list.querySelectorAll('.listen-ai-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.index);
                this.askAI(this.cards[idx]);
            });
        });
    }

    async playCard(card) {
        if (!this.settings.openaiApiKey) {
            alert('Please set your OpenAI API key in Settings.');
            return;
        }

        this.stopPlayback();

        try {
            let text = '';
            if (this.settings.listenSpeakExplanation) {
                text += `${card.command}. ${card.description}. `;
            }
            if (this.settings.listenSpeakExample && card.example) {
                text += `Example: ${card.example}`;
            }

            const blob = await this.getTTS(text);
            if (blob) {
                this.currentAudio = new Audio(URL.createObjectURL(blob));
                this.currentAudio.play();
            }
        } catch (e) {
            console.error('TTS error:', e);
        }
    }

    async getTTS(text) {
        if (this.audioCache[text]) return this.audioCache[text];

        const response = await fetch('https://api.openai.com/v1/audio/speech', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.settings.openaiApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'tts-1',
                input: text,
                voice: 'nova'
            })
        });

        if (!response.ok) throw new Error(`TTS API error: ${response.status}`);
        
        const blob = await response.blob();
        this.audioCache[text] = blob;
        return blob;
    }

    async playAllListen() {
        // Implementation for playing all cards
        for (const card of this.cards) {
            if (!this.currentAudio) break;
            await this.playCard(card);
            await new Promise(r => this.currentAudio?.onended ? this.currentAudio.onended = r : r());
        }
    }

    stopPlayback() {
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio = null;
        }
    }

    async askAI(card) {
        const modal = document.getElementById('aiExplanationModal');
        const content = document.getElementById('aiExplanationContent');
        const title = document.getElementById('aiExplanationTitle');

        title.textContent = `🤖 ${card.command}`;
        content.innerHTML = '<div class="ai-loading">Analyzing...</div>';
        modal.style.display = 'flex';

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.settings.openaiApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [{
                        role: 'user',
                        content: `Explain this SQL command in detail: ${card.command}\n\nSyntax: ${card.syntax}\nExample: ${card.example}\n\nInclude:\n1. What it does\n2. When to use it\n3. Common patterns\n4. Tips and best practices\n5. Related commands`
                    }]
                })
            });

            const data = await response.json();
            content.innerHTML = `<div class="ai-content">${this.formatMarkdown(data.choices[0].message.content)}</div>`;
        } catch (e) {
            content.innerHTML = `<div class="ai-error">Error: ${e.message}</div>`;
        }
    }

    formatMarkdown(text) {
        return text
            .replace(/### (.*$)/gim, '<h3>$1</h3>')
            .replace(/## (.*$)/gim, '<h2>$1</h2>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.game = new SQLConcentrationGame();
});
